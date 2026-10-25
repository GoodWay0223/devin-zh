'use strict';

// Inspect parsed module factories only. Nothing from the application is executed.
// A new bundler/runtime shape deliberately returns no match instead of guessing IDs.
const FUNCTIONS = new Set(['FunctionExpression', 'FunctionDeclaration', 'ArrowFunctionExpression']);
const key = n => n?.type === 'Identifier' ? n.name : n?.type === 'Literal' ? String(n.value) : null;
const member = (n, object, property) => n?.type === 'MemberExpression' && !n.computed && n.object.type === 'Identifier' && n.object.name === object && key(n.property) === property;
function walk(node, visit, skipFunctions = false) {
  if (!node?.type) return;
  visit(node);
  if (skipFunctions && FUNCTIONS.has(node.type)) return;
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) for (const child of value) walk(child, visit, skipFunctions);
    else if (value?.type) walk(value, visit, skipFunctions);
  }
}
function factoryEvidence(fn) {
  if (!FUNCTIONS.has(fn?.type) || fn.body.type !== 'BlockStatement' || fn.params.length < 2 || fn.params.some(p => p.type !== 'Identifier')) return null;
  const exportsName = fn.params[1].name, symbols = new Map(), functions = new Map(), exports = new Map(), mutated = new Set(), names = new Set(fn.params.map(p => p.name));
  let ambiguous = names.size !== fn.params.length || names.has('Symbol');
  function declare(name) {
    if (names.has(name) || name === 'Symbol') ambiguous = true;
    names.add(name);
  }
  walk(fn.body, node => {
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') {
      declare(node.id.name);
      const init = node.init;
      if (init?.type === 'CallExpression' && member(init.callee, 'Symbol', 'for') && init.arguments.length === 1 && init.arguments[0].type === 'Literal') symbols.set(node.id.name, init.arguments[0].value);
      if (FUNCTIONS.has(init?.type)) functions.set(node.id.name, init);
    }
    if (node.type === 'FunctionDeclaration') { declare(node.id.name); functions.set(node.id.name, node); }
    if (node.type === 'AssignmentExpression') {
      if (node.left.type === 'Identifier') mutated.add(node.left.name);
      if (node.left.type === 'Identifier' && (symbols.has(node.left.name) || node.left.name === exportsName || node.left.name === 'Symbol')) ambiguous = true;
      if (node.left.type === 'MemberExpression' && node.left.object.type === 'Identifier' && node.left.object.name === exportsName) {
        if (node.left.computed || node.operator !== '=') { ambiguous = true; return; }
        const name = key(node.left.property);
        if (exports.has(name)) ambiguous = true;
        exports.set(name, node.right);
      }
    }
    if (node.type === 'UpdateExpression') {
      if (node.argument.type === 'Identifier') mutated.add(node.argument.name);
      if (node.argument.type === 'MemberExpression' && node.argument.object.type === 'Identifier' && node.argument.object.name === exportsName) ambiguous = true;
    }
  }, true);
  if (ambiguous || [...symbols.keys()].some(name => mutated.has(name))) return null;
  const isSymbol = (value, expected) => value?.type === 'Identifier' ? symbols.get(value.name) === expected
    : value?.type === 'CallExpression' && member(value.callee, 'Symbol', 'for') && value.arguments.length === 1 && value.arguments[0].value === expected;
  const resolveFunction = value => FUNCTIONS.has(value?.type) ? value : value?.type === 'Identifier' && !mutated.has(value.name) ? functions.get(value.name) : null;
  function elementBuilder(value) {
    const f = resolveFunction(value);
    if (!f || f.params[0]?.type !== 'Identifier' || f.params.some(p => p.type !== 'Identifier')) return false;
    const localNames = new Set(f.params.map(p => p.name));
    walk(f.body, node => {
      if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') localNames.add(node.id.name);
      if (node.type === 'FunctionDeclaration') localNames.add(node.id.name);
      if (node.type === 'AssignmentExpression' && node.left.type === 'Identifier') localNames.add(node.left.name);
    }, true);
    let result = false;
    walk(f.body, node => {
      if (node.type !== 'ReturnStatement' || node.argument?.type !== 'ObjectExpression') return;
      const props = new Map(node.argument.properties.filter(p => p.type === 'Property' && !p.computed).map(p => [key(p.key), p.value]));
      const type = props.get('type');
      const tag = props.get('$$typeof');
      if (tag?.type === 'Identifier' && localNames.has(tag.name)) return;
      if (['$$typeof', 'type', 'key', 'ref', 'props'].every(p => props.has(p)) && type?.type === 'Identifier' && type.name === f.params[0].name && ['react.element', 'react.transitional.element'].some(s => isSymbol(tag, s))) result = true;
    }, true);
    return result;
  }
  const jsx = exports.get('jsx'), jsxs = exports.get('jsxs');
  if (jsx?.type === 'Identifier' && jsxs?.type === 'Identifier' && jsx.name === jsxs.name && elementBuilder(jsx) && isSymbol(exports.get('Fragment'), 'react.fragment')) return 'jsx';
  const required = ['createElement', 'cloneElement', 'isValidElement', 'createContext', 'forwardRef', 'memo', 'lazy', 'useState', 'useEffect', 'useMemo', 'useContext', 'useRef'];
  if (!required.every(name => resolveFunction(exports.get(name))) || !isSymbol(exports.get('Fragment'), 'react.fragment') || !isSymbol(exports.get('StrictMode'), 'react.strict_mode') || !isSymbol(exports.get('Suspense'), 'react.suspense')) return null;
  if (exports.get('version')?.type !== 'Literal' || !/^\d+\.\d+\.\d+(?:[-+].*)?$/.test(exports.get('version').value)) return null;
  // Hook names alone also occur in unrelated API facades. Require dispatcher calls.
  if (!['useState', 'useEffect', 'useMemo', 'useContext', 'useRef'].every(name => {
    const f = resolveFunction(exports.get(name));
    return f.body?.type === 'BlockStatement' && f.body.body.some(statement => {
      const call = statement.type === 'ReturnStatement' && statement.argument;
      return call?.type === 'CallExpression' && call.callee.type === 'MemberExpression' && !call.callee.computed && key(call.callee.property) === name && call.callee.object.type === 'MemberExpression';
    });
  })) return null;
  const create = resolveFunction(exports.get('createElement'));
  let hasElement = false;
  walk(create.body, node => {
    if (node.type === 'ReturnStatement' && node.argument?.type === 'CallExpression' && node.argument.callee.type === 'Identifier' && elementBuilder(node.argument.callee) && node.argument.arguments[0]?.type === 'Identifier' && node.argument.arguments[0].name === create.params[0]?.name) hasElement = true;
  }, true);
  return hasElement ? 'react' : null;
}

function forwardingTarget(fn) {
  if (fn.params.length !== 3 || fn.params.some(p => p.type !== 'Identifier') || fn.body.type !== 'BlockStatement' || fn.body.body.length !== 1) return null;
  const statement = fn.body.body[0], assignment = statement.type === 'ExpressionStatement' && statement.expression;
  const call = assignment?.right;
  if (assignment?.type !== 'AssignmentExpression' || assignment.operator !== '=' || !member(assignment.left, fn.params[0].name, 'exports') || call?.type !== 'CallExpression' || call.callee.type !== 'Identifier' || call.callee.name !== fn.params[2].name || call.arguments.length !== 1) return null;
  return call.arguments[0].type === 'Literal' && Number.isSafeInteger(call.arguments[0].value) ? call.arguments[0].value : null;
}

function discoverRuntimeIds(ast) {
  const candidates = new Map(), ambiguous = new Set();
  walk(ast, node => {
    if (node.type !== 'Property' || node.computed || !FUNCTIONS.has(node.value?.type) || !/^\d+$/.test(key(node.key) || '')) return;
    const id = Number(key(node.key));
    if (!Number.isSafeInteger(id)) return;
    if (candidates.has(id)) ambiguous.add(id);
    else candidates.set(id, node.value);
  });
  const result = new Map();
  for (const [id, fn] of candidates) {
    if (ambiguous.has(id)) continue;
    const kind = factoryEvidence(fn);
    if (kind) result.set(id, kind);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, fn] of candidates) {
      if (result.has(id) || ambiguous.has(id)) continue;
      const target = forwardingTarget(fn);
      if (result.has(target)) { result.set(id, result.get(target)); changed = true; }
    }
  }
  return result;
}

module.exports = { discoverRuntimeIds, factoryEvidence };
