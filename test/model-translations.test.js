const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core');
const {loadWebData} = require('../web/build');
const {translateModelDescription} = require('../src/model-translations');

test('capability and mode names override old machine drafts on both clients',()=>{
  const desktop = C.loadDict(), web = loadWebData().dictionary;
  for (const name of ['Normal','Agent','Fusion','Ultra','Lite','Data']) {
    assert.equal(desktop.str(name),name);
    assert.equal(desktop.resolveI18n('agentSelect.agentNames.'+name,name),name);
    assert.equal(web[name],name);
  }
});

test('model descriptions translate the explanation while preserving every model name and version',()=>{
  const text = 'Balances cost and intelligence with models like Opus 5.5, GPT-6.1 Sol, Fable 5.1, and GPT-6 Astra';
  const desktop = C.loadDict().str(text), web = loadWebData().dictionary[text];
  assert.equal(desktop,web);
  assert.match(desktop,/兼顾成本与智能水平/);
  for (const model of ['Opus 5.5','GPT-6.1 Sol','Fable 5.1','GPT-6 Astra']) assert.ok(desktop.includes(model));
  assert.match(translateModelDescription('Pairs frontier intelligence with cost-efficient execution to deliver frontier-level results at lower cost'),/更低成本/);
});

test('anchored model explanations preserve future model-list captures and reject unknown prose',()=>{
  const list = 'New-Model 7.2, GPT-8 Sol (Preview), and Claude Next';
  assert.equal(translateModelDescription('Balances cost and intelligence with models like '+list),'使用 '+list+' 等模型，兼顾成本与智能水平。');
  assert.equal(translateModelDescription('Uses models like '+list+'.'),'使用 '+list+' 等模型。');
  for (const unknown of ['My draft: Uses models like Something.','GPT-6.1 Sol','Agent',null,{}])
    assert.equal(translateModelDescription(unknown),undefined);
});
