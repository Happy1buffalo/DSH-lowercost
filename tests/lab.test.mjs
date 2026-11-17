import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { learn } from '../scripts/learn-preservation.mjs';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sieve-lab-'));
process.env.SIEVE_LAB_FEATURES = 'A,B,C,D';
process.env.SIEVE_LAB_CACHE = path.join(dir, 'cache.json');
process.env.SIEVE_LAB_RULES = path.join(dir, 'rules.json');
fs.writeFileSync(process.env.SIEVE_LAB_RULES, JSON.stringify(learn([{ original: 'Transaction ID: DEV-1', compressed: '', required: 'Transaction ID: DEV-1' }])));
const lab = await import('../packages/dsh-sieve/lib/features/lab.js');
test('A preserves every search path, match text, number and negative condition', () => {
  const rows = Array.from({ length: 40 }, (_, i) => JSON.stringify({ type: 'match', data: { path: { text: `src/file ${i}.mjs` }, lines: { text: `if (n !== ${i}) throw new Error('failure-${i}')\n` }, line_number: i + 1, absolute_offset: 100, submatches: [{ match: { text: 'throw' }, start: 20, end: 25 }] } }));
  const original = rows.join('\n'), result = lab.structuredOutput('pwsh: rg --json throw src', original);
  assert.ok(result.length < original.length);
  for (let i = 0; i < 40; i++) { assert.ok(result.includes(`src/file ${i}.mjs`)); assert.ok(result.includes(`n !== ${i}`)); assert.ok(result.includes(`failure-${i}`)); }
  assert.equal(lab.structuredOutput('pwsh: rg --json x', '{"type":"unknown","data":{}}'), '{"type":"unknown","data":{}}');
  assert.equal(lab.structuredOutput('pwsh: cat source.mjs', original), original);
});
test('A status grouping preserves renamed, quoted and spaced paths', () => {
  const original = Array.from({ length: 50 }, (_, i) => ` M ${'nested/'.repeat(5)}file ${i}.js`).join('\n') + '\nR  old.js -> new.js';
  const out = lab.structuredOutput('pwsh: git status --porcelain', original);
  // Grouping is used only if it actually saves enough bytes.
  for (let i = 0; i < 50; i++) assert.ok(out.includes(`file ${i}.js`));
  assert.ok(out.includes('old.js -> new.js'));
});
test('B unknown or changed domain rejudges; price gate rejects expensive cache rebuilds', () => {
  assert.equal(lab.skillScope('修复 src/calc.mjs 并运行 npm test'), 'code');
  for (const words of ['旅游规划', 'write a SQL database query', '请处理另一个事项']) assert.equal(lab.skillScope(words), null);
  assert.equal(lab.worthForgetting(10000, 100000), false);
  assert.equal(lab.worthForgetting(99000, 100000), true);
});
test('C extracts exact middle facts, limits index, excludes secrets', () => {
  const text = 'a'.repeat(400) + '\nCONTRACT: reject n <= 17; limit=42\nAuthorization: Bearer should-not-appear\n' + 'z'.repeat(400);
  const index = lab.factIndex(text, 300);
  assert.ok(index.includes('CONTRACT: reject n <= 17; limit=42'));
  assert.ok(!index.includes('should-not-appear'));
});
test('D learns field kinds from development, preserves previously unseen values', () => {
  const rules = learn([{ original: 'Transaction ID: DEV-1', compressed: '', required: 'Transaction ID: DEV-1' }]);
  assert.deepEqual(rules.prefixes, ['Transaction ID:']);
  assert.ok(!JSON.stringify(rules).includes('DEV-1'));
  assert.equal(lab.labProtected('Transaction ID: HOLDOUT-993'), true);
  assert.ok(lab.factIndex('a'.repeat(400) + '\nTransaction ID: HOLDOUT-993\n' + 'b'.repeat(400), 300).includes('HOLDOUT-993'));
  assert.throws(() => learn([{ original: 'abc', compressed: '', required: 'invented fact' }]));
});
test('B exact cache includes state, criteria and model identity', () => {
  const key = lab.cacheKey('loopback:flash', { output: 'one' }, { q: 'keep?' });
  lab.saveJudgment(key, { answers: { q: { noul: .05 } } });
  assert.equal(lab.readJudgment(key).answers.q.noul, .05);
  for (const other of [lab.cacheKey('loopback:flash', { output: 'two' }, { q: 'keep?' }), lab.cacheKey('loopback:flash', { output: 'one' }, { q: 'drop?' }), lab.cacheKey('loopback:other', { output: 'one' }, { q: 'keep?' })]) assert.equal(lab.readJudgment(other), undefined);
});
