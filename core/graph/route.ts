// Route in increasing main-axis coordinates; transpose/mirror only at cell boundaries.
import { fail } from '../fail.ts'
import type { Fail } from '../fail.ts'
import { width } from '../width.ts'
import { gaps } from './gaps.ts'
import type { Box, Placed } from './layered.ts'

export type Route = { edge: string; cells: readonly { r: number; c: number; dirs: number }[]
  ends: readonly { r: number; c: number; ch: string }[]; style: 'solid' | 'dotted' | 'thick' }
type Point = { r: number; c: number }
const arm = (a: Point, b: Point) => b.r < a.r ? 1 : b.c > a.c ? 2 : b.r > a.r ? 4 : 8

const inside = (c: Point, b: Box) => c.r >= b.row && c.r < b.row + b.rows && c.c >= b.col && c.c < b.col + b.cols
const keyOf = (c: Point) => `${c.r},${c.c}`
const border = (c: Point, b: Box) => inside(c, b) ?
  ((c.r === b.row || c.r === b.row + b.rows - 1 ? 5 : 0) |
    (c.c === b.col || c.c === b.col + b.cols - 1 ? 10 : 0)) : 0

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

export function routeGraph(p: Placed): Route[] | Fail {
  const edges = p.graph.edges.filter(e => e.style !== 'invisible').sort((a, b) => a.order - b.order)
  let across = p.graph.dir === 'LR' || p.graph.dir === 'RL'
  let sign = p.graph.dir === 'BT' || p.graph.dir === 'RL' ? -1 : 1
  const point = (m: number, x: number): Point => across ? { r: x, c: sign * m } : { r: sign * m, c: x }
  const titleCell = (c: Point) => p.graph.clusters.some(cluster => {
    const f = p.frames.get(cluster.id)
    return f && cluster.title !== null && c.r === f.row && c.c >= f.col + 2 && c.c <= f.col + 3 + width(cluster.title)
  })
  const port = (id: string, source: boolean, style: string, end: string): number => {
    const b = (p.boxes.get(id) ?? p.frames.get(id))!
    const peers = edges.filter(e => (source ? e.from : e.to) === id)
    const keys = [...new Set(peers.map(e => `${e.style}:${source ? e.tail : e.head}`))]
    const index = keys.indexOf(`${style}:${end}`)
    const size = across ? b.rows : b.cols, low = across ? b.row : b.col
    if (keys.length > size) return NaN
    const offset = source ? (size >> 1) + (index % 2 ? 1 : -1) * Math.ceil(index / 2)
      : Math.floor((index + 1) * size / (keys.length + 1))
    if (source) {
      const face = sign === 1 ? (across ? b.col + b.cols : b.row + b.rows) : -(across ? b.col : b.row) + 1
      const candidates = Array.from({ length: size }, (_, i) => low + i)
        .sort((a, b) => Math.abs(a - low - offset) - Math.abs(b - low - offset) || a - b)
      return candidates.find(x => !titleCell(point(face, x))) ?? low + offset
    }
    const blocked = new Set(edges.filter(e => !peers.some(n => n.from === e.from))
      .map(e => port(e.from, true, e.style, e.tail)))
    const candidates = Array.from({ length: size }, (_, i) => low + i)
      .sort((a, b) => Math.abs(a - low - offset) - Math.abs(b - low - offset) || a - b)
    const face = sign === 1 ? (across ? b.col : b.row) : -(across ? b.col + b.cols - 1 : b.row + b.rows - 1)
    const clear = (x: number) => [1, 2, 3].every(d => ![...p.boxes.values()].some(b => inside(point(face - d, x), b)))
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
    const sx = port(e.from, true, e.style, e.tail)
    const tx = port(e.to, false, e.style, e.head)
    if (!Number.isFinite(sx) || !Number.isFinite(tx)) return fail('route-conflict')
    const waypoints = [...p.boxes].filter(([id]) => id.startsWith(`${e.id}#`))
      .map(([, b]) => ({ m: sign * (across ? b.col : b.row), x: across ? b.row : b.col }))
      .sort((a, b) => a.m - b.m)
    const label = p.boxes.get(`${e.id}:label`)
    if (label) {
      const low = sign === 1 ? (across ? label.col : label.row)
        : -(across ? label.col + label.cols - 1 : label.row + label.rows - 1)
      const x = (across ? label.row + label.rows : label.col + label.cols)
      waypoints.push({ m: low, x }, { m: low + (across ? label.cols : label.rows), x })
      waypoints.sort((a, b) => a.m - b.m)
    }
    const stops = [...waypoints, { m: finish, x: tx }]
    const path: Point[] = [], net = `${e.from}:${e.style}:${e.tail}`
    let m = start, x = sx
    for (const [i, stop] of stops.entries()) {
      const gap = channels.find(g => g.axis === (across ? 'col' : 'row') && g.from >= m && g.to < stop.m)
        ?? channels.find(g => g.axis === (across ? 'col' : 'row') && g.from <= m && g.to >= stop.m)
      const key = `${gap?.block}:${gap?.from ?? m}:${gap?.to ?? stop.m}`
      const nets = tracks.get(key) ?? new Map<string, number>()
      tracks.set(key, nets)
      const firstTrack = Math.max(gap?.from ?? m, m + (i === 0 && e.tail !== 'none' ? 2 : 0))
      if (x !== stop.x && !nets.has(net)) {
        let track = Math.max(firstTrack, ...[...nets.values()].map(n => n + 1))
        while (track < stop.m && [...p.frames.values()].some(b =>
          Array.from({ length: Math.abs(x - stop.x) + 1 }, (_, k) => point(track, Math.min(x, stop.x) + k))
            .some(c => { const d = border(c, b); return d !== 0 && (d !== (across ? 5 : 10) ||
              (across ? c.r : c.c) === x || (across ? c.r : c.c) === stop.x) }))) track++
        nets.set(net, track)
      }
      const track = x === stop.x ? m : nets.get(net)!
      if (track > stop.m - (i === stops.length - 1 ? 2 : 1)) return fail('route-conflict')
      for (; m <= track; m++) path.push(point(m, x))
      while (x !== stop.x) { x += Math.sign(stop.x - x); path.push(point(track, x)) }
      for (; m < stop.m; m++) path.push(point(m, x))
    }
    const head = point(finish, tx)
    let tail = point(start, sx), side = 0
    path.push(head)
    const obstacles = [...p.boxes].filter(([id]) => !id.startsWith(`${e.id}#`)).map(([, b]) => b)
    if (e.tail !== 'none' && [...p.frames.values()].some(b => border(tail, b) & 5)) {
      const low = across ? a.row : a.col, high = low + (across ? a.rows : a.cols)
      const main = sign * (across ? a.col + (a.cols >> 1) : a.row + (a.rows >> 1))
      const choices = [-1, 1].sort((u, v) => Math.abs((u < 0 ? low - 3 : high + 2) - stops[0]!.x)
        - Math.abs((v < 0 ? low - 3 : high + 2) - stops[0]!.x))
      for (const direction of choices) {
        const cross = direction < 0 ? low - 1 : high, outer = cross + 2 * direction
        const sameColumn = path.findIndex(c => (across ? c.r : c.c) === outer && sign * (across ? c.c : c.r) >= start + 2)
        const join = sameColumn >= 0 ? sameColumn : path.findIndex(c => sign * (across ? c.c : c.r) >= start + 1 &&
          [...p.frames.values()].every(b => !border(c, b)))
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
    if (e.head !== 'none') path.pop()
    if (e.tail !== 'none') path.shift()
    const before = e.tail === 'none' ? point(start - 1, sx) : tail
    const after = e.head === 'none' ? point(finish + 1, tx) : head
    const cells = path.map((c, i) => ({ ...c,
      dirs: arm(c, path[i - 1] ?? before) | arm(c, path[i + 1] ?? after),
    }))
    const glyph = (end: string, forward: boolean) => end === 'circle' ? 'o' : end === 'cross' ? 'x'
      : across ? ((sign === 1) === forward ? '►' : '◄') : ((sign === 1) === forward ? '▼' : '▲')
    const ends = []
    if (e.tail !== 'none') ends.push({ ...tail, ch: e.tail === 'arrow' && side
      ? (across ? (side < 0 ? '▼' : '▲') : (side < 0 ? '►' : '◄')) : glyph(e.tail, false) })
    if (e.head !== 'none') ends.push({ ...head, ch: glyph(e.head, true) })
    if (ends.some(c => [...p.frames.values()].some(b => border(c, b))) ||
      cells.some(c => [...p.frames.values()].some(b => { const d = border(c, b); return d !== 0 && d !== c.dirs }))) {
      return fail('route-conflict')
    }
    for (const other of routes) {
      const edge = edges.find(n => n.id === other.edge)!
      const related = e.style === edge.style && (e.from === edge.from && e.tail === edge.tail || e.to === edge.to && e.head === edge.head)
      if (related) continue
      const occupied = new Map(other.cells.map(c => [keyOf(c), c.dirs]))
      for (const c of cells) {
        const d = occupied.get(keyOf(c))
        const protectedStem = [...ends, ...other.ends].some(h => Math.abs(h.r - c.r) + Math.abs(h.c - c.c) === 1)
        if (d !== undefined && (protectedStem || !(d === 5 && c.dirs === 10 || d === 10 && c.dirs === 5))) return fail('route-conflict')
      }
      if (ends.some(c => occupied.has(keyOf(c))) || other.ends.some(c => cells.some(n => keyOf(c) === keyOf(n)))) {
        return fail('route-conflict')
      }
    }
    routes.push({ edge: e.id, cells, ends, style: e.style as Route['style'] })
  }
  return routes
}
