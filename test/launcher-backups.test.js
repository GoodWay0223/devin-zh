const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {FILES,loadBaseline,transaction}=require('../src/install');
const {importVerifiedBackup}=require('../scripts/launcher-backups');

function fixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'devin-launcher-backup-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const root=path.join(dir,'Devin','resources','app'), old=path.join(dir,'old tool'), fresh=path.join(dir,'fresh tool');
  const sources=new Map([[FILES[0],'globalThis.chat="original";'],[FILES[1],'globalThis.sessions="original";'],
    [FILES[2],'globalThis._VSCODE_NLS_MESSAGES=["One"];'],[FILES[3],'["One"]']]);
  const write=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value);};
  for (const [file,source] of sources) write(path.join(root,file),source);
  write(path.join(root,'product.json'),JSON.stringify({version:'1.126.0',commit:'test',checksums:Object.fromEntries([...sources].map(([file,source])=>[file.replace(/^out\//,''),crypto.createHash('sha256').update(source).digest('base64')]))}));
  write(path.join(root,'out/nls.keys.json'),'[["test",["one"]]]');
  write(path.join(old,'package.json'),' {"name":"devin-desktop-zh"}'); fs.mkdirSync(fresh);
  const baseline=loadBaseline({root,cacheDir:path.join(old,'cache/installations'),create:true});
  transaction(baseline,[{relative:FILES[0],source:'globalThis.chat="translated";'}],{checkStopped:()=>{}});
  return {root,old,fresh,baseline};
}
test('fresh extraction imports only verified originals/state and recognizes the existing patch',t=>{
  const {root,old,fresh,baseline}=fixture(t), cacheDir=path.join(fresh,'cache/installations');
  fs.writeFileSync(path.join(baseline.dir,'unrelated-secret.txt'),'private');
  const installed=fs.readFileSync(path.join(root,FILES[0]));
  assert.throws(()=>loadBaseline({root,cacheDir}),/官方原版/);
  const result=importVerifiedBackup(root,{projectDir:fresh,toolDirs:[old]});
  assert.equal(result.imported,true);
  assert.equal(fs.existsSync(path.join(result.destination,'unrelated-secret.txt')),false);
  assert.ok(fs.readFileSync(path.join(root,FILES[0])).equals(installed));
  assert.equal(loadBaseline({root,cacheDir}).state.applied[FILES[0]],baseline.state.applied[FILES[0]] || crypto.createHash('sha256').update(installed).digest('hex'));
  assert.equal(importVerifiedBackup(root,{projectDir:fresh,toolDirs:[old]}).imported,false);
});
test('corrupt old originals cannot be imported, and existing interrupted cache is not overwritten',t=>{
  const {root,old,fresh,baseline}=fixture(t);
  const original=path.join(baseline.dir,'original',FILES[0]), bytes=fs.readFileSync(original);
  fs.writeFileSync(original,'corrupt');
  assert.equal(importVerifiedBackup(root,{projectDir:fresh,toolDirs:[old]}).imported,false);
  assert.equal(fs.existsSync(path.join(fresh,'cache')),false);
  fs.writeFileSync(original,bytes);
  const destination=path.join(fresh,'cache/installations',baseline.identity);
  fs.mkdirSync(destination,{recursive:true});fs.writeFileSync(path.join(destination,'pending.json'),'keep interrupted state');
  assert.equal(importVerifiedBackup(root,{projectDir:fresh,toolDirs:[old]}).imported,false);
  assert.equal(fs.readFileSync(path.join(destination,'pending.json'),'utf8'),'keep interrupted state');
  assert.equal(fs.existsSync(path.join(destination,'baseline.json')),false);
});
