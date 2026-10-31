// node scripts/smoke.ts: draws fixtures/flowchart/flowchart-ok-01.mmd at 80 columns under nord and prints its rows as
// plain text. Exits 1 when the fixture falls back.
import { readFileSync } from 'node:fs'
import { renderMermaid } from '../core/render.ts'
import { isMain } from './lib/is-main.ts'

const FIXTURE = new URL('../fixtures/flowchart/flowchart-ok-01.mmd', import.meta.url)

// Prints source's rows, drawn at 80 columns under nord, one line each: 0; or, when source falls back, 1.
export function main(source: string = readFileSync(FIXTURE, 'utf8')): number {
  const rows = renderMermaid(source, { columns: 80, theme: 'nord' })
  if (rows === null) {
    console.error('smoke: renderMermaid returned null, so the source falls back')
    return 1
  }
  for (const row of rows) {
    console.log(row.map((s) => s.text).join(''))
  }
  return 0
}

// main() runs only when node runs this file, not when a test imports it.
if (isMain(import.meta)) {
  process.exitCode = main()
}
