const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const C = require('../src/core');
const { patchSource } = require('../src/patch');
const descriptions = require('../src/model-translations');
const imports = 'const React=require("react"), JSX=require("react/jsx-runtime");';
const emptyDictionary = { str: () => undefined, resolveI18n: () => undefined, human: {} };
const fusionText = 'Pairs frontier intelligence with cost-efficient execution to deliver frontier-level results at lower cost';
const normalText = 'Balances cost and intelligence with models like Opus 5.5, GPT-6.1 Sol, Fable 5.1, and GPT-6 Astra';
const capability = `${imports}
  const defaults={fusionDescription:${JSON.stringify(fusionText)},capabilityTooltip:"Unknown tooltip"};
  function Item({item}) { return JSX.jsxs("div",{children:[
    JSX.jsx("span",{children:item.label}), JSX.jsx("tooltip",{content:item.tooltip})]}); }
  function Menu({fusion,items,value,onValueChange,labels}) {
    const display={...defaults,...labels};
    return JSX.jsxs("menu",{children:[JSX.jsx("span",{children:display.fusionDescription}),
      JSX.jsx("tooltip",{tooltip:display.fusionDescription}),
      ...items.map(item=>JSX.jsx(Item,{item})), JSX.jsx("button",{onClick:()=>onValueChange(value),children:"Apply"})]});
  }
  const Selector=React.memo(({footerWidth=9999,disabled=false})=>JSX.jsx(Menu,{fusion:true,items:options,value:"normal",onValueChange:choose}));
  Selector.displayName="CapabilitySelector";
  globalThis.result=JSX.jsx(Selector,{});
`;
function execute(source, { options = [], choose = () => {} } = {}) {
  const jsx = (type, props) => typeof type === 'function' ? type(props) : { type, props };
  const context = { options, choose, require: name => name === 'react' ? { memo: fn => fn, forwardRef: fn => fn } : { jsx, jsxs: jsx } };
  vm.runInNewContext(source, context);
  return context.result;
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  const children = tree.props?.children;
  return [tree, ...(Array.isArray(children) ? children.flatMap(nodes) : nodes(children))];
}

test('capability descriptions translate at proven output positions and model names remain complete', () => {
  const callback = () => {};
  const options = [{ id: 'normal', label: 'Normal', tooltip: normalText }, { id: 'ultra', label: 'Ultra', tooltip: 'A future unknown description' }];
  const snapshot = JSON.stringify(options);
  const patched = patchSource(capability, emptyDictionary, {});
  const rendered = nodes(execute(patched.source, { options, choose: callback }));
  assert.ok(rendered.some(n => n.props?.children === descriptions.translateModelDescription(fusionText)));
  const tooltips = rendered.filter(n => n.type === 'tooltip').map(n => n.props.content || n.props.tooltip);
  assert.ok(tooltips.includes(descriptions.translateModelDescription(normalText)));
  const normalChinese = tooltips.find(t => t.includes('Opus 5.5'));
  for (const name of ['Opus 5.5', 'GPT-6.1 Sol', 'Fable 5.1', 'GPT-6 Astra']) assert.ok(normalChinese.includes(name));
  assert.ok(rendered.some(n => n.props?.children === 'Normal'));
  assert.ok(rendered.some(n => n.props?.children === 'Ultra'));
  assert.ok(tooltips.includes('A future unknown description'));
  assert.equal(JSON.stringify(options), snapshot);
  assert.equal(options[0].id, 'normal');
  assert.ok(patched.source.includes('onClick:()=>onValueChange(value)'));
  const futureModels = 'Opus 9.0 (Preview), GPT-7 Sol, and Custom Model-X';
  const future = nodes(execute(patched.source, {options:[{label:'Normal',tooltip:'Balances cost and intelligence with models like '+futureModels}]}));
  assert.ok(future.find(n=>n.type==='tooltip' && n.props.content)?.props.content.includes(futureModels));
});

test('description-looking data and unrelated tooltip outputs are unchanged', () => {
  const source = `${imports}
    const data={id:"normal",description:${JSON.stringify(normalText)},tooltip:${JSON.stringify(fusionText)}};
    const unknown={description:data.description,tooltip:data.tooltip};
    globalThis.result=JSX.jsx("tooltip",{content:unknown.description,tooltip:unknown.tooltip});
  `;
  const patched = patchSource(source, emptyDictionary, {});
  assert.equal(patched.source, source);
  assert.equal(execute(patched.source).props.content, normalText);
});

test('a selector without the capability menu contract does not unlock description rewrites', () => {
  const source = `${imports}
    function Unknown({item}) { return JSX.jsx("tooltip",{content:item.tooltip}); }
    const Selector=React.memo(({footerWidth,disabled})=>JSX.jsx(Unknown,{item:options[0]}));
    Selector.displayName="CapabilitySelector";
    globalThis.result=JSX.jsx(Selector,{});
  `;
  const patched = patchSource(source, emptyDictionary, {});
  // An item component is meaningful only after a proven fusion/items menu.
  assert.equal(patched.source, source);
});

test('mutated capability item objects fail closed', () => {
  const source = capability.replace('function Item({item}) { return', 'function Item({item}) { item.tooltip = "Changed runtime value"; return');
  const analysis = C.analyze(source);
  const candidate = analysis.display.find(n => source.slice(n.index,n.index+n.len)==='item.tooltip');
  assert.equal(candidate, undefined);
});

const tooltipHelper = 'const tooltipParts=(title,detail,width)=>title||detail?JSX.jsxs("div",{className:classes("flex flex-col",width),children:[title?JSX.jsx("span",{children:title}):null,detail?JSX.jsx("span",{className:"opacity-80",children:detail}):null]}):void 0;';
const modernCapability = capability.replace(
  'const Selector=React.memo(({footerWidth=9999,disabled=false})=>JSX.jsx(Menu,{fusion:true,items:options,value:"normal",onValueChange:choose}));',
  `function classes(...values){return values.filter(Boolean).join(" ");}
  ${tooltipHelper}
  const Selector=React.memo(({iconOnly=false,disabled=false})=>{
    const items=options.map(option=>{
      const presentation=option.presentation;
      return {id:option.id,label:option.label,tooltip:tooltipParts(presentation.tooltip,presentation.tooltipDetail)};
    });
    return JSX.jsx(Menu,{fusion:true,items,value:"normal",onValueChange:choose});
  });`
).replace('globalThis.result=JSX.jsx(Selector,{});',
  'globalThis.result=JSX.jsxs("main",{children:[JSX.jsx(Selector,{}),JSX.jsx("article",{children:tooltipParts(options[0].presentation.tooltip,options[0].presentation.tooltipDetail)})]});');

test('modern capability item tooltip details translate without altering titles or shared helper callers', () => {
  const options=[{id:'normal',label:'Normal',presentation:{tooltip:'GPT-6.1 Sol',tooltipDetail:normalText}}];
  const snapshot=JSON.stringify(options), analysis=C.analyze(modernCapability);
  assert.equal(analysis.stats.capabilitySelectors,1);
  assert.equal(analysis.stats.capabilityTooltipDetails,1);
  const patched=patchSource(modernCapability,emptyDictionary,{});
  assert.ok(patched.source.includes(tooltipHelper), 'the shared helper body must stay byte-identical');
  assert.ok(patched.source.includes('id:option.id,label:option.label'));
  assert.ok(patched.source.includes('onValueChange:choose'));
  const rendered=nodes(execute(patched.source,{options}));
  const tooltip=rendered.find(n=>n.type==='tooltip'&&typeof n.props.content==='object');
  const parts=nodes(tooltip.props.content).filter(n=>n.type==='span').map(n=>n.props.children);
  assert.deepEqual(parts,['GPT-6.1 Sol',descriptions.translateModelDescription(normalText)]);
  const unrelated=rendered.find(n=>n.type==='article');
  assert.ok(nodes(unrelated).some(n=>n.props?.children===normalText));
  assert.equal(JSON.stringify(options),snapshot);
});

test('unknown tooltip details and non-text description objects retain their identity', () => {
  const detail={type:'user-content',props:{children:'User text'}};
  const patched=patchSource(modernCapability,emptyDictionary,{});
  for(const value of ['A new description from a future build',detail]) {
    const rendered=nodes(execute(patched.source,{options:[{id:'future',label:'Future Model',presentation:{tooltip:'Future Model',tooltipDetail:value}}]}));
    const tooltip=rendered.find(n=>n.type==='tooltip'&&typeof n.props.content==='object');
    assert.ok(nodes(tooltip.props.content).some(n=>n.props?.children===value));
  }
});

test('capability helper matching rejects changed render shapes, mutation, and unrelated item inputs', () => {
  for(const source of [
    modernCapability.replace('children:detail}', 'children:readMessage(detail)}'),
    modernCapability.replace('=>title||detail?', '=>(detail=readMessage())||title||detail?'),
    modernCapability.replace('presentation.tooltipDetail)', 'option.message)'),
    modernCapability.replace('items,value:"normal"', 'items:options,value:"normal"'),
    modernCapability.replace('Selector.displayName="CapabilitySelector"', 'Selector.displayName="ChatMessages"'),
    modernCapability.replace('className:"opacity-80"', 'onClick:()=>save(detail)'),
  ]) assert.equal(C.analyze(source).stats.capabilityTooltipDetails,0);
});

test('conditional display collection never treats a typeof comparison as visible text', () => {
  const source=`${imports} globalThis.result=JSX.jsx("div",{children:"string"===typeof options[0]?JSX.jsx("span",{children:options[0]}):null});`;
  const result=patchSource(source,{...emptyDictionary,str:value=>value==='string'?'字符串':undefined},{});
  assert.equal(result.source,source);
  assert.ok(nodes(execute(result.source,{options:['Normal']})).some(n=>n.props?.children==='Normal'));
});

const settings = `${imports}
  function Row({id,labelId,label,description,displayLabel,displayDescription,orientation,scrollIntoView,children}) {
    const shownLabel=displayLabel??label, shownDescription=displayDescription??description;
    return JSX.jsxs("section",{id,children:[JSX.jsx("h4",{children:shownLabel}),JSX.jsx("p",{children:shownDescription}),children]});
  }
  function Action({id,label,description,actionLabel,onAction}) {
    return JSX.jsx(Row,{id,label,description,children:JSX.jsx("button",{onClick:onAction,children:actionLabel})});
  }
  globalThis.result=JSX.jsx(Action,{id:"setting.custom",label:options[0].label,description:options[0].description,actionLabel:options[0].action,onAction:choose});
`;

test('setting row and action contracts translate display only; IDs, objects and callbacks survive', () => {
  const options = [{ label: 'Open editor settings', description: 'General editor preferences open in a separate page', action: 'Open editor settings' }];
  const callback = () => {}, snapshot = JSON.stringify(options);
  const display = { settings: { 'Open editor settings': '打开编辑器设置', 'General editor preferences open in a separate page': '在单独的页面打开编辑器偏好设置' } };
  const result = patchSource(settings, emptyDictionary, display);
  const rendered = nodes(execute(result.source, { options, choose: callback }));
  assert.equal(rendered.find(n=>n.type==='section').props.id, 'setting.custom');
  assert.equal(rendered.find(n=>n.type==='h4').props.children, '打开编辑器设置');
  assert.equal(rendered.find(n=>n.type==='p').props.children, '在单独的页面打开编辑器偏好设置');
  assert.equal(rendered.find(n=>n.type==='button').props.children, '打开编辑器设置');
  assert.equal(rendered.find(n=>n.type==='button').props.onClick, callback);
  assert.equal(JSON.stringify(options), snapshot);
});

test('unknown settings strings and non-text React elements keep their identity', () => {
  const element = { type: 'custom-content', props: { children: 'User document' } };
  const patched = patchSource(settings, emptyDictionary, { settings: { Known: '已知' } });
  const rendered = nodes(execute(patched.source, { options: [{label:'User custom setting',description:element,action:'Future action'}] }));
  assert.equal(rendered.find(n=>n.type==='h4').props.children, 'User custom setting');
  assert.equal(rendered.find(n=>n.type==='p').props.children, element);
});

test('unproven setting-like forms cannot translate dynamic descriptions', () => {
  const source = `${imports}
    function Form({id,label,description,onAction}) { return JSX.jsx("p",{children:description}); }
    globalThis.result=JSX.jsx(Form,{description:options[0].description});
  `;
  const result = patchSource(source, emptyDictionary, { settings: { Known: '已知' } });
  assert.equal(result.source, source);
});

test('mode Agent and Normal remain names even when a display dictionary requests translation', () => {
  const source = `${imports}
    const Mode=React.forwardRef(({mode,availableModes,onModeSelect})=>JSX.jsx("menu",{
      children:availableModes.map(option=>JSX.jsx("item",{title:option.label,subtitle:option.description,onClick:()=>onModeSelect(option.value)}))}));
    Mode.displayName="SendModeSelector";
    globalThis.result=JSX.jsx(Mode,{mode:"agent",availableModes:options,onModeSelect:choose});
  `;
  const result = patchSource(source, emptyDictionary, {mode:{Agent:'智能体',Normal:'常规','Read-only mode':'只读模式'}});
  const rendered=nodes(execute(result.source,{options:[{value:'agent',label:'Agent',description:'Read-only mode'},{value:'normal',label:'Normal',description:'A future mode'}]}));
  assert.equal(rendered.find(n=>n.props.title==='Agent').props.subtitle, '只读模式');
  assert.equal(rendered.find(n=>n.props.title==='Normal').props.subtitle, 'A future mode');
  assert.ok(result.source.includes('onClick:()=>onModeSelect(option.value)'));
});
