'use strict';
// Data-only acquisition. Never install an extension or execute package code.
// Microsoft's language-pack sources and strings are MIT licensed:
// https://github.com/microsoft/vscode-loc/blob/main/i18n/vscode-language-pack-zh-hans/README.md
// Gallery request/download format follows Microsoft's VS Code implementation:
// https://github.com/microsoft/vscode/blob/main/src/vs/platform/extensionManagement/common/extensionGalleryService.ts
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const PUBLISHER = 'MS-CEINTL';
const NAME = 'vscode-language-pack-zh-hans';
const QUERY_URL = 'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery';
const ASSET = 'Microsoft.VisualStudio.Services.VSIXPackage';
const PACK_RELATIVE = 'extension/translations/main.i18n.json';
const PACKAGE_RELATIVE = 'extension/package.json';
const DEFAULT_MAX_DOWNLOAD = 32 * 1024 * 1024;
const MAX_PACK = 8 * 1024 * 1024;
const MAX_PACKAGE = 256 * 1024;
const own = (value, key) => value !== null && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function fail(code, message, cause) {
  const error = new Error(message, cause ? {cause} : undefined);
  error.code = code;
  error.suggestedScope = 'agent';
  return error;
}
function minorVersion(version) {
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version))
    throw fail('LANGUAGE_PACK_VERSION', '语言包或应用版本格式无效。');
  return version.split('.').slice(0, 2).join('.');
}
function validateData(packageSource, translationSource, appVersion) {
  if (Buffer.byteLength(packageSource) > MAX_PACKAGE || Buffer.byteLength(translationSource) > MAX_PACK)
    throw fail('LANGUAGE_PACK_SIZE', '语言包数据超过允许大小。');
  let metadata, translations;
  try { metadata = JSON.parse(packageSource); translations = JSON.parse(translationSource); }
  catch (error) { throw fail('LANGUAGE_PACK_DATA', '语言包 JSON 数据无效。', error); }
  if (!object(metadata) || metadata.publisher !== PUBLISHER || metadata.name !== NAME)
    throw fail('LANGUAGE_PACK_IDENTITY', '需要微软 MS-CEINTL 发布的简体中文语言包。');
  if (minorVersion(metadata.version) !== minorVersion(appVersion))
    throw fail('LANGUAGE_PACK_VERSION', `语言包 ${metadata.version} 与应用 ${appVersion} 的 major/minor 不匹配。`);
  if (!own(translations, 'contents') || !object(translations.contents) || !Object.keys(translations.contents).length)
    throw fail('LANGUAGE_PACK_DATA', '语言包缺少有效的 contents 数据。');
  let strings = 0;
  for (const module of Object.values(translations.contents)) {
    if (!object(module)) throw fail('LANGUAGE_PACK_DATA', '语言包模块格式无效。');
    for (const text of Object.values(module)) {
      if (typeof text !== 'string') throw fail('LANGUAGE_PACK_DATA', '语言包包含非字符串译文。');
      if (text.length) strings++;
    }
  }
  if (!strings) throw fail('LANGUAGE_PACK_DATA', '语言包没有可用译文。');
  return {version: metadata.version, strings};
}
function readBounded(file, maximum) {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > maximum) throw fail('LANGUAGE_PACK_SIZE', '语言包文件无效或过大。');
  return fs.readFileSync(file, 'utf8');
}
function validateLanguagePack(packFile, appVersion) {
  const metadata = path.resolve(path.dirname(packFile), '..', 'package.json');
  const validated = validateData(readBounded(metadata, MAX_PACKAGE), readBounded(packFile, MAX_PACK), appVersion);
  return {packFile: path.resolve(packFile), ...validated};
}
function candidateFiles(input) {
  if (typeof input !== 'string' || !input.trim()) return [];
  const resolved = path.resolve(input);
  if (path.basename(resolved) === 'main.i18n.json') return [resolved];
  if (path.basename(resolved) === 'package.json') return [path.join(path.dirname(resolved), 'translations', 'main.i18n.json')];
  return [path.join(resolved, 'translations', 'main.i18n.json'), path.join(resolved, PACK_RELATIVE)];
}
function children(directory, predicate = () => true) {
  try { return fs.readdirSync(directory, {withFileTypes: true}).filter(entry => entry.isDirectory() && predicate(entry.name)).map(entry => path.join(directory, entry.name)).sort().reverse(); }
  catch { return []; }
}
function discoverCandidates({projectDir, env, home, root, platform, toolDirs = [], extensionDirs, cacheDirs = [], onProgress}) {
  const candidates = [], add = input => candidates.push(...candidateFiles(input));
  if (env.DEVIN_ZH_PACK) add(env.DEVIN_ZH_PACK);
  for (const directory of new Set([projectDir, ...toolDirs].filter(value => typeof value === 'string' && value))) {
    const settings = path.join(directory, '.devin-zh.local.json');
    if (fs.existsSync(settings)) {
      try {
        const local = JSON.parse(readBounded(settings, MAX_PACKAGE));
        if (own(local, 'packFile') && typeof local.packFile === 'string' && path.isAbsolute(local.packFile)) add(local.packFile);
      } catch { onProgress({phase: 'local-rejected', message: '已跳过无法读取的旧语言包设置。'}); }
    }
    add(path.join(directory, 'cache', 'zh'));
    for (const child of children(path.join(directory, 'cache', 'language-packs'))) add(child);
  }
  for (const directory of cacheDirs) { add(directory); for (const child of children(directory)) add(child); }
  const standard = extensionDirs ?? [
    ...['.devin', '.windsurf', '.vscode', '.vscode-insiders', '.vscode-oss', '.vscode-server', '.vscode-server-insiders'].map(folder => path.join(home, folder, 'extensions')),
    path.resolve(root, '..', '..', 'data', 'extensions'),
    ...(env.VSCODE_EXTENSIONS ? [env.VSCODE_EXTENSIONS] : []),
    ...(platform === 'win32' && env.LOCALAPPDATA ? [path.join(env.LOCALAPPDATA, 'Devin', 'extensions')] : [])
  ];
  for (const directory of standard) {
    for (const child of children(directory, name => /(?:^|\.)vscode-language-pack-zh-hans(?:-|$)/i.test(name))) add(child);
  }
  return [...new Set(candidates)].filter(file => fs.existsSync(file));
}
function officialURL(value) {
  let url;
  try { url = new URL(value); } catch { throw fail('LANGUAGE_PACK_NETWORK', '微软语言包下载地址无效。'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443' ||
      !(host === 'marketplace.visualstudio.com' || host.endsWith('.vsassets.io')))
    throw fail('LANGUAGE_PACK_NETWORK', '语言包地址不属于微软官方 Marketplace/CDN。');
  return url.href;
}

async function requestBytes(url, {fetchImpl, timeoutMs, signal, maxBytes, onProgress, phase, method = 'GET', headers, body}) {
  const controller = new AbortController();
  let timer, abortListener;
  const abort = reason => controller.abort(reason);
  const abortPromise = new Promise((_, reject) => {
    controller.signal.addEventListener('abort', () => reject(controller.signal.reason), {once: true});
  });
  abortListener = () => abort(fail('LANGUAGE_PACK_CANCELLED', '语言包下载已取消。'));
  if (signal?.aborted) abortListener();
  else signal?.addEventListener('abort', abortListener, {once: true});
  timer = setTimeout(() => abort(fail('LANGUAGE_PACK_TIMEOUT', '微软语言包请求超时，可稍后重试或使用 Agent 汉化范围。')), timeoutMs);
  let reader;
  const operation = (async () => {
    let address = officialURL(url), response;
    for (let redirects = 0; redirects <= 5; redirects++) {
      if (controller.signal.aborted) throw controller.signal.reason;
      response = await fetchImpl(address, {method, headers, body, redirect: 'manual', signal: controller.signal});
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || redirects === 5) throw fail('LANGUAGE_PACK_NETWORK', '微软语言包重定向无效或过多。');
        await response.body?.cancel?.();
        address = officialURL(new URL(location, address).href);
        if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === 'POST')) { method = 'GET'; body = undefined; }
        continue;
      }
      break;
    }
    if (!response.ok) throw fail('LANGUAGE_PACK_NETWORK', `微软 Marketplace 请求失败（HTTP ${response.status}）。`);
    if (response.url) officialURL(response.url);
    const rawLength = response.headers.get('content-length');
    if (rawLength !== null && !/^\d+$/.test(rawLength)) throw fail('LANGUAGE_PACK_SIZE', '语言包响应长度无效。');
    const declaredBytes = rawLength === null ? null : Number(rawLength);
    if (declaredBytes !== null && (!Number.isSafeInteger(declaredBytes) || declaredBytes > maxBytes)) throw fail('LANGUAGE_PACK_SIZE', '语言包响应超过允许大小。');
    // fetch exposes decompressed bytes; a compressed Content-Length cannot be a progress denominator.
    const encoding = response.headers.get('content-encoding')?.trim().toLowerCase();
    const totalBytes = encoding && encoding !== 'identity' ? null : declaredBytes;
    if (!response.body || typeof response.body.getReader !== 'function') throw fail('LANGUAGE_PACK_NETWORK', '微软语言包响应为空。');
    reader = response.body.getReader();
    let receivedBytes = 0;
    const chunks = [];
    onProgress({phase, message: phase === 'download' ? '正在下载微软简体中文语言包…' : '正在查询匹配的微软语言包…', receivedBytes, totalBytes});
    while (true) {
      if (controller.signal.aborted) throw controller.signal.reason;
      const item = await reader.read();
      if (item.done) break;
      receivedBytes += item.value.byteLength;
      if (receivedBytes > maxBytes) throw fail('LANGUAGE_PACK_SIZE', '语言包响应超过允许大小。');
      chunks.push(Buffer.from(item.value));
      onProgress({phase, message: phase === 'download' ? '正在下载微软简体中文语言包…' : '正在查询匹配的微软语言包…', receivedBytes, totalBytes});
    }
    if (totalBytes !== null && receivedBytes !== totalBytes)
      throw fail('LANGUAGE_PACK_INTERRUPTED', '语言包下载不完整，未保存可用缓存。');
    return Buffer.concat(chunks, receivedBytes);
  })();
  try { return await Promise.race([operation, abortPromise]); }
  catch (error) {
    if (error.code?.startsWith('LANGUAGE_PACK_')) throw error;
    throw fail('LANGUAGE_PACK_NETWORK', '无法获取微软语言包，请检查网络后重试；也可使用 Agent 汉化范围。', error);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortListener);
    if (reader) reader.cancel().catch(() => {});
    if (!controller.signal.aborted) controller.abort();
  }
}

const CRC_TABLE = Array.from({length: 256}, (_, value) => {
  for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
  return value >>> 0;
});
function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = CRC_TABLE[(value ^ byte) & 0xff] ^ value >>> 8;
  return (value ^ 0xffffffff) >>> 0;
}
function extractData(archive) {
  const invalid = message => fail('LANGUAGE_PACK_ARCHIVE', '语言包 ZIP 无效：' + message);
  if (!Buffer.isBuffer(archive) || archive.length < 22) throw invalid('文件过短');
  let eocd = -1;
  for (let i = archive.length - 22; i >= Math.max(0, archive.length - 65557); i--) {
    if (archive.readUInt32LE(i) === 0x06054b50 && i + 22 + archive.readUInt16LE(i + 20) === archive.length) { eocd = i; break; }
  }
  if (eocd < 0) throw invalid('缺少完整目录');
  const count = archive.readUInt16LE(eocd + 10), offset = archive.readUInt32LE(eocd + 16), size = archive.readUInt32LE(eocd + 12);
  if (archive.readUInt16LE(eocd + 4) || archive.readUInt16LE(eocd + 6) || archive.readUInt16LE(eocd + 8) !== count ||
      count === 0xffff || count > 5000 || offset + size !== eocd) throw invalid('不支持分卷、ZIP64 或异常目录');
  const selected = new Map(), names = new Set();
  let cursor = offset, declaredBytes = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > eocd || archive.readUInt32LE(cursor) !== 0x02014b50) throw invalid('目录条目损坏');
    const flags = archive.readUInt16LE(cursor + 8), method = archive.readUInt16LE(cursor + 10);
    const checksum = archive.readUInt32LE(cursor + 16), compressed = archive.readUInt32LE(cursor + 20), expanded = archive.readUInt32LE(cursor + 24);
    const nameLength = archive.readUInt16LE(cursor + 28), extra = archive.readUInt16LE(cursor + 30), comment = archive.readUInt16LE(cursor + 32);
    const local = archive.readUInt32LE(cursor + 42), end = cursor + 46 + nameLength + extra + comment;
    if (end > eocd) throw invalid('目录条目越界');
    const name = archive.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    const segments = name.replace(/\/$/, '').split('/');
    if (!name || name.includes('\\') || name.includes('\0') || name.startsWith('/') || /^[A-Za-z]:/.test(name) || segments.some(part => !part || part === '.' || part === '..')) throw invalid('路径穿越');
    if (names.has(name.toLowerCase())) throw invalid('重复路径');
    names.add(name.toLowerCase());
    const unixMode = archive.readUInt32LE(cursor + 38) >>> 16;
    if ((unixMode & 0xf000) === 0xa000 || flags & 1 || compressed === 0xffffffff || expanded === 0xffffffff) throw invalid('不支持链接、加密或ZIP64');
    declaredBytes += expanded;
    if (declaredBytes > 64 * 1024 * 1024) throw invalid('解压后总大小超限');
    if (local + 30 > offset || archive.readUInt32LE(local) !== 0x04034b50) throw invalid('本地条目损坏');
    const localNameLength = archive.readUInt16LE(local + 26), localExtra = archive.readUInt16LE(local + 28);
    const dataStart = local + 30 + localNameLength + localExtra;
    if (dataStart + compressed > offset || archive.readUInt16LE(local + 6) !== flags || archive.readUInt16LE(local + 8) !== method ||
        archive.subarray(local + 30, local + 30 + localNameLength).toString('utf8') !== name) throw invalid('本地条目与目录不一致');
    if (!(flags & 8) && (archive.readUInt32LE(local + 14) !== checksum || archive.readUInt32LE(local + 18) !== compressed || archive.readUInt32LE(local + 22) !== expanded)) throw invalid('本地大小或 CRC 不一致');
    if (name === PACKAGE_RELATIVE || name === PACK_RELATIVE) {
      const maximum = name === PACKAGE_RELATIVE ? MAX_PACKAGE : MAX_PACK;
      if (expanded > maximum || ![0, 8].includes(method)) throw invalid('数据大小或压缩方法不支持');
      const data = archive.subarray(dataStart, dataStart + compressed);
      let output;
      try { output = method === 0 ? Buffer.from(data) : zlib.inflateRawSync(data, {maxOutputLength: maximum}); }
      catch { throw invalid('解压失败'); }
      if (output.length !== expanded || crc32(output) !== checksum) throw invalid('数据大小或 CRC 校验失败');
      selected.set(name, output);
    }
    cursor = end;
  }
  if (cursor !== eocd || !selected.has(PACKAGE_RELATIVE) || !selected.has(PACK_RELATIVE)) throw invalid('缺少语言包数据文件');
  return selected;
}

async function ensureLanguagePack({root, projectDir = path.resolve(__dirname, '..'), env = process.env, home = os.homedir(), platform = process.platform,
  toolDirs = [], extensionDirs, cacheDirs = [], onProgress = () => {}, fetchImpl = globalThis.fetch, timeoutMs = 30000, signal,
  maxDownloadBytes = DEFAULT_MAX_DOWNLOAD} = {}) {
  if (typeof root !== 'string') throw fail('LANGUAGE_PACK_APP', '请先选择 Devin 安装目录。');
  const app = JSON.parse(readBounded(path.join(root, 'package.json'), MAX_PACKAGE));
  const appVersion = app.version, minor = minorVersion(appVersion);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isSafeInteger(maxDownloadBytes) || maxDownloadBytes <= 0) throw new TypeError('Invalid language-pack request limits');
  if (signal?.aborted) throw fail('LANGUAGE_PACK_CANCELLED', '语言包下载已取消。');
  onProgress({phase: 'local-search', message: '正在自动查找可用的微软简体中文语言包…', version: appVersion});
  const rejected = [];
  for (const file of discoverCandidates({projectDir, env, home, root, platform, toolDirs, extensionDirs, cacheDirs, onProgress})) {
    try {
      const result = validateLanguagePack(file, appVersion);
      onProgress({phase: 'ready', message: '已找到与 Devin 版本匹配的中文语言包。', version: result.version});
      return {...result, source: 'local', downloaded: false};
    } catch (error) {
      rejected.push({file, code: error.code || 'LANGUAGE_PACK_DATA'});
      onProgress({phase: 'local-rejected', message: '已跳过不匹配或无效的本地语言包，原文件保留。', code: error.code});
    }
  }
  onProgress({phase: 'query', message: `正在从微软 Marketplace 查找 ${minor}.x 中文语言包…`, version: appVersion});
  const dependencies = {fetchImpl, timeoutMs, signal, onProgress};
  const bytes = await requestBytes(QUERY_URL, {...dependencies, maxBytes: 8 * 1024 * 1024, phase: 'query', method: 'POST',
    headers: {'Content-Type': 'application/json', Accept: 'application/json;api-version=3.0-preview.1'},
    body: JSON.stringify({filters: [{criteria: [{filterType: 7, value: `${PUBLISHER}.${NAME}`}], pageNumber: 1, pageSize: 1}],
      assetTypes: [ASSET], flags: 147})});
  let gallery;
  try { gallery = JSON.parse(bytes.toString('utf8')); } catch { throw fail('LANGUAGE_PACK_NETWORK', '微软 Marketplace 返回的版本列表无效。'); }
  const extension = gallery?.results?.[0]?.extensions?.find(item => item?.publisher?.publisherName === PUBLISHER && item.extensionName === NAME);
  const versions = Array.isArray(extension?.versions) ? extension.versions.filter(item => {
    try { return minorVersion(item.version) === minor && (!item.targetPlatform || item.targetPlatform === 'universal'); } catch { return false; }
  }) : [];
  versions.sort((a, b) => b.version.localeCompare(a.version, 'en', {numeric: true}));
  const selected = versions[0];
  if (!selected) throw fail('LANGUAGE_PACK_UNAVAILABLE', `微软 Marketplace 暂无与 Devin ${appVersion} 匹配的中文语言包，请改用 Agent 汉化范围。`);
  const downloadURL = officialURL(`${selected.fallbackAssetUri}/${ASSET}?redirect=true`);
  onProgress({phase: 'download', message: `正在下载微软中文语言包 ${selected.version}…`, version: selected.version});
  const archive = await requestBytes(downloadURL, {...dependencies, phase: 'download', maxBytes: maxDownloadBytes});
  if (signal?.aborted) throw fail('LANGUAGE_PACK_CANCELLED', '语言包下载已取消。');
  onProgress({phase: 'extract', message: '正在校验语言包并提取界面翻译数据…', version: selected.version});
  const files = extractData(archive);
  const validated = validateData(files.get(PACKAGE_RELATIVE).toString('utf8'), files.get(PACK_RELATIVE).toString('utf8'), appVersion);
  if (validated.version !== selected.version)
    throw fail('LANGUAGE_PACK_VERSION', `下载包版本 ${validated.version} 与微软 Marketplace 选择的版本 ${selected.version} 不一致，未保存缓存。`);
  // A new cache path preserves both old versions and any incompatible local data.
  const cache = path.resolve(projectDir, 'cache', 'language-packs');
  fs.mkdirSync(cache, {recursive: true});
  let destination = path.join(cache, selected.version);
  if (fs.existsSync(destination)) {
    try {
      const existing = validateLanguagePack(path.join(destination, PACK_RELATIVE), appVersion);
      onProgress({phase: 'ready', message: '已准备与 Devin 版本匹配的中文语言包。', version: existing.version});
      return {...existing, source: 'local', downloaded: false};
    } catch { destination += '-' + crypto.randomUUID(); }
  }
  const temporary = fs.mkdtempSync(path.join(cache, '.download-'));
  try {
    for (const [relative, content] of files) {
      const output = path.resolve(temporary, relative);
      if (!output.startsWith(temporary + path.sep)) throw fail('LANGUAGE_PACK_ARCHIVE', '语言包目标路径越界。');
      fs.mkdirSync(path.dirname(output), {recursive: true});
      fs.writeFileSync(output, content, {flag: 'wx'});
    }
    if (signal?.aborted) throw fail('LANGUAGE_PACK_CANCELLED', '语言包下载已取消。');
    fs.renameSync(temporary, destination);
  } finally {
    // No recursive delete: remove only this function's two known temporary files.
    if (fs.existsSync(temporary)) {
      for (const relative of [PACK_RELATIVE, PACKAGE_RELATIVE]) {
        const file = path.join(temporary, relative);
        if (fs.existsSync(file)) fs.unlinkSync(file);
      }
      for (const relative of ['extension/translations', 'extension', '']) {
        const directory = path.join(temporary, relative);
        if (fs.existsSync(directory)) fs.rmdirSync(directory);
      }
    }
  }
  const packFile = path.join(destination, PACK_RELATIVE);
  onProgress({phase: 'ready', message: '已准备与 Devin 版本匹配的中文语言包。', version: validated.version});
  return {packFile, version: validated.version, strings: validated.strings, source: 'download', downloaded: true};
}

module.exports = {ensureLanguagePack, validateLanguagePack, extractData};
