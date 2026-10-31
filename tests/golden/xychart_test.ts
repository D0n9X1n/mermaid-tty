import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, readdirSync } from 'node:fs'
import { explain, renderMermaid } from '../../core/render.ts'; import { THEMES } from '../../core/themes.ts'
import { fx, vrun } from './c-lib.ts'; import { widest } from './golden-lib.ts'; import { text } from '../core/graph-fixture.ts'
const ids = readdirSync('fixtures/xychart').map(f => f.replace('.mmd', ''))
test('A4: xychart-ok-01: bar eighth-rows; ticks 11000, 7500, 4000; vertical (79 cells) at 80, horizontal at 60', () => {
  const r = explain(fx('xychart-ok-01'), { columns: 80, theme: 'mono' }) as any, t = text(r.drawing), base = t.findIndex(l => l.includes('└'))
  assert.deepEqual([r.step, widest(r.drawing)], ['natural', 79])   // G = 6, c = 5: group g's first bar cell is column 8 + 6g
  assert.deepEqual(Array.from({ length: 12 }, (_, g) => vrun(r.drawing, 8 + 6 * g, base)), [9, 18, 32, 38, 50, 59, 64, 57, 48, 41, 27, 18])
  assert.deepEqual([t[base - 8], t[base - 4], t[base]].map(l => l!.trim().split(' ')[0]), ['11000', '7500', '4000'])
  assert.equal((explain(fx('xychart-ok-01'), { columns: 60, theme: 'mono' }) as any).step, 'horizontal')
})
test('A7: series take s1, s2, s3 in source order over bars and lines; values carry the value role', () => {
  const r = renderMermaid(fx('xychart-ok-06'), { columns: 80, theme: 'nord' })!, n = THEMES.nord, i = r.findIndex(row => row.some(s => s.text.includes('2023')))
  assert.deepEqual([r[i]!.find(s => s.text.startsWith('█'))?.color, r[i + 1]!.find(s => s.text.startsWith('█'))?.color,
    r[i + 2]!.filter(s => s.text.includes('●')).at(-1)?.color], [n.series.s1, n.series.s2, n.series.s3])
  assert.equal(r[i]!.find(s => s.text.trim() === '40')?.color, n.roles.value)
})
test('A5.mutation-tests: every xychart-ok fixture lists every bar, zero bars included, in order, at 60, 80 and 120', () => {
  for (const id of ids.filter(i => i.includes('-ok-'))) {
    const series = [...fx(id).matchAll(/^\s*(bar|line)\b[^[\n]*\[([^\]]*)\]/gm)]   // x<k>: k counts every series, bars and lines, in source order
    const want = series.flatMap((m, k) => (m[1] === 'bar' ? m[2]!.split(',').map((_, j) => `x${k}.b${j}`) : []))
    for (const w of [60, 80, 120]) assert.deepEqual((explain(fx(id), { columns: w, theme: 'mono' }) as any).drawing.expect.bars.map((b: any) => b.owner), want, `${id}@${w}`)
  }
})
