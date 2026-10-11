const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {appRoot} = require('../src/config');

function machine(t, config) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devin-zh-config-'));
  t.after(()=>fs.rmSync(dir, {recursive:true, force:true}));
  if (config !== undefined) fs.writeFileSync(path.join(dir,'.devin-zh.local.json'),JSON.stringify(config));
  return dir;
}
test('explicit installation overrides local settings without reading invalid local config',t=>{
  const dir = machine(t,{appRoot:'invalid-relative-path'});
  const requested = path.join(dir,'custom','resources','app');
  assert.equal(appRoot({projectDir:dir,env:{DEVIN_APP:requested}}),requested);
});
test('ignored local setting preserves a custom installation; relative paths fail closed',t=>{
  const dir = machine(t,{appRoot:path.join(os.tmpdir(),'custom-devin','resources','app')});
  assert.equal(appRoot({projectDir:dir,env:{}}),path.join(os.tmpdir(),'custom-devin','resources','app'));
  fs.writeFileSync(path.join(dir,'.devin-zh.local.json'),JSON.stringify({appRoot:'resources/app'}));
  assert.throws(()=>appRoot({projectDir:dir,env:{}}),/absolute appRoot/);
});
test('fresh copies use Windows per-user install location without the maintainer directory',t=>{
  const dir = machine(t);
  const local = path.join(dir,'Local');
  assert.equal(appRoot({projectDir:dir,env:{LOCALAPPDATA:local},platform:'win32'}),path.join(local,'Programs','Devin','resources','app'));
});
