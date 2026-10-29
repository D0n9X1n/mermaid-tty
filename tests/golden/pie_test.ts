// tests/golden/pie_test.ts — pie fixtures (plan C T64): coverage rows, the matrix's bar eighths and series/value inks.
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, readdirSync } from 'node:fs'
import { explain, renderMermaid } from '../../core/render.ts'; import { THEMES } from '../../core/themes.ts'; import { coverageOf, fx, hrun, spanOf } from './c-lib.ts'
const M = readFileSync('docs/specs/2026-10-27-mermaid-tty-v1-diagram-matrix.md', 'utf8'), ids = readdirSync('fixtures/pie').map(f => f.replace('.mmd', ''))
const bars = (id: string, w: number, n: number) => { const d = (explain(fx(id), { columns: w, theme: 'mono' }) as any).drawing
  return d.cells.map((_: unknown, r: number) => hrun(d, r, n + 1)).filter((e: number) => e > 0) }   // the field starts after the N-cell label and a space
test('A5: every pie coverage row cites an existing fixture; every ok fixture is cited', () => assert.deepEqual(coverageOf(M, 'pie', ids), []))
test('A4: the matrix bar eighths of pie-ok-01, -02 and -03', () => {
  assert.deepEqual([120, 80, 60].map(w => bars('pie-ok-01', w, 4)), [[381, 84, 15], [381, 84, 15], [286, 63, 11]])
  assert.deepEqual([120, 80].map(w => bars('pie-ok-02', w, 9)), [[222, 191, 44, 22], [215, 185, 43, 21]])
  assert.deepEqual([120, 80, 60].map(w => bars('pie-ok-03', w, 1)), [[450, 30], [450, 30], [368, 25]])
})
test('A7: bars take series colors by source order, so sorting keeps them; values carry the value role', () => {
  const r = renderMermaid(fx('pie-ok-02'), { columns: 80, theme: 'nord' })!, n = THEMES.nord, barOf = (i: number) => r[i]!.find(x => x.text.startsWith('█'))?.color
  assert.deepEqual([barOf(1), barOf(2)], [n.series.s2, n.series.s1]); assert.equal(spanOf(r, /^50\.05$/)?.color, n.roles.value)
})
