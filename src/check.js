// 校验译文: 占位符/标签必须与原文一致; 可疑译文 (含大量英文残留 / 过长) 列出来人工检查
const C = require('./core');
const KEEP = /\{\{[^}]*\}\}|\{[^{}]*\}|<\/?[A-Za-z0-9]+(?:\s[^<>]*)?\/?>|%[sdif]|\$\{[^}]*\}/g;
const sig = s => (s.match(KEEP) || []).sort().join('|');
const tables = [['i18n.mt', C.readJson(C.dataFile('i18n.mt.json'))], ['i18n.zh', C.readJson(C.dataFile('i18n.zh.json'))]];
let bad = 0, total = 0;
for (const [name, t] of tables) for (const [p, o] of Object.entries(t)) for (const [en, zh] of Object.entries(o)) {
  total++;
  if (sig(en) !== sig(zh)) { bad++; if (bad <= 30) console.log('占位符不一致', name, p, '\n  ', en, '\n  ', zh); }
}
for (const [en, zh] of Object.entries(C.readJson(C.dataFile('strings.mt.json')))) {
  total++; if (sig(en) !== sig(zh)) { bad++; console.log('占位符不一致(strings)', en, '=>', zh); }
}
console.log('检查', total, '条, 不一致', bad);
