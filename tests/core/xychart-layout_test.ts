import test from 'node:test'
import assert from 'node:assert/strict'
import { explain } from '../../core/render.ts'
// text reads a title row from its first character; tests/core/title_test.ts checks the title is centered.
import { untitled as text } from './graph-fixture.ts'
import { validate } from '../../core/validate.ts'
import { xychart } from '../../core/diagrams/xychart/layout.ts'
import { readSource } from '../../core/source.ts'
const X = (src: string, columns: number) => explain(src, { columns, theme: 'mono' }) as any
const SALES = 'xychart-beta\ntitle Sales\nx-axis [jan, feb, mar]\ny-axis 0 --> 100\nbar [20, 75, 50]\nline [30, 60, 90]'
test('A4: the matrix sketch: an 8-row plot, the axis, the categories, one value row per series', () => {
  const r = X(SALES, 80)
  assert.equal(r.step, 'natural')
  assert.deepEqual(text(r.drawing), [
    'Sales',
    '100 ┤           ●',
    '    │',
    '    │     ██',
    '    │     ██●',
    ' 50 ┤     ██  ██',
    '    │   ● ██  ██',
    '    │ ▅▅  ██  ██',
    '    │ ██  ██  ██',
    '  0 └─┬───┬───┬──',
    '      jan feb mar',
    'a      20  75  50',
    '●      30  60  90',
  ])
})
test('A4: horizontal: one row per category and series; a ─ rule with ┬ at cells 0 and W − 1; y0 left, y1 right', () => {
  const r = X(SALES.replace('xychart-beta', 'xychart-beta horizontal'), 40)
  const t = text(r.drawing)
  assert.equal(r.step, 'natural')
  assert.deepEqual(t.slice(1, 3), [
    'jan a ' + '█'.repeat(6) + '▎'.padEnd(25) + ' 20',
    '    ● ' + '●'.padStart(10).padEnd(31) + ' 30',
  ])
  assert.deepEqual(t.slice(7), [
    ' '.repeat(6) + '┬' + '─'.repeat(29) + '┬',
    ' '.repeat(6) + '0' + ' '.repeat(27) + '100',
  ])
})
test('A4.fit-ladder: vertical if it fits; else horizontal while W ≥ 10; else W = 10 with wrapped categories; else fallback', () => {
  const L = 'xychart-beta\nx-axis ["far south east", north]\nbar [1, 2]'
  assert.deepEqual(
    [33, 32, 29, 28, 20, 19].map((c) => X(L, c).step ?? 'fallback'),
    ['natural', 'horizontal', 'horizontal', 'wrap', 'wrap', 'fallback'],
  )
})
test('A4: computed bounds print as exact decimals; a point sits in row max(1, ⌈H·(v − y0)/M⌉)', () => {
  const t = text(X('xychart-beta\nline [+1.3, .6, 2.4, -.34]', 80).drawing)
  const row = (c: number) => 8 - t.findIndex((l) => l[c] === '●')
  assert.deepEqual(
    [t[0], t[4], t[8]].map((l) => l!.trim().split(' ')[0]),
    ['2.4', '1.03', '-0.34'],
  )
  assert.deepEqual([8, 13, 18, 23].map(row), [5, 3, 8, 1])
  assert.equal(t.at(-1), '●       +1.3   .6  2.4 -.34')
})
// One vertical chart, every bar listed: x0.b1 is the zero bar; x0.b2 (40 eighths) is drawn 2 lanes wide.
const BARS = 'xychart-beta\nx-axis [a, b, c]\ny-axis 0 --> 80\nbar [20, 0, 50]'
test('A5.mutation-tests: expect.bars lists every xychart bar; a deleted or one-lane-narrow positive bar fails bar', () => {
  const d = X(BARS, 80).drawing
  const own = (c: any) => c?.kind === 'cap' && c.owners[0] === 'x0.b2'
  assert.deepEqual(
    d.expect.bars.map((b: any) => [b.owner, b.eighths]),
    [
      ['x0.b0', 16],
      ['x0.b1', 0],
      ['x0.b2', 40],
    ],
  )
  assert.equal(validate(d), null)
  const cols = [...new Set(d.cells.flatMap((row: any[]) => row.flatMap((c, k) => (own(c) ? [k] : []))))]
  assert.deepEqual([cols.length, d.expect.bars[2].lanes], [2, 2])
  const cut = (keep: (k: number) => boolean) => ({
    ...d,
    cells: d.cells.map((row: any[]) => row.map((c, k) => (own(c) && !keep(k) ? null : c))),
  })
  assert.deepEqual(validate(cut(() => false)), { reason: 'bar' }) // every cell of a positive bar deleted
  assert.deepEqual(validate(cut((k) => k !== cols.at(-1))), { reason: 'bar' }) // drawn one lane narrow
})

// Beyond the plan's tests. inks: each `${kind} ${role}` of d's cells, with the sorted owners that draw it. texts and
// labelled:
// the sorted owners of d's text cells, each once, and of its expect.labels. undef: whether a field, at any depth, is
// undefined.
const inks = (d: any) => {
  const m: Record<string, Set<string>> = {}
  for (const c of d.cells.flat()) {
    if (c) {
      ;(m[`${c.kind} ${c.role}`] ??= new Set()).add(c.owners[0])
    }
  }

  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, [...v].sort()]))
}
const texts = (d: any) =>
  [...new Set(d.cells.flat().flatMap((c: any) => (c?.kind === 'text' ? [c.owners[0]] : [])))].sort()
const labelled = (d: any) => d.expect.labels.map((l: any) => l.owner).sort()
const undef = (x: unknown): boolean =>
  typeof x === 'object' && x !== null && Object.values(x).some((v) => v === undefined || undef(v))
const bars = (axis: string, es: [string, number][]) =>
  es.map(([owner, eighths]) => ({ owner, eighths, axis, lanes: 1 }))
const unplaced = (bs: any[]) => bs.map(({ at: _, ...b }) => b) // a bar's at is checked by validate-places
test('A4: vertical sub-columns in source order, the leftover blank; tag and name in the gutter; the y-axis title above, the x-axis title below', () => {
  const r = X(
    'xychart-beta\nx-axis Month [march, april]\ny-axis Units 0 --> 10\nline Plan [10, 4]\nbar [6, 0]\nbar Other [3, 10]\nline [1, 5]',
    80,
  )
  const d = r.drawing
  assert.equal(r.step, 'natural')
  assert.deepEqual(text(d), [
    'Units',
    '     10 ┤ ●       █',
    '        │         █',
    '        │         █',
    '        │  ▆      █',
    '      5 ┤  █    ● █◆',
    '        │  █▃     █',
    '        │  ██     █',
    '        │  ██◆    █',
    '      0 └─┬─────┬────',
    '          march april',
    'Month',
    '● Plan       10     4',
    'a             6     0',
    'b Other       3    10',
    '◆             1     5',
  ])
  assert.deepEqual(inks(d), {
    'text label': ['c0', 'c1', 'x0', 'x1', 'x2', 'x3', 'xTitle', 'yTitle'],
    'cap frame': ['axis'],
    'cap s1': ['x0:mark'],
    'cap s2': ['x1.b0'],
    'cap s3': ['x2.b0', 'x2.b1'],
    'cap s4': ['x3:mark'],
    'text value': [
      'axis.t0',
      'axis.t1',
      'axis.t2',
      'x0.v0',
      'x0.v1',
      'x1.v0',
      'x1.v1',
      'x2.v0',
      'x2.v1',
      'x3.v0',
      'x3.v1',
    ],
  })
  assert.deepEqual(
    unplaced(d.expect.bars),
    bars('v', [
      ['x1.b0', 38],
      ['x1.b1', 0],
      ['x2.b0', 19],
      ['x2.b1', 64],
    ]),
  )
  assert.deepEqual(labelled(d), texts(d))
  assert.equal(undef(d), false)
})
test('A4: horizontal: the x-axis title above, the y-axis title under the ticks, then a legend of the named series', () => {
  const r = X(
    'xychart horizontal\ntitle Revenue\nx-axis Quarter [2023, 2024]\ny-axis Share 0 --> 100\nbar North [20, 75]\nbar [50, 10]\nline Trend [30, 60]',
    40,
  )
  const d = r.drawing
  const row = (head: string, field: string, v: string) => head + field.padEnd(30) + ' ' + v
  assert.equal(r.step, 'natural')
  assert.deepEqual(text(d), [
    'Revenue',
    'Quarter',
    row('2023 a ', '█'.repeat(6), '20'),
    row('     b ', '█'.repeat(15), '50'),
    row('     ● ', '●'.padStart(10), '30'),
    row('2024 a ', '█'.repeat(22) + '▌', '75'),
    row('     b ', '███', '10'),
    row('     ● ', '●'.padStart(19), '60'),
    ' '.repeat(7) + '┬' + '─'.repeat(28) + '┬',
    ' '.repeat(7) + '0' + ' '.repeat(26) + '100',
    'Share',
    'a North',
    '● Trend',
  ])
  assert.deepEqual(inks(d), {
    'text title': ['title'],
    'text label': ['c0', 'c1', 'x0', 'x2', 'xTitle', 'yTitle'],
    'cap label': ['x0:mark', 'x1:mark', 'x2:mark'],
    'cap s1': ['x0.b0', 'x0.b1'],
    'cap s2': ['x1.b0', 'x1.b1'],
    'cap s3': ['x2:mark'],
    'cap frame': ['axis'],
    'text value': ['axis.t0', 'axis.t1', 'x0.v0', 'x0.v1', 'x1.v0', 'x1.v1', 'x2.v0', 'x2.v1'],
  })
  assert.deepEqual(
    unplaced(d.expect.bars),
    bars('h', [
      ['x0.b0', 48],
      ['x0.b1', 180],
      ['x1.b0', 120],
      ['x1.b1', 24],
    ]),
  )
  assert.deepEqual(labelled(d), texts(d))
  assert.equal(undef(d), false)
})
test("A4.fit-ladder: wrap: a category's later pieces take the rows below, past its series rows; a legend row wraps indented under its text", () => {
  const r = X(
    'xychart-beta\nx-axis Place ["far south east", north]\ny-axis Count\nbar "Units sold in total" [1, 2]',
    20,
  )
  assert.equal(r.step, 'wrap')
  assert.deepEqual(text(r.drawing), [
    'Place',
    'far   a █████      1',
    'south',
    'east',
    'north a ██████████ 2',
    ' '.repeat(8) + '┬' + '─'.repeat(8) + '┬',
    ' '.repeat(8) + '0' + ' '.repeat(8) + '2',
    'Count',
    'a Units sold in',
    '  total',
  ])
})
test("A4.fit-ladder: a vertical header's ladder is natural, horizontal, wrap; a horizontal header's natural, wrap; a step off it fails step", () => {
  const M = (src: string) => xychart.parse(readSource(src) as any) as any
  const v = M('xychart-beta\nbar [1]')
  const h = M('xychart horizontal\nbar [1]')
  assert.deepEqual(
    [xychart.steps(v), xychart.steps(h)],
    [
      ['natural', 'horizontal', 'wrap'],
      ['natural', 'wrap'],
    ],
  )
  for (const [m, step] of [
    [v, 'tight'],
    [v, 'keyed'],
    [h, 'horizontal'],
    [h, 'tight'],
  ] as const) {
    assert.deepEqual(xychart.layout(m, step, 80), { reason: 'step' }, step)
  }
})
test('A4.fit-ladder: horizontal fails too-wide when y0 and y1, with a space between them, are wider than W', () => {
  const S = 'xychart-beta horizontal\ny-axis 0 --> 1000000000\nbar [1]'
  const r = X(S, 17)
  assert.equal(r.step, 'natural')
  assert.deepEqual(text(r.drawing), [' a' + ' '.repeat(14) + '1', '   ┬' + '─'.repeat(10) + '┬', '   0 1000000000'])
  assert.deepEqual(X(S, 16), { reason: 'too-wide' })
})
test('A4: an explicit bound prints as written; a computed bound and the midpoint print as the shortest exact decimal', () => {
  const ticks = (src: string) => {
    const t = text(X(src, 80).drawing)
    return [t[0], t[4], t[8]].map((l) => l!.trim().split(' ')[0])
  }
  assert.deepEqual(ticks('xychart-beta\ny-axis 0.50 --> +2.0\nline [1, 1.5]'), ['+2.0', '1.25', '0.50'])
  assert.deepEqual(ticks('xychart-beta\nline [0, 2.50]'), ['2.5', '1.25', '0'])
})
// From QA: a horizontal point is placed from y0, not from 0: with y-axis 10 --> 20, the values 10, 15 and 20 sit at
// field cells 0, 9 and 18 (W = 19), after the tag column.
test('A4: horizontal points sit at cellOf(v − y0, M, W) when y0 is not 0', () => {
  const t = text(X('xychart-beta horizontal\ny-axis 10 --> 20\nline [10, 15, 20]', 25).drawing)
  assert.deepEqual(
    t.slice(0, 3).map((l) => l.lastIndexOf('●') - 3),
    [0, 9, 18],
  )
})
