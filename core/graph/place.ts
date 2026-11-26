// One level laid out along the TB axes: ranks and chains, strip spacers, order, then the cross and main axes.
import { buildLevel } from './chains.ts'
import type { Extent, Item, Level, Unit } from './chains.ts'
import { crossAxis, LEFT, RIGHT } from './cross.ts'
import { bandTops, borders, channels, tracks } from './main-axis.ts'
import type { GEdge } from './model.ts'
import { order } from './order.ts'
import { keepSides } from './sides.ts'
import { addSpacers, pathOf, spans } from './strips.ts'

// The free rows a self-loop needs past the last item it turns round: a turn, then its arrowhead's two cells.
const LOOP_ROOM = 3
// A rectangle along the axes: its start and size across the ranks (cross, wide) and along them (main, long).
export type Rect = { cross: number; main: number; wide: number; long: number }
// bands: each rank's band along the main axis, its start and size: as tall as its tallest item, or as a title grew it.
export type Placement = {
  edges: GEdge[]
  rects: Map<string, Rect>
  strips: Map<string, Rect>
  bands: { main: number; long: number }[]
  wide: number
  long: number
}

// outer: each strip at this level and the strip around it, or null. fit: a strip's least frame width, for its title.
// The title runs across the ranks, or along them when across (LR, RL): there a strip too short for it grows its middle
// band. framed: the level is a block's, its frame drawn round it, so nothing past its last band can be routed.
export function place(
  units: readonly Unit[],
  edges: readonly GEdge[],
  labels: ReadonlyMap<string, Extent>,
  outer: ReadonlyMap<string, string | null>,
  gap: { rankGap: number; nodeGap: number },
  fit: ReadonlyMap<string, number> = new Map(),
  across = false,
  framed = false,
): Placement {
  const paths = new Map<string | null, string[]>()
  const path = (o: string | null) => paths.get(o) ?? paths.set(o, pathOf(outer, o)).get(o)!
  const common = (a: string | null, b: string | null) => {
    const p = path(a)
    const q = path(b)
    const n = p.findIndex((c, i) => q[i] !== c)
    return (n < 0 ? p : p.slice(0, n)).at(-1) ?? null
  }
  const level: Level = buildLevel(units, edges, labels, common)
  const span = spans(level.items, path)
  addSpacers(level.items, span, path)
  const ranks: Item[][] = Array.from({ length: 1 + Math.max(-1, ...level.items.map((i) => i.rank)) }, () => [])
  for (const it of level.items) {
    ranks[it.rank]!.push(it)
  }

  const fits = new Map([...fit].filter(([c]) => span.has(c)))
  const backs = new Set(level.edges.filter((e) => e.reversed && e.style !== 'invisible').map((e) => e.id))
  const placed = lanedPastBlocks(keepSides(order(ranks, level.segs, path), level.segs, path, span, backs), level, backs)
  const x = crossAxis(placed, level.segs, gap.nodeGap, path, across ? new Map() : fits)
  const heights = placed.map((r) => Math.max(...r.map((i) => i.main)))
  const channel = channels(tracks(placed, level.segs), gap.rankGap)
  // Labels and dummies can place the branches in different gaps. Classify a fan-out by its real endpoints so the strip
  // still leaves an exterior turn when its sibling branch ends before the first internal node's rank.
  const items = new Map(placed.flat().map((item) => [item.id, item]))
  const exterior = new Set<number>()
  for (const [cluster, [lo]] of span) {
    if (lo === 0) {
      continue
    }

    const held = (id: string) => path(items.get(id)!.owner).includes(cluster)
    const branches = new Map<string, number>()
    for (const edge of level.edges) {
      if (items.get(edge.from)!.rank >= lo || held(edge.from)) {
        continue
      }

      branches.set(edge.from, (branches.get(edge.from) ?? 0) | (held(edge.to) ? 1 : 2))
    }

    // A label or dummy on the rank above the strip, whose edge goes on into it, must leave through its own cell: with
    // the strip's top border right under it, it could not turn off a title cell there. The gap gets the exterior rows
    // too, so it can. Ranks that run across meet the strip's side, which holds no title.
    const entered =
      !across &&
      level.segs.some((s) => {
        const upper = items.get(s.upper)
        return (
          upper !== undefined &&
          upper.rank === lo - 1 &&
          (upper.kind === 'label' || upper.kind === 'dummy') &&
          !held(s.upper) &&
          held(s.lower)
        )
      })
    // An edge from the rank above that holds neither end but leaves from over the strip, or passes it to the other
    // side, must run along its top border's outside: the gap gets the exterior rows for that run and its turns too. A
    // laned back edge always passes it so, as its lane lies past everything (layered.ts).
    const left = x.get(LEFT(cluster))!
    const right = x.get(RIGHT(cluster))!
    const over = level.segs.some((s) => {
      const upper = items.get(s.upper)
      const lower = items.get(s.lower)
      if (!upper || !lower || upper.rank !== lo - 1 || held(s.upper) || held(s.lower)) {
        return false
      }

      if (backs.has(s.edge) && level.segs.filter((t) => t.edge === s.edge).length > 1) {
        return true
      }

      const from = Math.min(x.get(s.upper)!, x.get(s.lower)!)
      const to = Math.max(x.get(s.upper)! + upper.cross, x.get(s.lower)! + lower.cross) - 1
      return from <= right && to >= left
    })
    if ([...branches.values()].includes(3) || entered || over) {
      exterior.add(lo)
    }
  }

  // A self-loop turns round the last item it passes, its label or else its node: past it, a turn, then the cell before
  // its arrowhead and the arrowhead's stem, which the router keeps free. On a strip's last rank that item has the
  // strip's bottom border right after it, which the loop may not cross, so the rank gets those rows before that border;
  // on a framed level's last rank, the frame is that border.
  const room = new Map<number, number>()
  let tail = 0
  for (const e of level.edges.filter((e) => e.from === e.to && e.style !== 'invisible')) {
    const turn = items.get(`${e.id}:label`) ?? items.get(e.from)
    if (turn && [...span].some(([c, [, hi]]) => hi === turn.rank && path(turn.owner).includes(c))) {
      room.set(turn.rank, LOOP_ROOM)
    }

    if (turn && framed && turn.rank === placed.length - 1) {
      tail = LOOP_ROOM
    }
  }

  const b = borders(span, (c) => path(c).length, channel, placed.length, exterior, room)
  if (across) {
    for (const [c, w] of [...fits].sort(([a], [z]) => path(z).length - path(a).length)) {
      const [lo, hi] = span.get(c)!
      const t = bandTops(heights, channel, b.before, b.after).tops
      const mid = (lo + hi) >> 1
      const short = w - (t[hi]! + heights[hi]! + b.down(c) - t[lo]! + b.up(c))
      if (short > 0) {
        heights[mid] = heights[mid]! + short
      } // innermost first: the strips around it see it grown
    }
  }

  const { tops, length: bands } = bandTops(heights, channel, b.before, b.after)
  const length = bands + tail
  const rects = new Map<string, Rect>()
  for (const it of placed.flat()) {
    if (it.kind === 'spacer') {
      continue
    }

    rects.set(it.id, {
      cross: x.get(it.id)!,
      main: tops[it.rank]! + Math.floor((heights[it.rank]! - it.main) / 2),
      wide: it.cross,
      long: it.main,
    })
  }

  const strips = new Map<string, Rect>()
  for (const [c, [lo, hi]] of span) {
    const top = tops[lo]! - b.up(c)
    const bottom = tops[hi]! + heights[hi]! - 1 + b.down(c)
    strips.set(c, {
      cross: x.get(LEFT(c))!,
      main: top,
      wide: x.get(RIGHT(c))! - x.get(LEFT(c))! + 1,
      long: bottom - top + 1,
    })
  }

  const wide = Math.max(0, ...[...rects.values(), ...strips.values()].map((r) => r.cross + r.wide))
  return {
    edges: level.edges,
    rects,
    strips,
    bands: heights.map((h, k) => ({ main: tops[k]!, long: h })),
    wide,
    long: length,
  }
}

// ranks with each end of a laned back edge, one with a label or a bend, placed after every block of its own strip on
// its rank. Such an edge leaves its ends straight out toward its lane, past everything at this level (layered.ts); a
// block between an end and that lane is a frame the edge cannot cross, and going round it leaves a turn its end has no
// room for. Only past blocks with the end's own owner, so the end never leaves its strip's run and the strip stays
// whole.
function lanedPastBlocks(ranks: Item[][], level: Level, backs: ReadonlySet<string>): Item[][] {
  const laned = new Set<string>()
  const counts = new Map<string, number>()
  for (const s of level.segs) {
    counts.set(s.edge, (counts.get(s.edge) ?? 0) + 1)
  }

  for (const e of level.edges) {
    if (backs.has(e.id) && (counts.get(e.id) ?? 0) > 1) {
      laned.add(e.from)
      laned.add(e.to)
    }
  }

  for (const rank of ranks) {
    for (const it of rank.filter((x) => x.kind === 'node' && laned.has(x.id))) {
      const last = rank.findLastIndex((x) => x.kind === 'block' && x.owner === it.owner)
      if (last < 0 || rank.indexOf(it) > last) {
        continue
      }

      rank.splice(rank.indexOf(it), 1)
      rank.splice(rank.findLastIndex((x) => x.kind === 'block' && x.owner === it.owner) + 1, 0, it)
    }
  }

  return ranks
}
