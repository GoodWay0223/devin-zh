'use strict';
// Updates the tool's reviewed release files only. Devin and machine-local data are not targets.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const REPO='GoodWay0223/devin-zh', API='https://api.github.com/repos/'+REPO+'/releases/latest';
const MANIFEST='update-manifest.json', PREFIX='devin-zh/', MAX_ZIP=32*1024*1024, MAX_TOTAL=128*1024*1024;
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
function version(value){if(typeof value!=='string'||!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)||value.split('.').some(x=>!Number.isSafeInteger(+x)))throw new Error('更新版本格式无效。');return value.split('.').map(Number);}
function newer(a,b){const x=version(a),y=version(b);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i];return false;}
function safeRelative(name){
  if(typeof name!=='string'||!name||name.length>240||name.includes('\\')||/[\x00-\x1f:\x7f]/.test(name)||name.startsWith('/')||name.endsWith('/'))throw new Error('更新包路径无效。');
  const parts=name.split('/');
  if(parts.some(x=>!x||x==='.'||x==='..'||/[. ]$/.test(x)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(x)))throw new Error('更新包包含不安全路径。');
  if(parts.some(x=>/^(?:\.git|\.env(?:\..*)?|cache|node_modules|release-assets|\.devin-zh\.local\.json)$/i.test(x)))throw new Error('更新包试图覆盖本机配置或缓存。');
  return name;
}
function location(root,relative){safeRelative(relative);const full=path.resolve(root,relative);if(!full.startsWith(path.resolve(root)+path.sep))throw new Error('更新目标越界。');return full;}
function noLinks(root,file){let current=path.resolve(root);if(fs.lstatSync(current).isSymbolicLink())throw new Error('更新目录不能是链接。');for(const part of path.relative(current,file).split(path.sep).filter(Boolean)){current=path.join(current,part);if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw new Error('更新路径不能包含链接。');}}
function publicURL(value){let url;try{url=new URL(value);}catch{throw new Error('更新下载地址无效。');}if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||!['api.github.com','github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(url.hostname))throw new Error('更新仅允许 GitHub 官方 HTTPS 地址。');if(url.hostname==='api.github.com'&&url.pathname!=='/repos/'+REPO+'/releases/latest')throw new Error('更新 API 不属于本项目。');if(url.hostname==='github.com'&&!url.pathname.startsWith('/'+REPO+'/releases/'))throw new Error('更新地址不属于本项目。');return url.href;}
async function bytes(url,{fetchImpl=globalThis.fetch,signal,timeoutMs=15000,maxBytes,onProgress=()=>{},onResponse=()=>{}}={}){
  const controller=new AbortController();let reader;const abort=()=>controller.abort(new Error('已取消更新。'));
  if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>controller.abort(new Error('检查或下载更新超时，请稍后重试。')),timeoutMs);
  const aborted=new Promise((_,reject)=>{if(controller.signal.aborted)reject(controller.signal.reason);else controller.signal.addEventListener('abort',()=>reject(controller.signal.reason),{once:true});});
  const operation=(async()=>{let address=publicURL(url),response;for(let i=0;i<=5;i++){if(controller.signal.aborted)throw controller.signal.reason;response=await fetchImpl(address,{redirect:'manual',signal:controller.signal,headers:{'User-Agent':'devin-zh-tool-update','Accept':'application/vnd.github+json'}});if(response.status>=300&&response.status<400){const next=response.headers.get('location');await response.body?.cancel?.();if(!next||i===5)throw new Error('更新下载重定向无效。');address=publicURL(new URL(next,address).href);continue;}break;}
    if(!response.ok)throw new Error('GitHub 更新请求失败（HTTP '+response.status+'）。');if(response.url)publicURL(response.url);onResponse({url:address,status:response.status});
    const raw=response.headers.get('content-length');if(raw!==null&&(!/^\d+$/.test(raw)||!Number.isSafeInteger(+raw)||+raw>maxBytes))throw new Error('更新下载超过允许大小。');
    const encoding=response.headers.get('content-encoding');const total=raw===null||encoding&&encoding!=='identity'?null:+raw;
    if(!response.body?.getReader)throw new Error('更新响应为空。');reader=response.body.getReader();let received=0;const chunks=[];
    while(true){if(controller.signal.aborted)throw controller.signal.reason;const item=await reader.read();if(item.done)break;received+=item.value.byteLength;if(received>maxBytes)throw new Error('更新下载超过允许大小。');chunks.push(Buffer.from(item.value));onProgress({receivedBytes:received,totalBytes:total});}
    if(total!==null&&received!==total)throw new Error('更新下载不完整。');return Buffer.concat(chunks,received);
  })();try{return await Promise.race([operation,aborted]);}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);reader?.cancel().catch(()=>{});controller.abort();}
}
function releaseInfo(data,current){
  if(!data||data.draft!==false||data.prerelease!==false||typeof data.tag_name!=='string'||!data.tag_name.startsWith('v'))throw new Error('未找到有效的正式发布。');const latest=data.tag_name.slice(1);version(latest);version(current);
  const page='https://github.com/'+REPO+'/releases/tag/v'+latest;if(data.html_url!==page)throw new Error('正式发布不属于本项目。');
  const assetName='Devin-Desktop-Zh-Windows-'+latest+'.zip',assetURL=name=>'https://github.com/'+REPO+'/releases/download/v'+latest+'/'+name;
  const asset=(name,max)=>{const items=(data.assets||[]).filter(x=>x.name===name);if(items.length!==1||items[0].state!=='uploaded'||items[0].browser_download_url!==assetURL(name)||!Number.isSafeInteger(items[0].size)||items[0].size<=0||items[0].size>max)throw new Error('正式更新附件无效或缺失：'+name);return {name,url:assetURL(name),size:items[0].size};};
  return {version:latest,currentVersion:current,available:newer(latest,current),url:page,zip:asset(assetName,MAX_ZIP),checksums:asset('SHA256SUMS',65536)};
}
async function checkUpdate({projectDir=path.resolve(__dirname,'..'),...options}={}){
  const current=JSON.parse(fs.readFileSync(path.join(projectDir,'package.json'),'utf8')).version;version(current);
  let release,apiData;
  try{apiData=await bytes(API,{...options,maxBytes:2*1024*1024,timeoutMs:options.timeoutMs??8000});}
  catch(error){
    if(options.signal?.aborted)throw error;
    // Public GitHub API rate limits are shared by IP. Its official latest redirect
    // is a second release-only authority; never infer releases from branch contents.
    let finalURL;await bytes('https://github.com/'+REPO+'/releases/latest',{...options,maxBytes:2*1024*1024,timeoutMs:options.timeoutMs??8000,onResponse:event=>{finalURL=event.url;}});
    const prefix='https://github.com/'+REPO+'/releases/tag/v';if(!finalURL?.startsWith(prefix))throw new Error('GitHub 最新正式发布重定向无效。');
    const latest=finalURL.slice(prefix.length);version(latest);
    const name='Devin-Desktop-Zh-Windows-'+latest+'.zip',base='https://github.com/'+REPO+'/releases/download/v'+latest+'/',sums=await bytes(base+'SHA256SUMS',{...options,maxBytes:65536,timeoutMs:options.timeoutMs??8000});
    checksum(sums,name);
    release={version:latest,currentVersion:current,available:newer(latest,current),url:finalURL,zip:{name,url:base+name,size:null},checksums:{name:'SHA256SUMS',url:base+'SHA256SUMS',size:sums.length},source:'github-release-redirect'};
  }
  if(apiData)release=releaseInfo(JSON.parse(apiData.toString('utf8')),current);
  return {...release,sourceCheckout:fs.existsSync(path.join(projectDir,'.git'))};
}
function checksum(sums,name){const matches=sums.toString('utf8').split(/\r?\n/).filter(line=>line.endsWith('  '+name));if(matches.length!==1||!new RegExp('^[a-f0-9]{64}  '+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$').test(matches[0]))throw new Error('正式发布缺少有效的 ZIP 校验值。');return matches[0].slice(0,64);}
const crcTable=Array.from({length:256},(_,x)=>{for(let i=0;i<8;i++)x=x&1?0xedb88320^x>>>1:x>>>1;return x>>>0;});
function crc32(data){let x=0xffffffff;for(const b of data)x=crcTable[(x^b)&255]^x>>>8;return (x^0xffffffff)>>>0;}
function readArchive(data){
  if(!Buffer.isBuffer(data)||data.length<22||data.length>MAX_ZIP)throw new Error('更新 ZIP 大小无效。');let eocd=-1;
  for(let i=data.length-22;i>=Math.max(0,data.length-65557);i--)if(data.readUInt32LE(i)===0x06054b50&&i+22+data.readUInt16LE(i+20)===data.length){eocd=i;break;}
  if(eocd<0)throw new Error('更新 ZIP 目录缺失。');const count=data.readUInt16LE(eocd+10),offset=data.readUInt32LE(eocd+16),size=data.readUInt32LE(eocd+12);
  if(data.readUInt16LE(eocd+4)||data.readUInt16LE(eocd+6)||data.readUInt16LE(eocd+8)!==count||!count||count>5000||offset+size!==eocd)throw new Error('更新 ZIP 目录不支持。');
  const files=new Map(),seen=new Set(),ranges=[];let cursor=offset,total=0;
  for(let i=0;i<count;i++){
    if(cursor+46>eocd||data.readUInt32LE(cursor)!==0x02014b50)throw new Error('更新 ZIP 条目损坏。');
    const flags=data.readUInt16LE(cursor+8),method=data.readUInt16LE(cursor+10),crc=data.readUInt32LE(cursor+16),compressed=data.readUInt32LE(cursor+20),expanded=data.readUInt32LE(cursor+24),nl=data.readUInt16LE(cursor+28),extra=data.readUInt16LE(cursor+30),comment=data.readUInt16LE(cursor+32),mode=data.readUInt32LE(cursor+38)>>>16,local=data.readUInt32LE(cursor+42),end=cursor+46+nl+extra+comment;
    if(end>eocd||flags&1||![0,8].includes(method)||compressed===0xffffffff||expanded>16*1024*1024||(mode&0xf000)===0xa000||data.readUInt16LE(cursor+34))throw new Error('更新 ZIP 含不支持的条目。');
    let name;try{name=new TextDecoder('utf-8',{fatal:true}).decode(data.subarray(cursor+46,cursor+46+nl));}catch{throw new Error('更新 ZIP 文件名编码无效。');}
    const directory=name.endsWith('/');if(!name.startsWith(PREFIX))throw new Error('更新 ZIP 根目录无效。');const relative=name.slice(PREFIX.length).replace(/\/$/,'');if(relative)safeRelative(relative);else if(!directory)throw new Error('更新 ZIP 路径无效。');
    const canonical=relative.toLowerCase();if(seen.has(canonical))throw new Error('更新 ZIP 含重复路径。');seen.add(canonical);total+=expanded;if(total>MAX_TOTAL)throw new Error('更新 ZIP 解压大小超限。');
    if(local+30>offset||data.readUInt32LE(local)!==0x04034b50)throw new Error('更新 ZIP 本地头损坏。');const ln=data.readUInt16LE(local+26),le=data.readUInt16LE(local+28),start=local+30+ln+le,finish=start+compressed;
    if(finish>offset||data.readUInt16LE(local+6)!==flags||data.readUInt16LE(local+8)!==method||!data.subarray(local+30,local+30+ln).equals(data.subarray(cursor+46,cursor+46+nl)))throw new Error('更新 ZIP 本地条目不一致。');
    if(!(flags&8)&&(data.readUInt32LE(local+14)!==crc||data.readUInt32LE(local+18)!==compressed||data.readUInt32LE(local+22)!==expanded))throw new Error('更新 ZIP 大小或校验不一致。');ranges.push([local,finish]);
    let output;try{output=method===0?Buffer.from(data.subarray(start,finish)):zlib.inflateRawSync(data.subarray(start,finish),{maxOutputLength:16*1024*1024});}catch{throw new Error('更新 ZIP 解压失败。');}
    if(output.length!==expanded||crc32(output)!==crc||directory&&expanded)throw new Error('更新 ZIP 内容校验失败。');if(!directory)files.set(relative,output);cursor=end;
  }
  ranges.sort((a,b)=>a[0]-b[0]);if(ranges.some((r,i)=>i&&ranges[i-1][1]>r[0])||cursor!==eocd)throw new Error('更新 ZIP 条目范围不一致。');return {files,eocd,offset,count};
}
function manifestFor(files,releaseVersion,platform){version(releaseVersion);return {schema:1,name:'devin-desktop-zh',version:releaseVersion,platform,files:Object.fromEntries([...files].filter(([name])=>name!==MANIFEST).map(([name,data])=>[safeRelative(name),sha(data)]))};}
function appendManifest(archive,releaseVersion,platform){
  const parsed=readArchive(archive);if(parsed.files.has(MANIFEST))throw new Error('发布归档已包含更新清单。');const content=Buffer.from(JSON.stringify(manifestFor(parsed.files,releaseVersion,platform),null,2)+'\n'),name=Buffer.from(PREFIX+MANIFEST),local=Buffer.alloc(30),central=Buffer.alloc(46);
  local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(33,12);local.writeUInt32LE(crc32(content),14);local.writeUInt32LE(content.length,18);local.writeUInt32LE(content.length,22);local.writeUInt16LE(name.length,26);
  central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(33,14);central.writeUInt32LE(crc32(content),16);central.writeUInt32LE(content.length,20);central.writeUInt32LE(content.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(parsed.offset,42);
  const extra=Buffer.concat([local,name,content]),directory=Buffer.concat([archive.subarray(parsed.offset,parsed.eocd),central,name]),end=Buffer.from(archive.subarray(parsed.eocd));end.writeUInt16LE(parsed.count+1,8);end.writeUInt16LE(parsed.count+1,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(parsed.offset+extra.length,16);
  return Buffer.concat([archive.subarray(0,parsed.offset),extra,directory,end]);
}
function validateManifest(value,expectedVersion){
  if(!value||value.schema!==1||value.name!=='devin-desktop-zh'||value.version!==expectedVersion||value.platform!=='win32'||!value.files||typeof value.files!=='object'||Array.isArray(value.files))throw new Error('更新文件清单无效。');version(value.version);
  const names=Object.keys(value.files);if(!names.length||names.length>5000)throw new Error('更新文件清单大小无效。');const seen=new Set();for(const name of names){safeRelative(name);if(name===MANIFEST||seen.has(name.toLowerCase())||!/^[a-f0-9]{64}$/.test(value.files[name]))throw new Error('更新文件清单条目无效。');seen.add(name.toLowerCase());}return value;
}
function validatePackage(files,releaseVersion){
  const metadata=JSON.parse(files.get('package.json')?.toString('utf8')||'null');if(metadata?.name!=='devin-desktop-zh'||metadata.version!==releaseVersion||metadata.homepage!=='https://github.com/'+REPO)throw new Error('更新包项目或版本不匹配。');
  const manifest=validateManifest(JSON.parse(files.get(MANIFEST)?.toString('utf8')||'null'),releaseVersion);if(Object.keys(manifest.files).length!==files.size-1)throw new Error('更新包与文件清单不一致。');for(const[name,hash]of Object.entries(manifest.files))if(!files.has(name)||sha(files.get(name))!==hash)throw new Error('更新文件校验失败：'+name);
  for(const name of ['scripts/tool-update.js','scripts/gui-backend.js','scripts/build-windows-gui.ps1','scripts/launcher-windows.cs','汉化工具-Start-Windows.vbs','src/cli.js'])if(!files.has(name))throw new Error('更新包缺少入口：'+name);return manifest;
}
function updateBase(projectDir){const root=path.resolve(projectDir),directory=path.join(root,'cache/tool-updates');if(fs.existsSync(path.join(root,'.git')))throw new Error('当前是 Git 源码目录，请通过 Git 更新或从 GitHub 下载发行包。');noLinks(root,directory);fs.mkdirSync(directory,{recursive:true});return directory;}
function alive(pid){if(!Number.isSafeInteger(pid)||pid<=0)return false;try{process.kill(pid,0);return true;}catch(error){return error.code==='EPERM';}}
function readJSON(file,maximum=2*1024*1024){const stat=fs.statSync(file);if(!stat.isFile()||stat.size>maximum)throw new Error('本机更新记录无效。');return JSON.parse(fs.readFileSync(file,'utf8'));}
function atomicWrite(file,data){
  const temporary=file+'.update-'+crypto.randomBytes(8).toString('hex')+'.tmp';
  let descriptor;try{descriptor=fs.openSync(temporary,'wx');fs.writeFileSync(descriptor,data);fs.fsyncSync(descriptor);fs.closeSync(descriptor);descriptor=undefined;fs.renameSync(temporary,file);}
  finally{if(descriptor!==undefined)fs.closeSync(descriptor);if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
}
function writeJournal(file,value){atomicWrite(file,JSON.stringify(value,null,2)+'\n');}
function publishLock(file,value){
  const temporary=file+'.lock-'+crypto.randomBytes(8).toString('hex')+'.tmp';let descriptor;
  try{
    // A hard link atomically publishes complete, durable bytes and fails if a
    // competing updater already owns active.json. Never rename over its lock.
    descriptor=fs.openSync(temporary,'wx');fs.writeFileSync(descriptor,JSON.stringify(value));fs.fsyncSync(descriptor);fs.closeSync(descriptor);descriptor=undefined;
    fs.linkSync(temporary,file);
  }catch(error){
    if(error.code==='EEXIST')throw new Error('另一窗口正在更新汉化工具，请稍后重试。');
    throw error;
  }finally{
    if(descriptor!==undefined)fs.closeSync(descriptor);
    try{fs.unlinkSync(temporary);}catch{}
  }
}
function rollback(projectDir,journal,journalFile){
  if(journal.schema!==1||journal.root!==path.resolve(projectDir)||!Array.isArray(journal.entries)||journal.entries.length>5001)throw new Error('中断更新记录无效，请保留 cache/tool-updates 排查。');
  const backupRoot=path.dirname(journalFile);for(const item of [...journal.entries].reverse()){
    const file=location(projectDir,item.relative),backup=location(backupRoot,'previous/'+item.relative);noLinks(projectDir,file);noLinks(backupRoot,backup);
    const actual=fs.existsSync(file)?sha(fs.readFileSync(file)):null;if(actual!==item.afterHash&&actual!==item.beforeHash)throw new Error('更新中断后文件又被修改，已保留备份：'+item.relative);
    if(item.beforeHash!==null){if(!/^[a-f0-9]{64}$/.test(item.beforeHash)||!fs.existsSync(backup)||sha(fs.readFileSync(backup))!==item.beforeHash)throw new Error('更新恢复备份校验失败。');fs.mkdirSync(path.dirname(file),{recursive:true});atomicWrite(file,fs.readFileSync(backup));}else if(actual!==null)fs.unlinkSync(file);
  }
  journal.status='rolled-back';writeJournal(journalFile,journal);
}
function recoverUpdate(projectDir){
  const directory=path.join(path.resolve(projectDir),'cache/tool-updates'),lock=path.join(directory,'active.json');if(!fs.existsSync(lock))return false;noLinks(projectDir,lock);const state=readJSON(lock,4096);if(alive(state.pid))throw new Error('另一窗口正在更新汉化工具，请稍后重试。');
  if(typeof state.run!=='string'||!/^[a-z0-9-]+$/.test(state.run))throw new Error('更新恢复路径无效。');const journalFile=path.join(directory,state.run,'journal.json');noLinks(projectDir,journalFile);
  if(fs.existsSync(journalFile)){const journal=readJSON(journalFile);if(journal.status==='writing')rollback(projectDir,journal,journalFile);else if(!['staged','committed','rolled-back'].includes(journal.status))throw new Error('更新恢复状态无效。');}
  fs.unlinkSync(lock);return true;
}
function installFiles(projectDir,files,releaseVersion,{beforeWrite=()=>{}}={}){
  validatePackage(files,releaseVersion);recoverUpdate(projectDir);const directory=updateBase(projectDir),root=path.resolve(projectDir),oldVersion=readJSON(path.join(root,'package.json')).version;
  if(!newer(releaseVersion,oldVersion))throw new Error('仅允许更新到更高正式版本。');
  if(!fs.existsSync(path.join(root,MANIFEST)))throw new Error('当前目录缺少正式发布的更新清单，请先从 GitHub 下载新版 Windows 发行包。');
  const old=validateManifest(readJSON(path.join(root,MANIFEST)),oldVersion);
  const run=new Date().toISOString().replace(/[^0-9]/g,'')+'-'+crypto.randomBytes(4).toString('hex'),runDir=path.join(directory,run),lock=path.join(directory,'active.json'),journalFile=path.join(runDir,'journal.json');
  fs.mkdirSync(runDir);
  const recovery=fs.readFileSync(__filename);fs.writeFileSync(path.join(runDir,'recovery.js'),recovery);
  publishLock(lock,{pid:process.pid,run,recoveryHash:sha(recovery)});let journal;
  try{
    const entries=[];
    for(const[relative,data]of files){const file=location(root,relative);noLinks(root,file);let beforeHash=null;
      if(fs.existsSync(file)){if(!fs.statSync(file).isFile())throw new Error('更新目标不是文件：'+relative);beforeHash=sha(fs.readFileSync(file));if(relative!==MANIFEST&&(!Object.hasOwn(old.files,relative)||old.files[relative]!==beforeHash))throw new Error('保留本机修改，未覆盖文件：'+relative);const backup=location(runDir,'previous/'+relative);fs.mkdirSync(path.dirname(backup),{recursive:true});fs.copyFileSync(file,backup);}
      const staged=location(runDir,'next/'+relative);fs.mkdirSync(path.dirname(staged),{recursive:true});fs.writeFileSync(staged,data);entries.push({relative,beforeHash,afterHash:sha(data)});
    }
    // Keep package/version and ownership manifest until all executable sources are in place.
    entries.sort((a,b)=>(a.relative===MANIFEST?2:a.relative==='package.json'?1:0)-(b.relative===MANIFEST?2:b.relative==='package.json'?1:0));
    journal={schema:1,root,from:oldVersion,to:releaseVersion,status:'staged',entries};writeJournal(journalFile,journal);journal.status='writing';writeJournal(journalFile,journal);
    for(const item of entries){beforeWrite(item.relative);const file=location(root,item.relative);noLinks(root,file);const actual=fs.existsSync(file)?sha(fs.readFileSync(file)):null;if(actual!==item.beforeHash)throw new Error('文件在更新过程中变化：'+item.relative);fs.mkdirSync(path.dirname(file),{recursive:true});atomicWrite(file,fs.readFileSync(location(runDir,'next/'+item.relative)));}
    journal.status='committed';writeJournal(journalFile,journal);fs.unlinkSync(lock);return {version:releaseVersion,backup:runDir,entry:path.join(root,'汉化工具-Start-Windows.vbs')};
  }catch(error){if(journal?.status==='writing'){try{rollback(root,journal,journalFile);}catch(recovery){throw new Error(error.message+'；自动恢复未完成：'+recovery.message);}}if(fs.existsSync(lock))fs.unlinkSync(lock);throw error;}
}
async function updateTool({projectDir=path.resolve(__dirname,'..'),expectedVersion,fetchImpl,signal,onProgress=()=>{},...options}={}){
  if(fs.existsSync(path.join(projectDir,'.git')))throw new Error('当前是 Git 源码目录，请通过 Git 更新或从 GitHub 下载发行包。');recoverUpdate(projectDir);
  const release=await checkUpdate({projectDir,fetchImpl,signal,...options});if(!release.available||release.version!==expectedVersion)throw new Error('最新发布已变化，请重新检查更新。');
  onProgress({message:'正在核对正式发布的校验值',busy:true});const sums=await bytes(release.checksums.url,{fetchImpl,signal,maxBytes:65536,timeoutMs:15000});
  const expectedHash=checksum(sums,release.zip.name);
  const archive=await bytes(release.zip.url,{fetchImpl,signal,maxBytes:MAX_ZIP,timeoutMs:60000,onProgress:event=>onProgress({message:'正在下载新版汉化工具',...event})});if(release.zip.size!==null&&archive.length!==release.zip.size||sha(archive)!==expectedHash)throw new Error('新版汉化工具 SHA256 校验失败。');
  if(signal?.aborted)throw new Error('已取消更新。');onProgress({message:'正在备份并更新工具文件',busy:true});const result=installFiles(projectDir,readArchive(archive).files,release.version);return {...result,type:'tool-updated',message:'汉化工具已更新；本机配置和恢复备份已保留。'};
}
module.exports={checkUpdate,updateTool,recoverUpdate,installFiles,appendManifest,readArchive,manifestFor,validatePackage,version,newer,publicURL,bytes,sha,crc32,MANIFEST};
if(require.main===module){try{if(process.argv[2]!=='--recover')throw new Error('此脚本由汉化工具窗口调用。');recoverUpdate(process.argv[3]||path.resolve(__dirname,'..'));}catch(error){console.error(error.message);process.exitCode=1;}}
