/** Reversible factoring of repeated source-line affixes, with a reconstruction check. */
import { labEvent, labOn } from './lab.ts'
import { proseRead } from './local-compression.ts'

export interface LineTemplate { prefix: string, suffix: string, rows: [number, string][] }
export interface FactoredLines { templates: LineTemplate[], plain: [number, string][] }
function shared(values: string[], suffix: boolean): string {
  const first = values[0] ?? ''
  let length = Math.min(first.length, 512)
  for (const text of values.slice(1)) {
    let i = 0
    while (i < length && i < text.length && (suffix ? first[first.length - 1 - i] === text[text.length - 1 - i] : first[i] === text[i])) i++
    length = i
  }
  const raw = suffix ? first.slice(first.length - length) : first.slice(0, length)
  // A shared boundary must never split a Unicode surrogate pair.
  return suffix ? raw.replace(/^[\uDC00-\uDFFF]/u, '') : raw.replace(/[\uD800-\uDBFF]$/u, '')
}
export function factorLines(lines: string[]): FactoredLines | undefined {
  const groups = new Map<string, [number, string][]>()
  lines.forEach((line, i) => {
    if (line.length < 96) return
    const key = line.slice(-64)
    const group = groups.get(key) ?? []; group.push([i + 1, line]); groups.set(key, group)
  })
  const templates: LineTemplate[] = [], used = new Set<number>()
  for (const group of groups.values()) {
    if (group.length < 8) continue
    const texts = group.map(([, text]) => text)
    const suffix = shared(texts, true)
    const rests = texts.map(text => text.slice(0, text.length - suffix.length))
    const prefix = shared(rests, false)
    const rows: [number, string][] = group.map(([n, line]) => [n, line.slice(prefix.length, line.length - suffix.length)])
    const template = { prefix, suffix, rows }
    if (JSON.stringify(template).length + 300 >= group.reduce((s, [, line]) => s + line.length, 0)) continue
    templates.push(template); for (const [n] of rows) used.add(n)
  }
  if (templates.length === 0) return undefined
  const plain: [number, string][] = lines.flatMap((line, i) => used.has(i + 1) ? [] : [[i + 1, line] as [number, string]])
  const factored = { templates, plain }
  const recovered = restoreLines(factored)
  if (recovered.length !== lines.length || lines.some((line, i) => recovered[i] !== line)) return undefined
  return factored
}
export function restoreLines(factored: FactoredLines): string[] {
  const all: [number, string][] = [...factored.plain]
  for (const { prefix, suffix, rows } of factored.templates) for (const [n, value] of rows) all.push([n, prefix + value + suffix])
  all.sort(([a], [b]) => a - b)
  if (all.some(([n], i) => n !== i + 1)) return []
  return all.map(([, line]) => line)
}
export function templateProse(tool: string, args: Record<string, unknown>, original: string): string | undefined {
  if (!labOn('G')) return undefined
  const started = performance.now()
  const read = proseRead(tool, args, original)
  if (read === undefined) return undefined
  const lines = read.text.split('\n'), factored = factorLines(lines)
  if (factored === undefined) return undefined
  const body = `<path>${read.path}</path>\n[sieve: lossless source-line templates; restore each numbered row as prefix + row value + suffix. Plain rows are complete original lines. Use the full-output reference to read the original format.]\n${JSON.stringify(factored)}\n`
  if (body.length + 500 >= original.length || body.length > .8 * original.length) return undefined
  labEvent('G.line-templates', { originalChars: original.length, compressedChars: body.length, localMs: performance.now() - started, templates: factored.templates.length, sourceLines: lines.length })
  return body
}
