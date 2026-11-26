// An edge that enters a strip crosses its border once, so on the ranks the strip spans, the part of the edge still
// outside it stays on one side of it: the side its outer end, or its first item level with the strip, is on. Ordering
// by barycenter can put a label or dummy on the far side, so the edge would cross the strip there and back, which a
// frame never allows. keepSides moves each such item next to the strip, on the edge's side.
import type { Item, Seg } from './chains.ts'

type Side = 'before' | 'after'

// The side of the strip's block that the item at index i of rank is on, or null when the rank has none of the strip.
function sideOf(rank: readonly Item[], i: number, inStrip: (it: Item) => boolean): Side | null {
  const first = rank.findIndex(inStrip)
  if (first < 0) {
    return null
  }

  return i < first ? 'before' : 'after'
}

// ranks with each label and dummy of an edge that enters a strip moved to the strip's side its edge comes from. spans:
// each strip's first and last rank.
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

  for (const [strip, [lo, hi]] of spans) {
    const inStrip = (it: Item) => path(it.owner).includes(strip)
    for (const items of chains.values()) {
      const chain = items.toSorted((a, b) => a.rank - b.rank)
      const top = chain[0]!
      const bottom = chain.at(-1)!
      if (inStrip(top) === inStrip(bottom)) {
        continue
      }

      // From the outer end toward the inner one.
      const walk = inStrip(top) ? chain.toReversed() : chain
      let want: Side | null = null
      for (const it of walk) {
        if (inStrip(it) || it.rank < lo || it.rank > hi) {
          continue
        }

        const rank = ranks[it.rank]!
        const side = sideOf(rank, rank.indexOf(it), inStrip)
        if (side === null) {
          continue
        }

        if (want === null) {
          want = side
          continue
        }

        if (side !== want && (it.kind === 'label' || it.kind === 'dummy')) {
          rank.splice(rank.indexOf(it), 1)
          const first = rank.findIndex(inStrip)
          const last = rank.findLastIndex(inStrip)
          rank.splice(want === 'before' ? first : last + 1, 0, it)
        }
      }
    }
  }

  return ranks
}
