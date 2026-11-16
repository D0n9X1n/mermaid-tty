// Crossing edges, each in a color of its own: which edges cross, the color each gets, and the spans toRows draws.
import test from 'node:test'
import assert from 'node:assert/strict'
import { explain, toRows, type Span } from '../../core/render.ts'
import { createCanvas } from '../../core/canvas.ts'
import { lineColors } from '../../core/line-colors.ts'
import { THEMES } from '../../core/themes.ts'
import { isFail } from '../../core/fail.ts'
import type { Drawing } from '../../core/canvas.ts'

// A: drawn at 80 columns in nord, which must draw it.
const drawn = (source: string, columns = 80): Drawing => {
  const r = explain(source, { columns, theme: 'nord' })
  assert.ok(!isFail(r), `${source} fell back: ${isFail(r) ? r.reason : ''}`)
  return r.drawing
}
// Two sources each feed both targets, so A→D and B→C cross; the edges into each target share their last stretch.
const CROSS = 'flowchart TD\nA --> C\nA --> D\nB --> C\nB --> D'
const FAN = 'flowchart TD\nA --> B\nA --> C\nA --> D'
const nord = THEMES.nord

// Each pair of edges that cross, found as the code under test must find them: a line cell whose owners all draw
// straight through it, some up and down, some across.
const crossingPairs = (d: Drawing): [string, string][] => {
  const pairs = new Map<string, [string, string]>()
  for (const row of d.cells) {
    for (const cell of row) {
      const segs = cell?.kind === 'line' ? (cell.segs ?? []) : []
      if (!segs.length || !segs.every((s) => s.dirs === 5 || s.dirs === 10)) {
        continue
      }

      for (const v of segs.filter((s) => s.dirs === 5)) {
        for (const h of segs.filter((s) => s.dirs === 10)) {
          const pair = [v.owner, h.owner].sort() as [string, string]
          pairs.set(pair.join(' '), pair)
        }
      }
    }
  }

  return [...pairs.values()]
}
// Each drawn cell beside the color its span draws it in: a span covers one cell per column, a wide character's second
// cell skipped as toRows skips it.
const cellColors = (d: Drawing, rows: Span[][]) =>
  d.cells.flatMap((row, r) => {
    const cells = row.filter((c) => c?.kind !== 'cont')
    const colors = rows[r]!.flatMap((s) => [...s.text].map(() => s.color))
    return cells.map((cell, i) => ({ cell, color: colors[i] }))
  })
// The colors on the cells that draw edge id alone: its own line and arrow cells.
const colorsOf = (d: Drawing, rows: Span[][], id: string) =>
  new Set(
    cellColors(d, rows)
      .filter(({ cell }) => cell && (cell.kind === 'line' || cell.kind === 'arrow'))
      .filter(({ cell }) => new Set(cell!.owners).size === 1 && cell!.owners[0] === id)
      .map(({ color }) => color),
  )

test('A3: two edges that cross get two different line colors; their shared trunks get none', () => {
  const d = drawn(CROSS)

  const colors = lineColors(d, nord.lines.length)

  assert.deepEqual([...colors.keys()].sort(), ['L_A_D_0', 'L_B_C_0'])
  assert.notEqual(colors.get('L_A_D_0'), colors.get('L_B_C_0'))
})

test('A3: a drawing with no crossing colors no edge, and its rows are the same as before', () => {
  const d = drawn(FAN)

  const colors = lineColors(d, nord.lines.length)
  const rows = toRows(d, nord)

  assert.equal(colors.size, 0)
  for (const span of rows.flat()) {
    if (span.role === 'edge') {
      assert.equal(span.color, nord.roles.edge)
    }

    if (span.role === 'arrow') {
      assert.equal(span.color, nord.roles.arrow)
    }
  }
})

test("A3: each crossing edge's own cells draw in its line color, the crossing and shared cells in the edge color", () => {
  const d = drawn(CROSS)
  const colors = lineColors(d, nord.lines.length)

  const rows = toRows(d, nord)

  for (const id of ['L_A_D_0', 'L_B_C_0']) {
    assert.deepEqual([...colorsOf(d, rows, id)], [nord.lines[colors.get(id)!]])
  }

  const crossing = cellColors(d, rows).filter(({ cell }) => cell?.kind === 'line' && cell.ch === '┼')
  assert.ok(crossing.length > 0)
  assert.ok(crossing.every(({ color }) => color === nord.roles.edge))
})

// Six edges that cross in five places: no two edges that cross take the same color, while colors last.
const TANGLE = 'flowchart TD\nA --> E\nB --> D\nC --> D\nA --> F\nB --> F\nC --> E'

test('A3: two edges that cross each other never take the same color', () => {
  const d = drawn(TANGLE)

  const colors = lineColors(d, nord.lines.length)

  const pairs = crossingPairs(d)
  assert.ok(pairs.length >= 2)
  for (const [a, b] of pairs) {
    if (colors.has(a) && colors.has(b)) {
      assert.notEqual(colors.get(a), colors.get(b), `${a} and ${b} cross`)
    }
  }
})

// Two edges in one color read as one line that ends in two arrowheads, even where they never meet: while colors last,
// no two crossing edges share one.
test('A3: while the theme has colors left, every crossing edge takes a color no other has', () => {
  const d = drawn(TANGLE)

  const colors = lineColors(d, 8)

  assert.ok(colors.size >= 4)
  assert.equal(new Set(colors.values()).size, colors.size)
})

// When there are more crossing edges than colors, a color comes round again, but never to an edge that meets one in it.
test('A3: once colors run out, an edge takes a color again only if no edge it meets has it', () => {
  const d = drawn(TANGLE)

  const colors = lineColors(d, 3)

  assert.ok(colors.size > 3)
  for (const [a, b] of crossingPairs(d)) {
    if (colors.has(a) && colors.has(b)) {
      assert.notEqual(colors.get(a), colors.get(b), `${a} and ${b} cross`)
    }
  }
})

test('A3: an edge left with no free color stays plain rather than take a color an edge it crosses has', () => {
  const d = drawn(TANGLE)

  const colors = lineColors(d, 1)

  assert.ok(colors.size >= 1)
  for (const [a, b] of crossingPairs(d)) {
    assert.ok(!(colors.has(a) && colors.has(b)), `${a} and ${b} cross, and only one may have the one color`)
  }
})

test('A3: with no line colors, as in mono, no edge is colored and the rows carry no color', () => {
  const d = drawn(CROSS)

  const colors = lineColors(d, THEMES.mono.lines.length)
  const rows = toRows(d, THEMES.mono)

  assert.equal(colors.size, 0)
  assert.ok(rows.flat().every((s) => s.color === undefined && s.backgroundColor === undefined))
})

test('A3: a role stays as it was: only the color of an edge or arrow span changes', () => {
  const d = drawn(CROSS)

  const roles = toRows(d, nord).flatMap((row) => row.map((s) => s.role))
  const plain = toRows(d, { ...nord, lines: [] }).flatMap((row) => row.map((s) => s.role))

  assert.deepEqual(new Set(roles), new Set(plain))
})

// Four edges merged into one trunk, each sharing every cell it draws, crossed straight by an unrelated P→Q: only P→Q
// has a cell of its own to color, as in tests/core/validate-trunk_test.ts.
//   a ─┬─ b
//   p ─┼─►q
function trunk(): Drawing {
  const ends: Record<string, [string, string]> = {
    e1: ['A', 'C'],
    e2: ['A', 'D'],
    e3: ['B', 'C'],
    e4: ['B', 'D'],
    f: ['P', 'Q'],
  }
  const c = createCanvas(7, 6, 6, (a, b) => ends[a]!.some((x) => ends[b]!.includes(x)))
  const L = (r: number, col: number, dirs: number, ids: string[]) =>
    ids.forEach((id) => c.line(r, col, dirs, 'light', 'edge', id))
  L(1, 0, 3, ['e1', 'e2'])
  L(1, 1, 10, ['e1', 'e2'])
  L(1, 2, 12, ['e1', 'e2'])
  L(1, 2, 6, ['e3', 'e4'])
  L(1, 3, 10, ['e3', 'e4'])
  L(1, 4, 9, ['e3', 'e4'])
  L(2, 2, 5, ['e1', 'e2', 'e3', 'e4'])
  L(3, 2, 5, ['e1', 'e2', 'e3', 'e4'])
  L(2, 1, 10, ['f'])
  L(2, 2, 10, ['f'])
  L(2, 3, 10, ['f'])
  c.arrow(2, 4, '►', 'f')
  const node = (n: string) => ({ node: n, glyph: n === 'Q' ? '►' : '▼' })
  return c.toDrawing({
    labels: [],
    edges: Object.entries(ends).map(([id, [from, to]]) => ({ id, from, to, ends: [node(to)] })),
    edgeLabels: [],
    frames: [],
  })
}

test('A3: an edge with no cell of its own takes no color, so it never leaves a line that crosses it plain', () => {
  const d = trunk()

  const colors = lineColors(d, 3)
  const rows = toRows(d, nord)

  assert.deepEqual([...colors.keys()], ['f'])
  assert.deepEqual([...colorsOf(d, rows, 'f')], [nord.lines[0]])
})
