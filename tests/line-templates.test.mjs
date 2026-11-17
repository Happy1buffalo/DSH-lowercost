import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SIEVE_LAB_FEATURES='G';
const {factorLines,restoreLines,templateProse}=await import('../packages/dsh-sieve/lib/features/line-templates.js');
test('templates reconstruct every line, numeric identifier, negative condition and Unicode exactly',()=>{
  const lines=Array.from({length:80},(_,i)=>`客户🙂 ${i}: limit=${i*7}; transaction=TX-${i}; path=C:/任务/${i}.txt. ${'Shared words are exact, including never accept equality. '.repeat(3)}`);
  lines.splice(41,0,'Do not drop: threshold <= 0; CONTRACT: latest value is 882.');
  const factored=factorLines(lines);
  assert.ok(factored);
  assert.deepEqual(restoreLines(factored),lines);
  assert.ok(JSON.stringify(factored).length<lines.join('\n').length*.6);
  assert.equal(restoreLines({...factored,plain:[]}).length,0);
});
test('distinct prose and unprofitable templates remain unchanged',()=>{
  assert.equal(factorLines(['short','a separate statement']),undefined);
  const lines=Array.from({length:9},(_,i)=>`${'s'.repeat(10)}${i}${'z'.repeat(85)}`);
  const result=factorLines(lines);
  if(result)assert.deepEqual(restoreLines(result),lines);
  assert.equal(templateProse('read',{file_path:'x.js'},'arbitrary source'),undefined);
});
test('many diverse heldout values survive serialization and exact restoration',()=>{
  let state=92831;
  const rand=()=>{state=(state*1664525+1013904223)>>>0;return state.toString(16)};
  for(let round=0;round<20;round++){
    const shared='Repeated literal suffix: '+rand()+' | '+('retain bytes '.repeat(10));
    const lines=Array.from({length:15+round},()=>`${rand()}\t"${rand()}"\\path\r${shared}`);
    lines.splice(round%lines.length,0,`Independent critical fact ${rand()}`);
    const result=factorLines(lines);
    assert.ok(result);
    assert.deepEqual(restoreLines(JSON.parse(JSON.stringify(result))),lines);
  }
});
