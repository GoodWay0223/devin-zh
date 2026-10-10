'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {DatabaseSync} = require('node:sqlite');
const {status,mute,undo,enableChoice} = require('../scripts/integrity-notice');
const KEY = 'integrityService', MARKER = '__$__targetStorageMarker';
function fixture(t,marker={otherSetting:0}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'devin-notice-test-'));
  t.after(()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));fs.rmSync(root,{recursive:true,force:true});});
  const dbFile = path.join(root,'state.vscdb'), db = new DatabaseSync(dbFile);
  db.exec('CREATE TABLE ItemTable(key TEXT PRIMARY KEY, value TEXT)');
  db.prepare('INSERT INTO ItemTable VALUES (?,?)').run('unrelated-state','{"session":"keep this data"}');
  db.prepare('INSERT INTO ItemTable VALUES (?,?)').run(MARKER,JSON.stringify(marker));db.close();
  return {dbFile,backupRoot:path.join(root,'backups'),commit:'a'.repeat(40),assertStopped:()=>{}};
}
function read(file,key) {const db=new DatabaseSync(file,{readOnly:true});try{return db.prepare('SELECT value FROM ItemTable WHERE key=?').get(key)?.value ?? null;}finally{db.close();}}
function put(file,key,value) {const db=new DatabaseSync(file);try{db.prepare('INSERT INTO ItemTable VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,value);}finally{db.close();}}
test('native display preference is backed up and version-scoped while unrelated state stays exact',t=>{
  const options=fixture(t), before=fs.readFileSync(options.dbFile);
  const result=mute(options);
  assert.equal(result.mutedForCurrentBuild,true);
  assert.deepEqual(fs.readFileSync(path.join(path.dirname(result.manifestFile),'state.vscdb')),before);
  assert.deepEqual(JSON.parse(read(options.dbFile,KEY)),{dontShowPrompt:true,commit:options.commit});
  assert.equal(read(options.dbFile,'unrelated-state'),'{"session":"keep this data"}');
  assert.deepEqual(JSON.parse(read(options.dbFile,MARKER)),{otherSetting:0,integrityService:1});
  assert.equal(status(options).mutedForCurrentBuild,true);
  assert.equal(status({...options,commit:'b'.repeat(40)}).mutedForCurrentBuild,false);
});
test('undo restores just native notice keys and keeps changes made to other preferences',t=>{
  const options=fixture(t), result=mute(options);
  put(options.dbFile,'unrelated-state','later user changes');
  put(options.dbFile,MARKER,JSON.stringify({otherSetting:0,integrityService:1,newPreference:1}));
  undo({...options,manifestFile:result.manifestFile});
  assert.equal(read(options.dbFile,KEY),null);
  assert.equal(read(options.dbFile,'unrelated-state'),'later user changes');
  assert.deepEqual(JSON.parse(read(options.dbFile,MARKER)),{otherSetting:0,newPreference:1});
});
test('a running app guard prevents changes and backup creation',t=>{
  const options=fixture(t);options.assertStopped=()=>{throw new Error('app running');};
  assert.throws(()=>mute(options),/app running/);
  assert.equal(read(options.dbFile,KEY),null);assert.equal(fs.existsSync(options.backupRoot),false);
});
test('invalid storage metadata rolls back without changing existing keys',t=>{
  const options=fixture(t,[]);
  assert.throws(()=>mute(options),/格式异常/);
  assert.equal(read(options.dbFile,KEY),null);assert.equal(read(options.dbFile,MARKER),'[]');
});
test('a process starting between backup and transaction prevents all preference writes',t=>{
  const options=fixture(t);let calls=0;options.assertStopped=()=>{if(++calls===2)throw new Error('started meanwhile');};
  assert.throws(()=>mute(options),/started meanwhile/);
  assert.equal(read(options.dbFile,KEY),null);
  assert.deepEqual(JSON.parse(read(options.dbFile,MARKER)),{otherSetting:0});
});
test('undo refuses a subsequently edited notice preference',t=>{
  const options=fixture(t), result=mute(options), edited=JSON.stringify({dontShowPrompt:false,commit:options.commit});
  put(options.dbFile,KEY,edited);
  assert.throws(()=>undo({...options,manifestFile:result.manifestFile}),/后来已改变/);
  assert.equal(read(options.dbFile,KEY),edited);
});
test('repeating an already muted native preference does no writes',t=>{
  const options=fixture(t);mute(options);const bytes=fs.readFileSync(options.dbFile);
  const count=fs.readdirSync(options.backupRoot).length;
  assert.equal(mute(options).changed,false);
  assert.deepEqual(fs.readFileSync(options.dbFile),bytes);
  assert.equal(fs.readdirSync(options.backupRoot).length,count);
});
test('native choice adds only the help URL; checksums and notice preference remain unchanged',t=>{
  const options=fixture(t);options.productFile=path.join(path.dirname(options.dbFile),'product.json');
  const product={commit:options.commit,checksums:{'bundle.js':'official hash'},nameShort:'Devin',other:{keep:true}};
  const original=JSON.stringify(product,null,2)+'\n';fs.writeFileSync(options.productFile,original);
  const result=enableChoice(options), after=JSON.parse(fs.readFileSync(options.productFile,'utf8'));
  assert.equal(result.choiceEnabled,true);
  assert.match(after.checksumFailMoreInfoUrl,/^https:\/\/github\.com\/GoodWay0223\/devin-zh\//);
  delete after.checksumFailMoreInfoUrl;assert.deepEqual(after,product);
  assert.equal(fs.readFileSync(path.join(result.backup,'product.json'),'utf8'),original);
  assert.equal(read(options.dbFile,KEY),null);
});
test('an existing native help link is preserved and enabling choice is idempotent',t=>{
  const options=fixture(t);options.productFile=path.join(path.dirname(options.dbFile),'product.json');
  const original=JSON.stringify({checksumFailMoreInfoUrl:'https://vendor.example/help',checksums:{a:'b'}});
  fs.writeFileSync(options.productFile,original);
  const result=enableChoice(options);
  assert.equal(result.changed,false);assert.equal(result.url,'https://vendor.example/help');
  assert.equal(fs.readFileSync(options.productFile,'utf8'),original);
  assert.equal(fs.existsSync(options.backupRoot),false);
});
test('running app prevents enabling the native choice',t=>{
  const options=fixture(t);options.productFile=path.join(path.dirname(options.dbFile),'product.json');
  fs.writeFileSync(options.productFile,'{}');options.assertStopped=()=>{throw new Error('app running');};
  assert.throws(()=>enableChoice(options),/app running/);
  assert.equal(fs.readFileSync(options.productFile,'utf8'),'{}');
});
test('concurrent product changes are preserved instead of overwritten',t=>{
  const options=fixture(t);options.productFile=path.join(path.dirname(options.dbFile),'product.json');
  fs.writeFileSync(options.productFile,'{}');let calls=0;
  options.assertStopped=()=>{if(++calls===2)fs.writeFileSync(options.productFile,'{"newVendorBuild":true}');};
  assert.throws(()=>enableChoice(options),/后来已改变/);
  assert.equal(fs.readFileSync(options.productFile,'utf8'),'{"newVendorBuild":true}');
});
