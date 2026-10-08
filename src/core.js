const fs = require('fs'), vm = require('vm'), path = require('path'), cp = require('child_process'), os = require('os');

const DATA = path.join(__dirname, '..', 'data');
const ROOT = process.env.DEVIN_APP || 'D:/AI/Devin/resources/app';
const MARK = '/*devin-zh:patched*/';
const TARGETS = [
  'out/vs/workbench/windsurf-chat-client/index.js',
  'out/vs/sessions/sessions.desktop.main.js',
].map(p => path.join(ROOT, p));

const readJson = (f, d = {}) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const writeJson = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 1) + '\n');
const dataFile = n => path.join(DATA, n);

// ---------- 原始文件/备份 ----------
// 已打过补丁的文件末尾带 MARK; 否则说明是全新(或被 Devin 更新覆盖过)的原版, 需要刷新备份
function original(f) {
  const bak = f + '.bak-zh';
  const fd = fs.openSync(f, 'r'), st = fs.fstatSync(fd), buf = Buffer.alloc(MARK.length);
  fs.readSync(fd, buf, 0, buf.length, st.size - buf.length); fs.closeSync(fd);
  const patched = buf.toString() === MARK;
  if (!patched) { fs.copyFileSync(f, bak); return { src: fs.readFileSync(f, 'utf8'), fresh: true, bak }; }
  if (!fs.existsSync(bak)) throw new Error('文件已被补丁修改但找不到备份: ' + bak);
  return { src: fs.readFileSync(bak, 'utf8'), fresh: false, bak };
}

// ---------- i18n JSON 资源块 ----------
// 形如 JSON.parse('{...}') 的大对象 (i18next 资源)
const BLOCK_RE = /JSON\.parse\('(\{(?:[^'\\]|\\.)*\})'\)/g;
const unquote = lit => JSON.parse(vm.runInNewContext("'" + lit + "'"));
const quote = o => JSON.stringify(o).replace(/[\\']/g, '\\$&').replace(/[^\x00-\x7f]/g, c => '\\u' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'));

function leaves(o, pre = '', out = []) {
  for (const [k, v] of Object.entries(o)) {
    const p = pre ? pre + '.' + k : k;
    typeof v === 'string' ? out.push([p, v]) : v && typeof v === 'object' && leaves(v, p, out);
  }
  return out;
}
function mapLeaves(o, fn, pre = '') {
  let n = 0; const r = Array.isArray(o) ? [] : {};
  for (const [k, v] of Object.entries(o)) {
    const p = pre ? pre + '.' + k : k;
    if (typeof v === 'string') { const z = fn(p, v); if (z !== undefined && z !== v) n++; r[k] = z === undefined ? v : z; }
    else if (v && typeof v === 'object') { const [x, c] = mapLeaves(v, fn, p); r[k] = x; n += c; }
    else r[k] = v;
  }
  return [r, n];
}
const isEnglish = s => !/[^\x00-\x7f]/.test(s) && /[A-Za-z]{2}/.test(s);

// 区分英文资源块 (文件里还带有 es/pt/ja 等其它语言的资源, 它们没有非 ASCII 字符时 isEnglish 会误判)
const blockIsEnglish = require('./blocks');
const isEnglishBlock = obj => blockIsEnglish(leaves(obj).map(x => x[1]));

function scanBlocks(src) {
  const out = []; let m; BLOCK_RE.lastIndex = 0;
  while ((m = BLOCK_RE.exec(src))) {
    let o; try { o = unquote(m[1]); } catch { continue; }
    if (o && typeof o === 'object') out.push({ index: m.index, len: m[0].length, lit: m[1], obj: o, en: isEnglishBlock(o) });
  }
  return out;
}

// ---------- 词典 ----------
function loadDict() {
  const web = fs.readFileSync(dataFile('web-dictionary.js'), 'utf8');
  const { DICTIONARY } = vm.runInNewContext(web + ';({DICTIONARY})');
  const manual = readJson(dataFile('strings.json'));
  const sd = dataFile('strings');
  if (fs.existsSync(sd)) for (const f of fs.readdirSync(sd).sort()) if (f.endsWith('.json')) Object.assign(manual, readJson(path.join(sd, f)));
  const human = Object.assign({}, DICTIONARY, manual);
  const smt = readJson(dataFile('strings.mt.json'));
  const rules = require('./rules');
  const str = v => human[v] ?? rules.tr(v) ?? smt[v];
  const curated = readJson(dataFile('i18n.zh.json')), mt = readJson(dataFile('i18n.mt.json'));
  const pick = (tbl, p, en) => tbl[p] && tbl[p][en];
  const resolveI18n = (p, en) => pick(curated, p, en) ?? human[en] ?? rules.tr(en) ?? pick(mt, p, en);
  return { str, human, curated, mt, resolveI18n };
}

function checkSyntax(src) {
  const tmp = path.join(os.tmpdir(), 'devin-zh-check-' + process.pid + '.mjs');
  fs.writeFileSync(tmp, src);
  try { cp.execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); return null; }
  catch (e) { return String(e.stderr || e.message).slice(0, 500); }
  finally { fs.unlinkSync(tmp); }
}

module.exports = { ROOT, MARK, TARGETS, DATA, dataFile, readJson, writeJson, original, scanBlocks, leaves, mapLeaves, quote, isEnglish, loadDict, checkSyntax };
