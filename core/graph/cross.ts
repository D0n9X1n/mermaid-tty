// The cross axis: left-pack each rank, its items nodeGap apart, then two median pulls, dummies first, that keep the
// separation.
import type { Item, Seg } from './chains.ts'
import { longestPath } from './ranks.ts'
import type { Link } from './ranks.ts'

type Ranks = readonly (readonly Item[])[]

const group = (cons: readonly Link[], by: 'from' | 'to'): Map<string, Link[]> => {
  const m = new Map<string, Link[]>()
  for (const c of cons) {
    m.set(c[by], [...(m.get(c[by]) ?? []), c])
  }

  return m
}

// Two median pulls: each item, dummies first and then the rest, rank by rank and right to left in each, moves its
// centre as near as the constraints allow to the median of its neighbours' centres.
function pull(ranks: Ranks, segs: readonly Seg[], cons: readonly Link[], x: Map<string, number>): void {
  const into = group(cons, 'to')
  const outOf = group(cons, 'from')
  const nb = new Map<string, string[]>()
  for (const s of segs) {
    nb.set(s.upper, [...(nb.get(s.upper) ?? []), s.lower])
    nb.set(s.lower, [...(nb.get(s.lower) ?? []), s.upper])
  }

  const cross = new Map(ranks.flat().map((i) => [i.id, i.cross]))
  const mid = (id: string) => x.get(id)! + (cross.get(id)! - 1) / 2
  for (let pass = 0; pass < 2; pass++) {
    for (const dummies of [true, false]) {
      for (const r of ranks) {
        for (const it of [...r].reverse()) {
          const cs = (nb.get(it.id) ?? []).map(mid).sort((a, b) => a - b)
          if ((it.kind === 'dummy') !== dummies || cs.length === 0) {
            continue
          }

          const m = (cs[(cs.length - 1) >> 1]! + cs[cs.length >> 1]!) / 2
          const lo = Math.max(-Infinity, ...(into.get(it.id) ?? []).map((c) => x.get(c.from)! + c.minlen))
          const hi = Math.min(Infinity, ...(outOf.get(it.id) ?? []).map((c) => x.get(c.to)! - c.minlen))
          x.set(it.id, Math.min(hi, Math.max(lo, Math.floor(m - (it.cross - 1) / 2))))
        }
      }
    }
  }
}

// A strip's left and right border on the cross axis: one variable each over every rank it spans, so it is a strip.
export const LEFT = (c: string) => `\u0001${c}`
export const RIGHT = (c: string) => `\u0002${c}`

// The separations along each rank, in order: items nodeGap apart, and a border and a pad cell per strip level, plus the
// strip's extra pad cells on each side (pad). A border opens a strip after an item or border, and closes it before one.
function separations(
  ranks: Ranks,
  path: (o: string | null) => string[],
  nodeGap: number,
  pad: ReadonlyMap<string, readonly [number, number]>,
): Link[] {
  const cons: Link[] = []
  for (const r of ranks) {
    let open: string[] = []
    let last: { id: string; end: number; opens: boolean } | null = null
    const put = (id: string, end: number, opens: boolean, closes: boolean, extra = 0) => {
      if (last) {
        cons.push({
          id: '',
          from: last.id,
          to: id,
          minlen: last.end + extra + (last.opens || closes ? 2 : nodeGap + 1),
        })
      }

      last = { id, end, opens }
    }
    for (const it of r) {
      const p = path(it.owner)
      const keep = open.findIndex((c, i) => p[i] !== c)
      const n = keep < 0 ? open.length : keep
      for (const c of open.slice(n).reverse()) {
        put(RIGHT(c), 0, false, true, pad.get(c)?.[1])
      }

      for (const c of p.slice(n)) {
        put(LEFT(c), pad.get(c)?.[0] ?? 0, true, false)
      }

      put(it.id, it.cross - 1, false, false)
      open = p
    }

    for (const c of [...open].reverse()) {
      put(RIGHT(c), 0, false, true, pad.get(c)?.[1])
    }
  }

  return cons
}

// Each item's and strip border's start on the cross axis, the smallest is 0. fit: a strip's least width, for its title.
// A strip narrower than that is padded on both sides, so its members stay centred; deepest first, as one widens those
// around it.
export function crossAxis(
  ranks: Ranks,
  segs: readonly Seg[],
  nodeGap: number,
  path: (o: string | null) => string[] = () => [],
  fit: ReadonlyMap<string, number> = new Map(),
): Map<string, number> {
  const pad = new Map<string, [number, number]>()
  const solve = () => {
    const cons = separations(ranks, path, nodeGap, pad)
    return {
      cons,
      x: longestPath([...new Set([...ranks.flat().map((i) => i.id), ...cons.flatMap((c) => [c.from, c.to])])], cons),
    }
  }
  for (const d of [...new Set([...fit.keys()].map((c) => path(c).length))].sort((a, b) => b - a)) {
    const { x } = solve()
    for (const [c, w] of fit) {
      const short = w - (x.get(RIGHT(c))! - x.get(LEFT(c))! + 1)
      if (path(c).length === d && short > 0) {
        pad.set(c, [short >> 1, short - (short >> 1)])
      }
    }
  }

  const { cons, x } = solve()
  pull(ranks, segs, cons, x)
  const min = Math.min(...x.values())
  for (const [id, v] of x) {
    x.set(id, v - min)
  }

  return x
}
