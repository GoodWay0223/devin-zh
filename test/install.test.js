const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { FILES, sha, loadBaseline, transaction, restore, recover, integrityStatus } = require('../src/install');

const stopped = { checkStopped: () => {} };
function write(file, source) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source);
}
function snapshot(dir) {
  if (!fs.existsSync(dir)) return null;
  const result = {};
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(current, entry.name), relative = path.relative(dir, file);
      if (entry.isDirectory()) visit(file);
      else result[relative] = { source: fs.readFileSync(file, 'utf8'), mtime: fs.statSync(file).mtimeMs };
    }
  }
  visit(dir);
  return result;
}
function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'devin-zh-install-test-'));
  t.after(() => {
    const resolved = path.resolve(base);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('devin-zh-install-test-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  const root = path.join(base, 'app'), cacheDir = path.join(base, 'cache');
  const sources = new Map([
    [FILES[0], 'globalThis.chat = "original";\n'],
    [FILES[1], 'globalThis.sessions = "original";\n'],
    [FILES[2], 'globalThis._VSCODE_NLS_MESSAGES=["One","Two"];\n'],
    [FILES[3], '["One","Two"]'],
  ]);
  for (const [relative, source] of sources) write(path.join(root, relative), source);
  const checksums = Object.fromEntries([...sources].map(([relative, source]) => [relative.replace(/^out\//, ''), crypto.createHash('sha256').update(source).digest('base64').replace(/=+$/, '')]));
  write(path.join(root, 'product.json'), JSON.stringify({ version: 'test-1', commit: 'official-fixture', checksums }));
  write(path.join(root, 'out', 'nls.keys.json'), JSON.stringify([['test/module', ['one', 'two']]]));
  return { root, cacheDir, sources };
}
function patch(sources) {
  return [...sources].map(([relative, source]) => ({ relative, source: relative.endsWith('.json') ? '["一","二"]' : source.replace('original', 'translated').replace('["One","Two"]', '["一","二"]') }));
}
function currentSources(root) {
  return new Map(FILES.map(relative => [relative, fs.readFileSync(path.join(root, relative), 'utf8')]));
}

function splitHostFixture(t) {
  const options = fixture(t);
  const entry = 'out/vs/workbench/devin-webapp-host/index.js';
  const target = 'out/vs/workbench/devin-webapp-host/assets/ui-build.js';
  const proof = 'out/vs/workbench/devin-webapp-host/assets/runtime-build.js';
  const sources = {[entry]:'import "./assets/ui-build.js";', [target]:'const label="Settings";', [proof]:'const jsx="runtime evidence";'};
  for (const [relative, source] of Object.entries(sources)) write(path.join(options.root, relative), source);
  const productFile = path.join(options.root, 'product.json'), product = JSON.parse(fs.readFileSync(productFile,'utf8'));
  product.windsurfVersion = '3.11.fixture';
  product.checksums[entry.slice(4)] = crypto.createHash('sha256').update(sources[entry]).digest('base64');
  write(productFile, JSON.stringify(product));
  const build = {version:product.windsurfVersion,targets:[target],files:Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,sha(v)]))};
  return {...options,target,proof,hostSources:sources,hostCatalog:{schema:1,builds:{[product.commit]:build}}};
}

function legacyHostBaseline(options) {
  const loc = loadBaseline(options);
  const manifest = {schema:2,root:loc.root,identity:loc.identity,files:Object.fromEntries([...options.sources].map(([relative,source])=>[relative,sha(source)]))};
  for (const [relative,source] of options.sources) write(path.join(loc.dir,'original',relative),source);
  write(path.join(loc.dir,'baseline.json'),JSON.stringify(manifest));
  const priorPatch='globalThis.chat="旧版已汉化";';
  write(path.join(options.root,FILES[0]),priorPatch);
  write(path.join(loc.dir,'state.json'),JSON.stringify({schema:2,applied:{[FILES[0]]:sha(priorPatch)}}));
  return loc;
}

test('an older four-file baseline gains verified host originals without losing legacy patches', t => {
  const options=splitHostFixture(t),loc=legacyHostBaseline(options);
  const before=snapshot(options.cacheDir),readOnly=loadBaseline(options);
  assert.deepEqual(snapshot(options.cacheDir),before,'status must not migrate files');
  assert.equal(readOnly.originals.get(options.target),options.hostSources[options.target]);
  const migrated=loadBaseline({...options,create:true});
  assert.equal(migrated.identity,loc.identity);
  assert.equal(fs.readFileSync(path.join(loc.dir,'baseline-before-host-targets.json'),'utf8'),before[''+path.relative(options.cacheDir,path.join(loc.dir,'baseline.json'))].source);
  assert.equal(fs.readFileSync(path.join(loc.dir,'state.json'),'utf8'),before[path.relative(options.cacheDir,path.join(loc.dir,'state.json'))].source);
  restore({...options,...stopped});
  for(const [relative,source] of options.sources) assert.equal(fs.readFileSync(path.join(options.root,relative),'utf8'),source);
  assert.equal(fs.readFileSync(path.join(options.root,options.target),'utf8'),options.hostSources[options.target]);
});

test('extending old baselines rejects unverified new targets before writing backup metadata', t => {
  const options=splitHostFixture(t);legacyHostBaseline(options);
  write(path.join(options.root,options.target),'unexpected local edit');
  const before=snapshot(options.cacheDir);
  assert.throws(()=>loadBaseline({...options,create:true}),/新增界面目标不是/);
  assert.deepEqual(snapshot(options.cacheDir),before);
});

test('split host assets participate in verified backups, apply and restore', t => {
  const options = splitHostFixture(t), baseline = loadBaseline({...options,create:true});
  assert.ok(baseline.files.includes(options.target));
  const source = 'const label="设置";';
  transaction(baseline,[{relative:options.target,source}],stopped);
  assert.equal(loadBaseline(options).current.get(options.target),source);
  restore({...options,...stopped});
  assert.equal(fs.readFileSync(path.join(options.root,options.target),'utf8'),options.hostSources[options.target]);
  assert.equal(fs.readFileSync(path.join(baseline.dir,'original',options.target),'utf8'),options.hostSources[options.target]);
});

test('split host rejects unsupported builds, unsafe catalog targets and altered proof dependencies', t => {
  const options = splitHostFixture(t);
  assert.throws(()=>loadBaseline({...options,hostCatalog:{schema:1,builds:{}}}),/独立界面资源尚未适配/);
  const invalid = structuredClone(options.hostCatalog);
  Object.values(invalid.builds)[0].targets.push('../outside.js');
  assert.throws(()=>loadBaseline({...options,hostCatalog:invalid}),/目标不在/);
  write(path.join(options.root,options.proof),'modified runtime');
  assert.throws(()=>loadBaseline(options),/已审查官方版本不一致/);
});

test('split host rejects unknown target edits and rechecks proof before writes', t => {
  const options = splitHostFixture(t), baseline = loadBaseline({...options,create:true});
  write(path.join(options.root,options.target),'unknown edit');
  assert.throws(()=>loadBaseline(options),/未知修改/);
  write(path.join(options.root,options.target),options.hostSources[options.target]);
  write(path.join(options.root,options.proof),'modified runtime');
  assert.throws(()=>transaction(baseline,[{relative:options.target,source:'translated'}],stopped),/已审查官方版本不一致/);
  assert.equal(fs.readFileSync(path.join(options.root,options.target),'utf8'),options.hostSources[options.target]);
});

test('split host interrupted transaction recovers only validated journal targets', t => {
  const options = splitHostFixture(t), baseline = loadBaseline({...options,create:true});
  const backup = path.join(baseline.dir,'runs','host-interrupted'), before=options.hostSources[options.target], after='const label="设置";';
  write(path.join(backup,options.target),before);
  write(path.join(options.root,options.target),after);
  write(path.join(baseline.dir,'pending.json'),JSON.stringify({backup,previousState:null,files:[{relative:options.target,before:sha(before),after:sha(after)}]}));
  assert.throws(()=>loadBaseline(options),/中断/);
  assert.equal(recover({...options,...stopped}).recovered,1);
  assert.equal(loadBaseline(options).current.get(options.target),before);
});

test('integrity report distinguishes official files and recorded patches without changing official hashes', t => {
  const options = fixture(t);
  const baseline = loadBaseline({ ...options, create: true });
  const manifestBefore = fs.readFileSync(path.join(options.root, 'product.json'), 'utf8');
  assert.ok(integrityStatus(baseline).every(x => x.status === 'official'));
  transaction(baseline, patch(options.sources), stopped);
  assert.ok(integrityStatus(loadBaseline(options)).every(x => x.status === 'patch'));
  assert.equal(fs.readFileSync(path.join(options.root, 'product.json'), 'utf8'), manifestBefore);
});

test('integrity report checks unrelated official files and reports unknown or missing bytes', t => {
  const options = fixture(t);
  const manifestFile = path.join(options.root, 'product.json');
  const product = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  product.checksums['other.js'] = crypto.createHash('sha256').update('original').digest('base64');
  write(manifestFile, JSON.stringify(product));
  const baseline = loadBaseline({ ...options, create: true });
  assert.equal(integrityStatus(baseline).at(-1).status, 'missing');
  write(path.join(options.root, 'out', 'other.js'), 'unrelated modification');
  assert.equal(integrityStatus(baseline).at(-1).status, 'unknown');
  write(path.join(options.root, 'out', 'other.js'), 'original');
  assert.equal(integrityStatus(baseline).at(-1).status, 'official');
});

test('an official app upgrade creates a separate baseline and restores only the new version', t => {
  const options=fixture(t);
  const old=loadBaseline({...options,create:true});
  transaction(old,patch(options.sources),stopped);
  const oldSnapshot=snapshot(old.dir);
  const newSources=new Map([...options.sources].map(([relative,source])=>[relative,source+'\n']));
  for(const [relative,source] of newSources) write(path.join(options.root,relative),source);
  const checksums=Object.fromEntries([...newSources].map(([relative,source])=>[relative.replace(/^out\//,''),crypto.createHash('sha256').update(source).digest('base64').replace(/=+$/,'')]));
  write(path.join(options.root,'product.json'),JSON.stringify({version:'test-2',commit:'new-official-fixture',checksums}));
  const upgraded=loadBaseline({...options,create:true});
  assert.notEqual(upgraded.identity,old.identity);
  assert.deepEqual(upgraded.state.applied,{});
  assert.deepEqual(upgraded.originals,newSources);
  transaction(upgraded,patch(newSources),stopped);
  restore({...options,...stopped});
  assert.deepEqual(currentSources(options.root),newSources);
  assert.deepEqual(snapshot(old.dir),oldSnapshot);
});

test('interrupted batch requires explicit recovery and restores verified previous bytes', t => {
  const options = fixture(t);
  const baseline = loadBaseline({ ...options, create: true });
  const backup = path.join(baseline.dir, 'runs', 'interrupted');
  const changes = patch(options.sources);
  const files = changes.map(x => {
    write(path.join(backup, x.relative), options.sources.get(x.relative));
    return { relative: x.relative, before: sha(options.sources.get(x.relative)), after: sha(x.source) };
  });
  write(path.join(baseline.dir, 'pending.json'), JSON.stringify({ backup, previousState: null, files }));
  write(path.join(options.root, changes[0].relative), changes[0].source);
  assert.throws(() => loadBaseline(options), /recover/);
  const result = recover({ ...options, ...stopped });
  assert.equal(result.recovered, 4);
  assert.deepEqual(currentSources(options.root), options.sources);
  assert.equal(fs.existsSync(path.join(baseline.dir, 'pending.json')), false);
  assert.deepEqual(loadBaseline(options).state.applied, {});
});

test('recovery refuses unknown changes after an interruption instead of overwriting them', t => {
  const options = fixture(t);
  const baseline = loadBaseline({ ...options, create: true });
  const backup = path.join(baseline.dir, 'runs', 'interrupted');
  const relative = FILES[0];
  write(path.join(backup, relative), options.sources.get(relative));
  write(path.join(baseline.dir, 'pending.json'), JSON.stringify({ backup, previousState: null, files: [{ relative, before: sha(options.sources.get(relative)), after: sha('patched') }] }));
  write(path.join(options.root, relative), 'user-modification');
  assert.throws(() => recover({ ...options, ...stopped }), /未知修改/);
  assert.equal(fs.readFileSync(path.join(options.root, relative), 'utf8'), 'user-modification');
});

test('a change during staging is preserved when precommit validation fails', t => {
  const options = fixture(t);
  const baseline = loadBaseline({ ...options, create: true });
  let checks = 0;
  assert.throws(() => transaction(baseline, patch(options.sources), {
    checkStopped() {
      if (++checks === 2) write(path.join(options.root, FILES[0]), 'external edit during staging');
    },
  }), /文件已变化/);
  assert.equal(fs.readFileSync(path.join(options.root, FILES[0]), 'utf8'), 'external edit during staging');
  for (const relative of FILES.slice(1)) assert.equal(fs.readFileSync(path.join(options.root, relative), 'utf8'), options.sources.get(relative));
});

test('concurrent installer lock refuses a second operation before any file is written', t => {
  const options = fixture(t);
  const baseline = loadBaseline({ ...options, create: true });
  write(path.join(baseline.dir, 'operation.lock'), JSON.stringify({ pid: process.pid }));
  assert.throws(() => transaction(baseline, patch(options.sources), stopped), /另一个汉化操作/);
  assert.deepEqual(currentSources(options.root), options.sources);
  assert.equal(fs.existsSync(path.join(baseline.dir, 'state.json')), false);
});

test('baseline verifies official bundle checksums and refuses modified initial files', t => {
  const options = fixture(t);
  write(path.join(options.root, FILES[0]), 'globalThis.chat = "tampered";\n');
  assert.throws(() => loadBaseline(options), /官方原版/);
  assert.equal(snapshot(options.cacheDir), null);
});

test('baseline rejects shifted NLS keys and disagreeing original JS/JSON', t => {
  const options = fixture(t);
  write(path.join(options.root, 'out', 'nls.keys.json'), JSON.stringify([['test/module', ['one']]]));
  assert.throws(() => loadBaseline(options), /NLS.*不一致|官方原版/);
  write(path.join(options.root, 'out', 'nls.keys.json'), JSON.stringify([['test/module', ['one', 'two']]]));
  write(path.join(options.root, FILES[3]), '["Different","Two"]');
  assert.throws(() => loadBaseline(options), /NLS.*不一致|官方原版/);
  assert.equal(snapshot(options.cacheDir), null);
});

test('status-style baseline reads do not create backups or write any files', t => {
  const options = fixture(t), initial = snapshot(options.root);
  loadBaseline(options);
  assert.deepEqual(snapshot(options.root), initial);
  assert.equal(snapshot(options.cacheDir), null);
  loadBaseline({ ...options, create: true });
  const cached = snapshot(options.cacheDir);
  loadBaseline(options);
  assert.deepEqual(snapshot(options.root), initial);
  assert.deepEqual(snapshot(options.cacheDir), cached);
});

test('baseline refuses unknown active changes and tampered immutable backups', t => {
  const options = fixture(t), baseline = loadBaseline({ ...options, create: true });
  write(path.join(options.root, FILES[1]), 'globalThis.sessions = "unknown";\n');
  assert.throws(() => loadBaseline(options), /未知修改/);
  write(path.join(options.root, FILES[1]), options.sources.get(FILES[1]));
  write(path.join(baseline.dir, 'original', FILES[1]), 'modified immutable backup');
  assert.throws(() => loadBaseline(options), /不可变原版备份已变化/);
});

test('transaction commits hashes to state and leaves verified original backups immutable', t => {
  const options = fixture(t), baseline = loadBaseline({ ...options, create: true });
  const originalSnapshot = snapshot(path.join(baseline.dir, 'original'));
  const changes = patch(options.sources), result = transaction(baseline, changes, stopped);
  assert.equal(result.changed, FILES.length);
  const reloaded = loadBaseline(options);
  for (const change of changes) {
    assert.equal(reloaded.current.get(change.relative), change.source);
    assert.equal(reloaded.state.applied[change.relative], sha(change.source));
    assert.equal(reloaded.originals.get(change.relative), options.sources.get(change.relative));
  }
  assert.deepEqual(snapshot(path.join(baseline.dir, 'original')), originalSnapshot);
});

test('failure after a partial batch write rolls back every file and preserves previous state', t => {
  const options = fixture(t);
  const first = loadBaseline({ ...options, create: true });
  transaction(first, patch(options.sources), stopped);
  const baseline = loadBaseline(options), initial = currentSources(options.root);
  const stateBefore = fs.readFileSync(baseline.stateFile, 'utf8');
  const originalsBefore = snapshot(path.join(baseline.dir, 'original'));
  const restoreChanges = [...options.sources].map(([relative, source]) => ({ relative, source }));
  assert.throws(() => transaction(baseline, restoreChanges, { ...stopped, afterWrite: index => { if (index === 1) throw new Error('injected write failure'); } }), /injected write failure/);
  assert.deepEqual(currentSources(options.root), initial);
  assert.equal(fs.readFileSync(baseline.stateFile, 'utf8'), stateBefore);
  assert.deepEqual(snapshot(path.join(baseline.dir, 'original')), originalsBefore);
  const reloaded = loadBaseline(options);
  assert.deepEqual(reloaded.state, baseline.state);
  for (const relative of FILES) assert.ok(!fs.existsSync(path.join(options.root, relative) + '.tmp-zh-' + process.pid));
});

test('repeated apply returns no changes and performs no writes', t => {
  const options = fixture(t), changes = patch(options.sources);
  transaction(loadBaseline({ ...options, create: true }), changes, stopped);
  const filesBefore = snapshot(options.root), cacheBefore = snapshot(options.cacheDir);
  const result = transaction(loadBaseline(options), changes, stopped);
  assert.equal(result.changed, 0);
  assert.equal(result.backup, null);
  assert.deepEqual(snapshot(options.root), filesBefore);
  assert.deepEqual(snapshot(options.cacheDir), cacheBefore);
});

test('restore recovers originals and clears recorded applied hashes', t => {
  const options = fixture(t);
  transaction(loadBaseline({ ...options, create: true }), patch(options.sources), stopped);
  const result = restore({ ...options, ...stopped });
  assert.equal(result.changed, FILES.length);
  assert.deepEqual(currentSources(options.root), options.sources);
  assert.deepEqual(loadBaseline(options).state.applied, {});
});

test('transaction refuses files changed after preparation', t => {
  const options = fixture(t), baseline = loadBaseline({ ...options, create: true });
  const changedFile = path.join(options.root, FILES[0]);
  write(changedFile, 'external change after preparation');
  assert.throws(() => transaction(baseline, patch(options.sources), stopped), /准备后文件已变化/);
  assert.equal(fs.readFileSync(changedFile, 'utf8'), 'external change after preparation');
});
