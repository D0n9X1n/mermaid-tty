// compact (Q2a): a graph drawing without its slack, its pass-through rows and columns dropped, read as before but smaller.
import test from 'node:test'; import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url'
import { createCanvas } from '../../core/canvas.ts'
import type { Drawing } from '../../core/canvas.ts'
import { compact, compactIfValid } from '../../core/graph/compact.ts'
import { drawGraph } from '../../core/graph/draw.ts'
import { layoutGraph } from '../../core/graph/layered.ts'
import type { Placed } from '../../core/graph/layered.ts'
import { routeGraph } from '../../core/graph/route.ts'
import type { Route } from '../../core/graph/route.ts'
import { validate } from '../../core/validate.ts'
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
      if (dirs !== undefined) { cv.line(r, c, dirs, 'light', 'edge', 'e') }
      else if ('▼►▲◄'.includes(ch)) { cv.arrow(r, c, ch, 'e') }
      else if (ch !== ' ') { cv.text(r, c, ch, 'label', 'n') }
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
  for (const r of [0, 1, 2, 3]) { cv.line(r, 0, 5, 'light', 'edge', 'e1') }
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

// Compaction runs only on a drawing that already validates, apart from width, which is what compaction changes. Repro A:
// an A→B route with a middle cell gone. Uncompacted it is disconnected; compacted, its ── ──► would close up to ──►.
const gapped = () => {
  const p = layoutGraph(g('LR', ['A>B']), { rankGap: 6, nodeGap: 1, wrapAt: null }) as Placed
const  [r] = routeGraph(p) as Route[]
  return { p, routes: [{ ...r!, cells: r!.cells.filter((_, i) => i !== r!.cells.length >> 1) }] }
}

test('Q2a: a route with a gap stays rejected through drawGraph: the default finish leaves an invalid drawing as it is', () => {
  const { p, routes } = gapped()
const  raw = drawGraph(p, routes, 80, d => d)
  assert.equal(validate(raw)?.reason, 'edge-disconnected')
  assert.equal(validate(compact(raw)), null)                  // the break compaction alone would hide
  const d = drawGraph(p, routes, 80)
  assert.deepEqual(d, raw)
  assert.equal(validate(d)?.reason, 'edge-disconnected')
})

// Repro B: a framed A→B with one frame-side cell gone, in a run of pass-through rows that compaction alone would drop.
test('Q2a: a frame with a side cell gone stays rejected by the default finish', () => {
  const cv = createCanvas(7, 8, 80)
  cv.text(1, 3, 'A', 'label', 'A'); cv.line(2, 3, 5, 'light', 'edge', 'e'); cv.line(3, 3, 5, 'light', 'edge', 'e')
  cv.arrow(4, 3, '▼', 'e'); cv.text(5, 3, 'B', 'label', 'B'); cv.frame(0, 0, 6, 7, 'frame', 'S')
  const raw = cv.toDrawing({ labels: [{ owner: 'A', text: 'A' }, { owner: 'B', text: 'B' }],
    edges: [{ id: 'e', from: 'A', to: 'B', ends: [{ node: 'B', glyph: '▼' }] }], edgeLabels: [], frames: ['S'] })
  assert.equal(validate(raw), null)
  raw.cells[3]![0] = null
  assert.equal(validate(raw)?.reason, 'frame-broken')
  assert.equal(validate(compact(raw)), null)
  assert.equal(compactIfValid(raw), raw)
})

test('Q2a: a drawing too wide only uncompacted is still compacted, and fits', () => {
  const p = layoutGraph(g('LR', ['A>B']), { rankGap: 6, nodeGap: 1, wrapAt: null }) as Placed
const  rs = routeGraph(p) as Route[]
  const fit = Math.max(...shown(compact(drawGraph(p, rs, 80, d => d))).map(r => width(r)))
  assert.equal(validate(drawGraph(p, rs, fit, d => d))?.reason, 'row-too-wide')
  const d = drawGraph(p, rs, fit)
  assert.equal(validate(d), null)
  assert.deepEqual(shown(d), ['[ A ]──►[ B ]'])
})

// One owner's ─ ends where another's starts, head to tail: the cell's dirs are 10, but no owner runs straight through it.
test('Q2a: a ─ where one edge ends and another starts is not pass-through', () => {
  const cv = createCanvas(1, 9, 80, () => true)
  cv.text(0, 0, 'A', 'label', 'n'); cv.text(0, 8, 'B', 'label', 'n'); cv.arrow(0, 7, '►', 'e2')
  for (const c of [1, 2, 3]) { cv.line(0, c, 10, 'light', 'edge', 'e1') }
  cv.line(0, 4, 8, 'light', 'edge', 'e1'); cv.line(0, 4, 2, 'light', 'edge', 'e2')
  for (const c of [5, 6]) { cv.line(0, c, 10, 'light', 'edge', 'e2') }
  const d = compact(cv.toDrawing(E))
  assert.deepEqual(shown(d), ['A─────►B'])
  assert.deepEqual(d.cells[0]!.find(x => x?.segs?.length === 2)?.segs, [{ owner: 'e1', dirs: 8 }, { owner: 'e2', dirs: 2 }])
})

// Through the flowchart module and explain: a module mock breaks each drawing it makes, in a child process, since
// mock.module needs a flag. See compact-guard-fixture.ts.
const FIXTURE = fileURLToPath(new URL('./compact-guard-fixture.ts', import.meta.url))
const broken = (mode: string): unknown => {
  const r = spawnSync(process.execPath, ['--experimental-test-module-mocks', '--no-warnings', FIXTURE, mode], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  return JSON.parse(r.stdout)
}

test('Q2a: both repros stay rejected through the flowchart module and explain', () => {
  assert.deepEqual(broken('route'), { natural: 'edge-disconnected', explain: 'rejected' })
  assert.deepEqual(broken('frame'), { natural: 'frame-broken', explain: 'rejected' })
})
