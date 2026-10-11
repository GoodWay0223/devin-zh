'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {buildUserscript} = require('../web/build');
const ROOT = path.resolve(__dirname, '..');
const git = args => execFileSync('git', args, {cwd:ROOT, encoding:'utf8', maxBuffer:128*1024*1024});
const forbidden = /(^|\/)(cache|node_modules|release-assets)(\/|$)|(^|\/)(\.env(?:\.[^/]*)?|\.devin-zh\.local\.json)$|\.(?:exe|vsix|log|bak-zh|tmp-zh)$/i;
const credentials = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b/],
  ['provider key', /\bsk-(?:proj-|ant-(?:api\d+-)?)?[A-Za-z0-9_-]{40,}\b/],
  ['AWS key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\b/]
];
function scanContent(text, location, problems) {
  for (const [label, pattern] of credentials) {
    const match = pattern.exec(text);
    if (match) problems.push(`${location}:${text.slice(0,match.index).split('\n').length}: possible ${label} (value redacted)`);
  }
}
function preflight() {
  const problems = [];
  const files = git(['ls-files','-z']).split('\0').filter(Boolean);
  for (const file of files) {
    if (forbidden.test(file)) problems.push('Forbidden publication path: ' + file);
    const full = path.join(ROOT,file);
    if (!fs.existsSync(full)) problems.push('Tracked file missing: ' + file);
    else scanContent(fs.readFileSync(full,'utf8'),file,problems);
  }
  const objects = git(['rev-list','--objects','--all']).trim().split('\n').filter(Boolean).map(line=>{
    const index = line.indexOf(' ');
    return {sha:index<0?line:line.slice(0,index),name:index<0?'':line.slice(index+1)};
  });
  const types = execFileSync('git',['cat-file','--batch-check=%(objectname) %(objecttype)'],
    {cwd:ROOT,input:objects.map(x=>x.sha).join('\n')+'\n',encoding:'utf8'}).trim().split('\n');
  let blobs = 0;
  for (let i=0;i<objects.length;i++) {
    const object = objects[i];
    if (object.name && forbidden.test(object.name)) problems.push('Forbidden history path: ' + object.name);
    if (!types[i].endsWith(' blob')) continue;
    blobs++;
    scanContent(git(['cat-file','blob',object.sha]),'history/'+object.sha.slice(0,12)+'/'+object.name,problems);
  }
  for (const file of ['LICENSE','LICENSES/KawaYiLab-Devin-Web-Chinese-MIT.txt','THIRD_PARTY_NOTICES.md',
    'package-lock.json','docs/desktop.md','web/README.md','dist/Devin-Web-Zh.user.js','dist/build-report.json',
    'START_HERE.md','Start-Windows.cmd','Start-macOS.command','scripts/launcher.js',
    'scripts/windows-installation.js','scripts/launcher-backups.js']) {
    if (!files.includes(file)) problems.push('Required publication file is not tracked: ' + file);
  }
  const built = buildUserscript();
  if (fs.existsSync(path.join(ROOT,'dist/Devin-Web-Zh.user.js')) &&
    fs.readFileSync(path.join(ROOT,'dist/Devin-Web-Zh.user.js'),'utf8') !== built.source)
    problems.push('Published userscript is stale: run node web/build.js dist');
  const pkg = require('../package.json'), lock = require('../package-lock.json');
  if (pkg.version !== lock.version || pkg.version !== lock.packages[''].version)
    problems.push('Package and lock versions differ');
  if (problems.length) throw new Error(problems.join('\n'));
  console.log(`Public preflight passed: ${files.length} tracked files, ${blobs} historical blobs; userscript ${built.version} matches source.`);
  console.log('Pattern scanning supplements manual review; it does not guarantee every possible private datum is detected.');
  return {files:files.length,historicalBlobs:blobs};
}
if (require.main === module) {
  try { preflight(); } catch (error) { console.error(error.message); process.exitCode=1; }
}
module.exports = {preflight,scanContent};
