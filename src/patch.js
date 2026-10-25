const C = require('./core');
const { translationProblem } = require('./validate');
function patchSource(source, dictionary = C.loadDict(), displayDictionary = C.readJson(C.dataFile('display.zh.json')), { requireCompatibility = false, analyze = C.analyze } = {}) {
  const analysis = analyze(source);
  const compatibility = requireCompatibility ? require('./compatibility').assertWebCompatibility(analysis) : null;
  const replacements = [];
  const stats = { i18n: 0, blocks: 0, ui: 0, display: 0, rejected: 0, candidates: analysis.ui.length, resourceBlocks: analysis.blocks.filter(x => x.en).length };
  const rejections = [];
  for (const block of analysis.blocks) {
    if (!block.en) continue;
    const [obj, count] = C.mapLeaves(block.obj, (key, en) => {
      const english = C.isEnglish(en);
      // Reviewed exact entries may contain typography outside the default ASCII guard.
      const reviewed = !english && dictionary.human && Object.hasOwn(dictionary.human, en) && typeof dictionary.human[en] === 'string';
      if (!english && !reviewed) return;
      const zh = reviewed ? dictionary.human[en] : dictionary.resolveI18n(key, en);
      if (zh === undefined || zh === en) return;
      const problem = translationProblem(en, zh);
      if (problem) { stats.rejected++; rejections.push({ kind: 'i18n', key, problem }); return; }
      return zh;
    });
    if (count) {
      stats.i18n += count; stats.blocks++;
      // Replace only the literal argument of JSON.parse, preserving the call and code around it.
      replacements.push({ index: block.literalIndex, len: block.literalLength, value: JSON.stringify(JSON.stringify(obj)) });
    }
  }
  for (const node of analysis.ui) {
    if (analysis.blocks.some(b => node.index >= b.index && node.index < b.index + b.len)) continue;
    const zh = dictionary.str(node.value);
    if (zh === undefined || zh === node.value) continue;
    const problem = translationProblem(node.value, zh);
    if (problem) { stats.rejected++; rejections.push({ kind: 'ui', property: node.property, text: node.value, problem }); continue; }
    replacements.push({ index: node.index, len: node.len, value: JSON.stringify(zh) });
    stats.ui++;
  }
  for (const node of analysis.display) {
    // Capability/model labels are product identifiers, including unknown future names.
    // Preserve the complete displayed name rather than translating any portion of it.
    if (node.kind === 'capabilityName') continue;
    const models = require('./model-translations');
    const table = node.kind === 'capabilityDescription' ? models.descriptions
      : node.kind === 'settings' ? displayDictionary.settings || C.readJson(C.dataFile('settings-display.zh.json'))
      : node.kind === 'mode' ? { ...displayDictionary.mode, ...models.names, Agent: 'Agent', Normal: 'Normal' }
      : displayDictionary[node.kind] || {};
    const entries = Object.entries(table).filter(([en, zh]) => typeof zh === 'string' && en !== zh && !translationProblem(en, zh));
    const rules = node.kind === 'capabilityDescription' ? models.rules.map(rule => [rule.pattern.source, rule.pattern.flags, rule.replacement]) : [];
    if (!entries.length && !rules.length) continue;
    const expression = source.slice(node.index, node.index + node.len);
    // Translate only the displayed value. Evaluate it once, preserve unknown values,
    // and avoid prototype lookups or changing the source navigation/action object.
    const ruleCode = rules.length ? `for(const [__devinZhPattern,__devinZhFlags,__devinZhReplacement] of ${JSON.stringify(rules)}){const __devinZhRegex=new RegExp(__devinZhPattern,__devinZhFlags);if(__devinZhRegex.test(__devinZhText))return __devinZhText.replace(__devinZhRegex,__devinZhReplacement);}` : '';
    const value = (node.prefix || '') + `(__devinZhText=>{if(typeof __devinZhText!=="string")return __devinZhText;const __devinZhMatch=${JSON.stringify(entries)}.find(__devinZhEntry=>__devinZhEntry[0]===__devinZhText);if(__devinZhMatch)return __devinZhMatch[1];${ruleCode}return __devinZhText;})(${expression})`;
    replacements.push({ index: node.index, len: node.len, value });
    stats.display++;
  }
  replacements.sort((a, b) => a.index - b.index);
  for (let i = 1; i < replacements.length; i++) {
    if (replacements[i - 1].index + replacements[i - 1].len > replacements[i].index) throw new Error('汉化范围重叠，未生成文件');
  }
  let output = '', cursor = 0;
  for (const item of replacements) {
    output += source.slice(cursor, item.index) + item.value;
    cursor = item.index + item.len;
  }
  output += source.slice(cursor);
  const syntax = C.checkSyntax(output);
  if (syntax) throw new Error('生成文件语法不正确: ' + syntax);
  // Independently parse the generated module and verify every resource remains valid JSON.
  const checked = analyze(output);
  if (checked.blocks.length !== analysis.blocks.length) throw new Error('汉化改变了 JSON 资源数量');
  return { source: output, stats, rejections, compatibility };
}
module.exports = { patchSource };
