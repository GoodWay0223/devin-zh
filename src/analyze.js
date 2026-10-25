'use strict';

// Only proven React render positions and explicitly identified EN resources are editable.
// Never execute the bundle, and never use spelling/ASCII frequency as resource evidence.
const UI_PROPS = new Set(['children', 'title', 'placeholder', 'aria-label', 'ariaLabel', 'alt', 'label', 'tooltip']);
const keyOf = n => n && (n.type === 'Identifier' ? n.name : n.type === 'Literal' ? String(n.value) : undefined);
const staticText = n => n?.type === 'Literal' && typeof n.value === 'string' ? n.value
  : n?.type === 'TemplateLiteral' && n.expressions.length === 0 ? n.quasis[0].value.cooked : undefined;

function resourceKind(obj) {
  if (!obj || Array.isArray(obj) || typeof obj !== 'object') return null;
  if (obj.manageAccess?.accessLevel === 'Access level' && obj.manageAccess?.add === 'Add' && obj.manageAccess?.done === 'Done') return 'translation';
  if (obj.tabs?.changes === 'Changes' && obj.tabs?.bugs === 'Bugs' && obj.tabs?.description === 'Description') return 'review';
  if (obj.transcript?.suspended?.totalSessionLimitExceeded === 'Devin went to sleep because this session exceeded the total session ACU limit.') return 'englishOverrides';
  return null;
}

function analyzeSource(src, { acorn, provenRuntimeBindings = new Map() } = {}) {
  if (!acorn?.parse) throw new Error('analyzeSource requires an injected Acorn parser');
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  const runtimeIds = require('./runtime').discoverRuntimeIds(ast);
  const scopes = new WeakMap(), parents = new WeakMap(), calls = [], writes = [], assignments = [], functions = [];
  const root = { parent: null, kind: 'function', bindings: new Map() };
  function bind(scope, name, init, kind = null) {
    if (!name) return;
    const old = scope.bindings.get(name);
    // Repeated declarations are ambiguous unless one is a bare var declaration.
    if (old && init) { old.ambiguous = true; return; }
    if (!old) scope.bindings.set(name, { init, scope, kind, ambiguous: false, mutated: false });
  }
  function pattern(n, scope, init = null, kind = null) {
    if (!n) return;
    if (n.type === 'Identifier') {
      bind(scope, n.name, init, kind);
      if (provenRuntimeBindings.has(n.start)) scope.bindings.get(n.name).provenKind = provenRuntimeBindings.get(n.start);
    }
    else if (n.type === 'RestElement') pattern(n.argument, scope);
    else if (n.type === 'AssignmentPattern') pattern(n.left, scope);
    else if (n.type === 'ObjectPattern') for (const p of n.properties) pattern(p.type === 'RestElement' ? p.argument : p.value, scope);
    else if (n.type === 'ArrayPattern') for (const x of n.elements) pattern(x, scope);
  }
  function find(scope, name) {
    for (let s = scope; s; s = s.parent) if (s.bindings.has(name)) return s.bindings.get(name);
    return null;
  }
  function traverse(n, scope, parent = null) {
    if (!n || typeof n !== 'object' || !n.type) return;
    if (parent) parents.set(n, parent);
    if (n.type === 'FunctionDeclaration') bind(scope, n.id?.name, n);
    if (/^(FunctionExpression|FunctionDeclaration|ArrowFunctionExpression)$/.test(n.type)) {
      functions.push(n);
      scope = { parent: scope, kind: 'function', bindings: new Map() };
      if (n.id) pattern(n.id, scope);
      n.params.forEach(p => pattern(p, scope));
      // Actual webpack module factories receive module, exports, require.
      if (parent?.type === 'Property' && /^\d+$/.test(keyOf(parent.key) || '') && n.params[2]?.type === 'Identifier') {
        scope.bindings.get(n.params[2].name).kind = 'webpackRequire';
      }
    } else if (n.type === 'BlockStatement' || n.type === 'CatchClause' || n.type === 'ForStatement' || n.type === 'ForInStatement' || n.type === 'ForOfStatement' || n.type === 'SwitchStatement') {
      scope = { parent: scope, kind: 'block', bindings: new Map() };
      if (n.type === 'CatchClause') pattern(n.param, scope);
    }
    scopes.set(n, scope);
    if (n.type === 'VariableDeclaration') {
      let target = scope;
      if (n.kind === 'var') while (target.parent && target.kind !== 'function') target = target.parent;
      for (const d of n.declarations) pattern(d.id, target, d.init);
    }
    if (n.type === 'ClassDeclaration') bind(scope, n.id?.name, null);
    if (n.type === 'ImportDeclaration') {
      const pkg = n.source.value;
      for (const s of n.specifiers) {
        const kind = pkg === 'react' ? 'react' : pkg === 'react/jsx-runtime' ? 'jsx' : null;
        bind(scope, s.local.name, null, kind);
      }
    }
    if (n.type === 'AssignmentExpression' && n.left.type === 'Identifier') writes.push([scope, n.left.name]);
    if (n.type === 'AssignmentExpression') assignments.push(n);
    if (n.type === 'UpdateExpression' && n.argument.type === 'Identifier') writes.push([scope, n.argument.name]);
    if (n.type === 'CallExpression') calls.push(n);
    for (const [k, v] of Object.entries(n)) {
      if (k === 'start' || k === 'end') continue;
      if (Array.isArray(v)) for (const x of v) traverse(x, scope, n);
      else if (v && typeof v === 'object' && v.type) traverse(v, scope, n);
    }
  }
  traverse(ast, root);
  for (const [scope, name] of writes) { const b = find(scope, name); if (b) b.mutated = true; }
  function resolve(n, scope, seen = new Set()) {
    if (!n) return null;
    if (n.type === 'Identifier') {
      const b = find(scope, n.name);
      if (b?.provenKind && !b.ambiguous) return b.provenKind;
      if (!b || b.ambiguous || b.mutated || seen.has(b)) return null;
      if (b.kind) return b.kind;
      seen.add(b); return resolve(b.init, scopes.get(b.init) || b.scope, seen);
    }
    if (n.type === 'MemberExpression' && !n.computed && n.property.name === 'default') return resolve(n.object, scope, seen);
    if (n.type === 'SequenceExpression') return resolve(n.expressions.at(-1), scope, seen);
    if (n.type === 'CallExpression') {
      const arg = n.arguments[0];
      const requireKind = n.callee.type === 'Identifier' ? resolve(n.callee, scope, new Set(seen)) : null;
      if (requireKind === 'webpackRequire' && arg?.type === 'Literal' && runtimeIds.has(arg.value)) return runtimeIds.get(arg.value);
      if (n.callee.type === 'Identifier' && n.callee.name === 'require' && !find(scope, 'require')) {
        if (staticText(arg) === 'react') return 'react';
        if (staticText(arg) === 'react/jsx-runtime') return 'jsx';
      }
      // Bundler interop wrappers such as b(e(60501), 1).
      if (n.arguments.length <= 2 && n.arguments[0]?.type === 'CallExpression') return resolve(n.arguments[0], scope, seen);
    }
    return null;
  }
  const blocks = [], ui = [], display = [], positions = new Set();
  const modeSelectors = [];
  for (const assignment of assignments) {
    const left = assignment.left;
    if (left.type !== 'MemberExpression' || left.computed || keyOf(left.property) !== 'displayName' || left.object.type !== 'Identifier' || staticText(assignment.right) !== 'SendModeSelector') continue;
    const binding = find(scopes.get(left), left.object.name);
    if (!binding || binding.ambiguous || binding.mutated) continue;
    const init = binding.init;
    const wrapper = init?.type === 'CallExpression' && (init.callee.type === 'SequenceExpression' ? init.callee.expressions.at(-1) : init.callee);
    if (!wrapper || wrapper.type !== 'MemberExpression' || wrapper.computed || !['forwardRef', 'memo'].includes(keyOf(wrapper.property)) || resolve(wrapper.object, scopes.get(wrapper)) !== 'react') continue;
    const fn = init.arguments[0], parameters = fn?.params?.[0];
    if (!['ArrowFunctionExpression', 'FunctionExpression'].includes(fn?.type) || parameters?.type !== 'ObjectPattern') continue;
    const keys = parameters.properties.filter(p => p.type === 'Property').map(p => keyOf(p.key));
    if (['mode', 'availableModes', 'onModeSelect'].every(key => keys.includes(key))) modeSelectors.push(fn);
  }
  let renderCalls = 0, jsonCalls = 0;
  function renderMethod(call) {
    if (call?.type !== 'CallExpression') return null;
    const callee = call.callee.type === 'SequenceExpression' ? call.callee.expressions.at(-1) : call.callee;
    if (callee.type !== 'MemberExpression' || callee.computed) return null;
    const kind = resolve(callee.object, scopes.get(call)), method = callee.property.name;
    return kind === 'jsx' && ['jsx', 'jsxs'].includes(method) || kind === 'react' && method === 'createElement' ? method : null;
  }
  function prop(object, name) {
    return object?.type === 'ObjectExpression' ? object.properties.find(p => p.type === 'Property' && !p.computed && keyOf(p.key) === name)?.value : null;
  }
  const textContracts = new WeakMap();
  function displaysText(component, scope) {
    if (component?.type !== 'Identifier') return false;
    const binding = find(scope, component.name), fn = binding?.init;
    if (!fn || binding.mutated || binding.ambiguous || !['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(fn.type)) return false;
    if (textContracts.has(fn)) return textContracts.get(fn);
    const parameter = fn.params[0];
    const local = parameter?.type === 'ObjectPattern' ? parameter.properties.find(p => p.type === 'Property' && keyOf(p.key) === 'text')?.value : null;
    const target = local?.type === 'Identifier' && find(scopes.get(fn.body), local.name);
    const proven = !!target && !target.mutated && calls.some(call => {
      if (call.start < fn.body.start || call.end > fn.body.end || !renderMethod(call)) return false;
      const child = prop(call.arguments[1], 'children');
      return child?.type === 'Identifier' && find(scopes.get(child), child.name) === target;
    });
    textContracts.set(fn, proven); return proven;
  }
  function ancestorRender(node, predicate) {
    for (let ancestor = parents.get(node); ancestor; ancestor = parents.get(ancestor)) {
      if (/^(FunctionExpression|FunctionDeclaration|ArrowFunctionExpression)$/.test(ancestor.type)) break;
      if (renderMethod(ancestor) && predicate(ancestor.arguments[1])) return true;
    }
    return false;
  }
  function dynamicLabel(node, kind) {
    if (node?.type !== 'MemberExpression' || node.computed || node.object.type !== 'Identifier' || node.property.name !== 'label') return;
    if (positions.has(node.start)) return;
    positions.add(node.start); display.push({ index: node.start, len: node.end - node.start, kind });
  }
  function componentFunction(component, scope) {
    if (component?.type !== 'Identifier') return null;
    const binding = find(scope, component.name);
    if (!binding || binding.ambiguous || binding.mutated) return null;
    let fn = binding.init;
    if (fn?.type === 'CallExpression') {
      const callee = fn.callee.type === 'SequenceExpression' ? fn.callee.expressions.at(-1) : fn.callee;
      if (callee.type !== 'MemberExpression' || callee.computed || !['memo', 'forwardRef'].includes(keyOf(callee.property)) || resolve(callee.object, scopes.get(callee)) !== 'react') return null;
      fn = fn.arguments[0];
    }
    return ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(fn?.type) ? fn : null;
  }
  function parameters(fn) {
    const object = fn?.params[0];
    return object?.type === 'ObjectPattern' ? new Map(object.properties.filter(p => p.type === 'Property' && !p.computed).map(p => [keyOf(p.key), p.value.type === 'AssignmentPattern' ? p.value.left : p.value])) : new Map();
  }
  function safeBinding(binding) {
    if (!binding || binding.mutated || binding.ambiguous) return false;
    // A mutated parameter object is not a display contract, even if its name survives.
    return !assignments.some(assignment => {
      let left = assignment.left;
      while (left?.type === 'MemberExpression') left = left.object;
      return left?.type === 'Identifier' && find(scopes.get(left), left.name) === binding;
    });
  }
  function dependsOn(node, target, seen = new Set()) {
    if (!node || !safeBinding(target)) return false;
    if (node.type === 'Identifier') {
      const binding = find(scopes.get(node), node.name);
      if (binding === target) return true;
      if (!safeBinding(binding) || seen.has(binding)) return false;
      seen.add(binding); return dependsOn(binding.init, target, seen);
    }
    if (node.type === 'LogicalExpression') return dependsOn(node.left, target, new Set(seen)) || dependsOn(node.right, target, new Set(seen));
    return false;
  }
  function displayValue(node, kind) {
    if (!node || positions.has(node.start) || !['Identifier', 'MemberExpression', 'LogicalExpression', 'ConditionalExpression'].includes(node.type)) return;
    positions.add(node.start); display.push({ index: node.start, len: node.end - node.start, kind });
  }
  const settingsRows = new Set(), settingsActions = new Set(), settingOutlets = new WeakMap();
  for (const fn of functions) {
    const params = parameters(fn);
    // The setting row's accessibility/display override contract distinguishes it
    // from ordinary objects, chat messages, forms and arbitrary descriptions.
    if (!['id', 'labelId', 'label', 'description', 'displayLabel', 'displayDescription', 'orientation', 'scrollIntoView'].every(k => params.has(k))) continue;
    const label = params.get('label'), description = params.get('description');
    if (label?.type !== 'Identifier' || description?.type !== 'Identifier') continue;
    const labelBinding = find(scopes.get(fn.body), label.name), descriptionBinding = find(scopes.get(fn.body), description.name);
    const outlets = calls.filter(call => call.start >= fn.body.start && call.end <= fn.body.end && renderMethod(call)).map(call => prop(call.arguments[1], 'children')).filter(Boolean);
    const labels = outlets.filter(node => dependsOn(node, labelBinding)), descriptions = outlets.filter(node => dependsOn(node, descriptionBinding));
    if (!labels.length || !descriptions.length) continue;
    settingsRows.add(fn); for (const node of [...labels, ...descriptions]) settingOutlets.set(node, 'settings');
  }
  for (const fn of functions) {
    const params = parameters(fn);
    if (!['id', 'label', 'description', 'actionLabel', 'onAction'].every(k => params.has(k))) continue;
    const callsInFn = calls.filter(call => call.start >= fn.body.start && call.end <= fn.body.end && renderMethod(call));
    if (!callsInFn.some(call => settingsRows.has(componentFunction(call.arguments[0], scopes.get(call))))) continue;
    const action = params.get('actionLabel'), onAction = params.get('onAction');
    if (action?.type !== 'Identifier' || onAction?.type !== 'Identifier') continue;
    const actionBinding = find(scopes.get(fn.body), action.name), clickBinding = find(scopes.get(fn.body), onAction.name);
    for (const call of callsInFn) {
      const children = prop(call.arguments[1], 'children'), click = prop(call.arguments[1], 'onClick');
      if (dependsOn(children, actionBinding) && dependsOn(click, clickBinding)) { settingsActions.add(fn); settingOutlets.set(children, 'settings'); }
    }
  }
  const capabilityRoots = [], capabilityComponents = new Set();
  for (const assignment of assignments) {
    const left = assignment.left;
    if (left.type !== 'MemberExpression' || left.computed || keyOf(left.property) !== 'displayName' || staticText(assignment.right) !== 'CapabilitySelector') continue;
    const fn = componentFunction(left.object, scopes.get(left));
    const params = parameters(fn);
    if (fn && params.has('disabled') && (params.has('footerWidth') || params.has('iconOnly'))) capabilityRoots.push(fn);
  }
  // Follow only render-connected capability menu contracts. Icons and arbitrary
  // components reachable through the selector are deliberately not followed.
  let frontier = capabilityRoots;
  for (let depth = 0; depth < 4; depth++) {
    const next = [];
    for (const parent of frontier) for (const call of calls) {
      if (call.start < parent.body.start || call.end > parent.body.end || !renderMethod(call)) continue;
      const fn = componentFunction(call.arguments[0], scopes.get(call)), params = parameters(fn);
      const menu = ['fusion', 'items', 'value', 'onValueChange'].every(k => params.has(k));
      const item = params.has('item');
      const submenu = ['label', 'header', 'items', 'value', 'onValueChange'].every(k => params.has(k));
      if (!fn || capabilityComponents.has(fn) || !(menu || item || submenu) || depth === 0 && !menu) continue;
      capabilityComponents.add(fn); next.push(fn);
    }
    frontier = next;
  }
  // Newer selectors turn a title/detail pair into a React node before handing it
  // to the menu. Translate only the detail argument at a proven item producer;
  // changing a shared helper body would also affect unrelated callers.
  function pairedTooltipHelper(fn) {
    if (!fn || fn.params.length !== 3 || fn.params.some(p => p.type !== 'Identifier')) return false;
    const bindings = fn.params.map(p => find(scopes.get(fn.body), p.name));
    if (new Set(bindings).size !== 3 || bindings.some(b => !safeBinding(b))) return false;
    const matches = (node, index) => node?.type === 'Identifier' && find(scopes.get(node), node.name) === bindings[index];
    const empty = node => node?.type === 'Literal' && node.value === null || node?.type === 'UnaryExpression' && node.operator === 'void' && node.argument.type === 'Literal' && node.argument.value === 0;
    const expression = fn.body.type === 'BlockStatement' && fn.body.body.length === 1 && fn.body.body[0].type === 'ReturnStatement' ? fn.body.body[0].argument : fn.body;
    if (expression?.type !== 'ConditionalExpression' || expression.test.type !== 'LogicalExpression' || expression.test.operator !== '||' || !matches(expression.test.left, 0) || !matches(expression.test.right, 1) || !empty(expression.alternate)) return false;
    function intrinsic(call, tag) {
      if (!['jsx', 'jsxs'].includes(renderMethod(call)) || staticText(call.arguments[0]) !== tag || call.arguments.length !== 2 || call.arguments[1]?.type !== 'ObjectExpression') return false;
      return call.arguments[1].properties.every(p => p.type === 'Property' && !p.computed && ['className', 'children'].includes(keyOf(p.key)));
    }
    const outer = expression.consequent;
    if (!intrinsic(outer, 'div')) return false;
    const children = prop(outer.arguments[1], 'children'), className = prop(outer.arguments[1], 'className');
    if (className && staticText(className) === undefined && !(className.type === 'CallExpression' && className.callee.type === 'Identifier' && className.arguments.every(arg => staticText(arg) !== undefined || matches(arg, 2)))) return false;
    if (children?.type !== 'ArrayExpression' || children.elements.length !== 2) return false;
    return children.elements.every((child, index) => {
      if (child?.type !== 'ConditionalExpression' || !matches(child.test, index) || !empty(child.alternate) || !intrinsic(child.consequent, 'span')) return false;
      const properties = child.consequent.arguments[1], style = prop(properties, 'className');
      return matches(prop(properties, 'children'), index) && (!style || staticText(style) !== undefined);
    });
  }
  const capabilityItemMaps = new Set();
  for (const selector of capabilityRoots) for (const call of calls) {
    if (call.start < selector.body.start || call.end > selector.body.end || !renderMethod(call)) continue;
    const menu = componentFunction(call.arguments[0], scopes.get(call));
    if (!capabilityComponents.has(menu) || !['fusion', 'items', 'value', 'onValueChange'].every(k => parameters(menu).has(k))) continue;
    const items = prop(call.arguments[1], 'items');
    const binding = items?.type === 'Identifier' && find(scopes.get(items), items.name), map = binding?.init;
    if (!safeBinding(binding) || map?.type !== 'CallExpression' || map.callee.type !== 'MemberExpression' || map.callee.computed || keyOf(map.callee.property) !== 'map' || map.arguments.length !== 1) continue;
    const fn = map.arguments[0];
    if (['ArrowFunctionExpression', 'FunctionExpression'].includes(fn?.type)) capabilityItemMaps.add(fn);
  }
  let capabilityTooltipDetails = 0;
  for (const call of calls) {
    const property = parents.get(call), object = parents.get(property), statement = parents.get(object);
    if (property?.type !== 'Property' || property.computed || keyOf(property.key) !== 'tooltip' || object?.type !== 'ObjectExpression' || statement?.type !== 'ReturnStatement') continue;
    let owner = parents.get(statement);
    while (owner && !/^(FunctionExpression|FunctionDeclaration|ArrowFunctionExpression)$/.test(owner.type)) owner = parents.get(owner);
    if (!capabilityItemMaps.has(owner) || ![2, 3].includes(call.arguments.length) || !pairedTooltipHelper(componentFunction(call.callee, scopes.get(call)))) continue;
    const [title, detail] = call.arguments;
    if (title?.type !== 'MemberExpression' || detail?.type !== 'MemberExpression' || title.computed || detail.computed || keyOf(title.property) !== 'tooltip' || keyOf(detail.property) !== 'tooltipDetail' || title.object.type !== 'Identifier' || detail.object.type !== 'Identifier') continue;
    const binding = find(scopes.get(title.object), title.object.name);
    if (!safeBinding(binding) || binding !== find(scopes.get(detail.object), detail.object.name)) continue;
    displayValue(detail, 'capabilityDescription');
    capabilityTooltipDetails++;
  }
  function capabilityDisplay(node, call) {
    const fn = [...capabilityComponents].find(fn => call.start >= fn.body.start && call.end <= fn.body.end);
    if (!fn) return null;
    const params = parameters(fn);
    if (node?.type === 'MemberExpression' && !node.computed) {
      const name = keyOf(node.property);
      if (['fusionDescription', 'capabilityTooltip', 'tooltip', 'disabledTooltip', 'headerTooltip'].includes(name)) {
        let object = node.object;
        while (object?.type === 'MemberExpression') object = object.object;
        if (object?.type !== 'Identifier') return null;
        const binding = find(scopes.get(object), object.name);
        if (!safeBinding(binding)) return null;
        const item = params.get('item');
        const itemBinding = item?.type === 'Identifier' && find(scopes.get(fn.body), item.name);
        const labels = params.get('labels');
        const labelsBinding = labels?.type === 'Identifier' && find(scopes.get(fn.body), labels.name);
        // Item descriptions come from the component's item parameter. Fusion
        // labels come from its explicit {...defaults, ...labels} display object.
        const mergedLabels = binding.init?.type === 'ObjectExpression' && binding.init.properties.some(p => p.type === 'SpreadElement' && p.argument.type === 'Identifier' && find(scopes.get(p.argument), p.argument.name) === labelsBinding);
        if (binding !== itemBinding && !mergedLabels) return null;
        return 'capabilityDescription';
      }
      if (name === 'label') return 'capabilityName';
    }
    for (const [name, local] of params) {
      if (local.type !== 'Identifier') continue;
      if (dependsOn(node, find(scopes.get(fn.body), local.name))) {
        if (['tooltip', 'headerTooltip'].includes(name)) return 'capabilityDescription';
        if (['label', 'header'].includes(name)) return 'capabilityName';
      }
    }
    return null;
  }
  function collect(n, property) {
    const value = staticText(n);
    if (value === undefined || positions.has(n.start)) return;
    positions.add(n.start); ui.push({ index: n.start, len: n.end - n.start, value, property });
  }
  function visible(n, property) {
    if (n?.type === 'ConditionalExpression') { visible(n.consequent, property); visible(n.alternate, property); }
    else collect(n, property);
  }
  function props(n, call) {
    if (!n) return;
    if (n.type === 'ObjectExpression') for (const p of n.properties) {
      if (p.type !== 'Property' || p.computed) continue;
      const property = keyOf(p.key);
      if (['children', 'content', 'tooltip', 'label', 'headerTooltip'].includes(property)) {
        const kind = settingOutlets.get(p.value) || capabilityDisplay(p.value, call);
        if (kind) { displayValue(p.value, kind); continue; }
      }
      const modeDisplay = ['title', 'subtitle', 'label'].includes(property) && modeSelectors.some(fn => call.start >= fn.body.start && call.end <= fn.body.end);
      if (modeDisplay && (p.value.type === 'Identifier' || p.value.type === 'MemberExpression' && !p.value.computed && ['label', 'description'].includes(keyOf(p.value.property)))) {
        if (!positions.has(p.value.start)) {
          positions.add(p.value.start); display.push({ index: p.value.start, len: p.value.end - p.value.start, kind: 'mode', prefix: p.shorthand ? property + ':' : '' });
        }
        continue;
      }
      const text = property === 'text' && displaysText(call.arguments[0], scopes.get(call));
      if (!UI_PROPS.has(property) && !text) continue;
      visible(p.value, property);
      if (text && ancestorRender(call, properties => staticText(prop(properties, 'variant')) === 'nav')) dynamicLabel(p.value, 'nav');
      if (property === 'children' && p.value.type === 'MemberExpression' && p.value.object.type === 'Identifier') {
        const object = p.value.object;
        if (ancestorRender(call, properties => {
          const click = prop(properties, 'onClick') || prop(properties, 'onSelect');
          return click?.type === 'MemberExpression' && !click.computed && ['onClick', 'onSelect'].includes(keyOf(click.property)) && click.object.type === 'Identifier' && find(scopes.get(click), click.object.name) === find(scopes.get(object), object.name) && click.object.name === object.name;
        })) dynamicLabel(p.value, 'menu');
      }
      if (property === 'children' && p.value.type === 'ArrayExpression') for (const x of p.value.elements) if (x) collect(x, property);
    }
    else if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed && n.callee.object.type === 'Identifier' && n.callee.object.name === 'Object' && n.callee.property.name === 'assign' && !find(scopes.get(n), 'Object')) {
      for (const x of n.arguments) if (x.type === 'ObjectExpression') props(x, call);
    }
  }
  for (const call of calls) {
    const scope = scopes.get(call);
    const callee = call.callee.type === 'SequenceExpression' ? call.callee.expressions.at(-1) : call.callee;
    if (callee.type !== 'MemberExpression' || callee.computed) continue;
    const method = callee.property.name;
    if (method === 'parse' && callee.object.type === 'Identifier' && callee.object.name === 'JSON' && !find(scope, 'JSON')) {
      jsonCalls++;
      const arg = call.arguments[0], value = staticText(arg);
      if (value !== undefined) {
        let obj; try { obj = JSON.parse(value); } catch { continue; }
        const namespace = resourceKind(obj);
        blocks.push({ index: call.start, len: call.end - call.start, obj, en: !!namespace, namespace, literalIndex: arg.start, literalLength: arg.end - arg.start });
      }
      continue;
    }
    const kind = resolve(callee.object, scope);
    if (!(kind === 'jsx' && (method === 'jsx' || method === 'jsxs')) && !(kind === 'react' && method === 'createElement')) continue;
    renderCalls++;
    props(call.arguments[1], call);
    if (method === 'createElement') for (const n of call.arguments.slice(2)) collect(n, 'children');
  }
  blocks.sort((a, b) => a.index - b.index); ui.sort((a, b) => a.index - b.index);
  return { blocks, ui, display, stats: { jsonCalls, staticJsonBlocks: blocks.length, englishResources: blocks.filter(b => b.en).length, renderCalls, uiPositions: ui.length, displayPositions: display.length, modeSelectors: modeSelectors.length, settingsRows: settingsRows.size, settingsActions: settingsActions.size, capabilitySelectors: capabilityRoots.length, capabilityComponents: capabilityComponents.size, capabilityTooltipDetails, runtimeModules: [...runtimeIds].map(([id, kind]) => ({ id, kind })) } };
}

module.exports = { analyzeSource, resourceKind, UI_PROPS };
