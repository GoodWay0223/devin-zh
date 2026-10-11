#!/usr/bin/env node
// Devin Desktop 汉化工具: node src/cli.js <apply|restore|status|translate|missing>
const fs = require('fs'), path = require('path');
const C = require('./core');
const I = require('./install');
const { patchSource } = require('./patch');
const toolVersion = require('../package.json').version;

const cmd = process.argv[2] || 'status';

const option = name => process.argv.slice(3).find(x => x.startsWith('--' + name + '='))?.slice(name.length + 3);
const progressOutput = process.argv.includes('--progress');
const progress = (message,completed,total,busy=true) => {
  if (progressOutput) console.log(JSON.stringify({type:'progress',message,completed,total,busy,unit:'steps'}));
};
function checkInstallation(baseline) {
  const unknown = I.integrityStatus(baseline).filter(x => ['missing', 'unknown'].includes(x.status));
  if (unknown.length) throw new Error('安装存在未知修改或缺失，未生成或应用补丁：' + unknown.map(x => x.relative).join('；'));
}
function prepare() {
  const machineOutput = process.argv.includes('--json') || progressOutput;
  const scope = option('scope') || 'all';
  if (!['all', 'web', 'nls'].includes(scope)) throw new Error('--scope 必须为 all/web/nls');
  const total = scope === 'all' ? 5 : scope === 'web' ? 4 : 3;
  let completed = 0;
  progress('检查原版并保存恢复备份',completed,total);
  const baseline = I.loadBaseline({ root: C.ROOT, create: true });
  checkInstallation(baseline);
  progress('原版检查和备份完成',++completed,total,false);
  const D = C.loadDict();
  const changes = [];
  if (scope !== 'nls') for (const relative of I.FILES.slice(0, 2)) {
    progress(relative === I.FILES[0] ? '正在汉化聊天界面' : '正在汉化会话和设置界面',completed,total);
    const result = patchSource(baseline.originals.get(relative), D, undefined, { requireCompatibility: true });
    changes.push({ relative, ...result });
    progress('界面补丁已生成',++completed,total,false);
    if (!machineOutput) console.log(`${relative}: i18n ${result.stats.i18n}，React 文本 ${result.stats.ui}，动态导航/菜单 ${result.stats.display}，拒绝 ${result.stats.rejected}`);
  }
  if (scope !== 'web') {
    progress('正在汉化编辑器菜单',completed,total);
    const result = require('./nls').prepare({ root: C.ROOT, originals: baseline.originals });
    changes.push(...result.changes);
    progress('编辑器菜单补丁已生成',++completed,total,false);
    if (!machineOutput) console.log(`NLS: ${result.stats.translated}/${result.stats.total}，拒绝 ${result.stats.rejected}`);
  }
  const digest = I.sha(JSON.stringify(changes.map(x => [x.relative, I.sha(x.source)])));
  const directory = path.resolve(__dirname, '..', 'cache', 'plans', baseline.identity, scope + '-' + digest);
  const report = { schema: 3, toolVersion, scope, identity: baseline.identity, root: baseline.root, files: [] };
  for (const change of changes) {
    const file = path.join(directory, change.relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, change.source);
    report.files.push({ relative: change.relative, originalHash: baseline.manifest.files[change.relative], generatedHash: I.sha(change.source), stats: change.stats, rejections: change.rejections, compatibility: change.compatibility });
  }
  const reportFile = path.join(directory, 'report.json');
  progress('保存本版本的汉化结果',completed,total);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
  progress('准备完成，尚未修改 Devin',++completed,total,false);
  console.log(progressOutput ? JSON.stringify({type:'prepared',reportFile,scope,files:report.files}) : machineOutput ? JSON.stringify({reportFile,scope,files:report.files},null,2) : '已准备，未修改安装文件。报告: ' + reportFile);
  return { baseline, changes, reportFile };
}
function apply() {
  I.assertStopped(C.ROOT);
  let plan;
  if (option('prepared')) {
    const file = path.resolve(option('prepared'));
    const report = C.readJson(file);
    const baseline = I.loadBaseline({ root: C.ROOT, create: true });
    checkInstallation(baseline);
    require('./compatibility').assertPreparedCompatibility(report, baseline.identity, toolVersion);
    const changes = report.files.map(entry => {
      if (!I.FILES.includes(entry.relative) || entry.originalHash !== baseline.manifest.files[entry.relative]) throw new Error('报告目标或原版校验不正确');
      const source = fs.readFileSync(path.join(path.dirname(file), entry.relative), 'utf8');
      if (I.sha(source) !== entry.generatedHash) throw new Error('生成文件已变化: ' + entry.relative);
      return { relative: entry.relative, source };
    });
    plan = { baseline, changes };
  } else plan = prepare();
  if (plan.changes.some(x => x.relative.endsWith('/index.js') || x.relative.endsWith('/sessions.desktop.main.js'))) {
    console.log('提示：完整界面汉化会改变官方校验的脚本，Devin 将提示“安装似乎损坏”。这是补丁差异；官方校验值保持原样。restore 可恢复。');
  }
  const result = I.transaction(plan.baseline, plan.changes);
  console.log(`已应用 ${result.changed} 个文件。${result.backup ? '回滚备份: ' + result.backup : '当前已是同一补丁，无需重复写入。'}`);
}
function restore() {
  const result = I.restore({ root: C.ROOT });
  console.log(`已恢复 ${result.changed} 个文件，官方原版校验通过。`);
  if (result.backup) console.log('恢复前备份: ' + result.backup);
}
function recover() {
  const result = I.recover({ root: C.ROOT });
  console.log(`已恢复上次中断的 ${result.recovered} 个文件。`);
}
function collect() {
  const all = new Map(); // "path\0en" -> [path, en]
  for (const f of C.TARGETS) {
    const { src } = C.original(f);
    for (const b of C.scanBlocks(src)) if (b.en) for (const [p, v] of C.leaves(b.obj)) if (C.isEnglish(v)) all.set(p + '\0' + v, [p, v]);
  }
  return [...all.values()];
}

// 硬编码文本候选: 去掉 i18n 块后, 在界面属性里出现的、像人话的英文
function collectStrings() {
  const all = new Map();
  for (const f of C.TARGETS) {
    const { src } = C.original(f);
    for (const node of C.analyze(src).ui) {
      const v = node.value;
      if (!C.isEnglish(v) || v.length > 200 || !/^[A-Z]/.test(v) || /[{}<>=;\\]/.test(v) || /^[A-Za-z]+[A-Z][A-Za-z]*$/.test(v) && !/ /.test(v)) continue;
      all.set(v, (all.get(v) || 0) + 1);
    }
  }
  return all;
}

function strings() {
  const D = C.loadDict(); const all = collectStrings();
  const un = [...all].filter(([v]) => D.str(v) === undefined).sort((a, b) => b[1] - a[1]);
  console.log(`硬编码候选 ${all.size}, 未翻译 ${un.length}`);
  if (process.argv[3] === 'list') console.log(un.map(x => x[0] + ' (' + x[1] + ')').join('\n'));
}

// 清理机翻表里已不再出现在英文资源中的条目 (例如旧版本遗留 / 误翻的其它语言块)
function prune() {
  const keep = new Set(collect().map(([p, v]) => p + '\0' + v)), tbl = C.readJson(C.dataFile('i18n.mt.json'));
  let n = 0, m = 0;
  for (const p of Object.keys(tbl)) { for (const v of Object.keys(tbl[p])) { if (keep.has(p + '\0' + v)) m++; else { delete tbl[p][v]; n++; } } if (!Object.keys(tbl[p]).length) delete tbl[p]; }
  C.writeJson(C.dataFile('i18n.mt.json'), tbl); console.log('机翻表: 保留', m, '清除', n);
}

function status() {
  const baseline = I.loadBaseline({ root: C.ROOT });
  console.log('安装目录: ' + baseline.root);
  console.log('原版备份: ' + baseline.dir);
  for (const relative of I.FILES) console.log(relative, I.sha(baseline.current.get(relative)) === baseline.manifest.files[relative] ? '官方原版' : '已汉化（已验证生成文件）');
  const checks = I.integrityStatus(baseline);
  const patches = checks.filter(x => x.status === 'patch');
  const unexpected = checks.filter(x => ['unknown', 'missing'].includes(x.status));
  console.log(`Devin 官方完整性检查：${checks.filter(x => x.status === 'official').length}/${checks.length} 个文件匹配原版；${patches.length} 个为已验证补丁差异；${unexpected.length} 个未知或缺失。`);
  if (patches.length) console.log('“安装似乎损坏”提示来源于上述汉化差异；其显示偏好可单独设置，该提示本身不能证明文件损坏。');
  for (const entry of unexpected) console.error('需要排查：' + entry.relative + ' (' + entry.status + ')');
  if (unexpected.length) process.exitCode = 1;
}

function doctor() {
  const baseline = I.loadBaseline({ root: C.ROOT });
  console.log(`汉化工具 ${toolVersion}；Devin ${baseline.product.windsurfVersion || '未知版本'}；VS Code ${baseline.product.version || '未知版本'}；安装标识 ${baseline.identity}`);
  const problems = I.integrityStatus(baseline).filter(x => ['missing', 'unknown'].includes(x.status));
  for (const problem of problems) console.error('未知安装变化：' + problem.relative);
  for (const relative of I.FILES.slice(0, 2)) {
    const compatibility = require('./compatibility').webCompatibility(C.analyze(baseline.originals.get(relative)));
    console.log(relative + ': ' + (compatibility.compatible ? 'Web 结构兼容' : compatibility.reasons.join('；')));
    if (!compatibility.compatible) problems.push(compatibility);
  }
  if (option('scope') !== 'web') try {
    require('./nls').prepare({ root: C.ROOT, originals: baseline.originals });
    console.log('NLS 语言包及消息结构兼容');
  } catch (error) { console.error('NLS 尚未适配：' + error.message); problems.push(error); }
  console.log('doctor 只读检查完成，没有修改安装文件。');
  if (problems.length) process.exitCode = 1;
}

// 通用机翻循环: queue 为 [key, en][]; sink(key, en, zh) 写入结果; 每 200 条落盘
async function runMT(queue, sink, save) {
  const { translateBatch } = require('./mt');
  const conc = +process.env.CONC || 3; let done = 0, fail = 0, i = 0, last = 0;
  console.log('待机翻', queue.length);
  // 相同英文只翻一次; 按字数分批
  const uniq = [...new Set(queue.map(q => q[1]))], zhOf = new Map(), batches = [];
  for (let s = 0, cur = [], n = 0; s <= uniq.length; s++) {
    if (s === uniq.length || n + uniq[s].length > 2500 || cur.length >= 30) { if (cur.length) batches.push(cur); cur = []; n = 0; }
    if (s < uniq.length) { cur.push(uniq[s]); n += uniq[s].length; }
  }
  const worker = async () => {
    while (i < batches.length) {
      const b = batches[i++], r = await translateBatch(b);
      b.forEach((v, j) => { zhOf.set(v, r[j]); for (const p of byV.get(v)) r[j] ? sink(p, v, r[j]) : fail++; });
      done += b.length; if (done - last >= 300) { last = done; save(); console.log(done + '/' + uniq.length, '失败', fail); }
    }
  };
  const byV = new Map(); for (const [p, v] of queue) (byV.get(v) || byV.set(v, []).get(v)).push(p);
  await Promise.all(Array.from({ length: conc }, worker));
  save(); console.log('完成', done, '失败(保留英文)', fail);
}

async function translate() {
  const D = C.loadDict(); const mtTbl = D.mt;
  const todo = collect().filter(([p, v]) => D.resolveI18n(p, v) === undefined).slice(0, +process.argv[3] || Infinity);
  await runMT(todo, (p, v, zh) => ((mtTbl[p] ||= {})[v] = zh), () => C.writeJson(C.dataFile('i18n.mt.json'), mtTbl));
}

async function translateStrings() {
  const D = C.loadDict(); const tbl = C.readJson(C.dataFile('strings.mt.json'));
  const todo = [...collectStrings().keys()].filter(v => D.str(v) === undefined).slice(0, +process.argv[3] || Infinity).map(v => [v, v]);
  await runMT(todo, (k, v, zh) => (tbl[v] = zh), () => C.writeJson(C.dataFile('strings.mt.json'), tbl));
}

(async () => {
  if (cmd === 'apply') await apply();
  else if (cmd === 'prepare' || cmd === 'plan') prepare();
  else if (cmd === 'restore') restore();
  else if (cmd === 'recover') recover();
  else if (cmd === 'status') status();
  else if (cmd === 'doctor') doctor();
  else if (cmd === 'strings') strings();
  else if (cmd === 'prune') prune();
  else if (cmd === 'translate') await translate();
  else if (cmd === 'translate-strings') await translateStrings();
  else throw new Error('用法: node src/cli.js <prepare|apply|restore|recover|status|doctor|strings|translate|translate-strings> [--scope=all|web|nls] [--prepared=report.json]');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
