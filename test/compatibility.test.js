const test = require('node:test');
const assert = require('node:assert/strict');
const { webCompatibility, assertWebCompatibility, assertPreparedCompatibility } = require('../src/compatibility');
const supported = () => ({
  blocks:[{en:true,namespace:'translation'},{en:true,namespace:'review'}],
  ui:[{value:'Settings'}],stats:{renderCalls:1}
});
test('known language and render structures pass while unknown versions fail closed', () => {
  assert.equal(webCompatibility(supported()).compatible, true);
  for (const analysis of [
    {...supported(),blocks:[]},
    {...supported(),blocks:[{en:true,namespace:'translation'}]},
    {...supported(),ui:[]},
    {...supported(),stats:{renderCalls:0}},
  ]) assert.throws(() => assertWebCompatibility(analysis), /尚未适配/);
});
test('prepared patches cannot cross installation versions or tool versions', () => {
  const report = {schema:3,identity:'new-build',toolVersion:'0.3.0'};
  assert.doesNotThrow(() => assertPreparedCompatibility(report,'new-build','0.3.0'));
  assert.throws(() => assertPreparedCompatibility(report,'another-build','0.3.0'), /重新 prepare/);
  assert.throws(() => assertPreparedCompatibility(report,'new-build','0.4.0'), /重新 prepare/);
  assert.throws(() => assertPreparedCompatibility({...report,schema:2},'new-build','0.3.0'), /重新 prepare/);
});
