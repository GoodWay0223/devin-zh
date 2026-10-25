'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {loadBaseline} = require('../src/install');

// A newly extracted tool must not treat already patched files as originals.
// Import only the verified baseline and applied hashes, never arbitrary cache files.
function importVerifiedBackup(root, {projectDir,toolDirs = []} = {}) {
  const cacheDir = path.join(projectDir,'cache','installations');
  try {loadBaseline({root,cacheDir}); return {imported:false};} catch {}
  for (const toolDir of [...new Set(toolDirs)]) {
    if (path.resolve(toolDir) === path.resolve(projectDir)) continue;
    let baseline;
    try {
      if (JSON.parse(fs.readFileSync(path.join(toolDir,'package.json'),'utf8')).name !== 'devin-desktop-zh') continue;
      baseline = loadBaseline({root,cacheDir:path.join(toolDir,'cache','installations')});
    } catch {continue;}
    const destination = path.join(cacheDir,baseline.identity);
    if (fs.existsSync(destination)) return {imported:false}; // Never overwrite a target cache, including interrupted state.
    fs.mkdirSync(cacheDir,{recursive:true});
    const temp = path.join(cacheDir,baseline.identity+'.import-'+crypto.randomBytes(6).toString('hex'));
    try {
      fs.mkdirSync(temp);
      for (const [relative,source] of baseline.originals) {
        const file = path.join(temp,'original',relative);
        fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,source,{flag:'wx'});
      }
      fs.writeFileSync(path.join(temp,'baseline.json'),JSON.stringify({schema:2,root:baseline.root,identity:baseline.identity,files:baseline.manifest.files},null,2)+'\n',{flag:'wx'});
      const applied = Object.fromEntries(baseline.files.filter(file=>baseline.state.applied[file]).map(file=>[file,baseline.state.applied[file]]));
      fs.writeFileSync(path.join(temp,'state.json'),JSON.stringify({schema:2,applied},null,2)+'\n',{flag:'wx'});
      fs.renameSync(temp,destination);
      loadBaseline({root,cacheDir}); // Recheck both the current installation and the copied originals.
      console.log('已自动接续旧工具的可信原版备份。旧备份保持原样。');
      return {imported:true,source:baseline.dir,destination};
    } finally {
      if (path.dirname(path.resolve(temp)) !== path.resolve(cacheDir)) throw new Error('临时备份路径越界');
      if (fs.existsSync(temp)) fs.rmSync(temp,{recursive:true,force:true});
    }
  }
  return {imported:false};
}
module.exports={importVerifiedBackup};
