import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { explain, renderMermaid } from '../../core/render.ts'
import { THEMES } from '../../core/themes.ts'
import { fx, spanOf } from './c-lib.ts'
import { text } from '../core/graph-fixture.ts'
const T = (id: string, w: number) => text((explain(fx(id), { columns: w, theme: 'mono' }) as any).drawing)
test("A4: quadrant-ok-01's key 1 is at column 18, row 6 (q = 30) and at column 16 (q = 28); quadrant-ok-09's legend row wraps at 59", () => {
  for (const [w, col] of [
    [120, 18],
    [80, 18],
    [60, 16],
  ] as const) {
    const t = T('quadrant-ok-01', w)
    const top = t.findIndex((l) => l.startsWith('┌'))
    assert.equal(t[top + 5]!.indexOf('1'), 1 + col, `@${w}`) // row 6 is the 4th point row, under the top half's title row
  }
  assert.equal(T('quadrant-ok-09', 60).filter((l) => l.startsWith('1 ')).length, 1)
  assert.match(T('quadrant-ok-09', 59).at(-1)!, /^ {2}\S/)
})
test('A7: point keys take s1; the frame takes frame; coordinates take value', () => {
  const r = renderMermaid(fx('quadrant-ok-01'), { columns: 80, theme: 'nord' })!
  const n = THEMES.nord
  assert.deepEqual(
    [spanOf(r, /^1$/)?.color, spanOf(r, /^┌─+┬─+┐$/)?.color, spanOf(r, /^\(0\.3, 0\.6\)$/)?.color],
    [n.series.s1, n.roles.frame, n.roles.value],
  )
})
