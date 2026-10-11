const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const {checkNode,resolveInstallation,validInstallation,discover,saveLocal} = require('../scripts/launcher');
const {appRoot} = require('../src/config');
const {assertStopped} = require('../src/install');

function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'devin-launcher-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true})); return dir;
}
function mockApp(root) {
  for (const file of ['product.json','out/vs/workbench/windsurf-chat-client/index.js',
    'out/vs/sessions/sessions.desktop.main.js','out/nls.messages.js','out/nls.messages.json','out/nls.keys.json']) {
    const full = path.join(root,file); fs.mkdirSync(path.dirname(full),{recursive:true}); fs.writeFileSync(full,'{}');
  }
}
test('launcher rejects Node versions without supported built-in SQLite',()=>{
  for (const version of ['18.20.0','20.19.0','22.12.0']) assert.throws(()=>checkNode(version),/22.13/);
  for (const version of ['22.13.0','24.0.0']) assert.doesNotThrow(()=>checkNode(version));
});
test('launcher accepts quoted executable and app paths with spaces without a shell',()=>{
  assert.equal(resolveInstallation('"D:\\Apps With Space\\Devin\\Devin.exe"',{platform:'win32'}),'D:\\Apps With Space\\Devin\\resources\\app');
  assert.equal(resolveInstallation("'/Applications/Devin App.app'",{platform:'darwin'}),'/Applications/Devin App.app/Contents/Resources/app');
  assert.equal(resolveInstallation('~/Applications/Devin\\ App.app',{platform:'darwin',home:'/Users/example'}),'/Users/example/Applications/Devin App.app/Contents/Resources/app');
  assert.throws(()=>resolveInstallation('resources/app',{platform:'darwin'}),/绝对路径/);
});
test('discovery validates target layout and does not accept app.asar as editable app',t=>{
  const dir = temporary(t), app = path.join(dir,'Applications','Devin.app','Contents','Resources','app');
  const project = path.join(dir,'tool'); fs.mkdirSync(project);
  assert.deepEqual(discover({platform:'darwin',home:dir,env:{},projectDir:project}),[]);
  const asar = path.join(dir,'Applications','Devin.app','Contents','Resources','app.asar');
  fs.mkdirSync(path.dirname(asar),{recursive:true}); fs.writeFileSync(asar,'archive');
  assert.equal(validInstallation(path.dirname(asar)),false);
  mockApp(app);
  assert.deepEqual(discover({platform:'darwin',home:dir,env:{},projectDir:project}),[app]);
  fs.unlinkSync(path.join(app,'out/nls.keys.json'));
  assert.deepEqual(discover({platform:'darwin',home:dir,env:{},projectDir:project}),[]);
});
test('remembering installation backs up existing machine settings and preserves other keys',t=>{
  const projectDir = temporary(t), file = path.join(projectDir,'.devin-zh.local.json');
  const before = '{"appRoot":"old","customOption":true}\n'; fs.writeFileSync(file,before);
  const app = path.join(projectDir,'app'); saveLocal(app,{projectDir});
  assert.deepEqual(JSON.parse(fs.readFileSync(file)),{appRoot:app,customOption:true});
  const backups = fs.readdirSync(path.join(projectDir,'cache/launcher-settings'));
  assert.equal(backups.length,1);
  assert.equal(fs.readFileSync(path.join(projectDir,'cache/launcher-settings',backups[0]),'utf8'),before);
  saveLocal(app,{projectDir}); assert.equal(fs.readdirSync(path.join(projectDir,'cache/launcher-settings')).length,1);
});
test('mac defaults are discoverable but installation mutations fail closed on macOS and Linux',t=>{
  const projectDir = temporary(t);
  assert.equal(appRoot({env:{},projectDir,platform:'darwin'}),'/Applications/Devin.app/Contents/Resources/app');
  for (const platform of ['darwin','linux']) assert.throws(()=>assertStopped('/Applications/Devin.app/Contents/Resources/app',{platform}),/仅 Windows 支持写入/);
});
test('native double-click entry starts from a folder containing spaces and supports no-write check',t=>{
  const dir = path.join(temporary(t),'extracted tool with spaces'); fs.mkdirSync(dir);
  const source = path.resolve(__dirname,'..');
  for (const name of ['scripts','src']) fs.mkdirSync(path.join(dir,name));
  for (const name of ['scripts/launcher.js','src/config.js','package.json',process.platform === 'win32' ? 'Start-Windows.cmd' : 'Start-macOS.command'])
    fs.copyFileSync(path.join(source,name),path.join(dir,name));
  let result;
  if (process.platform === 'win32') result = cp.spawnSync('cmd.exe',['/d','/c','Start-Windows.cmd --check'],{cwd:dir,encoding:'utf8',windowsHide:true});
  else result = cp.spawnSync('/bin/bash',[path.join(dir,'Start-macOS.command'),'--check'],{cwd:os.tmpdir(),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr+'\n'+result.stdout);
  assert.ok(result.stdout.includes(process.platform === 'linux' ? 'CI' : '"platform"'));
  assert.equal(fs.existsSync(path.join(dir,'cache')),false);
  assert.equal(fs.existsSync(path.join(dir,'node_modules')),false);
  assert.equal(fs.existsSync(path.join(dir,'.devin-zh.local.json')),false);
});
