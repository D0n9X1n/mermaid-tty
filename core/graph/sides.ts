// A strip's frame is a wall on the ranks it spans: an edge crosses it once if the strip holds one of its ends, and
// never if it holds neither. So, on those ranks, the part of an edge outside the strip stays on one side of it: the
// side its outer end comes from when the strip holds the other end, else the side most of its items are on. Ordering by
// barycenter can put a label, a dummy or an end on the far side, so the edge would cross the strip there and back;
// keepSides moves each such item next to the strip, on the edge's side.
import type { Item, Seg } from './chains.ts'

type Side = 'before' | 'after'

// rank with it moved next to the strip's block, on side.
function moveBeside(rank: Item[], it: Item, side: Side, inStrip: (it: Item) => boolean): void {
  rank.splice(rank.indexOf(it), 1)
  const first = rank.findIndex(inStrip)
  const last = rank.findLastIndex(inStrip)
  rank.splice(side === 'before' ? first : last + 1, 0, it)
}

// ranks with each edge's items kept to one side of every strip, as above. spans: each strip's first and last rank. Only
// items at the strip's own level move, so no other strip's items are split apart; each strip is set right up to three
// times, as moving an end for one edge can put another edge of that end on the wrong side.
export function keepSides(
  ranks: Item[][],
  segs: readonly Seg[],
  path: (o: string | null) => string[],
  spans: ReadonlyMap<string, readonly [number, number]>,
): Item[][] {
  const byId = new Map(ranks.flat().map((it) => [it.id, it]))
  const chains = new Map<string, Item[]>()
  for (const s of segs) {
    const items = chains.get(s.edge) ?? []
    for (const id of [s.upper, s.lower]) {
      const it = byId.get(id)
      if (it && !items.includes(it)) {
        items.push(it)
      }
    }

    chains.set(s.edge, items)
  }

  for (let pass = 0; pass < 3; pass++) {
    let moved = false
    for (const [strip, [lo, hi]] of spans) {
      const inStrip = (it: Item) => path(it.owner).includes(strip)
      const level = path(strip).slice(0, -1).join('\u0000')
      const beside = (it: Item) => path(it.owner).join('\u0000') === level
      const sideOf = (it: Item): Side | null => {
        const rank = ranks[it.rank]!
        const first = rank.findIndex(inStrip)
        if (first < 0) {
          return null
        }

        return rank.indexOf(it) < first ? 'before' : 'after'
      }
      for (const items of chains.values()) {
        const chain = items.toSorted((a, b) => a.rank - b.rank)
        const top = chain[0]!
        const bottom = chain.at(-1)!
        if (inStrip(top) && inStrip(bottom)) {
          continue
        }

        // The edge's items level with the strip and outside it, from the outer end toward the inner one when the strip
        // holds one end, else top down.
        const walk = inStrip(top) ? chain.toReversed() : chain
        const flank = walk.filter((it) => !inStrip(it) && it.rank >= lo && it.rank <= hi && sideOf(it) !== null)
        if (flank.length < 2) {
          continue
        }

        let want: Side = sideOf(flank[0]!)!
        if (!inStrip(top) && !inStrip(bottom)) {
          const after = flank.filter((it) => sideOf(it) === 'after').length
          want = after * 2 > flank.length ? 'after' : 'before'
          if (after * 2 === flank.length) {
            want = sideOf(flank[0]!)!
          }
        }

        for (const it of flank) {
          const movable = it.kind === 'label' || it.kind === 'dummy' || (it.kind === 'node' && beside(it))
          if (sideOf(it) !== want && movable) {
            moveBeside(ranks[it.rank]!, it, want, inStrip)
            moved = true
          }
        }
      }
    }

    if (!moved) {
      break
    }
  }

  return ranks
}
