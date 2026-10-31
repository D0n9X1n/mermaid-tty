// The grid path search the outside-lane and search routers share: a weighted Manhattan search over cells and
// directions, with the port and step helpers it works in. It knows nothing of edges or frames.
import type { Point } from './route-base.ts'

export type Port = { at: Point; face: number; group: string }
export const steps = [
  { r: -1, c: 0 },
  { r: 0, c: 1 },
  { r: 1, c: 0 },
  { r: 0, c: -1 },
]
export const move = (p: Point, d: number): Point => ({ r: p.r + steps[d]!.r, c: p.c + steps[d]!.c })
export const back = (d: number) => (d + 2) % 4
const bits = [1, 2, 4, 8]
type SearchCell = Point & { direction: number; previous: number }

// Weighted Manhattan search with directional states and a shared expansion budget. Never exponential.
export function findPath(
  start: Port,
  end: Port,
  blocked: (c: Point) => boolean,
  allowed: (c: Point, dirs: number) => boolean,
  rows: number,
  cols: number,
  budget: { left: number },
): Point[] | null {
  const queue: SearchCell[] = [{ ...start.at, direction: start.face, previous: -1 }]
  const seen = new Uint8Array(rows * cols * 4)
  seen[(start.at.r * cols + start.at.c) * 4 + start.face] = 1
  const heap: { index: number; cost: number }[] = []
  const costs = [0]
  const put = (index: number) => {
    const c = queue[index]!
    const entry = { index, cost: costs[index]! + 2 * (Math.abs(c.r - end.at.r) + Math.abs(c.c - end.at.c)) }
    let i = heap.length
    heap.push(entry)
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (heap[parent]!.cost <= entry.cost) {
        break
      }

      heap[i] = heap[parent]!
      i = parent
    }

    heap[i] = entry
  }
  const take = () => {
    const out = heap[0]!.index
    const last = heap.pop()!
    if (heap.length) {
      let i = 0
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1
        if (child + 1 < heap.length && heap[child + 1]!.cost < heap[child]!.cost) {
          child++
        }

        if (heap[child]!.cost >= last.cost) {
          break
        }

        heap[i] = heap[child]!
        i = child
      }

      heap[i] = last
    }

    return out
  }
  put(0)
  let found = -1
  let remaining = Math.min(1500, 200 + 8 * (Math.abs(start.at.r - end.at.r) + Math.abs(start.at.c - end.at.c)))
  while (heap.length && remaining-- > 0 && budget.left-- > 0) {
    const i = take()
    const c = queue[i]!
    if (c.r === end.at.r && c.c === end.at.c && allowed(c, bits[back(c.direction)]! | bits[end.face]!)) {
      found = i
      break
    }

    const dx = end.at.c - c.c
    const dy = end.at.r - c.r
    const choices =
      Math.abs(dx) > Math.abs(dy)
        ? [dx > 0 ? 1 : 3, dy > 0 ? 2 : 0, c.direction, 0, 1, 2, 3]
        : [dy > 0 ? 2 : 0, dx > 0 ? 1 : 3, c.direction, 0, 1, 2, 3]
    for (const d of choices.filter((d, i, a) => a.indexOf(d) === i && d !== back(c.direction))) {
      const n = move(c, d)
      const key = (n.r * cols + n.c) * 4 + d
      if (
        n.r < 0 ||
        n.c < 0 ||
        n.r >= rows ||
        n.c >= cols ||
        seen[key] ||
        blocked(n) ||
        !allowed(c, bits[back(c.direction)]! | bits[d]!)
      ) {
        continue
      }

      seen[key] = 1
      queue.push({ ...n, direction: d, previous: i })
      costs.push(costs[i]! + 1 + (d === c.direction ? 0 : 0.25))
      put(queue.length - 1)
    }
  }

  if (found < 0) {
    return null
  }

  const path: Point[] = []
  for (let i = found; i >= 0; i = queue[i]!.previous) {
    path.push({ r: queue[i]!.r, c: queue[i]!.c })
  }

  return path.reverse()
}
