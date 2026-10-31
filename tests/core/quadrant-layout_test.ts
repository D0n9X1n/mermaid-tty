import test from 'node:test'
import assert from 'node:assert/strict'
import { explain } from '../../core/render.ts'
// text reads a title row from its first character; tests/core/title_test.ts checks the title is centered.
import { untitled as text } from './graph-fixture.ts'
const X = (body: string, columns: number) => explain(`quadrantChart\n${body}`, { columns, theme: 'mono' }) as any
const REACH = [
  'title Reach',
  'x-axis Low --> High',
  'y-axis Cold --> Hot',
  'quadrant-1 Expand',
  'quadrant-2 Promote',
  'quadrant-3 Rethink',
  'quadrant-4 Improve',
  'A: [0.3, 0.6]',
  'B: [0.45, 0.23]',
  'C: [0.78, 0.34]',
].join('\n')
const H = (l: string, m: string, r: string) => l + '─'.repeat(10) + m + '─'.repeat(10) + r
const C = (a: string, b: string) => '│' + a.padEnd(10) + '│' + b.padEnd(10) + '│'
const E = C('', '')
test('A4: the matrix sketch at q = 10: four quadrants, centered texts, point keys, axis texts and the legend', () => {
  const r = X(REACH, 23)
  assert.equal(r.step, 'natural')
  assert.deepEqual(text(r.drawing), [
    'Reach',
    '↑ Hot',
    H('┌', '┬', '┐'),
    C(' Promote', '  Expand'),
    E,
    E,
    E,
    C('      1', ''),
    E,
    H('├', '┼', '┤'),
    C(' Rethink', ' Improve'),
    E,
    C('', '     3'),
    C('         2', ''),
    E,
    E,
    H('└', '┴', '┘'),
    ' Low' + ' '.repeat(8) + 'High',
    '↓ Cold',
    '1 A (0.3, 0.6)',
    '2 B (0.45, 0.23)',
    '3 C (0.78, 0.34)',
  ])
})
test('A4.fit-ladder: a text wider than q keys every quadrant and x-axis text, in source order; q < 8 falls back', () => {
  const r = X(REACH.replace('Promote', 'Promote widely'), 23)
  const t = text(r.drawing)
  assert.equal(r.step, 'keyed')
  assert.deepEqual([t[3], t[17]], [C('    d', '    c'), ' a' + ' '.repeat(10) + 'b'])
  assert.deepEqual(t.slice(19, 25), ['a Low', 'b High', 'c Expand', 'd Promote widely', 'e Rethink', 'f Improve'])
  assert.deepEqual(X(REACH, 18), { reason: 'too-wide' })
})
test('A4: a point in or next to a key on its row joins that key; every point keeps its own legend row', () =>
  assert.deepEqual(text(X('A: [0.3, 0.6]\nB: [0.3, 0.6]\nC: [0.32, 0.6]\nA: [0.8, 0.2]', 80).drawing).slice(-4), [
    '1 A (0.3, 0.6)',
    '1 B (0.3, 0.6)',
    '1 C (0.32, 0.6)',
    '2 A (0.8, 0.2)',
  ]))
test('A5.errors: point styles, bad coordinates, a lone -->, repeats and a keyword-led name fall back', () => {
  for (const [body, why] of [
    ['A: [0.3, 0.6] radius: 12', 'syntax:2'],
    ['A: [1.2, 0.5]', 'syntax:2'],
    ['A: [1.0, 0.5]', 'syntax:2'],
    ['x-axis Low -->', 'syntax:2'],
    ['quadrant-1 A\nquadrant-1 B', 'repeat:3'],
    ['A: [0.3 0.6]', 'syntax:2'],
    ['Titled work: [0.3, 0.6]', 'syntax:2'],
  ] as const) {
    assert.deepEqual(X(body, 80), { reason: why }, body)
  }
})

// q = 30 at 80 columns: the left half is columns 1…30, the cross 31, the right half 32…61, the frame 62; with no title
// or y-axis, the top half's point rows are 2…6 and the bottom half's 9…13.
test('A4: a point sits at min(2q − 1, ⌊2q·x⌋), min(9, ⌊10·y⌋) from the bottom; coordinates print as written', () => {
  const t = text(X('A: [0.50, 1]\nB: [0, 0]\nC: [1, 0.5]', 80).drawing)
  assert.deepEqual([t[2]![32], t[13]![1], t[6]![61], t[6]![62]], ['1', '2', '3', '│'])
  assert.deepEqual(t.slice(-3), ['1 A (0.50, 1)', '2 B (0, 0)', '3 C (1, 0.5)'])
})
test("A5.mutation-tests: each point's key entry carries its plotted cell as at, after the title and ↑ rows", () =>
  assert.deepEqual(X(REACH, 23).drawing.expect.keys, [
    { key: '1', item: 'p0', cls: 'point', at: { r: 7, c: 7 } },
    { key: '2', item: 'p1', cls: 'point', at: { r: 13, c: 10 } },
    { key: '3', item: 'p2', cls: 'point', at: { r: 12, c: 17 } },
  ]))
test('A5.mutation-tests: a key that would run into the cross or the frame fails key-collision; one that ends before the cross draws', () => {
  const nine = Array.from({ length: 9 }, (_, i) => `P${i + 1}: [0.1, 0.${i + 1}]`).join('\n')
  for (const x of ['0.49', '0.99']) {
    assert.deepEqual(X(`${nine}\nJ: [${x}, 0]`, 80), { reason: 'key-collision' }, x)
  }

  assert.equal(text(X(`${nine}\nJ: [0.48, 0]`, 80).drawing)[13]!.slice(29, 32), '10│')
})
test('A4.fit-ladder: keyed fields follow the source, not the quadrant numbers', () => {
  const t = text(X('quadrant-2 Promote widely\nquadrant-1 Expand\nx-axis Low --> High', 23).drawing)
  assert.deepEqual([t[1], t[15]], [C('    a', '    b'), ' c' + ' '.repeat(10) + 'd'])
  assert.deepEqual(t.slice(16), ['a Promote widely', 'b Expand', 'c Low', 'd High'])
})
test('A4: y-axis texts wrap under their arrow like header rows; an absent text draws no row', () => {
  const t = text(X('y-axis Cold --> Very hot and getting hotter', 19).drawing)
  assert.deepEqual(
    [t.length, t[0], t[1], t[2], t.at(-1)],
    [18, '↑ Very hot and', '  getting hotter', '┌' + '─'.repeat(8) + '┬' + '─'.repeat(8) + '┐', '↓ Cold'],
  )
  const u = text(X('x-axis "Effort"\ny-axis "Value"', 80).drawing)
  assert.deepEqual([u.length, u[0]![0], u[15], u[16]], [17, '┌', ' Effort', '↓ Value'])
})
test('A5.errors: an entity, a keyword in another case or starting a longer word, a markdown string, .5, other styles and repeats fall back', () => {
  for (const [body, why] of [
    ['quadrant-1 "I #9829; it"', 'entity'],
    ['title I #9829; it', 'entity'],
    ['Title Reach', 'syntax:2'],
    ['titled Reach', 'syntax:2'],
    ['quadrant-1 Big titles', 'syntax:2'],
    ['X-AXIS Low', 'syntax:2'],
    ['quadrant-1 "`**A**`"', 'syntax:2'],
    ['A: [.5, 0.5]', 'syntax:2'],
    ['quadrant-5 A', 'syntax:2'],
    ['A: [0.9, 0.0] color: #ff3300', 'syntax:2'],
    ['A: [0.9, 0.0] stroke-width: 5px', 'syntax:2'],
    ['x-axis A\nx-axis B', 'repeat:3'],
    ['y-axis A\ny-axis B', 'repeat:3'],
    ['title A\ntitle B', 'repeat:3'],
  ] as const) {
    assert.deepEqual(X(body, 80), { reason: why }, body)
  }

  assert.deepEqual(explain('---\ntitle: A\n---\nquadrantChart\ntitle B', { columns: 80 }), { reason: 'repeat:5' })
  assert.deepEqual(explain('quadrantChart x\nA: [0.1, 0.1]', { columns: 80 }), { reason: 'header' })
})
test('A5: classDef, :::name, accTitle, accDescr and config are ignored; a frontmatter title heads the chart', () => {
  const src =
    '---\ntitle: Plan\nconfig:\n  quadrantChart:\n    chartWidth: 500\n---\nquadrantChart\naccTitle: T\naccDescr { one\n two }\n' +
    'classDef c1 color: #109060, radius : 10\nPoint A:::c1: [0.9, 0.0]'
  const t = text((explain(src, { columns: 30, theme: 'mono' }) as any).drawing)
  assert.deepEqual([t[0], t.at(-1)], ['Plan', '1 Point A (0.9, 0.0)'])
})
