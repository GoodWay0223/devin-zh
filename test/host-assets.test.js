const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const H = require('../src/host-assets');
const C = require('../src/core');
const { analyzeSource } = require('../src/analyze');
const { patchSource } = require('../src/patch');
const base=H.HOST+'/assets/';
const names={runtime:base+'rolldown-runtime-random.js',entry:base+'resources-random.js',row:base+'row-random.js',settings:base+'settings-random.js',menu:base+'menu-random.js',consumer:base+'consumer-random.js'};
const runtime='var common=(factory,cache)=>()=>(cache||(factory((cache={exports:{}}).exports,cache),factory=null),cache.exports);export {common as c};';
const resources=`
  var access,english,review,tabText;
  function init(){
    access={accessLevel:'Access level',add:'Add',done:'Done'};
    english={manageAccess:access,description:'Known description',message:'Hello {{name}}',url:'https://example.com/path'};
    tabText={changes:'Changes',bugs:'Bugs',description:'Description'};review={tabs:tabText};
  }
`;
const entry=`import {c as wrap} from './rolldown-runtime-random.js';
var raw=wrap(exports=>{
  const element=Symbol.for('react.transitional.element');
  function make(type,props,key){return {$$typeof:element,type:type,key:key,ref:null,props:props};}
  exports.Fragment=Symbol.for('react.fragment');exports.jsx=make;exports.jsxs=make;
});
var get=wrap((exports,module)=>{module.exports=raw()});
${resources}
export {get as j};`;
const row=`import {j as get} from './resources-random.js';var JSX;function init(){JSX=get()}
function Row({id,labelId,label,description,displayLabel,displayDescription,orientation,scrollIntoView,children}){
  const shownLabel=displayLabel??label,shownDescription=displayDescription??description;
  return JSX.jsxs('section',{id,children:[JSX.jsx('h4',{children:shownLabel}),JSX.jsx('p',{children:shownDescription}),children]});
}export {Row as r};`;
const settings=`import {j as get} from './resources-random.js';import {r as Row} from './row-random.js';
var JSX;function init(){JSX=get()}
function formatter(description,linkText,linkUrl){let joined=description.join(' ');return linkText?JSX.jsxs('span',{children:[joined,' ',JSX.jsx('a',{href:linkUrl,target:'_blank',rel:'noreferrer',children:linkText})]}):joined;}
function Workspace({setting}){const shown=formatter(setting.description,setting.linkText,setting.linkUrl);return JSX.jsx(Row,{id:setting.id,label:setting.label,description:shown,children:JSX.jsx('input',{value:setting.value,onChange:setting.update})});}
function includeWorkspaceSettings(){};export {Workspace as w};`;
const fusion='Pairs frontier intelligence with cost-efficient execution to deliver frontier-level results at lower cost';
const normal='Balances cost and intelligence with models like Opus 5.5, GPT-6.1 Sol, Fable 5.1, and GPT-6 Astra';
const menu=`import {j as get} from './resources-random.js';var JSX;function init(){JSX=get()}
const defaults={fusionDescription:${JSON.stringify(fusion)},capability:'Capability',speed:'Speed'};
function Menu({fusion,items,value,onValueChange,cardsEnabled,labels}){const copy={...defaults,...labels};return JSX.jsxs('menu',{children:[JSX.jsx('span',{children:copy.fusionDescription}),...items.map(item=>JSX.jsx(Item,{item,selected:item.id===value,speed:null,checkSide:'right',cardsEnabled,onSelect:()=>onValueChange(item.id)}))]});}
function Item({item,selected,speed,checkSide,cardsEnabled,onSelect}){return JSX.jsx(Card,{card:item.card,fallbackTitle:item.label});}
function Card({card,fallbackTitle}){return JSX.jsxs('aside',{children:[JSX.jsx('span',{children:card.title??fallbackTitle}),JSX.jsx('span',{children:card.description})]});}
export {Menu as menu};`;
const consumer=`import {j as get} from './resources-random.js';import {menu as Menu} from './menu-random.js';var JSX;function init(){JSX=get()}
function Consumer({menu,onCapabilityChange,onSelectActionModel,modeSlot}){const items=menu.families.map(family=>{const description=family.card_description;return {id:family.id,label:family.name,selectedValues:family.modes,card:{title:family.name,description}};});return JSX.jsx(Menu,{items:[...items],value:menu.selected,onValueChange:onCapabilityChange,cardsEnabled:true,modeSlot});}`;
const empty={human:{},str:()=>undefined,resolveI18n:()=>undefined};
function graph(overrides={}){
  const sources=new Map([[names.runtime,runtime],[names.entry,entry],[names.row,row],[names.settings,settings],[names.menu,menu],[names.consumer,consumer]]);
  for(const [name,source] of Object.entries(overrides))sources.set(names[name],source);
  const metas=new Map([...sources].map(([relative,source])=>[relative,H.index(source)]));
  const exportsByFile=new Map([...metas].map(([relative])=>[relative,H.runtimeExports(relative,metas)]));
  return {sources,metas,exportsByFile};
}
function workspace(overrides){const g=graph(overrides);return {...g,...H.workspaceDescriptions(names.settings,g.metas.get(names.settings),g.exportsByFile,{'Known description':'已知说明','Learn more':'了解更多'},g.metas)};}
function apply(source,replacements){for(const r of [...replacements].sort((a,b)=>b.start-a.start))source=source.slice(0,r.start)+r.value+source.slice(r.end);return source;}
function execute(source,setting){
  const jsx=(type,props)=>typeof type==='function'?type(props):{type,props};
  const context={get:()=>({jsx,jsxs:jsx}),Row:props=>({type:'row',props}),setting};
  vm.runInNewContext(source.replace(/import[^;]+;/g,'').replace(/export[^;]+;/g,'')+'init();globalThis.result=Workspace({setting});',context);
  return context.result;
}
test('Rolldown runtime proof follows factories and exports, without relying on asset names',()=>{
  const g=graph();assert.deepEqual([...g.exportsByFile.get(names.entry)],[['j','jsx']]);
  const meta=g.metas.get(names.row),bindings=H.runtimeBindings(names.row,meta,g.exportsByFile);
  const analysis=analyzeSource(meta.source,{acorn:C.parser(),provenRuntimeBindings:bindings});
  assert.equal(analysis.stats.settingsRows,1);assert.equal(analysis.stats.displayPositions,2);
  assert.equal(analyzeSource(meta.source,{acorn:C.parser()}).stats.renderCalls,0);
});
test('counterfeit, mutated and non-local runtime routes fail closed',()=>{
  for(const overrides of [
    {runtime:runtime.replace('factory=null','factory=other')},
    {entry:entry.replace("Symbol.for('react.transitional.element')","'react.transitional.element'")},
    {entry:entry.replace('module.exports=raw()','sideEffect();module.exports=raw()')},
    {entry:entry.replace('var get=wrap','var get=unknown')},
    {entry:entry+'get=other;'},
    {entry:entry+'wrap=other;'},
  ])assert.equal(graph(overrides).exportsByFile.get(names.entry).size,0);
  const g=graph({row:row+'JSX.jsx=other;'});assert.equal(H.runtimeBindings(names.row,g.metas.get(names.row),g.exportsByFile).size,0);
  for(const spec of ['../outside.js','./../outside.js','https://example.com/script.js','./x.js?foo','./a\\b.js','./a.js#x'])assert.throws(()=>H.safeRelative(names.row,spec));
});
test('runtime proof respects lexical shadowing and the React 19 ref return sequence',()=>{
  const source=row.replace('var JSX;','{let JSX;JSX.jsx("div",{children:"User content"})}var JSX;');
  const g=graph({row:source}),meta=g.metas.get(names.row);
  const analysis=analyzeSource(source,{acorn:C.parser(),provenRuntimeBindings:H.runtimeBindings(names.row,meta,g.exportsByFile)});
  assert.equal(analysis.stats.settingsRows,1);assert.equal(analysis.ui.some(node=>node.value==='User content'),false);
  const modern=entry.replace('return {$$typeof:element',()=> 'let ref;return ref=props.ref,{$$typeof:element');
  assert.deepEqual([...graph({entry:modern}).exportsByFile.get(names.entry)],[['j','jsx']]);
});
test('static English objects resolve immutable references, never getters, callbacks or changed data',()=>{
  const blocks=H.resources(H.index(entry));assert.deepEqual(blocks.map(x=>x.namespace),['translation','review']);
  assert.equal(blocks[0].value.description,'Known description');
  for(const source of [
    entry+'access.add="Changed";',
    entry.replace("accessLevel:'Access level'","get accessLevel(){return 'Access level'}"),
    entry.replace('manageAccess:access','manageAccess:loadAccess()'),
    entry.replace('manageAccess:access','...spread,manageAccess:access'),
    entry.replace("add:'Add'","add:'添加'"),
  ])assert.equal(H.resources(H.index(source)).some(x=>x.namespace==='translation'),false);
});
test('workspace descriptions translate only at their proven setting row, preserving data, links and callbacks',()=>{
  const result=workspace();assert.equal(result.replacements.length,2);
  const callback=()=>{},setting={id:'internal.setting',label:'Normal',description:['Known description'],linkText:'Learn more',linkUrl:'https://example.com/path',value:'Known description',update:callback};
  const snapshot=JSON.stringify(setting),out=execute(apply(settings,result.replacements),setting);
  assert.equal(out.props.id,setting.id);assert.equal(out.props.label,'Normal');
  assert.equal(out.props.description.props.children[0],'已知说明');
  assert.equal(out.props.description.props.children[2].props.children,'了解更多');
  assert.equal(out.props.description.props.children[2].props.href,setting.linkUrl);
  assert.equal(out.props.children.props.value,'Known description');assert.equal(out.props.children.props.onChange,callback);
  assert.equal(JSON.stringify(setting),snapshot);
  const unknown={...setting,description:['A future description'],linkText:'Unknown link'};
  assert.equal(execute(apply(settings,result.replacements),unknown).props.description.props.children[0],'A future description');
});
test('unknown description helpers and chat consumers never gain settings translation',()=>{
  for(const source of [
    settings.replace("description.join(' ')","description.map(transform).join(' ')"),
    settings.replace("let joined=description.join(' ');","description.push('changed');let joined=description.join(' ');"),
    settings.replace("href:linkUrl","href:redirect(linkUrl)"),
    settings.replace("target:'_blank'","onClick:callback"),
    settings.replace('JSX.jsx(Row,{','JSX.jsx(Chat,{'),
    settings.replace('id:setting.id','id:setting.other'),
    settings.replace('return JSX.jsx(Row','log(shown);return JSX.jsx(Row'),
    settings.replace('formatter(setting.description','formatter(chat.description'),
  ])assert.equal(workspace({settings:source}).replacements.length,0);
  assert.equal(workspace({row:row.replace('displayDescription','unknownProperty')}).replacements.length,0);
});
function capabilities(overrides){const g=graph(overrides);return {...g,...H.capabilityDescriptions(names.menu,g.metas.get(names.menu),g.exportsByFile,g.metas)};}
function renderMenu(source,items){const jsx=(type,props)=>typeof type==='function'?type(props):{type,props},context={get:()=>({jsx,jsxs:jsx}),items};vm.runInNewContext(source.replace(/import[^;]+;/g,'').replace(/export[^;]+;/g,'')+'init();globalThis.result=Menu({items,value:items[0].id,onValueChange:()=>{},cardsEnabled:true});',context);return context.result;}
function children(node){if(!node||typeof node!=='object')return [node];const values=node.props?.children;return [node,...(Array.isArray(values)?values.flatMap(children):values===undefined?[]:children(values))];}
test('server capability card and Fusion descriptions translate at output while names and model captures remain unchanged',()=>{
  const result=capabilities();assert.equal(result.menus,1);assert.equal(result.fusionDescriptions,1);assert.equal(result.cardDescriptions,1);
  const models=require('../src/model-translations'),unknown={type:'user-element',props:{children:'Untouched'}};
  const descriptions=[normal,'Uses models like GPT-99 Sol, Fable Future.',"Powered by SWE-2 Preview — Cognition's next-generation software engineering model",'A future unknown description',unknown];
  for(const description of descriptions){const items=[{id:'internal-mode',label:'Normal',card:{title:'GPT-6.1 Sol',description}}],snapshot=JSON.stringify(items),tree=children(renderMenu(apply(menu,result.replacements),items));assert.ok(tree.includes('GPT-6.1 Sol'));assert.ok(tree.includes(models.translateModelDescription(fusion)));assert.ok(tree.includes(models.translateModelDescription(description)??description));assert.equal(JSON.stringify(items),snapshot);}
  assert.ok(apply(menu,result.replacements).includes('card.title??fallbackTitle'));
  assert.ok(apply(menu,result.replacements).includes('onSelect:()=>onValueChange(item.id)'));
});
test('unproven capability consumers, chat cards, aliases, mutations and changed JSX fail closed',()=>{
  for(const source of [consumer.replace('onSelectActionModel','onUnknown'),consumer.replace('family.card_description','family.message'),consumer.replace('title:family.name','title:family.other'),consumer.replace('cardsEnabled:true','cardsEnabled:false')])assert.equal(capabilities({consumer:source}).replacements.length,0);
  for(const source of [
    menu+"function Chat({card}){return JSX.jsx(Card,{card,fallbackTitle:'User title'})}",
    menu+'const sharedCard=Card;',
    menu+'const sharedItem=Item;',
    menu.replace('return JSX.jsxs(\'aside\'',"card.description=readMessage();return JSX.jsxs('aside'"),
    menu.replace('children:card.description','children:readMessage(card.description)'),
    menu.replace('children:card.description','children:card.message'),
    menu.replace('card:item.card','card:item.other'),
  ])assert.equal(capabilities({menu:source}).cardDescriptions,0);
  assert.equal(capabilities({entry:entry.replace("Symbol.for('react.transitional.element')","'react.transitional.element'")}).replacements.length,0);
});
test('prepare covers the complete host target set and rejects broken contracts',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'devin-zh-host-test-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,base),{recursive:true});
  for(const [relative,source] of graph().sources)fs.writeFileSync(path.join(root,relative),source);
  fs.writeFileSync(path.join(root,H.HOST,'editor-mode-menu.js'),"import {j} from './assets/resources-random.js';export {j};");
  fs.writeFileSync(path.join(root,H.HOST,'index.js'),"import {j} from './assets/resources-random.js';export {j};");
  const discovery=H.discover(root);assert.equal(discovery.targets.length,4);assert.equal(discovery.proofFiles.length,8);
  const dictionary={human:{},str:()=>undefined,resolveI18n:(key,en)=>({'Known description':'已知说明','Hello {{name}}':'你好'}[en])};
  const result=H.prepare({root,discovery,dictionary});assert.equal(result.changes.length,4);assert.equal(result.compatibility.settingsRows,1);assert.equal(result.compatibility.workspaceDisplays,2);assert.equal(result.compatibility.fusionDescriptions,1);assert.equal(result.compatibility.cardDescriptions,1);
  const resource=result.changes.find(x=>x.relative===names.entry);assert.equal(resource.stats.hostI18n,1);assert.equal(resource.stats.rejected,1);assert.equal(resource.rejections[0].problem,'placeholder-or-markup');
  assert.ok(resource.source.includes('Hello {{name}}'));assert.ok(resource.source.includes('https://example.com/path'));
  assert.throws(()=>H.prepare({root,discovery:{...discovery,targets:discovery.targets.slice(1)},dictionary}),/target\/proof/);
  fs.writeFileSync(path.join(root,names.settings),settings.replace('JSX.jsx(Row,{','JSX.jsx(Chat,{'));
  assert.throws(()=>H.prepare({root,discovery,dictionary}),/settings display contracts/);
});
