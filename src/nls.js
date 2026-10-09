// Build NLS changes from verified originals. Installation and rollback belong to the caller.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const JS = 'out/nls.messages.js';
const JSON_FILE = 'out/nls.messages.json';
const DEFAULT_DATA = path.join(__dirname, '..', 'data');
const DEFAULT_PACK = process.env.DEVIN_ZH_PACK || path.join(__dirname, '..', 'cache', 'zh', 'extension', 'translations', 'main.i18n.json');
const own = (object, key) => object != null && Object.prototype.hasOwnProperty.call(object, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function readObject(file, optional = false) {
  if (optional && !fs.existsSync(file)) return Object.create(null);
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!object(value)) throw new Error(`NLS dictionary must be an object: ${file}`);
  return value;
}

function messagesFromJS(source) {
  const sandbox = Object.create(null);
  vm.runInNewContext(source, sandbox, { timeout: 1000, contextCodeGeneration: { strings: false, wasm: false } });
  if (!Array.isArray(sandbox._VSCODE_NLS_MESSAGES) || sandbox._VSCODE_NLS_MESSAGES.some(value => typeof value !== 'string')) {
    throw new Error('NLS JavaScript must produce a string array in globalThis._VSCODE_NLS_MESSAGES');
  }
  return Array.from(sandbox._VSCODE_NLS_MESSAGES);
}

// Locate the assignment's literal, respecting quoted strings and comments; retain all other code.
function arrayRange(source) {
  const matches = Array.from(source.matchAll(/(?:globalThis\.)?_VSCODE_NLS_MESSAGES\s*=\s*(\[)/g));
  if (matches.length !== 1) throw new Error('NLS JavaScript requires exactly one messages array assignment');
  const start = matches[0].index + matches[0][0].length - 1;
  let depth = 0, quote = '', escaped = false, comment = '';
  for (let i = start; i < source.length; i++) {
    const char = source[i], next = source[i + 1];
    if (comment === '//') { if (char === '\n' || char === '\r') comment = ''; continue; }
    if (comment === '/*') { if (char === '*' && next === '/') { comment = ''; i++; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '/' && (next === '/' || next === '*')) { comment = char + next; i++; continue; }
    if (char === '[') depth++;
    else if (char === ']' && --depth === 0) return { start, end: i + 1 };
  }
  throw new Error('NLS messages array literal is unterminated');
}

function signature(value, expression) {
  return JSON.stringify((value.match(expression) || []).sort());
}

function translationProblem(original, translated) {
  if (typeof translated !== 'string' || !translated) return 'type-or-empty';
  if (signature(original, /\{\{[^{}]*\}\}|\{\d+\}/g) !== signature(translated, /\{\{[^{}]*\}\}|\{\d+\}/g)) return 'placeholders';
  if (signature(original, /<\/?[A-Za-z][^<>]*>/g) !== signature(translated, /<\/?[A-Za-z][^<>]*>/g)) return 'markup';
  // Markdown link destinations and code delimiters are structural; labels may be translated.
  if (signature(original, /\]\([^)]*\)/g) !== signature(translated, /\]\([^)]*\)/g)) return 'markup';
  if (signature(original, /`+/g) !== signature(translated, /`+/g)) return 'markup';
  return null;
}

function prepare({ root, originals, dataDir = DEFAULT_DATA, packFile = DEFAULT_PACK } = {}) {
  if (typeof root !== 'string' || !(originals instanceof Map)) throw new TypeError('NLS prepare requires root and originals Map');
  for (const relative of [JS, JSON_FILE]) {
    if (!originals.has(relative) || typeof originals.get(relative) !== 'string') throw new Error(`NLS original missing: ${relative}`);
  }
  if (!fs.existsSync(packFile)) {
    const error = new Error(`NLS language pack missing: ${packFile}`);
    error.code = 'NLS_PACK_MISSING';
    throw error;
  }
  const appPackage = path.join(root, 'package.json');
  const packPackage = path.join(path.dirname(packFile), '..', 'package.json');
  if (!fs.existsSync(appPackage)) throw new Error('NLS app version metadata missing: ' + appPackage);
  if (!fs.existsSync(packPackage)) throw new Error('NLS language pack version metadata missing: ' + packPackage);
  {
    const appVersion = readObject(appPackage).version;
    const packVersion = readObject(packPackage).version;
    if (typeof appVersion !== 'string' || typeof packVersion !== 'string' || appVersion.split('.').slice(0, 2).join('.') !== packVersion.split('.').slice(0, 2).join('.')) {
      throw new Error(`NLS language pack version ${packVersion} does not match app ${appVersion}`);
    }
  }
  const jsOriginal = originals.get(JS);
  const orig = JSON.parse(originals.get(JSON_FILE));
  if (!Array.isArray(orig) || orig.some(value => typeof value !== 'string')) throw new Error('NLS JSON must contain only strings');
  if (JSON.stringify(messagesFromJS(jsOriginal)) !== JSON.stringify(orig)) throw new Error('NLS JavaScript and JSON originals disagree');
  const range = arrayRange(jsOriginal);
  const literal = vm.runInNewContext(`(${jsOriginal.slice(range.start, range.end)})`, Object.create(null), { timeout: 1000 });
  if (JSON.stringify(literal) !== JSON.stringify(orig)) throw new Error('NLS array literal does not match JSON originals');
  const keys = JSON.parse(fs.readFileSync(path.join(root, 'out', 'nls.keys.json'), 'utf8'));
  if (!Array.isArray(keys) || keys.some(entry => !Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || !Array.isArray(entry[1]) || entry[1].some(key => typeof key !== 'string'))) {
    throw new Error('NLS keys must contain [module, string keys[]] pairs');
  }
  const count = keys.reduce((sum, entry) => sum + entry[1].length, 0);
  if (count !== orig.length) throw new Error(`NLS key count ${count} does not match messages count ${orig.length}`);
  const packDocument = readObject(packFile);
  if (!own(packDocument, 'contents') || !object(packDocument.contents)) throw new Error('NLS language pack lacks contents object');
  const pack = packDocument.contents;
  const force = readObject(path.join(dataDir, 'nls.json'), true);
  const manual = Object.create(null);
  const manualDir = path.join(dataDir, 'nls');
  if (fs.existsSync(manualDir)) {
    for (const file of fs.readdirSync(manualDir).sort()) {
      if (file.endsWith('.json')) Object.assign(manual, readObject(path.join(manualDir, file)));
    }
  }
  const messages = orig.slice();
  const covered = new Set();
  const stats = { total: orig.length, official: 0, manual: 0, forced: 0, translated: 0, rejected: 0, rejections: [] };
  function put(index, value, kind, location) {
    const reason = translationProblem(orig[index], value);
    if (reason) {
      stats.rejected++;
      stats.rejections.push({ index, kind, location, reason });
      return false;
    }
    messages[index] = value;
    stats[kind]++;
    return true;
  }
  let index = 0;
  for (const [module, moduleKeys] of keys) {
    const translations = own(pack, module) && object(pack[module]) ? pack[module] : null;
    for (const key of moduleKeys) {
      // Language packs also carry unchanged English placeholders. They are not
      // translations and must not block the reviewed manual fallback.
      if (own(translations, key) && translations[key] !== orig[index] &&
          put(index, translations[key], 'official', `${module}/${key}`)) covered.add(index);
      index++;
    }
  }
  for (let i = 0; i < orig.length; i++) {
    if (own(force, orig[i])) put(i, force[orig[i]], 'forced', 'nls.json');
    else if (!covered.has(i) && own(manual, orig[i])) put(i, manual[orig[i]], 'manual', 'nls/*.json');
  }
  stats.translated = messages.reduce((sum, message, i) => sum + Number(message !== orig[i]), 0);
  const js = jsOriginal.slice(0, range.start) + JSON.stringify(messages) + jsOriginal.slice(range.end);
  if (JSON.stringify(messagesFromJS(js)) !== JSON.stringify(messages)) throw new Error('Prepared NLS JavaScript differs from prepared JSON');
  return { changes: [{ relative: JS, source: js, stats }, { relative: JSON_FILE, source: JSON.stringify(messages), stats }], stats };
}

module.exports = { prepare, build: prepare };
