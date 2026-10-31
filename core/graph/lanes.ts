// The outside-lane router: a back edge drawn out past the layout's side, in a lane beside its dummy or label or past
// everything else. Separate because it routes one edge against routes already placed, not the whole graph.
import type { Box, Placed } from './layered.ts'
import type { GEdge } from './model.ts'
import { back, findPath, move } from './find-path.ts'
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
  routeObstacles,
  walls,
  within,
} from './route-base.ts'
import type { Point, Route } from './route-base.ts'

export function outsideRoute(p: Placed, e: GEdge, routes: Route[]): Route | null {
  const a = p.boxes.get(e.from) ?? p.frames.get(e.from)
  const b = p.boxes.get(e.to) ?? p.frames.get(e.to)
  if (!a || !b) {
    return null
  }

  const across = p.graph.dir === 'LR' || p.graph.dir === 'RL'
  const main = (b: Box) => (across ? b.col + (b.cols >> 1) : b.row + (b.rows >> 1))
  // The cross-axis line just past b on side: past its far edge when side > 0, else just before its near one.
  const cross = (b: Box, side: number) => {
    const [first, size] = across ? [b.row, b.rows] : [b.col, b.cols]
    return side > 0 ? first + size : first - 1
  }
  // The face a node's end sits on, for an end on side: below or above when ranks run across, else right or left.
  const faceOf = (side: number) => {
    if (across) {
      return side > 0 ? 2 : 0
    }

    return side > 0 ? 1 : 3
  }
  const at = (m: number, x: number): Point => (across ? { r: x, c: m } : { r: m, c: x })
  const occupied = new Map(
    routes.flatMap((r) => [
      ...r.cells.map((c) => [keyOf(c), c.dirs] as const),
      ...r.ends.map((c) => [keyOf(c), 0] as const),
    ]),
  )
  const frames = walls(p)
  const fs = fences(p, e)
  const label = p.boxes.get(`${e.id}:label`)
  const ink = labelInk(p, e)
  const boxes = routeObstacles(p, e)
  // The lanes beside what lies inside the innermost frame holding both ends, where its layout left room for them.
  const room = fs.toSorted((u, v) => u.rows * u.cols - v.rows * v.cols)[0]
  const held = (b: Box) =>
    !room || (within({ r: b.row, c: b.col }, room) && within({ r: b.row + b.rows - 1, c: b.col + b.cols - 1 }, room))
  const near = (c: Point) => !room || within(c, room)
  const high =
    Math.max(
      ...[...p.boxes.values(), ...frames].filter(held).map((b) => (across ? b.row + b.rows : b.col + b.cols)),
      ...routes.flatMap((r) => [...r.cells, ...r.ends].filter(near).map((c) => (across ? c.r : c.c) + 1)),
    ) + 2
  const low =
    Math.min(
      ...boxes.filter(held).map((b) => (across ? b.row : b.col)),
      ...frames.filter(held).map((b) => (across ? b.row : b.col)),
    ) - 3
  // The lane's cross-axis line on side: through a label's middle, else a dummy's line on the high side, else past
  // everything on that side.
  const laneOf = (side: number, dummy: Box | undefined): number => {
    if (label) {
      return across ? label.row + (label.rows >> 1) : label.col + (label.cols >> 1)
    }

    if (dummy && side > 0) {
      return across ? dummy.row : dummy.col
    }

    return side > 0 ? high : low
  }
  const sides = [1, -1].sort(
    (u, v) =>
      Math.abs(cross(a, u) - (u > 0 ? high : low)) +
      Math.abs(cross(b, u) - (u > 0 ? high : low)) -
      Math.abs(cross(a, v) - (v > 0 ? high : low)) -
      Math.abs(cross(b, v) - (v > 0 ? high : low)),
  )
  for (const side of sides) {
    for (const [sourceSide, targetSide] of [
      [side, side],
      [side, -side],
      [-side, side],
    ]) {
      const dummy = [...p.boxes].find(([id]) => id.startsWith(`${e.id}#`))?.[1]
      const lane = laneOf(side, dummy)
      if (label && side < 0) {
        continue
      }

      if (lane < 0) {
        continue
      }

      const am = main(a)
      const bm = main(b)
      const ax = cross(a, sourceSide!)
      const bx = cross(b, targetSide!)
      const face = faceOf(sourceSide!)
      const targetFace = faceOf(targetSide!)
      // The direction the lane runs from the source's main-axis line toward the target's.
      const forward = bm > am
      let along = forward ? 2 : 0
      if (across) {
        along = forward ? 1 : 3
      }

      const tailCell = at(am, ax)
      const headCell = at(bm, bx)
      const start = e.tail === 'none' ? tailCell : move(tailCell, face)
      const end = e.head === 'none' ? headCell : move(headCell, targetFace)
      const forbidden = new Set(
        routes.flatMap((r) =>
          r.ends.flatMap((h) => r.cells.filter((c) => Math.abs(c.r - h.r) + Math.abs(c.c - h.c) === 1).map(keyOf)),
        ),
      )
      const blocked = (c: Point) =>
        !fenced(fs, c) ||
        boxes.some((b) => inside(c, b)) ||
        occupied.get(keyOf(c)) === 0 ||
        (e.tail !== 'none' && keyOf(c) === keyOf(tailCell)) ||
        (e.head !== 'none' && keyOf(c) === keyOf(headCell))
      const allowed = (c: Point, dirs: number) => {
        const other = occupied.get(keyOf(c))
        const d = frames.reduce((d, b) => d | border(c, b), 0)
        if (
          (d && d !== dirs) ||
          (other !== undefined &&
            (forbidden.has(keyOf(c)) || !((other === 5 && dirs === 10) || (other === 10 && dirs === 5))))
        ) {
          return false
        }

        const inStem =
          (keyOf(c) === keyOf(start) && e.tail !== 'none') || (keyOf(c) === keyOf(end) && e.head !== 'none')
        return !(inStem && (dirs !== (across ? 5 : 10) || other !== undefined))
      }
      const rows = Math.max(p.rows, across ? lane + 3 : Math.max(am, bm) + 3)
      const cols = Math.max(p.cols, across ? Math.max(am, bm) + 3 : lane + 3)
      const budget = { left: 3000 }
      const group = e.id
      if (blocked(start) || blocked(end)) {
        continue
      }

      const first = findPath(
        { at: start, face, group },
        { at: at(am, lane), face: along, group },
        blocked,
        allowed,
        rows,
        cols,
        budget,
      )
      if (!first) {
        continue
      }

      const path = [...(e.tail === 'none' ? [] : [tailCell]), ...first]
      for (let m = am + Math.sign(bm - am); m !== bm; m += Math.sign(bm - am)) {
        path.push(at(m, lane))
      }

      const used = new Set(path.map(keyOf))
      const last = findPath(
        { at: at(bm, lane), face: along, group },
        { at: end, face: back(targetFace), group },
        (c) => blocked(c) || used.has(keyOf(c)),
        allowed,
        rows,
        cols,
        budget,
      )
      if (!last) {
        continue
      }

      path.push(...last, ...(e.head === 'none' ? [] : [headCell]))
      if (path.some((c) => c.r < 0 || c.c < 0 || boxes.some((b) => inside(c, b)) || !fenced(fs, c))) {
        continue
      }

      const before = at(am, ax - sourceSide!)
      const after = at(bm, bx - targetSide!)
      const all = path.map((c, i) => ({ ...c, dirs: arm(c, path[i - 1] ?? before) | arm(c, path[i + 1] ?? after) }))
      const tail = all[0]!
      const head = all.at(-1)!
      const cells = all
        .slice(e.tail === 'none' ? 0 : 1, e.head === 'none' ? undefined : -1)
        .filter((c) => !ink.some((b) => inside(c, b)))
      const ends = [
        ...(e.tail === 'none' ? [] : [{ ...tail, ch: endGlyph(e.tail, face) }]),
        ...(e.head === 'none' ? [] : [{ ...head, ch: endGlyph(e.head, targetFace) }]),
      ]
      if (ends.some((c) => occupied.has(keyOf(c)) || frames.some((b) => border(c, b)))) {
        continue
      }

      if (cells.some((c) => !allowed(c, c.dirs)) || !crossingsFit(p, e, cells, routes) || !crossesTrue(p, e, cells)) {
        continue
      }

      if (new Set(path.map(keyOf)).size !== path.length) {
        continue
      }

      p.rows = Math.max(p.rows, ...path.map((c) => c.r + 1))
      p.cols = Math.max(p.cols, ...path.map((c) => c.c + 1))
      return { edge: e.id, cells, ends, style: e.style as Route['style'] }
    }
  }

  return null
}
