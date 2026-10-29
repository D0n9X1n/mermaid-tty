// The main axis (plan A §7.6): each rank's band is as tall as its tallest item, and the gap after it max(rankGap, tracks + 2).
import type { Item, Seg } from './chains.ts'

// The estimate of each gap's tracks: the distinct items its segments leave from, one net per source port. The router (T17)
// may refine them and rerun bandTops.
export function tracks(ranks: readonly (readonly Item[])[], segs: readonly Seg[]): number[] {
  const rank = new Map(ranks.flatMap((r, k) => r.map(it => [it.id, k] as const)))
  const nets = ranks.map(() => new Set<string>())
  for (const s of segs) nets[rank.get(s.upper)!]!.add(s.upper)
  return nets.slice(0, -1).map(n => n.size)
}

// Each band's top and the main axis's length, from the band heights, each gap's tracks and the border rows before and after
// each band.
export function bandTops(heights: readonly number[], gaps: readonly number[], rankGap: number,
  before: readonly number[] = [], after: readonly number[] = []): { tops: number[]; length: number } {
  const tops: number[] = []
  let at = 0
  heights.forEach((h, k) => {
    at += before[k] ?? 0
    tops.push(at)
    at += h + (after[k] ?? 0) + (k + 1 < heights.length ? Math.max(rankGap, gaps[k]! + 2) : 0)
  })
  return { tops, length: at }
}

// Strip borders on the main axis: a strip's top border takes a row just above its first band and its bottom border one just
// below its last, the innermost nearest the band, so each gap gains a row per border level that starts or ends there. Strips
// at one depth share a row: they never overlap. before[k], after[k]: the rows above and below band k; up(c), down(c): how
// far c's top border sits above its first band, and its bottom border below its last.
export function borders(spans: ReadonlyMap<string, readonly [number, number]>, depth: (c: string) => number, n: number) {
  const starts = Array.from({ length: n }, () => new Set<number>()), ends = Array.from({ length: n }, () => new Set<number>())
  for (const [c, [lo, hi]] of spans) { starts[lo]!.add(depth(c)); ends[hi]!.add(depth(c)) }
  const out = (at: Set<number>, c: string) => 1 + [...at].filter(d => d > depth(c)).length
  return { before: starts.map(x => x.size), after: ends.map(x => x.size),
    up: (c: string) => out(starts[spans.get(c)![0]]!, c), down: (c: string) => out(ends[spans.get(c)![1]]!, c) }
}
