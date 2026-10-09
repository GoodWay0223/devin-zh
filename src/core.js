const fs = require('fs'), vm = require('vm'), path = require('path'), cp = require('child_process'), os = require('os');
const crypto = require('crypto');

const DATA = path.join(__dirname, '..', 'data');
const ROOT = require('./config').appRoot();
const MARK = '/*devin-zh:patched*/';
const TARGETS = [
  'out/vs/workbench/windsurf-chat-client/index.js',
  'out/vs/sessions/sessions.desktop.main.js',
].map(p => path.join(ROOT, p));

const readJson = (f, d = {}) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const writeJson = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 1) + '\n');
const dataFile = n => path.join(DATA, n);

// ---------- 原始文件/备份 ----------
// 备份可能被旧版脚本覆盖为汉化文件。只有与当前安装包校验值一致的文件才可当作原版。
function verifyOriginal(f, originalFile) {
  const product = readJson(path.join(ROOT, 'product.json'));
  const key = path.relative(path.join(ROOT, 'out'), f).split(path.sep).join('/');
  const expected = product.checksums?.[key];
  if (!expected) throw new Error('缺少官方校验值，无法确认原版: ' + key);
  const actual = crypto.createHash('sha256').update(fs.readFileSync(originalFile)).digest('base64').replace(/=+$/, '');
  if (actual !== expected.replace(/=+$/, '')) {
    throw new Error('原版校验失败，已停止汉化并保留现有文件: ' + originalFile + '\n请从同版本官方安装包恢复文件和备份，不能将已修改的 .bak-zh 当作原版。');
  }
}

// 读取经过验证的不可变原版。status/collect 不再刷新或覆盖备份。
function original(f) {
  const state = require('./install').loadBaseline({ root: ROOT });
  const relative = path.relative(ROOT, f).split(path.sep).join('/');
  return { src: state.originals.get(relative), fresh: !state.state.applied[relative] };
}

// ---------- i18n JSON 资源块 ----------
const quote = o => JSON.stringify(o).replace(/[\\']/g, '\\$&').replace(/[^\x00-\x7f]/g, c => '\\u' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'));

function leaves(o, pre = '', out = []) {
  for (const [k, v] of Object.entries(o)) {
    const p = pre ? pre + '.' + k : k;
    typeof v === 'string' ? out.push([p, v]) : v && typeof v === 'object' && leaves(v, p, out);
  }
  return out;
}
function mapLeaves(o, fn, pre = '') {
  let n = 0; const r = Array.isArray(o) ? [] : Object.create(null);
  for (const [k, v] of Object.entries(o)) {
    const p = pre ? pre + '.' + k : k;
    if (typeof v === 'string') { const z = fn(p, v); if (z !== undefined && z !== v) n++; r[k] = z === undefined ? v : z; }
    else if (v && typeof v === 'object') { const [x, c] = mapLeaves(v, fn, p); r[k] = x; n += c; }
    else r[k] = v;
  }
  return [r, n];
}
const isEnglish = s => !/[^\x00-\x7f]/.test(s) && /[A-Za-z]{2}/.test(s);

function parser() {
  // Project lockfile keeps the parser available when Devin removes its bundled copy.
  const local = path.join(__dirname, '..', 'node_modules', 'acorn');
  return require(fs.existsSync(local) ? local : path.join(ROOT, 'node_modules', 'acorn'));
}
function analyze(src) {
  return require('./analyze').analyzeSource(src, { acorn: parser() });
}
function scanBlocks(src) {
  return analyze(src).blocks;
}

// ---------- 词典 ----------
function loadDict() {
  const web = fs.readFileSync(dataFile('web-dictionary.js'), 'utf8');
  const { DICTIONARY } = vm.runInNewContext(web + ';({DICTIONARY})');
  const manual = Object.assign(Object.create(null), readJson(dataFile('strings.json')));
  const sd = dataFile('strings');
  if (fs.existsSync(sd)) for (const f of fs.readdirSync(sd).sort()) if (f.endsWith('.json')) Object.assign(manual, readJson(path.join(sd, f)));
  const display = readJson(dataFile('display.zh.json'));
  const webReviewed = readJson(dataFile('web-reviewed.zh.json'));
  const webShortcuts = readJson(dataFile('web-shortcuts.zh.json'));
  const webSettings = readJson(dataFile('web-settings.zh.json'));
  const models = require('./model-translations');
  const human = Object.assign(Object.create(null), DICTIONARY, display.nav, display.menu, webShortcuts, webReviewed, webSettings, manual, models.descriptions, models.names);
  // 软件/品牌名称不使用机翻草稿中的音译；原样保留。
  for (const name of ['Vim', 'Eclipse', 'Npm', 'npm', 'Sublime Text', 'Notepad++', 'VS Code', 'Devin', 'Windsurf']) human[name] = name;
  const smt = readJson(dataFile('strings.mt.json'));
  const rules = require('./rules');
  const own = (o, k) => Object.hasOwn(o, k) ? o[k] : undefined;
  const str = v => own(human, v) ?? models.translateModelDescription(v) ?? rules.tr(v) ?? own(smt, v);
  const curated = readJson(dataFile('i18n.zh.json')), mt = readJson(dataFile('i18n.mt.json'));
  const pick = (tbl, p, en) => own(tbl, p) && own(own(tbl, p), en);
  const resolveI18n = (p, en) => own(models.names, en) ?? pick(curated, p, en) ?? own(human, en) ?? models.translateModelDescription(en) ?? rules.tr(en) ?? pick(mt, p, en);
  return { str, human, curated, mt, resolveI18n };
}

function checkSyntax(src) {
  const tmp = path.join(os.tmpdir(), 'devin-zh-check-' + process.pid + '.mjs');
  fs.writeFileSync(tmp, src);
  try { cp.execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); return null; }
  catch (e) { return String(e.stderr || e.message).slice(0, 500); }
  finally { fs.unlinkSync(tmp); }
}

module.exports = { ROOT, MARK, TARGETS, DATA, dataFile, readJson, writeJson, original, verifyOriginal, scanBlocks, analyze, parser, leaves, mapLeaves, quote, isEnglish, loadDict, checkSyntax };
