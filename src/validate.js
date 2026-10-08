const structure = /\{\{[^{}]*\}\}|\{[^{}]*\}|\$\{[^}]*\}|%[sdif]|<\/?[A-Za-z0-9]+(?:\s[^<>]*)?\/?>|\]\([^)]*\)|`+/g;
const signature = s => JSON.stringify((s.match(structure) || []).sort());
function translationProblem(en, zh) {
  if (typeof zh !== 'string' || !zh.trim()) return 'type-or-empty';
  if (signature(en) !== signature(zh)) return 'placeholder-or-markup';
  const urls = s => JSON.stringify((s.match(/https?:\/\/[^\s<>"')]+/g) || []).sort());
  if (urls(en) !== urls(zh)) return 'url';
  return null;
}
module.exports = { translationProblem };
