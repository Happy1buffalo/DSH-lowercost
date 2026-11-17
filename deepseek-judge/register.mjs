// Preload before DSH: one process owns all main/judge reservations, including concurrent judge calls.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { Budget, judgeBody, validateAnswers } from './core.mjs';
import YAML from 'yaml';
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nativeFetch = globalThis.fetch;
const credentialFile = process.env.SIEVE_CREDENTIALS_FILE;
const credential = process.env.DEEPSEEK_API_KEY || (credentialFile
  ? YAML.parse(fs.readFileSync(credentialFile, 'utf8')).refs?.DEEPSEEK_API_KEY : undefined);
if (typeof credential !== 'string' || !credential) throw new Error('DeepSeek credential is unavailable');
// Let DSH's inherited-environment credential provider see the same local key.
process.env.DEEPSEEK_API_KEY = credential;
const ledgerFile = process.env.SIEVE_BUDGET_FILE ?? path.join(project, 'state/deepseek-budget.json');
const lockFile = `${ledgerFile}.lock`;
fs.mkdirSync(path.dirname(ledgerFile), { recursive: true });
if (fs.existsSync(lockFile)) {
  let alive = false;
  try { process.kill(Number(fs.readFileSync(lockFile, 'utf8')), 0); alive = true; } catch {}
  if (alive) throw new Error('This API ledger is already owned by another running process');
  fs.unlinkSync(lockFile);
}
fs.writeFileSync(lockFile, String(process.pid), { flag: 'wx' });
process.on('exit', () => { try { if (fs.readFileSync(lockFile, 'utf8') === String(process.pid)) fs.unlinkSync(lockFile); } catch {} });
const ledger = new Budget(ledgerFile, Number(process.env.SIEVE_BUDGET_CNY ?? 2));
const token = randomBytes(32).toString('hex');
const tag = process.env.SIEVE_RUN_TAG ?? 'interactive';
export const budget = ledger;
async function paid(body, role, init = {}) {
  if (body.model !== 'deepseek-flash' || body.thinking?.type !== 'disabled' || body.max_tokens > 4096) throw new Error('DeepSeek model/output guard failed');
  const row = ledger.reserve(role, body, tag);
  const protocol = role === 'main' ? 'messages' : 'chat';
  try {
    const response = await nativeFetch(`https://api.deepseek.com/${protocol === 'messages' ? 'anthropic/v1/messages' : 'chat/completions'}`, {
      ...init, method: 'POST', body: JSON.stringify(body),
      headers: role === 'main' ? init.headers : { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.any([...(init.signal ? [init.signal] : []), AbortSignal.timeout(role === 'judge' ? 25000 : 60000)]),
    });
    row.httpStatus = response.status; row.status = response.ok ? 'response' : 'http-error'; ledger.save();
    if (role === 'judge' || !body.stream) {
      const raw = await response.text();
      try { const data = JSON.parse(raw); if (data.usage) ledger.settle(row, data.usage, protocol); } catch {}
      return { response: new Response(raw, { status: response.status, headers: response.headers }), row };
    }
    let pending = '', usage = {}; const decoder = new TextDecoder();
    const stream = response.body.pipeThrough(new TransformStream({ transform(chunk, controller) {
      pending += decoder.decode(chunk, { stream: true }); const lines = pending.split('\n'); pending = lines.pop();
      for (const line of lines) if (line.startsWith('data:')) try {
        const event = JSON.parse(line.slice(5));
        const value = event.message?.usage ?? event.usage;
        if (value) usage = { ...usage, ...value };
        if (event.type === 'message_delta' && event.delta?.stop_reason || event.type === 'message_stop') ledger.settle(row, usage, protocol);
      } catch {}
      controller.enqueue(chunk);
    } }));
    return { response: new Response(stream, { status: response.status, headers: response.headers }), row };
  } catch (error) { row.status = 'transport-error'; ledger.save(); throw error; }
}
const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/systemone' || req.headers.authorization !== `Bearer ${token}`) { res.writeHead(403).end(); return; }
  const controller = new AbortController(); res.on('close', () => { if (!res.writableEnded) controller.abort(); });
  let row;
  try {
    let text = ''; for await (const chunk of req) { text += chunk; if (Buffer.byteLength(text) > 2_000_000) throw new Error('Judge request too large'); }
    const request = JSON.parse(text), body = judgeBody(request);
    const result = await paid(body, 'judge', { signal: controller.signal }); row = result.row;
    row.questionIds = Object.keys(request.questions); row.questionTypes = Object.values(request.questions).map(q => q.type);
    if (!result.response.ok) throw new Error('DeepSeek judge API error');
    const response = await result.response.json();
    row.answerJson = response.choices?.[0]?.message?.content;
    ledger.save();
    const answers = validateAnswers(request.questions, JSON.parse(response.choices?.[0]?.message?.content));
    row.validJudgeAnswer = true; row.questionTypes = Object.values(request.questions).map(q => q.type); ledger.save();
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ model: response.model,
      answers, usage: { input_tokens: response.usage.prompt_tokens, output_tokens: response.usage.completion_tokens } }));
  } catch { if (row) { row.validJudgeAnswer = false; ledger.save(); } if (!res.destroyed) res.writeHead(502, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { message: 'DeepSeek judge unavailable; keep original context. See local usage ledger.' } })); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
server.unref();
const endpoint = `http://127.0.0.1:${server.address().port}/systemone`;
process.env.SIEVE_JUDGE_URL = endpoint; process.env.SIEVE_JUDGE_KEY = token;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const method = (init?.method ?? input?.method ?? 'GET').toUpperCase();
  if (url.href === endpoint) return nativeFetch(input, init);
  if (['GET', 'HEAD'].includes(method)) return nativeFetch(input, init);
  if (url.origin !== 'https://api.deepseek.com' || !url.pathname.endsWith('/messages') || typeof init?.body !== 'string') throw new Error('Unexpected paid route blocked');
  return (await paid(JSON.parse(init.body), 'main', init)).response;
};
