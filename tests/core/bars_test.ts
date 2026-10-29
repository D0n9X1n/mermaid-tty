import test from 'node:test'; import assert from 'node:assert/strict'
import { eighths, cellOf, rowAt, percent } from '../../core/charts/scale.ts'; import { hbar, vbar } from '../../core/charts/bars.ts'
import { parseDec, dec, sub, type Dec } from '../../core/charts/decimal.ts'
const D = (s: string) => parseDec(s) as Dec
test('A4: eighths are round(8·v/M·W), half up (pie-ok-01, pie-ok-03)', () => {
  assert.deepEqual(['386', '85', '15'].map(v => eighths(D(v), D('486'), 60)), [381, 84, 15])
  assert.deepEqual(['386', '85', '15'].map(v => eighths(D(v), D('486'), 45)), [286, 63, 11])
  assert.deepEqual(['15', '1'].map(v => eighths(D(v), D('16'), 49)), [368, 25])
})
test('A4: cells floor, unclamped; rows ceil with a floor of 1 (xychart-ok-03); percentages half up', () => {
  assert.deepEqual([cellOf(dec(10), dec(30), 60), cellOf(dec(10), dec(30), 55), cellOf(dec(30), dec(30), 35)], [20, 18, 35])
  const y0 = D('-0.34'), m = sub(D('2.4'), y0)
  assert.deepEqual(['+1.3', '.6', '2.4', '-.34'].map(v => rowAt(sub(D(v), y0), m, 8)), [5, 3, 8, 1])
  assert.deepEqual([percent(D('386'), D('486')), percent(D('1'), D('16')), percent(dec(1), dec(1))], ['79.4%', '6.3%', '100.0%'])
})
test('A4: horizontal and vertical eighth-block runs; zero draws nothing', () => {
  assert.deepEqual([hbar(381), hbar(84), hbar(15), hbar(0)], ['█'.repeat(47) + '▋', '█'.repeat(10) + '▌', '█▉', ''])
  assert.deepEqual(vbar(13, 8), [' ', ' ', ' ', ' ', ' ', ' ', '▅', '█']); assert.deepEqual(vbar(64, 8), Array(8).fill('█'))
})
// Numerics QA: each partial glyph is pinned by its own count, so a swap inside either glyph table fails.
test('A4: every partial shows exactly its eighths: 1–7 are ▏▎▍▌▋▊▉ across and ▁▂▃▄▅▆▇ up, after the full cells', () => {
  for (const [k, g] of [...'▏▎▍▌▋▊▉'].entries()) { assert.equal(hbar(k + 1), g, `h${k + 1}`); assert.equal(hbar(k + 9), `█${g}`, `h${k + 9}`) }
  for (const [k, g] of [...'▁▂▃▄▅▆▇'].entries()) { assert.deepEqual(vbar(k + 1, 1), [g], `v${k + 1}`); assert.deepEqual(vbar(k + 9, 3), [' ', g, '█'], `v${k + 9}`) }
})
