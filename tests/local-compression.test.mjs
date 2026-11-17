import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
process.env.SIEVE_LAB_FEATURES='C,D,F';
process.env.SIEVE_LAB_RULES=fileURLToPath(new URL('../feedback/rules.json',import.meta.url));
const {proseRead,protectedSource,localProse}=await import('../packages/dsh-sieve/lib/features/local-compression.js');
const lines=Array.from({length:90},(_,i)=>`Observation ${i}: ${'archive background '.repeat(10)}`);
lines[41]='Transaction ID: TX-UNSEEN-719302';
lines[44]='The client must never accept attempts >= 7.';
const path='D:/fixture/history.txt',args={file_path:path};
const wrap=(rows=lines,footer=`End of file - total ${rows.length} lines`)=>`<path>${path}</path>\n<type>file</type>\n<content>\n${rows.map((l,i)=>`${i+1}: ${l}`).join('\n')}\n\n(${footer})\n</content>`;
test('local compression accepts only complete long plain-text reads',()=>{
  const original=wrap(),parsed=proseRead('read',args,original);
  assert.equal(parsed.text,lines.join('\n'));
  for(const changed of [{...args,offset:1},{file_path:'D:/fixture/AGENTS.txt'},{file_path:'D:/fixture/source.js'}])assert.equal(proseRead('read',changed,original),undefined);
  assert.equal(proseRead('pwsh',args,original),undefined);
  assert.equal(proseRead('read',args,wrap(lines,'Output capped. Showing lines 1-90.')),undefined);
  assert.equal(proseRead('read',args,original.replace('2: Observation','9: Observation')),undefined);
  assert.equal(proseRead('read',args,original.replace('Observation 0','Authorization: Bearer private')),undefined);
});
test('exact guard retains unseen identifiers and explicit negative thresholds; excessive protected text skips compression',()=>{
  const parsed=proseRead('read',args,wrap()),exact=protectedSource(parsed);
  assert.ok(exact.includes('42: Transaction ID: TX-UNSEEN-719302'));
  assert.ok(exact.includes('45: The client must never accept attempts >= 7.'));
  assert.equal(protectedSource({...parsed,numbered:Array.from({length:30},(_,i)=>`${i+1}: must retain ${i}`)}),undefined);
});
test('disabled runtime or aborted work retains the original',async()=>{
  delete process.env.SIEVE_LOCAL_PYTHON;
  assert.equal(await localProse('read',args,wrap(),new AbortController().signal),undefined);
  process.env.SIEVE_LOCAL_PYTHON='nonexistent-runtime';
  assert.equal(await localProse('read',args,wrap(),AbortSignal.abort()),undefined);
  assert.equal(await localProse('read',args,wrap(),new AbortController().signal),undefined);
});
