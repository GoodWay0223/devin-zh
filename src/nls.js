// VS Code 原生界面文本 (菜单/设置/面板等): 用官方 zh-hans 语言包生成中文 nls.messages
const fs = require('fs'), path = require('path');
const C = require('./core');

const dir = () => path.join(C.ROOT, 'out');
const JS = () => path.join(dir(), 'nls.messages.js'), JSON_ = () => path.join(dir(), 'nls.messages.json'), KEYS = () => path.join(dir(), 'nls.keys.json');
const PACK = path.join(__dirname, '..', 'cache', 'zh', 'extension', 'translations', 'main.i18n.json');

const isPatched = () => fs.readFileSync(JS(), 'utf8').endsWith(C.MARK);

// 保证备份对应当前版本的原版 (被 Devin 更新覆盖后会自动刷新)
function ensureBackup() {
  if (!isPatched()) for (const f of [JS(), JSON_()]) fs.copyFileSync(f, f + '.bak-zh');
}

function build() {
  const keys = JSON.parse(fs.readFileSync(KEYS(), 'utf8'));
  const orig = JSON.parse(fs.readFileSync(JSON_() + '.bak-zh', 'utf8'));
  const pack = JSON.parse(fs.readFileSync(PACK, 'utf8')).contents;
  const force = C.readJson(C.dataFile('nls.json')), manual = {};
  const dir = C.dataFile('nls');
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).sort()) if (f.endsWith('.json')) Object.assign(manual, C.readJson(path.join(dir, f)));
  const out = orig.slice(); let i = 0, hit = 0;
  for (const [mod, ks] of keys) {
    const t = pack[mod] || {};
    for (const k of ks) {
      const zh = t[k];
      if (typeof zh === 'string' && zh && out[i] !== undefined) { out[i] = zh; hit++; }
      i++;
    }
  }
  // 手写词条只补官方语言包没有覆盖的; nls.json 里的是强制覆盖
  for (let j = 0; j < out.length; j++) {
    if (force[orig[j]] !== undefined) out[j] = force[orig[j]];
    else if (out[j] === orig[j] && manual[orig[j]] !== undefined) out[j] = manual[orig[j]];
  }
  return { messages: out, orig, translated: hit, total: i };
}

function apply() {
  if (!fs.existsSync(PACK)) return console.log('nls: 缺少语言包 cache/zh (见 README), 已跳过');
  ensureBackup();
  const { messages, translated, total } = build();
  const head = fs.readFileSync(JS() + '.bak-zh', 'utf8');
  const prefix = head.slice(0, head.indexOf('['));
  fs.writeFileSync(JS(), prefix + JSON.stringify(messages) + ';' + C.MARK);
  fs.writeFileSync(JSON_(), JSON.stringify(messages));
  console.log(`nls.messages: 官方语言包覆盖 ${translated}/${total}`);
}
function restore() {
  for (const f of [JS(), JSON_()]) if (fs.existsSync(f + '.bak-zh')) fs.copyFileSync(f + '.bak-zh', f);
  console.log('已还原 nls.messages');
}
module.exports = { apply, restore, build, isPatched };
