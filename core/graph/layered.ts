// The layered layout (plan A §6–7): a Graph placed on a cell grid, each node, edge label and dummy a Box, each cluster a frame.
import { fail, isFail } from '../fail.ts'
import type { Fail } from '../fail.ts'
import type { Extent, Unit } from './chains.ts'
import { ancestors, clusterTree, subgraph } from './clusters.ts'
import type { Tree } from './clusters.ts'
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
// notes: each side note's box, by note id, beside its node's pill in boxes.
export type Placed = { graph: Graph; boxes: ReadonlyMap<string, Box>; frames: ReadonlyMap<string, Box>; rows: number; cols: number
  bands?: readonly Band[]; notes?: ReadonlyMap<string, Box> }

const shift = (b: Box, row: number, col: number): Box => ({ ...b, row: b.row + row, col: b.col + col })

// A sealed cluster is laid out on its own, in its own direction or else its parent's, and placed as one block: its frame a
// border on each side, plus a pad cell on each side across the ranks, and at least its title + 4 wide, the content centred.
// An open cluster is a strip of the level it is on, in that level's direction. An edge may end on a sealed cluster, never on
// an open one.
export function layoutGraph(g: Graph, s: Spacing, nested = false): Placed | Fail {
  const across = g.dir === 'LR' || g.dir === 'RL', pr = across ? 2 : 1, pc = across ? 1 : 2  // a block's margin
  const ext = (z: Size): Extent => (across ? { cross: z.rows, main: z.cols } : { cross: z.cols, main: z.rows })
  const t = clusterTree(g), top = (x: string) => !ancestors(t.parent, x).some(c => t.sealed.has(c))
  // ┌─title─┐, and ┌──┐ with none; a frameless cluster has no border, pad or title row, so no margin and no fit.
  const fit = new Map(g.clusters.map(c => [c.id, c.frameless ? 0 : width(c.title ?? '') + 4] as const))
  const margin = (id: string): [number, number] => (t.byId.get(id)?.frameless ? [0, 0] : [pr, pc])
  if (g.edges.some(e => [e.from, e.to].some(x => t.byId.has(x) && !t.sealed.has(x)))) return fail('cluster-edge')
  const units: Unit[] = [], subs = new Map<string, Placed>(), last = Math.max(-1, ...g.nodes.map(n => n.order))
  // A side note, left when its ranks go across (withNotes made it a node): its node's unit grows on its side by the note's
  // widest line, wrapped at wrapAt, or its key, plus ' ┄┄'; its main extent is the larger of its rows and the note's lines.
  const sided = new Map<string, { pill: Size; note: Size; side: 'left' | 'right'; id: string }>()
  for (const n of g.nodes.filter(n => top(n.id))) {
    const z = nodeSize(n, s.wrapAt, across)
    if (isFail(z)) return z
    const note = n.note && !across ? (n.note.key !== undefined ? { rows: 1, cols: width(n.note.key) + 2 } : labelSize(n.note.text, s.wrapAt)) : null
    if (note && isFail(note)) return note
    const w = note ? { rows: Math.max(z.rows, note.rows), cols: z.cols + note.cols - 2 + 3 } : z
    if (note) sided.set(n.id, { pill: z, note: { rows: note.rows, cols: note.cols - 2 }, side: n.note!.side, id: n.note!.id })
    units.push({ id: n.id, kind: 'node', owner: t.parent.get(n.id) ?? null, key: n.order, ...ext(w) })
  }
  for (const [i, c] of g.clusters.entries()) {
    if (!t.sealed.has(c.id) || !top(c.id)) continue
    const sub = layoutGraph(subgraph(g, t, c), s, true), inner = g.nodes.filter(n => ancestors(t.parent, n.id).includes(c.id))
    if (isFail(sub)) return sub
    subs.set(c.id, sub)
    const key = inner.length > 0 ? Math.min(...inner.map(n => n.order)) : last + 1 + i
    const [mr, mc] = margin(c.id), cols = Math.max(sub.cols + 2 * mc, fit.get(c.id) ?? 0)
    units.push({ id: c.id, kind: 'block', owner: t.parent.get(c.id) ?? null, key, ...ext({ rows: sub.rows + 2 * mr, cols }) })
  }
  units.sort((a, b) => a.key - b.key)
  const free = g.edges.filter(e => top(e.from) && top(e.to)), labels = new Map<string, Extent>()
  for (const e of free) {
    // A keyed label is drawn as its key alone: a one-row box its key wide, with no pad.
    const z = e.label === null ? null : e.labelKey !== undefined ? { rows: 1, cols: width(e.labelKey) } : labelSize(e.label, s.wrapAt)
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
  const boxes = new Map<string, Box>(), frames = new Map<string, Box>(), notes = new Map<string, Box>()
  for (const [id, r] of p.rects) {
    const b = box(r), sub = subs.get(id), x = sided.get(id)
    if (x) {  // the pill at its unit's top, on the far side from its note; the note's lines from the same row
      const pill = x.side === 'left' ? b.col + b.cols - x.pill.cols : b.col
      boxes.set(id, { row: b.row, col: pill, rows: x.pill.rows, cols: x.pill.cols })
      notes.set(x.id, { row: b.row, col: x.side === 'left' ? b.col : b.col + x.pill.cols + 3, rows: x.note.rows, cols: x.note.cols })
      continue
    }
    if (!sub) { boxes.set(id, b); continue }
    frames.set(id, b)  // a frameless cluster's box too, for the drawer
    const [mr, mc] = margin(id), dc = mc + ((b.cols - sub.cols - 2 * mc) >> 1)  // content centred in a frame widened for its title
    for (const [k, v] of sub.boxes) boxes.set(k, shift(v, b.row + mr, b.col + dc))
    for (const [k, v] of sub.frames) frames.set(k, shift(v, b.row + mr, b.col + dc))
    for (const [k, v] of sub.notes ?? []) notes.set(k, shift(v, b.row + mr, b.col + dc))
    for (const n of sub.bands ?? []) {
      const d = n.axis === 'row' ? b.row + mr : b.col + dc
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
  // A block's back edges stay in the lanes its own layout reserved inside its frame (V7), so only this level's move here.
  const blocked = new Set([...subs.values()].flatMap(x => x.graph.edges.map(e => e.id)))
  const inStrip = stripLanes(graph, t, boxes, frames, notes, across, room, blocked)
  const backs = graph.edges.filter(e => e.reversed && !blocked.has(e.id) && !inStrip.has(e.id))
  // Nested, beside all but these edges' own dummies and labels, which move into the lanes, so the frame holds no blank rows
  // before them; at the top level the drawings stay as they were.
  const own = (k: string) => nested && backs.some(e => k.startsWith(`${e.id}#`) || k === `${e.id}:label`)
  let outside = Math.max(...[...boxes, ...frames].filter(([k]) => !own(k)).map(([, b]) => across ? b.row + b.rows : b.col + b.cols)) + 2
  for (const e of backs) {
    outside += room(e)
    const label = boxes.get(`${e.id}:label`)
    const lane = outside + (label ? (across ? label.rows : label.cols) >> 1 : 0)
    for (const [id, b] of boxes) if (id.startsWith(`${e.id}#`)) {
      boxes.set(id, across ? { ...b, row: lane } : { ...b, col: lane })
    }
    if (label) boxes.set(`${e.id}:label`, across ? { ...label, row: outside } : { ...label, col: outside })
    outside += (label ? across ? label.rows : label.cols : 1) + 2
  }
  // Nested, the size holds those lanes too, so the frame around it does; at the top the router widens past them as it goes.
  const lanes = nested && backs.some(e => e.style !== 'invisible') ? outside - 2 : 0
  const all = [...boxes.values(), ...frames.values()]  // a strip widened for its lanes (stripLanes) too
  const rows = Math.max(across ? p.wide : p.long, ...all.map(b => b.row + b.rows), across ? lanes : 0)
  const cols = Math.max(across ? p.long : p.wide, ...all.map(b => b.col + b.cols), across ? 0 : lanes)
  return { graph, boxes, frames, rows, cols, bands, ...(notes.size > 0 ? { notes } : {}) }
}

// V8: a back edge between nodes of one drawn strip at this level takes its lane inside the innermost such strip, beside what
// the strip holds, as the top level's lie beside all: the strip's far border moves out by what its lanes need, all past it
// moves with it and each frame around it widens. Innermost strips first, so a strip around one sees it grown. An edge into
// the strip from outside makes it open, not sealed, so its cycle cannot keep to a block's own lanes (V7). Returns the edges.
function stripLanes(g: Graph, t: Tree, boxes: Map<string, Box>, frames: Map<string, Box>, notes: Map<string, Box>,
  across: boolean, room: (e: GEdge) => number, blocked: ReadonlySet<string>): Set<string> {
  const home = new Map<string, GEdge[]>()
  for (const e of g.edges.filter(e => e.reversed && e.style !== 'invisible' && !blocked.has(e.id))) {
    const a = ancestors(t.parent, e.from), b = ancestors(t.parent, e.to)
    const c = a.find(x => b.includes(x) && !t.byId.get(x)?.frameless)
    if (c !== undefined && frames.has(c)) home.set(c, [...(home.get(c) ?? []), e])
  }
  const far = (b: Box) => across ? b.row + b.rows : b.col + b.cols, start = (b: Box) => across ? b.row : b.col
  const wraps = (f: Box, b: Box) => b.row > f.row && b.col > f.col && b.row + b.rows < f.row + f.rows && b.col + b.cols < f.col + f.cols
  for (const [c, es] of [...home].sort(([x], [y]) => ancestors(t.parent, y).length - ancestors(t.parent, x).length)) {
    const f = frames.get(c)!, mine = (k: string) => es.some(e => k.startsWith(`${e.id}#`) || k === `${e.id}:label`)
    const held = [...boxes, ...frames, ...notes].filter(([k, b]) => k !== c && !mine(k) && wraps(f, b)).map(([, b]) => far(b))
    const content = Math.max(start(f) + 1, ...held), gap = far(f) - 1 - content  // blank cells before its far border
    let outside = content + 2
    for (const e of es) {
      outside += room(e)
      const label = boxes.get(`${e.id}:label`), lane = outside + (label ? (across ? label.rows : label.cols) >> 1 : 0)
      for (const [id, b] of boxes) if (id.startsWith(`${e.id}#`)) boxes.set(id, across ? { ...b, row: lane } : { ...b, col: lane })
      if (label) boxes.set(`${e.id}:label`, across ? { ...label, row: outside } : { ...label, col: outside })
      outside += (label ? across ? label.rows : label.cols : 1) + 2
    }
    const d = outside - 2 + gap + 1 - far(f), past = far(f)
    if (d <= 0) continue
    const move = (b: Box): Box => across ? { ...b, row: b.row + d } : { ...b, col: b.col + d }
    const grow = (b: Box): Box => across ? { ...b, rows: b.rows + d } : { ...b, cols: b.cols + d }
    for (const m of [boxes, notes]) for (const [k, b] of m) if (!mine(k) && start(b) >= past) m.set(k, move(b))
    for (const [k, b] of frames) frames.set(k, k === c || wraps(b, f) ? grow(b) : start(b) >= past ? move(b) : b)
  }
  return new Set([...home.values()].flat().map(e => e.id))
}
