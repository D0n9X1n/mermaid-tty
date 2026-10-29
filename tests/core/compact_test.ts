// compact (Q2a): a graph drawing without its slack, its pass-through rows and columns dropped, read as before but smaller.
import test from 'node:test'; import assert from 'node:assert/strict'
import { createCanvas } from '../../core/canvas.ts'
import type { Drawing } from '../../core/canvas.ts'
import { compact } from '../../core/graph/compact.ts'
import { drawGraph } from '../../core/graph/draw.ts'
import { layoutGraph } from '../../core/graph/layered.ts'
import type { Placed } from '../../core/graph/layered.ts'
import { routeGraph } from '../../core/graph/route.ts'
import type { Route } from '../../core/graph/route.ts'
import { width } from '../../core/width.ts'
import { g } from './graph-fixture.ts'

const E = { labels: [], edges: [], edgeLabels: [], frames: [] }
// Light line glyphs and their dirs (1 up, 2 right, 4 down, 8 left).
const DIRS: Readonly<Record<string, number>> = { '│': 5, '─': 10, '└': 3, '┌': 6, '┐': 12, '┘': 9, '├': 7, '┤': 13, '┬': 14, '┴': 11, '┼': 15 }
// A drawing from a picture: a line glyph is a cell of edge e, ▼ ► ▲ ◄ its heads, a space an empty cell, and any other
// character text of node n, a wide one taking two cells.
function picture(...rows: string[]): Drawing {
  const cv = createCanvas(rows.length, 40, 80)
  rows.forEach((row, r) => {
    let c = 0
    for (const ch of row) {
      const dirs = DIRS[ch]
      if (dirs !== undefined) cv.line(r, c, dirs, 'light', 'edge', 'e')
      else if ('▼►▲◄'.includes(ch)) cv.arrow(r, c, ch, 'e')
      else if (ch !== ' ') cv.text(r, c, ch, 'label', 'n')
      c += width(ch)
    }
  })
  return cv.toDrawing(E)
}
// Each row as the terminal shows it: an empty cell a space, a cont cell nothing, trailing spaces dropped.
const shown = (d: Drawing) => d.cells.map(row => row.map(x => (x?.kind === 'cont' ? '' : x?.ch ?? ' ')).join('').trimEnd())

test('Q2a: a run of pass-through rows keeps its first row; a row with a horizontal arm stays', () => {
  const d = picture('A', '│', '│', '│', '└─┐', '  │', '  │', '  ▼', '  B')
  assert.deepEqual(shown(compact(d)), ['A', '│', '└─┐', '  │', '  ▼', '  B'])
})

test('Q2a: a one-column jog stays, though each of its cells has a vertical arm', () => {
  const d = picture('A', '│', '│', '└┐', ' │', ' │', ' ▼', ' B')
  assert.deepEqual(shown(compact(d)), ['A', '│', '└┐', ' │', ' ▼', ' B'])
})

test('Q2a: a │ where one edge only starts or stops is not pass-through', () => {
  const cv = createCanvas(4, 1, 80, () => true)
  for (const r of [0, 1, 2, 3]) cv.line(r, 0, 5, 'light', 'edge', 'e1')
  cv.line(2, 0, 4, 'light', 'edge', 'e2')
  assert.deepEqual(compact(cv.toDrawing(E)).cells.map(row => row[0]?.segs?.length), [1, 2, 1])
})

test('Q2a: a head keeps one │ between it and the box above: A→B is [ A ] / │ / ▼ / [ B ]', () => {
  const p = layoutGraph(g('TB', ['A>B']), { rankGap: 3, nodeGap: 4, wrapAt: null }) as Placed
  assert.deepEqual(shown(drawGraph(p, routeGraph(p) as Route[], 80)), ['[ A ]', '  │', '  ▼', '[ B ]'])
})

test('Q2a: a run of pass-through columns keeps its first two, so an LR edge still reads ──►', () => {
  assert.deepEqual(shown(compact(picture('A─────►B', 'C─────►D'))), ['A──►B', 'C──►D'])
  assert.deepEqual(shown(compact(picture('A─────┐', '      │', '      ▼', '      B'))), ['A──┐', '   │', '   ▼', '   B'])
})

test('Q2a: a column holding the second cell of a wide character is not pass-through', () => {
  assert.deepEqual(shown(compact(picture('中──────►B'))), ['中──►B'])
})

test('Q2a: empty columns at the left edge go entirely', () => {
  assert.deepEqual(shown(compact(picture('   A', '   │', '   ▼', '   B'))), ['A', '│', '▼', 'B'])
})

test('Q2a: a frame shortens with the rows and columns it spans', () => {
  const cv = createCanvas(7, 8, 80)
  cv.text(1, 3, 'A', 'label', 'A'); cv.line(2, 3, 5, 'light', 'edge', 'e'); cv.line(3, 3, 5, 'light', 'edge', 'e')
  cv.arrow(4, 3, '▼', 'e'); cv.text(5, 3, 'B', 'label', 'B'); cv.frame(0, 0, 6, 7, 'frame', 'S')
  assert.deepEqual(shown(compact(cv.toDrawing(E))), ['┌─────┐', '│  A  │', '│  │  │', '│  ▼  │', '│  B  │', '└─────┘'])
})

test('Q2a: drawGraph compacts by default; given d => d it returns the drawing at layout coordinates', () => {
  const p = layoutGraph(g('TB', ['A>B']), { rankGap: 3, nodeGap: 4, wrapAt: null }) as Placed
  const raw = drawGraph(p, routeGraph(p) as Route[], 80, d => d)
  assert.deepEqual(shown(raw), ['[ A ]', '  │', '  │', '  ▼', '[ B ]'])
  assert.deepEqual(shown(compact(raw)), shown(drawGraph(p, routeGraph(p) as Route[], 80)))
})
