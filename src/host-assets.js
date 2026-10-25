'use strict';
// The Desktop host is a separate, locally installed ESM app. Never execute its
// modules: prove the runtime and resource graph from syntax, then edit displays.
const fs = require('node:fs');
const path = require('node:path');
const C = require('./core');
const { resourceKind, analyzeSource } = require('./analyze');
const { factoryEvidence } = require('./runtime');
const { translationProblem } = require('./validate');
const HOST = 'out/vs/workbench/devin-webapp-host';
const FN = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const key = node => node?.type === 'Identifier' ? node.name : node?.type === 'Literal' ? String(node.value) : undefined;
const text = node => node?.type === 'Literal' && typeof node.value === 'string' ? node.value : node?.type === 'TemplateLiteral' && !node.expressions.length ? node.quasis[0].value.cooked : undefined;
const property = (node, name) => node?.type === 'ObjectExpression' ? node.properties.find(p => p.type === 'Property' && !p.computed && key(p.key) === name)?.value : undefined;
function walk(node, visit) {
  if (!node?.type) return;
  visit(node);
  for (const value of Object.values(node)) if (Array.isArray(value)) { for (const child of value) walk(child, visit); } else if (value?.type) walk(value, visit);
}
function index(source) {
  const ast = C.parser().parse(source, {ecmaVersion:'latest',sourceType:'module'});
  const scopes = new WeakMap(), parents = new WeakMap(), bindings = [], imports = [], exports = new Map(), calls = [], objects = [], assignments = [];
  const root = {parent:null,kind:'function',bindings:new Map()};
  const find = (scope,name) => { for(let current=scope;current;current=current.parent) if(current.bindings.has(name)) return current.bindings.get(name); };
  function bind(scope,id,init=null) {
    if (!id) return;
    if (id.type === 'Identifier') {
      let binding=scope.bindings.get(id.name);
      if (!binding) { binding={name:id.name,id,init,writes:[],scope}; scope.bindings.set(id.name,binding);bindings.push(binding); }
      else if(init) binding.ambiguous=true;
    } else if(id.type==='ObjectPattern') for(const p of id.properties) bind(scope,p.value||p.argument);
    else if(id.type==='AssignmentPattern') bind(scope,id.left);
    else if(id.type==='RestElement') bind(scope,id.argument);
    else if(id.type==='ArrayPattern') for(const child of id.elements) bind(scope,child);
  }
  function visit(node,scope,parent) {
    if(!node?.type)return;
    if(parent)parents.set(node,parent);
    if(node.type==='FunctionDeclaration')bind(scope,node.id,node);
    if(FN.has(node.type)){scope={parent:scope,kind:'function',bindings:new Map()};if(node.type==='FunctionExpression')bind(scope,node.id);for(const p of node.params)bind(scope,p);}
    else if(['BlockStatement','CatchClause','ForStatement','ForInStatement','ForOfStatement','SwitchStatement'].includes(node.type)){scope={parent:scope,kind:'block',bindings:new Map()};if(node.type==='CatchClause')bind(scope,node.param);}
    scopes.set(node,scope);
    if(node.type==='VariableDeclaration'){let target=scope;if(node.kind==='var')while(target.parent&&target.kind!=='function')target=target.parent;for(const declaration of node.declarations)bind(target,declaration.id,declaration.init);}
    if(node.type==='ClassDeclaration')bind(scope,node.id);
    if(node.type==='ImportDeclaration')for(const spec of node.specifiers){bind(scope,spec.local);const binding=find(scope,spec.local.name);binding.import={source:node.source.value,name:key(spec.imported)};imports.push(binding);}
    if(node.type==='AssignmentExpression'||node.type==='UpdateExpression')assignments.push(node);
    if(node.type==='CallExpression')calls.push(node);
    if(node.type==='ObjectExpression')objects.push(node);
    if(node.type==='ExportNamedDeclaration'&&!node.source)for(const spec of node.specifiers)exports.set(key(spec.exported),key(spec.local));
    for(const value of Object.values(node))if(Array.isArray(value)){for(const child of value)visit(child,scope,node);}else if(value?.type)visit(value,scope,node);
  }
  visit(ast,root);
  for(const assignment of assignments){let target=assignment.type==='UpdateExpression'?assignment.argument:assignment.left;const direct=target.type==='Identifier';while(target?.type==='MemberExpression')target=target.object;if(target?.type!=='Identifier')continue;const binding=find(scopes.get(target),target.name);if(!binding)continue;if(direct)binding.writes.push(assignment.type==='AssignmentExpression'&&assignment.operator==='='?assignment.right:null);else binding.memberWrite=true;}
  const value = binding => !binding||binding.ambiguous||binding.memberWrite||binding.writes.length>1||binding.init&&binding.writes.length ? undefined : binding.init||binding.writes[0];
  return {source,ast,scopes,parents,root,bindings,imports,exports,calls,objects,find,nodeBinding:node=>node?.type==='Identifier'?find(scopes.get(node),node.name):undefined,value};
}
function safeRelative(from, specifier) {
  if(typeof specifier!=='string'||!specifier.startsWith('./')||specifier.includes('\\')||specifier.includes('..')||/[?#:\0]/.test(specifier)||!specifier.endsWith('.js'))throw new Error('Unsupported host import: '+specifier);
  const result=path.posix.normalize(path.posix.join(path.posix.dirname(from),specifier));
  if(!result.startsWith(HOST+'/'))throw new Error('Host import escapes its directory');
  return result;
}
function read(root,relative,originals) {
  if(typeof relative!=='string'||!relative.startsWith(HOST+'/')||relative.split('/').includes('..')||/[\\?#:\0]/.test(relative))throw new Error('Invalid host path');
  if(originals?.has(relative))return originals.get(relative);
  const base=fs.realpathSync(path.join(root,HOST)),file=path.join(root,relative),actual=fs.realpathSync(file);
  if(!actual.startsWith(base+path.sep)||!fs.statSync(actual).isFile())throw new Error('Host dependency escapes installation');
  return fs.readFileSync(actual,'utf8');
}
function discover(root) {
  if(!fs.existsSync(path.join(root,HOST)))return null;
  const entry=HOST+'/editor-mode-menu.js',entryIndex=index(read(root,entry));
  const targets=new Set(),proof=new Set([entry,HOST+'/index.js']);
  for(const binding of entryIndex.imports){const relative=safeRelative(entry,binding.import.source);const source=read(root,relative);if(source.includes('Access level')&&source.includes('react.transitional.element'))targets.add(relative);}
  for(const name of fs.readdirSync(path.join(root,HOST,'assets'))){if(!name.endsWith('.js'))continue;const relative=HOST+'/assets/'+name,source=read(root,relative);if(source.includes('includeWorkspaceSettings')&&source.includes('.linkText')||source.includes('displayDescription')&&source.includes('scrollIntoView')&&source.includes('labelId')||source.includes('fusionDescription')&&source.includes('fallbackTitle')&&source.includes('cardsEnabled'))targets.add(relative);if(source.includes('card_description')&&source.includes('onCapabilityChange')&&source.includes('cardsEnabled'))proof.add(relative);}
  if(targets.size!==4)throw new Error('Unknown host resource/settings/capability layout: expected four audited modules');
  for(const relative of targets){proof.add(relative);for(const binding of index(read(root,relative)).imports){const dependency=safeRelative(relative,binding.import.source);if(binding.import.source.includes('rolldown-runtime-'))proof.add(dependency);}}
  return {targets:[...targets].sort(),proofFiles:[...proof].sort()};
}
function pureObject(node,meta,seen=new Set()) {
  if(node?.type==='Identifier'){const binding=meta.nodeBinding(node);if(!binding||seen.has(binding))throw new Error('Unresolved resource reference');const next=new Set(seen);next.add(binding);return pureObject(meta.value(binding),meta,next);}
  if(text(node)!==undefined)return text(node);
  if(node?.type==='Literal'&&['number','boolean','object'].includes(typeof node.value)&&!(node.value instanceof RegExp))return node.value;
  if(node?.type==='ArrayExpression')return node.elements.map(child=>pureObject(child,meta,seen));
  if(node?.type==='ObjectExpression'){const result=Object.create(null);for(const p of node.properties){const name=key(p.key);if(p.type!=='Property'||p.computed||p.kind!=='init'||p.method||name===undefined||name==='__proto__'||Object.hasOwn(result,name))throw new Error('Non-data resource object');result[name]=pureObject(p.value,meta,seen);}return result;}
  if(node?.type==='CallExpression'&&node.callee.type==='MemberExpression'&&!node.callee.computed&&node.callee.object.name==='JSON'&&key(node.callee.property)==='parse'&&!meta.nodeBinding(node.callee.object)&&node.arguments.length===1&&text(node.arguments[0])!==undefined)return JSON.parse(text(node.arguments[0]),(name,value)=>{if(name==='__proto__')throw new Error('Prototype property in resource');return value;});
  throw new Error('Non-static resource value');
}
function resources(meta) {
  const result=[];
  for(const object of meta.objects){if(!['manageAccess','tabs','transcript'].some(name=>property(object,name)))continue;try{const value=pureObject(object,meta);const namespace=resourceKind(value);if(namespace)result.push({node:object,value,namespace});}catch{}}
  return result;
}
function normalized(node) {
  if(Array.isArray(node))return node.map(normalized);
  if(!node||typeof node!=='object')return node;
  if(node.type==='TemplateLiteral'&&!node.expressions.length)return {type:'Literal',value:node.quasis[0].value.cooked};
  if(node.type==='ReturnStatement'&&node.argument?.type==='SequenceExpression'){
    const parts=node.argument.expressions;
    if(parts.slice(0,-1).every(n=>n.type==='AssignmentExpression'&&n.operator==='='&&n.left.type==='Identifier'&&n.right.type==='MemberExpression'&&!n.right.computed&&key(n.right.property)==='ref'&&n.right.object.type==='Identifier'))return {type:'BlockStatement',body:[...parts.slice(0,-1).map(expression=>({type:'ExpressionStatement',expression:normalized(expression)})),{type:'ReturnStatement',argument:normalized(parts.at(-1))}]};
  }
  return Object.fromEntries(Object.entries(node).map(([k,v])=>[k,normalized(v)]));
}
function commonJsWrapper(fn) {
  if(fn?.type!=='ArrowFunctionExpression'||fn.params.length!==2||fn.params.some(p=>p.type!=='Identifier')||fn.body.type!=='ArrowFunctionExpression'||fn.body.params.length)return false;
  const [factory,cache]=fn.params.map(p=>p.name),body=fn.body.body;
  const id=(n,name)=>n?.type==='Identifier'&&n.name===name;
  const member=(n,name,field)=>n?.type==='MemberExpression'&&!n.computed&&id(n.object,name)&&key(n.property)===field;
  if(body.type!=='SequenceExpression'||body.expressions.length!==2||!member(body.expressions[1],cache,'exports'))return false;
  const guard=body.expressions[0],sequence=guard.right;
  if(guard.type!=='LogicalExpression'||guard.operator!=='||'||!id(guard.left,cache)||sequence.type!=='SequenceExpression'||sequence.expressions.length!==2)return false;
  const [invoke,clear]=sequence.expressions;
  if(invoke.type!=='CallExpression'||!id(invoke.callee,factory)||invoke.arguments.length!==2||!id(invoke.arguments[1],cache)||clear.type!=='AssignmentExpression'||clear.operator!=='='||!id(clear.left,factory)||clear.right.type!=='Literal'||clear.right.value!==null)return false;
  const argument=invoke.arguments[0],assignment=argument?.object,container=assignment?.right;
  return argument?.type==='MemberExpression'&&!argument.computed&&key(argument.property)==='exports'&&assignment?.type==='AssignmentExpression'&&assignment.operator==='='&&id(assignment.left,cache)&&container?.type==='ObjectExpression'&&container.properties.length===1&&property(container,'exports')?.type==='ObjectExpression'&&property(container,'exports').properties.length===0;
}
function runtimeExports(relative,metas) {
  const meta=metas.get(relative),getters=new Map();
  function wrappedFactory(init){if(init?.type!=='CallExpression'||init.arguments.length!==1||init.callee.type!=='Identifier')return;const binding=meta.nodeBinding(init.callee),imported=binding?.import;if(!imported||binding.writes.length||binding.memberWrite||binding.ambiguous)return;const dependency=metas.get(safeRelative(relative,imported.source));if(!dependency)return;const exported=dependency.root.bindings.get(dependency.exports.get(imported.name));if(commonJsWrapper(dependency.value(exported)))return init.arguments[0];}
  for(const binding of meta.bindings){const factory=wrappedFactory(meta.value(binding));if(!FN.has(factory?.type))continue;
    if(factory.params.length===1&&factory.params[0].type==='Identifier'){const candidate=normalized(factory);candidate.params=[{type:'Identifier',name:'__devinZhUnusedModule'},...candidate.params];if(factoryEvidence(candidate)==='jsx')getters.set(binding,'jsx');}
  }
  let changed=true;while(changed){changed=false;for(const binding of meta.bindings){if(getters.has(binding))continue;const factory=wrappedFactory(meta.value(binding));if(!FN.has(factory?.type)||factory.params.length!==2||factory.params.some(p=>p.type!=='Identifier')||factory.body.type!=='BlockStatement'||factory.body.body.length!==1)continue;const assignment=factory.body.body[0].expression,call=assignment?.right;if(assignment?.type!=='AssignmentExpression'||assignment.operator!=='='||assignment.left.type!=='MemberExpression'||assignment.left.computed||assignment.left.object.name!==factory.params[1].name||key(assignment.left.property)!=='exports'||call?.type!=='CallExpression'||call.arguments.length||call.callee.type!=='Identifier')continue;const kind=getters.get(meta.nodeBinding(call.callee));if(kind){getters.set(binding,kind);changed=true;}}}
  return new Map([...meta.exports].flatMap(([name,local])=>{const kind=getters.get(meta.root.bindings.get(local));return kind?[[name,kind]]:[];}));
}
function runtimeBindings(relative,meta,exportsByFile) {
  const proven=new Map();
  for(const binding of meta.bindings){const init=meta.value(binding);if(init?.type!=='CallExpression'||init.arguments.length||init.callee.type!=='Identifier')continue;const callee=meta.nodeBinding(init.callee),imported=callee?.import;if(!imported||callee.writes.length||callee.memberWrite||callee.ambiguous)continue;const kind=exportsByFile.get(safeRelative(relative,imported.source))?.get(imported.name);if(kind)proven.set(binding.id.start,kind);}
  return proven;
}
function wrapper(expression,table,array=false,rules=[]) {
  const entries=Object.entries(table).filter(([en,zh])=>typeof zh==='string'&&en!==zh&&!translationProblem(en,zh));
  const patterns=rules.map(rule=>[rule.pattern.source,rule.pattern.flags,rule.replacement]);
  const ruleCode=patterns.length?`for(const [__p,__f,__r] of ${JSON.stringify(patterns)}){const __re=new RegExp(__p,__f);if(__re.test(__v))return __v.replace(__re,__r);}`:'';
  const translate=`__v=>{if(typeof __v!=="string")return __v;const __m=${JSON.stringify(entries)}.find(__p=>__p[0]===__v);if(__m)return __m[1];${ruleCode}return __v;}`;
  return array?`(__a=>Array.isArray(__a)?__a.map(${translate}):__a)(${expression})`:`(${translate})(${expression})`;
}
function applyReplacements(source,replacements) {
  replacements.sort((a,b)=>a.start-b.start);let cursor=0,result='';
  for(const item of replacements){if(item.start<cursor)throw new Error('Overlapping host translations');result+=source.slice(cursor,item.start)+item.value;cursor=item.end;}
  return result+source.slice(cursor);
}
function prepare({root,originals,dictionary=C.loadDict(),discovery=discover(root)}={}) {
  if(!discovery)return {changes:[],compatibility:{compatible:true,host:false},stats:{}};
  if(discovery.targets.length!==4||new Set(discovery.targets).size!==4||discovery.targets.some(file=>!discovery.proofFiles.includes(file)))throw new Error('Incomplete host target/proof set');
  const metas=new Map(discovery.proofFiles.map(relative=>[relative,index(read(root,relative,originals))]));
  const exportsByFile=new Map([...metas].map(([relative])=>[relative,runtimeExports(relative,metas)]));
  if(![...exportsByFile.values()].some(exports=>exports.size))throw new Error('Could not prove the host JSX runtime');
  const tables=C.readJson(C.dataFile('settings-display.zh.json')),changes=[],namespaces=new Set();let settingsRows=0,workspaceDisplays=0,resourceBlocks=0,capabilityMenus=0,fusionDescriptions=0,cardDescriptions=0,settingOptions=0,toggleLabels=0,sectionHeaders=0;
  const optionTable=Object.fromEntries(['Low','Medium','High','Off'].map(en=>[en,dictionary.str(en)??tables[en]]));
  for(const relative of discovery.targets){const meta=metas.get(relative),replacements=[],rejections=[];let translated=0;
    for(const block of resources(meta)){resourceBlocks++;namespaces.add(block.namespace);const [value,count]=C.mapLeaves(block.value,(key,en)=>{const english=C.isEnglish(en),reviewed=!english&&Object.hasOwn(dictionary.human||{},en)&&typeof dictionary.human[en]==='string';if(!english&&!reviewed)return;const zh=reviewed?dictionary.human[en]:dictionary.resolveI18n(key,en);if(zh===undefined||zh===en)return;const problem=translationProblem(en,zh);if(problem){rejections.push({kind:'host-i18n',key,problem});return;}return zh;});if(count){replacements.push({start:block.node.start,end:block.node.end,value:JSON.stringify(value)});translated+=count;}}
    let source=applyReplacements(meta.source,replacements);
    const analyze=source=>{const current=index(source);return analyzeSource(source,{acorn:C.parser(),provenRuntimeBindings:runtimeBindings(relative,current,exportsByFile)});};
    const originalAnalysis=analyze(meta.source);settingsRows+=originalAnalysis.stats.settingsRows;
    const patched=require('./patch').patchSource(source,dictionary,undefined,{analyze});
    source=patched.source;
    // Workspace-provided labels are rendered through the already proven setting
    // row. Description arrays and link labels require their own narrow contract.
    const workspace=workspaceDescriptions(relative,index(source),exportsByFile,tables,metas);
    workspaceDisplays+=workspace.replacements.length;
    source=applyReplacements(source,workspace.replacements);
    const dropdown=settingsDropdownDisplays(relative,index(source),exportsByFile,optionTable,metas);
    settingOptions+=dropdown.replacements.length;source=applyReplacements(source,[...dropdown.captures,...dropdown.replacements]);
    const capability=capabilityDescriptions(relative,index(source),exportsByFile,metas,dictionary);
    capabilityMenus+=capability.menus;fusionDescriptions+=capability.fusionDescriptions;cardDescriptions+=capability.cardDescriptions;toggleLabels+=capability.toggleLabels;sectionHeaders+=capability.sectionHeaders;
    source=applyReplacements(source,capability.replacements);
    const syntax=C.checkSyntax(source);if(syntax)throw new Error('Invalid generated host asset: '+syntax);
    changes.push({relative,source,stats:{...patched.stats,rejected:patched.stats.rejected+rejections.length,hostI18n:translated,workspaceDisplays:workspace.replacements.length,settingOptions:dropdown.replacements.length,capabilityDisplays:capability.replacements.length},rejections:[...rejections,...patched.rejections],compatibility:{compatible:true,host:true,settingsRows:originalAnalysis.stats.settingsRows,workspaceDisplays:workspace.replacements.length,settingOptions:dropdown.replacements.length,capabilityMenus:capability.menus,fusionDescriptions:capability.fusionDescriptions,cardDescriptions:capability.cardDescriptions,toggleLabels:capability.toggleLabels,sectionHeaders:capability.sectionHeaders,runtimeProven:true}});
  }
  if(!namespaces.has('translation')||!namespaces.has('review')||resourceBlocks!==2)throw new Error('Host English resources are not recognized');
  if(settingsRows!==1||workspaceDisplays!==2)throw new Error('Host settings display contracts are not recognized');
  if(capabilityMenus!==1||fusionDescriptions!==1||cardDescriptions!==1)throw new Error('Host capability description contracts are not recognized');
  if(settingOptions!==2||toggleLabels!==1||sectionHeaders!==1)throw new Error('Host settings option or capability label contracts are not recognized');
  return {changes,compatibility:{compatible:true,host:true,namespaces:[...namespaces],settingsRows,workspaceDisplays,settingOptions,capabilityMenus,fusionDescriptions,cardDescriptions,toggleLabels,sectionHeaders},stats:{files:changes.length,resourceBlocks,settingsRows,workspaceDisplays,settingOptions,capabilityMenus,fusionDescriptions,cardDescriptions,toggleLabels,sectionHeaders}};
}
// The workspace bridge returns data also used for settings search and updates.
// Translate its description only at the proven row's pure formatting call.
function workspaceDescriptions(relative,meta,exportsByFile,tables,metas) {
  const bindings=runtimeBindings(relative,meta,exportsByFile),rows=new Set(),replacements=[];
  const isRender=(node,tag)=>{
    const callee=node?.callee?.type==='SequenceExpression'?node.callee.expressions.at(-1):node?.callee;
    return node?.type==='CallExpression'&&callee?.type==='MemberExpression'&&!callee.computed&&['jsx','jsxs'].includes(key(callee.property))&&bindings.get(meta.nodeBinding(callee.object)?.id.start)==='jsx'&&(!tag||text(node.arguments[0])===tag);
  };
  for(const imported of meta.imports){const dependency=safeRelative(relative,imported.import.source),other=metas.get(dependency);if(!other)continue;const fn=other.value(other.root.bindings.get(other.exports.get(imported.import.name)));if(!FN.has(fn?.type))continue;
    const params=fn.params[0];if(params?.type!=='ObjectPattern'||!['label','description','displayLabel','displayDescription','labelId','children'].every(name=>params.properties.some(p=>key(p.key)===name)))continue;
    const analysis=analyzeSource(other.source,{acorn:C.parser(),provenRuntimeBindings:runtimeBindings(dependency,other,exportsByFile)});
    if(analysis.stats.settingsRows&&analysis.display.filter(node=>node.kind==='settings'&&node.index>fn.start&&node.index<fn.end).length>=2)rows.add(imported);
  }
  const identical=(node,parameter)=>node?.type==='Identifier'&&meta.nodeBinding(node)===meta.nodeBinding(parameter);
  function pureFormatter(fn){
    if(!FN.has(fn?.type)||fn.params.length!==3||fn.params.some(p=>p.type!=='Identifier')||fn.body.type!=='BlockStatement'||fn.body.body.length!==2)return false;
    if(fn.params.some(p=>{const b=meta.nodeBinding(p);return !b||b.writes.length||b.memberWrite;}))return false;
    const [declaration,returned]=fn.body.body;
    if(declaration.type!=='VariableDeclaration'||declaration.declarations.length!==1||returned.type!=='ReturnStatement')return false;
    const joined=declaration.declarations[0],join=joined.init,conditional=returned.argument;
    if(joined.id.type!=='Identifier'||join?.type!=='CallExpression'||join.arguments.length!==1||text(join.arguments[0])!==' '||join.callee.type!=='MemberExpression'||join.callee.computed||key(join.callee.property)!=='join'||!identical(join.callee.object,fn.params[0]))return false;
    const joinedBinding=meta.nodeBinding(joined.id);if(joinedBinding.writes.length||joinedBinding.memberWrite)return false;
    if(conditional?.type!=='ConditionalExpression'||!identical(conditional.test,fn.params[1])||!identical(conditional.alternate,joined.id)||!isRender(conditional.consequent,'span'))return false;
    const span=conditional.consequent.arguments[1],children=property(span,'children');
    if(span?.properties.length!==1||children?.type!=='ArrayExpression'||children.elements.length!==3||!identical(children.elements[0],joined.id)||text(children.elements[1])!==' '||!isRender(children.elements[2],'a'))return false;
    const anchor=children.elements[2].arguments[1];
    if(!identical(property(anchor,'href'),fn.params[2])||!identical(property(anchor,'children'),fn.params[1]))return false;
    return anchor.properties.every(p=>p.type==='Property'&&!p.computed&&!p.method&&p.kind==='init'&&(['href','children'].includes(key(p.key))||['className','target','rel'].includes(key(p.key))&&text(p.value)!==undefined));
  }
  for(const call of meta.calls){
    if(!isRender(call)||!rows.has(meta.nodeBinding(call.arguments[0])))continue;
    const props=call.arguments[1],description=property(props,'description'),descriptionBinding=meta.nodeBinding(description),format=meta.value(descriptionBinding);
    if(!descriptionBinding||format?.type!=='CallExpression'||format.arguments.length!==3||!pureFormatter(meta.value(meta.nodeBinding(format.callee))))continue;
    let owner=meta.parents.get(call);while(owner&&!FN.has(owner.type))owner=meta.parents.get(owner);
    const pattern=owner?.params[0],setting=pattern?.type==='ObjectPattern'?pattern.properties.find(p=>key(p.key)==='setting')?.value:undefined;
    if(setting?.type!=='Identifier')continue;
    const settingBinding=meta.nodeBinding(setting);if(!settingBinding||settingBinding.writes.length||settingBinding.memberWrite)continue;
    const field=(node,name)=>node?.type==='MemberExpression'&&!node.computed&&key(node.property)===name&&meta.nodeBinding(node.object)===settingBinding;
    if(!field(property(props,'id'),'id')||!field(property(props,'label'),'label')||!format.arguments.every((node,i)=>field(node,['description','linkText','linkUrl'][i])))continue;
    // The formatted result must have no non-display consumers.
    let isolated=true;walk(owner.body,node=>{if(node.type==='Identifier'&&meta.nodeBinding(node)===descriptionBinding&&node!==descriptionBinding.id&&node!==description)isolated=false;});if(!isolated)continue;
    for(const [i,array] of [[0,true],[1,false]]){const argument=format.arguments[i];replacements.push({start:argument.start,end:argument.end,value:wrapper(meta.source.slice(argument.start,argument.end),tables,array)});}
  }
  return {replacements};
}
// Translate the two display projections of native setting choices. The source
// options (including values and unavailable state) remain byte-for-byte intact.
function settingsDropdownDisplays(relative,meta,exportsByFile,table,metas) {
  const runtime=runtimeBindings(relative,meta,exportsByFile),rows=new Set(),replacements=[],captures=[],identifiers=new Set();
  walk(meta.ast,node=>{if(node.type==='Identifier')identifiers.add(node.name);});
  const stable=b=>b&&!b.ambiguous&&!b.memberWrite&&!b.writes.length;
  const isRender=node=>{const callee=node?.callee?.type==='SequenceExpression'?node.callee.expressions.at(-1):node?.callee;return node?.type==='CallExpression'&&callee?.type==='MemberExpression'&&!callee.computed&&['jsx','jsxs'].includes(key(callee.property))&&runtime.get(meta.nodeBinding(callee.object)?.id.start)==='jsx';};
  const member=(node,binding,name)=>node?.type==='MemberExpression'&&!node.computed&&key(node.property)===name&&stable(binding)&&meta.nodeBinding(node.object)===binding;
  const ownerOf=node=>{let owner=meta.parents.get(node);while(owner&&!FN.has(owner.type))owner=meta.parents.get(owner);return owner;};
  for(const imported of meta.imports){const dependency=safeRelative(relative,imported.import.source),other=metas.get(dependency);if(!other)continue;const fn=other.value(other.root.bindings.get(other.exports.get(imported.import.name)));if(!FN.has(fn?.type)||fn.params[0]?.type!=='ObjectPattern'||!['label','description','displayLabel','displayDescription','labelId','children'].every(name=>fn.params[0].properties.some(p=>key(p.key)===name)))continue;const a=analyzeSource(other.source,{acorn:C.parser(),provenRuntimeBindings:runtimeBindings(dependency,other,exportsByFile)});if(a.stats.settingsRows&&a.display.filter(n=>n.kind==='settings'&&n.index>fn.start&&n.index<fn.end).length>=2)rows.add(imported);}
  const memoBody=call=>{const callee=call?.callee?.type==='SequenceExpression'?call.callee.expressions.at(-1):call?.callee;return call?.type==='CallExpression'&&callee?.type==='MemberExpression'&&!callee.computed&&key(callee.property)==='useMemo'&&call.arguments.length===2&&FN.has(call.arguments[0]?.type)&&call.arguments[0].params.length===0?call.arguments[0].body:undefined;};
  function fromOptions(binding,setting){
    const body=memoBody(meta.value(binding));if(!body)return false;let found=false;
    walk(body,node=>{if(node.type!=='ForOfStatement'||!member(node.right,setting,'options')||node.left.type!=='VariableDeclaration'||node.left.declarations.length!==1)return;const option=meta.nodeBinding(node.left.declarations[0].id);walk(node.body,value=>{if(value.type!=='ObjectExpression')return;const call=meta.parents.get(value);if(call?.type==='CallExpression'&&call.callee.type==='MemberExpression'&&key(call.callee.property)==='push'&&member(property(value,'label'),option,'label')&&meta.nodeBinding(property(value,'original'))===option&&property(value,'value'))found=true;});});return found;
  }
  for(const row of meta.calls){
    if(!isRender(row)||!rows.has(meta.nodeBinding(row.arguments[0])))continue;
    const owner=ownerOf(row),pattern=owner?.params[0],settingNode=pattern?.type==='ObjectPattern'?pattern.properties.find(p=>key(p.key)==='setting')?.value:null,setting=meta.nodeBinding(settingNode),props=row.arguments[1],dropdown=property(props,'children');
    if(owner?.body?.type!=='BlockStatement'||settingNode?.type!=='Identifier'||!stable(setting)||!member(property(props,'id'),setting,'id')||!member(property(props,'label'),setting,'label')||!isRender(dropdown)||!['value','onValueChange','items','children'].every(name=>property(dropdown.arguments[1],name)))continue;
    const projected=property(dropdown.arguments[1],'items'),projection=meta.nodeBinding(projected),map=memoBody(meta.value(projection));
    if(!stable(projection)||map?.type!=='CallExpression'||map.callee.type!=='MemberExpression'||map.callee.computed||key(map.callee.property)!=='map'||map.arguments.length!==1)continue;
    let isolated=true;walk(owner.body,node=>{if(node.type==='Identifier'&&meta.nodeBinding(node)===projection&&node!==projection.id&&node!==projected)isolated=false;});if(!isolated)continue;
    const source=meta.nodeBinding(map.callee.object),fn=map.arguments[0],patternMap=fn?.params?.[0],out=fn?.body;
    if(!stable(source)||!fromOptions(source,setting)||!FN.has(fn?.type)||fn.params.length!==1||patternMap?.type!=='ObjectPattern'||patternMap.properties.length!==2||out?.type!=='ObjectExpression'||out.properties.length!==2)continue;
    const input=new Map(patternMap.properties.map(p=>[key(p.key),meta.nodeBinding(p.value)]));
    if(!['value','label'].every(name=>stable(input.get(name))&&meta.nodeBinding(property(out,name))===input.get(name)))continue;
    const labelProperty=out.properties.find(p=>key(p.key)==='label');const positions=[];
    for(const candidate of meta.calls){if(!isRender(candidate)||candidate.start<dropdown.start||candidate.end>dropdown.end)continue;const shown=property(candidate.arguments[1],'children');if(shown?.type!=='MemberExpression')continue;
      const callback=ownerOf(candidate),call=meta.parents.get(callback),option=callback?.params?.[0];
      if(callback?.type==='ArrowFunctionExpression'&&callback.params.length===1&&member(shown,meta.nodeBinding(option),'label')&&call?.type==='CallExpression'&&call.callee.type==='MemberExpression'&&key(call.callee.property)==='map'&&meta.nodeBinding(call.callee.object)===source&&call.arguments[0]===callback)positions.push(shown);
    }
    if(positions.length!==1)continue;
    // Minifiers reuse the setting parameter name inside both map callbacks.
    // Capture the proven outer object under an unused name before entering them.
    let suffix=0,capture;do{capture='__devinZhSetting'+suffix++;}while(identifiers.has(capture));identifiers.add(capture);
    let insertion=owner.body.start+1;for(const statement of owner.body.body){if(!statement.directive)break;insertion=statement.end;}
    captures.push({start:insertion,end:insertion,value:`;const ${capture}=${settingNode.name};`});
    const guard=`["supercompleteAggression","completionMode"].includes(${capture}.id)`;
    const add=(node,prefix='')=>{const expression=meta.source.slice(node.start,node.end);replacements.push({start:node.start,end:node.end,value:prefix+`(${guard}?${wrapper(expression,table)}:${expression})`});};
    add(labelProperty.value,labelProperty.shorthand?'label:':'');add(positions[0]);
  }
  return {replacements,captures};
}
// The host's capability cards now receive server-provided card_description data.
// Prove the imported picker, its local item/card render chain and its two text
// outlets; never rewrite model records, titles, selection values or callbacks.
function capabilityDescriptions(relative,meta,exportsByFile,metas,dictionary=C.loadDict()) {
  const stable=b=>b&&!b.ambiguous&&!b.memberWrite&&!b.writes.length;
  const params=fn=>{
    if(!FN.has(fn?.type)||fn.params.length!==1||fn.params[0].type!=='ObjectPattern')return new Map();
    return new Map(fn.params[0].properties.filter(p=>p.type==='Property'&&!p.computed).map(p=>[key(p.key),p.value.type==='AssignmentPattern'?p.value.left:p.value]));
  };
  const has=(fn,names)=>names.every(name=>params(fn).has(name));
  const owns=(fn,node)=>node.start>fn.body.start&&node.end<fn.body.end;
  const functionOf=(m,node)=>{const value=m.value(m.nodeBinding(node));return FN.has(value?.type)?value:null;};
  const ownerOf=(m,node)=>{let owner=m.parents.get(node);while(owner&&!FN.has(owner.type))owner=m.parents.get(owner);return owner;};
  const renderer=(file,m)=>{
    const runtime=runtimeBindings(file,m,exportsByFile);
    return (node,tag)=>{const callee=node?.callee?.type==='SequenceExpression'?node.callee.expressions.at(-1):node?.callee;return node?.type==='CallExpression'&&callee?.type==='MemberExpression'&&!callee.computed&&['jsx','jsxs'].includes(key(callee.property))&&runtime.get(m.nodeBinding(callee.object)?.id.start)==='jsx'&&(!tag||text(node.arguments[0])===tag);};
  };
  const field=(m,node,binding,name)=>node?.type==='MemberExpression'&&!node.computed&&key(node.property)===name&&node.object.type==='Identifier'&&stable(binding)&&m.nodeBinding(node.object)===binding;
  function metadataDescription(m,node,seen=new Set()){
    if(node?.type==='Identifier'){const binding=m.nodeBinding(node);if(!binding||seen.has(binding))return false;return metadataDescription(m,m.value(binding),new Set([...seen,binding]));}
    if(node?.type==='LogicalExpression'&&node.operator==='??')return metadataDescription(m,node.left,seen)&&(metadataDescription(m,node.right,seen)||text(node.right)==='');
    return field(m,node,m.nodeBinding(node?.object),'card_description');
  }
  function itemProducer(m,node){
    const binding=m.nodeBinding(node),map=m.value(binding);
    if(!stable(binding)||map?.type!=='CallExpression'||map.callee.type!=='MemberExpression'||map.callee.computed||key(map.callee.property)!=='map'||map.arguments.length!==1||!FN.has(map.arguments[0]?.type))return false;
    let found=false;walk(map.arguments[0].body,statement=>{
      if(statement.type!=='ReturnStatement'||statement.argument?.type!=='ObjectExpression')return;
      const item=statement.argument,raw=property(item,'card'),card=raw?.type==='ConditionalExpression'?raw.consequent:raw;
      if(!['id','label','selectedValues'].every(name=>property(item,name))||card?.type!=='ObjectExpression'||!property(card,'title'))return;
      if(m.source.slice(property(item,'label').start,property(item,'label').end)!==m.source.slice(property(card,'title').start,property(card,'title').end))return;
      if(metadataDescription(m,property(card,'description')))found=true;
    });return found;
  }
  const roots=new Set();
  for(const [file,consumer]of metas){if(file===relative)continue;const isRender=renderer(file,consumer);
    for(const call of consumer.calls){
      if(!isRender(call))continue;const imported=consumer.nodeBinding(call.arguments[0]);
      if(!stable(imported)||!imported.import||safeRelative(file,imported.import.source)!==relative)continue;
      const root=meta.value(meta.root.bindings.get(meta.exports.get(imported.import.name)));
      if(!has(root,['fusion','items','value','onValueChange','cardsEnabled','labels']))continue;
      const consumerFn=ownerOf(consumer,call),props=call.arguments[1],items=property(props,'items');
      const enabled=property(props,'cardsEnabled'),cardsEnabled=enabled?.type==='Literal'&&enabled.value===true||enabled?.type==='UnaryExpression'&&enabled.operator==='!'&&enabled.argument.type==='Literal'&&enabled.argument.value===0;
      if(!has(consumerFn,['menu','onCapabilityChange','onSelectActionModel','modeSlot'])||!cardsEnabled||!property(props,'value')||!property(props,'onValueChange'))continue;
      if(consumer.nodeBinding(property(props,'modeSlot'))!==consumer.nodeBinding(params(consumerFn).get('modeSlot')))continue;
      if(items?.type!=='ArrayExpression'||!items.elements.some(item=>item?.type==='SpreadElement'&&itemProducer(consumer,item.argument)))continue;
      roots.add(root);
    }
  }
  const isRender=renderer(relative,meta),replacements=[],positions=new Set(),models=require('./model-translations');let fusionDescriptions=0,cardDescriptions=0,toggleLabels=0,sectionHeaders=0;
  const exclusiveRenderer=(binding,owner)=>{let exclusive=!!binding;walk(meta.ast,node=>{if(node.type!=='Identifier'||node===binding?.id||meta.nodeBinding(node)!==binding)return;const parent=meta.parents.get(node);if(!isRender(parent)||parent.arguments[0]!==node||!owns(owner,parent))exclusive=false;});return exclusive;};
  const add=(node,table=models.descriptions,rules=models.rules)=>{if(positions.has(node.start))return false;positions.add(node.start);replacements.push({start:node.start,end:node.end,value:wrapper(meta.source.slice(node.start,node.end),table,false,rules)});return true;};
  function sectionGroupFactory(fn,source){
    if(!FN.has(fn?.type)||fn.params.length!==1||fn.params[0].type!=='Identifier')return false;
    const input=meta.nodeBinding(fn.params[0]);let matches=false;
    walk(fn.body,node=>{if(node.type!=='ForOfStatement'||meta.nodeBinding(node.right)!==input||node.left.type!=='VariableDeclaration'||node.left.declarations.length!==1)return;
      const item=meta.nodeBinding(node.left.declarations[0].id);walk(node.body,value=>{if(value.type!=='ObjectExpression'||value.properties.length!==2)return;
        const spread=value.properties.find(p=>p.type==='SpreadElement'),members=property(value,'items'),section=meta.value(meta.nodeBinding(spread?.argument));
        if(field(meta,section,item,'section')&&members?.type==='ArrayExpression'&&members.elements.length===1&&meta.nodeBinding(members.elements[0])===item)matches=true;
      });
    });return matches&&source?.type==='Identifier';
  }
  for(const root of roots){
    const rootParams=params(root),labels=meta.nodeBinding(rootParams.get('labels')),items=new Set();
    for(const call of meta.calls){if(!owns(root,call)||!isRender(call))continue;
      const shown=property(call.arguments[1],'children'),merge=shown?.type==='MemberExpression'&&meta.value(meta.nodeBinding(shown.object));
      if(isRender(call,'span')&&key(shown?.property)==='fusionDescription'&&!shown.computed&&merge?.type==='ObjectExpression'&&merge.properties.length===2&&merge.properties.every(p=>p.type==='SpreadElement')){
        const [defaults,override]=merge.properties.map(p=>p.argument),data=meta.value(meta.nodeBinding(defaults));
        if(stable(labels)&&meta.nodeBinding(override)===labels&&['fusionDescription','capability','speed'].every(name=>text(property(data,name))!==undefined)&&add(shown))fusionDescriptions++;
      }
      if(isRender(call,'span')&&shown?.type==='MemberExpression'&&!shown.computed&&key(shown.property)==='label'){
        const callback=ownerOf(meta,call),map=meta.parents.get(callback),section=callback?.params[0],list=map?.callee?.object,group=meta.value(meta.nodeBinding(list));
        if(callback?.type==='ArrowFunctionExpression'&&callback.params.length===1&&section?.type==='Identifier'&&field(meta,shown,meta.nodeBinding(section),'label')&&map?.type==='CallExpression'&&key(map.callee.property)==='map'&&map.arguments[0]===callback&&group?.type==='CallExpression'&&group.arguments.length===1&&meta.nodeBinding(group.arguments[0])===meta.nodeBinding(rootParams.get('items'))&&sectionGroupFactory(functionOf(meta,group.callee),group.arguments[0])&&add(shown,{Previews:dictionary.str('Previews')},[]))sectionHeaders++;
      }
      const component=functionOf(meta,call.arguments[0]);if(has(component,['item','selected','speed','checkSide','cardsEnabled','onSelect'])&&exclusiveRenderer(meta.nodeBinding(call.arguments[0]),root))items.add(component);
    }
    for(const item of items){const itemBinding=meta.nodeBinding(params(item).get('item'));if(!stable(itemBinding))continue;
      for(const call of meta.calls){if(!owns(item,call)||!isRender(call))continue;const cardFn=functionOf(meta,call.arguments[0]),props=call.arguments[1];
        if(has(cardFn,['label','checked','disabled','disabledTooltip','onToggle'])){
          const callback=ownerOf(meta,call),map=meta.parents.get(callback),option=callback?.params[0],toggles=map?.callee?.object,card=toggles?.object,optionBinding=meta.nodeBinding(option),label=property(props,'label');
          const labelBinding=meta.nodeBinding(params(cardFn).get('label')),labelReads=[];walk(cardFn.body,node=>{if(node.type==='Identifier'&&meta.nodeBinding(node)===labelBinding)labelReads.push(node);});
          const displayOnly=stable(labelBinding)&&labelReads.length===1&&meta.parents.get(labelReads[0])?.type==='Property'&&key(meta.parents.get(labelReads[0]).key)==='children'&&meta.calls.some(output=>owns(cardFn,output)&&isRender(output,'span')&&property(output.arguments[1],'children')===labelReads[0]);
          if(displayOnly&&callback?.type==='ArrowFunctionExpression'&&callback.params.length===1&&map?.type==='CallExpression'&&map.arguments[0]===callback&&key(map.callee.property)==='map'&&toggles?.type==='MemberExpression'&&!toggles.computed&&key(toggles.property)==='toggles'&&field(meta,card,itemBinding,'card')&&field(meta,label,optionBinding,'label')&&field(meta,property(props,'checked'),optionBinding,'checked')&&field(meta,property(props,'onToggle'),optionBinding,'onCheckedChange')&&add(label,models.descriptions,[]))toggleLabels++;
        }
        if(!has(cardFn,['card','fallbackTitle'])||params(cardFn).size!==2||!field(meta,property(props,'card'),itemBinding,'card')||!field(meta,property(props,'fallbackTitle'),itemBinding,'label'))continue;
        const cardBinding=meta.nodeBinding(params(cardFn).get('card')),fallback=meta.nodeBinding(params(cardFn).get('fallbackTitle'));
        if(!stable(cardBinding)||!stable(fallback))continue;
        // A reusable chat renderer must not inherit this capability-only rule.
        const target=meta.nodeBinding(call.arguments[0]);
        if(!exclusiveRenderer(target,item))continue;
        const outputs=meta.calls.filter(output=>owns(cardFn,output)&&isRender(output,'span'));
        const hasTitle=outputs.some(output=>{const value=property(output.arguments[1],'children');return value?.type==='LogicalExpression'&&value.operator==='??'&&field(meta,value.left,cardBinding,'title')&&meta.nodeBinding(value.right)===fallback;});
        if(!hasTitle)continue;
        for(const output of outputs){const value=property(output.arguments[1],'children');if(field(meta,value,cardBinding,'description')&&add(value))cardDescriptions++;}
      }
    }
  }
  return {replacements,menus:roots.size,fusionDescriptions,cardDescriptions,toggleLabels,sectionHeaders};
}
module.exports={HOST,discover,prepare,index,resources,safeRelative,commonJsWrapper,runtimeExports,runtimeBindings,workspaceDescriptions,settingsDropdownDisplays,capabilityDescriptions};
