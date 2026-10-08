const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {buildUserscript, loadWebData} = require('../web/build');
const {buildFixture} = require('../web/fixture');
const C = require('../src/core');

test('browser userscript shares reviewed Desktop/navigation translations and preserves upstream metadata identity',()=>{
  const {dictionary} = loadWebData();
  const built = buildUserscript();
  for (const text of ['Wiki','New session','Cloud settings','Session info','Local Settings','Agent computer use','Require session access for PR comments','Add exclusion','Spanish','Create profile']) {
    assert.equal(dictionary[text], C.loadDict().str(text));
  }
  assert.match(built.source,/\/\/ @name\s+Devin 网页端汉化/);
  assert.match(built.source,/\/\/ @namespace\s+https:\/\/github.com\/KawaYiLab\/Devin-Web-Chinese/);
  assert.match(built.source,/\/\/ @grant\s+none/);
  assert.match(built.source,/\/\/ @downloadURL\s+none/);
  assert.doesNotMatch(built.source,/\/\/ @match\s+https:\/\/\*\./);
  assert.doesNotMatch(built.source,/GM_xmlhttpRequest|fetch\(|innerHTML\s*=/);
  assert.doesNotThrow(()=>new vm.Script(built.source));
});
test('production script refuses unrelated sites before accessing document or APIs',()=>{
  const {source} = buildUserscript();
  for (const location of [{protocol:'https:',hostname:'api.devin.ai'},{protocol:'http:',hostname:'app.devin.ai'},{protocol:'https:',hostname:'evil.example'}]) {
    assert.doesNotThrow(()=>vm.runInNewContext(source,{location},{timeout:1000}));
  }
});
test('reviewed settings descriptions preserve providers, model names and retention number',()=>{
  const {dictionary} = loadWebData();
  for (const provider of ['Anthropic','OpenAI']) {
    const text = provider+' stores this data for up to 30 days and does not use it for model training or improvement.';
    assert.match(dictionary[text],/30/); assert.ok(dictionary[text].includes(provider));
  }
  assert.ok(dictionary['Unlocks additional Anthropic models that require data retention for trust and safety verification, such as Claude Fable 5.'].includes('Claude Fable 5'));
});
test('browser fixture contains the actual runtime and parses without extra dependencies',()=>{
  const html = buildFixture();
  const script = html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'));
  assert.doesNotThrow(()=>new vm.Script(script));
  assert.match(script,/mountDevinZh\(window,dictionary,rules\)/);
  assert.match(script,/动态 aria-label/);
});
