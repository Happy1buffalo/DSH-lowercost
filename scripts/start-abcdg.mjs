import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node scripts/start.mjs [--dsh-cli /path/to/dsh/bin.js] headless "question"\n       node scripts/start.mjs [--dsh-cli /path/to/dsh/bin.js] web\nDSH_CLI can replace --dsh-cli. Run from your task workspace. See README.md.');
  process.exit(0);
}
const cliFlag = args.indexOf('--dsh-cli');
const cliValue = cliFlag < 0 ? process.env.DSH_CLI : args[cliFlag + 1];
if (cliFlag >= 0) args.splice(cliFlag, 2);
if (!cliValue || !fs.existsSync(path.resolve(cliValue))) throw new Error('Set DSH_CLI or --dsh-cli to the existing DSH CLI JavaScript file.');
if (!['headless', 'web'].includes(args[0])) throw new Error('Select headless or web; use --help for examples.');
const entry = path.join(root, 'packages/dsh-sieve/lib/index.js');
if (!fs.existsSync(entry)) throw new Error('Build the plugin first: pnpm build');
if (!process.env.DEEPSEEK_API_KEY && !process.env.SIEVE_CREDENTIALS_FILE) throw new Error('Set DEEPSEEK_API_KEY or SIEVE_CREDENTIALS_FILE locally.');
const stateRoot = path.resolve(process.env.SIEVE_STATE_ROOT ?? path.join(root, 'state'));
fs.mkdirSync(stateRoot, { recursive: true });
// DSH validates module names before evaluating !!js config expressions.
const runtimePatch = path.join(stateRoot, 'abcdg.patch.yml');
fs.writeFileSync(runtimePatch, fs.readFileSync(path.join(root, 'config/abcdg.patch.yml'), 'utf8')
  .replace('"__SIEVE_PLUGIN_ENTRY__"', JSON.stringify(entry.replaceAll('\\', '/'))));
const env = {
  ...process.env,
  SIEVE_STATE_ROOT: stateRoot,
  ...(process.env.SIEVE_CREDENTIALS_FILE ? { SIEVE_CREDENTIALS_FILE: path.resolve(process.env.SIEVE_CREDENTIALS_FILE) } : {}),
  SIEVE_PLUGIN_ENTRY: entry,
  SIEVE_LAB_FEATURES: 'A,B,C,D,G',
  SIEVE_LAB_RULES: path.join(root, 'feedback/rules.json'),
  SIEVE_LAB_CACHE: path.resolve(process.env.SIEVE_LAB_CACHE ?? path.join(stateRoot, 'judge-cache.json')),
  SIEVE_LAB_EVENTS: path.resolve(process.env.SIEVE_LAB_EVENTS ?? path.join(stateRoot, 'lab-events.jsonl')),
  SIEVE_BUDGET_FILE: path.resolve(process.env.SIEVE_BUDGET_FILE ?? path.join(stateRoot, 'deepseek-budget.json')),
  SIEVE_BUDGET_CNY: process.env.SIEVE_BUDGET_CNY ?? '2',
};
const [mode, ...rest] = args;
const child = spawn(process.execPath, [
  '--import', pathToFileURL(path.join(root, 'deepseek-judge/register.mjs')).href,
  path.resolve(cliValue), mode, '--patch', runtimePatch, ...rest,
], { cwd: process.cwd(), env, stdio: 'inherit', windowsHide: true });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
