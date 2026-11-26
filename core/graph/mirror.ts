// A bottom-to-top or right-to-left layout routed as its mirror. Each direction's routers were tuned on top-to-bottom
// and left-to-right layouts, and a few of their choices, which track a gap fills first, which side a loop turns to,
// read differently mirrored. The mirror is the same graph turned over along its main axis: what routes there routes
// here once turned back, so a layout the routers fail as it stands can still draw. Only the routes come back mirrored:
// boxes, frames and text keep their places, shifted when a mirrored route grew the grid past its start.
import type { Box, Placed } from './layered.ts'
import type { Dir } from './model.ts'
import type { Route } from './route-base.ts'
import { titleCells } from './route-base.ts'

type Axis = 'row' | 'col'

// The axis a direction's mirror turns over: rows for bottom to top, columns for right to left; none for the others.
export const mirrorAxis = (dir: Dir): Axis | null => {
  if (dir === 'BT') {
    return 'row'
  }

  return dir === 'RL' ? 'col' : null
}

const TURNED: Record<Axis, Partial<Record<Dir, Dir>>> = { row: { TB: 'BT', BT: 'TB' }, col: { LR: 'RL', RL: 'LR' } }
// An arrowhead turned over: up and down swap along rows, left and right along columns; other marks read the same.
const HEADS: Record<Axis, Record<string, string>> = {
  row: { '▼': '▲', '▲': '▼', '▽': '△', '△': '▽' },
  col: { '◄': '►', '►': '◄', '◁': '▷', '▷': '◁' },
}
// A cell's directions turned over: up (1) and down (4) swap along rows, right (2) and left (8) along columns.
const turnDirs = (d: number, axis: Axis) =>
  axis === 'row' ? (d & 10) | (d & 1 ? 4 : 0) | (d & 4 ? 1 : 0) : (d & 5) | (d & 2 ? 8 : 0) | (d & 8 ? 2 : 0)

const turnBox = (b: Box, axis: Axis, n: number): Box =>
  axis === 'row' ? { ...b, row: n - b.row - b.rows } : { ...b, col: n - b.col - b.cols }
const turnBoxes = <K>(m: ReadonlyMap<K, Box>, axis: Axis, n: number) =>
  new Map([...m].map(([k, b]) => [k, turnBox(b, axis, n)] as const))

// p turned over along axis: every box, frame, note and band, the graph's direction and each cluster's along that axis,
// and the title cells where the turned frames' titles now lie.
export function turn(p: Placed, axis: Axis): Placed {
  const n = axis === 'row' ? p.rows : p.cols
  const dir = <D extends Dir | null>(d: D) => ((d !== null && TURNED[axis][d]) || d) as D
  const titles = new Set(
    [...titleCells(p)].map((k) => {
      const [r, c] = k.split(',').map(Number) as [number, number]
      return axis === 'row' ? `${n - 1 - r},${c}` : `${r},${n - 1 - c}`
    }),
  )
  return {
    ...p,
    graph: { ...p.graph, dir: dir(p.graph.dir), clusters: p.graph.clusters.map((c) => ({ ...c, dir: dir(c.dir) })) },
    boxes: turnBoxes(p.boxes, axis, n),
    frames: turnBoxes(p.frames, axis, n),
    ...(p.notes ? { notes: turnBoxes(p.notes, axis, n) } : {}),
    ...(p.bands
      ? { bands: p.bands.map((b) => (b.axis === axis ? { ...b, from: n - 1 - b.to, to: n - 1 - b.from } : b)) }
      : {}),
    titles,
  }
}

// routes, found on q, p turned over, turned back onto p. The routers may grow q past its far end; turned back, that
// growth lies before p's start, so p's boxes, frames, notes and bands move along by it and p takes q's size.
export function turnBack(p: Placed, q: Placed, routes: readonly Route[], axis: Axis): Route[] {
  const n = axis === 'row' ? q.rows : q.cols
  const grow = n - (axis === 'row' ? p.rows : p.cols)
  const move = (b: Box): Box => (axis === 'row' ? { ...b, row: b.row + grow } : { ...b, col: b.col + grow })
  const moveBoxes = <K>(m: ReadonlyMap<K, Box>) => new Map([...m].map(([k, b]) => [k, move(b)] as const))
  p.boxes = moveBoxes(p.boxes)
  p.frames = moveBoxes(p.frames)
  if (p.notes) {
    p.notes = moveBoxes(p.notes)
  }

  if (p.bands) {
    p.bands = p.bands.map((b) => (b.axis === axis ? { ...b, from: b.from + grow, to: b.to + grow } : b))
  }

  p.rows = q.rows
  p.cols = q.cols
  const at = <C extends { r: number; c: number }>(c: C): C =>
    axis === 'row' ? { ...c, r: n - 1 - c.r } : { ...c, c: n - 1 - c.c }
  return routes.map((r) => ({
    ...r,
    cells: r.cells.map((c) => ({ ...at(c), dirs: turnDirs(c.dirs, axis) })),
    ends: r.ends.map((c) => ({ ...at(c), ch: HEADS[axis][c.ch] ?? c.ch })),
  }))
}
