// The search router: each edge in turn tries its candidate port slots and searches a path between them around what is
// already placed. The fallback when the channel router fails, and the router for edges beside reserved lanes.
import { fail } from '../fail.ts'
import type { Fail } from '../fail.ts'
import { width } from '../width.ts'
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
  walls,
} from './route-base.ts'
import type { Point, Route, Segment } from './route-base.ts'

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

export function searchRoutes(p: Placed, constrainedFirst = false, reserved: Route[] = []): Route[] | Fail {
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

  const routes: Route[] = []
  const ports = new Map<string, Point>()
  const budget = { left: 5000 }
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
  const titleCells = new Set<string>()
  for (const n of p.graph.clusters) {
    const b = p.frames.get(n.id)
    if (b && n.title !== null) {
      for (let c = b.col + 2; c <= b.col + 3 + width(n.title); c++) {
        titleCells.add(`${b.row},${c}`)
      }
    }
  }

  const title = (c: Point) => titleCells.has(keyOf(c))
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
  const tryRoute = (e: GEdge, source: Port, target: Port): Route | null => {
    const vertical = p.graph.dir === 'TB' || p.graph.dir === 'BT'
    const label = p.boxes.get(`${e.id}:label`)
    const ink = labelInk(p, e)
    const fs = fences(p, e)
    const blocked = (c: Point) =>
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
      const part = findPath(
        { ...source, at: current, face: incoming },
        { ...target, at: stop, face: outgoing },
        (c) => {
          const key = keyOf(c)
          return (
            blocked(c) ||
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
        budget,
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
  for (const e of edges) {
    const sources = candidates(e.from, e.style, e.tail, preferred, portOf(groups, e, 'tail'))
    const fanInOut =
      e.from !== e.to &&
      e.tail === 'none' &&
      edges.filter((n) => n.from === e.from).length > 1 &&
      new Set(edges.filter((n) => n.to === e.to).map((n) => n.from)).size > 1
    const targets = candidates(e.to, e.style, e.head, back(preferred), portOf(groups, e, 'head'), true, e.from).filter(
      (port) => !fanInOut || preferred % 2 !== 0 || port.face === back(preferred),
    )
    let result: { route: Route; source: Port; target: Port } | null = null
    for (const source of sources) {
      // A back edge routed here takes the nearest slot across from its source on each face, so it runs straight.
      const faces = [...new Set(targets.map((t) => t.face))]
      const off = (t: Port) => (t.face % 2 ? Math.abs(t.at.r - source.at.r) : Math.abs(t.at.c - source.at.c))
      for (const target of e.reversed
        ? targets.toSorted((u, v) => faces.indexOf(u.face) - faces.indexOf(v.face) || off(u) - off(v))
        : targets) {
        if (budget.left <= 0) {
          return fail('route-conflict')
        }

        if (keyOf(source.at) === keyOf(target.at)) {
          continue
        }

        const route = tryRoute(e, source, target)
        if (route) {
          result = { route, source, target }
          break
        }
      }

      if (result) {
        break
      }
    }

    if (!result) {
      return fail('route-conflict')
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
