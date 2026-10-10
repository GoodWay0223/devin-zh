'use strict';
// Set Devin's native per-commit "Don't Show Again" display preference.
// Integrity checks, logs, application files and product checksums are untouched.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const KEY = 'integrityService', TARGETS = '__$__targetStorageMarker';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function open(file, readOnly) {
  if (!fs.existsSync(file)) throw new Error('找不到现有 Devin 配置数据库，未创建或修改：' + file);
  const {DatabaseSync} = require('node:sqlite');
  const db = new DatabaseSync(file,{readOnly});
  if (db.prepare('PRAGMA quick_check').get().quick_check !== 'ok') { db.close(); throw new Error('配置数据库检查失败，未修改'); }
  return db;
}
function read(db,key) { return db.prepare('SELECT value FROM ItemTable WHERE key = ?').get(key)?.value ?? null; }
function write(db,key,value) {
  if (value === null) db.prepare('DELETE FROM ItemTable WHERE key = ?').run(key);
  else db.prepare('INSERT INTO ItemTable(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,value);
}
function parseTargets(raw) {
  const value = raw === null ? {} : JSON.parse(raw);
  if (!object(value)) throw new Error('配置存储目标格式异常，未覆盖');
  return value;
}
function status({dbFile,commit}) {
  const db = open(dbFile,true);
  try {
    const raw = read(db,KEY), preference = raw === null ? null : JSON.parse(raw);
    return {mutedForCurrentBuild:!!preference?.dontShowPrompt && preference.commit === commit, commit, preference};
  } finally { db.close(); }
}
function backup(dbFile,backupRoot) {
  const directory = path.join(backupRoot,new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(4).toString('hex'));
  fs.mkdirSync(directory,{recursive:true});
  const files = [];
  for (const suffix of ['', '-wal', '-shm']) {
    const source = dbFile+suffix;
    if (!fs.existsSync(source)) continue;
    const destination = path.join(directory,path.basename(source));
    fs.copyFileSync(source,destination,fs.constants.COPYFILE_EXCL);
    files.push({name:path.basename(source),sha256:hash(fs.readFileSync(destination))});
  }
  return {directory,files};
}
function mute({dbFile,commit,backupRoot,assertStopped}) {
  if (typeof commit !== 'string' || !/^[a-f\d]{40}$/i.test(commit)) throw new Error('缺少有效安装构建标识，未静音');
  assertStopped();
  if (status({dbFile,commit}).mutedForCurrentBuild) return {changed:false,...status({dbFile,commit})};
  const saved = backup(dbFile,backupRoot), db = open(dbFile,false);
  let transaction = false;
  try {
    db.exec('BEGIN IMMEDIATE'); transaction = true; assertStopped();
    const before = read(db,KEY), targetRaw = read(db,TARGETS), targets = parseTargets(targetRaw);
    const manifest = {schema:1,dbFile:path.resolve(dbFile),commit,before,
      beforeTarget:{exists:Object.hasOwn(targets,KEY),value:targets[KEY]},targetMarkerExisted:targetRaw!==null,
      applied:JSON.stringify({dontShowPrompt:true,commit}),files:saved.files};
    const manifestFile = path.join(saved.directory,'restore.json');
    fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
    targets[KEY] = 1; // Native code stores this preference in machine-local target 1.
    write(db,KEY,manifest.applied); write(db,TARGETS,JSON.stringify(targets));
    if (read(db,KEY) !== manifest.applied) throw new Error('设置读取校验失败');
    db.exec('COMMIT'); transaction = false;
    return {changed:true,mutedForCurrentBuild:true,commit,manifestFile};
  } catch(error) { if(transaction) db.exec('ROLLBACK'); throw error; }
  finally {db.close();}
}
function undo({manifestFile,dbFile,backupRoot,assertStopped}) {
  const manifest = JSON.parse(fs.readFileSync(manifestFile,'utf8'));
  if (manifest.schema !== 1 || manifest.dbFile !== path.resolve(dbFile)) throw new Error('恢复记录与当前配置数据库不一致');
  assertStopped(); const saved = backup(dbFile,backupRoot), db = open(dbFile,false);
  let transaction = false;
  try {
    db.exec('BEGIN IMMEDIATE'); transaction = true; assertStopped();
    const targets = parseTargets(read(db,TARGETS));
    if (read(db,KEY) !== manifest.applied || targets[KEY] !== 1) throw new Error('静音设置后来已改变，未覆盖');
    write(db,KEY,manifest.before);
    if (manifest.beforeTarget.exists) targets[KEY] = manifest.beforeTarget.value; else delete targets[KEY];
    write(db,TARGETS,!manifest.targetMarkerExisted && !Object.keys(targets).length ? null : JSON.stringify(targets));
    db.exec('COMMIT'); transaction = false;
    return {restored:true,backup:saved.directory};
  } catch(error) { if(transaction) db.exec('ROLLBACK'); throw error; }
  finally {db.close();}
}
function main() {
  const C = require('../src/core'), I = require('../src/install');
  const baseline = I.loadBaseline({root:C.ROOT});
  const unknown = I.integrityStatus(baseline).filter(x=>['unknown','missing'].includes(x.status));
  if (unknown.length) throw new Error('安装存在未知修改/缺失，未隐藏提示：'+unknown.map(x=>x.relative).join(', '));
  const source = fs.readFileSync(path.join(C.ROOT,'out/vs/workbench/workbench.desktop.main.js'),'utf8');
  const keyPosition = source.indexOf('this.KEY="integrityService"');
  const storageCode = source.slice(keyPosition,keyPosition+450);
  if (keyPosition < 0 || !/this\.storageService\.get\(\w+\.KEY,-1\)/.test(storageCode) ||
      !/this\.storageService\.store\(\w+\.KEY,JSON\.stringify\(this\.value\),-1,1\)/.test(storageCode) ||
      !/dontShowPrompt&&\w+\.commit===this\.productService\.commit\|\|this\._showNotification\(\)/.test(source) ||
      !source.includes('dontShowPrompt:!0,commit:this.productService.commit'))
    throw new Error('未确认当前版本的原生不再提示机制，未修改');
  if (!process.env.APPDATA) throw new Error('此工具适用于 Windows，缺少 APPDATA');
  const options = {dbFile:path.join(process.env.APPDATA,'Devin','User','globalStorage','state.vscdb'),
    commit:baseline.product.commit,backupRoot:path.resolve(__dirname,'..','cache','notice-preferences'),
    assertStopped:()=>I.assertStopped(C.ROOT)};
  const command = process.argv[2] || 'status';
  const result = command === 'mute' ? mute(options) : command === 'undo' && process.argv[3]
    ? undo({...options,manifestFile:path.resolve(process.argv[3])}) : command === 'status'
      ? status(options) : (()=>{throw new Error('用法：node scripts/integrity-notice.js status|mute|undo <restore.json>');})();
  console.log(JSON.stringify(result,null,2));
}
if (require.main === module) {try {main();} catch(error) {console.error(error.message);process.exitCode=1;}}
module.exports={status,mute,undo};
