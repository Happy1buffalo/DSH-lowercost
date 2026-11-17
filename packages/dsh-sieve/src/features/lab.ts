/** Isolated experimental features. No imports from this module exist in B0. */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const enabled = new Set((process.env['SIEVE_LAB_FEATURES'] ?? '').split(',').filter(Boolean))
export const labOn = (id: string): boolean => enabled.has(id)
export function labEvent(event: string, detail: Record<string, unknown> = {}): void {
  const file = process.env['SIEVE_LAB_EVENTS']
  if (file === undefined) return
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.appendFileSync(file, `${JSON.stringify({ time: new Date().toISOString(), event, ...detail })}\n`)
}
interface LearnedRules { version: 1, prefixes: string[] }
let learned: LearnedRules | undefined
export function labPrefixes(): string[] {
  if (!labOn('D')) return []
  if (learned === undefined) {
    const file = process.env['SIEVE_LAB_RULES']
    if (file === undefined) return []
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (typeof parsed !== 'object' || parsed === null || !('prefixes' in parsed) || !Array.isArray(parsed.prefixes)
      || parsed.prefixes.length > 32 || !parsed.prefixes.every(p => typeof p === 'string' && p.length >= 3 && p.length <= 80 && !/[\r\n]/.test(p))) throw new Error('Invalid learned preservation rules')
    learned = { version: 1, prefixes: parsed.prefixes as string[] }
  }
  return learned.prefixes
}
export function labProtected(text: string): boolean {
  const matched = labPrefixes().some(prefix => text.includes(prefix))
  if (matched) labEvent('D.protected')
  return matched
}

/** Preserve every match/name. Only supported machine-readable command formats qualify. */
export function structuredOutput(call: string, original: string): string {
  if (!labOn('A')) return original
  const lines = original.split(/\r?\n/)
  let body = original
  if (/\brg\s+[^\r\n]*--json\b/.test(call)) {
    const out: string[] = []; let matches = 0
    for (const line of lines) {
      if (!line.trim().startsWith('{')) { out.push(line); continue }
      let event: { type?: string, data?: Record<string, unknown> }
      try { event = JSON.parse(line) as typeof event } catch { return original }
      const data = event.data
      if (data === undefined) return original
      if (event.type === 'match' || event.type === 'context') {
        const file = data['path'] as { text?: unknown } | undefined, text = data['lines'] as { text?: unknown } | undefined
        if (typeof file?.text !== 'string' || typeof text?.text !== 'string' || !Number.isSafeInteger(data['line_number'])) return original
        out.push(`${JSON.stringify(file.text)}:${String(data['line_number'])}:${text.text.replace(/\r?\n$/, '')}`); matches++
      } else if (event.type === 'summary') out.push(`Search summary: ${JSON.stringify(data)}`)
      else if (!['begin', 'end'].includes(event.type ?? '')) return original
    }
    if (matches > 0) body = out.join('\n')
  } else if (/\bgit\s+status\s+[^\r\n]*(?:--porcelain(?:=v1)?|--short)\b/.test(call) && !/--porcelain=v2|(?:^|\s)-z(?:\s|$)/.test(call)) {
    const groups = new Map<string, string[]>(), other: string[] = []
    for (const line of lines) {
      const match = /^([ MADRCU?!]{2}) (.+)$/.exec(line)
      if (match === null) { other.push(line); continue }
      const code = match[1] ?? '', file = match[2] ?? ''
      const split = file.includes(' -> ') || file.startsWith('"') ? -1 : file.lastIndexOf('/')
      const directory = split < 0 ? '' : file.slice(0, split + 1), entry = file.slice(split + 1)
      const key = `${code}\0${directory}`
      const group = groups.get(key) ?? []; group.push(entry); groups.set(key, group)
    }
    if ([...groups.values()].reduce((s, g) => s + g.length, 0) >= 12) body = [...other, ...[...groups].map(([key, files]) => { const [status, directory] = key.split('\0'); return JSON.stringify({ status, directory, entries: files }) })].join('\n')
  }
  if (body.length + 300 >= original.length) return original
  labEvent('A.structured', { call, savedChars: original.length - body.length })
  return body
}

/** Only clear code continuations are reused; ambiguous text and named skill changes rejudge. */
export function skillScope(words: string): string | null {
  if (!labOn('B')) return null
  if (/\b(?:sql|database|travel|insurance|slides|music|legal)\b|数据库|旅行|保险|合同|幻灯片|音乐|换个|新任务|另外/.test(words.toLowerCase())) return null
  return /\b(?:npm|javascript|node|median|mean|formatList|transform)\b|src\//.test(words) ? 'code' : null
}

/** Estimate the rewritten suffix and six future dispatches, using the known 50:1 miss/hit price ratio. */
export function worthForgetting(savedChars: number, rebuiltChars: number): boolean {
  if (!labOn('B')) return true
  const reuse = 6, miss = 2, hit = .04
  const benefit = savedChars / 4 * hit * reuse
  const rebuild = Math.max(0, rebuiltChars - savedChars) / 4 * (miss - hit)
  const worthwhile = benefit >= rebuild
  labEvent('B.cache-cost-gate', { savedChars, rebuiltChars, assumedFutureRequests: reuse, worthwhile })
  return worthwhile
}

/** Extract exact whole lines from the hidden middle; no generated facts or truncated values. */
export function factIndex(text: string, edge: number): string {
  if (!labOn('C') && !labOn('D')) return ''
  const first = text.slice(0, edge), last = edge > 0 ? text.slice(-edge) : ''
  const facts: string[] = []; let length = 0
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.length < 5 || line.length > 280 || first.includes(line) || last.includes(line) || /api[_ -]?key|authorization|password|secret|bearer/i.test(line)) continue
    const extract = labOn('C') && /\b(?:Build ID|DECISION|CONTRACT|Invariant|TODO|FIXME)\s*:|\bmust\b|必须|约束|决策/.test(line)
    if (!extract && !labPrefixes().some(prefix => line.includes(prefix))) continue
    if (facts.includes(line) || length + line.length > 1200) continue
    facts.push(line); length += line.length
    if (facts.length >= 8) break
  }
  if (facts.length === 0) return ''
  labEvent('memory.extracted', { features: [...enabled], lines: facts.length, chars: length })
  return `[sieve: exact facts from the archived output]\n${facts.join('\n')}\n`
}

export function cacheKey(provider: string, state: unknown, questions: unknown): string {
  return createHash('sha256').update(JSON.stringify([provider.replace(/127\.0\.0\.1:\d+/, 'loopback'), state, questions])).digest('hex')
}
export function readJudgment<T>(key: string): T | undefined {
  if (!labOn('B')) return undefined
  const file = process.env['SIEVE_LAB_CACHE']
  if (file === undefined || !fs.existsSync(file)) return undefined
  try {
    const cache = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, { at: number, result: T }>
    const entry = cache[key]
    if (entry === undefined || Date.now() - entry.at > 24 * 60 * 60 * 1000) return undefined
    labEvent('B.exact-judge-cache-hit'); return entry.result
  } catch { return undefined }
}
export function saveJudgment(key: string, result: unknown): void {
  if (!labOn('B')) return
  const file = process.env['SIEVE_LAB_CACHE']
  if (file === undefined) return
  let cache: Record<string, unknown> = {}
  try { cache = JSON.parse(fs.readFileSync(file, 'utf8')) as typeof cache } catch {}
  cache[key] = { at: Date.now(), result }
  cache = Object.fromEntries(Object.entries(cache).slice(-128))
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(cache))
}
