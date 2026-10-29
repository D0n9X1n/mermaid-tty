// node scripts/check-tangle.ts [--corpus] [--private DIR]: the independent tangle check (VR.tangled) over every golden, each
// -ok- fixture of fixtures/flowchart and fixtures/sequence, drawn at 60, 80 and 120 columns in the mono theme. Prints the
// counts and each hit as <id>@<cols> <rule>, and exits 1 on any hit. --corpus adds fixtures/corpus/*.mmd, and prints its
// counts and the ids that hit. --private DIR adds every closed mermaid fence of the .md files under DIR, and prints only its
// counts: no output names a private file or quotes a block.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isFail } from '../core/fail.ts'
import { explain } from '../core/render.ts'
import { splitFences } from '../hooks/fences.ts'
import { isMain } from './lib/is-main.ts'
import { tangles } from './lib/tangle.ts'

export type Block = { id: string; source: string }
const COLUMNS = [60, 80, 120] as const
const ROOT = fileURLToPath(new URL('../', import.meta.url))

// The .mmd files of dir, a path from the repo root, whose names pass keep, in name order: each a block named by its file.
const mmd = (dir: string, keep: (name: string) => boolean = () => true): Block[] => readdirSync(join(ROOT, dir))
  .filter(n => n.endsWith('.mmd') && keep(n)).sort().map(n => ({ id: n.slice(0, -'.mmd'.length), source: readFileSync(join(ROOT, dir, n), 'utf8') }))

// The goldens: each -ok- fixture of flowchart, then of sequence.
export const fixtures = (): Block[] => ['flowchart', 'sequence'].flatMap(k => mmd(`fixtures/${k}`, n => n.includes('-ok-')))
// The public corpus.
export const corpus = (): Block[] => mmd('fixtures/corpus')

// Each closed mermaid fence of the .md files under dir, at any depth, in path order. A block's id is its index from 1.
export function fences(dir: string): Block[] {
  const files = readdirSync(dir, { recursive: true, withFileTypes: true }).filter(e => e.isFile() && e.name.endsWith('.md'))
    .map(e => join(e.parentPath, e.name)).sort()
  return files.flatMap(f => splitFences(readFileSync(f, 'utf8')).flatMap(s => (s.kind === 'mermaid' ? [s.body] : [])))
    .map((source, i) => ({ id: String(i + 1), source }))
}

// Each tangle of each block, at each width that draws: a width that does not draw is the corpus gate's to report.
function scan(blocks: readonly Block[], draw: typeof explain): { id: string; hit: string }[] {
  return blocks.flatMap(b => COLUMNS.flatMap(columns => {
    const r = draw(b.source, { columns, theme: 'mono' })
    return isFail(r) ? [] : tangles(r.drawing).map(rule => ({ id: b.id, hit: `${b.id}@${columns} ${rule}` }))
  }))
}

// k and word, plural unless k is 1.
const count = (k: number, word: string): string => `${k} ${word}${k === 1 ? '' : 's'}`

// The report on blocks under label: a line of counts, then each hit, each id that hit once, or nothing more, as show says.
export function report(label: string, blocks: readonly Block[], show: 'hits' | 'ids' | 'counts', draw: typeof explain = explain):
  { lines: string[]; hits: number } {
  const found = scan(blocks, draw)
  const more = show === 'hits' ? found.map(f => f.hit) : show === 'ids' ? [...new Set(found.map(f => f.id))] : []
  const head = `${label}: ${count(blocks.length, 'block')}, ${count(found.length, 'hit')} at 60, 80 and 120 columns`
  return { lines: [head, ...more.map(m => `  ${m}`)], hits: found.length }
}

const USAGE = 'usage: node scripts/check-tangle.ts [--corpus] [--private DIR]'

// Reports the goldens, then the corpus with --corpus and DIR's blocks with --private DIR. 1 on any hit, 2 on a bad argument.
export function main(argv: readonly string[] = process.argv.slice(2), draw: typeof explain = explain): number {
  let withCorpus = false, priv: string | undefined
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!, next = argv[i + 1]
    if (a === '--corpus' && !withCorpus) withCorpus = true
    else if (a === '--private' && priv === undefined && next !== undefined && !next.startsWith('--')) { priv = next; i++ }
    else { console.error(USAGE); return 2 }
  }
  const reports = [report('check-tangle', fixtures(), 'hits', draw),
    ...(withCorpus ? [report('check-tangle --corpus', corpus(), 'ids', draw)] : []),
    ...(priv !== undefined ? [report('check-tangle --private', fences(priv), 'counts', draw)] : [])]
  for (const line of reports.flatMap(r => r.lines)) console.log(line)
  return reports.some(r => r.hits > 0) ? 1 : 0
}

// main() runs only when node runs this file, not when a test imports it.
if (isMain(import.meta)) process.exitCode = main()
