'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),zlib=require('node:zlib');
const update=require('../scripts/tool-update');
const {operate}=require('../scripts/gui-backend');
const REPO='https://github.com/GoodWay0223/devin-zh',API='https://api.github.com/repos/GoodWay0223/devin-zh/releases/latest';
function content(v='1.2.3',extra={}){
  const entries={'package.json':JSON.stringify({name:'devin-desktop-zh',version:v,homepage:REPO}),
    'scripts/tool-update.js':'// updater '+v,'scripts/gui-backend.js':'// backend '+v,'scripts/build-windows-gui.ps1':'# bootstrap '+v,
    'scripts/launcher-windows.cs':'// window '+v,'汉化工具-Start-Windows.vbs':"' launcher "+v,'src/cli.js':'// cli '+v,...extra};
  return new Map(Object.entries(entries).map(([name,data])=>[name,Buffer.from(data)]));
}
function owned(v,extra={}){const files=content(v,extra);files.set(update.MANIFEST,Buffer.from(JSON.stringify(update.manifestFor(files,v,'win32'))));return files;}
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'devin-tool-update-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));writeFiles(root,owned('1.2.3'));return root;}
function writeFiles(root,files){for(const[name,data]of files){fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});fs.writeFileSync(path.join(root,name),data);}}
function snapshot(root,files){return new Map([...files.keys()].map(name=>[name,fs.readFileSync(path.join(root,name))]));}
function assertFiles(root,files){for(const[name,data]of files)assert.deepEqual(fs.readFileSync(path.join(root,name)),data,name);}
function zip(entries,{method=8}={}){
  let offset=0;const locals=[],directory=[];
  for(const[name,raw]of entries){const data=Buffer.from(raw),encoded=Buffer.from(name),compressed=method===8?zlib.deflateRawSync(data):data,local=Buffer.alloc(30),central=Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(method,8);local.writeUInt32LE(update.crc32(data),14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(encoded.length,26);
    central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(method,10);central.writeUInt32LE(update.crc32(data),16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(encoded.length,28);central.writeUInt32LE(offset,42);
    const localData=Buffer.concat([local,encoded,compressed]);locals.push(localData);directory.push(Buffer.concat([central,encoded]));offset+=localData.length;
  }
  const central=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...locals,central,end]);
}
function releaseFixture(v='1.2.4'){
  const archive=update.appendManifest(zip([...content(v)].map(([name,data])=>['devin-zh/'+name,data])),v,'win32'),name='Devin-Desktop-Zh-Windows-'+v+'.zip';
  const sums=Buffer.from(update.sha(archive)+'  '+name+'\n'),asset=(name,data)=>({name,state:'uploaded',size:data.length,browser_download_url:REPO+'/releases/download/v'+v+'/'+name});
  const release={draft:false,prerelease:false,tag_name:'v'+v,html_url:REPO+'/releases/tag/v'+v,assets:[asset(name,archive),asset('SHA256SUMS',sums)]};
  const responses=new Map([[API,Buffer.from(JSON.stringify(release))],[release.assets[0].browser_download_url,archive],[release.assets[1].browser_download_url,sums]]);
  const calls=[];return {archive,sums,release,responses,calls,fetchImpl:async(url,options)=>{calls.push({url,options});const body=responses.get(url);if(!body)throw new Error('unexpected URL '+url);return new Response(body,{status:200,headers:{'content-length':String(body.length)}});}};
}
test('stable release versions compare numerically and reject pre-release/path input',()=>{
  assert.equal(update.newer('1.10.0','1.9.99'),true);assert.equal(update.newer('1.0.17','1.0.18'),false);
  for(const v of ['v1.2.3','1.02.3','1.2.3-preview','1.2.3/../../','9999999999999999999.0.0'])assert.throws(()=>update.version(v));
});
test('release manifests round-trip through real git archive ZIP and preserve its files',()=>{
  const archive=cp.execFileSync('git',['archive','--format=zip','--prefix=devin-zh/','HEAD','--','package.json'],{cwd:path.resolve(__dirname,'..'),windowsHide:true});
  const before=update.readArchive(archive).files,after=update.readArchive(update.appendManifest(archive,'1.2.4','win32')).files;
  assert.deepEqual(after.get('package.json'),before.get('package.json'));assert.equal(JSON.parse(after.get(update.MANIFEST)).files['package.json'],update.sha(before.get('package.json')));
});
test('ZIP rejects traversal, protected data, duplicates, CRC corruption and symlinks',()=>{
  for(const name of ['../outside','devin-zh/../outside','devin-zh/C:/evil','devin-zh/a\\b','devin-zh/NUL.txt','devin-zh/a.','devin-zh/cache/a','devin-zh/.git/config','devin-zh/.devin-zh.local.json','elsewhere/a'])assert.throws(()=>update.readArchive(zip([[name,'x']])),name);
  assert.throws(()=>update.readArchive(zip([['devin-zh/A.txt','a'],['devin-zh/a.txt','b']])),/重复/);
  const broken=zip([['devin-zh/a.txt','x']],{method:0});broken[30+Buffer.byteLength('devin-zh/a.txt')]=121;assert.throws(()=>update.readArchive(broken),/校验/);
  const symlink=zip([['devin-zh/link','target']]);const central=symlink.readUInt32LE(symlink.length-6);symlink.writeUInt32LE((0xa1ff<<16)>>>0,central+38);assert.throws(()=>update.readArchive(symlink),/不支持/);
});
test('package validates every file and enforces the expected repository, platform and release',()=>{
  const files=owned('1.2.4');assert.equal(update.validatePackage(files,'1.2.4').version,'1.2.4');
  assert.throws(()=>update.validatePackage(files,'1.2.5'),/版本/);
  files.set('src/cli.js',Buffer.from('tampered'));assert.throws(()=>update.validatePackage(files,'1.2.4'),/校验/);
  const mac=content('1.2.4');mac.set(update.MANIFEST,Buffer.from(JSON.stringify(update.manifestFor(mac,'1.2.4','darwin'))));assert.throws(()=>update.validatePackage(mac,'1.2.4'),/清单/);
});
test('HTTPS and redirect policy rejects unrelated repositories, hosts, credentials and HTTP',async()=>{
  for(const url of ['http://github.com/GoodWay0223/devin-zh/releases/latest','https://github.com/other/repo/releases/latest','https://evil.test/a','https://user:password@github.com/GoodWay0223/devin-zh/releases/latest','https://api.github.com/repos/other/repo/releases/latest'])assert.throws(()=>update.publicURL(url));
  await assert.rejects(update.bytes(API,{maxBytes:10,fetchImpl:async()=>new Response(null,{status:302,headers:{location:'https://evil.test/redirect'}})}),/HTTPS/);
  await assert.rejects(update.bytes(API,{maxBytes:10,fetchImpl:async()=>new Response(null,{status:302,headers:{location:API}})}),/重定向/);
});
test('network reads enforce timeout, size, full length and cancellation',async()=>{
  await assert.rejects(update.bytes(API,{timeoutMs:10,maxBytes:10,fetchImpl:()=>new Promise(()=>{})}),/超时/);
  await assert.rejects(update.bytes(API,{maxBytes:2,fetchImpl:async()=>new Response('large')}),/大小/);
  await assert.rejects(update.bytes(API,{maxBytes:10,fetchImpl:async()=>new Response('x',{headers:{'content-length':'2'}})}),/完整/);
  const abort=new AbortController();abort.abort();let fetched=false;await assert.rejects(update.bytes(API,{signal:abort.signal,maxBytes:10,fetchImpl:async()=>{fetched=true;}}),/取消/);assert.equal(fetched,false);
});
test('checking formal latest is read-only, validates asset identity and does not downgrade',async t=>{
  const root=fixture(t),remote=releaseFixture('1.2.2'),before=snapshot(root,owned('1.2.3'));fs.mkdirSync(path.join(root,'.git'));
  const result=await update.checkUpdate({projectDir:root,fetchImpl:remote.fetchImpl});assert.equal(result.available,false);assert.equal(result.sourceCheckout,true);assertFiles(root,before);assert.equal(fs.existsSync(path.join(root,'cache')),false);
  remote.release.prerelease=true;remote.responses.set(API,Buffer.from(JSON.stringify(remote.release)));await assert.rejects(update.checkUpdate({projectDir:root,fetchImpl:remote.fetchImpl}),/正式/);
  remote.release.prerelease=false;remote.release.assets[0].browser_download_url='https://github.com/other/repo/releases/download/v1.2.2/fake.zip';remote.responses.set(API,Buffer.from(JSON.stringify(remote.release)));await assert.rejects(update.checkUpdate({projectDir:root,fetchImpl:remote.fetchImpl}),/附件/);
});
test('GUI check failure stays non-fatal and requires no Devin installation or dependencies',async t=>{
  const root=fixture(t),events=[];
  const result=await operate({command:'check-tool-update'},{projectDir:root,emit:e=>events.push(e),log:()=>{},fetchImpl:async()=>{throw new Error('offline');}});
  assert.equal(result.type,'update-unavailable');assert.match(result.message,/不受影响/);assert.equal(events.length,0);
});
test('API rate-limit fallback uses only the formal latest redirect plus its published SHA256SUMS',async t=>{
  const root=fixture(t),remote=releaseFixture(),latest=REPO+'/releases/latest';
  const fallback=async(url,options)=>{
    if(url===API)return new Response('rate limited',{status:403});
    if(url===latest)return new Response(null,{status:302,headers:{location:remote.release.html_url}});
    if(url===remote.release.html_url)return new Response('<html>formal release</html>');
    return remote.fetchImpl(url,options);
  };
  const release=await update.checkUpdate({projectDir:root,fetchImpl:fallback});assert.equal(release.version,'1.2.4');assert.equal(release.source,'github-release-redirect');assert.equal(release.zip.size,null);
  const result=await update.updateTool({projectDir:root,expectedVersion:'1.2.4',fetchImpl:fallback});assert.equal(result.type,'tool-updated');assertFiles(root,update.readArchive(remote.archive).files);
});
test('rate-limit fallback rejects prerelease tags, unrelated release redirects and missing checksum entries',async t=>{
  const root=fixture(t),latest=REPO+'/releases/latest';
  for(const target of [REPO+'/releases/tag/v1.2.4-beta','https://github.com/other/repo/releases/tag/v1.2.4',REPO+'/tree/main']){
    await assert.rejects(update.checkUpdate({projectDir:root,fetchImpl:async url=>url===API?new Response('',{status:403}):url===latest?new Response(null,{status:302,headers:{location:target}}):new Response('page')}));
  }
  const target=REPO+'/releases/tag/v1.2.4';
  await assert.rejects(update.checkUpdate({projectDir:root,fetchImpl:async url=>url===API?new Response('',{status:403}):url===latest?new Response(null,{status:302,headers:{location:target}}):new Response(url===target?'page':'missing expected ZIP')}),/校验值/);
});
test('verified update preserves local config, cache, installed dependencies and unknown files in place',async t=>{
  const root=fixture(t),remote=releaseFixture(),preserved=new Map([['.devin-zh.local.json',Buffer.from('{"local":true}')],['cache/installations/backup.bin',Buffer.from('original Devin')],['node_modules/acorn/package.json',Buffer.from('existing dependency')],['my-notes.txt',Buffer.from('keep me')]]);
  writeFiles(root,preserved);const events=[];const result=await update.updateTool({projectDir:root,expectedVersion:'1.2.4',fetchImpl:remote.fetchImpl,onProgress:event=>events.push(event)});
  assert.equal(result.type,'tool-updated');assertFiles(root,update.readArchive(remote.archive).files);assertFiles(root,preserved);assert.equal(result.entry,path.join(root,'汉化工具-Start-Windows.vbs'));
  assert.equal(fs.existsSync(path.join(result.backup,'previous/package.json')),true);assert.equal(fs.existsSync(path.join(root,'cache/tool-updates/active.json')),false);assert.ok(events.some(e=>e.receivedBytes>0));
});
test('checksum mismatch or changed latest never writes tool files',async t=>{
  const root=fixture(t),remote=releaseFixture(),before=snapshot(root,owned('1.2.3'));
  await assert.rejects(update.updateTool({projectDir:root,expectedVersion:'1.2.5',fetchImpl:remote.fetchImpl}),/已变化/);assertFiles(root,before);
  remote.responses.set(remote.release.assets[1].browser_download_url,Buffer.from('0'.repeat(64)+'  '+remote.release.assets[0].name+'\n'));
  await assert.rejects(update.updateTool({projectDir:root,expectedVersion:'1.2.4',fetchImpl:remote.fetchImpl}),/SHA256/);assertFiles(root,before);assert.equal(fs.existsSync(path.join(root,'cache/tool-updates/active.json')),false);
});
test('source checkout, modified managed files and unknown conflicting files are never overwritten',async t=>{
  const root=fixture(t),files=owned('1.2.4');fs.mkdirSync(path.join(root,'.git'));let fetched=false;
  await assert.rejects(update.updateTool({projectDir:root,expectedVersion:'1.2.4',fetchImpl:async()=>{fetched=true;}}),/Git/);assert.equal(fetched,false);fs.rmdirSync(path.join(root,'.git'));
  fs.writeFileSync(path.join(root,'src/cli.js'),'my change');assert.throws(()=>update.installFiles(root,files,'1.2.4'),/保留本机修改/);assert.equal(fs.readFileSync(path.join(root,'src/cli.js'),'utf8'),'my change');
  writeFiles(root,owned('1.2.3'));fs.writeFileSync(path.join(root,'README-new.md'),'my notes');assert.throws(()=>update.installFiles(root,owned('1.2.4',{'README-new.md':'release notes'}),'1.2.4'),/保留本机修改/);assert.equal(fs.readFileSync(path.join(root,'README-new.md'),'utf8'),'my notes');
});
test('write failure rolls back replaced files and newly introduced files',t=>{
  const root=fixture(t),before=snapshot(root,owned('1.2.3')),files=owned('1.2.4',{'new/file.txt':'new'});let writes=0;
  assert.throws(()=>update.installFiles(root,files,'1.2.4',{beforeWrite:relative=>{writes++;if(relative==='package.json')throw new Error('fixture disk failure');}}),/fixture disk failure/);
  assert.ok(writes>2);assertFiles(root,before);assert.equal(fs.existsSync(path.join(root,'new/file.txt')),false);assert.equal(fs.existsSync(path.join(root,'cache/tool-updates/active.json')),false);
});
test('process interruption recovers through the preserved helper without relying on new tool sources',t=>{
  const root=fixture(t),before=snapshot(root,owned('1.2.3')),files=owned('1.2.4');
  const program=`const u=require(${JSON.stringify(require.resolve('../scripts/tool-update'))});const files=new Map(${JSON.stringify([...files].map(([name,data])=>[name,data.toString()]))}.map(([n,d])=>[n,Buffer.from(d)]));let n=0;u.installFiles(${JSON.stringify(root)},files,'1.2.4',{beforeWrite(){if(++n===4)process.exit(55)}});`;
  const stopped=cp.spawnSync(process.execPath,['-e',program],{windowsHide:true,encoding:'utf8'});assert.equal(stopped.status,55,stopped.stderr);
  const lockFile=path.join(root,'cache/tool-updates/active.json'),lock=JSON.parse(fs.readFileSync(lockFile)),helper=path.join(root,'cache/tool-updates',lock.run,'recovery.js');
  assert.equal(update.sha(fs.readFileSync(helper)),lock.recoveryHash);
  const restored=cp.spawnSync(process.execPath,[helper,'--recover',root],{windowsHide:true,encoding:'utf8'});assert.equal(restored.status,0,restored.stderr);assertFiles(root,before);assert.equal(fs.existsSync(lockFile),false);
});
test('failure while writing a new lock never publishes an empty active.json or changes tool files',t=>{
  const root=fixture(t),before=snapshot(root,owned('1.2.3')),open=fs.openSync,write=fs.writeFileSync;let lockDescriptor;
  fs.openSync=function(file,...args){const descriptor=open.call(fs,file,...args);if(typeof file==='string'&&/active\.json\.lock-[a-f0-9]+\.tmp$/.test(file))lockDescriptor=descriptor;return descriptor;};
  fs.writeFileSync=function(file,...args){if(file===lockDescriptor)throw Object.assign(new Error('fixture disk full during lock write'),{code:'ENOSPC'});return write.call(fs,file,...args);};
  try{assert.throws(()=>update.installFiles(root,owned('1.2.4'),'1.2.4'),/fixture disk full/);}finally{fs.openSync=open;fs.writeFileSync=write;}
  assertFiles(root,before);assert.equal(fs.existsSync(path.join(root,'cache/tool-updates/active.json')),false);assert.equal(update.recoverUpdate(root),false);
  assert.equal(update.installFiles(root,owned('1.2.4'),'1.2.4').version,'1.2.4');
});
test('process termination between temporary lock creation and writing leaves startup unblocked',t=>{
  const root=fixture(t),before=snapshot(root,owned('1.2.3')),files=owned('1.2.4');
  const program=`const fs=require('node:fs'),u=require(${JSON.stringify(require.resolve('../scripts/tool-update'))});const open=fs.openSync;fs.openSync=function(file,...args){const fd=open.call(fs,file,...args);if(typeof file==='string'&&file.includes('active.json.lock-'))process.exit(56);return fd;};const files=new Map(${JSON.stringify([...files].map(([n,d])=>[n,d.toString()]))}.map(([n,d])=>[n,Buffer.from(d)]));u.installFiles(${JSON.stringify(root)},files,'1.2.4');`;
  const stopped=cp.spawnSync(process.execPath,['-e',program],{windowsHide:true,encoding:'utf8'});assert.equal(stopped.status,56,stopped.stderr);
  assertFiles(root,before);assert.equal(fs.existsSync(path.join(root,'cache/tool-updates/active.json')),false);assert.equal(update.recoverUpdate(root),false);
  assert.equal(update.installFiles(root,files,'1.2.4').version,'1.2.4');
});
test('a concurrent updater lock is never overwritten during atomic publication',t=>{
  const root=fixture(t),before=snapshot(root,owned('1.2.3')),link=fs.linkSync,other=JSON.stringify({pid:process.pid,run:'another-updater'}),lockFile=path.join(root,'cache/tool-updates/active.json');
  fs.linkSync=function(from,to){if(to===lockFile)fs.writeFileSync(to,other,{flag:'wx'});return link.call(fs,from,to);};
  try{assert.throws(()=>update.installFiles(root,owned('1.2.4'),'1.2.4'),/另一窗口/);}finally{fs.linkSync=link;}
  assertFiles(root,before);assert.equal(fs.readFileSync(lockFile,'utf8'),other);
});
test('Windows directory junctions cannot redirect update writes outside the tool', {skip:process.platform!=='win32'},t=>{
  const root=fixture(t),outside=fs.mkdtempSync(path.join(os.tmpdir(),'devin-tool-outside-'));t.after(()=>fs.rmSync(outside,{recursive:true,force:true}));
  fs.symlinkSync(outside,path.join(root,'linked'),'junction');assert.throws(()=>update.installFiles(root,owned('1.2.4',{'linked/file.txt':'unexpected'}),'1.2.4'),/链接/);assert.equal(fs.existsSync(path.join(outside,'file.txt')),false);
});
