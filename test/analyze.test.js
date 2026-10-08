const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeSource } = require('../src/analyze');
const acorn = require('../src/core').parser();
const analyze = source => analyzeSource(source, { acorn });
const moduleSource = body => `var modules = { 100(module, exports, requireModule) { ${body.replaceAll('requireModule(60501)', 'require("react")').replaceAll('requireModule(87345)', 'require("react/jsx-runtime")')} } };`;

test('only proven React render positions are collected; internal custom and events survive', () => {
  const source = moduleSource(`
    const React = requireModule(60501), JSX = requireModule(87345);
    const config = { category: "custom", title: "Settings", label: "Copy" };
    const event = "Cancel";
    JSX.jsx("button", { children: "Cancel", title: "Settings", type: "custom", text: "Copy", onClick: () => emit("Cancel") });
    React.createElement("input", { placeholder: "Search", "aria-label": "Search", value: "Cancel" });
    document.createElement("Cancel");
    config.createElement("div", { children: "Copy" });
  `);
  const result = analyze(source);
  assert.deepEqual(result.ui.map(n => [n.value, n.property]), [
    ['Cancel', 'children'], ['Settings', 'title'], ['Search', 'placeholder'], ['Search', 'aria-label'],
  ]);
  for (const node of result.ui) assert.equal(JSON.parse(source.slice(node.index, node.index + node.len)), node.value);
});

test('lexical scope shadowing and reassignment cannot reuse an imported factory alias', () => {
  const result = analyze(moduleSource(`
    const JSX = requireModule(87345);
    JSX.jsx("span", { children: "Keep this candidate" });
    function nested(JSX) { JSX.jsx("span", { children: "Parameter shadow" }); }
    { let JSX = other; JSX.jsx("span", { children: "Block shadow" }); }
    try {} catch (JSX) { JSX.jsx("span", { children: "Catch shadow" }); }
    function destructured({ JSX }) { JSX.jsx("span", { children: "Destructured shadow" }); }
    let changed = requireModule(87345);
    changed = other;
    changed.jsx("span", { children: "Reassigned factory" });
  `));
  assert.deepEqual(result.ui.map(n => n.value), ['Keep this candidate']);
});

test('children arrays collect only immediate text and separately proven nested elements', () => {
  const result = analyze(moduleSource(`
    const JSX = requireModule(87345), React = requireModule(60501);
    JSX.jsxs("div", { children: ["First", userText, helper("Program string"),
      condition ? "Conditional string" : "Alternative", { message: "Object string" },
      JSX.jsx("span", { children: "Nested" }), ["Nested array"]] });
    React.createElement("span", null, "Direct child", userText, helper("Callback argument"));
  `));
  assert.deepEqual(result.ui.map(n => n.value), ['First', 'Nested', 'Direct child']);
});

test('static template text works while interpolated templates remain outside the patch', () => {
  const result = analyze(moduleSource('const JSX=requireModule(87345); JSX.jsx("div", {title:`Settings`, children:`Hello ${user}`});'));
  assert.deepEqual(result.ui.map(n => n.value), ['Settings']);
});

test('JSON classification relies on explicit English resource anchors, not ASCII text', () => {
  const objects = [
    { manageAccess: { accessLevel: 'Access level', add: 'Add', done: 'Done' } },
    { tabs: { changes: 'Changes', bugs: 'Bugs', description: 'Description' } },
    { transcript: { suspended: { totalSessionLimitExceeded: 'Devin went to sleep because this session exceeded the total session ACU limit.' } } },
    { v: '5.12', nm: 'The animation with your new layers', layers: [{ nm: 'custom' }] },
    { manageAccess: { accessLevel: 'Nivel de acceso', add: 'Add', done: 'Done' } },
    [{ n: 'grinning', c: 'Smileys & Emotion' }],
    { title: 'The user can open your session and continue' },
  ];
  const result = analyze(objects.map((obj, i) => `const value${i}=JSON.parse(${JSON.stringify(JSON.stringify(obj))});`).join('\n'));
  assert.deepEqual(result.blocks.map(n => n.en), [true, true, true, false, false, false, false]);
  assert.deepEqual(result.blocks.filter(n => n.en).map(n => n.namespace), ['translation', 'review', 'englishOverrides']);
});

test('a locally shadowed JSON parser is never treated as an editable resource', () => {
  const obj = { manageAccess: { accessLevel: 'Access level', add: 'Add', done: 'Done' } };
  assert.equal(analyze(`function process(JSON) { return JSON.parse(${JSON.stringify(JSON.stringify(obj))}); }`).blocks.length, 0);
});

test('text props require a component that directly renders its text parameter', () => {
  const result = analyze(moduleSource(`
    const JSX = requireModule(87345);
    function NavText({text:t}) { return JSX.jsx("span", {children:t}); }
    function Data({text:t}) { return process(t); }
    JSX.jsx(NavText, {text:"New session"});
    JSX.jsx(Data, {text:"Internal event"});
    JSX.jsx("input", {text:"Internal value"});
    function nested(NavText) { JSX.jsx(NavText, {text:"Shadowed component"}); }
  `));
  assert.deepEqual(result.ui.map(n => n.value), ['New session']);
});

test('runtime labels are scoped to navigation and clickable menu display positions', () => {
  const result = analyze(moduleSource(`
    const JSX = requireModule(87345);
    function NavText({text:t}) { return JSX.jsx("span", {children:t}); }
    const tab={id:"review",label:"Review"}, action={label:"Archive",onClick:run};
    JSX.jsx(Nav, {variant:"nav", children:JSX.jsx(NavText, {text:tab.label})});
    JSX.jsx(NavText, {text:tab.label});
    JSX.jsx(Menu, {onClick:action.onClick, children:JSX.jsx("span", {children:action.label})});
    JSX.jsx("span", {children:action.label});
    JSX.jsx(Menu, {onClick:other.onClick, children:JSX.jsx("span", {children:action.label})});
  `));
  assert.deepEqual(result.display.map(n => [n.kind, n.len]), [['nav', 'tab.label'.length], ['menu', 'action.label'.length]]);
});
