// The channel router: each edge runs down the gaps between rank bands, turning across in a track of its gap, with a
// breadth-first detour around anything in the way. The fast first try; any conflict sends the whole graph to search.
import { fail } from '../fail.ts'
import type { Fail } from '../fail.ts'
import { width } from '../width.ts'
import { gaps } from './gaps.ts'
import type { Box, Placed } from './layered.ts'
import {
  arm,
  border,
  crossesTrue,
  crossingsFit,
  endGlyph,
  fenced,
  fences,
  inside,
  keyOf,
  labelInk,
  mergeGroups,
  middle,
  portOf,
  routeObstacles,
  walls,
} from './route-base.ts'
import type { Point, Route } from './route-base.ts'

function detour(path: Point[], blocked: (c: Point) => boolean, p: Placed, pinned: Set<string>): Point[] | null {
  while (path.some(blocked)) {
    const hit = path.findIndex(blocked)
    let from = hit - 1
    let to = hit + 1
    while (to < path.length && blocked(path[to]!)) {
      to++
    }

    if (from < 0 || to >= path.length) {
      return null
    }
    // Leave the endpoint and the cell behind its glyph on the original stem.
    from = Math.max(1, from - 1)
    to = Math.min(path.length - 3, to + 1)
    while (to < path.length - 3 && blocked(path[to]!)) {
      to++
    }

    for (let i = from; i < hit; i++) {
      if (pinned.has(keyOf(path[i]!))) {
        from = i
      }
    }

    for (let i = hit + 1; i < to; i++) {
      if (pinned.has(keyOf(path[i]!))) {
        to = i
        break
      }
    }

    if (from >= hit || to <= hit || blocked(path[from]!) || blocked(path[to]!)) {
      return null
    }

    const start = path[from]!
    const end = path[to]!
    const used = new Set([...path.slice(0, from), ...path.slice(to + 1)].map(keyOf))
    const queue = [start]
    const previous = new Map<string, Point | null>([[keyOf(start), null]])
    for (let i = 0; i < queue.length && !previous.has(keyOf(end)); i++) {
      const c = queue[i]!
      for (const [dr, dc] of [
        [1, 0],
        [0, -1],
        [0, 1],
        [-1, 0],
      ]) {
        const n = { r: c.r + dr!, c: c.c + dc! }
        const key = keyOf(n)
        if (n.r < 0 || n.r >= p.rows || n.c < 0 || n.c >= p.cols || blocked(n) || used.has(key) || previous.has(key)) {
          continue
        }

        previous.set(key, c)
        queue.push(n)
      }
    }

    if (!previous.has(keyOf(end))) {
      return null
    }

    const replacement: Point[] = []
    for (let c: Point | null = end; c; c = previous.get(keyOf(c))!) {
      replacement.push(c)
    }

    path.splice(from, to - from + 1, ...replacement.reverse())
  }

  return path
}

export function channelsRoute(p: Placed): Route[] | Fail {
  const groups = mergeGroups(p)
  const edges = p.graph.edges.filter((e) => e.style !== 'invisible').sort((a, b) => a.order - b.order)
  let across = p.graph.dir === 'LR' || p.graph.dir === 'RL'
  let sign = p.graph.dir === 'BT' || p.graph.dir === 'RL' ? -1 : 1
  const point = (m: number, x: number): Point => (across ? { r: x, c: sign * m } : { r: sign * m, c: x })
  // A box's near edge and its length along the main axis, and the cross-axis line through its middle.
  const mainEdge = (b: Box) => (across ? b.col : b.row)
  const mainSize = (b: Box) => (across ? b.cols : b.rows)
  const crossMiddle = (b: Box) => (across ? b.row + (b.rows >> 1) : b.col + (b.cols >> 1))
  // The first main-axis line past box b, and b's own first line, in the signed coordinates point takes.
  const pastLine = (b: Box) => (sign === 1 ? mainEdge(b) + mainSize(b) : -mainEdge(b) + 1)
  const firstLine = (b: Box) => (sign === 1 ? mainEdge(b) : -(mainEdge(b) + mainSize(b) - 1))
  const titleCell = (c: Point) =>
    p.graph.clusters.some((cluster) => {
      const f = p.frames.get(cluster.id)
      return f && cluster.title !== null && c.r === f.row && c.c >= f.col + 2 && c.c <= f.col + 3 + width(cluster.title)
    })
  const port = (id: string, source: boolean, style: string, end: string, group: string): number => {
    const b = (p.boxes.get(id) ?? p.frames.get(id))!
    const peers = edges.filter((e) => (source ? e.from : e.to) === id)
    const keys = [
      ...new Set(
        peers.map((e) => `${portOf(groups, e, source ? 'tail' : 'head')}:${e.style}:${source ? e.tail : e.head}`),
      ),
    ]
    const index = keys.indexOf(`${group}:${style}:${end}`)
    const size = across ? b.rows : b.cols
    const low = across ? b.row : b.col
    if (keys.length > size) {
      return NaN
    }

    const slots = Array.from({ length: size }, (_, i) => i).sort(
      (a, b) => Math.abs(a - middle(size)) - Math.abs(b - middle(size)) || b - a,
    )
    let offset: number
    if (source) {
      offset = slots[index]!
    } else if (keys.length === 1) {
      offset = middle(size)
    } else {
      offset = Math.floor(((index + 1) * size) / (keys.length + 1))
    }

    if (source) {
      const face = pastLine(b)
      const candidates = Array.from({ length: size }, (_, i) => low + i).sort(
        (a, b) => Math.abs(a - low - offset) - Math.abs(b - low - offset) || a - b,
      )
      return candidates.find((x) => !titleCell(point(face, x))) ?? low + offset
    }

    const manySources =
      new Set(peers.map((e) => e.from)).size > 1 &&
      peers.every((e) => edges.filter((n) => n.from === e.from).length > 1)
    const blocked = new Set(
      edges
        .filter((e) => (manySources || !peers.some((n) => n.from === e.from)) && e.from !== id)
        .filter((e) => {
          const a = p.boxes.get(e.from) ?? p.frames.get(e.from)!
          const target = p.boxes.get(peers[0]!.from) ?? p.frames.get(peers[0]!.from)!
          return across ? a.col === target.col : a.row === target.row
        })
        .map((e) => port(e.from, true, e.style, e.tail, portOf(groups, e, 'tail'))),
    )
    const candidates = Array.from({ length: size }, (_, i) => low + i).sort(
      (a, b) => Math.abs(a - low - offset) - Math.abs(b - low - offset) || a - b,
    )
    const face = firstLine(b)
    const clear = (x: number) =>
      [1, 2, 3].every((d) => ![...p.boxes.values()].some((b) => inside(point(face - d, x), b)))
    if (peers.length === 1 && keys.length === 1) {
      const e = peers[0]!
      const label = p.boxes.get(`${e.id}:label`)
      const x = label ? crossMiddle(label) : port(e.from, true, e.style, e.tail, portOf(groups, e, 'tail'))
      if (x >= low && x < low + size && !blocked.has(x) && clear(x)) {
        return x
      }
    }

    if (manySources) {
      const sourcePorts = peers
        .map((e) => port(e.from, true, e.style, e.tail, portOf(groups, e, 'tail')))
        .sort((a, b) => a - b)
      const mean = (sourcePorts[0]! + sourcePorts.at(-1)!) / 2
      candidates.sort(
        (a, b) => Math.abs(a - low - offset) - Math.abs(b - low - offset) || (low + offset < mean ? a - b : b - a),
      )
    }

    return candidates.find((x) => !blocked.has(x) && clear(x)) ?? candidates.find(clear) ?? low + offset
  }
  const rawGaps = gaps(p)
  const tracks = new Map<string, Map<string, number>>()
  const routes: Route[] = []
  for (const e of edges) {
    const a = p.boxes.get(e.from) ?? p.frames.get(e.from)
    const b = p.boxes.get(e.to) ?? p.frames.get(e.to)
    if (!a || !b) {
      return fail('route-conflict')
    }

    const local = p.graph.clusters
      .filter((c) => c.dir !== null && rawGaps.some((g) => g.block === c.id))
      .filter((c) => {
        const f = p.frames.get(c.id)!
        return inside({ r: a.row, c: a.col }, f) && inside({ r: b.row, c: b.col }, f)
      })
      .sort((u, v) => {
        const a = p.frames.get(u.id)!
        const b = p.frames.get(v.id)!
        return a.rows * a.cols - b.rows * b.cols
      })[0]
    const dir = local?.dir ?? p.graph.dir
    across = dir === 'LR' || dir === 'RL'
    sign = dir === 'BT' || dir === 'RL' ? -1 : 1
    const channels = rawGaps
      .filter((g) => g.block === (local?.id ?? null))
      .map((g) => ({ ...g, from: sign === 1 ? g.from : -g.to, to: sign === 1 ? g.to : -g.from }))
    const start = pastLine(a)
    const finish = sign === 1 ? (across ? b.col : b.row) - 1 : -(across ? b.col + b.cols : b.row + b.rows)
    const sx = port(e.from, true, e.style, e.tail, portOf(groups, e, 'tail'))
    const tx = port(e.to, false, e.style, e.head, portOf(groups, e, 'head'))
    if (!Number.isFinite(sx) || !Number.isFinite(tx)) {
      return fail('route-conflict')
    }

    const waypoints = [...p.boxes]
      .filter(([id]) => id.startsWith(`${e.id}#`))
      .map(([, b]) => ({ m: sign * (across ? b.col : b.row), x: across ? b.row : b.col }))
      .sort((a, b) => a.m - b.m)
    const label = p.boxes.get(`${e.id}:label`)
    if (label) {
      const low = firstLine(label)
      const x = crossMiddle(label)
      for (let m = low; m <= low + (across ? label.cols : label.rows); m++) {
        waypoints.push({ m, x })
      }

      waypoints.sort((a, b) => a.m - b.m)
    }

    const stops = [...waypoints, { m: finish, x: tx }]
    const path: Point[] = []
    const net = `${portOf(groups, e, 'tail')}:${e.from}:${e.style}:${e.tail}`
    let m = start
    let x = sx
    for (const [i, stop] of stops.entries()) {
      const gap =
        channels.find((g) => g.axis === (across ? 'col' : 'row') && g.from >= m && g.to < stop.m) ??
        channels.find((g) => g.axis === (across ? 'col' : 'row') && g.from <= m && g.to >= stop.m)
      const key = `${gap?.block}:${gap?.from ?? m}:${gap?.to ?? stop.m}`
      const nets = tracks.get(key) ?? new Map<string, number>()
      tracks.set(key, nets)
      const fan =
        across && edges.filter((n) => n.from === e.from && n.style === e.style && n.tail === e.tail).length > 1
      // Room before the first turn: two cells after a tail mark, a tail label or a fan, one beside a tall source when
      // ranks run across.
      let stem = 0
      if (i === 0 && (e.tail !== 'none' || e.tailLabel !== undefined || fan)) {
        stem = 2
      } else if (i === 0 && across && a.rows > 1) {
        stem = 1
      }

      const firstTrack = Math.max(gap?.from ?? m, m + stem)
      if (x !== stop.x && !nets.has(net)) {
        let track = Math.max(firstTrack, ...[...nets.values()].map((n) => n + 1))
        const obstacles = routeObstacles(p, e)
        while (
          track < stop.m &&
          Array.from({ length: Math.abs(x - stop.x) + 1 }, (_, k) => point(track, Math.min(x, stop.x) + k)).some(
            (c) =>
              obstacles.some((b) => inside(c, b)) ||
              walls(p).some((b) => {
                const d = border(c, b)
                return (
                  d !== 0 && (d !== (across ? 5 : 10) || (across ? c.r : c.c) === x || (across ? c.r : c.c) === stop.x)
                )
              }),
          )
        ) {
          track++
        }

        nets.set(net, track)
      }

      let track = x === stop.x ? m : nets.get(net)!
      if (i === stops.length - 1 && edges.filter((n) => n.from === e.from).length === 1) {
        const incoming = routes.filter((r) => {
          const n = edges.find((n) => n.id === r.edge)!
          return (
            portOf(groups, n, 'head') === portOf(groups, e, 'head') &&
            n.to === e.to &&
            n.style === e.style &&
            n.head === e.head
          )
        })
        const previous = incoming
          .flatMap((r) => r.cells)
          .filter((c) => (across ? c.dirs === 5 : c.dirs === 10))
          .map((c) => sign * (across ? c.c : c.r))
          .filter((n) => n >= firstTrack && n < stop.m - 1)
        if (previous.length) {
          track = Math.min(...previous)
        }
      }

      if (track > stop.m - (i === stops.length - 1 ? 2 : 1)) {
        return fail('route-conflict')
      }

      for (; m <= track; m++) {
        path.push(point(m, x))
      }

      while (x !== stop.x) {
        x += Math.sign(stop.x - x)
        path.push(point(track, x))
      }

      for (; m < stop.m; m++) {
        path.push(point(m, x))
      }
    }

    const head = point(finish, tx)
    let tail = point(start, sx)
    let side = 0
    path.push(head)
    const obstacles = routeObstacles(p, e)
    if (e.tail !== 'none' && walls(p).some((b) => border(tail, b) & 5)) {
      const low = across ? a.row : a.col
      const high = low + (across ? a.rows : a.cols)
      const main = sign * (across ? a.col + (a.cols >> 1) : a.row + (a.rows >> 1))
      const choices = [-1, 1].sort(
        (u, v) =>
          Math.abs((u < 0 ? low - 3 : high + 2) - stops[0]!.x) - Math.abs((v < 0 ? low - 3 : high + 2) - stops[0]!.x),
      )
      for (const direction of choices) {
        const cross = direction < 0 ? low - 1 : high
        const outer = cross + 2 * direction
        const sameColumn = path.findIndex(
          (c) => (across ? c.r : c.c) === outer && sign * (across ? c.c : c.r) >= start + 2,
        )
        const join =
          sameColumn >= 0
            ? sameColumn
            : path.findIndex((c) => sign * (across ? c.c : c.r) >= start + 1 && walls(p).every((b) => !border(c, b)))
        if (join < 0) {
          continue
        }

        const prefix = [point(main, cross), point(main, cross + direction), point(main, outer)]
        const end = sign * (across ? path[join]!.c : path[join]!.r)
        const target = across ? path[join]!.r : path[join]!.c
        for (let m = main + 1; m <= end; m++) {
          prefix.push(point(m, outer))
        }

        for (let x = outer + Math.sign(target - outer); x !== target; x += Math.sign(target - outer)) {
          prefix.push(point(end, x))
        }

        if (outer === target) {
          prefix.pop()
        }

        if (
          prefix.some(
            (c) =>
              c.r < 0 ||
              c.r >= p.rows ||
              c.c < 0 ||
              c.c >= p.cols ||
              titleCell(c) ||
              obstacles.some((b) => inside(c, b)),
          )
        ) {
          continue
        }

        path.splice(0, join, ...prefix)
        tail = prefix[0]!
        side = direction
        break
      }

      if (!side) {
        return fail('route-conflict')
      }
    }

    const pinned = new Set(waypoints.map((d) => keyOf(point(d.m, d.x))))
    if (!detour(path, (c) => titleCell(c) || obstacles.some((b) => inside(c, b)), p, pinned)) {
      return fail('route-conflict')
    }

    if (path.some((c) => c.r < 0 || c.c < 0 || c.r >= p.rows || c.c >= p.cols)) {
      return fail('route-conflict')
    }

    if (
      new Set(path.map(keyOf)).size !== path.length ||
      path.some((c, i) => i > 0 && Math.abs(c.r - path[i - 1]!.r) + Math.abs(c.c - path[i - 1]!.c) !== 1)
    ) {
      return fail('route-conflict')
    }

    let visited = -1
    for (const waypoint of waypoints) {
      const index = path.findIndex((c) => keyOf(c) === keyOf(point(waypoint.m, waypoint.x)))
      if (index <= visited) {
        return fail('route-conflict')
      }

      visited = index
    }

    if (e.head !== 'none') {
      path.pop()
    }

    if (e.tail !== 'none') {
      path.shift()
    }

    const before = e.tail === 'none' ? point(start - 1, sx) : tail
    const after = e.head === 'none' ? point(finish + 1, tx) : head
    const ink = labelInk(p, e)
    const cells = path
      .map((c, i) => ({ ...c, dirs: arm(c, path[i - 1] ?? before) | arm(c, path[i + 1] ?? after) }))
      .filter((c) => !ink.some((b) => inside(c, b)))
    // The side of its node each end sits on: a head before its target, a tail past its source, or a tail moved to a
    // side face.
    const nodeSide = (forward: boolean) => {
      const near = (sign === 1) === forward
      if (across) {
        return near ? 3 : 1
      }

      return near ? 0 : 2
    }
    // The side face a moved tail sits on, by the direction it moved: above or below when ranks run across, else left
    // or right.
    const sideFace = (direction: number) => {
      if (across) {
        return direction < 0 ? 0 : 2
      }

      return direction < 0 ? 3 : 1
    }
    const ends = []
    if (e.tail !== 'none') {
      ends.push({ ...tail, ch: endGlyph(e.tail, side ? sideFace(side) : nodeSide(false)) })
    }

    if (e.head !== 'none') {
      ends.push({ ...head, ch: endGlyph(e.head, nodeSide(true)) })
    }

    const fs = fences(p, e)
    if (
      ends.some((c) => walls(p).some((b) => border(c, b))) ||
      [...cells, ...ends].some((c) => !fenced(fs, c)) ||
      cells.some((c) =>
        walls(p).some((b) => {
          const d = border(c, b)
          return d !== 0 && d !== c.dirs
        }),
      )
    ) {
      return fail('route-conflict')
    }

    if (!crossingsFit(p, e, cells, routes) || !crossesTrue(p, e, cells)) {
      return fail('route-conflict')
    }

    for (const other of routes) {
      const edge = edges.find((n) => n.id === other.edge)!
      const related =
        groups.get(e.id) === groups.get(edge.id) &&
        ((e.from === edge.from && e.tail === edge.tail) || (e.to === edge.to && e.head === edge.head))
      const occupied = new Map(other.cells.map((c) => [keyOf(c), c.dirs]))
      if (
        ends.some((c) => occupied.has(keyOf(c))) ||
        other.ends.some((c) => cells.some((n) => keyOf(c) === keyOf(n)))
      ) {
        return fail('route-conflict')
      }

      const common = new Set<string>()
      if (related) {
        if (e.from === edge.from && e.tail === edge.tail) {
          for (let i = 0; i < Math.min(cells.length, other.cells.length); i++) {
            if (keyOf(cells[i]!) !== keyOf(other.cells[i]!)) {
              break
            }

            common.add(keyOf(cells[i]!))
          }
        }

        if (e.to === edge.to && e.head === edge.head) {
          for (let i = 1; i <= Math.min(cells.length, other.cells.length); i++) {
            if (keyOf(cells.at(-i)!) !== keyOf(other.cells.at(-i)!)) {
              break
            }

            const c = cells.at(-i)!
            const main = sign * (across ? c.c : c.r)
            const gap = channels.find((g) => g.from <= finish && g.to >= finish)
            if (
              main < Math.max(gap?.from ?? start, start + (edges.filter((n) => n.from === e.from).length > 1 ? 1 : 0))
            ) {
              break
            }

            common.add(keyOf(c))
          }
        }
      }

      for (const c of cells) {
        const d = occupied.get(keyOf(c))
        if (d === undefined) {
          continue
        }

        const protectedStem = [...ends, ...other.ends].some((h) => Math.abs(h.r - c.r) + Math.abs(h.c - c.c) === 1)
        if (protectedStem && ![5, 10].includes(d | c.dirs)) {
          return fail('route-conflict')
        }

        if (!common.has(keyOf(c)) && !((d === 5 && c.dirs === 10) || (d === 10 && c.dirs === 5))) {
          return fail('route-conflict')
        }
      }
    }

    routes.push({ edge: e.id, cells, ends, style: e.style as Route['style'] })
  }

  return routes
}
