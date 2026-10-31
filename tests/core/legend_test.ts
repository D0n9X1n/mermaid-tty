import test from 'node:test'
import assert from 'node:assert/strict'
import { fieldKey, pointKey, legendRows, withLegend, type LegendRow } from '../../core/charts/legend.ts'
import { validate } from '../../core/validate.ts'
import { createCanvas, type Drawing } from '../../core/canvas.ts'
import { text } from './graph-fixture.ts'
const row = (key: string, item: string, s: string): LegendRow => ({
  key,
  keyInk: 'label',
  item,
  cls: 'timing',
  parts: [{ text: s, ink: 'value', owner: item }],
})
// A body that draws each [key, item] in place on row 0, three cells apart.
const body = (keys: readonly [string, string][]): Drawing => {
  const c = createCanvas(1, 12, 12)
  keys.forEach(([key, item], i) => c.key(0, 3 * i, key, 'label', item, false))
  return c.toDrawing({ labels: [], edges: [], edgeLabels: [], frames: [] })
}
test('A4: field keys a…z, aa…; point keys 1…; a row wraps under its text', () => {
  assert.deepEqual([0, 25, 26, 27, 701, 702].map(fieldKey), ['a', 'z', 'aa', 'ab', 'zz', 'aaa'])
  assert.deepEqual([0, 9, 11].map(pointKey), ['1', '10', '12'])
  const d = legendRows([row('a', 't1.t', '2024-01-01 · 10d'), row('aa', 't2.t', 'one two')], 16) as Drawing
  assert.deepEqual(text(d), ['a 2024-01-01 ·', '  10d', 'aa one two'])
  assert.equal(d.cells[0]![0]!.kind, 'key')
  assert.equal(d.cells[0]![0]!.legend, true)
  assert.equal(d.cells[0]![2]!.kind, 'text')
  assert.deepEqual(legendRows([row('a', 'x', 'Supercalifragilistic')], 16), { reason: 'word-too-wide' })
})
test('A5.mutation-tests: withLegend lists every key, so a key missing in place, a stray key or a duplicate row fails', () => {
  const rows = [row('a', 't1.t', 'one'), row('b', 't2.t', 'two')]
  const keyable = [
    { item: 't1.t', cls: 'timing' },
    { item: 't2.t', cls: 'timing' },
  ]
  const ok = withLegend(
    body([
      ['a', 't1.t'],
      ['b', 't2.t'],
    ]),
    rows,
    12,
    keyable,
  ) as Drawing
  assert.deepEqual(ok.expect.keys, [
    { key: 'a', item: 't1.t', cls: 'timing' },
    { key: 'b', item: 't2.t', cls: 'timing' },
  ])
  assert.equal(validate(ok), null)
  assert.deepEqual(validate(withLegend(body([['a', 't1.t']]), rows, 12, keyable) as Drawing), { reason: 'key-missing' })
  assert.deepEqual(
    validate(
      withLegend(
        body([
          ['a', 't1.t'],
          ['b', 't2.t'],
        ]),
        rows.slice(0, 1),
        12,
        keyable,
      ) as Drawing,
    ),
    { reason: 'key-stray' },
  )
  assert.deepEqual(validate(legendRows([row('a', 'n1', 'memo'), row('b', 'n1', 'memo')], 20) as Drawing), {
    reason: 'label-dup',
  })
})
// At 14 columns, row a is Design (its item's), a · separator, then two weeks (t1.d's), which wraps; row b is eight W/F
// characters, 16 cells, which wrap between two of them.
test("A4: a row packs its parts' words one space apart: a null-owner part is caps, a continuation keeps its join, a W/F character 2 cells", () => {
  const a: LegendRow = {
    key: 'a',
    keyInk: 'label',
    item: 't1.t',
    cls: 'timing',
    parts: [
      { text: 'Design', ink: 'label', owner: 't1.t' },
      { text: ' · ', ink: 'note', owner: null },
      { text: 'two weeks', ink: 'value', owner: 't1.d' },
    ],
  }
  const d = withLegend(
    body([
      ['a', 't1.t'],
      ['b', 't2.t'],
    ]),
    [a, row('b', 't2.t', '设计评审会议记录')],
    14,
    [
      { item: 't1.t', cls: 'timing' },
      { item: 't2.t', cls: 'timing' },
    ],
  ) as Drawing
  assert.deepEqual(text(d), ['a  b', 'a Design · two', '  weeks', 'b 设计评审会议', '  记录'])
  assert.equal(validate(d), null)
  assert.deepEqual(d.expect.labels, [
    { owner: 't1.t', text: 'Design', at: { r: 1, c: 2 } },
    { owner: 't1.d', text: 'two weeks', at: { r: 1, c: 11 } },
    { owner: 't2.t', text: '设计评审会议记录', at: { r: 3, c: 2 } },
  ])
  assert.deepEqual([d.cells[1]![9]!.kind, d.cells[1]![9]!.role, d.cells[1]![9]!.owners], ['cap', 'note', ['t1.t']])
  assert.deepEqual(
    [d.cells[1]![11]!.join, d.cells[2]![2]!.join, d.cells[3]![2]!.join, d.cells[4]![2]!.join],
    [undefined, ' ', undefined, ''],
  )
})
// T46/T63 QA: keyable reaches expect, so a class keyed for only some of its items fails key-partial.
test('A5.mutation-tests: withLegend lists keyable, so a half-keyed class fails key-partial', () => {
  const keyable = [
    { item: 't1.t', cls: 'timing' },
    { item: 't2.t', cls: 'timing' },
  ]
  const d = withLegend(body([['a', 't1.t']]), [row('a', 't1.t', 'one')], 12, keyable) as Drawing
  assert.deepEqual(d.expect.keyable, keyable)
  assert.deepEqual(validate(d), { reason: 'key-partial' })
})
