// 维护工具: 导出某些命名空间下"尚未翻译"的 i18n 条目, 供人工翻译
// 用法: node src/dump.js sidebar inputBox ...   (输出嵌套 JSON, 把值改成中文后存到 data/i18n/<名字>.json)
const C = require('./core');
const D = C.loadDict();
const want = new Set(process.argv.slice(2));
const { src } = C.original(C.TARGETS[0]);
const out = {}, seen = new Set();
for (const b of C.scanBlocks(src)) {
  for (const [p, v] of C.leaves(b.obj)) {
    const ns = p.split('.')[0];
    if (!want.has(ns) || !C.isEnglish(v) || D.resolveI18n(p, v) !== undefined || seen.has(p)) continue;
    seen.add(p);
    let o = out; const ks = p.split('.');
    ks.slice(0, -1).forEach(k => (o = o[k] ||= {}));
    o[ks[ks.length - 1]] = v;
  }
}
console.log(JSON.stringify(out, null, 0));
