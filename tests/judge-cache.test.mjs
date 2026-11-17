import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.SIEVE_LAB_FEATURES = 'B';
process.env.SIEVE_LAB_CACHE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sieve-judge-cache-')), 'cache.json');
const { Judge } = await import('../packages/dsh-sieve/lib/judge/judge.js');
let calls = 0;
const judge = new Judge({ provider: { id: 'fake-provider:flash', async evaluate() { calls++; return { answers: { needed: { type: 'boolean', probability: .05 } }, usage: { inputTokens: 100, outputTokens: 20 }, modelId: 'flash' }; } } });
const request = { state: { preview: 'old result' }, questions: { needed: { type: 'boolean', instructions: 'Still needed?' } } };
test('successful identical judgments reuse zero paid tokens; changed state invalidates', async () => {
  assert.equal((await judge.evaluate(request)).usage.inputTokens, 100);
  const reused = await judge.evaluate(request); assert.deepEqual(reused.usage, {}); assert.equal(reused.requests, 0); assert.equal(calls, 1);
  await judge.evaluate({ ...request, state: { preview: 'changed result' } }); assert.equal(calls, 2);
});
test('aborted request cannot use cache; invalid cached answers must be revalidated', async () => {
  await assert.rejects(judge.evaluate({ ...request, signal: AbortSignal.abort() }), /aborted/i);
  const cache = JSON.parse(fs.readFileSync(process.env.SIEVE_LAB_CACHE, 'utf8'));
  for (const entry of Object.values(cache)) entry.result.answers.needed.probability = 2;
  fs.writeFileSync(process.env.SIEVE_LAB_CACHE, JSON.stringify(cache));
  assert.equal((await judge.evaluate(request)).answers.needed.probability, .05); assert.equal(calls, 3);
});
