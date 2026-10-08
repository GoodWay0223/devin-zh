const test = require('node:test');
const assert = require('node:assert/strict');
const { patchSource } = require('../src/patch');
const C = require('../src/core');
const acorn = C.parser();
const vm = require('node:vm');
const moduleSource = body => `var modules = { 100(module, exports, requireModule) { ${body.replaceAll('requireModule(60501)', 'require("react")').replaceAll('requireModule(87345)', 'require("react/jsx-runtime")')} } };`;
const mockRequire = pkg => pkg === 'react' ? {forwardRef:fn=>fn} : {jsx:(type,props)=>({type,props})};
const dictionary = entries => ({
  str: en => Object.hasOwn(entries, en) ? entries[en] : undefined,
  resolveI18n: (_, en) => Object.hasOwn(entries, en) ? entries[en] : undefined,
});
function jsLiteral(value, quote) {
  if (quote === '"') return JSON.stringify(value);
  const escaped = value.replace(/\\/g, '\\\\').replace(new RegExp(quote, 'g'), '\\' + quote);
  return quote + escaped + quote;
}

for (const quote of ["'", '"', '`']) test(`EN JSON resources translate when stored in ${quote} JS strings`, () => {
  const obj = {
    manageAccess: { accessLevel: 'Access level', add: 'Add', done: 'Done' },
    example: { greeting: 'Hello {{name}}', custom: 'custom', flag: true, count: 7 },
  };
  const source = `const resource=JSON.parse(${jsLiteral(JSON.stringify(obj), quote)});`;
  const result = patchSource(source, dictionary({ 'Access level': '访问级别', Add: '添加', Done: '完成', 'Hello {{name}}': '你好 {{name}}' }));
  assert.equal(result.stats.resourceBlocks, 1);
  assert.equal(result.stats.i18n, 4);
  const parsed = C.analyze(result.source).blocks[0].obj;
  assert.deepEqual(parsed, {
    manageAccess: { accessLevel: '访问级别', add: '添加', done: '完成' },
    example: { greeting: '你好 {{name}}', custom: 'custom', flag: true, count: 7 },
  });
  assert.doesNotThrow(() => acorn.parse(result.source, { ecmaVersion: 'latest', sourceType: 'module' }));
});

test('non-EN resources, animations, emoji and bootstrap code remain byte-identical', () => {
  const source = `
    const es=JSON.parse('{"manageAccess":{"accessLevel":"Nivel de acceso","add":"Add","done":"Done"}}');
    const animation=JSON.parse('{"v":"5.12.2","nm":"Search","layers":[{"nm":"custom"}]}');
    const emoji=JSON.parse('[{"n":"grinning","c":"Smileys & Emotion"}]');
    const custom = { category: "custom", children: "Cancel", title: "Settings" };
    const action = "Cancel";
    bootstrap(custom, action);
  `;
  const result = patchSource(source, dictionary({ Add: '添加', Done: '完成', Search: '搜索', custom: '自定义', Cancel: '取消', Settings: '设置', grinning: '笑脸' }));
  assert.equal(result.source, source);
  assert.equal(result.stats.i18n + result.stats.ui, 0);
});

test('the original white-screen risk stays unchanged while visible Cancel text translates', () => {
  const source = moduleSource(`
    const JSX = requireModule(87345);
    const category = "custom", eventName = "Cancel";
    const config = { category: "custom", title: "Settings" };
    JSX.jsx("button", { children: "Cancel", type: "custom", onClick: () => dispatch("Cancel") });
    if (category === "custom") register(config, eventName);
  `);
  const result = patchSource(source, dictionary({ custom: '自定义', Cancel: '取消', Settings: '设置' }));
  assert.equal(result.source, source.replace('children: "Cancel"', 'children: "取消"'));
  assert.equal(result.stats.ui, 1);
  assert.doesNotThrow(() => acorn.parse(result.source, { ecmaVersion: 'latest', sourceType: 'module' }));
});

test('placeholder, markup, URL and inline-code mismatches preserve original UI/resource text', () => {
  const values = ['Hello {{name}}', '<strong>Continue</strong>', 'See https://example.com/help', 'Use `npm`'];
  const resource = { manageAccess: { accessLevel: 'Access level', add: 'Add', done: 'Done' }, checks: Object.fromEntries(values.map((v, i) => [i, v])) };
  const source = `const resource=JSON.parse(${JSON.stringify(JSON.stringify(resource))});\n` + moduleSource(`const JSX=requireModule(87345); ${values.map(v => `JSX.jsx("span",{children:${JSON.stringify(v)}});`).join('\n')}`);
  const result = patchSource(source, dictionary({
    'Hello {{name}}': '你好', '<strong>Continue</strong>': '<b>继续</b>',
    'See https://example.com/help': '查看 https://example.com/changed', 'Use `npm`': '使用 npm',
  }));
  assert.equal(result.source, source);
  assert.equal(result.stats.rejected, 8);
  assert.ok(result.rejections.every(r => r.problem === 'placeholder-or-markup' || r.problem === 'url'));
});

test('quotes, apostrophes, newlines, backslashes and emoji survive generated JS and JSON', () => {
  const translated = '你好 "朋友"\n下一行\'单引号\\目录 😀';
  const resource = { manageAccess: { accessLevel: 'Access level', add: 'Add', done: 'Done' }, greeting: 'Hello' };
  const source = `const resource=JSON.parse(${JSON.stringify(JSON.stringify(resource))});\n` + moduleSource('const JSX=requireModule(87345); JSX.jsx("span", { children:"Hello" });');
  const result = patchSource(source, dictionary({ Hello: translated }));
  const after = C.analyze(result.source);
  assert.equal(after.blocks[0].obj.greeting, translated);
  assert.equal(after.ui[0].value, translated);
  assert.equal(result.stats.ui, 1);
  assert.equal(result.stats.i18n, 1);
  assert.doesNotThrow(() => acorn.parse(result.source, { ecmaVersion: 'latest', sourceType: 'module' }));
});

test('children-array patching leaves callback arguments, conditionals and nested data untouched', () => {
  const source = moduleSource(`
    const JSX=requireModule(87345);
    JSX.jsxs("span", { children: ["Cancel", helper("Cancel"), ready ? "Cancel" : "Send", {message:"Cancel"}, ["Cancel"]] });
  `);
  const result = patchSource(source, dictionary({ Cancel: '取消', Send: '发送' }));
  assert.equal(result.source, source.replace('children: ["Cancel"', 'children: ["取消"'));
  assert.equal(result.stats.ui, 1);
});

test('sidebar display and menu actions translate without modifying IDs, source labels or handlers', () => {
  const body = `
    const JSX=requireModule(87345);
    function NavText({text:t}) {return JSX.jsx("span",{children:t});}
    const tab={id:"review",label:"Review"}, action={id:"archive",label:"Archive",onClick:()=>"Archive"};
    const nav=JSX.jsx("nav",{variant:"nav",children:JSX.jsx(NavText,{text:tab.label})});
    const menu=JSX.jsx("menu",{onClick:action.onClick,children:JSX.jsx("span",{children:action.label})});
    const plain=JSX.jsx("span",{children:tab.label});
    globalThis.result={tab,action,nav,menu,plain};
  `;
  const source = moduleSource(body);
  const patched = patchSource(source, dictionary({}), {nav:{Review:'代码审查'},menu:{Archive:'归档'}});
  const context = {require:mockRequire};
  vm.runInNewContext(patched.source + ';modules[100](null,null,()=>({jsx:(type,props)=>({type,props})}));', context);
  const result = context.result;
  assert.equal(patched.stats.display, 2);
  assert.equal(result.nav.props.children.props.text, '代码审查');
  assert.equal(result.menu.props.children.props.children, '归档');
  assert.equal(result.tab.id, 'review');
  assert.equal(result.tab.label, 'Review');
  assert.equal(result.action.label, 'Archive');
  assert.equal(result.menu.props.onClick(), 'Archive');
  assert.equal(result.plain.props.children, 'Review');
});

test('runtime display translation evaluates once and preserves unknown labels and React nodes', () => {
  for (const label of ['User supplied name', '__proto__', {type:'custom'}]) {
    const source = moduleSource(`
      const JSX=requireModule(87345);function NavText({text:t}){return JSX.jsx("span",{children:t});}
      const tab={get label(){globalThis.reads++;return globalThis.input;}};
      globalThis.result=JSX.jsx("nav",{variant:"nav",children:JSX.jsx(NavText,{text:tab.label})});
    `);
    const patched = patchSource(source, dictionary({}), {nav:{Review:'代码审查'}});
    const context = { input:label, reads:0, require:mockRequire };
    vm.runInNewContext(patched.source + ';modules[100](null,null,()=>({jsx:(type,props)=>({type,props})}));', context);
    assert.equal(context.reads, 1);
    assert.equal(context.result.props.children.props.text, label);
  }
});

test('chat mode labels and descriptions translate while the original mode values and approval actions survive', () => {
  const source = moduleSource(`
    const React=requireModule(60501),JSX=requireModule(87345);
    const Selector=React.forwardRef(({mode,availableModes,onModeSelect})=>{
      const selected=availableModes.find(option=>option.value===mode);
      const label=selected.label;
      return JSX.jsx("button",{label,children:availableModes.map(option=>JSX.jsx("item",{
        title:option.label,subtitle:option.description,onClick:()=>onModeSelect(option.value)
      }))});
    });
    Selector.displayName="SendModeSelector";
    globalThis.render=Selector;
  `);
  const translations = {Code:'编写代码','Bypass Permissions':'跳过权限确认','Auto-approve all tool calls':'自动批准所有工具调用'};
  const patched = patchSource(source, dictionary({}), {mode:translations});
  const context = {require:mockRequire};
  vm.runInNewContext(patched.source + ';modules[100](null,null,id=>id===60501?{forwardRef:fn=>fn}:{jsx:(type,props)=>({type,props})});',context);
  let selected;
  const options = [{value:'code',label:'Code',description:'Unreviewed description'},{value:'bypass',label:'Bypass Permissions',description:'Auto-approve all tool calls'}];
  const rendered = context.render({mode:'bypass',availableModes:options,onModeSelect:value=>selected=value});
  assert.equal(patched.stats.display, 3);
  assert.equal(rendered.props.label, '跳过权限确认');
  assert.equal(rendered.props.children[0].props.title, '编写代码');
  assert.equal(rendered.props.children[0].props.subtitle, 'Unreviewed description');
  assert.equal(rendered.props.children[1].props.subtitle, '自动批准所有工具调用');
  rendered.props.children[1].props.onClick();
  assert.equal(selected, 'bypass');
  assert.equal(options[1].label, 'Bypass Permissions');
  assert.equal(options[1].value, 'bypass');
});

test('unknown mode component shapes are preserved instead of guessing at permissions UI', () => {
  const source=moduleSource(`const React=requireModule(60501),JSX=requireModule(87345);
    const Selector=React.forwardRef(({availableModes})=>JSX.jsx("item",{title:option.label,subtitle:option.description}));
    Selector.displayName="SendModeSelector";
  `);
  assert.equal(patchSource(source,dictionary({}),{mode:{Code:'编写代码'}}).source,source);
});
