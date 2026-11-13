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
test('prepared plans must cover every target of the selected scope including split assets', () => {
  const legacy = require('../src/install').FILES;
  const targets = ['out/vs/workbench/devin-webapp-host/assets/settings.js'];
  const baseline = {files:[...legacy,...targets],host:{targets}};
  const report = {schema:3,identity:'build',toolVersion:'1.0.18',scope:'all',hostCompatibility:{compatible:true},files:baseline.files.map(relative=>({relative}))};
  const validate = value => assertPreparedCompatibility(value,'build','1.0.18',baseline);
  assert.doesNotThrow(()=>validate(report));
  assert.throws(()=>validate({...report,files:report.files.slice(0,4)}),/完整覆盖/);
  assert.throws(()=>validate({...report,files:[...report.files.slice(0,4),report.files[0]]}),/完整覆盖/);
  assert.throws(()=>validate({...report,hostCompatibility:undefined}),/独立界面兼容性/);
  assert.doesNotThrow(()=>validate({...report,scope:'nls',hostCompatibility:undefined,files:legacy.slice(2).map(relative=>({relative}))}));
  assert.doesNotThrow(()=>validate({...report,scope:'web',files:[...legacy.slice(0,2),...targets].map(relative=>({relative}))}));
});

test('checksum-preserving builds can restore old patches but reject replacements for checked files',()=>{
  const legacy=require('../src/install').FILES;
  const target='out/vs/workbench/devin-webapp-host/assets/settings.js';
  const files=[...legacy,target];
  const baseline={files,host:{targets:[target],preserveChecksums:true},product:{checksums:{[legacy[0].slice(4)]:'official'}},
    manifest:{files:Object.fromEntries(files.map(file=>[file,'original']))}};
  const report={schema:3,identity:'build',toolVersion:'1.0.19',scope:'all',hostCompatibility:{compatible:true},
    files:files.map(relative=>({relative,generatedHash:legacy.slice(0,2).includes(relative)?'original':'translated'}))};
  const validate=()=>assertPreparedCompatibility(report,'build','1.0.19',baseline);
  assert.doesNotThrow(validate);
  report.files[0].generatedHash='translated';
  assert.throws(validate,/完整性校验/);
  report.files[0].generatedHash='original';
  baseline.product.checksums[target.slice(4)]='official';
  assert.throws(validate,/完整性校验/);
});
