// Route in increasing main-axis coordinates; transpose/mirror only at cell boundaries.
import { fail } from '../fail.ts'
import type { Fail } from '../fail.ts'
import { width } from '../width.ts'
import { labelLines, wrap } from '../text.ts'
import { gaps } from './gaps.ts'
import type { Box, Placed } from './layered.ts'
import type { GEdge } from './model.ts'

export type Route = { edge: string; cells: readonly { r: number; c: number; dirs: number }[]
  ends: readonly { r: number; c: number; ch: string }[]; style: 'solid' | 'dotted' | 'thick' }
type Point = { r: number; c: number }
const arm = (a: Point, b: Point) => b.r < a.r ? 1 : b.c > a.c ? 2 : b.r > a.r ? 4 : 8
// An end's glyph by the side of its node it sits on, 0 above, 1 right, 2 below, 3 left (a port's face): an arrow ▼◄▲► or a
// triangle ▽◁△▷ points into the node, a tail into its source as a head into its target; ◆ ◇ o x look the same on any side.
const MARKS: Readonly<Record<string, string>> = { circle: 'o', cross: 'x', diamond: '◆', odiamond: '◇' }
const endGlyph = (end: string, side: number): string => MARKS[end] ?? (end === 'triangle' ? '▽◁△▷' : '▼◄▲►')[side]!

const inside = (c: Point, b: Box) => c.r >= b.row && c.r < b.row + b.rows && c.c >= b.col && c.c < b.col + b.cols
const keyOf = (c: Point) => `${c.r},${c.c}`
const middle = (size: number) => (size - 1) >> 1
function routeObstacles(p: Placed, e: GEdge): Box[] {
  return [...p.boxes].filter(([id]) => !id.startsWith(`${e.id}#`) && id !== `${e.id}:label`).map(([id, b]) =>
    id === e.from || id === e.to ? b : { row: b.row - 1, col: b.col - 1, rows: b.rows + 2, cols: b.cols + 2 })
}
// Disjoint complete bipartite nets: joining any two lines in a net implies only declared edges.
function mergeGroups(p: Placed): Map<string, string> {
  const edges = p.graph.edges.filter(e => e.style !== 'invisible').toSorted((a, b) => a.order - b.order)
  const eligible = (e: GEdge) => e.tail === 'none' && e.head !== 'none' && e.from !== e.to && !e.reversed
  const groups: GEdge[][] = [], result = new Map<string, string>()
  for (const e of edges) {
    let group = eligible(e) ? groups.find(g => {
      if (!eligible(g[0]!) || g[0]!.style !== e.style || g[0]!.head !== e.head || !g.some(n => n.from === e.from || n.to === e.to)) return false
      const tails = new Set([...g.map(n => n.from), e.from]), heads = new Set([...g.map(n => n.to), e.to])
      return [...tails].every(from => [...heads].every(to => edges.some(n => eligible(n) && n.style === e.style && n.head === e.head && n.from === from && n.to === to)))
    }) : undefined
    if (!group) { group = []; groups.push(group) }
    group.push(e)
    result.set(e.id, group[0]!.id)
  }
  return result
}

// An end's port net: its merge group, or for an end with a label its own edge's, so two cardinalities never share a stem.
const portOf = (groups: ReadonlyMap<string, string>, e: GEdge, end: 'tail' | 'head'): string =>
  (end === 'tail' ? e.tailLabel : e.headLabel) === undefined ? groups.get(e.id)! : `${groups.get(e.id)!}#${e.id}`

type Segment = { nodes: readonly string[]; dirs: number }
const unrelated = (a: Segment, b: Segment) => !a.nodes.some(id => b.nodes.includes(id))
function straightCrossing(owners: readonly Segment[]): boolean {
  if (!owners.some(a => owners.some(b => unrelated(a, b)))) return true
  return owners.every(a => a.dirs === 5 || a.dirs === 10) &&
    owners.every(a => owners.every(b => !unrelated(a, b) || a.dirs !== b.dirs))
}
function crossingsFit(p: Placed, e: GEdge, cells: Route['cells'], routes: readonly Route[]): boolean {
  const occupied = new Map<string, Segment[]>()
  for (const r of routes) {
    const edge = p.graph.edges.find(n => n.id === r.edge), nodes = edge ? [edge.from, edge.to] : [r.edge]
    for (const c of r.cells) occupied.set(keyOf(c), [...(occupied.get(keyOf(c)) ?? []), { nodes, dirs: c.dirs }])
  }
  return cells.every(c => straightCrossing([...(occupied.get(keyOf(c)) ?? []), { nodes: [e.from, e.to], dirs: c.dirs }]))
}
// Match draw.ts's centered label text, leaving its padding available to the line; a keyed label's ink is its key box.
function labelInk(p: Placed, e: GEdge): Box[] {
  const b = p.boxes.get(`${e.id}:label`)
  if (!b || e.label === null) return []
  if (e.labelKey !== undefined) return [{ row: b.row, col: b.col, rows: 1, cols: width(e.labelKey) }]  // a key box is all ink
  const pieces = labelLines(e.label).flatMap(t => wrap(t, b.cols - 2) ?? [{ text: t, join: '' }])
  return pieces.map((piece, i) => ({ row: b.row + i, col: b.col + ((b.cols - width(piece.text)) >> 1),
    rows: 1, cols: width(piece.text) }))
}
const border = (c: Point, b: Box) => inside(c, b) ?
  ((c.r === b.row || c.r === b.row + b.rows - 1 ? 5 : 0) |
    (c.c === b.col || c.c === b.col + b.cols - 1 ? 10 : 0)) : 0

// The frames drawn as a border: every frame box but a frameless region's, which draws none, so an edge may run through it.
const walls = (p: Placed): Box[] => {
  const frameless = new Set(p.graph.clusters.filter(c => c.frameless).map(c => c.id))
  return [...p.frames].filter(([id]) => !frameless.has(id)).map(([, b]) => b)
}

// Whether c lies strictly inside frame box f, off its border; and the drawn frames that hold both of e's ends that way. An
// edge between nodes of one frame stays inside it (V6): a cell outside one of these, or on its border, is never used.
const within = (c: Point, f: Box) => c.r > f.row && c.r < f.row + f.rows - 1 && c.c > f.col && c.c < f.col + f.cols - 1
function fences(p: Placed, e: GEdge): Box[] {
  const held = (id: string, f: Box) => { const b = p.boxes.get(id) ?? p.frames.get(id)
    return !!b && within({ r: b.row, c: b.col }, f) && within({ r: b.row + b.rows - 1, c: b.col + b.cols - 1 }, f) }
  return walls(p).filter(f => held(e.from, f) && held(e.to, f))
}
const fenced = (fs: readonly Box[], c: Point) => fs.every(f => within(c, f))
// Whether e's cells cross each drawn frame's border only as its hold on e's ends needs: once when it holds one end,
// never when it holds neither or both. A frame never holds itself, so an edge ending at a frame never crosses it: its mark
// meets the border from outside. The validator rejects any other count (edge-crosses-frame), so a route that breaks it is
// refused here.
function crossesTrue(p: Placed, e: GEdge, cells: readonly Point[]): boolean {
  const frameless = new Set(p.graph.clusters.filter(c => c.frameless).map(c => c.id))
  const held = (id: string, f: Box) => { const b = p.boxes.get(id) ?? p.frames.get(id)
    return !!b && within({ r: b.row, c: b.col }, f) && within({ r: b.row + b.rows - 1, c: b.col + b.cols - 1 }, f) }
  return [...p.frames].every(([id, f]) => frameless.has(id) ||
    cells.filter(c => border(c, f) !== 0).length === (held(e.from, f) !== held(e.to, f) ? 1 : 0))
}

function detour(path: Point[], blocked: (c: Point) => boolean, p: Placed, pinned: Set<string>): Point[] | null {
  while (path.some(blocked)) {
    const hit = path.findIndex(blocked)
    let from = hit - 1, to = hit + 1
    while (to < path.length && blocked(path[to]!)) to++
    if (from < 0 || to >= path.length) return null
    // Leave the endpoint and the cell behind its glyph on the original stem.
    from = Math.max(1, from - 1)
    to = Math.min(path.length - 3, to + 1)
    while (to < path.length - 3 && blocked(path[to]!)) to++
    for (let i = from; i < hit; i++) if (pinned.has(keyOf(path[i]!))) from = i
    for (let i = hit + 1; i < to; i++) if (pinned.has(keyOf(path[i]!))) { to = i; break }
    if (from >= hit || to <= hit || blocked(path[from]!) || blocked(path[to]!)) return null
    const start = path[from]!, end = path[to]!
    const used = new Set([...path.slice(0, from), ...path.slice(to + 1)].map(keyOf))
    const queue = [start], previous = new Map<string, Point | null>([[keyOf(start), null]])
    for (let i = 0; i < queue.length && !previous.has(keyOf(end)); i++) {
      const c = queue[i]!
      for (const [dr, dc] of [[1, 0], [0, -1], [0, 1], [-1, 0]]) {
        const n = { r: c.r + dr!, c: c.c + dc! }, key = keyOf(n)
        if (n.r < 0 || n.r >= p.rows || n.c < 0 || n.c >= p.cols || blocked(n) || used.has(key) || previous.has(key)) continue
        previous.set(key, c)
        queue.push(n)
      }
    }
    if (!previous.has(keyOf(end))) return null
    const replacement: Point[] = []
    for (let c: Point | null = end; c; c = previous.get(keyOf(c))!) replacement.push(c)
    path.splice(from, to - from + 1, ...replacement.reverse())
  }
  return path
}

// May extend rows/cols for exterior routing lanes; node, label and frame boxes never move. A back edge with no dummy and no
// label routes first with the forward edges, in the nearest free column, so a 2-cycle draws as two parallel edges, not a long detour;
// else, as each back edge with a dummy or label, in an outside lane.
export function routeGraph(p: Placed): Route[] | Fail {
  const backs = p.graph.edges.filter(e => e.reversed && e.style !== 'invisible')
  const laned = (e: GEdge) => p.boxes.has(`${e.id}:label`) || [...p.boxes.keys()].some(id => id.startsWith(`${e.id}#`))
  if (backs.some(e => !laned(e))) {
    const trial = { ...p }, rs = routeWith(trial, backs.filter(laned))
    if (Array.isArray(rs)) { p.rows = trial.rows; p.cols = trial.cols; return rs }
  }
  return routeWith(p, backs)
}

// The edges in outside routed in outside lanes, the rest by channels, else by search.
function routeWith(p: Placed, outside: readonly GEdge[]): Route[] | Fail {
  const ids = new Set(outside.map(e => e.id)), byOrder = (a: Route, b: Route) =>
    p.graph.edges.find(e => e.id === a.edge)!.order - p.graph.edges.find(e => e.id === b.edge)!.order
  if (outside.length) {
    const forward = { ...p, graph: { ...p.graph, edges: p.graph.edges.filter(e => !ids.has(e.id)) } }
    const rs = routeWith(forward, [])
    p.rows = Math.max(p.rows, forward.rows); p.cols = Math.max(p.cols, forward.cols)
    if (!Array.isArray(rs)) return rs
    let needsReservation = false
    for (const e of outside) {
      const route = outsideRoute(p, e, rs)
      if (!route) { needsReservation = true; break }
      rs.push(route)
    }
    if (needsReservation) {
      const lanes: Route[] = []
      for (const e of outside) {
        const route = outsideRoute(p, e, lanes)
        if (!route) return fail('route-conflict')
        lanes.push(route)
      }
      const reserved = { ...p, graph: { ...p.graph, edges: p.graph.edges.filter(e => !ids.has(e.id)) } }
      const remaining = searchRoutes(reserved, false, lanes)
      p.rows = Math.max(p.rows, reserved.rows); p.cols = Math.max(p.cols, reserved.cols)
      if (!Array.isArray(remaining)) return remaining
      return remaining.sort(byOrder)
    }
    return rs.sort(byOrder)
  }
  const fast = channelsRoute(p)
  if (Array.isArray(fast)) return fast
  const searched = searchRoutes(p)
  return Array.isArray(searched) ? searched : searchRoutes(p, true)
}

function outsideRoute(p: Placed, e: GEdge, routes: Route[]): Route | null {
  const a = p.boxes.get(e.from) ?? p.frames.get(e.from), b = p.boxes.get(e.to) ?? p.frames.get(e.to)
  if (!a || !b) return null
  const across = p.graph.dir === 'LR' || p.graph.dir === 'RL'
  const main = (b: Box) => across ? b.col + (b.cols >> 1) : b.row + (b.rows >> 1)
  const cross = (b: Box, side: number) => across ? (side > 0 ? b.row + b.rows : b.row - 1) : (side > 0 ? b.col + b.cols : b.col - 1)
  const at = (m: number, x: number): Point => across ? { r: x, c: m } : { r: m, c: x }
  const occupied = new Map(routes.flatMap(r => [...r.cells.map(c => [keyOf(c), c.dirs] as const), ...r.ends.map(c => [keyOf(c), 0] as const)]))
  const frames = walls(p), fs = fences(p, e)
  const label = p.boxes.get(`${e.id}:label`), ink = labelInk(p, e)
  const boxes = routeObstacles(p, e)
  // V7: the lanes beside what lies inside the innermost frame holding both ends, where its layout left room for them.
  const room = fs.toSorted((u, v) => u.rows * u.cols - v.rows * v.cols)[0]
  const held = (b: Box) => !room || within({ r: b.row, c: b.col }, room) && within({ r: b.row + b.rows - 1, c: b.col + b.cols - 1 }, room)
  const near = (c: Point) => !room || within(c, room)
  const high = Math.max(...[...p.boxes.values(), ...frames].filter(held).map(b => across ? b.row + b.rows : b.col + b.cols),
    ...routes.flatMap(r => [...r.cells, ...r.ends].filter(near).map(c => (across ? c.r : c.c) + 1))) + 2
  const low = Math.min(...boxes.filter(held).map(b => across ? b.row : b.col), ...frames.filter(held).map(b => across ? b.row : b.col)) - 3
  const sides = [1, -1].sort((u, v) => Math.abs(cross(a, u) - (u > 0 ? high : low)) + Math.abs(cross(b, u) - (u > 0 ? high : low)) -
    Math.abs(cross(a, v) - (v > 0 ? high : low)) - Math.abs(cross(b, v) - (v > 0 ? high : low)))
  for (const side of sides) for (const [sourceSide, targetSide] of [[side, side], [side, -side], [-side, side]]) {
    const dummy = [...p.boxes].find(([id]) => id.startsWith(`${e.id}#`))?.[1]
    const lane = label ? (across ? label.row + (label.rows >> 1) : label.col + (label.cols >> 1))
      : dummy && side > 0 ? (across ? dummy.row : dummy.col) : side > 0 ? high : low
    if (label && side < 0) continue
    if (lane < 0) continue
    const am = main(a), bm = main(b), ax = cross(a, sourceSide!), bx = cross(b, targetSide!)
    const face = across ? (sourceSide! > 0 ? 2 : 0) : (sourceSide! > 0 ? 1 : 3)
    const targetFace = across ? (targetSide! > 0 ? 2 : 0) : (targetSide! > 0 ? 1 : 3)
    const along = across ? (bm > am ? 1 : 3) : (bm > am ? 2 : 0)
    const tailCell = at(am, ax), headCell = at(bm, bx)
    const start = e.tail === 'none' ? tailCell : move(tailCell, face), end = e.head === 'none' ? headCell : move(headCell, targetFace)
    const forbidden = new Set(routes.flatMap(r => r.ends.flatMap(h => r.cells.filter(c => Math.abs(c.r - h.r) + Math.abs(c.c - h.c) === 1).map(keyOf))))
    const blocked = (c: Point) => !fenced(fs, c) || boxes.some(b => inside(c, b)) || occupied.get(keyOf(c)) === 0 ||
      (e.tail !== 'none' && keyOf(c) === keyOf(tailCell)) || (e.head !== 'none' && keyOf(c) === keyOf(headCell))
    const allowed = (c: Point, dirs: number) => {
      const other = occupied.get(keyOf(c)), d = frames.reduce((d, b) => d | border(c, b), 0)
      if (d && d !== dirs || other !== undefined && (forbidden.has(keyOf(c)) || !(other === 5 && dirs === 10 || other === 10 && dirs === 5))) return false
      const inStem = keyOf(c) === keyOf(start) && e.tail !== 'none' || keyOf(c) === keyOf(end) && e.head !== 'none'
      return !(inStem && (dirs !== (across ? 5 : 10) || other !== undefined))
    }
    const rows = Math.max(p.rows, across ? lane + 3 : Math.max(am, bm) + 3), cols = Math.max(p.cols, across ? Math.max(am, bm) + 3 : lane + 3)
    const budget = { left: 3000 }, group = e.id
    if (blocked(start) || blocked(end)) continue
    const first = findPath({ at: start, face, group }, { at: at(am, lane), face: along, group }, blocked, allowed, rows, cols, budget)
    if (!first) continue
    const path = [...(e.tail === 'none' ? [] : [tailCell]), ...first]
    for (let m = am + Math.sign(bm - am); m !== bm; m += Math.sign(bm - am)) path.push(at(m, lane))
    const used = new Set(path.map(keyOf))
    const last = findPath({ at: at(bm, lane), face: along, group }, { at: end, face: back(targetFace), group },
      c => blocked(c) || used.has(keyOf(c)), allowed, rows, cols, budget)
    if (!last) continue
    path.push(...last, ...(e.head === 'none' ? [] : [headCell]))
    if (path.some(c => c.r < 0 || c.c < 0 || boxes.some(b => inside(c, b)) || !fenced(fs, c))) continue
    const before = at(am, ax - sourceSide!), after = at(bm, bx - targetSide!)
    const all = path.map((c, i) => ({ ...c, dirs: arm(c, path[i - 1] ?? before) | arm(c, path[i + 1] ?? after) }))
    const tail = all[0]!, head = all.at(-1)!, cells = all.slice(e.tail === 'none' ? 0 : 1, e.head === 'none' ? undefined : -1)
      .filter(c => !ink.some(b => inside(c, b)))
    const ends = [...(e.tail === 'none' ? [] : [{ ...tail, ch: endGlyph(e.tail, face) }]), ...(e.head === 'none' ? [] : [{ ...head, ch: endGlyph(e.head, targetFace) }])]
    if (ends.some(c => occupied.has(keyOf(c)) || frames.some(b => border(c, b)))) continue
    if (cells.some(c => !allowed(c, c.dirs)) || !crossingsFit(p, e, cells, routes) || !crossesTrue(p, e, cells)) continue
    if (new Set(path.map(keyOf)).size !== path.length) continue
    p.rows = Math.max(p.rows, ...path.map(c => c.r + 1)); p.cols = Math.max(p.cols, ...path.map(c => c.c + 1))
    return { edge: e.id, cells, ends, style: e.style as Route['style'] }
  }
  return null
}

type Port = { at: Point; face: number; group: string }
const steps = [{ r: -1, c: 0 }, { r: 0, c: 1 }, { r: 1, c: 0 }, { r: 0, c: -1 }]
const move = (p: Point, d: number): Point => ({ r: p.r + steps[d]!.r, c: p.c + steps[d]!.c })
const back = (d: number) => (d + 2) % 4
const bits = [1, 2, 4, 8]
type SearchCell = Point & { direction: number; previous: number }

// Weighted Manhattan search with directional states and a shared expansion budget. Never exponential.
function findPath(start: Port, end: Port, blocked: (c: Point) => boolean,
  allowed: (c: Point, dirs: number) => boolean, rows: number, cols: number, budget: { left: number }): Point[] | null {
  const queue: SearchCell[] = [{ ...start.at, direction: start.face, previous: -1 }]
  const seen = new Uint8Array(rows * cols * 4)
  seen[(start.at.r * cols + start.at.c) * 4 + start.face] = 1
  const heap: { index: number; cost: number }[] = []
  const costs = [0]
  const put = (index: number) => {
    const c = queue[index]!, entry = { index, cost: costs[index]! + 2 * (Math.abs(c.r - end.at.r) + Math.abs(c.c - end.at.c)) }
    let i = heap.length
    heap.push(entry)
    while (i > 0) { const parent = (i - 1) >> 1; if (heap[parent]!.cost <= entry.cost) break; heap[i] = heap[parent]!; i = parent }
    heap[i] = entry
  }
  const take = () => {
    const out = heap[0]!.index, last = heap.pop()!
    if (heap.length) {
      let i = 0
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1
        if (child + 1 < heap.length && heap[child + 1]!.cost < heap[child]!.cost) child++
        if (heap[child]!.cost >= last.cost) break
        heap[i] = heap[child]!; i = child
      }
      heap[i] = last
    }
    return out
  }
  put(0)
  let found = -1, remaining = Math.min(1500, 200 + 8 * (Math.abs(start.at.r - end.at.r) + Math.abs(start.at.c - end.at.c)))
  while (heap.length && remaining-- > 0 && budget.left-- > 0) {
    const i = take(), c = queue[i]!
    if (c.r === end.at.r && c.c === end.at.c && allowed(c, bits[back(c.direction)]! | bits[end.face]!)) { found = i; break }
    const dx = end.at.c - c.c, dy = end.at.r - c.r
    const choices = Math.abs(dx) > Math.abs(dy) ? [dx > 0 ? 1 : 3, dy > 0 ? 2 : 0, c.direction, 0, 1, 2, 3]
      : [dy > 0 ? 2 : 0, dx > 0 ? 1 : 3, c.direction, 0, 1, 2, 3]
    for (const d of choices.filter((d, i, a) => a.indexOf(d) === i && d !== back(c.direction))) {
      const n = move(c, d), key = (n.r * cols + n.c) * 4 + d
      if (n.r < 0 || n.c < 0 || n.r >= rows || n.c >= cols || seen[key] || blocked(n) ||
        !allowed(c, bits[back(c.direction)]! | bits[d]!)) continue
      seen[key] = 1
      queue.push({ ...n, direction: d, previous: i })
      costs.push(costs[i]! + 1 + (d === c.direction ? 0 : 0.25))
      put(queue.length - 1)
    }
  }
  if (found < 0) return null
  const path: Point[] = []
  for (let i = found; i >= 0; i = queue[i]!.previous) path.push({ r: queue[i]!.r, c: queue[i]!.c })
  return path.reverse()
}

function searchRoutes(p: Placed, constrainedFirst = false, reserved: Route[] = []): Route[] | Fail {
  const groups = mergeGroups(p)
  const edges = p.graph.edges.filter(e => e.style !== 'invisible').sort((a, b) => a.order - b.order)
  if (constrainedFirst) edges.sort((a, b) => Number(b.tail !== 'none') - Number(a.tail !== 'none') ||
    Number(b.label !== null) - Number(a.label !== null) || b.minlen - a.minlen || a.order - b.order)
  const routes: Route[] = [], ports = new Map<string, Point>(), budget = { left: 5000 }
  type Used = Segment & { from: string; to: string; ch?: string }
  const occupied = new Map<string, Used[]>(), protectedCells = new Set<string>()
  for (const r of reserved) {
    for (const c of [...r.cells, ...r.ends]) occupied.set(keyOf(c), [{ dirs: 'dirs' in c ? c.dirs : 0,
      ch: 'ch' in c ? c.ch : undefined, from: `reserved:${r.edge}`, to: `reserved:${r.edge}`, nodes: [r.edge] }])
    for (const h of r.ends) for (const c of r.cells) if (Math.abs(h.r - c.r) + Math.abs(h.c - c.c) === 1) protectedCells.add(keyOf(c))
  }
  const boxCells = new Map<string, string[]>(), margins = new Map<string, string[]>(), borders = new Map<string, number>()
  for (const [id, b] of p.boxes) for (let r = b.row - 1; r <= b.row + b.rows; r++) for (let c = b.col - 1; c <= b.col + b.cols; c++) {
    const key = `${r},${c}`
    margins.set(key, [...(margins.get(key) ?? []), id])
    if (inside({ r, c }, b)) boxCells.set(key, [...(boxCells.get(key) ?? []), id])
  }
  for (const b of walls(p)) for (let r = b.row; r < b.row + b.rows; r++) for (let c = b.col; c < b.col + b.cols; c++) {
    const d = border({ r, c }, b); if (d) borders.set(`${r},${c}`, (borders.get(`${r},${c}`) ?? 0) | d)
  }
  // Each node face's slots holding an end mark, by `${node}:${face}`.
  const marked = new Map<string, number[]>()
  const slotOf = (id: string, port: Port) => { const b = (p.boxes.get(id) ?? p.frames.get(id))!
    return port.face % 2 ? port.at.r - b.row : port.at.c - b.col }
  const titleCells = new Set<string>()
  for (const n of p.graph.clusters) {
    const b = p.frames.get(n.id)
    if (b && n.title !== null) for (let c = b.col + 2; c <= b.col + 3 + width(n.title); c++) titleCells.add(`${b.row},${c}`)
  }
  const title = (c: Point) => titleCells.has(keyOf(c))
  const candidates = (id: string, style: string, mark: string, preferred: number, net: string, target = false, from?: string): Port[] => {
    const b = p.boxes.get(id) ?? p.frames.get(id)
    if (!b) return []
    const out: Port[] = []
    // Of the two side faces, the one facing toward from comes first, so an end coming round a crowded face comes the short way.
    const o = from === undefined ? undefined : p.boxes.get(from) ?? p.frames.get(from)
    const toward = (f: number) => o ? steps[f]!.r * (2 * o.row + o.rows - 2 * b.row - b.rows) + steps[f]!.c * (2 * o.col + o.cols - 2 * b.col - b.cols) : 0
    const sides = [(preferred + 1) % 4, (preferred + 3) % 4].sort((u, v) => toward(v) - toward(u))
    for (const face of [preferred, ...sides, back(preferred)]) {
      const size = face % 2 ? b.rows : b.cols
      const group = `${net}:${id}:${face}:${style}:${mark}`, fixed = ports.get(group)
      // A mark beside another on this face reads as one wide mark (△△△): such slots come last, a cell apart first.
      const near = marked.get(`${id}:${face}`) ?? [], crowded = (i: number) => mark !== 'none' && (near.includes(i - 1) || near.includes(i + 1))
      const slots = Array.from({ length: size }, (_, i) => i).sort((a, b) => Number(crowded(a)) - Number(crowded(b)) ||
        Math.abs(a - middle(size)) - Math.abs(b - middle(size)) || b - a)
      for (const i of slots) {
        const at = face === 0 ? { r: b.row - 1, c: b.col + i } : face === 1 ? { r: b.row + i, c: b.col + b.cols }
          : face === 2 ? { r: b.row + b.rows, c: b.col + i } : { r: b.row + i, c: b.col - 1 }
        if (at.r < 0 || at.c < 0 || title(at) || fixed && keyOf(fixed) !== keyOf(at)) continue
        const incoming = edges.filter(e => e.to === id)
        if (target && new Set(incoming.map(e => e.from)).size > 1 &&
          incoming.every(e => edges.filter(n => n.from === e.from).length > 1) && incoming.some(e => {
          const source = p.boxes.get(e.from)
          return source && (face % 2 ? at.r === source.row + (source.rows >> 1) : at.c === source.col + (source.cols >> 1))
        })) continue
        if ([...ports].some(([g, c]) => g !== group && keyOf(c) === keyOf(at))) continue
        out.push({ at, face, group })
      }
    }
    return out
  }
  const tryRoute = (e: GEdge, source: Port, target: Port): Route | null => {
    const vertical = p.graph.dir === 'TB' || p.graph.dir === 'BT'
    const label = p.boxes.get(`${e.id}:label`)
    const ink = labelInk(p, e)
    const fs = fences(p, e)
    const blocked = (c: Point) => title(c) || !fenced(fs, c) || (margins.get(keyOf(c)) ?? []).some(id =>
      id !== e.from && id !== e.to && id !== `${e.id}:label` && !id.startsWith(`${e.id}#`)) ||
      (boxCells.get(keyOf(c)) ?? []).some(id => !id.startsWith(`${e.id}#`) && (id !== `${e.id}:label` ||
        ink.some(b => inside(c, b)) && (vertical ? c.c !== label!.col + (label!.cols >> 1) : c.r !== label!.row + (label!.rows >> 1))))
    const related = (u: Used) => u.from === source.group || u.to === target.group
    const incomingGap = gaps(p).find(g => g.axis === (target.face % 2 ? 'col' : 'row') &&
      g.from <= (target.face % 2 ? target.at.c : target.at.r) && g.to >= (target.face % 2 ? target.at.c : target.at.r))
    const nearTarget = (c: Point) => {
      const main = target.face % 2 ? c.c : c.r
      return incomingGap ? main >= incomingGap.from + (target.face === 0 || target.face === 3 ? 1 : 0) &&
        main <= incomingGap.to - (target.face === 1 || target.face === 2 ? 1 : 0)
        : Math.abs(main - (target.face % 2 ? target.at.c : target.at.r)) <= 2
    }
    const shareAt = (u: Used, c: Point) => u.from === source.group || u.to === target.group && nearTarget(c)
    const masks = new Map<string, number>()
    const allowed = (c: Point, dirs: number) => {
      const key = keyOf(c)
      let mask = masks.get(key)
      if (mask === undefined) {
        mask = 0
        const d = borders.get(key), protectedCell = protectedCells.has(key), used = occupied.get(key) ?? []
        for (const arms of [3, 5, 6, 9, 10, 12]) if ((d === undefined || d === arms) &&
          straightCrossing([...used, { nodes: [e.from, e.to], dirs: arms }]) && used.every(u => !u.ch && (
          shareAt(u, c) ? (!protectedCell || [5, 10].includes(u.dirs | arms))
            : !protectedCell && (u.dirs === 5 && arms === 10 || u.dirs === 10 && arms === 5)))) mask |= 1 << arms
        masks.set(key, mask)
      }
      return (mask & (1 << dirs)) !== 0
    }
    const glyph = endGlyph
    const markOK = (port: Port, mark: string) => !blocked(port.at) && walls(p).every(b => !border(port.at, b)) &&
      (occupied.get(keyOf(port.at)) ?? []).every(u => mark !== 'none' && u.ch === glyph(mark, port.face) && related(u))
    if (e.tail !== 'none' && !markOK(source, e.tail) || e.head !== 'none' && !markOK(target, e.head)) return null
    const start = e.tail === 'none' ? source.at : move(source.at, source.face)
    const end = e.head === 'none' ? target.at : move(target.at, target.face)
    const usable = (c: Point) => [3, 5, 6, 9, 10, 12].some(d => allowed(c, d))
    if (blocked(start) || blocked(end) || start.r < 0 || start.c < 0 || end.r < 0 || end.c < 0) return null
    for (const [c, port, mark] of [[start, source, e.tail], [end, target, e.head]] as const) {
      const n = move(c, port.face)
      if (mark !== 'none' && (n.r < 0 || n.c < 0 || blocked(n) || !allowed(c, port.face % 2 ? 10 : 5))) return null
    }
    for (const [c, port, mark] of [[start, source, e.tail], [end, target, e.head]] as const) {
      if (mark !== 'none' && (occupied.get(keyOf(c)) ?? []).some(u => u.ch ||
        ![5, 10].includes(u.dirs | (port.face % 2 ? 10 : 5)))) return null
    }
    const maxR = Math.max(p.rows, start.r + 4, end.r + 4), maxC = Math.max(p.cols, start.c + 4, end.c + 4)
    const direction = { TB: 2, BT: 0, LR: 1, RL: 3 }[p.graph.dir]
    const points = [...p.boxes].filter(([id]) => id.startsWith(`${e.id}#`))
      .sort((a, b) => Number(a[0].split('#').at(-1)) - Number(b[0].split('#').at(-1)))
      .map(([, b]) => ({ r: b.row, c: b.col }))
    if (label) {
      if (vertical) {
        for (let r = label.row; r < label.row + label.rows; r++) points.push({ r, c: label.col + (label.cols >> 1) })
      } else {
        const row = label.row + (label.rows >> 1)
        for (let c = label.col + 1; c < label.col + label.cols - 1; c++) points.push({ r: row, c })
      }
      points.sort((a, b) => direction === 0 ? b.r - a.r : direction === 1 ? a.c - b.c : direction === 2 ? a.r - b.r : b.c - a.c)
    }
    const path: Point[] = [], used = new Set<string>(), stops = [...points, end]
    let current = start, incoming = source.face
    const pointKeys = new Set(points.map(keyOf)), startKey = keyOf(start), endKey = keyOf(end)
    const sourceKey = keyOf(source.at), targetKey = keyOf(target.at)
    for (const [i, stop] of stops.entries()) {
      const future = new Set(stops.slice(i + 1).map(keyOf))
      if (!usable(current) || !usable(stop)) return null
      const last = i === stops.length - 1, outgoing = last ? back(target.face) : direction
      const part = findPath({ ...source, at: current, face: incoming }, { ...target, at: stop, face: outgoing },
        c => { const key = keyOf(c); return blocked(c) || used.has(key) || (e.tail !== 'none' && key === sourceKey) ||
          (e.head !== 'none' && key === targetKey) || future.has(key) },
        (c, dirs) => { const key = keyOf(c); return allowed(c, dirs) && (e.tail === 'none' || key !== startKey || dirs === (source.face % 2 ? 10 : 5)) &&
          (e.head === 'none' || key !== endKey || dirs === (target.face % 2 ? 10 : 5)) &&
          (!pointKeys.has(key) || dirs === (direction % 2 ? 10 : 5)) },
        Math.max(maxR, current.r + 3, stop.r + 3), Math.max(maxC, current.c + 3, stop.c + 3), budget)
      if (!part) return null
      path.push(...(i === 0 ? part : part.slice(1)))
      for (const c of part.slice(0, -1)) used.add(keyOf(c))
      current = stop; incoming = outgoing
    }
    if (new Set(path.map(keyOf)).size !== path.length) return null
    const before = e.tail === 'none' ? move(source.at, back(source.face)) : source.at
    const after = e.head === 'none' ? move(target.at, back(target.face)) : target.at
    const cells = path.map((c, i) => ({ ...c, dirs: arm(c, path[i - 1] ?? before) | arm(c, path[i + 1] ?? after) }))
      .filter(c => !ink.some(b => inside(c, b)))
    if (cells.some(c => ![3, 5, 6, 9, 10, 12].includes(c.dirs)) || !crossingsFit(p, e, cells, [...reserved, ...routes]) ||
      !crossesTrue(p, e, cells)) return null
    for (const other of routes) {
      const common = new Set<string>()
      for (let i = 0; i < Math.min(cells.length, other.cells.length); i++) {
        if (keyOf(cells[i]!) !== keyOf(other.cells[i]!)) break
        common.add(keyOf(cells[i]!))
      }
      for (let i = 1; i <= Math.min(cells.length, other.cells.length); i++) {
        if (keyOf(cells.at(-i)!) !== keyOf(other.cells.at(-i)!)) break
        if (!nearTarget(cells.at(-i)!)) break
        common.add(keyOf(cells.at(-i)!))
      }
      const theirs = new Map(other.cells.map(c => [keyOf(c), c.dirs]))
      if (cells.some(c => { const d = theirs.get(keyOf(c)); return d !== undefined && !common.has(keyOf(c)) &&
        !(c.dirs === 5 && d === 10 || c.dirs === 10 && d === 5) })) return null
    }
    const ends = []
    if (e.tail !== 'none') ends.push({ ...source.at, ch: glyph(e.tail, source.face) })
    if (e.head !== 'none') ends.push({ ...target.at, ch: glyph(e.head, target.face) })
    p.rows = Math.max(p.rows, ...[...cells, ...ends].map(c => c.r + 1))
    p.cols = Math.max(p.cols, ...[...cells, ...ends].map(c => c.c + 1))
    return { edge: e.id, style: e.style as Route['style'], cells, ends }
  }
  const preferred = { TB: 2, BT: 0, LR: 1, RL: 3 }[p.graph.dir]
  for (const e of edges) {
    const sources = candidates(e.from, e.style, e.tail, preferred, portOf(groups, e, 'tail'))
    const fanInOut = e.from !== e.to && e.tail === 'none' && edges.filter(n => n.from === e.from).length > 1 &&
      new Set(edges.filter(n => n.to === e.to).map(n => n.from)).size > 1
    const targets = candidates(e.to, e.style, e.head, back(preferred), portOf(groups, e, 'head'), true, e.from).filter(port =>
      !fanInOut || preferred % 2 !== 0 || port.face === back(preferred))
    let result: { route: Route; source: Port; target: Port } | null = null
    for (const source of sources) {
      // A back edge routed here takes the nearest slot across from its source on each face, so it runs straight.
      const faces = [...new Set(targets.map(t => t.face))], off = (t: Port) => t.face % 2 ? Math.abs(t.at.r - source.at.r) : Math.abs(t.at.c - source.at.c)
      for (const target of e.reversed ? targets.toSorted((u, v) => faces.indexOf(u.face) - faces.indexOf(v.face) || off(u) - off(v)) : targets) {
        if (budget.left <= 0) return fail('route-conflict')
        if (keyOf(source.at) === keyOf(target.at)) continue
        const route = tryRoute(e, source, target)
        if (route) { result = { route, source, target }; break }
      }
      if (result) break
    }
    if (!result) return fail('route-conflict')
    const { route, source, target } = result
    routes.push(route)
    ports.set(source.group, source.at); ports.set(target.group, target.at)
    for (const c of [...route.cells, ...route.ends]) {
      const key = keyOf(c), list = occupied.get(key) ?? []
      list.push({ dirs: 'dirs' in c ? c.dirs : 0, ch: 'ch' in c ? c.ch : undefined,
        from: source.group, to: target.group, nodes: [e.from, e.to] })
      occupied.set(key, list)
    }
    for (const [id, port, end] of [[e.from, source, e.tail], [e.to, target, e.head]] as const) if (end !== 'none') {
      const key = `${id}:${port.face}`; marked.set(key, [...(marked.get(key) ?? []), slotOf(id, port)]) }
    if (e.tail !== 'none') protectedCells.add(keyOf(move(source.at, source.face)))
    if (e.head !== 'none') protectedCells.add(keyOf(move(target.at, target.face)))
  }
  return [...reserved, ...routes.sort((a, b) => p.graph.edges.find(e => e.id === a.edge)!.order - p.graph.edges.find(e => e.id === b.edge)!.order)]
}

function channelsRoute(p: Placed): Route[] | Fail {
  const groups = mergeGroups(p)
  const edges = p.graph.edges.filter(e => e.style !== 'invisible').sort((a, b) => a.order - b.order)
  let across = p.graph.dir === 'LR' || p.graph.dir === 'RL'
  let sign = p.graph.dir === 'BT' || p.graph.dir === 'RL' ? -1 : 1
  const point = (m: number, x: number): Point => across ? { r: x, c: sign * m } : { r: sign * m, c: x }
  const titleCell = (c: Point) => p.graph.clusters.some(cluster => {
    const f = p.frames.get(cluster.id)
    return f && cluster.title !== null && c.r === f.row && c.c >= f.col + 2 && c.c <= f.col + 3 + width(cluster.title)
  })
  const port = (id: string, source: boolean, style: string, end: string, group: string): number => {
    const b = (p.boxes.get(id) ?? p.frames.get(id))!
    const peers = edges.filter(e => (source ? e.from : e.to) === id)
    const keys = [...new Set(peers.map(e => `${portOf(groups, e, source ? 'tail' : 'head')}:${e.style}:${source ? e.tail : e.head}`))]
    const index = keys.indexOf(`${group}:${style}:${end}`)
    const size = across ? b.rows : b.cols, low = across ? b.row : b.col
    if (keys.length > size) return NaN
    const slots = Array.from({ length: size }, (_, i) => i).sort((a, b) =>
      Math.abs(a - middle(size)) - Math.abs(b - middle(size)) || b - a)
    const offset = source ? slots[index]! : keys.length === 1 ? middle(size) : Math.floor((index + 1) * size / (keys.length + 1))
    if (source) {
      const face = sign === 1 ? (across ? b.col + b.cols : b.row + b.rows) : -(across ? b.col : b.row) + 1
      const candidates = Array.from({ length: size }, (_, i) => low + i)
        .sort((a, b) => Math.abs(a - low - offset) - Math.abs(b - low - offset) || a - b)
      return candidates.find(x => !titleCell(point(face, x))) ?? low + offset
    }
    const manySources = new Set(peers.map(e => e.from)).size > 1 && peers.every(e => edges.filter(n => n.from === e.from).length > 1)
    const blocked = new Set(edges.filter(e => (manySources || !peers.some(n => n.from === e.from)) && e.from !== id)
      .filter(e => { const a = p.boxes.get(e.from) ?? p.frames.get(e.from)!;
        const target = p.boxes.get(peers[0]!.from) ?? p.frames.get(peers[0]!.from)!;
        return across ? a.col === target.col : a.row === target.row })
      .map(e => port(e.from, true, e.style, e.tail, portOf(groups, e, 'tail'))))
    const candidates = Array.from({ length: size }, (_, i) => low + i)
      .sort((a, b) => Math.abs(a - low - offset) - Math.abs(b - low - offset) || a - b)
    const face = sign === 1 ? (across ? b.col : b.row) : -(across ? b.col + b.cols - 1 : b.row + b.rows - 1)
    const clear = (x: number) => [1, 2, 3].every(d => ![...p.boxes.values()].some(b => inside(point(face - d, x), b)))
    if (peers.length === 1 && keys.length === 1) {
      const e = peers[0]!, label = p.boxes.get(`${e.id}:label`)
      const x = label ? (across ? label.row + (label.rows >> 1) : label.col + (label.cols >> 1)) : port(e.from, true, e.style, e.tail, portOf(groups, e, 'tail'))
      if (x >= low && x < low + size && !blocked.has(x) && clear(x)) return x
    }
    if (manySources) {
      const sourcePorts = peers.map(e => port(e.from, true, e.style, e.tail, portOf(groups, e, 'tail'))).sort((a, b) => a - b)
      const mean = (sourcePorts[0]! + sourcePorts.at(-1)!) / 2
      candidates.sort((a, b) => Math.abs(a - low - offset) - Math.abs(b - low - offset) ||
        (low + offset < mean ? a - b : b - a))
    }
    return candidates.find(x => !blocked.has(x) && clear(x)) ?? candidates.find(clear) ?? low + offset
  }
  const rawGaps = gaps(p), tracks = new Map<string, Map<string, number>>()
  const routes: Route[] = []
  for (const e of edges) {
    const a = p.boxes.get(e.from) ?? p.frames.get(e.from), b = p.boxes.get(e.to) ?? p.frames.get(e.to)
    if (!a || !b) return fail('route-conflict')
    const local = p.graph.clusters.filter(c => c.dir !== null && rawGaps.some(g => g.block === c.id))
      .filter(c => { const f = p.frames.get(c.id)!; return inside({ r: a.row, c: a.col }, f) && inside({ r: b.row, c: b.col }, f) })
      .sort((u, v) => { const a = p.frames.get(u.id)!, b = p.frames.get(v.id)!; return a.rows * a.cols - b.rows * b.cols })[0]
    const dir = local?.dir ?? p.graph.dir
    across = dir === 'LR' || dir === 'RL'
    sign = dir === 'BT' || dir === 'RL' ? -1 : 1
    const channels = rawGaps.filter(g => g.block === (local?.id ?? null)).map(g => ({ ...g,
      from: sign === 1 ? g.from : -g.to, to: sign === 1 ? g.to : -g.from,
    }))
    const start = sign === 1 ? (across ? a.col + a.cols : a.row + a.rows) : -(across ? a.col : a.row) + 1
    const finish = sign === 1 ? (across ? b.col : b.row) - 1 : -(across ? b.col + b.cols : b.row + b.rows)
    const sx = port(e.from, true, e.style, e.tail, portOf(groups, e, 'tail'))
    const tx = port(e.to, false, e.style, e.head, portOf(groups, e, 'head'))
    if (!Number.isFinite(sx) || !Number.isFinite(tx)) return fail('route-conflict')
    const waypoints = [...p.boxes].filter(([id]) => id.startsWith(`${e.id}#`))
      .map(([, b]) => ({ m: sign * (across ? b.col : b.row), x: across ? b.row : b.col }))
      .sort((a, b) => a.m - b.m)
    const label = p.boxes.get(`${e.id}:label`)
    if (label) {
      const low = sign === 1 ? (across ? label.col : label.row)
        : -(across ? label.col + label.cols - 1 : label.row + label.rows - 1)
      const x = across ? label.row + (label.rows >> 1) : label.col + (label.cols >> 1)
      for (let m = low; m <= low + (across ? label.cols : label.rows); m++) waypoints.push({ m, x })
      waypoints.sort((a, b) => a.m - b.m)
    }
    const stops = [...waypoints, { m: finish, x: tx }]
    const path: Point[] = [], net = `${portOf(groups, e, 'tail')}:${e.from}:${e.style}:${e.tail}`
    let m = start, x = sx
    for (const [i, stop] of stops.entries()) {
      const gap = channels.find(g => g.axis === (across ? 'col' : 'row') && g.from >= m && g.to < stop.m)
        ?? channels.find(g => g.axis === (across ? 'col' : 'row') && g.from <= m && g.to >= stop.m)
      const key = `${gap?.block}:${gap?.from ?? m}:${gap?.to ?? stop.m}`
      const nets = tracks.get(key) ?? new Map<string, number>()
      tracks.set(key, nets)
      const fan = across && edges.filter(n => n.from === e.from && n.style === e.style && n.tail === e.tail).length > 1
      const firstTrack = Math.max(gap?.from ?? m, m + (i === 0 && (e.tail !== 'none' || e.tailLabel !== undefined || fan) ? 2 : i === 0 && across && a.rows > 1 ? 1 : 0))
      if (x !== stop.x && !nets.has(net)) {
        let track = Math.max(firstTrack, ...[...nets.values()].map(n => n + 1))
        const obstacles = routeObstacles(p, e)
        while (track < stop.m && Array.from({ length: Math.abs(x - stop.x) + 1 }, (_, k) => point(track, Math.min(x, stop.x) + k))
          .some(c => obstacles.some(b => inside(c, b)) || walls(p).some(b => {
            const d = border(c, b)
            return d !== 0 && (d !== (across ? 5 : 10) || (across ? c.r : c.c) === x || (across ? c.r : c.c) === stop.x)
          }))) track++
        nets.set(net, track)
      }
      let track = x === stop.x ? m : nets.get(net)!
      if (i === stops.length - 1 && edges.filter(n => n.from === e.from).length === 1) {
        const incoming = routes.filter(r => { const n = edges.find(n => n.id === r.edge)!;
          return portOf(groups, n, 'head') === portOf(groups, e, 'head') && n.to === e.to && n.style === e.style && n.head === e.head })
        const previous = incoming.flatMap(r => r.cells).filter(c => (across ? c.dirs === 5 : c.dirs === 10))
          .map(c => sign * (across ? c.c : c.r)).filter(n => n >= firstTrack && n < stop.m - 1)
        if (previous.length) track = Math.min(...previous)
      }
      if (track > stop.m - (i === stops.length - 1 ? 2 : 1)) return fail('route-conflict')
      for (; m <= track; m++) path.push(point(m, x))
      while (x !== stop.x) { x += Math.sign(stop.x - x); path.push(point(track, x)) }
      for (; m < stop.m; m++) path.push(point(m, x))
    }
    const head = point(finish, tx)
    let tail = point(start, sx), side = 0
    path.push(head)
    const obstacles = routeObstacles(p, e)
    if (e.tail !== 'none' && walls(p).some(b => border(tail, b) & 5)) {
      const low = across ? a.row : a.col, high = low + (across ? a.rows : a.cols)
      const main = sign * (across ? a.col + (a.cols >> 1) : a.row + (a.rows >> 1))
      const choices = [-1, 1].sort((u, v) => Math.abs((u < 0 ? low - 3 : high + 2) - stops[0]!.x)
        - Math.abs((v < 0 ? low - 3 : high + 2) - stops[0]!.x))
      for (const direction of choices) {
        const cross = direction < 0 ? low - 1 : high, outer = cross + 2 * direction
        const sameColumn = path.findIndex(c => (across ? c.r : c.c) === outer && sign * (across ? c.c : c.r) >= start + 2)
        const join = sameColumn >= 0 ? sameColumn : path.findIndex(c => sign * (across ? c.c : c.r) >= start + 1 &&
          walls(p).every(b => !border(c, b)))
        if (join < 0) continue
        const prefix = [point(main, cross), point(main, cross + direction), point(main, outer)]
        const end = sign * (across ? path[join]!.c : path[join]!.r), target = across ? path[join]!.r : path[join]!.c
        for (let m = main + 1; m <= end; m++) prefix.push(point(m, outer))
        for (let x = outer + Math.sign(target - outer); x !== target; x += Math.sign(target - outer)) prefix.push(point(end, x))
        if (outer === target) prefix.pop()
        if (prefix.some(c => c.r < 0 || c.r >= p.rows || c.c < 0 || c.c >= p.cols ||
          titleCell(c) || obstacles.some(b => inside(c, b)))) continue
        path.splice(0, join, ...prefix)
        tail = prefix[0]!
        side = direction
        break
      }
      if (!side) return fail('route-conflict')
    }
    const pinned = new Set(waypoints.map(d => keyOf(point(d.m, d.x))))
    if (!detour(path, c => titleCell(c) || obstacles.some(b => inside(c, b)), p, pinned)) return fail('route-conflict')
    if (path.some(c => c.r < 0 || c.c < 0 || c.r >= p.rows || c.c >= p.cols)) return fail('route-conflict')
    if (new Set(path.map(keyOf)).size !== path.length || path.some((c, i) => i > 0 &&
      Math.abs(c.r - path[i - 1]!.r) + Math.abs(c.c - path[i - 1]!.c) !== 1)) return fail('route-conflict')
    let visited = -1
    for (const waypoint of waypoints) {
      const index = path.findIndex(c => keyOf(c) === keyOf(point(waypoint.m, waypoint.x)))
      if (index <= visited) return fail('route-conflict')
      visited = index
    }
    if (e.head !== 'none') path.pop()
    if (e.tail !== 'none') path.shift()
    const before = e.tail === 'none' ? point(start - 1, sx) : tail
    const after = e.head === 'none' ? point(finish + 1, tx) : head
    const ink = labelInk(p, e)
    const cells = path.map((c, i) => ({ ...c,
      dirs: arm(c, path[i - 1] ?? before) | arm(c, path[i + 1] ?? after),
    })).filter(c => !ink.some(b => inside(c, b)))
    // The side of its node each end sits on: a head before its target, a tail past its source, or a tail moved to a side face.
    const nodeSide = (forward: boolean) => across ? ((sign === 1) === forward ? 3 : 1) : ((sign === 1) === forward ? 0 : 2)
    const ends = []
    if (e.tail !== 'none') ends.push({ ...tail, ch: endGlyph(e.tail, side ? (across ? (side < 0 ? 0 : 2) : (side < 0 ? 3 : 1)) : nodeSide(false)) })
    if (e.head !== 'none') ends.push({ ...head, ch: endGlyph(e.head, nodeSide(true)) })
    const fs = fences(p, e)
    if (ends.some(c => walls(p).some(b => border(c, b))) || [...cells, ...ends].some(c => !fenced(fs, c)) ||
      cells.some(c => walls(p).some(b => { const d = border(c, b); return d !== 0 && d !== c.dirs }))) {
      return fail('route-conflict')
    }
    if (!crossingsFit(p, e, cells, routes) || !crossesTrue(p, e, cells)) return fail('route-conflict')
    for (const other of routes) {
      const edge = edges.find(n => n.id === other.edge)!
      const related = groups.get(e.id) === groups.get(edge.id) &&
        (e.from === edge.from && e.tail === edge.tail || e.to === edge.to && e.head === edge.head)
      const occupied = new Map(other.cells.map(c => [keyOf(c), c.dirs]))
      if (ends.some(c => occupied.has(keyOf(c))) || other.ends.some(c => cells.some(n => keyOf(c) === keyOf(n)))) {
        return fail('route-conflict')
      }
      const common = new Set<string>()
      if (related) {
        if (e.from === edge.from && e.tail === edge.tail) for (let i = 0; i < Math.min(cells.length, other.cells.length); i++) {
          if (keyOf(cells[i]!) !== keyOf(other.cells[i]!)) break
          common.add(keyOf(cells[i]!))
        }
        if (e.to === edge.to && e.head === edge.head) for (let i = 1; i <= Math.min(cells.length, other.cells.length); i++) {
          if (keyOf(cells.at(-i)!) !== keyOf(other.cells.at(-i)!)) break
          const c = cells.at(-i)!, main = sign * (across ? c.c : c.r)
          const gap = channels.find(g => g.from <= finish && g.to >= finish)
          if (main < Math.max(gap?.from ?? start, start + (edges.filter(n => n.from === e.from).length > 1 ? 1 : 0))) break
          common.add(keyOf(c))
        }
      }
      for (const c of cells) {
        const d = occupied.get(keyOf(c))
        if (d === undefined) continue
        const protectedStem = [...ends, ...other.ends].some(h => Math.abs(h.r - c.r) + Math.abs(h.c - c.c) === 1)
        if (protectedStem && ![5, 10].includes(d | c.dirs)) return fail('route-conflict')
        if (!common.has(keyOf(c)) && !(d === 5 && c.dirs === 10 || d === 10 && c.dirs === 5)) return fail('route-conflict')
      }
    }
    routes.push({ edge: e.id, cells, ends, style: e.style as Route['style'] })
  }
  return routes
}
