/** Optional local prose compression. Originals are archived by the admission caller. */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { factIndex, labEvent, labOn } from './lab.ts'

export interface ProseRead { path: string, text: string, numbered: string[] }
export function proseRead(tool: string, args: Record<string, unknown>, original: string): ProseRead | undefined {
  if (tool !== 'read' || typeof args['file_path'] !== 'string' || !/\.txt$/i.test(args['file_path'])
    || /(?:^|[\\/])(?:agents|skill|instructions|credentials|passwords|secrets)[^\\/]*$/i.test(args['file_path'])
    || Object.keys(args).some(key => key !== 'file_path') || original.length < 8000 || original.length > 45000
    || /api[_ -]?key|authorization\s*:|password\s*[:=]|bearer\s+[a-z0-9]/i.test(original)) return undefined
  const match = /^<path>([^\n]+)<\/path>\n<type>file<\/type>\n<content>\n([\s\S]*)\n\n\(End of file - total (\d+) lines\)\n<\/content>$/.exec(original)
  if (match === null || resolve(match[1] ?? '') !== resolve(args['file_path'])) return undefined
  const numbered = (match[2] ?? '').split('\n')
  if (numbered.length !== Number(match[3]) || numbered.some((line, i) => !line.startsWith(`${i + 1}: `))) return undefined
  return { path: args['file_path'], text: numbered.map((line, i) => line.slice(`${i + 1}: `.length)).join('\n'), numbered }
}

/** Exact labels plus explicit obligations and numeric comparisons; never claim arbitrary facts are protected. */
export function protectedSource(read: ProseRead): string | undefined {
  const indexed = factIndex(read.text, 0)
  const lines = read.numbered.filter((line, i) => {
    const raw = line.slice(`${i + 1}: `.length)
    return indexed.includes(raw) || /\b(?:must|never|shall|required|threshold|maximum|minimum|deadline)\b|(?:<=|>=|[<>])\s*-?\d|必须|不得|禁止|至少|至多|不能/.test(raw)
  })
  // Protect all selected lines, or skip compression entirely if they are too large.
  if (lines.length > 24 || lines.join('\n').length > 6000) return undefined
  return lines.length === 0 ? '' : `[sieve: exact protected source lines]\n${lines.join('\n')}\n`
}

export async function localProse(tool: string, args: Record<string, unknown>, original: string, signal: AbortSignal): Promise<string | undefined> {
  if (!labOn('F') || signal.aborted) return undefined
  const read = proseRead(tool, args, original)
  if (read === undefined) return undefined
  const exact = protectedSource(read)
  const python = process.env['SIEVE_LOCAL_PYTHON']
  if (exact === undefined || python === undefined) return undefined
  const worker = fileURLToPath(new URL('../../../../scripts/compress-prose.py', import.meta.url))
  const started = Date.now()
  try {
    const answer = await new Promise<string>((resolve, reject) => {
      const child = spawn(python, [worker], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], signal,
        env: { ...process.env, HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1', TOKENIZERS_PARALLELISM: 'false' } })
      let output = '', errors = 0
      const timer = setTimeout(() => { child.kill(); reject(new Error('Local compression timeout')) }, 22000)
      child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString('utf8'); if (output.length > 200000) child.kill() })
      child.stderr.on('data', (chunk: Buffer) => { errors += chunk.length; if (errors > 1000000) child.kill() })
      child.on('error', error => { clearTimeout(timer); reject(error) })
      child.on('close', code => { clearTimeout(timer); if (code === 0) resolve(output); else reject(new Error('Local worker failed')) })
      child.stdin.on('error', () => {})
      child.stdin.end(JSON.stringify({ text: read.text, rate: .5 }))
    })
    const parsed: unknown = JSON.parse(answer)
    if (signal.aborted || typeof parsed !== 'object' || parsed === null || !('text' in parsed) || typeof parsed.text !== 'string'
      || parsed.text.length < 100 || parsed.text.length >= read.text.length) return undefined
    const body = `<path>${read.path}</path>\n[sieve: local prose compression; wording and line order may change; use the full-output reference for exact quotes or edits]\n${exact}[sieve: compressed prose]\n${parsed.text}\n`
    if (body.length + 500 >= original.length || body.length > original.length * .8) return undefined
    labEvent('F.local-prose', { originalChars: original.length, compressedChars: body.length, protectedLines: exact.split('\n').length - 1, localMs: Date.now() - started })
    return body
  } catch {
    labEvent('F.local-fallback', { localMs: Date.now() - started })
    return undefined
  }
}
