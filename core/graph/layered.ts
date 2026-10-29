// The layered layout (plan A §6–7): a Graph placed on a cell grid, each node, edge label and dummy a Box, each cluster a frame.
import { fail, isFail } from '../fail.ts'
import type { Fail } from '../fail.ts'
import type { Extent, Unit } from './chains.ts'
import { ancestors, clusterTree, subgraph } from './clusters.ts'
import type { GEdge, Graph } from './model.ts'
import { place } from './place.ts'
import type { Rect } from './place.ts'
import { labelSize, nodeSize } from './sizes.ts'
import type { Size } from './sizes.ts'
import { width } from '../width.ts'

export type Box = { row: number; col: number; rows: number; cols: number }
export type Spacing = { rankGap: number; nodeGap: number; wrapAt: number | null }
// A level's rank band along its main axis, rows or columns from to to: block is null for the top level, else the sealed
// cluster laid out on its own. Placed.bands lists each level's in order; gaps() reads the gaps between them.
export type Band = { block: string | null; axis: 'row' | 'col'; from: number; to: number }
export type Placed = { graph: Graph; boxes: ReadonlyMap<string, Box>; frames: ReadonlyMap<string, Box>; rows: number; cols: number
  bands?: readonly Band[] }

const shift = (b: Box, row: number, col: number): Box => ({ ...b, row: b.row + row, col: b.col + col })

// A sealed cluster is laid out on its own, in its own direction or else its parent's, and placed as one block: its frame a
// border on each side, plus a pad cell on each side across the ranks, and at least its title + 4 wide, the content centred.
// An open cluster is a strip of the level it is on, in that level's direction. An edge may end on a sealed cluster, never on
// an open one.
export function layoutGraph(g: Graph, s: Spacing): Placed | Fail {
  const across = g.dir === 'LR' || g.dir === 'RL', pr = across ? 2 : 1, pc = across ? 1 : 2  // a block's margin
  const ext = (z: Size): Extent => (across ? { cross: z.rows, main: z.cols } : { cross: z.cols, main: z.rows })
  const t = clusterTree(g), top = (x: string) => !ancestors(t.parent, x).some(c => t.sealed.has(c))
  const fit = new Map(g.clusters.map(c => [c.id, width(c.title ?? '') + 4] as const))  // ┌─title─┐, and ┌──┐ with none
  if (g.edges.some(e => [e.from, e.to].some(x => t.byId.has(x) && !t.sealed.has(x)))) return fail('cluster-edge')
  const units: Unit[] = [], subs = new Map<string, Placed>(), last = Math.max(-1, ...g.nodes.map(n => n.order))
  for (const n of g.nodes.filter(n => top(n.id))) {
    const z = nodeSize(n, s.wrapAt, across)
    if (isFail(z)) return z
    units.push({ id: n.id, kind: 'node', owner: t.parent.get(n.id) ?? null, key: n.order, ...ext(z) })
  }
  for (const [i, c] of g.clusters.entries()) {
    if (!t.sealed.has(c.id) || !top(c.id)) continue
    const sub = layoutGraph(subgraph(g, t, c), s), inner = g.nodes.filter(n => ancestors(t.parent, n.id).includes(c.id))
    if (isFail(sub)) return sub
    subs.set(c.id, sub)
    const key = inner.length > 0 ? Math.min(...inner.map(n => n.order)) : last + 1 + i
    const cols = Math.max(sub.cols + 2 * pc, fit.get(c.id) ?? 0)
    units.push({ id: c.id, kind: 'block', owner: t.parent.get(c.id) ?? null, key, ...ext({ rows: sub.rows + 2 * pr, cols }) })
  }
  units.sort((a, b) => a.key - b.key)
  const free = g.edges.filter(e => top(e.from) && top(e.to)), labels = new Map<string, Extent>()
  for (const e of free) {
    const z = e.label === null ? null : labelSize(e.label, s.wrapAt)
    if (z && isFail(z)) return z
    if (z) labels.set(e.id, ext(z))
  }
  const outer = new Map(g.clusters.filter(c => !t.sealed.has(c.id) && top(c.id)).map(c => [c.id, t.parent.get(c.id) ?? null] as const))
  // An end label lies along a horizontal run, above it, and beside a vertical one: so the gap it lies in, between ranks when
  // they go across, else between the nodes of a rank, widens by the widest end label + 1 cells. Compaction drops what is unused.
  const room = (e: GEdge) => Math.max(-1, ...[e.tailLabel, e.headLabel].flatMap(t => (t === undefined ? [] : [width(t)]))) + 1
  const extra = Math.max(0, ...free.map(room))
  const p = place(units, free, labels, outer, across ? { ...s, rankGap: s.rankGap + extra } : { ...s, nodeGap: s.nodeGap + extra }, fit, across)
  // LR swaps the axes; BT and RL mirror the main one.
  const at = (main: number, long: number) => (g.dir === 'BT' || g.dir === 'RL' ? p.long - main - long : main)
  const box = (r: Rect): Box => {
    const m = at(r.main, r.long)
    return across ? { row: r.cross, col: m, rows: r.wide, cols: r.long } : { row: m, col: r.cross, rows: r.long, cols: r.wide }
  }
  const axis = across ? 'col' : 'row'
  const bands: Band[] = p.bands.map(({ main, long }) => ({ block: null, axis, from: at(main, long), to: at(main, long) + long - 1 }))
  bands.sort((a, b) => a.from - b.from)
  const boxes = new Map<string, Box>(), frames = new Map<string, Box>()
  for (const [id, r] of p.rects) {
    const b = box(r), sub = subs.get(id)
    if (!sub) { boxes.set(id, b); continue }
    frames.set(id, b)
    const dc = pc + ((b.cols - sub.cols - 2 * pc) >> 1)  // content centred in a frame widened for its title
    for (const [k, v] of sub.boxes) boxes.set(k, shift(v, b.row + pr, b.col + dc))
    for (const [k, v] of sub.frames) frames.set(k, shift(v, b.row + pr, b.col + dc))
    for (const n of sub.bands ?? []) {
      const d = n.axis === 'row' ? b.row + pr : b.col + dc
      bands.push({ ...n, block: n.block ?? id, from: n.from + d, to: n.to + d })
    }
  }
  for (const [id, r] of p.strips) frames.set(id, box(r))
  // Each edge as drawn: a back edge, here or in a block, reversed with its ends swapped.
  const drawn = new Map<string, GEdge>([...p.edges, ...[...subs.values()].flatMap(x => x.graph.edges)].map(e => [e.id, e]))
  const graph = { ...g, edges: g.edges.map(e => drawn.get(e.id) ?? e) }
  for (const e of graph.edges) {
    const label = boxes.get(`${e.id}:label`), a = boxes.get(e.from), b = boxes.get(e.to)
    if (!label || !a || !b || e.reversed || [...boxes.keys()].some(id => id.startsWith(`${e.id}#`))) continue
    const source = across ? a.row + ((a.rows - 1) >> 1) : a.col + ((a.cols - 1) >> 1)
    const target = across ? b.row + ((b.rows - 1) >> 1) : b.col + ((b.cols - 1) >> 1)
    const single = graph.edges.filter(n => n.from === e.from && n.style !== 'invisible').length === 1
    const cross = (single && Math.abs(source - target) <= 1 ? source : target) - ((across ? label.rows : label.cols) >> 1)
    const candidate = across ? { ...label, row: cross } : { ...label, col: cross }
    const overlaps = [...boxes].some(([id, n]) => id !== `${e.id}:label` && candidate.row < n.row + n.rows &&
      n.row < candidate.row + candidate.rows && candidate.col < n.col + n.cols && n.col < candidate.col + candidate.cols)
    const frameConflict = [...frames.values()].some(f => {
      const within = (b: Box) => b.row > f.row && b.col > f.col && b.row + b.rows < f.row + f.rows && b.col + b.cols < f.col + f.cols
      const intersects = candidate.row < f.row + f.rows && f.row < candidate.row + candidate.rows &&
        candidate.col < f.col + f.cols && f.col < candidate.col + candidate.cols
      return within(label) ? !within(candidate) : intersects
    })
    if (cross >= 0 && !overlaps && !frameConflict) boxes.set(`${e.id}:label`, candidate)
  }
  for (const e of graph.edges.filter(e => !e.reversed && e.label !== null)) {
    const label = boxes.get(`${e.id}:label`)
    if (!label) continue
    const axis = across ? label.row + (label.rows >> 1) : label.col + (label.cols >> 1)
    for (const [id, b] of boxes) if (id.startsWith(`${e.id}#`)) {
      const candidate = across ? { ...b, row: axis } : { ...b, col: axis }
      const overlap = [...boxes].some(([other, n]) => other !== id && candidate.row < n.row + n.rows && n.row < candidate.row + candidate.rows &&
        candidate.col < n.col + n.cols && n.col < candidate.col + candidate.cols)
      const crossesFrame = [...frames.values()].some(f => {
        const within = (b: Box) => b.row > f.row && b.col > f.col && b.row + b.rows < f.row + f.rows && b.col + b.cols < f.col + f.cols
        return within(b) !== within(candidate) || candidate.row >= f.row && candidate.row < f.row + f.rows &&
          candidate.col >= f.col && candidate.col < f.col + f.cols && !within(candidate)
      })
      if (!overlap && !crossesFrame) boxes.set(id, candidate)
    }
  }
  // A back edge leaves its nodes on the outside, its end labels beside them: its lane lies the widest + 1 cells further out.
  let outside = Math.max(...[...boxes, ...frames].map(([, b]) => across ? b.row + b.rows : b.col + b.cols)) + 2
  for (const e of graph.edges.filter(e => e.reversed)) {
    outside += room(e)
    const label = boxes.get(`${e.id}:label`)
    const lane = outside + (label ? (across ? label.rows : label.cols) >> 1 : 0)
    for (const [id, b] of boxes) if (id.startsWith(`${e.id}#`)) {
      boxes.set(id, across ? { ...b, row: lane } : { ...b, col: lane })
    }
    if (label) boxes.set(`${e.id}:label`, across ? { ...label, row: outside } : { ...label, col: outside })
    outside += (label ? across ? label.rows : label.cols : 1) + 2
  }
  const rows = Math.max(across ? p.wide : p.long, ...[...boxes.values()].map(b => b.row + b.rows))
  const cols = Math.max(across ? p.long : p.wide, ...[...boxes.values()].map(b => b.col + b.cols))
  return { graph, boxes, frames, rows, cols, bands }
}
