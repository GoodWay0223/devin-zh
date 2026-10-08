// 判断一个 i18n 资源块是不是英文 (文件里还带有 es/pt/ja 等其它语言的资源;
// 西/葡语里没有重音字母的词条用 isEnglish() 会被误判成英文, 所以按整块的常用词比例判断)
const ENG_W = /\b(the|to|your|and|of|is|you|this|with|for|or|in|on|are|be|can|will|not|from)\b/gi;
const OTH_W = /\b(el|la|los|las|de|del|para|que|con|por|una|um|uma|nao|voce|sua|seu|em|os|se|sin|su|ou|nenhum|nenhuma|como|mas|esta|este|isso|pode)\b/gi;

module.exports = function isEnglishBlock(texts) {
  const text = texts.join(' ');
  if ((text.match(/[^\x00-\x7f]/g) || []).length > text.length * 0.02) return false; // 日文等
  const e = (text.match(ENG_W) || []).length, o = (text.match(OTH_W) || []).length;
  return (e >= 3 && e / (e + o) > 0.85) || (e + o === 0 && text.length > 0);
};
