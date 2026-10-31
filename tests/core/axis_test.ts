import test from 'node:test'
import assert from 'node:assert/strict'
import { axisRows, type Tick } from '../../core/charts/axis.ts'
import { validate } from '../../core/validate.ts'
import { text } from './graph-fixture.ts'
import type { Drawing } from '../../core/canvas.ts'
const rule = (left: number, w: number, at: number[]) =>
  ' '.repeat(left) + [...Array(w)].map((_, i) => (at.includes(i) ? '┬' : '─')).join('')
const L = (cell: number, label: string, align: 'left' | 'right' = 'left') => ({ cell, label, align })
test('A4: ticks sit at their cells; a label that leaves the field, or meets the previous one, drops with its tick', () => {
  const g = axisRows(25, 30, [L(0, '2024-01-01'), L(14, '2024-01-15'), L(28, '2024-01-29')], 55, 'axis')
  assert.deepEqual(text(g), [rule(25, 30, [0, 14]), ' '.repeat(25) + '2024-01-01    2024-01-15'])
  assert.equal(validate(g), null)
  assert.deepEqual(text(axisRows(6, 10, [L(0, '0'), L(9, '100', 'right')], 40, 'axis')), [
    rule(6, 10, [0, 9]),
    ' '.repeat(6) + '0      100',
  ])
  assert.deepEqual(text(axisRows(0, 20, [L(0, '08:00'), L(3, '09:00'), L(6, '10:00')], 20, 'axis')), [
    rule(0, 20, [0, 6]),
    '08:00 10:00',
  ])
})

// Each drawn cell of row r, as 'col kind role owners'.
const cellsOf = (g: Drawing, r: number) =>
  g.cells[r]!.flatMap((x, c) => (x ? [`${c} ${x.kind} ${x.role} ${x.owners.join('+')}`] : []))
test("A4: the rule is frame caps owned by owner, each kept label value text owned by its tick's input index, columns wide", () => {
  const ticks = [L(0, '08:00'), L(3, '09:00'), L(6, '10:00')]
  const g = axisRows(2, 20, ticks, 24, 'ax')
  assert.equal(g.columns, 24)
  assert.equal(validate(g), null)
  assert.deepEqual(g.expect, {
    labels: [
      { owner: 'ax.t0', text: '08:00', at: { r: 1, c: 2 } },
      { owner: 'ax.t2', text: '10:00', at: { r: 1, c: 8 } },
    ],
    edges: [],
    edgeLabels: [],
    frames: [],
    glyphs: [
      { owner: 'ax', ch: '┬', at: { r: 0, c: 2 } },
      { owner: 'ax', ch: '┬', at: { r: 0, c: 8 } },
    ],
  })
  assert.deepEqual(
    cellsOf(g, 0),
    [...Array(20)].map((_, i) => `${i + 2} cap frame ax`),
  )
  assert.deepEqual(
    cellsOf(g, 1),
    [2, 3, 4, 5, 6].map((c) => `${c} text value ax.t0`).concat([8, 9, 10, 11, 12].map((c) => `${c} text value ax.t2`)),
  )
  assert.deepEqual(validate(axisRows(2, 20, ticks, 21, 'ax')), { reason: 'row-too-wide' }) // a field past the budget fails
})

// An axis of w cells at column 0, w columns wide, as text.
const row = (w: number, ticks: Tick[]) => text(axisRows(0, w, ticks, w, 'axis'))
test('A4: a label stays only inside the field, and 2 or more cells after the last kept one, measured in columns', () => {
  assert.deepEqual(row(10, [L(7, 'abc')]), [rule(0, 10, [7]), '       abc']) // ends on the last cell
  assert.deepEqual(row(10, [L(8, 'abc')]), [rule(0, 10, []), '']) // ends one past it
  assert.deepEqual(row(10, [L(2, 'abc', 'right')]), [rule(0, 10, [2]), 'abc']) // starts on cell 0
  assert.deepEqual(row(10, [L(1, 'abc', 'right')]), [rule(0, 10, []), '']) // starts one before it
  assert.deepEqual(row(10, [L(0, 'ab'), L(3, 'cd')]), [rule(0, 10, [0, 3]), 'ab cd']) // 2 cells after: stays
  assert.deepEqual(row(10, [L(0, 'ab'), L(2, 'cd')]), [rule(0, 10, [0]), 'ab']) // 1 cell after: drops
  assert.deepEqual(row(10, [L(0, 'ab'), L(4, 'cd', 'right')]), [rule(0, 10, [0, 4]), 'ab cd']) // a right label starts at
  assert.deepEqual(row(10, [L(0, 'ab'), L(3, 'cd', 'right')]), [rule(0, 10, [0]), 'ab']) //   cell − width + 1
  assert.deepEqual(row(10, [L(0, '一月'), L(4, 'x')]), [rule(0, 10, [0]), '一月']) // a wide label spans its columns
  assert.deepEqual(row(10, [L(3, '一月', 'right'), L(5, 'x')]), [rule(0, 10, [3, 5]), '一月 x'])
})
test('A4: a dropped label moves nothing: the next one still measures from the last kept label', () => {
  assert.deepEqual(row(20, [L(0, 'abcdef'), L(2, 'x'), L(6, 'y')]), [rule(0, 20, [0]), 'abcdef']) // not to its nearer end
  assert.deepEqual(row(20, [L(0, 'ab'), L(1, 'abcdefgh'), L(4, 'y')]), [rule(0, 20, [0, 4]), 'ab  y']) // nor to its farther one
  assert.deepEqual(row(10, [L(0, 'abc', 'right'), L(1, 'x')]), [rule(0, 10, [1]), ' x']) // nor one that left the field
})
// Helpers QA: ticks are taken in input order, never re-sorted: after x at 6, y at 0 starts before x's end and drops.
test('A4: ticks are taken in input order: a later tick to the left of a kept label drops', () => {
  const d = axisRows(0, 8, [L(6, 'x'), L(0, 'y')], 8, 'ax')
  assert.deepEqual(d.expect.labels, [{ owner: 'ax.t0', text: 'x', at: { r: 1, c: 6 } }])
  assert.deepEqual(text(d), [rule(0, 8, [6]), '      x'])
})
