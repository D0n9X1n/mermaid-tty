// Order within ranks (plan A §7.4): source order, then 8 alternating barycenter sweeps, ties kept in source order. The
// order with the fewest crossings wins; on a tie, the earliest.
import type { Item, Seg } from './chains.ts'
import { nest } from './nest.ts'

type Ranks = readonly (readonly Item[])[]

// Segment crossings: two segments between the same two ranks cross when their ends come in opposite orders.
export function crossings(ranks: Ranks, segs: readonly Seg[]): number {
  const at = new Map(ranks.flatMap((r, k) => r.map((it, i) => [it.id, { k, i }] as const)))
  const by: [number, number][][] = ranks.map(() => [])
  for (const s of segs) {
    const u = at.get(s.upper)!
    const l = at.get(s.lower)!
    by[u.k]!.push([u.i, l.i])
  }
  let n = 0
  for (const ps of by) {
    ps.forEach(([a, b], x) =>
      ps.slice(x + 1).forEach(([c, d]) => {
        if ((a - c) * (b - d) < 0) {
          n++
        }
      }),
    )
  }
  return n
}

// Each strip's first index on rank r.
const firsts = (r: readonly Item[], path: (o: string | null) => string[]): Map<string, number> => {
  const m = new Map<string, number>()
  r.forEach((it, i) =>
    path(it.owner).forEach((c) => {
      if (!m.has(c)) {
        m.set(c, i)
      }
    }),
  )
  return m
}

// Each item's neighbours across segs, from one end to the other.
function near(segs: readonly Seg[], from: 'upper' | 'lower'): Map<string, string[]> {
  const m = new Map<string, string[]>()
  for (const s of segs) {
    m.set(s[from], [...(m.get(s[from]) ?? []), s[from === 'upper' ? 'lower' : 'upper']])
  }
  return m
}

// ranks in source order, built top down, then reordered by barycenter sweeps: a down sweep sorts each rank by the mean
// position of its items' neighbours above, an up sweep by those below; an item with no neighbour there keeps its own index.
// path: the strips around an owner, outermost first.
export function order(ranks: Ranks, segs: readonly Seg[], path: (o: string | null) => string[] = () => []): Item[][] {
  const above = near(segs, 'lower')
  const below = near(segs, 'upper')
  let cur: Item[][] = []
  for (const r of ranks) {
    cur.push(nest(r, new Map(r.map((it) => [it.id, 0])), path, cur.length > 0 ? firsts(cur.at(-1)!, path) : new Map()))
  }
  let best = cur
  let fewest = crossings(cur, segs)
  for (let sweep = 0; sweep < 8; sweep++) {
    const down = sweep % 2 === 0
    const next = cur.map((r) => [...r])
    for (let j = 1; j < next.length; j++) {
      const k = down ? j : next.length - 1 - j
      const nb = down ? above : below
      const fix = next[down ? k - 1 : k + 1]!
      const pos = new Map(fix.map((it, i) => [it.id, i]))
      const val = new Map(
        next[k]!.map((it, i) => {
          const ps = (nb.get(it.id) ?? []).map((id) => pos.get(id)!)
          return [it.id, ps.length > 0 ? ps.reduce((a, b) => a + b) / ps.length : i] as const
        }),
      )
      next[k] = nest(next[k]!, val, path, firsts(fix, path))
    }
    const c = crossings(next, segs)
    if (c < fewest) {
      best = next
      fewest = c
    }
    cur = next
  }
  return best
}
