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
  const zipName = `devin-desktop-zh-${pkg.version}.zip`;
  fs.writeFileSync(path.join(directory,scriptName),built.source);
  // Archive only reviewed, version-controlled source. No cache, app files or local configuration.
  git(['archive','--format=zip','--prefix=devin-zh/','--output='+path.join(directory,zipName),'HEAD']);
  const {source,...report} = built;
  report.sha256 = crypto.createHash('sha256').update(source).digest('hex');
  report.toolVersion = pkg.version;
  report.commit = git(['rev-parse','HEAD']).trim();
  fs.writeFileSync(path.join(directory,'build-report.json'),JSON.stringify(report,null,2)+'\n');
  const assets = [scriptName,zipName,'build-report.json'];
  const sums = assets.map(name=>crypto.createHash('sha256').update(fs.readFileSync(path.join(directory,name))).digest('hex')+'  '+name);
  fs.writeFileSync(path.join(directory,'SHA256SUMS'),sums.join('\n')+'\n');
  const changelog = fs.readFileSync(path.join(ROOT,'CHANGELOG.md'),'utf8');
  const section = changelog.split('\n## ').find(part=>part.startsWith(pkg.version+' / '));
  if (!section) throw new Error('Add a CHANGELOG section for the current tool version before publishing.');
  const notes = `## 下载与安装\n\n- 网页脚本：\`${scriptName}\`，在 Tampermonkey 安装或替换后刷新网页。\n- Windows 客户端汉化工具：\`${zipName}\`，源码工具包，需要 Node.js 22+，解压后 \`npm ci --ignore-scripts\`。不含 Devin 官方程序或微软语言包。\n- 校验下载内容：\`SHA256SUMS\`；网页版词条与来源信息见 \`build-report.json\`。\n\n客户端首次使用先指定 \`DEVIN_APP\`，执行检查和 \`prepare --scope=web\`；完全退出后应用新报告。请阅读仓库的客户端安装及更新指南。\n\n## 本次更新\n\n${section.slice(section.indexOf('\n')+1).trim()}\n`;
  fs.writeFileSync(path.join(directory,'RELEASE_NOTES.md'),notes);
  console.log(JSON.stringify({directory,toolVersion:pkg.version,webVersion:built.version,assets:[...assets,'SHA256SUMS']},null,2));
  return {directory,assets};
}
if (require.main === module) {
  try { buildRelease(process.argv[2]); } catch(error) {console.error(error.message);process.exitCode=1;}
}
module.exports={buildRelease};
