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

function analyzeSource(src, { acorn } = {}) {
  if (!acorn?.parse) throw new Error('analyzeSource requires an injected Acorn parser');
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  const runtimeIds = require('./runtime').discoverRuntimeIds(ast);
  const scopes = new WeakMap(), parents = new WeakMap(), calls = [], writes = [], assignments = [];
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
    if (n.type === 'Identifier') bind(scope, n.name, init, kind);
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
  return { blocks, ui, display, stats: { jsonCalls, staticJsonBlocks: blocks.length, englishResources: blocks.filter(b => b.en).length, renderCalls, uiPositions: ui.length, displayPositions: display.length, modeSelectors: modeSelectors.length, runtimeModules: [...runtimeIds].map(([id, kind]) => ({ id, kind })) } };
}

module.exports = { analyzeSource, resourceKind, UI_PROPS };
