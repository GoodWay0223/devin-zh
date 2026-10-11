const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),crypto=require('node:crypto');
const {FILES}=require('../src/install');
const {operate,createRunner}=require('../scripts/gui-backend');

function fixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'devin-gui-backend-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const projectDir=path.join(dir,'tool with spaces'),root=path.join(dir,'Devin','resources','app');
  fs.mkdirSync(projectDir,{recursive:true});
  const origin=path.resolve(__dirname,'..');
  for (const name of ['src','data']) fs.cpSync(path.join(origin,name),path.join(projectDir,name),{recursive:true});
  fs.cpSync(path.join(origin,'node_modules/acorn'),path.join(projectDir,'node_modules/acorn'),{recursive:true});
  fs.copyFileSync(path.join(origin,'package.json'),path.join(projectDir,'package.json'));
  const text=`const en=JSON.parse('{"manageAccess":{"accessLevel":"Access level","add":"Add","done":"Done"}}');
    const review=JSON.parse('{"tabs":{"changes":"Changes","bugs":"Bugs","description":"Description"}}');
    var modules={1(module,exports,webpackRequire){const JSX=require("react/jsx-runtime");JSX.jsx("button",{children:"Cancel"});}};`;
  const sources=new Map([[FILES[0],text],[FILES[1],text+'\n'],[FILES[2],'globalThis._VSCODE_NLS_MESSAGES=["Copy"];'],[FILES[3],'["Copy"]']]);
  function write(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value);}
  for(const [file,source]of sources)write(path.join(root,file),source);
  write(path.join(root,'out/nls.keys.json'),'[["module",["copy"]]]');
  write(path.join(root,'package.json'),' {"version":"1.126.0"}');
  write(path.join(root,'product.json'),JSON.stringify({version:'1.126.0',windsurfVersion:'test-build',commit:'fixture',checksums:Object.fromEntries([...sources].map(([file,source])=>[file.replace(/^out\//,''),crypto.createHash('sha256').update(source).digest('base64')]))}));
  write(path.join(projectDir,'cache/zh/extension/package.json'),' {"name":"vscode-language-pack-zh-hans","publisher":"MS-CEINTL","version":"1.126.0"}');
  write(path.join(projectDir,'cache/zh/extension/translations/main.i18n.json'),' {"contents":{"module":{"copy":"复制"}}}');
  return {projectDir,root,sources};
}
test('GUI detection reads the selected installation without downloading or modifying app files',async t=>{
  const {projectDir,root,sources}=fixture(t),events=[];
  const result=await operate({command:'detect',root},{projectDir,emit:e=>events.push(e),log:()=>{}});
  assert.equal(result.type,'detected');assert.equal(result.installations[0].root,root);
  assert.equal(fs.existsSync(path.join(projectDir,'.devin-zh.local.json')),false);
  for(const [file,source]of sources)assert.equal(fs.readFileSync(path.join(root,file),'utf8'),source);
});
test('complete GUI preparation finds the pack automatically, streams genuine steps, and leaves app files untouched',async t=>{
  const {projectDir,root,sources}=fixture(t),events=[];
  const result=await operate({command:'prepare',root,scope:'all'},{projectDir,emit:e=>events.push(e),log:()=>{}});
  assert.equal(result.type,'prepared');assert.equal(result.scope,'all');assert.equal(result.files.length,4);
  const counted=events.filter(e=>e.unit==='steps');
  assert.ok(counted.some(e=>e.message.includes('编辑器菜单')));
  assert.equal(counted.at(-1).completed,5);assert.equal(counted.at(-1).total,5);
  for(let i=0;i<counted.length;i++){assert.ok(counted[i].completed<=counted[i].total);if(i)assert.ok(counted[i].completed>=counted[i-1].completed);}
  const nls=result.files.find(f=>f.relative==='out/nls.messages.json');assert.equal(nls.stats.translated,1);
  for(const [file,source]of sources)assert.equal(fs.readFileSync(path.join(root,file),'utf8'),source);
});
test('GUI runner cancellation stops its own preparation child without a completion result',async()=>{
  const abort=new AbortController(),run=createRunner({emit:()=>{},log:()=>{},signal:abort.signal});
  const job=run(process.execPath,['-e','setInterval(()=>{},1000)']);
  setTimeout(()=>abort.abort(),30);
  await assert.rejects(job,/abort/i);
});
test('Windows button window compiles from reviewed source without showing an unattended UI', {skip:process.platform!=='win32'},()=>{
  const root=path.resolve(__dirname,'..');
  const command='& ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $env:DEVIN_ZH_GUI_PROJECT "scripts/build-windows-gui.ps1"))))';
  const output=cp.execFileSync('powershell.exe',['-NoProfile','-Command',command],{env:{...process.env,DEVIN_ZH_GUI_PROJECT:root,DEVIN_ZH_GUI_CHECK:'1'},encoding:'utf8',windowsHide:true}).trim();
  assert.ok(fs.existsSync(output));assert.equal(fs.readFileSync(output).subarray(0,2).toString(),'MZ');
});
