'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {preflight} = require('./public-preflight');
const {buildUserscript} = require('../web/build');
const ROOT = path.resolve(__dirname,'..');
const git = args => execFileSync('git',args,{cwd:ROOT,encoding:'utf8',maxBuffer:128*1024*1024});
function buildRelease(output=path.join(ROOT,'release-assets')) {
  if (git(['status','--porcelain','--untracked-files=normal']).trim())
    throw new Error('Commit reviewed publication files first. Release archives HEAD and requires a clean working tree.');
  preflight();
  const pkg = require('../package.json');
  const built = buildUserscript();
  const directory = path.resolve(output);
  fs.mkdirSync(directory,{recursive:true});
  const scriptName = `Devin-Web-Zh-${built.version}.user.js`;
  const archives = [
    {name:`Devin-Desktop-Zh-Windows-${pkg.version}.zip`,exclude:['Start-macOS.command']},
    {name:`Devin-Desktop-Zh-macOS-Preview-${pkg.version}.zip`,exclude:['Start-Windows.cmd','Start-Windows.vbs']}
  ];
  fs.writeFileSync(path.join(directory,scriptName),built.source);
  // Archive only reviewed, version-controlled source. No cache, app files or local configuration.
  const tracked = git(['ls-tree','-r','--name-only','HEAD']).trim().split('\n');
  for (const archive of archives)
    git(['archive','--format=zip','--prefix=devin-zh/','--output='+path.join(directory,archive.name),'HEAD','--',...tracked.filter(file=>!archive.exclude.includes(file))]);
  const {source,...report} = built;
  report.sha256 = crypto.createHash('sha256').update(source).digest('hex');
  report.toolVersion = pkg.version;
  report.commit = git(['rev-parse','HEAD']).trim();
  fs.writeFileSync(path.join(directory,'build-report.json'),JSON.stringify(report,null,2)+'\n');
  const assets = [scriptName,...archives.map(archive=>archive.name),'build-report.json'];
  const sums = assets.map(name=>crypto.createHash('sha256').update(fs.readFileSync(path.join(directory,name))).digest('hex')+'  '+name);
  fs.writeFileSync(path.join(directory,'SHA256SUMS'),sums.join('\n')+'\n');
  const changelog = fs.readFileSync(path.join(ROOT,'CHANGELOG.md'),'utf8');
  const section = changelog.split('\n## ').find(part=>part.startsWith(pkg.version+' / '));
  if (!section) throw new Error('Add a CHANGELOG section for the current tool version before publishing.');
  const notes = `## 下载与安装\n\n- 网页脚本：\`${scriptName}\`，在 Tampermonkey 替换后刷新网页。\n- **Windows**：\`${archives[0].name}\`，解压进入 \`devin-zh\`，**双击 \`Start-Windows.vbs\`** 打开按钮窗口；旧 \`Start-Windows.cmd\` 也会打开此窗口。默认完整汉化自动查找或下载匹配的微软中文资源，显示步骤/下载进度。准备后退出 Devin，再点【应用汉化】。\n- **macOS 预览**：\`${archives[1].name}\`，双击 \`Start-macOS.command\`。中文资源自动准备，显示步骤；**暂不能应用到官方 .app**，尚无实际 Mac 签名/启动验收。\n- 需要 Node.js 22.13+（推荐 24 LTS）；Windows 使用系统自带 .NET Framework 生成窗口，不安装额外 GUI 框架。工具包不附带 Devin 或微软语言包，仅在需要时从微软获取翻译数据。\n- 完整说明：包内 \`START_HERE.md\`。升级工具时保留旧 \`cache/\` 和本机配置。\n- 校验值：\`SHA256SUMS\`；网页构建信息：\`build-report.json\`。\n\n## 本次更新\n\n${section.slice(section.indexOf('\n')+1).trim()}\n`;
  fs.writeFileSync(path.join(directory,'RELEASE_NOTES.md'),notes);
  console.log(JSON.stringify({directory,toolVersion:pkg.version,webVersion:built.version,assets:[...assets,'SHA256SUMS']},null,2));
  return {directory,assets};
}
if (require.main === module) {
  try { buildRelease(process.argv[2]); } catch(error) {console.error(error.message);process.exitCode=1;}
}
module.exports={buildRelease};
