// Fail closed before preparing installable Web patches for an unsupported build.
function webCompatibility(analysis) {
  const namespaces = [...new Set(analysis.blocks.filter(b => b.en).map(b => b.namespace))];
  const reasons = [];
  if (!namespaces.includes('translation')) reasons.push('未识别英文 translation 语言资源');
  if (!namespaces.includes('review')) reasons.push('未识别英文 review 语言资源');
  if (!analysis.stats.renderCalls || !analysis.ui.length) reasons.push('未识别可信的 React 界面文本');
  return { compatible: reasons.length === 0, reasons, namespaces, stats: analysis.stats };
}
function assertWebCompatibility(analysis) {
  const result = webCompatibility(analysis);
  if (!result.compatible) throw new Error('当前 Devin 界面结构尚未适配，未生成可安装补丁：' + result.reasons.join('；'));
  return result;
}
function assertPreparedCompatibility(report, identity, toolVersion) {
  if (report.schema !== 3 || report.toolVersion !== toolVersion || report.identity !== identity) {
    throw new Error('准备报告与当前安装版本或汉化工具版本不一致，请重新 prepare');
  }
}
module.exports = { webCompatibility, assertWebCompatibility, assertPreparedCompatibility };
