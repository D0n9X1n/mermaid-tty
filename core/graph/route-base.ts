// What every router shares: the Route and Point shapes, end glyphs, merge groups and port nets, and the checks a
// finished route must pass (crossings, frame borders, label ink). Kept apart so each router module imports one base.
import { width } from '../width.ts'
import { labelLines, wrap } from '../text.ts'
import type { Box, Placed } from './layered.ts'
import type { GEdge } from './model.ts'

export type Route = {
  edge: string
  cells: readonly { r: number; c: number; dirs: number }[]
  ends: readonly { r: number; c: number; ch: string }[]
  style: 'solid' | 'dotted' | 'thick'
}
export type Point = { r: number; c: number }
// The arm bit of cell a that points at its neighbour b: 1 up, 2 right, 4 down, 8 left.
export function arm(a: Point, b: Point): number {
  if (b.r < a.r) {
    return 1
  }

  if (b.c > a.c) {
    return 2
  }

  return b.r > a.r ? 4 : 8
}

// An end's glyph by the side of its node it sits on, 0 above, 1 right, 2 below, 3 left (a port's face): an arrow ▼◄▲►
// or a triangle ▽◁△▷ points into the node, a tail into its source as a head into its target; ◆ ◇ o x look the same on
// any side.
const MARKS: Readonly<Record<string, string>> = { circle: 'o', cross: 'x', diamond: '◆', odiamond: '◇' }
export const endGlyph = (end: string, side: number): string =>
  MARKS[end] ?? (end === 'triangle' ? '▽◁△▷' : '▼◄▲►')[side]!

export const inside = (c: Point, b: Box) => c.r >= b.row && c.r < b.row + b.rows && c.c >= b.col && c.c < b.col + b.cols
export const keyOf = (c: Point) => `${c.r},${c.c}`
export const middle = (size: number) => (size - 1) >> 1
export function routeObstacles(p: Placed, e: GEdge): Box[] {
  return [...p.boxes]
    .filter(([id]) => !id.startsWith(`${e.id}#`) && id !== `${e.id}:label`)
    .map(([id, b]) =>
      id === e.from || id === e.to ? b : { row: b.row - 1, col: b.col - 1, rows: b.rows + 2, cols: b.cols + 2 },
    )
}
// Disjoint complete bipartite nets: joining any two lines in a net implies only declared edges.
export function mergeGroups(p: Placed): Map<string, string> {
  const edges = p.graph.edges.filter((e) => e.style !== 'invisible').toSorted((a, b) => a.order - b.order)
  const eligible = (e: GEdge) => e.tail === 'none' && e.head !== 'none' && e.from !== e.to && !e.reversed
  const groups: GEdge[][] = []
  const result = new Map<string, string>()
  for (const e of edges) {
    let group = eligible(e)
      ? groups.find((g) => {
          if (
            !eligible(g[0]!) ||
            g[0]!.style !== e.style ||
            g[0]!.head !== e.head ||
            !g.some((n) => n.from === e.from || n.to === e.to)
          ) {
            return false
          }

          const tails = new Set([...g.map((n) => n.from), e.from])
          const heads = new Set([...g.map((n) => n.to), e.to])
          return [...tails].every((from) =>
            [...heads].every((to) =>
              edges.some(
                (n) => eligible(n) && n.style === e.style && n.head === e.head && n.from === from && n.to === to,
              ),
            ),
          )
        })
      : undefined
    if (!group) {
      group = []
      groups.push(group)
    }

    group.push(e)
    result.set(e.id, group[0]!.id)
  }

  return result
}

// An end's port net: its merge group, or for an end with a label its own edge's, so two cardinalities never share
// a stem.
export const portOf = (groups: ReadonlyMap<string, string>, e: GEdge, end: 'tail' | 'head'): string =>
  (end === 'tail' ? e.tailLabel : e.headLabel) === undefined ? groups.get(e.id)! : `${groups.get(e.id)!}#${e.id}`

export type Segment = { nodes: readonly string[]; dirs: number }
const unrelated = (a: Segment, b: Segment) => !a.nodes.some((id) => b.nodes.includes(id))
export function straightCrossing(owners: readonly Segment[]): boolean {
  if (!owners.some((a) => owners.some((b) => unrelated(a, b)))) {
    return true
  }

  return (
    owners.every((a) => a.dirs === 5 || a.dirs === 10) &&
    owners.every((a) => owners.every((b) => !unrelated(a, b) || a.dirs !== b.dirs))
  )
}

export function crossingsFit(p: Placed, e: GEdge, cells: Route['cells'], routes: readonly Route[]): boolean {
  const occupied = new Map<string, Segment[]>()
  for (const r of routes) {
    const edge = p.graph.edges.find((n) => n.id === r.edge)
    const nodes = edge ? [edge.from, edge.to] : [r.edge]
    for (const c of r.cells) {
      occupied.set(keyOf(c), [...(occupied.get(keyOf(c)) ?? []), { nodes, dirs: c.dirs }])
    }
  }

  return cells.every((c) =>
    straightCrossing([...(occupied.get(keyOf(c)) ?? []), { nodes: [e.from, e.to], dirs: c.dirs }]),
  )
}
// Match draw.ts's centered label text, leaving its padding available to the line; a keyed label's ink is its key box.
export function labelInk(p: Placed, e: GEdge): Box[] {
  const b = p.boxes.get(`${e.id}:label`)
  if (!b || e.label === null) {
    return []
  }

  if (e.labelKey !== undefined) {
    return [{ row: b.row, col: b.col, rows: 1, cols: width(e.labelKey) }]
  } // a key box is all ink

  const pieces = labelLines(e.label).flatMap((t) => wrap(t, b.cols - 2) ?? [{ text: t, join: '' }])
  return pieces.map((piece, i) => ({
    row: b.row + i,
    col: b.col + ((b.cols - width(piece.text)) >> 1),
    rows: 1,
    cols: width(piece.text),
  }))
}

export const border = (c: Point, b: Box) =>
  inside(c, b)
    ? (c.r === b.row || c.r === b.row + b.rows - 1 ? 5 : 0) | (c.c === b.col || c.c === b.col + b.cols - 1 ? 10 : 0)
    : 0

// The frames drawn as a border: every frame box but a frameless region's, which draws none, so an edge may run
// through it.
export const walls = (p: Placed): Box[] => {
  const frameless = new Set(p.graph.clusters.filter((c) => c.frameless).map((c) => c.id))
  return [...p.frames].filter(([id]) => !frameless.has(id)).map(([, b]) => b)
}

// Whether c lies strictly inside frame box f, off its border; and the drawn frames that hold both of e's ends that way.
// An edge between nodes of one frame stays inside it (V6): a cell outside one of these, or on its border, is never
// used.
export const within = (c: Point, f: Box) =>
  c.r > f.row && c.r < f.row + f.rows - 1 && c.c > f.col && c.c < f.col + f.cols - 1
export function fences(p: Placed, e: GEdge): Box[] {
  const held = (id: string, f: Box) => {
    const b = p.boxes.get(id) ?? p.frames.get(id)
    return !!b && within({ r: b.row, c: b.col }, f) && within({ r: b.row + b.rows - 1, c: b.col + b.cols - 1 }, f)
  }
  return walls(p).filter((f) => held(e.from, f) && held(e.to, f))
}

export const fenced = (fs: readonly Box[], c: Point) => fs.every((f) => within(c, f))
// Whether e's cells cross each drawn frame's border only as its hold on e's ends needs: once when it holds one end,
// never when it holds neither or both. A frame never holds itself, so an edge ending at a frame never crosses it: its
// mark meets the border from outside. The validator rejects any other count (edge-crosses-frame), so a route that
// breaks it is refused here.
export function crossesTrue(p: Placed, e: GEdge, cells: readonly Point[]): boolean {
  const frameless = new Set(p.graph.clusters.filter((c) => c.frameless).map((c) => c.id))
  const held = (id: string, f: Box) => {
    const b = p.boxes.get(id) ?? p.frames.get(id)
    return !!b && within({ r: b.row, c: b.col }, f) && within({ r: b.row + b.rows - 1, c: b.col + b.cols - 1 }, f)
  }
  return [...p.frames].every(
    ([id, f]) =>
      frameless.has(id) ||
      cells.filter((c) => border(c, f) !== 0).length === (held(e.from, f) !== held(e.to, f) ? 1 : 0),
  )
}
