// node scripts/explain.ts FILE COLS: how the fit ladder draws FILE's diagram at COLS columns. Prints the step it took,
// the widest row's width and the rows as plain text, and exits 0; or prints the reason it falls back, and exits 1.
import { readFileSync } from 'node:fs'
import { isFail } from '../core/fail.ts'
import { explain, toRows } from '../core/render.ts'
import { palette } from '../core/themes.ts'
import { width } from '../core/width.ts'
import { isMain } from './lib/is-main.ts'

function main(argv: readonly string[] = process.argv.slice(2)): number {
  const [file, cols] = argv
  if (file === undefined || cols === undefined || !/^\d+$/.test(cols)) {
    console.error('usage: node scripts/explain.ts FILE COLS')
    return 2
  }
  const r = explain(readFileSync(file, 'utf8'), { columns: Number(cols) })
  if (isFail(r)) {
    console.log(`reason: ${r.reason}`)
    return 1
  }
  const rows = toRows(r.drawing, palette('default')).map(row => row.map(s => s.text).join(''))
  console.log(`step: ${r.step}`)
  console.log(`width: ${Math.max(0, ...rows.map(row => width(row)))}`)
  for (const row of rows) console.log(row)
  return 0
}

// main() runs only when node runs this file, not when a test imports it.
if (isMain(import.meta)) process.exitCode = main()
