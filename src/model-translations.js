'use strict';
const data = require('../data/model-descriptions.zh.json');
const names = Object.fromEntries(data.names.map(name=>[name,name]));
const rules = data.rules.map(rule=>{
  if (!rule.pattern.startsWith('^') || !rule.pattern.endsWith('$') || /[^iu]/.test(rule.flags || ''))
    throw new Error('Model description rules must be anchored and non-stateful');
  return {pattern:new RegExp(rule.pattern,rule.flags),replacement:rule.replacement};
});
// Keep model-list captures byte-for-byte, including names, version numbers and punctuation.
function translateModelDescription(value) {
  if (typeof value !== 'string') return undefined;
  if (Object.hasOwn(data.descriptions,value)) return data.descriptions[value];
  for (const rule of rules) if (rule.pattern.test(value)) return value.replace(rule.pattern,rule.replacement);
  return undefined;
}
module.exports={names,descriptions:data.descriptions,rules,translateModelDescription};
