// Installation lifecycle: verified immutable originals, staged writes and rollback.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const cp = require('child_process');
const FILES = ['out/vs/workbench/windsurf-chat-client/index.js', 'out/vs/sessions/sessions.desktop.main.js', 'out/nls.messages.js', 'out/nls.messages.json'];
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const read = f => fs.readFileSync(f, 'utf8');
const json = f => JSON.parse(read(f));
function writeJson(f, value) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const temp = f + '.tmp-' + process.pid;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(temp, f);
}
function location(root, cacheDir = path.resolve(__dirname, '..', 'cache', 'installations')) {
  root = path.resolve(root);
  const product = json(path.join(root, 'product.json'));
  const identity = sha(JSON.stringify([root.toLowerCase(), product.version, product.commit, product.codeiumCommit, product.checksums]));
  return { root, product, dir: path.join(cacheDir, identity), identity };
}
function verifyBundle(relative, source, product) {
  const expected = product.checksums?.[relative.replace(/^out\//, '')];
  if (!expected) throw new Error('缺少官方校验值: ' + relative);
  const actual = crypto.createHash('sha256').update(source).digest('base64').replace(/=+$/, '');
  if (actual !== expected.replace(/=+$/, '')) throw new Error('文件不是当前版本的官方原版: ' + relative);
}
function verifyNls(originals, root) {
  const context = Object.create(null);
  vm.runInNewContext(originals.get('out/nls.messages.js'), context, { timeout: 5000 });
  const messages = JSON.parse(originals.get('out/nls.messages.json'));
  const keys = json(path.join(root, 'out', 'nls.keys.json'));
  if (!Array.isArray(messages) || messages.some(x => typeof x !== 'string') ||
      JSON.stringify(context._VSCODE_NLS_MESSAGES) !== JSON.stringify(messages) ||
      keys.reduce((n, [, list]) => n + list.length, 0) !== messages.length) {
    throw new Error('NLS 原版 JS/JSON/keys 不一致，停止操作');
  }
}
function loadBaseline({ root, cacheDir, create = false }) {
  const loc = location(root, cacheDir);
  if (fs.existsSync(path.join(loc.dir, 'pending.json'))) throw new Error('上次写入被中断，请先运行 recover，未覆盖任何文件');
  const manifestFile = path.join(loc.dir, 'baseline.json');
  let manifest, originals = new Map();
  if (fs.existsSync(manifestFile)) {
    manifest = json(manifestFile);
    for (const relative of FILES) {
      const source = read(path.join(loc.dir, 'original', relative));
      if (sha(source) !== manifest.files[relative]) throw new Error('不可变原版备份已变化: ' + relative);
      originals.set(relative, source);
    }
  } else {
    for (const relative of FILES) {
      const source = read(path.join(loc.root, relative));
      if (source.includes('/*devin-zh:patched*/')) throw new Error('发现旧版补丁但没有已验证原版，请先恢复官方文件: ' + relative);
      originals.set(relative, source);
    }
    manifest = { schema: 2, root: loc.root, identity: loc.identity, files: Object.fromEntries([...originals].map(([k, v]) => [k, sha(v)])) };
  }
  for (const relative of FILES.slice(0, 2)) verifyBundle(relative, originals.get(relative), loc.product);
  for (const relative of FILES.slice(2)) if (loc.product.checksums?.[relative.replace(/^out\//, '')]) verifyBundle(relative, originals.get(relative), loc.product);
  verifyNls(originals, loc.root);
  const stateFile = path.join(loc.dir, 'state.json');
  const state = fs.existsSync(stateFile) ? json(stateFile) : { schema: 2, applied: {} };
  const current = new Map();
  for (const relative of FILES) {
    const source = read(path.join(loc.root, relative));
    const hash = sha(source);
    if (hash !== manifest.files[relative] && hash !== state.applied[relative]) {
      throw new Error('安装文件存在未知修改，未覆盖: ' + relative);
    }
    current.set(relative, source);
  }
  if (create && !fs.existsSync(manifestFile)) {
    for (const [relative, source] of originals) {
      const f = path.join(loc.dir, 'original', relative);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      if (fs.existsSync(f)) {
        if (sha(read(f)) !== sha(source)) throw new Error('中断后的原版备份与当前版本不一致，未覆盖: ' + relative);
      } else fs.writeFileSync(f, source, { flag: 'wx' });
    }
    writeJson(manifestFile, manifest);
  }
  return { ...loc, manifest, originals, current, state, stateFile };
}
function assertStopped(root, {platform = process.platform} = {}) {
  if (platform !== 'win32') throw new Error('当前仅 Windows 支持写入安装。macOS 入口为检查/准备预览版，不直接修改官方 .app；签名及实际启动尚未验证。');
  const exe = path.resolve(root, '..', '..', 'Devin.exe');
  const script = "$ErrorActionPreference = 'Stop'; @(Get-CimInstance Win32_Process -Filter \"Name = 'Devin.exe'\" | Where-Object { $_.ExecutablePath -eq $env:DEVIN_ZH_CHECK_EXE }).Count";
  const output = cp.execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8', windowsHide: true, env: { ...process.env, DEVIN_ZH_CHECK_EXE: exe }
  }).trim();
  if (!/^\d+$/.test(output)) throw new Error('无法检查 Devin 进程，未写入');
  const count = Number(output);
  if (count > 0) throw new Error('Devin 正在运行。请手动完全退出后再 apply/restore；prepare/status 可在运行时使用。');
}
// Read every file checked by Devin, keeping official hashes unchanged.
function integrityStatus(baseline) {
  return Object.entries(baseline.product.checksums || {}).map(([file, expected]) => {
    const relative = 'out/' + file;
    let source;
    try { source = fs.readFileSync(path.join(baseline.root, relative)); }
    catch (error) { if (error.code === 'ENOENT') return { relative, status: 'missing' }; throw error; }
    const officialHash = crypto.createHash('sha256').update(source).digest('base64').replace(/=+$/, '');
    const status = officialHash === expected.replace(/=+$/, '') ? 'official'
      : FILES.includes(relative) && sha(source) === baseline.state.applied[relative] ? 'patch' : 'unknown';
    return { relative, status };
  });
}
function acquireLock(dir, allowStale = false) {
  const file = path.join(dir, 'operation.lock');
  if (fs.existsSync(file)) {
    const owner = json(file);
    if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) throw new Error('操作锁无效，未写入');
    let alive = true;
    // Signal 0 only checks whether a process exists; it does not terminate it.
    try { process.kill(owner.pid, 0); } catch (e) { if (e.code === 'ESRCH') alive = false; }
    if (!allowStale || alive) throw new Error('另一个汉化操作尚未退出；中断后使用 recover，未写入');
    fs.unlinkSync(file);
  }
  const fd = fs.openSync(file, 'wx');
  try { fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, started: new Date().toISOString() })); }
  finally { fs.closeSync(fd); }
  return () => fs.unlinkSync(file);
}
function transaction(baseline, changes, { checkStopped = assertStopped, afterWrite } = {}) {
  checkStopped(baseline.root);
  const allowed = new Set(FILES);
  const seen = new Set();
  for (const change of changes) {
    if (!allowed.has(change.relative) || seen.has(change.relative) || typeof change.source !== 'string') throw new Error('非法或重复的安装目标');
    seen.add(change.relative);
    const active = read(path.join(baseline.root, change.relative));
    if (sha(active) !== sha(baseline.current.get(change.relative))) throw new Error('准备后文件已变化，未覆盖: ' + change.relative);
  }
  const changed = changes.filter(x => sha(x.source) !== sha(baseline.current.get(x.relative)));
  if (!changed.length) return { changed: 0, backup: null };
  const releaseLock = acquireLock(baseline.dir);
  const run = new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid;
  const backup = path.join(baseline.dir, 'runs', run);
  const staged = [];
  const written = [];
  const pendingFile = path.join(baseline.dir, 'pending.json');
  const previousState = fs.existsSync(baseline.stateFile) ? read(baseline.stateFile) : null;
  let journalWritten = false, stateWritten = false;
  try {
    fs.mkdirSync(backup, { recursive: true });
    for (const change of changed) {
      const target = path.join(baseline.root, change.relative);
      const previous = path.join(backup, change.relative);
      fs.mkdirSync(path.dirname(previous), { recursive: true });
      fs.writeFileSync(previous, baseline.current.get(change.relative));
      const temp = target + '.tmp-zh-' + process.pid;
      fs.writeFileSync(temp, change.source, { flag: 'wx' });
      staged.push({ ...change, target, temp, previous });
    }
    checkStopped(baseline.root);
    if (location(baseline.root).identity !== baseline.identity) throw new Error('准备后应用版本已变化，未覆盖');
    for (const item of staged) if (sha(read(item.target)) !== sha(baseline.current.get(item.relative))) throw new Error('准备后文件已变化，未覆盖: ' + item.relative);
    writeJson(pendingFile, { backup, previousState, files: staged.map(x => ({ relative: x.relative, before: sha(baseline.current.get(x.relative)), after: sha(x.source) })) });
    journalWritten = true;
    const state = { schema: 2, applied: { ...baseline.state.applied }, lastRun: run };
    for (let i = 0; i < staged.length; i++) {
      const item = staged[i];
      fs.renameSync(item.temp, item.target);
      written.push(item);
      if (sha(read(item.target)) !== sha(item.source)) throw new Error('写入校验失败: ' + item.relative);
      if (sha(item.source) === baseline.manifest.files[item.relative]) delete state.applied[item.relative];
      else state.applied[item.relative] = sha(item.source);
      if (afterWrite) afterWrite(i, item);
    }
    writeJson(path.join(backup, 'result.json'), { success: true, files: changed.map(x => x.relative) });
    writeJson(baseline.stateFile, state);
    stateWritten = true;
    fs.unlinkSync(pendingFile);
    return { changed: changed.length, backup };
  } catch (error) {
    const rollbackErrors = [];
    for (const item of written) {
      try {
        const currentHash = sha(read(item.target));
        if (currentHash !== sha(item.source) && currentHash !== sha(baseline.current.get(item.relative))) throw new Error('写入后出现未知修改，未覆盖: ' + item.relative);
        fs.copyFileSync(item.previous, item.target);
      } catch (e) { rollbackErrors.push(e.message); }
    }
    try {
      if (stateWritten) {
        if (previousState === null) { if (fs.existsSync(baseline.stateFile)) fs.unlinkSync(baseline.stateFile); }
        else fs.writeFileSync(baseline.stateFile, previousState);
      }
      if (journalWritten && !rollbackErrors.length && fs.existsSync(pendingFile)) fs.unlinkSync(pendingFile);
      writeJson(path.join(backup, 'result.json'), { success: false, error: error.message, rollbackErrors });
    } catch (e) { rollbackErrors.push(e.message); }
    if (rollbackErrors.length) error.message += '\n回滚失败，请使用备份 ' + backup + ': ' + rollbackErrors.join('; ');
    throw error;
  } finally {
    try { for (const item of staged) if (fs.existsSync(item.temp)) fs.unlinkSync(item.temp); }
    finally { releaseLock(); }
  }
}
function restore(options) {
  const baseline = loadBaseline({ ...options, create: true });
  return transaction(baseline, [...baseline.originals].map(([relative, source]) => ({ relative, source })), options);
}
function recover(options) {
  const loc = location(options.root, options.cacheDir);
  const pendingFile = path.join(loc.dir, 'pending.json');
  if (!fs.existsSync(loc.dir)) return { recovered: 0 };
  (options.checkStopped || assertStopped)(loc.root);
  const releaseLock = acquireLock(loc.dir, true);
  try {
  if (!fs.existsSync(pendingFile)) return { recovered: 0 };
  const pending = json(pendingFile);
  const runs = path.resolve(loc.dir, 'runs') + path.sep;
  const backup = path.resolve(pending.backup);
  if (!backup.startsWith(runs)) throw new Error('恢复日志的备份路径不合法');
  const saved = [];
  for (const file of pending.files) {
    if (!FILES.includes(file.relative)) throw new Error('恢复日志目标不合法');
    const source = read(path.join(backup, file.relative));
    if (sha(source) !== file.before) throw new Error('恢复日志备份已改变');
    const currentHash = sha(read(path.join(loc.root, file.relative)));
    if (currentHash !== file.before && currentHash !== file.after) throw new Error('中断后有未知修改，未覆盖: ' + file.relative);
    saved.push({ ...file, source });
  }
  for (const file of saved) fs.writeFileSync(path.join(loc.root, file.relative), file.source);
  const stateFile = path.join(loc.dir, 'state.json');
  if (pending.previousState === null) { if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile); }
  else fs.writeFileSync(stateFile, pending.previousState);
  fs.unlinkSync(pendingFile);
  return { recovered: saved.length, backup };
  } finally { releaseLock(); }
}
module.exports = { FILES, sha, loadBaseline, transaction, restore, recover, assertStopped, verifyBundle, verifyNls, integrityStatus };
