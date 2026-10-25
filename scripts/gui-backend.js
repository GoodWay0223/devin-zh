#!/usr/bin/env node
'use strict';
const fs=require('node:fs'), path=require('node:path'), cp=require('node:child_process');
const readline=require('node:readline'), crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..');
const toolUpdate=require('./tool-update');
const launcher=require('./launcher');
const MUTATIONS=new Set(['apply','restore','recover','update-tool']);

function createRunner({projectDir=ROOT,emit,signal,log}={}) {
  return (program,args,{env=process.env,structured=false}={})=>new Promise((resolve,reject)=>{
    const child=cp.spawn(program,args,{cwd:projectDir,env,windowsHide:true,stdio:['ignore','pipe','pipe'],signal});
    let errorText='', result=null;
    const lines=readline.createInterface({input:child.stdout});
    lines.on('line',line=>{
      log(line);
      if (structured) {
        let event; try {event=JSON.parse(line);} catch {return;}
        if (event.type==='progress') emit(event);
        else if (event.type==='prepared') result=event;
      }
    });
    child.stderr.on('data',chunk=>{const value=chunk.toString('utf8');errorText+=value;log(value);});
    child.on('error',reject);
    child.on('close',code=>{lines.close(); code===0 ? resolve(result) : reject(new Error(errorText.trim() || '操作未完成，详细原因已保存到日志。'));});
  });
}
async function ensureDependencies({run,projectDir=ROOT,emit}) {
  try {if (JSON.parse(fs.readFileSync(path.join(projectDir,'node_modules/acorn/package.json'),'utf8')).version===require('../package.json').dependencies.acorn) return;} catch {}
  emit({type:'progress',message:'首次使用，正在自动准备运行环境',busy:true});
  const npm=[path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),
    path.resolve(path.dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js')].find(fs.existsSync);
  if (!npm) throw new Error('没有找到 npm，请重新安装官方 Node.js（包含 npm）。');
  await run(process.execPath,[npm,'ci','--ignore-scripts','--no-audit','--no-fund']);
}
function appInfo(root) {
  const product=JSON.parse(fs.readFileSync(path.join(root,'product.json'),'utf8'));
  return {root,location:path.resolve(root,'..','..'),version:product.windsurfVersion || product.version};
}
async function operate(request,{emit,signal,log,projectDir=ROOT,discover=launcher.discover,fetchImpl}={}) {
  launcher.checkNode();
  const command=request.command;
  if (!['detect','prepare','apply','restore','recover','status','check-tool-update','update-tool'].includes(command)) throw new Error('未知操作。');
  if(command==='check-tool-update'){
    try{const release=await toolUpdate.checkUpdate({projectDir,signal,fetchImpl});return {type:release.available?'update-available':'update-current',version:release.version,currentVersion:release.currentVersion,sourceCheckout:release.sourceCheckout,url:release.url};}
    catch(error){log(error.message);return {type:'update-unavailable',message:'暂时无法检查更新，可稍后重试。汉化功能不受影响。'};}
  }
  if(command==='update-tool')return toolUpdate.updateTool({projectDir,expectedVersion:request.expectedVersion,signal,fetchImpl,
    onProgress:event=>emit({type:'progress',message:event.message,busy:!event.totalBytes,completed:event.receivedBytes,total:event.totalBytes,unit:'bytes'})});
  toolUpdate.recoverUpdate(projectDir);
  const root=request.root ? launcher.resolveInstallation(request.root) : null;
  if (command==='detect') {
    emit({type:'progress',message:'正在自动查找 Devin',busy:true});
    const roots=root ? (launcher.validInstallation(root)?[root]:[]) : discover({projectDir});
    return {type:'detected',installations:roots.map(appInfo),version:require('../package.json').version};
  }
  if (!root || !launcher.validInstallation(root)) throw new Error('没有找到完整的 Devin 安装，请选择 Devin.exe。');
  const run=createRunner({projectDir,emit,signal,log});
  const env={...process.env,DEVIN_APP:root};
  const cli=path.join(projectDir,'src','cli.js');
  if (MUTATIONS.has(command)) {
    require('../src/install').assertStopped(root);
  }
  emit({type:'progress',message:'正在检查恢复备份',busy:true});
  if (process.platform==='win32' && command!=='recover') {
    const hints=require('./windows-installation').readWindowsHints();
    const originalLog=console.log; console.log=(...parts)=>log(parts.join(' '));
    try {
      if (command==='prepare') launcher.saveLocal(root,{projectDir});
      require('./launcher-backups').importVerifiedBackup(root,{projectDir,toolDirs:hints.filter(hint=>hint.kind==='tool').map(hint=>hint.path)});
    }
    finally {console.log=originalLog;}
  }
  if (command==='status') {
    const I=require('../src/install'), baseline=I.loadBaseline({root,cacheDir:path.join(projectDir,'cache/installations')});
    const checks=I.integrityStatus(baseline), unknown=checks.filter(x=>['unknown','missing'].includes(x.status));
    if (unknown.length) throw new Error('发现未知修改或缺失文件，请查看日志后排查。');
    return {type:'checked',message:`检查通过，${checks.filter(x=>x.status==='patch').length} 处已记录的汉化差异，无未知修改。`};
  }
  await ensureDependencies({run,projectDir,emit});
  if (command==='prepare') {
    const scope=request.scope || 'all';
    if (!['all','web'].includes(scope)) throw new Error('请选择完整汉化或聊天界面汉化。');
    if (scope==='all') {
      const {ensureLanguagePack}=require('./language-pack');
      const hints=process.platform==='win32' ? require('./windows-installation').readWindowsHints() : [];
      const pack=await ensureLanguagePack({root,projectDir,signal,toolDirs:hints.filter(hint=>hint.kind==='tool').map(hint=>hint.path),
        onProgress:event=>emit({type:'progress',message:event.message,busy:!event.totalBytes,
          completed:event.receivedBytes,total:event.totalBytes,unit:'bytes'})});
      env.DEVIN_ZH_PACK=pack.packFile;
      emit({type:'progress',message:'已取得匹配的编辑器中文资源',busy:false});
    }
    return await run(process.execPath,[cli,'prepare','--scope='+scope,'--progress'],{env,structured:true});
  }
  if (command==='apply' && (!request.reportFile || !path.isAbsolute(request.reportFile))) throw new Error('请先准备本版本的汉化结果。');
  emit({type:'progress',message:command==='apply' ? '正在应用汉化' : command==='restore' ? '正在恢复原版' : '正在恢复中断的操作',busy:true});
  await run(process.execPath,[cli,command,...(command==='apply'?['--prepared='+request.reportFile]:[])],{env});
  return {type:'done',message:command==='apply' ? '汉化完成，可以重新打开 Devin。' : '恢复完成，可以重新打开 Devin。'};
}
function main() {
  const input=readline.createInterface({input:process.stdin});
  const abort=new AbortController(); let active=false, mutation=false;
  let logFile;
  const emit=event=>process.stdout.write(JSON.stringify(event)+'\n');
  const log=value=>{
    if (!logFile) return;
    fs.appendFileSync(logFile,String(value)+'\n');
  };
  input.on('line',async line=>{
    let request; try {request=JSON.parse(line);} catch {emit({type:'error',message:'请求格式无效。'});input.close();process.exitCode=1;return;}
    if (active) {if (request.command==='cancel' && !mutation) abort.abort(); return;}
    active=true; mutation=MUTATIONS.has(request.command);
    try {
      const logDir=path.join(ROOT,'cache','logs');fs.mkdirSync(logDir,{recursive:true});
      logFile=path.join(logDir,'gui-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(4).toString('hex')+'.log');
      emit({type:'log-file',path:logFile});
      const result=await operate(request,{emit,signal:abort.signal,log});
      if (!result) throw new Error('没有收到有效的准备结果，请查看日志。');
      emit(result);
    } catch(error) {
      log(error.stack || error.message);
      emit(abort.signal.aborted ? {type:'cancelled',message:'已取消准备，Devin 安装未修改。'} : {type:'error',message:error.message,logFile});
      process.exitCode=abort.signal.aborted ? 2 : 1;
    } finally {input.close();}
  });
}
if (require.main===module) main();
module.exports={operate,createRunner,ensureDependencies,appInfo};
