const test = require('node:test');
const assert = require('node:assert/strict');
const acorn = require('../src/core').parser();
const { discoverRuntimeIds } = require('../src/runtime');
const discover = source => discoverRuntimeIds(acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module' }));
const jsxBody = `
  const element = Symbol.for('react.transitional.element');
  function make(type, props, key) { return { $$typeof: element, type: type, key: key, ref: null, props: props }; }
  exports.Fragment = Symbol.for('react.fragment'); exports.jsx = make; exports.jsxs = make;
`;
const reactBody = `
  const element = Symbol.for('react.element');
  function make(type, key, props) { return { $$typeof: element, type: type, key: key, ref: null, props: props }; }
  exports.Fragment = Symbol.for('react.fragment'); exports.StrictMode = Symbol.for('react.strict_mode'); exports.Suspense = Symbol.for('react.suspense');
  exports.version = '19.2.5';
  exports.createElement = function(type, props) { return make(type, null, props); };
  exports.cloneElement = function() {}; exports.isValidElement = function() {}; exports.createContext = function() {};
  exports.forwardRef = function() {}; exports.memo = function() {}; exports.lazy = function() {};
  exports.useState = function(value) { return internals.H.useState(value); };
  exports.useEffect = function(value) { return internals.H.useEffect(value); };
  exports.useMemo = function(value) { return internals.H.useMemo(value); };
  exports.useContext = function(value) { return internals.H.useContext(value); };
  exports.useRef = function(value) { return internals.H.useRef(value); };
`;
const factory = (id, body) => `${id}(module, exports, requireModule) { ${body} }`;

test('runtime IDs derive from factory evidence even after every ID changes', () => {
  for (const offset of [0, 10000, 40000]) {
    const source = `const modules = { ${factory(1 + offset, jsxBody)}, ${factory(2 + offset, reactBody)}, ${factory(3 + offset, `module.exports=requireModule(${1 + offset});`)}, ${factory(4 + offset, `module.exports=requireModule(${2 + offset});`)} };`;
    assert.deepEqual([...discover(source)], [[1 + offset, 'jsx'], [2 + offset, 'react'], [3 + offset, 'jsx'], [4 + offset, 'react']]);
  }
});

test('old numeric IDs and function names are not evidence', () => {
  const source = `const modules={${factory(60501, 'exports.createElement = function() {};')},${factory(87345, 'exports.jsx = make; exports.jsxs = make; exports.Fragment = "react.fragment";')}};`;
  assert.equal(discover(source).size, 0);
});

test('partial or counterfeit runtime shapes are left unidentified', () => {
  for (const body of [
    jsxBody.replace("Symbol.for('react.transitional.element')", "'react.transitional.element'"),
    jsxBody.replace('$$typeof: element', '$$typeof: other'),
    jsxBody.replace('type: type', 'type: unrelated'),
    jsxBody.replace('props: props', 'payload: props'),
    jsxBody.replace('exports.jsxs = make', 'exports.jsxs = other'),
    reactBody.replace("exports.version = '19.2.5'", 'exports.version = "app"'),
    reactBody.replace('return internals.H.useState(value)', 'return value'),
    reactBody.replace('return make(type, null, props)', 'return other(type, props)'),
  ]) assert.equal(discover(`const modules={${factory(7, body)}};`).size, 0);
});

test('shadowed symbols, mutated exports and duplicate module IDs fail closed', () => {
  for (const body of [
    'const Symbol = custom;' + jsxBody,
    jsxBody + 'element = changed;',
    jsxBody + 'exports.jsx = other;',
    jsxBody + 'exports[unknown] = other;',
    jsxBody + 'make = other;',
    jsxBody + 'make++;',
    jsxBody.replace('function make(type, props, key)', 'function make(type, props, element)'),
    jsxBody.replace('return { $$typeof: element', 'const element = other; return { $$typeof: element'),
  ]) assert.equal(discover(`const modules={${factory(7, body)}};`).size, 0);
  assert.equal(discover(`const modules={${factory(7, jsxBody)},${factory(7, jsxBody)}};`).size, 0);
});

test('only pure CommonJS forwarding aliases inherit runtime evidence', () => {
  const source = `const modules = { ${factory(1, jsxBody)}, ${factory(2, 'module.exports=requireModule(1);')}, ${factory(3, 'module.exports=requireModule(2);')}, ${factory(4, 'sideEffect(); module.exports=requireModule(1);')}, ${factory(5, 'module.exports=other(1);')}, ${factory(6, 'module.exports=requireModule(999);')} };`;
  assert.deepEqual([...discover(source)], [[1, 'jsx'], [2, 'jsx'], [3, 'jsx']]);
});
