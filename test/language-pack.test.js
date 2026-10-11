'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const {ensureLanguagePack, extractData} = require('../scripts/language-pack');

const NAME = 'vscode-language-pack-zh-hans';
const VERSION = '1.126.2026062911';
const PACKAGE = 'extension/package.json';
const TRANSLATIONS = 'extension/translations/main.i18n.json';
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'devin-zh-language-pack-test-'));
  t.after(() => {
    const resolved = path.resolve(directory);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('devin-zh-language-pack-test-'));
    fs.rmSync(resolved, {recursive: true, force: true});
  });
  const root = path.join(directory, 'app'), projectDir = path.join(directory, 'project');
  fs.mkdirSync(root);
  fs.mkdirSync(projectDir);
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({version: '1.126.0'}));
  return {directory, root, projectDir, env: {}, home: path.join(directory, 'home'), platform: 'win32', extensionDirs: []};
}
function write(file, data) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data));
}
function packageData(version = VERSION, extra = {}) {
  return {name: NAME, publisher: 'MS-CEINTL', version, license: 'SEE MIT LICENSE IN LICENSE.md', ...extra};
}
function translations() { return {contents: {'vs/test/module': {hello: '你好 {0}'}}}; }
function localPack(directory, version = VERSION, extra = {}) {
  write(path.join(directory, PACKAGE), packageData(version, extra));
  write(path.join(directory, TRANSLATIONS), translations());
  return path.join(directory, TRANSLATIONS);
}
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(entries) {
  const locals = [], central = [];
  let offset = 0;
  for (const [name, content, method = 8] of entries) {
    const data = Buffer.from(typeof content === 'string' ? content : JSON.stringify(content)), file = Buffer.from(name);
    const compressed = method === 0 ? data : zlib.deflateRawSync(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(method, 8);
    header.writeUInt32LE(crc32(data), 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(file.length, 26);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(method, 10);
    directory.writeUInt32LE(crc32(data), 16);
    directory.writeUInt32LE(compressed.length, 20);
    directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(file.length, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, file);
    locals.push(header, file, compressed);
    offset += header.length + file.length + compressed.length;
  }
  const centralBytes = Buffer.concat(central), eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBytes.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBytes, eocd]);
}
function archive(version = VERSION, additional = []) {
  return zip([[PACKAGE, packageData(version)], [TRANSLATIONS, translations()], ...additional]);
}
function gallery(versions = [VERSION]) {
  return {results: [{extensions: [{publisher: {publisherName: 'MS-CEINTL'}, extensionName: NAME,
    versions: versions.map(version => ({version, fallbackAssetUri: `https://MS-CEINTL.gallery.vsassets.io/_apis/public/gallery/publisher/MS-CEINTL/extension/${NAME}/${version}/assetbyname`}))}]}]};
}
function streamed(bytes, chunkSize = 64) {
  let offset = 0;
  return new Response(new ReadableStream({pull(controller) {
    if (offset >= bytes.length) controller.close();
    else { controller.enqueue(bytes.subarray(offset, offset += chunkSize)); }
  }}), {headers: {'content-length': String(bytes.length)}});
}
function network(bytes = archive(), list = gallery()) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({url, options});
    return options.method === 'POST' ? streamed(Buffer.from(JSON.stringify(list))) : streamed(bytes);
  };
  return {calls, fetchImpl};
}
function noNetwork() { throw new Error('Network must not be used'); }

test('matching project cache is validated and reused without network or config changes', async t => {
  const options = fixture(t), packFile = localPack(path.join(options.projectDir, 'cache', 'zh'));
  const configuration = JSON.stringify({appRoot: options.root, custom: 'preserve'});
  write(path.join(options.projectDir, '.devin-zh.local.json'), configuration);
  const before = fs.readFileSync(packFile);
  const result = await ensureLanguagePack({...options, fetchImpl: noNetwork});
  assert.equal(result.packFile, packFile);
  assert.equal(result.source, 'local');
  assert.equal(result.downloaded, false);
  assert.deepEqual(fs.readFileSync(packFile), before);
  assert.equal(fs.readFileSync(path.join(options.projectDir, '.devin-zh.local.json'), 'utf8'), configuration);
});

test('environment, ignored settings, normal extension folders and prior tool caches are discovered', async t => {
  for (const source of ['env', 'settings', 'extensions', 'tool-cache', 'tool-settings', 'tool-version-cache']) {
    const options = fixture(t), directory = path.join(options.directory, 'pack');
    let packFile = localPack(directory);
    if (source === 'env') options.env.DEVIN_ZH_PACK = packFile;
    if (source === 'settings') write(path.join(options.projectDir, '.devin-zh.local.json'), {packFile});
    if (source === 'extensions') {
      const folder = path.join(options.home, '.devin', 'extensions', `MS-CEINTL.${NAME}-${VERSION}`);
      write(path.join(folder, 'package.json'), packageData());
      write(path.join(folder, 'translations', 'main.i18n.json'), translations());
      packFile = path.join(folder, 'translations', 'main.i18n.json');
      options.extensionDirs = undefined;
    }
    if (source.startsWith('tool-')) {
      const tool = path.join(options.directory, 'older-tool');
      options.toolDirs = [tool];
      if (source === 'tool-cache') packFile = localPack(path.join(tool, 'cache', 'zh'));
      if (source === 'tool-settings') write(path.join(tool, '.devin-zh.local.json'), {packFile});
      if (source === 'tool-version-cache') packFile = localPack(path.join(tool, 'cache', 'language-packs', VERSION));
    }
    const result = await ensureLanguagePack({...options, fetchImpl: noNetwork});
    assert.equal(result.packFile, packFile, source);
  }
});

test('local version mismatch is never rewritten; automatic download creates a separate validated cache', async t => {
  const options = fixture(t), oldPack = localPack(path.join(options.projectDir, 'cache', 'zh'), '1.125.1');
  const previous = fs.readFileSync(oldPack), previousMetadata = fs.readFileSync(path.resolve(path.dirname(oldPack), '..', 'package.json'));
  const provider = network(), progress = [];
  const originalApp = fs.readFileSync(path.join(options.root, 'package.json'));
  const result = await ensureLanguagePack({...options, ...provider, onProgress: item => progress.push(item)});
  assert.equal(result.source, 'download');
  assert.equal(result.version, VERSION);
  assert.deepEqual(fs.readFileSync(oldPack), previous);
  assert.deepEqual(fs.readFileSync(path.resolve(path.dirname(oldPack), '..', 'package.json')), previousMetadata);
  assert.deepEqual(fs.readFileSync(path.join(options.root, 'package.json')), originalApp);
  assert.equal(provider.calls.length, 2);
  assert.ok(progress.some(item => item.phase === 'local-rejected'));
  const byteProgress = progress.filter(item => item.phase === 'download' && item.receivedBytes !== undefined);
  assert.ok(byteProgress.length > 2);
  assert.equal(byteProgress.at(-1).receivedBytes, byteProgress.at(-1).totalBytes);
  assert.ok(byteProgress.every((item, i) => !i || item.receivedBytes >= byteProgress[i - 1].receivedBytes));
  assert.equal(progress.at(-1).phase, 'ready');
  const repeated = await ensureLanguagePack({...options, fetchImpl: noNetwork});
  assert.equal(repeated.packFile, result.packFile);
});

test('VSIX processing extracts only the two data files and never executes extension scripts', async t => {
  const options = fixture(t), script = 'globalThis.languagePackExecuted = true; throw new Error("must not run")';
  const result = await ensureLanguagePack({...options, ...network(archive(VERSION, [['extension/extension.js', script], ['extension/scripts/install.js', script]]))});
  const extension = path.resolve(path.dirname(result.packFile), '..');
  assert.deepEqual(fs.readdirSync(extension).sort(), ['package.json', 'translations']);
  assert.deepEqual(fs.readdirSync(path.join(extension, 'translations')), ['main.i18n.json']);
  assert.equal(globalThis.languagePackExecuted, undefined);
});

test('a missing matching Marketplace version fails explicitly without downloading another minor', async t => {
  const options = fixture(t), provider = network(archive('1.127.0'), gallery(['1.125.9', '1.127.0']));
  await assert.rejects(ensureLanguagePack({...options, ...provider}), {code: 'LANGUAGE_PACK_UNAVAILABLE', suggestedScope: 'agent'});
  assert.equal(provider.calls.length, 1);
  assert.ok(!fs.existsSync(path.join(options.projectDir, 'cache')));
});

test('a downloaded mismatched package and counterfeit local publisher are rejected', async t => {
  const options = fixture(t);
  const packFile = localPack(path.join(options.projectDir, 'cache', 'zh'), VERSION, {publisher: 'Impostor'});
  const original = fs.readFileSync(packFile);
  await assert.rejects(ensureLanguagePack({...options, ...network(archive('1.125.0'))}), {code: 'LANGUAGE_PACK_VERSION'});
  assert.deepEqual(fs.readFileSync(packFile), original);
  assert.ok(!fs.existsSync(path.join(options.projectDir, 'cache', 'language-packs')));
});

test('invalid translation contents fail before a language pack becomes usable', async t => {
  const options = fixture(t), bytes = zip([[PACKAGE, packageData()], [TRANSLATIONS, {contents: {module: {key: 42}}}]]);
  await assert.rejects(ensureLanguagePack({...options, ...network(bytes)}), {code: 'LANGUAGE_PACK_DATA'});
  assert.ok(!fs.existsSync(path.join(options.projectDir, 'cache', 'language-packs')));
});

test('network failure, timeout and external cancellation leave no partial cache', async t => {
  const options = fixture(t);
  await assert.rejects(ensureLanguagePack({...options, fetchImpl: async () => {throw new Error('connection lost');}}), {code: 'LANGUAGE_PACK_NETWORK'});
  await assert.rejects(ensureLanguagePack({...options, timeoutMs: 10, fetchImpl: () => new Promise(() => {})}), {code: 'LANGUAGE_PACK_TIMEOUT'});
  const controller = new AbortController();
  await assert.rejects(ensureLanguagePack({...options, signal: controller.signal, fetchImpl: async () => {controller.abort(); return new Promise(() => {});}}), {code: 'LANGUAGE_PACK_CANCELLED'});
  assert.ok(!fs.existsSync(path.join(options.projectDir, 'cache')));
});

test('download interruption after byte progress cannot publish a truncated cache', async t => {
  const options = fixture(t), progress = [], bytes = archive();
  const provider = network();
  const fetchImpl = async (url, init) => init.method === 'POST' ? provider.fetchImpl(url, init) : new Response(new ReadableStream({start(controller) {
    controller.enqueue(bytes.subarray(0, 30));
    controller.close();
  }}), {headers: {'content-length': String(bytes.length)}});
  await assert.rejects(ensureLanguagePack({...options, fetchImpl, onProgress: event => progress.push(event)}), {code: 'LANGUAGE_PACK_INTERRUPTED'});
  assert.ok(progress.some(event => event.phase === 'download' && event.receivedBytes === 30));
  assert.ok(!fs.existsSync(path.join(options.projectDir, 'cache')));
});

test('automatically decompressed responses have no misleading compressed progress denominator', async t => {
  const options = fixture(t), bytes = archive(), progress = [];
  const provider = network();
  const fetchImpl = async (url, init) => init.method === 'POST' ? provider.fetchImpl(url, init) : new Response(bytes,
    {headers: {'content-encoding': 'gzip', 'content-length': '10'}});
  const result = await ensureLanguagePack({...options, fetchImpl, onProgress: event => progress.push(event)});
  assert.equal(result.downloaded, true);
  const downloadProgress = progress.filter(event => event.phase === 'download' && event.receivedBytes !== undefined);
  assert.ok(downloadProgress.length >= 2);
  assert.ok(downloadProgress.every(event => event.totalBytes === null));
  assert.equal(downloadProgress.at(-1).receivedBytes, bytes.length);
  const oversized = async (url, init) => init.method === 'POST' ? provider.fetchImpl(url, init) : new Response(bytes,
    {headers: {'content-encoding': 'gzip', 'content-length': String(bytes.length + 1)}});
  const isolated = fixture(t);
  await assert.rejects(ensureLanguagePack({...isolated, fetchImpl: oversized, maxDownloadBytes: bytes.length}), {code: 'LANGUAGE_PACK_SIZE'});
});

test('downloaded metadata must exactly match the Gallery-selected version before any cache write', async t => {
  const options = fixture(t), otherVersion = '1.126.2026062901';
  await assert.rejects(ensureLanguagePack({...options, ...network(archive(otherVersion), gallery([VERSION]))}),
    {code: 'LANGUAGE_PACK_VERSION'});
  assert.ok(!fs.existsSync(path.join(options.projectDir, 'cache', 'language-packs')));
});

test('download abort triggered during streaming leaves no extracted data', async t => {
  const options = fixture(t), controller = new AbortController();
  await assert.rejects(ensureLanguagePack({...options, ...network(), signal: controller.signal, onProgress: item => {
    if (item.phase === 'download' && item.receivedBytes > 0) controller.abort();
  }}), {code: 'LANGUAGE_PACK_CANCELLED'});
  assert.ok(!fs.existsSync(path.join(options.projectDir, 'cache')));
});

test('oversized downloads are rejected both with and without Content-Length', async t => {
  const options = fixture(t);
  await assert.rejects(ensureLanguagePack({...options, ...network(), maxDownloadBytes: 50}), {code: 'LANGUAGE_PACK_SIZE'});
  const provider = network(), fetchImpl = async (url, init) => init.method === 'POST' ? provider.fetchImpl(url, init) : new Response(archive());
  await assert.rejects(ensureLanguagePack({...options, fetchImpl, maxDownloadBytes: 50}), {code: 'LANGUAGE_PACK_SIZE'});
  assert.ok(!fs.existsSync(path.join(options.projectDir, 'cache')));
});

test('ZIP CRC mismatch, path traversal and truncated archives are refused', () => {
  const correct = archive();
  assert.ok(extractData(correct).has(TRANSLATIONS));
  const corrupt = Buffer.from(correct), central = corrupt.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  corrupt.writeUInt32LE(0, 14);
  corrupt.writeUInt32LE(0, central + 16);
  assert.throws(() => extractData(corrupt), /CRC/);
  assert.throws(() => extractData(archive(VERSION, [['../outside.js', 'bad']])), /路径穿越/);
  assert.throws(() => extractData(correct.subarray(0, correct.length - 4)), {code: 'LANGUAGE_PACK_ARCHIVE'});
});

test('official download redirects cannot send requests to arbitrary hosts', async t => {
  const options = fixture(t), provider = network(), urls = [];
  const fetchImpl = async (url, init) => {
    urls.push(url);
    return init.method === 'POST' ? provider.fetchImpl(url, init) : new Response(null, {status: 302, headers: {location: 'https://evil.example/stolen.vsix'}});
  };
  await assert.rejects(ensureLanguagePack({...options, fetchImpl}), {code: 'LANGUAGE_PACK_NETWORK'});
  assert.equal(urls.length, 2);
  assert.ok(!urls.some(url => url.includes('evil.example')));
});
