'use strict';
// Split Desktop assets are not individually covered by product.checksums.
// Accept only hashes audited against the matching signed official installer.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ENTRY = 'out/vs/workbench/devin-webapp-host/index.js';
const assetPath = /^out\/vs\/workbench\/devin-webapp-host\/(?:index\.js|editor-mode-menu\.js|assets\/[A-Za-z0-9_.-]+\.js)$/;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function hostBuild(root, product, catalog = require('../data/host-builds.json')) {
  const entry = path.join(root, ENTRY);
  if (!fs.existsSync(entry) && !product.checksums?.[ENTRY.slice(4)]) return null;
  const build = catalog.schema === 1 && catalog.builds?.[product.commit];
  if (!build || build.version !== product.windsurfVersion) throw new Error('新版独立界面资源尚未适配，请更新汉化工具：Devin ' + product.windsurfVersion);
  if (!Array.isArray(build.targets) || !build.targets.length || new Set(build.targets).size !== build.targets.length ||
      !build.files || !Object.hasOwn(build.files, ENTRY)) throw new Error('独立界面校验清单不完整');
  for (const [relative, digest] of Object.entries(build.files)) {
    if (!assetPath.test(relative) || !/^[a-f0-9]{64}$/.test(digest)) throw new Error('独立界面校验清单路径或哈希无效');
  }
  if (build.targets.some(relative => relative === ENTRY || !Object.hasOwn(build.files, relative))) throw new Error('独立界面目标不在已审查清单中');
  const bytes = fs.readFileSync(entry);
  const official = product.checksums?.[ENTRY.slice(4)];
  if (!official || crypto.createHash('sha256').update(bytes).digest('base64').replace(/=+$/, '') !== official.replace(/=+$/, '') || hash(bytes) !== build.files[ENTRY]) throw new Error('独立界面入口不是已审查的官方原版');
  return build;
}
function verifyHostFiles(root, build, originals = new Map()) {
  if (!build) return;
  for (const [relative, expected] of Object.entries(build.files)) {
    const source = originals.has(relative) ? originals.get(relative) : fs.readFileSync(path.join(root, relative));
    if (hash(source) !== expected) throw new Error('独立界面资源与已审查官方版本不一致：' + relative);
  }
}
module.exports = { ENTRY, hostBuild, verifyHostFiles };
