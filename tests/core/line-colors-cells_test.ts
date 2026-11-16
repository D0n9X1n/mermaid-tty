// Crossing edges' colors, pinned on drawings built cell by cell: which color each edge takes, which edges take none,
// and which cells keep their role's color. tests/core/line-colors_test.ts checks the same on drawings Mermaid draws.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createCanvas, type Canvas, type Drawing } from '../../core/canvas.ts'
import { lineColors } from '../../core/line-colors.ts'
import { toRows } from '../../core/render.ts'
import { THEMES } from '../../core/themes.ts'

const nord = THEMES.nord
const V = 5 // up | down
const H = 10 // left | right

// A drawing of the edges ids, drawn by draw on a 9 × 9 canvas. Edges may merge on a cell, as edges that share an end
// do, so an arrowhead or trunk two of them draw holds both as owners.
function build(ids: readonly string[], draw: (c: Canvas) => void): Drawing {
  const c = createCanvas(9, 9, 9, () => true)
  draw(c)
  return c.toDrawing({
    labels: [],
    edges: ids.map((id) => ({ id, from: `${id}0`, to: `${id}1`, ends: [{ node: `${id}1`, glyph: '▼' }] })),
    edgeLabels: [],
    frames: [],
  })
}
// A vertical edge down column col over rows from to to, and a horizontal one along row r over columns from to to.
const down = (c: Canvas, id: string, col: number, from: number, to: number) => {
  for (let r = from; r <= to; r++) {
    c.line(r, col, V, 'light', 'edge', id)
  }
}
const across = (c: Canvas, id: string, r: number, from: number, to: number) => {
  for (let col = from; col <= to; col++) {
    c.line(r, col, H, 'light', 'edge', id)
  }
}

// a, b and c each cross x; none crosses another. Listed x, a, b, c, they take colors in that order.
const COMB = build(['x', 'a', 'b', 'c'], (c) => {
  across(c, 'x', 4, 0, 8)
  down(c, 'a', 1, 0, 8)
  down(c, 'b', 4, 0, 8)
  down(c, 'c', 7, 0, 8)
})

test('A3: crossing edges take colors in the order the source lists them, each a new one while colors last', () => {
  const colors = lineColors(COMB, 4)

  assert.deepEqual(
    [...colors],
    [
      ['x', 0],
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ],
  )
})

test('A3: once colors run out, an edge takes the first color no edge it meets has', () => {
  // Two colors: x takes 0 and a takes 1; b and c meet only x, so each takes 1, the first x does not have.
  const colors = lineColors(COMB, 2)

  assert.deepEqual(
    [...colors],
    [
      ['x', 0],
      ['a', 1],
      ['b', 1],
      ['c', 1],
    ],
  )
})

test('A3: once colors run out, an edge takes the lowest color free to it, not just any', () => {
  // Three colors: x 0, a 1, b 2. c meets only x, so 1 and 2 are both free to it, and it takes 1.
  const colors = lineColors(COMB, 3)

  assert.deepEqual(
    [...colors],
    [
      ['x', 0],
      ['a', 1],
      ['b', 2],
      ['c', 1],
    ],
  )
})

// x crosses a, b and c; a and b also end at one arrowhead. Two colors: x takes 0 and a takes 1, both new. b meets x
// (0) by crossing and a (1) by the arrowhead, so no color is left for it and it stays plain; c meets only x, and takes 1.
const SHARED = build(['x', 'a', 'b', 'c'], (c) => {
  across(c, 'x', 4, 0, 8)
  down(c, 'a', 1, 0, 7)
  down(c, 'b', 3, 0, 7)
  down(c, 'c', 7, 0, 8)
  c.arrow(8, 2, '▼', 'a')
  c.arrow(8, 2, '▼', 'b')
  c.line(7, 1, 3, 'light', 'edge', 'a')
  c.line(7, 2, H, 'light', 'edge', 'a')
  c.line(7, 2, H, 'light', 'edge', 'b')
  c.line(7, 3, 9, 'light', 'edge', 'b')
})

test('A3: once colors run out, an edge never takes a color an edge it shares a cell with has', () => {
  const colors = lineColors(SHARED, 2)

  assert.deepEqual(
    [...colors],
    [
      ['x', 0],
      ['a', 1],
      ['c', 1],
    ],
  )
})

test('A3: a note link that crosses an edge takes no color, and the edge it alone crosses takes none either', () => {
  // A class note's link is routed like an edge but is not one a reader follows from source to target.
  const d = build(['e', 'n:link'], (c) => {
    across(c, 'e', 4, 0, 8)
    down(c, 'n:link', 4, 0, 8)
  })

  assert.deepEqual([...lineColors(d, 4)], [])
})

// x crosses a; both end at one shared arrowhead, and each has a label and a cardinality beside it.
const ENDS = build(['x', 'a'], (c) => {
  across(c, 'x', 4, 0, 6)
  down(c, 'a', 1, 0, 7)
  c.line(4, 7, 12, 'light', 'edge', 'x')
  c.line(5, 7, V, 'light', 'edge', 'x')
  c.line(6, 7, V, 'light', 'edge', 'x')
  c.line(7, 7, 9, 'light', 'edge', 'x')
  c.arrow(8, 1, '▼', 'a')
  c.text(0, 3, 'go', 'label', ['x:label', 'x'])
  c.text(2, 3, '1..*', 'arrow', ['a:head', 'a'])
})

// The color toRows draws the cell at row r, column col in.
const colorAt = (d: Drawing, r: number, col: number) => {
  let at = 0
  for (const span of toRows(d, nord)[r]!) {
    at += [...span.text].length
    if (at > col) {
      return span.color
    }
  }

  return undefined
}

test("A3: an edge's own end takes its color, but a label and a cardinality keep their roles' colors", () => {
  const colors = lineColors(ENDS, nord.lines.length)

  assert.equal(colorAt(ENDS, 8, 1), nord.lines[colors.get('a')!])
  assert.equal(colorAt(ENDS, 0, 3), nord.roles.label)
  assert.equal(colorAt(ENDS, 2, 3), nord.roles.arrow)
})

test('A3: an arrowhead two crossing edges share keeps the arrow color', () => {
  const d = build(['x', 'a'], (c) => {
    across(c, 'x', 4, 0, 8)
    down(c, 'a', 4, 0, 7)
    c.line(5, 8, V, 'light', 'edge', 'x')
    c.arrow(8, 4, '▼', 'a')
    c.arrow(8, 4, '▼', 'x')
  })

  assert.equal(lineColors(d, 4).size, 2)
  assert.equal(colorAt(d, 8, 4), nord.roles.arrow)
})

test('A3: every cell keeps its role; only the color of a crossing edge’s own line and end changes', () => {
  const plain = toRows(ENDS, { ...nord, lines: [] })

  const colored = toRows(ENDS, nord)

  const roles = (rows: typeof plain) => rows.map((row) => row.flatMap((s) => [...s.text].map(() => s.role)))
  assert.deepEqual(roles(colored), roles(plain))
})
