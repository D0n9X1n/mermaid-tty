// The search router: each edge in turn tries its candidate port slots and searches a path between them around what is
// already placed. The fallback when the channel router fails, and the router for edges beside reserved lanes.
import { fail } from '../fail.ts'
import type { Fail } from '../fail.ts'
import { gaps } from './gaps.ts'
import type { Box, Placed } from './layered.ts'
import type { GEdge } from './model.ts'
import { back, findPath, move, steps } from './find-path.ts'
import type { Port } from './find-path.ts'
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
  straightCrossing,
  titleCells,
  walls,
  within,
} from './route-base.ts'
import type { Point, Route, Segment } from './route-base.ts'

// How many times the rescue's second pass routes again, each time with the edge it got stuck on first.
const RIP_TRIES = 4
// The cell just outside box b on face (0 above, 1 right, 2 below, 3 left), at slot i along that face.
function slotCell(b: Box, face: number, i: number): Point {
  if (face === 0) {
    return { r: b.row - 1, c: b.col + i }
  }

  if (face === 1) {
    return { r: b.row + i, c: b.col + b.cols }
  }

  if (face === 2) {
    return { r: b.row + b.rows, c: b.col + i }
  }

  return { r: b.row + i, c: b.col - 1 }
}

// Points in the order an edge meets them running in direction 0 up, 1 right, 2 down, 3 left.
const ALONG: readonly ((a: Point, b: Point) => number)[] = [
  (a, b) => b.r - a.r,
  (a, b) => a.c - b.c,
  (a, b) => a.r - b.r,
  (a, b) => b.c - a.c,
]

// Every path search in one call shares a budget of 5000 steps, so a dense graph fails fast instead of searching on. An
// edge's first source slot may spend all of it on targets it never reaches. With work, the rescue pass's shared budget,
// the first edge that runs it out gets one refill of 5000 and tries its source slots again, each held to an even share
// of what is left over the slots not yet tried, so a later slot gets its turn. A slot's share bounds every path search
// it runs, and what it spends, its one step past zero included, comes off the shared budget; so one call spends at most
// twice 5000 steps. Every step, the refill's too, also comes off work, and the search stops when work is spent.
export function searchRoutes(
  p: Placed,
  constrainedFirst = false,
  reserved: Route[] = [],
  work?: { left: number; rip?: boolean },
): Route[] | Fail {
  // With work.rip, the rescue's second pass: each edge the search gets stuck on routes first next time, up to RIP_TRIES
  // times, so an edge an earlier one walled in gets its turn before it. Never twice for one edge, and never past work.
  const tries = work?.rip ? RIP_TRIES : 1
  const first: string[] = []
  const size = { rows: p.rows, cols: p.cols }
  for (let t = 0; t < tries; t++) {
    p.rows = size.rows
    p.cols = size.cols
    const r = searchOnce(p, constrainedFirst, reserved, work, first)
    if (Array.isArray(r)) {
      return r
    }

    if (r.stuck === undefined || first.includes(r.stuck) || (work && work.left <= 0)) {
      break
    }

    first.unshift(r.stuck)
  }

  p.rows = size.rows
  p.cols = size.cols
  return fail('route-conflict')
}

// One search over every edge, those named in first routed first, in that order: the routes, or the edge it got stuck
// on.
function searchOnce(
  p: Placed,
  constrainedFirst: boolean,
  reserved: Route[],
  work: { left: number } | undefined,
  first: readonly string[],
): Route[] | { stuck: string } {
  const groups = mergeGroups(p)
  const edges = p.graph.edges.filter((e) => e.style !== 'invisible').sort((a, b) => a.order - b.order)
  if (constrainedFirst) {
    edges.sort(
      (a, b) =>
        Number(b.tail !== 'none') - Number(a.tail !== 'none') ||
        Number(b.label !== null) - Number(a.label !== null) ||
        b.minlen - a.minlen ||
        a.order - b.order,
    )
  }

  if (first.length) {
    const rank = (e: GEdge) => (first.includes(e.id) ? first.indexOf(e.id) : first.length)
    edges.sort((a, b) => rank(a) - rank(b))
  }

  const routes: Route[] = []
  const ports = new Map<string, Point>()
  const budget = { left: 5000 }
  let refilled = false
  type Used = Segment & { from: string; to: string; ch?: string }
  const occupied = new Map<string, Used[]>()
  const protectedCells = new Set<string>()
  for (const r of reserved) {
    for (const c of [...r.cells, ...r.ends]) {
      occupied.set(keyOf(c), [
        {
          dirs: 'dirs' in c ? c.dirs : 0,
          ch: 'ch' in c ? c.ch : undefined,
          from: `reserved:${r.edge}`,
          to: `reserved:${r.edge}`,
          nodes: [r.edge],
        },
      ])
    }

    for (const h of r.ends) {
      for (const c of r.cells) {
        if (Math.abs(h.r - c.r) + Math.abs(h.c - c.c) === 1) {
          protectedCells.add(keyOf(c))
        }
      }
    }
  }

  const boxCells = new Map<string, string[]>()
  const margins = new Map<string, string[]>()
  const borders = new Map<string, number>()
  for (const [id, b] of p.boxes) {
    for (let r = b.row - 1; r <= b.row + b.rows; r++) {
      for (let c = b.col - 1; c <= b.col + b.cols; c++) {
        const key = `${r},${c}`
        margins.set(key, [...(margins.get(key) ?? []), id])
        if (inside({ r, c }, b)) {
          boxCells.set(key, [...(boxCells.get(key) ?? []), id])
        }
      }
    }
  }

  for (const b of walls(p)) {
    for (let r = b.row; r < b.row + b.rows; r++) {
      for (let c = b.col; c < b.col + b.cols; c++) {
        const d = border({ r, c }, b)
        if (d) {
          borders.set(`${r},${c}`, (borders.get(`${r},${c}`) ?? 0) | d)
        }
      }
    }
  }
  // Each node face's slots holding an end mark, by `${node}:${face}`.
  const marked = new Map<string, number[]>()
  const slotOf = (id: string, port: Port) => {
    const b = (p.boxes.get(id) ?? p.frames.get(id))!
    return port.face % 2 ? port.at.r - b.row : port.at.c - b.col
  }
  const titles = titleCells(p)
  const title = (c: Point) => titles.has(keyOf(c))
  const frameless = new Set(p.graph.clusters.filter((c) => c.frameless).map((c) => c.id))
  // Whether frame f holds the box of id strictly inside its border.
  const holds = (f: Box, id: string) => {
    const b = p.boxes.get(id) ?? p.frames.get(id)
    return !!b && within({ r: b.row, c: b.col }, f) && within({ r: b.row + b.rows - 1, c: b.col + b.cols - 1 }, f)
  }
  const candidates = (
    id: string,
    style: string,
    mark: string,
    preferred: number,
    net: string,
    target = false,
    from?: string,
  ): Port[] => {
    const b = p.boxes.get(id) ?? p.frames.get(id)
    if (!b) {
      return []
    }

    const out: Port[] = []
    // Of the two side faces, the one facing toward from comes first, so an end coming round a crowded face comes the
    // short way.
    const o = from === undefined ? undefined : (p.boxes.get(from) ?? p.frames.get(from))
    const toward = (f: number) =>
      o
        ? steps[f]!.r * (2 * o.row + o.rows - 2 * b.row - b.rows) +
          steps[f]!.c * (2 * o.col + o.cols - 2 * b.col - b.cols)
        : 0
    const sides = [(preferred + 1) % 4, (preferred + 3) % 4].sort((u, v) => toward(v) - toward(u))
    for (const face of [preferred, ...sides, back(preferred)]) {
      const size = face % 2 ? b.rows : b.cols
      const group = `${net}:${id}:${face}:${style}:${mark}`
      const fixed = ports.get(group)
      // A mark beside another on this face reads as one wide mark (△△△): such slots come last, a cell apart first.
      const near = marked.get(`${id}:${face}`) ?? []
      const crowded = (i: number) => mark !== 'none' && (near.includes(i - 1) || near.includes(i + 1))
      const slots = Array.from({ length: size }, (_, i) => i).sort(
        (a, b) =>
          Number(crowded(a)) - Number(crowded(b)) || Math.abs(a - middle(size)) - Math.abs(b - middle(size)) || b - a,
      )
      for (const i of slots) {
        const at = slotCell(b, face, i)
        if (at.r < 0 || at.c < 0 || title(at) || (fixed && keyOf(fixed) !== keyOf(at))) {
          continue
        }

        const incoming = edges.filter((e) => e.to === id)
        if (
          target &&
          new Set(incoming.map((e) => e.from)).size > 1 &&
          incoming.every((e) => edges.filter((n) => n.from === e.from).length > 1) &&
          incoming.some((e) => {
            const source = p.boxes.get(e.from)
            return (
              source && (face % 2 ? at.r === source.row + (source.rows >> 1) : at.c === source.col + (source.cols >> 1))
            )
          })
        ) {
          continue
        }

        if ([...ports].some(([g, c]) => g !== group && keyOf(c) === keyOf(at))) {
          continue
        }

        out.push({ at, face, group })
      }
    }

    return out
  }
  // spend is the budget this try's path searches draw on: the shared one, or in the refill the source slot's share.
  const tryRoute = (e: GEdge, source: Port, target: Port, spend: { left: number }): Route | null => {
    const vertical = p.graph.dir === 'TB' || p.graph.dir === 'BT'
    const label = p.boxes.get(`${e.id}:label`)
    const ink = labelInk(p, e)
    const fs = fences(p, e)
    // A drawn frame that holds neither end, nor is one, is a wall to this edge, inside and border: a path through it is
    // one crossesTrue refuses, so the search goes round it from the start instead of finding only that path.
    const drawnFrames = [...p.frames].filter(([id]) => id !== e.from && id !== e.to && !frameless.has(id))
    const shut = drawnFrames.filter(([, f]) => !holds(f, e.from) && !holds(f, e.to)).map(([, f]) => f)
    // A frame that holds one end is crossed once, by the leg of the route that runs between a point outside it and one
    // inside. Every other leg keeps to its side: a leg from outside to outside goes round it, as the shortest way
    // through would cross it twice more; one from inside to inside stays in. A leg with an end on the border may cross
    // there, so it keeps to neither.
    const once = drawnFrames.filter(([, f]) => holds(f, e.from) !== holds(f, e.to)).map(([, f]) => f)
    const sided = (from: Point, to: Point) => {
      const out = once.filter((f) => !inside(from, f) && !inside(to, f))
      const kept = once.filter((f) => within(from, f) && within(to, f))
      return (c: Point) => out.some((f) => inside(c, f)) || kept.some((f) => !within(c, f))
    }
    const blocked = (c: Point) =>
      shut.some((f) => inside(c, f)) ||
      (stems.has(keyOf(c)) && keyOf(c) !== keyOf(move(target.at, target.face))) ||
      title(c) ||
      !fenced(fs, c) ||
      (margins.get(keyOf(c)) ?? []).some(
        (id) => id !== e.from && id !== e.to && id !== `${e.id}:label` && !id.startsWith(`${e.id}#`),
      ) ||
      (boxCells.get(keyOf(c)) ?? []).some(
        (id) =>
          !id.startsWith(`${e.id}#`) &&
          (id !== `${e.id}:label` ||
            (ink.some((b) => inside(c, b)) &&
              (vertical ? c.c !== label!.col + (label!.cols >> 1) : c.r !== label!.row + (label!.rows >> 1)))),
      )
    const related = (u: Used) => u.from === source.group || u.to === target.group
    const incomingGap = gaps(p).find(
      (g) =>
        g.axis === (target.face % 2 ? 'col' : 'row') &&
        g.from <= (target.face % 2 ? target.at.c : target.at.r) &&
        g.to >= (target.face % 2 ? target.at.c : target.at.r),
    )
    const nearTarget = (c: Point) => {
      const main = target.face % 2 ? c.c : c.r
      return incomingGap
        ? main >= incomingGap.from + (target.face === 0 || target.face === 3 ? 1 : 0) &&
            main <= incomingGap.to - (target.face === 1 || target.face === 2 ? 1 : 0)
        : Math.abs(main - (target.face % 2 ? target.at.c : target.at.r)) <= 2
    }
    const shareAt = (u: Used, c: Point) => u.from === source.group || (u.to === target.group && nearTarget(c))
    const masks = new Map<string, number>()
    const allowed = (c: Point, dirs: number) => {
      const key = keyOf(c)
      let mask = masks.get(key)
      if (mask === undefined) {
        mask = 0
        const d = borders.get(key)
        const protectedCell = protectedCells.has(key)
        const used = occupied.get(key) ?? []
        for (const arms of [3, 5, 6, 9, 10, 12]) {
          if (
            (d === undefined || d === arms) &&
            straightCrossing([...used, { nodes: [e.from, e.to], dirs: arms }]) &&
            used.every(
              (u) =>
                !u.ch &&
                (shareAt(u, c)
                  ? !protectedCell || [5, 10].includes(u.dirs | arms)
                  : !protectedCell && ((u.dirs === 5 && arms === 10) || (u.dirs === 10 && arms === 5))),
            )
          ) {
            mask |= 1 << arms
          }
        }

        masks.set(key, mask)
      }

      return (mask & (1 << dirs)) !== 0
    }
    const glyph = endGlyph
    const markOK = (port: Port, mark: string) =>
      !blocked(port.at) &&
      walls(p).every((b) => !border(port.at, b)) &&
      (occupied.get(keyOf(port.at)) ?? []).every(
        (u) => mark !== 'none' && u.ch === glyph(mark, port.face) && related(u),
      )
    if ((e.tail !== 'none' && !markOK(source, e.tail)) || (e.head !== 'none' && !markOK(target, e.head))) {
      return null
    }

    const start = e.tail === 'none' ? source.at : move(source.at, source.face)
    const end = e.head === 'none' ? target.at : move(target.at, target.face)
    const usable = (c: Point) => [3, 5, 6, 9, 10, 12].some((d) => allowed(c, d))
    if (blocked(start) || blocked(end) || start.r < 0 || start.c < 0 || end.r < 0 || end.c < 0) {
      return null
    }

    for (const [c, port, mark] of [
      [start, source, e.tail],
      [end, target, e.head],
    ] as const) {
      const n = move(c, port.face)
      if (mark !== 'none' && (n.r < 0 || n.c < 0 || blocked(n) || !allowed(c, port.face % 2 ? 10 : 5))) {
        return null
      }
    }

    for (const [c, port, mark] of [
      [start, source, e.tail],
      [end, target, e.head],
    ] as const) {
      if (
        mark !== 'none' &&
        (occupied.get(keyOf(c)) ?? []).some((u) => u.ch || ![5, 10].includes(u.dirs | (port.face % 2 ? 10 : 5)))
      ) {
        return null
      }
    }

    const maxR = Math.max(p.rows, start.r + 4, end.r + 4)
    const maxC = Math.max(p.cols, start.c + 4, end.c + 4)
    const direction = { TB: 2, BT: 0, LR: 1, RL: 3 }[p.graph.dir]
    const points = [...p.boxes]
      .filter(([id]) => id.startsWith(`${e.id}#`))
      .sort((a, b) => Number(a[0].split('#').at(-1)) - Number(b[0].split('#').at(-1)))
      .map(([, b]) => ({ r: b.row, c: b.col }))
    if (label) {
      if (vertical) {
        for (let r = label.row; r < label.row + label.rows; r++) {
          points.push({ r, c: label.col + (label.cols >> 1) })
        }
      } else {
        const row = label.row + (label.rows >> 1)
        for (let c = label.col + 1; c < label.col + label.cols - 1; c++) {
          points.push({ r: row, c })
        }
      }

      points.sort(ALONG[direction]!)
    }

    const path: Point[] = []
    const used = new Set<string>()
    const stops = [...points, end]
    let current = start
    let incoming = source.face
    const pointKeys = new Set(points.map(keyOf))
    const startKey = keyOf(start)
    const endKey = keyOf(end)
    const sourceKey = keyOf(source.at)
    const targetKey = keyOf(target.at)
    for (const [i, stop] of stops.entries()) {
      const future = new Set(stops.slice(i + 1).map(keyOf))
      if (!usable(current) || !usable(stop)) {
        return null
      }

      const last = i === stops.length - 1
      const outgoing = last ? back(target.face) : direction
      const side = sided(current, stop)
      const part = findPath(
        { ...source, at: current, face: incoming },
        { ...target, at: stop, face: outgoing },
        (c) => {
          const key = keyOf(c)
          return (
            blocked(c) ||
            side(c) ||
            used.has(key) ||
            (e.tail !== 'none' && key === sourceKey) ||
            (e.head !== 'none' && key === targetKey) ||
            future.has(key)
          )
        },
        (c, dirs) => {
          const key = keyOf(c)
          return (
            allowed(c, dirs) &&
            (e.tail === 'none' || key !== startKey || dirs === (source.face % 2 ? 10 : 5)) &&
            (e.head === 'none' || key !== endKey || dirs === (target.face % 2 ? 10 : 5)) &&
            (!pointKeys.has(key) || dirs === (direction % 2 ? 10 : 5))
          )
        },
        Math.max(maxR, current.r + 3, stop.r + 3),
        Math.max(maxC, current.c + 3, stop.c + 3),
        spend,
        work,
      )
      if (!part) {
        return null
      }

      path.push(...(i === 0 ? part : part.slice(1)))
      for (const c of part.slice(0, -1)) {
        used.add(keyOf(c))
      }

      current = stop
      incoming = outgoing
    }

    if (new Set(path.map(keyOf)).size !== path.length) {
      return null
    }

    const before = e.tail === 'none' ? move(source.at, back(source.face)) : source.at
    const after = e.head === 'none' ? move(target.at, back(target.face)) : target.at
    const cells = path
      .map((c, i) => ({ ...c, dirs: arm(c, path[i - 1] ?? before) | arm(c, path[i + 1] ?? after) }))
      .filter((c) => !ink.some((b) => inside(c, b)))
    if (
      cells.some((c) => ![3, 5, 6, 9, 10, 12].includes(c.dirs)) ||
      !crossingsFit(p, e, cells, [...reserved, ...routes]) ||
      !crossesTrue(p, e, cells)
    ) {
      return null
    }

    for (const other of routes) {
      const common = new Set<string>()
      for (let i = 0; i < Math.min(cells.length, other.cells.length); i++) {
        if (keyOf(cells[i]!) !== keyOf(other.cells[i]!)) {
          break
        }

        common.add(keyOf(cells[i]!))
      }

      for (let i = 1; i <= Math.min(cells.length, other.cells.length); i++) {
        if (keyOf(cells.at(-i)!) !== keyOf(other.cells.at(-i)!)) {
          break
        }

        if (!nearTarget(cells.at(-i)!)) {
          break
        }

        common.add(keyOf(cells.at(-i)!))
      }

      const theirs = new Map(other.cells.map((c) => [keyOf(c), c.dirs]))
      if (
        cells.some((c) => {
          const d = theirs.get(keyOf(c))
          return d !== undefined && !common.has(keyOf(c)) && !((c.dirs === 5 && d === 10) || (c.dirs === 10 && d === 5))
        })
      ) {
        return null
      }
    }

    const ends = []
    if (e.tail !== 'none') {
      ends.push({ ...source.at, ch: glyph(e.tail, source.face) })
    }

    if (e.head !== 'none') {
      ends.push({ ...target.at, ch: glyph(e.head, target.face) })
    }

    p.rows = Math.max(p.rows, ...[...cells, ...ends].map((c) => c.r + 1))
    p.cols = Math.max(p.cols, ...[...cells, ...ends].map((c) => c.c + 1))
    return { edge: e.id, style: e.style as Route['style'], cells, ends }
  }
  const preferred = { TB: 2, BT: 0, LR: 1, RL: 3 }[p.graph.dir]
  // The cells in front of each slot on the incoming face of every node an edge still to route ends on: an arrowhead
  // there needs the cell for its straight stem, so an edge routed earlier keeps its runs off them. An edge that cannot
  // route so routes again without them.
  const stemsBefore = (from: number) => {
    const out = new Set<string>()
    const face = back(preferred)
    for (const n of edges.slice(from)) {
      const b = p.boxes.get(n.to)
      if (!b || n.head === 'none' || n.from === n.to) {
        continue
      }

      for (let i = 0; i < (face % 2 ? b.rows : b.cols); i++) {
        out.add(keyOf(move(slotCell(b, face, i), face)))
      }
    }

    return out
  }
  let stems = new Set<string>()
  for (const [k, e] of edges.entries()) {
    const sources = candidates(e.from, e.style, e.tail, preferred, portOf(groups, e, 'tail'))
    const fanInOut =
      e.from !== e.to &&
      e.tail === 'none' &&
      edges.filter((n) => n.from === e.from).length > 1 &&
      new Set(edges.filter((n) => n.to === e.to).map((n) => n.from)).size > 1
    const targets = candidates(e.to, e.style, e.head, back(preferred), portOf(groups, e, 'head'), true, e.from).filter(
      (port) => !fanInOut || preferred % 2 !== 0 || port.face === back(preferred),
    )
    // The first slot pair that routes, trying sources in order; null when none does or the budget runs out. shared:
    // every slot draws on the whole budget; else each on its share.
    const first = (shared: boolean): { route: Route; source: Port; target: Port } | null => {
      for (const [i, source] of sources.entries()) {
        const spend = shared ? budget : { left: Math.floor(budget.left / (sources.length - i)) }
        const share = spend.left
        // A back edge routed here takes the nearest slot across from its source on each face, so it runs straight.
        const faces = [...new Set(targets.map((t) => t.face))]
        const off = (t: Port) => (t.face % 2 ? Math.abs(t.at.r - source.at.r) : Math.abs(t.at.c - source.at.c))
        let found: { route: Route; source: Port; target: Port } | null = null
        for (const target of e.reversed
          ? targets.toSorted((u, v) => faces.indexOf(u.face) - faces.indexOf(v.face) || off(u) - off(v))
          : targets) {
          if (budget.left <= 0 || (work && work.left <= 0)) {
            return null
          }

          if (spend.left <= 0) {
            break
          }

          if (keyOf(source.at) === keyOf(target.at)) {
            continue
          }

          const route = tryRoute(e, source, target, spend)
          if (route) {
            found = { route, source, target }
            break
          }
        }

        if (!shared) {
          budget.left -= share - spend.left
        }

        if (found) {
          return found
        }
      }

      return null
    }
    stems = stemsBefore(k + 1)
    let result = first(true)
    if (!result && stems.size > 0) {
      stems = new Set()
      result = first(true)
    }

    if (!result && work && work.left > 0 && budget.left <= 0 && !refilled) {
      refilled = true
      budget.left = 5000
      result = first(false)
    }

    if (!result) {
      return { stuck: e.id }
    }

    const { route, source, target } = result
    routes.push(route)
    ports.set(source.group, source.at)
    ports.set(target.group, target.at)
    for (const c of [...route.cells, ...route.ends]) {
      const key = keyOf(c)
      const list = occupied.get(key) ?? []
      list.push({
        dirs: 'dirs' in c ? c.dirs : 0,
        ch: 'ch' in c ? c.ch : undefined,
        from: source.group,
        to: target.group,
        nodes: [e.from, e.to],
      })
      occupied.set(key, list)
    }

    for (const [id, port, end] of [
      [e.from, source, e.tail],
      [e.to, target, e.head],
    ] as const) {
      if (end !== 'none') {
        const key = `${id}:${port.face}`
        marked.set(key, [...(marked.get(key) ?? []), slotOf(id, port)])
      }
    }

    if (e.tail !== 'none') {
      protectedCells.add(keyOf(move(source.at, source.face)))
    }

    if (e.head !== 'none') {
      protectedCells.add(keyOf(move(target.at, target.face)))
    }
  }

  return [
    ...reserved,
    ...routes.sort(
      (a, b) => p.graph.edges.find((e) => e.id === a.edge)!.order - p.graph.edges.find((e) => e.id === b.edge)!.order,
    ),
  ]
}
