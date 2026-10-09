const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { prepare } = require('../src/nls');

function fixture(t, orig, translations, keys = orig.map((_, i) => `key${i}`)) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devin-zh-nls-test-'));
  t.after(() => {
    const resolved = path.resolve(root);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('devin-zh-nls-test-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(root, 'out'));
  fs.mkdirSync(path.join(root, 'data', 'nls'), { recursive: true });
  fs.writeFileSync(path.join(root, 'out', 'nls.keys.json'), JSON.stringify([['module', keys]]));
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({version:'1.126.0'}));
  fs.mkdirSync(path.join(root,'pack','translations'),{recursive:true});
  fs.writeFileSync(path.join(root,'pack','package.json'),JSON.stringify({version:'1.126.0'}));
  const packFile = path.join(root, 'pack', 'translations', 'main.i18n.json');
  fs.writeFileSync(packFile, JSON.stringify({ contents: { module: translations } }));
  const originalJS = '// prefix [ preserved\nglobalThis._VSCODE_NLS_MESSAGES=' + JSON.stringify(orig) + ';\nglobalThis.extra = "suffix kept";\n';
  const originals = new Map([['out/nls.messages.js', originalJS], ['out/nls.messages.json', JSON.stringify(orig)]]);
  return { root, originals, packFile, dataDir: path.join(root, 'data'), originalJS };
}

test('NLS rejects shifted key counts before producing changes', t => {
  const options = fixture(t, ['One', 'Two'], { key0: '一' }, ['key0']);
  assert.throws(() => prepare(options), /key count 1.*messages count 2/);
});

test('a VS Code minor upgrade requires a matching language pack before NLS changes are built', t => {
  const options=fixture(t,['One'],{key0:'一'});
  fs.writeFileSync(path.join(options.root,'package.json'),JSON.stringify({version:'1.127.0'}));
  fs.mkdirSync(path.join(options.root,'pack','translations'),{recursive:true});
  fs.writeFileSync(path.join(options.root,'pack','package.json'),JSON.stringify({version:'1.126.0'}));
  const packFile=path.join(options.root,'pack','translations','main.i18n.json');
  fs.copyFileSync(options.packFile,packFile);
  assert.throws(()=>prepare({...options,packFile}),/does not match/);
  fs.writeFileSync(path.join(options.root,'pack','package.json'),JSON.stringify({version:'1.127.1'}));
  assert.equal(prepare({...options,packFile}).stats.translated,1);
});

test('missing pack version metadata cannot bypass the NLS compatibility check', t => {
  const options=fixture(t,['One'],{key0:'一'});
  fs.unlinkSync(path.join(options.root,'pack','package.json'));
  assert.throws(()=>prepare(options),/version metadata missing/);
});

test('NLS skips mismatched placeholders, markup and types', t => {
  const options = fixture(t, ['Hello {0}', '{{count}} tasks', '<b>Hello</b>', 'String'], {
    key0: '你好 {1}', key1: '{{total}} 个任务', key2: '<i>你好</i>', key3: 42,
  });
  const result = prepare(options);
  assert.deepEqual(JSON.parse(result.changes[1].source), ['Hello {0}', '{{count}} tasks', '<b>Hello</b>', 'String']);
  assert.equal(result.stats.rejected, 4);
  assert.equal(result.stats.translated, 0);
});

test('NLS preserves prefix and suffix while using official, manual and forced translations', t => {
  const options = fixture(t, ['Hello {0}', 'Manual', 'Force'], { key0: '你好 {0}', key2: '官方' });
  fs.writeFileSync(path.join(options.dataDir, 'nls', 'extra.json'), JSON.stringify({ 'Hello {0}': '手动 {0}', Manual: '手动' }));
  fs.writeFileSync(path.join(options.dataDir, 'nls.json'), JSON.stringify({ Force: '强制' }));
  const result = prepare(options);
  assert.deepEqual(JSON.parse(result.changes[1].source), ['你好 {0}', '手动', '强制']);
  assert.ok(result.changes[0].source.startsWith('// prefix [ preserved\n'));
  assert.ok(result.changes[0].source.endsWith(';\nglobalThis.extra = "suffix kept";\n'));
  assert.equal(result.stats.translated, 3);
  assert.equal(result.stats.manual, 1);
  assert.equal(result.stats.forced, 1);
});

test('NLS rejects JS and JSON original mismatch', t => {
  const options = fixture(t, ['Original'], {});
  options.originals.set('out/nls.messages.json', '["Other"]');
  assert.throws(() => prepare(options), /originals disagree/);
});

test('unchanged English pack entries allow reviewed manual fallback but real translations keep priority', t => {
  const options = fixture(t, ['Agent settings', 'Official setting', 'Hello {0}', 'Untouched'], {
    key0: 'Agent settings', key1: '官方设置', key2: 'Hello {0}', key3: 'Untouched',
  });
  fs.writeFileSync(path.join(options.dataDir, 'nls', 'extra.json'), JSON.stringify({
    'Agent settings': 'Agent 设置', 'Official setting': '人工设置', 'Hello {0}': '你好 {1}',
  }));
  const result = prepare(options);
  assert.deepEqual(JSON.parse(result.changes[1].source), ['Agent 设置', '官方设置', 'Hello {0}', 'Untouched']);
  assert.equal(result.stats.manual, 1);
  assert.equal(result.stats.official, 1);
  assert.equal(result.stats.rejected, 1);
});

test('NLS does not translate inherited property names', t => {
  const options = fixture(t, ['toString', 'constructor', '__proto__'], {}, ['toString', 'constructor', '__proto__']);
  const result = prepare(options);
  assert.equal(result.stats.rejected, 0);
  assert.deepEqual(JSON.parse(result.changes[1].source), ['toString', 'constructor', '__proto__']);
});

test('NLS missing language pack returns an actionable error code', t => {
  const options = fixture(t, ['Original'], {});
  options.packFile = path.join(options.root, 'missing.json');
  assert.throws(() => prepare(options), { code: 'NLS_PACK_MISSING' });
});
