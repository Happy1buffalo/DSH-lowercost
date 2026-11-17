import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const provenance=JSON.parse(fs.readFileSync(path.join(root,'provenance.json'),'utf8'));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
let checked=0;
const lfHashes={...provenance.sourceLfSha256,...provenance.evaluatedBuildLfSha256};
for(const [file,expected] of Object.entries({...provenance.sourceSha256,...provenance.evaluatedBuildSha256})){
  const target=path.join(root,file);
  if(!fs.existsSync(target))throw Error(`Missing ${file}; run pnpm build first.`);
  const bytes=fs.readFileSync(target);
  if(sha(bytes)!==expected&&sha(bytes.toString('utf8').replaceAll('\r\n','\n'))!==lfHashes[file])throw Error(`Snapshot mismatch: ${file}`);
  checked++;
}
console.log(`ABCDG snapshot verified: ${checked} source, rules and evaluated build files match (CRLF/LF conversion allowed).`);
