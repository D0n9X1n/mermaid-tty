// One level laid out along the TB axes (plan A §7): ranks and chains, strip spacers, order, then the cross and main axes.
import { buildLevel } from './chains.ts'
import type { Extent, Item, Level, Unit } from './chains.ts'
import { crossAxis, LEFT, RIGHT } from './cross.ts'
import { bandTops, borders, tracks } from './main-axis.ts'
import type { GEdge } from './model.ts'
import { order } from './order.ts'
import { addSpacers, pathOf, spans } from './strips.ts'

// A rectangle along the axes: its start and size across the ranks (cross, wide) and along them (main, long).
export type Rect = { cross: number; main: number; wide: number; long: number }
export type Placement = { edges: GEdge[]; rects: Map<string, Rect>; strips: Map<string, Rect>; wide: number; long: number }

// outer: each strip at this level and the strip around it, or null.
export function place(units: readonly Unit[], edges: readonly GEdge[], labels: ReadonlyMap<string, Extent>,
  outer: ReadonlyMap<string, string | null>, gap: { rankGap: number; nodeGap: number }): Placement {
  const paths = new Map<string | null, string[]>()
  const path = (o: string | null) => paths.get(o) ?? paths.set(o, pathOf(outer, o)).get(o)!
  const common = (a: string | null, b: string | null) => {
    const p = path(a), q = path(b), n = p.findIndex((c, i) => q[i] !== c)
    return (n < 0 ? p : p.slice(0, n)).at(-1) ?? null
  }
  const level: Level = buildLevel(units, edges, labels, common), span = spans(level.items, path)
  addSpacers(level.items, span, path)
  const ranks: Item[][] = Array.from({ length: 1 + Math.max(-1, ...level.items.map(i => i.rank)) }, () => [])
  for (const it of level.items) ranks[it.rank]!.push(it)
  const placed = order(ranks, level.segs, path), x = crossAxis(placed, level.segs, gap.nodeGap, path)
  const heights = placed.map(r => Math.max(...r.map(i => i.main)))
  const b = borders(span, c => path(c).length, placed.length)
  const { tops, length } = bandTops(heights, tracks(placed, level.segs), gap.rankGap, b.before, b.after)
  const rects = new Map<string, Rect>()
  for (const it of placed.flat()) {
    if (it.kind === 'spacer') continue
    rects.set(it.id, { cross: x.get(it.id)!, main: tops[it.rank]! + Math.floor((heights[it.rank]! - it.main) / 2), wide: it.cross, long: it.main })
  }
  const strips = new Map<string, Rect>()
  for (const [c, [lo, hi]] of span) {
    const top = tops[lo]! - b.up(c), bottom = tops[hi]! + heights[hi]! - 1 + b.down(c)
    strips.set(c, { cross: x.get(LEFT(c))!, main: top, wide: x.get(RIGHT(c))! - x.get(LEFT(c))! + 1, long: bottom - top + 1 })
  }
  const wide = Math.max(0, ...[...rects.values(), ...strips.values()].map(r => r.cross + r.wide))
  return { edges: level.edges, rects, strips, wide, long: length }
}
