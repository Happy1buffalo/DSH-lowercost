import fs from 'node:fs';
import { createHash } from 'node:crypto';
export function learn(cases) {
  const prefixes = new Set();
  for (const row of cases) {
    if (!['original', 'compressed', 'required'].every(key => typeof row[key] === 'string')) throw new Error('Invalid feedback row');
    if (!row.original.includes(row.required)) throw new Error('Required fact is not in the source');
    if (row.compressed.includes(row.required)) continue;
    const prefix = /^([^\d:\r\n]{3,40}:)/.exec(row.required)?.[1];
    if (!prefix || /api.?key|password|secret|authorization/i.test(prefix)) throw new Error('Feedback needs a safe field label');
    prefixes.add(prefix);
  }
  return { version: 1, prefixes: [...prefixes].sort(), developmentDigest: createHash('sha256').update(JSON.stringify(cases)).digest('hex') };
}
if (process.argv[2]) {
  const learned = learn(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')));
  if (!process.argv[3]) throw new Error('Output file required');
  fs.writeFileSync(process.argv[3], JSON.stringify(learned, null, 2));
  console.log(JSON.stringify({ prefixes: learned.prefixes, developmentExamples: 2 }));
}
