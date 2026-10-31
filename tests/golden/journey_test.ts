// tests/golden/journey_test.ts — journey fixtures (plan C T66): the matrix's score-bar eighths and series/value inks.
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, readdirSync } from 'node:fs'
import { explain, renderMermaid } from '../../core/render.ts'; import { THEMES } from '../../core/themes.ts'; import { fx, hrun, spanOf } from './c-lib.ts'
const bars = (id: string, col: number) => { const d = (explain(fx(id), { columns: 80, theme: 'mono' }) as any).drawing
  return d.cells.map((_: unknown, r: number) => hrun(d, r, col)).filter((e: number) => e > 0) }   // the bar field starts at 2 + N + 1
test('A4: journey-ok-01 fills 80, 48 and 16 eighths (N = 13, "Go downstairs"); journey-ok-02 fills 40 and 76', () => {
  assert.deepEqual(bars('journey-ok-01', 16), [80, 48, 16, 80, 80]); assert.deepEqual(bars('journey-ok-02', 4), [40, 76])
})
test('A7: a section and its bars share a series color; scores carry the value role', () => {
  const r = renderMermaid(fx('journey-ok-01'), { columns: 80, theme: 'nord' })!, n = THEMES.nord
  assert.deepEqual([spanOf(r, /^Go to work$/)?.color, spanOf(r, /^Go home$/)?.color], [n.series.s1, n.series.s2])
  assert.equal(r[2]!.find(x => x.text.startsWith('█'))?.color, n.series.s1); assert.equal(spanOf(r, /^3$/)?.color, n.roles.value)
})
