// node scripts/corpus-gate.ts DIR [--private DIR2]: draws every block of DIR through explain, which lays it out and
// validates the drawing, at 80 and 120 columns in the default theme. A block is a .mmd file, or a closed mermaid fence of
// a .md file; blocks count from 1 in file-name order. Prints the counts and each failure as <index>@<cols> <reason>, and
// exits 1 when any block fails. --private gates DIR2 alike and prints only its counts. No output names a file or quotes
// a block.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isFail } from '../core/fail.ts'
import { explain } from '../core/render.ts'
import { splitFences } from '../hooks/fences.ts'
import { isMain } from './lib/is-main.ts'

const COLUMNS = [80, 120] as const
const USAGE = 'usage: node scripts/corpus-gate.ts DIR [--private DIR2]'

// The blocks of dir: each .mmd file whole, then each .md file's closed mermaid fences, in file-name order.
function blocks(dir: string): string[] {
  return readdirSync(dir).sort().flatMap(name => {
    if (name.endsWith('.mmd')) return [readFileSync(join(dir, name), 'utf8')]
    if (!name.endsWith('.md')) return []
    return splitFences(readFileSync(join(dir, name), 'utf8')).flatMap(s => (s.kind === 'mermaid' ? [s.body] : []))
  })
}

// The blocks of dir, and each failure as <index>@<cols> <reason>: a block's index, never its source or its file.
export function gate(dir: string): { total: number; failed: string[] } {
  const all = blocks(dir)
  const failed = all.flatMap((source, i) => COLUMNS.flatMap(columns => {
    const r = explain(source, { columns, theme: 'default' })
    return isFail(r) ? [`${i + 1}@${columns} ${r.reason}`] : []
  }))
  return { total: all.length, failed }
}

// k and word, plural unless k is 1.
const count = (k: number, word: string): string => `${k} ${word}${k === 1 ? '' : 's'}`

// One line of a gate's counts, under label.
const counts = (label: string, g: { total: number; failed: string[] }): string =>
  `${label}: ${count(g.total, 'block')}, ${count(g.failed.length, 'failure')} at 80 and 120 columns`

function main(argv: readonly string[] = process.argv.slice(2)): number {
  const [dir, flag, priv, ...rest] = argv
  if (dir === undefined || (flag !== undefined && (flag !== '--private' || priv === undefined)) || rest.length > 0) {
    console.error(USAGE)
    return 2
  }
  const pub = gate(dir)
  console.log(counts('corpus-gate', pub))
  for (const f of pub.failed) console.log(`  ${f}`)
  const hidden = priv === undefined ? null : gate(priv)
  if (hidden) console.log(counts('corpus-gate --private', hidden))
  return pub.failed.length + (hidden?.failed.length ?? 0) > 0 ? 1 : 0
}

// main() runs only when node runs this file, not when a test imports it.
if (isMain(import.meta)) process.exitCode = main()
