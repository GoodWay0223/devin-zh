#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const {appRoot} = require('../src/config');
let cachedWindowsHints;
const windowsHints = () => cachedWindowsHints ??= require('./windows-installation').readWindowsHints();
const TARGETS = ['product.json', 'out/vs/workbench/windsurf-chat-client/index.js',
  'out/vs/sessions/sessions.desktop.main.js', 'out/nls.messages.js', 'out/nls.messages.json', 'out/nls.keys.json'];

function checkNode(version = process.versions.node) {
  const [major, minor] = version.split('.').map(Number);
  if (!(major > 22 || major === 22 && minor >= 13))
    throw new Error('需要 Node.js 22.13+，推荐 24 LTS。安装：https://nodejs.org/zh-cn/download');
}
function resolveInstallation(input, {platform = process.platform, home = os.homedir()} = {}) {
  const p = platform === 'win32' ? path.win32 : path.posix;
  let value = input.trim().replace(/^(["'])(.*)\1$/, '$2');
  if (platform === 'darwin') value = value.replace(/\\ /g, ' ').replace(/^~(?=\/)/, home);
  if (!p.isAbsolute(value)) throw new Error('请输入完整的绝对路径。');
  const selected = p.resolve(value);
  if (/\.exe$/i.test(selected)) return p.join(p.dirname(selected), 'resources', 'app');
  if (/\.app$/i.test(selected)) return p.join(selected, 'Contents', 'Resources', 'app');
  const candidates = [selected, p.join(selected, 'resources', 'app'), p.join(selected, 'Contents', 'Resources', 'app')];
  return candidates.find(candidate => fs.existsSync(p.join(candidate, 'product.json'))) || selected;
}
function validInstallation(root) {
  return TARGETS.every(relative => {
    try { return fs.statSync(path.join(root, relative)).isFile(); } catch { return false; }
  });
}
function discover({env = process.env, platform = process.platform, projectDir = ROOT, home = os.homedir(), hints} = {}) {
  const preferred = appRoot({env, platform, projectDir});
  // Respect a remembered/explicit installation instead of asking again when
  // another copy exists. A stale setting must not block fresh OS discovery.
  if (validInstallation(preferred)) return [preferred];
  const roots = [preferred];
  if (platform === 'darwin') roots.push(path.join(home, 'Applications/Devin.app/Contents/Resources/app'));
  if (platform === 'win32') {
    for (const prefix of [env.ProgramFiles, env['ProgramFiles(x86)']].filter(Boolean))
      roots.push(path.join(prefix, 'Devin', 'resources', 'app'));
    const {executableFromIcon} = require('./windows-installation');
    hints ??= process.platform === 'win32' ? windowsHints() : [];
    for (const hint of hints) {
      if (hint.kind === 'drive') {
        // A few conventional folders per local drive; never scan entire disks.
        for (const folder of ['Devin','Apps/Devin','Applications/Devin','AI/Devin','Program Files/Devin'])
          roots.push(path.win32.join(hint.path,folder,'resources','app'));
      } else if (hint.kind !== 'tool') {
        try {roots.push(resolveInstallation(hint.kind === 'icon' ? executableFromIcon(hint.path) : hint.path,{platform}));} catch {}
      }
    }
  }
  const unique = new Map();
  for (const root of roots) if (validInstallation(root)) {
    const resolved = fs.realpathSync(root), key = platform === 'win32' ? resolved.toLowerCase() : resolved;
    if (!unique.has(key)) unique.set(key,resolved);
  }
  return [...unique.values()];
}
function saveLocal(root, {projectDir = ROOT, packFile} = {}) {
  const file = path.join(projectDir, '.devin-zh.local.json');
  const before = fs.existsSync(file) ? fs.readFileSync(file) : null;
  const previous = before ? JSON.parse(before.toString('utf8')) : {};
  const next = {...previous, appRoot: root, ...(packFile ? {packFile} : {})};
  const after = Buffer.from(JSON.stringify(next, null, 2) + '\n');
  if (before?.equals(after)) return;
  if (before) {
    const backup = path.join(projectDir, 'cache', 'launcher-settings', `${Date.now()}-${process.pid}.json`);
    fs.mkdirSync(path.dirname(backup), {recursive:true});
    fs.writeFileSync(backup, before, {flag:'wx'});
    console.log('原本机设置已备份：' + backup);
  }
  const temp = file + '.tmp-zh';
  try {
    fs.writeFileSync(temp, after, {flag:'wx'});
    if (before && !fs.readFileSync(file).equals(before)) throw new Error('本机设置已被另一操作更改，未覆盖。');
    if (!before && fs.existsSync(file)) throw new Error('本机设置已由另一操作创建，未覆盖。');
    fs.renameSync(temp, file);
  } finally {if (fs.existsSync(temp)) fs.unlinkSync(temp);}
}
function ensureDependencies() {
  try {
    const acorn = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules/acorn/package.json'), 'utf8'));
    if (acorn.version === require('../package.json').dependencies.acorn) return;
  } catch {}
  console.log('首次启动，正在自动准备运行环境，请稍候（需要联网）…');
  // Use Node to run npm directly, with no shell and no command interpolation.
  const npmCli = [path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')].find(fs.existsSync);
  if (!npmCli) throw new Error('未找到 npm。请安装官方 Node.js（含 npm），再重新双击。');
  const result = cp.spawnSync(process.execPath, [npmCli, 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], {cwd:ROOT, stdio:'inherit', windowsHide:true});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('依赖安装失败。检查网络后重新双击；Devin 安装未修改。');
}
function runCli(args, env, json = false) {
  const result = cp.spawnSync(process.execPath, [path.join(ROOT, 'src/cli.js'), ...args],
    {cwd:ROOT, env, encoding:'utf8', stdio:json ? ['ignore','pipe','pipe'] : 'inherit', windowsHide:true, maxBuffer:8*1024*1024});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(json ? result.stderr.trim() || '准备失败，未应用。' : '操作未完成，原因见上方。');
  return json ? JSON.parse(result.stdout) : undefined;
}
function localPack() {
  const file = path.join(ROOT, '.devin-zh.local.json');
  return process.env.DEVIN_ZH_PACK || (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,'utf8')).packFile : undefined)
    || path.join(ROOT,'cache/zh/extension/translations/main.i18n.json');
}
async function main() {
  checkNode();
  const platform = process.platform;
  if (!['win32','darwin'].includes(platform)) {
    if (process.argv.includes('--check')) { console.log('入口检查通过；此平台只用于 CI，交互入口面向 Windows/macOS。'); return; }
    throw new Error('双击入口适用于 Windows 和 macOS。');
  }
  if (process.argv.includes('--check')) {
    console.log(JSON.stringify({platform, node:process.versions.node, installations:discover(), mode:platform === 'win32' ? 'apply' : 'preview'},null,2)); return;
  }
  console.log(`\nDevin 汉化工具 ${require('../package.json').version} · ${platform === 'win32' ? 'Windows' : 'macOS 预览版'}\n`);
  if (platform === 'darwin') console.log('macOS 仅检查和生成报告，不修改官方 .app；尚未验证签名及实际启动。\n');
  ensureDependencies();
  const readline = require('node:readline/promises').createInterface({input:process.stdin,output:process.stdout});
  async function chooseRoot(force = false) {
    if (!force) console.log('正在自动查找 Devin…');
    const found = discover();
    if (!force && found.length === 1) {
      saveLocal(found[0]);
      console.log('已自动找到 Devin，无需填写路径。');
      return found[0];
    }
    if (!force && found.length > 1) {
      console.log('发现多个安装，请选择：'); found.forEach((root,index)=>console.log(`${index+1}. ${root}`));
      const choice = Number(await readline.question('安装序号（回车手动输入）：'));
      if (Number.isInteger(choice) && choice > 0 && choice <= found.length) {saveLocal(found[choice-1]); return found[choice-1];}
    }
    if (platform === 'win32' && !force) {
      console.log('没有找到完整安装，请在文件选择窗口点选 Devin.exe。');
      const selected = require('./windows-installation').chooseExecutable();
      if (!selected) return null;
      const root = resolveInstallation(selected);
      if (!validInstallation(root)) throw new Error('所选程序旁没有完整的 Devin 界面文件，此布局暂不支持。');
      saveLocal(root); return root;
    }
    while (true) {
      const input = await readline.question(platform === 'win32' ? '粘贴 Devin.exe、安装文件夹或 resources\\app 的完整路径（0 退出）：'
        : '粘贴 Devin.app 或 Contents/Resources/app 的完整路径（0 退出）：');
      if (input.trim() === '0') return null;
      try {
        const root = resolveInstallation(input);
        if (!validInstallation(root)) throw new Error('未发现完整的 Devin 界面文件。如果只有 app.asar，此布局暂不支持。');
        saveLocal(root); return root;
      } catch (error) {console.log(error.message);}
    }
  }
  try {
    let root = await chooseRoot();
    while (root) {
      console.log('\n当前安装：' + root);
      console.log(`1. ${platform === 'win32' ? '开始汉化' : '准备汉化报告'}：Agent 和聊天界面（无需额外语言包）`);
      console.log(`2. ${platform === 'win32' ? '完整汉化' : '准备完整报告'}：Agent + 编辑器菜单（需匹配的中文语言包）`);
      console.log('3. 检查安装和兼容性');
      if (platform === 'win32') console.log('4. 恢复当前版本原版\n5. 恢复上次中断操作');
      console.log('6. 更换安装目录\n0. 退出');
      const choice = (await readline.question('输入序号，回车选择 1：')).trim() || '1';
      if (choice === '0') break;
      if (choice === '6') {root = await chooseRoot(true); continue;}
      const env = {...process.env,DEVIN_APP:root};
      try {
        if (platform === 'win32' && ['1','2','3','4'].includes(choice)) require('./launcher-backups').importVerifiedBackup(root, {projectDir:ROOT,
          toolDirs:windowsHints().filter(hint=>hint.kind==='tool').map(hint=>hint.path)});
        if (choice === '1' || choice === '2') {
          if (choice === '2') {
            const pack = await require('./language-pack').ensureLanguagePack({root,projectDir:ROOT,
              toolDirs:platform==='win32'?windowsHints().filter(hint=>hint.kind==='tool').map(hint=>hint.path):[],
              onProgress:event=>{if(event.phase==='local-search'||event.phase==='query'||event.phase==='ready')console.log(event.message);}});
            env.DEVIN_ZH_PACK = pack.packFile;
          }
          console.log('正在验证原版、备份并生成本版本补丁…大型客户端可能需要几分钟，请保持窗口打开。');
          const run = require('./gui-backend').createRunner({projectDir:ROOT,log:()=>{},emit:event=>{
            const counter=event.total>0?`[${event.completed}/${event.total}] `:'';
            if(process.stdout.isTTY){process.stdout.write('\r\x1b[2K'+counter+event.message);}else console.log(counter+event.message);
          }});
          const plan = await run(process.execPath,[path.join(ROOT,'src/cli.js'),'prepare','--scope='+ (choice === '2' ? 'all' : 'web'),'--progress'],{env,structured:true});
          console.log('');
          console.log('准备通过，报告：' + plan.reportFile);
          if (platform === 'darwin') {console.log('macOS 预览完成。官方 .app 没有修改。'); continue;}
          console.log('请先保存工作并完全退出 Devin。应用后可用菜单 4 恢复原版。');
          const reply = (await readline.question('回车应用汉化；输入 0 取消：')).trim();
          if (reply !== '') {console.log('已取消应用，保留准备报告。'); continue;}
          runCli(['apply','--prepared='+plan.reportFile],env);
          console.log('汉化完成。请重新打开 Devin 检查界面；保留此工具文件夹用于更新和恢复。');
        } else if (choice === '3') {
          runCli(['status'],env); runCli(['doctor','--scope=web'],env);
        } else if (platform === 'win32' && ['4','5'].includes(choice)) {
          const reply = (await readline.question('请保存工作并退出 Devin。回车执行恢复，输入 0 取消：')).trim();
          if (!reply) runCli([choice === '4' ? 'restore' : 'recover'],env);
        } else console.log('请输入菜单中显示的序号。');
      } catch(error) {console.log('\n' + error.message + '\n安装写入若中断，请用菜单 5；未知修改不会被覆盖。');}
    }
  } finally {readline.close();}
}
if (require.main === module) main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports = {checkNode,resolveInstallation,validInstallation,discover,saveLocal,runCli};
