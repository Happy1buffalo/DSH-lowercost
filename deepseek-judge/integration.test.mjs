import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'sieve-bridge-test-'));
process.env.SIEVE_BUDGET_FILE = path.join(folder, 'ledger.json');
process.env.SIEVE_BUDGET_CNY = '1';
process.env.DEEPSEEK_API_KEY = 'unit-test-placeholder-never-sent-to-network';
let mode = 'valid';
const actualFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  if (!String(input).startsWith('https://api.deepseek.com/')) return actualFetch(input, init);
  if (mode === 'timeout') return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  if (mode === 'http-error') return new Response('{"error":"mock failure"}', { status: 503 });
  if (String(input).endsWith('/messages')) return new Response([
    'data: ' + JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 100, cache_read_input_tokens: 300, output_tokens: 0 } } }),
    'data: ' + JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 20 } }),
    'data: ' + JSON.stringify({ type: 'message_stop' }), '',
  ].join('\n'), { headers: { 'Content-Type': 'text/event-stream' } });
  return Response.json({ model: 'deepseek-flash', choices: [{ message: { content: JSON.stringify({ answers: { a: { noul: mode === 'invalid' ? 5 : .05 } } }) } }], usage: { prompt_tokens: 400, prompt_cache_hit_tokens: 300, completion_tokens: 20 } });
};
const { budget } = await import('./register.mjs');
const request = signal => fetch(process.env.SIEVE_JUDGE_URL, { method: 'POST', headers: { Authorization: `Bearer ${process.env.SIEVE_JUDGE_KEY}` }, body: JSON.stringify({ state: { evidence: 'routine' }, questions: { a: { type: 'noul', instructions: 'Needed?' } } }), signal });
test('authenticated bridge forwards typed answer and disjoint cache usage', async () => {
  const rejected = await fetch(process.env.SIEVE_JUDGE_URL, { method: 'POST', body: '{}' }); assert.equal(rejected.status, 403);
  const response = await request(); assert.equal(response.status, 200); assert.equal((await response.json()).answers.a.noul, .05);
  assert.equal(budget.data.requests.at(-1).usage.inputTokens, 400);
  assert.equal(budget.data.requests.at(-1).validJudgeAnswer, true);
});
test('paid invalid JSON semantics and HTTP failure never become verdicts', async () => {
  mode = 'invalid'; assert.equal((await request()).status, 502); assert.equal(budget.data.requests.at(-1).validJudgeAnswer, false);
  assert.ok(budget.data.requests.at(-1).accountedCny > 0);
  mode = 'http-error'; assert.equal((await request()).status, 502);
  assert.equal(budget.data.requests.at(-1).accountedCny, budget.data.requests.at(-1).reservedCny);
});
test('client timeout aborts upstream; unknown usage keeps reservation', async () => {
  mode = 'timeout'; await assert.rejects(request(AbortSignal.timeout(40)));
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(budget.data.requests.at(-1).status, 'transport-error');
  assert.equal(budget.data.requests.at(-1).accountedCny, budget.data.requests.at(-1).reservedCny);
});
test('main SSE waits for final usage and blocks unapproved paid routes', async () => {
  mode = 'valid';
  const response = await fetch('https://api.deepseek.com/anthropic/v1/messages', { method: 'POST', body: JSON.stringify({ model: 'deepseek-flash', thinking: { type: 'disabled' }, max_tokens: 200, stream: true }) });
  assert.equal(budget.data.requests.at(-1).status, 'response');
  await response.text();
  assert.deepEqual(budget.data.requests.at(-1).usage, { inputTokens: 400, cacheReadTokens: 300, uncachedInputTokens: 100, outputTokens: 20 });
  await assert.rejects(fetch('https://invalid.example/paid', { method: 'POST' }));
  budget.data.capCny = 0; await assert.rejects(fetch('https://api.deepseek.com/anthropic/v1/messages', { method: 'POST', body: JSON.stringify({ model: 'deepseek-flash', thinking: { type: 'disabled' }, max_tokens: 200 }) }));
});
