// tests/golden/gantt_test.ts — gantt fixtures (plan C T70): the matrix's bar, ◆ and tick numbers, keyed legends and
// inks.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { explain, renderMermaid } from '../../core/render.ts'
import { THEMES } from '../../core/themes.ts'
import { fx, hrun } from './c-lib.ts'
import { text } from '../core/graph-fixture.ts'
const X = (id: string, w: number) => (explain(fx(id), { columns: w, theme: 'mono' }) as any).drawing
const ticks = (line: string, f: number) => [...line].flatMap((c, i) => (c === '┬' ? [i - f] : []))
test('A4: gantt-ok-02 at 120, 80 and 60: bar eighths, ◆ and tick cells (the field starts at cell 25)', () => {
  for (const [w, spec, code, at, dia, tk] of [
    [120, 160, 320, 20, 59, [0, 14, 28, 42]],
    [80, 147, 293, 18, 54, [0, 12, 25, 38]],
    [60, 93, 187, 11, 34, [0, 16]],
  ] as const) {
    const d = X('gantt-ok-02', w)
    const t = text(d)
    assert.deepEqual(
      [hrun(d, 2, 25), hrun(d, 3, 25 + at), t[4]!.indexOf('◆') - 25, ticks(t[5]!, 25)],
      [spec, code, dia, [...tk]],
      `@${w}`,
    )
  }
})
test('A4: gantt-ok-04 at 120: ◆ at cells 2 and 54; Task A from cell 5, 209 eighths; 5-minute ticks (the field starts at 32)', () => {
  const d = X('gantt-ok-04', 120)
  const t = text(d)
  const row = (s: string) => t.findIndex((l) => l.includes(s))
  assert.deepEqual(
    [
      t[row('Initial milestone')]!.indexOf('◆') - 32,
      t[row('Final milestone')]!.indexOf('◆') - 32,
      hrun(d, row('Task A'), 37),
    ],
    [2, 54, 209],
  )
  assert.deepEqual(ticks(t.find((l) => l.includes('┬'))!, 32), [0, 13, 26, 39, 52])
})
test('A4: gantt-ok-15 at 60 keys its timings (W = 43): bars, ticks and legend rows (the field starts at 17)', () => {
  const d = X('gantt-ok-15', 60)
  const t = text(d)
  assert.deepEqual([hrun(d, 0, 17), hrun(d, 1, 34), hrun(d, 2, 52)], [142, 142, 61])
  assert.deepEqual(ticks(t[3]!, 17), [0, 15, 30])
  assert.deepEqual(t.slice(-3), [
    'a 2024-03-01 08:00 · 2024-03-01 11:30',
    'b after l · 2024-03-01 15:00',
    'c after d · 90m',
  ])
})
test('A4: gantt-ok-16 keys 27 tasks a…z, aa (K = 2); every task row is exactly 42 cells', () => {
  const t = text(X('gantt-ok-16', 42)).filter((l) => /^ {3}t\d\d /.test(l))
  assert.equal(t.length, 27)
  assert.ok(t.every((l) => l.length === 42))
  assert.match(t[26]!, /^ {3}t27 aa /)
})
test('A7: crit, done and active bars take the arrow, note and decision roles; other bars their series', () => {
  const r = renderMermaid(fx('gantt-ok-06'), { columns: 80, theme: 'nord' })!
  const n = THEMES.nord
  const ink = (name: string, g: string) =>
    r.find((row) => row.some((s) => s.text.includes(name)))!.find((s) => s.text.includes(g))?.color
  assert.deepEqual(
    [ink('Both', '█'), ink('Gate', '◆'), ink('Doing', '█'), ink('Plain', '█')],
    [n.roles.note, n.roles.arrow, n.roles.decision, n.series.s1],
  )
})
test('A4: gantt-ok-07 renders and prints 1.5s, 1.5m and 1.5h as written, so a regression that rejects them fails', () => {
  const t = text(X('gantt-ok-07', 120))
  assert.ok(
    ['1.5s', '1.5m', '1.5h'].every((s) => t.some((l) => l.includes(s))),
    t.join('\n'),
  )
})
