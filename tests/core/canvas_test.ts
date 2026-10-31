import test from 'node:test'
import assert from 'node:assert/strict'
import { createCanvas } from '../../core/canvas.ts'
import type { Cell, Drawing } from '../../core/canvas.ts'
import { CAPS } from '../../core/caps.ts'
import { GLYPHS } from '../../core/glyphs.ts'
const E = { labels: [], edges: [], edgeLabels: [], frames: [] }
test('A5.mutation-tests: wide text takes two cells; shared lines merge into junctions', () => {
  const c = createCanvas(3, 6, 6, (a, b) => a.split('>')[0] === b.split('>')[0])
  assert.equal(c.text(0, 0, '中a', 'label', 'n1'), 3)
  c.line(1, 1, 10, 'light', 'edge', 'A>B')
  c.line(1, 1, 4, 'light', 'edge', 'A>C')
  const d = c.toDrawing(E)
  assert.equal(d.cells[0]![1]!.kind, 'cont')
  assert.equal(d.cells[1]![1]!.ch, '┬')
  assert.deepEqual(d.conflicts, [])
})
test('A5.mutation-tests: unrelated owners cross only perpendicular; text is exclusive', () => {
  const c = createCanvas(3, 6, 6)
  c.line(1, 2, 10, 'light', 'edge', 'e1')
  c.line(1, 2, 5, 'light', 'edge', 'e2')
  c.line(2, 2, 6, 'light', 'edge', 'e3')
  c.line(2, 2, 10, 'light', 'edge', 'e4')
  c.text(0, 0, 'ab', 'label', 'n1')
  c.text(0, 1, 'x', 'label', 'n2')
  const d = c.toDrawing(E)
  assert.equal(d.cells[1]![2]!.ch, '┼')
  assert.equal(d.conflicts.length, 2)
})
test('A5.mutation-tests: a combining mark joins its base cell; arms merge into rule-12 mixed glyphs; unrelated meetings conflict', () => {
  const c = createCanvas(4, 8, 8, (a, b) => a.split('>')[0] === b.split('>')[0])
  assert.equal(c.text(0, 0, 'e\u{301}x', 'label', 'n1'), 2)
  c.line(2, 2, 5, 'heavy', 'edge', 'e1')
  c.line(2, 2, 10, 'light', 'edge', 'e2')
  c.line(1, 1, 5, 'heavy', 'edge', 'A>B')
  c.line(1, 1, 2, 'light', 'edge', 'A>C')
  c.line(3, 5, 5, 'heavy', 'edge', 'P>Q')
  c.line(3, 5, 6, 'light', 'edge', 'R>S')
  const d = c.toDrawing(E)
  assert.equal(d.cells[0]![0]!.ch, 'e\u{301}')
  assert.equal(d.cells[2]![2]!.ch, '╂')
  assert.equal(d.cells[1]![1]!.ch, '┠')
  assert.equal(d.conflicts.length, 1)
})

// Owners 'A>B' and 'A>C' leave the same node, so their lines may merge.
const fromSameNode = (a: string, b: string) => a.split('>')[0] === b.split('>')[0]
// Each row as a string: a cell's ch, or a space for an empty cell. A cont cell's ch is ''.
const rows = (d: Drawing) => d.cells.map((row) => row.map((x) => x?.ch ?? ' ').join(''))
// The Conflict a write logs at row, col outside the grid.
const outside = (row: number, col: number, by: string) => ({ row, col, had: 'out-of-bounds', by })
// Each row's keys: a write outside the grid must neither grow a row nor add a key such as '-1'.
const keys = (d: Drawing) => d.cells.map((row) => Object.keys(row))

// か + U+3099 COMBINING KATAKANA-HIRAGANA VOICED SOUND MARK (Mn) is が in NFD: 2 columns. U+200B is ZWSP.
test("A4: a zero-width character joins the lead cell before it, never a W/F character's cont cell, and takes no column", () => {
  const c = createCanvas(2, 4, 4)
  assert.equal(c.text(0, 0, 'か\u{3099}x', 'label', 'n1'), 3)
  assert.equal(c.text(1, 0, 'a\u{200B}b', 'label', 'n2'), 2)
  const d = c.toDrawing(E)
  assert.deepEqual(d.cells[0], [
    { ch: 'か\u{3099}', role: 'label', kind: 'text', owners: ['n1'], dirs: 0 },
    { ch: '', role: 'label', kind: 'cont', owners: ['n1'], dirs: 0 },
    { ch: 'x', role: 'label', kind: 'text', owners: ['n1'], dirs: 0 },
    null,
  ])
  assert.deepEqual(d.cells[1], [
    { ch: 'a\u{200B}', role: 'label', kind: 'text', owners: ['n2'], dirs: 0 },
    { ch: 'b', role: 'label', kind: 'text', owners: ['n2'], dirs: 0 },
    null,
    null,
  ])
})
test('A4: a zero-width character joins only a cell its own call wrote: with no base it drops, and after a refused base the kept cell is untouched', () => {
  const c = createCanvas(1, 4, 4)
  c.text(0, 0, 'ab', 'label', 'n1')
  assert.equal(c.text(0, 2, '\u{301}c', 'label', 'n2'), 1)
  assert.equal(c.text(0, 1, 'x\u{301}', 'label', 'n3'), 1)
  const d = c.toDrawing(E)
  assert.deepEqual(d.cells[0], [
    { ch: 'a', role: 'label', kind: 'text', owners: ['n1'], dirs: 0 },
    { ch: 'b', role: 'label', kind: 'text', owners: ['n1'], dirs: 0 },
    { ch: 'c', role: 'label', kind: 'text', owners: ['n2'], dirs: 0 },
    null,
  ])
  assert.deepEqual(d.conflicts, [{ row: 0, col: 1, had: 'n1', by: 'n3' }])
})
test('A5.mutation-tests: join rides on the first text cell only; each cell of an owner-list write lists every owner, and the first owns the text', () => {
  const c = createCanvas(2, 4, 4)
  assert.equal(c.text(0, 0, '中b', 'label', ['L1', 'e1'], ' '), 3)
  c.text(1, 0, 'ab', 'label', 'n1', '')
  c.text(1, 1, 'x', 'label', ['L2', 'e2'], '\n')
  const d = c.toDrawing(E)
  assert.deepEqual(d.cells[0], [
    { ch: '中', role: 'label', kind: 'text', owners: ['L1', 'e1'], dirs: 0, join: ' ' },
    { ch: '', role: 'label', kind: 'cont', owners: ['L1', 'e1'], dirs: 0 },
    { ch: 'b', role: 'label', kind: 'text', owners: ['L1', 'e1'], dirs: 0 },
    null,
  ])
  assert.deepEqual(d.cells[1], [
    { ch: 'a', role: 'label', kind: 'text', owners: ['n1'], dirs: 0, join: '' },
    { ch: 'b', role: 'label', kind: 'text', owners: ['n1'], dirs: 0 },
    null,
    null,
  ])
  assert.deepEqual(d.conflicts, [{ row: 1, col: 1, had: 'n1', by: 'L2' }])
})
test('A5.mutation-tests: a cont cell is exclusive like its lead cell; a conflict names owners[0] of the cell it hits and of the write', () => {
  const c = createCanvas(1, 3, 3)
  c.text(0, 0, '中', 'label', ['L1', 'e1'])
  c.text(0, 1, 'y', 'label', ['L2', 'e2'])
  const d = c.toDrawing(E)
  assert.deepEqual(d.cells[0], [
    { ch: '中', role: 'label', kind: 'text', owners: ['L1', 'e1'], dirs: 0 },
    { ch: '', role: 'label', kind: 'cont', owners: ['L1', 'e1'], dirs: 0 },
    null,
  ])
  assert.deepEqual(d.conflicts, [{ row: 0, col: 1, had: 'L1', by: 'L2' }])
})

test('A8.platforms: a straight dotted run draws ┄ or ┆; a dotted bend or branch takes the light glyph (rule 12)', () => {
  const c = createCanvas(4, 3, 3, fromSameNode)
  c.line(0, 0, 10, 'dotted', 'edge', 'e1')
  c.line(0, 1, 12, 'dotted', 'edge', 'e1')
  c.line(1, 1, 5, 'dotted', 'edge', 'e1')
  c.line(2, 1, 5, 'dotted', 'edge', 'A>B')
  c.line(2, 1, 8, 'dotted', 'edge', 'A>C')
  c.line(2, 0, 10, 'dotted', 'edge', 'A>C')
  c.line(3, 1, 5, 'dotted', 'edge', 'A>B')
  const d = c.toDrawing(E)
  assert.deepEqual(rows(d), ['┄┐ ', ' ┆ ', '┄┤ ', ' ┆ '])
  assert.deepEqual(d.cells[2]![1], {
    ch: '┤',
    role: 'edge',
    kind: 'line',
    owners: ['A>B', 'A>C'],
    dirs: 13,
    arms: '1011',
    style: 'dotted',
    segs: [
      { owner: 'A>B', dirs: 5 },
      { owner: 'A>C', dirs: 8 },
    ],
  })
  assert.deepEqual(d.conflicts, [])
})
// A cell stays dotted only while every line in it is dotted: otherwise it is no dotted run, and draws the glyph of its arms.
test('A8.platforms: a dotted run shared with a solid one draws solid in either order; dotted meeting heavy takes the mixed glyph', () => {
  const c = createCanvas(3, 1, 1, fromSameNode)
  c.line(0, 0, 10, 'dotted', 'edge', 'A>B')
  c.line(0, 0, 10, 'light', 'edge', 'A>C')
  c.line(1, 0, 10, 'light', 'edge', 'A>B')
  c.line(1, 0, 10, 'dotted', 'edge', 'A>C')
  c.line(2, 0, 8, 'dotted', 'edge', 'A>B')
  c.line(2, 0, 2, 'heavy', 'edge', 'A>C')
  const d = c.toDrawing(E)
  assert.deepEqual(rows(d), ['─', '─', '╼'])
  assert.deepEqual(
    d.cells.map((row) => row[0]!.style),
    ['light', 'light', 'heavy'],
  )
  assert.deepEqual(d.conflicts, [])
})
test('A5.mutation-tests: by default only the same owner shares a line cell: an edge merges its own bend, and another edge there conflicts', () => {
  const c = createCanvas(1, 2, 2)
  c.line(0, 0, 8, 'light', 'edge', 'e1')
  c.line(0, 0, 4, 'light', 'edge', 'e1')
  c.line(0, 1, 8, 'light', 'edge', 'e1')
  c.line(0, 1, 4, 'light', 'edge', 'e2')
  const d = c.toDrawing(E)
  assert.deepEqual(rows(d), ['┐╴'])
  assert.deepEqual(d.cells[0]![0]!.owners, ['e1'])
  assert.deepEqual(d.conflicts, [{ row: 0, col: 1, had: 'e1', by: 'e2' }])
})
test('A5.mutation-tests: unrelated owners cross only straight and perpendicular (┼ ╂ ┿ ╋); a T or two touching bends conflict', () => {
  const c = createCanvas(2, 4, 4)
  c.line(0, 0, 10, 'light', 'edge', 'e1')
  c.line(0, 0, 5, 'light', 'edge', 'e2')
  c.line(0, 1, 10, 'light', 'edge', 'e1')
  c.line(0, 1, 5, 'heavy', 'edge', 'e2')
  c.line(0, 2, 5, 'light', 'edge', 'e1')
  c.line(0, 2, 10, 'heavy', 'edge', 'e2')
  c.line(0, 3, 10, 'heavy', 'edge', 'e1')
  c.line(0, 3, 5, 'heavy', 'edge', 'e2')
  c.line(1, 0, 3, 'light', 'edge', 'e1')
  c.line(1, 0, 12, 'light', 'edge', 'e2')
  c.line(1, 1, 10, 'light', 'edge', 'e1')
  c.line(1, 1, 4, 'light', 'edge', 'e2')
  c.line(0, 0, 10, 'light', 'edge', 'e3')
  const d = c.toDrawing(E)
  assert.deepEqual(rows(d), ['┼╂┿╋', '└─  '])
  assert.deepEqual(d.cells[0]![0]!.owners, ['e1', 'e2'])
  assert.deepEqual(d.conflicts, [
    { row: 1, col: 0, had: 'e1', by: 'e2' },
    { row: 1, col: 1, had: 'e1', by: 'e2' },
    { row: 0, col: 0, had: 'e1', by: 'e3' },
  ])
})
test('A5.mutation-tests: one arm claimed with two weights is a conflict, even between owners that share a node; the same weight merges', () => {
  const c = createCanvas(3, 1, 1, fromSameNode)
  c.line(0, 0, 10, 'heavy', 'edge', 'A>B')
  c.line(0, 0, 6, 'light', 'edge', 'A>C')
  c.line(1, 0, 10, 'dotted', 'edge', 'A>B')
  c.line(1, 0, 2, 'heavy', 'edge', 'A>C')
  c.line(2, 0, 10, 'light', 'edge', 'A>B')
  c.line(2, 0, 6, 'light', 'edge', 'A>C')
  const d = c.toDrawing(E)
  assert.deepEqual(rows(d), ['━', '┄', '┬'])
  assert.deepEqual(d.cells[2]![0]!.owners, ['A>B', 'A>C'])
  assert.deepEqual(d.conflicts, [
    { row: 0, col: 0, had: 'A>B', by: 'A>C' },
    { row: 1, col: 0, had: 'A>B', by: 'A>C' },
  ])
})
test('A5.mutation-tests: a merged line cell keeps its first role and style, lists each owner once, and ORs the dirs', () => {
  const c = createCanvas(1, 1, 1, fromSameNode)
  c.line(0, 0, 10, 'heavy', 'edge', 'A>B')
  c.line(0, 0, 4, 'light', 'value', 'A>C')
  c.line(0, 0, 2, 'heavy', 'value', 'A>B')
  const d = c.toDrawing(E)
  assert.deepEqual(d.cells[0]![0], {
    ch: '┯',
    role: 'edge',
    kind: 'line',
    owners: ['A>B', 'A>C'],
    dirs: 14,
    arms: '0212',
    style: 'heavy',
    segs: [
      { owner: 'A>B', dirs: 10 },
      { owner: 'A>C', dirs: 4 },
    ],
  })
  assert.deepEqual(d.conflicts, [])
})
// This shares looks up each owner's edge, as a renderer's might, and throws for an owner that has none.
test('A5.mutation-tests: a line on an exclusive cell conflicts before shares is asked; shares sees only line owners', () => {
  const edges = new Map([
    ['e', { from: 'A' }],
    ['f', { from: 'A' }],
  ])
  const seen: string[][] = []
  const c = createCanvas(3, 6, 6, (a, b) => {
    seen.push([a, b])
    return edges.get(a)!.from === edges.get(b)!.from
  })
  c.text(0, 0, 'A', 'label', 'A')
  c.cap(0, 1, '(', 'node', 'A')
  c.fill(0, 2, 1, 'node', 'A')
  c.arrow(0, 3, '►', 'e')
  c.text(0, 4, '中', 'label', 'B')
  c.frame(1, 0, 2, 2, 'frame', 'g1')
  c.lifeline(1, 3, false, 'p1')
  c.lifeline(2, 3, false, 'p1')
  for (let col = 0; col < 6; col++) {
    c.line(0, col, 10, 'light', 'edge', 'e')
  }
  c.line(1, 1, 10, 'light', 'edge', 'e')
  c.line(1, 1, 4, 'light', 'edge', 'f')
  c.line(1, 3, 5, 'light', 'edge', 'e')
  c.line(1, 3, 2, 'light', 'edge', 'f')
  const d = c.toDrawing(E)
  assert.deepEqual(rows(d), ['A( ►中', '┌┬┐├  ', '└─┘│  '])
  assert.deepEqual(seen, [
    ['e', 'f'],
    ['e', 'f'],
  ])
  assert.deepEqual(
    d.conflicts,
    ['A', 'A', 'A', 'e', 'B', 'B'].map((had, col) => ({ row: 0, col, had, by: 'e' })),
  )
})
// C>E shares only with C>D, the cell's second owner.
test('A5.mutation-tests: a line merges through any old owner it shares with, not only the first', () => {
  const c = createCanvas(1, 1, 1, fromSameNode)
  c.line(0, 0, 10, 'light', 'edge', 'A>B')
  c.line(0, 0, 5, 'light', 'edge', 'C>D')
  c.line(0, 0, 5, 'light', 'edge', 'C>E')
  const d = c.toDrawing(E)
  assert.deepEqual(d.cells[0]![0], {
    ch: '┼',
    role: 'edge',
    kind: 'line',
    owners: ['A>B', 'C>D', 'C>E'],
    dirs: 15,
    arms: '1111',
    style: 'light',
    segs: [
      { owner: 'A>B', dirs: 10 },
      { owner: 'C>D', dirs: 5 },
      { owner: 'C>E', dirs: 5 },
    ],
  })
  assert.deepEqual(d.conflicts, [])
})
test('A5.mutation-tests: cap, fill and arrow cells are exclusive: a later write, even a line of the same owner, is logged as {row,col,had,by}', () => {
  const c = createCanvas(1, 6, 6)
  c.cap(0, 0, '((', 'node', 'n1')
  c.fill(0, 2, 2, 'node', 'n1')
  c.arrow(0, 4, '►', 'e1')
  c.text(0, 1, 'x', 'label', 'n2')
  c.cap(0, 2, ')', 'node', 'n3')
  c.arrow(0, 0, '◄', 'e2')
  c.fill(0, 3, 3, 'node', 'n4')
  c.line(0, 4, 10, 'light', 'edge', 'e1')
  const d = c.toDrawing(E)
  assert.deepEqual(d.cells[0], [
    { ch: '(', role: 'node', kind: 'cap', owners: ['n1'], dirs: 0 },
    { ch: '(', role: 'node', kind: 'cap', owners: ['n1'], dirs: 0 },
    { ch: ' ', role: 'node', kind: 'fill', owners: ['n1'], dirs: 0 },
    { ch: ' ', role: 'node', kind: 'fill', owners: ['n1'], dirs: 0 },
    { ch: '►', role: 'arrow', kind: 'arrow', owners: ['e1'], dirs: 0 },
    { ch: ' ', role: 'node', kind: 'fill', owners: ['n4'], dirs: 0 },
  ])
  assert.deepEqual(d.conflicts, [
    { row: 0, col: 1, had: 'n1', by: 'n2' },
    { row: 0, col: 2, had: 'n1', by: 'n3' },
    { row: 0, col: 0, had: 'n1', by: 'e2' },
    { row: 0, col: 3, had: 'n1', by: 'n4' },
    { row: 0, col: 4, had: 'e1', by: 'n4' },
    { row: 0, col: 4, had: 'e1', by: 'e1' },
  ])
})
test('A5.mutation-tests: a frame draws only into empty cells; its title is text the frame id owns; a line or text on a frame replaces it', () => {
  const c = createCanvas(4, 8, 8)
  c.line(1, 7, 10, 'light', 'edge', 'e1')
  c.text(2, 0, 'n', 'label', 'n1')
  c.frame(0, 0, 3, 7, 'frame', 'g1', 'Go')
  c.line(3, 3, 5, 'light', 'edge', 'e2')
  const d = c.toDrawing(E)
  assert.deepEqual(rows(d), ['┌─Go───┐', '│      ─', 'n      │', '└──│───┘'])
  assert.deepEqual(d.cells[0]!.slice(0, 3), [
    { ch: '┌', role: 'frame', kind: 'frame', owners: ['g1'], dirs: 6 },
    { ch: '─', role: 'frame', kind: 'frame', owners: ['g1'], dirs: 10 },
    { ch: 'G', role: 'frame', kind: 'text', owners: ['g1'], dirs: 0 },
  ])
  assert.deepEqual([d.cells[1]![7]!.owners, d.cells[2]![0]!.owners, d.cells[3]![3]!.owners], [['e1'], ['n1'], ['e2']])
  assert.deepEqual(d.conflicts, [])
})
test('A5.mutation-tests: a lifeline is │ or ┃ in empty cells only; a line or text on a lifeline replaces it without a conflict', () => {
  const c = createCanvas(5, 3, 3)
  c.line(0, 1, 10, 'light', 'edge', 'e1')
  for (let r = 0; r < 4; r++) {
    c.lifeline(r, 1, false, 'p1')
  }
  c.lifeline(4, 1, true, 'p1')
  c.line(1, 1, 10, 'heavy', 'edge', 'm1')
  c.text(2, 1, 'x', 'label', 'L1')
  const d = c.toDrawing(E)
  assert.deepEqual(rows(d), [' ─ ', ' ━ ', ' x ', ' │ ', ' ┃ '])
  assert.deepEqual(d.cells[3]![1], { ch: '│', role: 'note', kind: 'lifeline', owners: ['p1'], dirs: 5 })
  assert.deepEqual(d.cells[4]![1], { ch: '┃', role: 'note', kind: 'lifeline', owners: ['p1'], dirs: 5 })
  assert.deepEqual([d.cells[0]![1]!.owners, d.cells[1]![1]!.owners, d.cells[2]![1]!.owners], [['e1'], ['m1'], ['L1']])
  assert.deepEqual(d.conflicts, [])
})
// Text and cont cells hold source text, which rule 12 does not limit; every other cell holds a drawn glyph.
test('A8.platforms: every glyph a busy canvas draws outside text is in GLYPHS: it comes from boxGlyph, junction or CAPS', () => {
  const c = createCanvas(6, 14, 14, fromSameNode)
  c.frame(0, 0, 5, 9, 'frame', 'g1', 'G')
  for (let r = 1; r < 5; r++) {
    c.lifeline(r, 11, false, 'p1')
    c.lifeline(r, 13, true, 'p2')
  }
  c.cap(1, 2, CAPS.round[0], 'node', 'A')
  c.fill(1, 3, 1, 'node', 'A')
  c.text(1, 4, '中', 'label', 'A')
  c.fill(1, 6, 1, 'node', 'A')
  c.cap(1, 7, CAPS.round[1], 'node', 'A')
  c.line(2, 4, 5, 'heavy', 'edge', 'A>B')
  c.line(3, 4, 5, 'heavy', 'edge', 'A>B')
  c.arrow(4, 4, CAPS.arrowD[1], 'A>B')
  c.line(3, 4, 2, 'light', 'edge', 'A>C')
  c.line(3, 5, 10, 'light', 'edge', 'A>C')
  c.line(3, 6, 10, 'light', 'edge', 'A>C')
  c.line(3, 7, 10, 'light', 'edge', 'A>C')
  c.arrow(3, 8, CAPS.arrowR[1], 'A>C')
  c.line(2, 6, 5, 'dotted', 'edge', 'e3')
  c.line(3, 6, 5, 'dotted', 'edge', 'e3')
  c.line(4, 6, 3, 'dotted', 'edge', 'e3')
  c.line(4, 7, 10, 'dotted', 'edge', 'e3')
  c.arrow(4, 8, CAPS.arrowR[1], 'e3')
  for (let col = 9; col < 12; col++) {
    c.line(2, col, 10, 'heavy', 'edge', 'm1')
  }
  c.arrow(2, 12, CAPS.arrowR[1], 'm1')
  const d = c.toDrawing(E)
  const drawn = d.cells.flat().filter((x): x is Cell => x !== null && x.kind !== 'text' && x.kind !== 'cont')
  for (const x of drawn) {
    assert.ok(GLYPHS.has(x.ch), `${x.kind} ${x.ch}`)
  }
  assert.deepEqual(new Set(drawn.map((x) => x.kind)), new Set(['frame', 'lifeline', 'line', 'arrow', 'cap', 'fill']))
  assert.deepEqual(rows(d), [
    '┌─G──────┐    ',
    '│ ( 中 ) │ │ ┃',
    '│   ┃ ┆  ━━━►┃',
    '│   ┠─┼─►│ │ ┃',
    '│   ▼ └┄►│ │ ┃',
    '└────────┘    ',
  ])
  assert.deepEqual(d.conflicts, [])
})
// The canvas does not clip to the budget: the validator's overlong-row check needs a row that can be too wide.
test('A5.mutation-tests: toDrawing reports the column budget, not the grid width, with the cells, the conflict log and the expect it was given', () => {
  const c = createCanvas(1, 3, 2)
  const ex = { labels: [{ owner: 'n1', text: 'abc' }], edges: [], edgeLabels: [], frames: [] }
  assert.equal(c.text(0, 0, 'abc', 'label', 'n1'), 3)
  assert.deepEqual(c.toDrawing(ex), {
    columns: 2,
    cells: [
      [
        { ch: 'a', role: 'label', kind: 'text', owners: ['n1'], dirs: 0 },
        { ch: 'b', role: 'label', kind: 'text', owners: ['n1'], dirs: 0 },
        { ch: 'c', role: 'label', kind: 'text', owners: ['n1'], dirs: 0 },
      ],
    ],
    conflicts: [],
    expect: ex,
  })
})
test('A5.mutation-tests: text outside the grid on any side, or a W/F character whose cont cell falls past the last column, is a Conflict; the grid keeps its size', () => {
  const c = createCanvas(2, 2, 2)
  const used = [
    c.text(-1, 0, 'a', 'label', 'n1'),
    c.text(2, 1, 'a', 'label', 'n2'),
    c.text(0, -1, 'ab', 'label', 'n3'),
    c.text(1, 1, 'ab', 'label', ['L1', 'e1']),
    c.text(0, 1, '中', 'label', 'n4'),
  ]
  const d = c.toDrawing(E)
  assert.deepEqual(used, [1, 1, 2, 2, 2])
  assert.deepEqual(keys(d), [
    ['0', '1'],
    ['0', '1'],
  ])
  assert.deepEqual(d.cells, [
    [
      { ch: 'b', role: 'label', kind: 'text', owners: ['n3'], dirs: 0 },
      { ch: '中', role: 'label', kind: 'text', owners: ['n4'], dirs: 0 },
    ],
    [null, { ch: 'a', role: 'label', kind: 'text', owners: ['L1', 'e1'], dirs: 0 }],
  ])
  assert.deepEqual(d.conflicts, [
    outside(-1, 0, 'n1'),
    outside(2, 1, 'n2'),
    outside(0, -1, 'n3'),
    outside(1, 2, 'L1'),
    outside(0, 2, 'n4'),
  ])
})
test('A5.mutation-tests: a line, cap, fill, arrow or lifeline cell outside the grid on any side is a Conflict; the grid keeps its size', () => {
  const c = createCanvas(2, 2, 2)
  for (let col = -1; col <= 2; col++) {
    c.line(0, col, 10, 'light', 'edge', 'e1')
  }
  for (let row = -1; row <= 2; row++) {
    c.line(row, 1, 5, 'heavy', 'edge', 'e2')
  }
  const sides = [
    [-1, 0],
    [2, 0],
    [0, -1],
    [0, 2],
  ] as const // above, below, left of and right of the grid
  for (const [r, col] of sides) {
    c.cap(r, col, '(', 'node', 'n1')
    c.fill(r, col, 1, 'node', 'n2')
    c.arrow(r, col, '►', 'e3')
    c.lifeline(r, col, false, 'p1')
  }
  const d = c.toDrawing(E)
  assert.deepEqual(keys(d), [
    ['0', '1'],
    ['0', '1'],
  ])
  assert.deepEqual(rows(d), ['─╂', ' ┃'])
  assert.deepEqual(d.conflicts, [
    outside(0, -1, 'e1'),
    outside(0, 2, 'e1'),
    outside(-1, 1, 'e2'),
    outside(2, 1, 'e2'),
    ...sides.flatMap(([r, col]) => ['n1', 'n2', 'e3', 'p1'].map((by) => outside(r, col, by))),
  ])
})
// g1 sticks out above and left of the grid, g2 below and right of it.
test('A5.mutation-tests: a frame or title cell outside the grid on any side is a Conflict, its cells inside are drawn, and the grid keeps its size', () => {
  const c = createCanvas(2, 4, 4)
  c.frame(-1, -1, 1, 1, 'frame', 'g1', 'T')
  c.frame(0, 2, 2, 4, 'frame', 'g2')
  const d = c.toDrawing(E)
  assert.deepEqual(keys(d), [
    ['0', '1', '2', '3'],
    ['0', '1', '2', '3'],
  ])
  assert.deepEqual(rows(d), [' │┌─', '─┘│ '])
  assert.deepEqual(d.conflicts, [
    outside(-1, 0, 'g1'),
    outside(0, -1, 'g1'),
    outside(-1, -1, 'g1'),
    outside(-1, 1, 'g1'),
    outside(1, -1, 'g1'),
    outside(-1, 1, 'g1'),
    outside(2, 3, 'g2'),
    outside(1, 4, 'g2'),
    outside(0, 4, 'g2'),
    outside(2, 2, 'g2'),
    outside(2, 4, 'g2'),
  ])
})
test('A5.mutation-tests: a write at a non-integer row or column is outside the grid too: a Conflict, never a throw', () => {
  const c = createCanvas(1, 1, 1)
  c.text(0.5, 0, 'a', 'label', 'n1')
  c.line(0, 0.5, 10, 'light', 'edge', 'e1')
  const d = c.toDrawing(E)
  assert.deepEqual(keys(d), [['0']])
  assert.deepEqual(d.conflicts, [outside(0.5, 0, 'n1'), outside(0, 0.5, 'e1')])
})
// Edges into one node may end in one head: an arrow on an arrow of the same glyph merges owners when shares holds for an old
// owner. Another glyph, or an edge that shares nothing with the old owners, conflicts.
test('A5.mutation-tests: an arrow on a same-glyph arrow of an edge it shares with merges owners; another glyph or an unrelated edge conflicts', () => {
  const c = createCanvas(1, 3, 3, (a, b) => a.split('>')[1] === b.split('>')[1])
  c.arrow(0, 0, '▼', 'A>C')
  c.arrow(0, 0, '▼', 'B>C')
  c.arrow(0, 1, '▼', 'A>C')
  c.arrow(0, 1, '▲', 'B>C')
  c.arrow(0, 2, '▼', 'A>C')
  c.arrow(0, 2, '▼', 'B>D')
  const d = c.toDrawing(E)
  assert.deepEqual(d.cells[0]![0], { ch: '▼', role: 'arrow', kind: 'arrow', owners: ['A>C', 'B>C'], dirs: 0 })
  assert.deepEqual(d.conflicts, [
    { row: 0, col: 1, had: 'A>C', by: 'B>C' },
    { row: 0, col: 2, had: 'A>C', by: 'B>D' },
  ])
})
// Beside the union dirs and owners, a line cell keeps the dirs each owner drew there, OR-merged per owner in write order,
// so the validator can tell a crossing from a turn that shares its glyph.
test('A5.mutation-tests: a line cell records the dirs each owner drew there', () => {
  const c = createCanvas(1, 2, 2, (a, b) => a[0] === b[0])
  c.line(0, 0, 3, 'light', 'edge', 'e1')
  c.line(0, 0, 12, 'light', 'edge', 'e2')
  c.line(0, 0, 4, 'light', 'edge', 'e1')
  c.line(0, 1, 5, 'light', 'edge', 'x')
  c.line(0, 1, 10, 'heavy', 'edge', 'y')
  const [a, b] = c.toDrawing(E).cells[0]!
  assert.deepEqual(
    [a!.dirs, a!.owners, a!.segs],
    [
      15,
      ['e1', 'e2'],
      [
        { owner: 'e1', dirs: 7 },
        { owner: 'e2', dirs: 12 },
      ],
    ],
  )
  assert.deepEqual(
    [b!.dirs, b!.owners, b!.segs],
    [
      15,
      ['x', 'y'],
      [
        { owner: 'x', dirs: 5 },
        { owner: 'y', dirs: 10 },
      ],
    ],
  )
})

test("X3.emphasis: text turns each marker into the em of the cell it styles; a wide character's cont cell has none", async () => {
  const { emphasize } = await import('../../core/emphasis.ts')
  const c = createCanvas(1, 8, 8)
  assert.equal(c.text(0, 0, emphasize('**中**a _b_')!, 'label', 'n1'), 5)
  const d = c.toDrawing(E)
  assert.deepEqual(
    d.cells[0]!.map((x) => x && [x.ch, x.em ?? 0]),
    [['中', 1], ['', 0], ['a', 0], [' ', 0], ['b', 2], null, null, null],
  )
})
