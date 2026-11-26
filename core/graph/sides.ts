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
// items at the strip's own level move, labels and bends as well as nodes, so no other strip's items are split apart;
// each strip is set right up to three times, as moving an end for one edge can put another edge of that end on the
// wrong side. backs: the back edges. One with a label or a bend runs in a lane past everything at its level, after
// every strip (layered.ts): so an end of it outside a strip and level with it keeps to the strip's after side, where it
// can reach that lane.
export function keepSides(
  ranks: Item[][],
  segs: readonly Seg[],
  path: (o: string | null) => string[],
  spans: ReadonlyMap<string, readonly [number, number]>,
  backs: ReadonlySet<string> = new Set(),
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
      // An edge that enters the strip: its items outside it, level with it, keep to its outer end's side.
      const passing: Item[][] = []
      const laned = new Set<Item>()
      for (const [edge, items] of chains) {
        const chain = items.toSorted((a, b) => a.rank - b.rank)
        const top = chain[0]!
        const bottom = chain.at(-1)!
        if (inStrip(top) && inStrip(bottom)) {
          continue
        }

        if (backs.has(edge) && chain.length > 2) {
          for (const end of [top, bottom]) {
            if (!inStrip(end) && end.rank >= lo && end.rank <= hi && sideOf(end) !== null) {
              laned.add(end)
            }
          }
        }

        const flank = (walk: readonly Item[]) =>
          walk.filter((it) => !inStrip(it) && it.rank >= lo && it.rank <= hi && sideOf(it) !== null)
        if (!inStrip(top) && !inStrip(bottom)) {
          passing.push(flank(chain))
          continue
        }

        // From the outer end toward the inner one.
        const reach = flank(inStrip(top) ? chain.toReversed() : chain)
        if (reach.length < 2) {
          continue
        }

        const want = sideOf(reach[0]!)!
        for (const it of reach.slice(1)) {
          if (sideOf(it) !== want && (it.kind === 'label' || it.kind === 'dummy') && beside(it)) {
            moveBeside(ranks[it.rank]!, it, want, inStrip)
            moved = true
          }
        }
      }

      // Edges that pass the strip, holding neither end, and the ends they share: each group goes to the side most of
      // its items are on, ties to its first item's, so an end two such edges share is never pulled both ways.
      const group = new Map<Item, number>()
      const join = (a: number, b: number) => {
        for (const [it, g] of group) {
          if (g === b) {
            group.set(it, a)
          }
        }
      }
      passing.forEach((items, i) => {
        for (const it of items) {
          const g = group.get(it)
          if (g !== undefined && g !== i) {
            join(i, g)
          }

          group.set(it, i)
        }
      })
      for (const g of new Set(group.values())) {
        const items = [...group].filter(([, x]) => x === g).map(([it]) => it)
        if (items.length < 2) {
          continue
        }

        const after = items.filter((it) => sideOf(it) === 'after').length
        let want: Side = after * 2 > items.length ? 'after' : 'before'
        if (after * 2 === items.length) {
          want = sideOf(items[0]!)!
        }

        if (items.some((it) => laned.has(it))) {
          want = 'after'
        }

        for (const it of items) {
          const movable = beside(it) && it.kind !== 'block' && it.kind !== 'spacer'
          if (sideOf(it) !== want && movable) {
            moveBeside(ranks[it.rank]!, it, want, inStrip)
            moved = true
          }
        }
      }

      // A laned back edge's end no group above placed: it goes after the strip on its own.
      for (const it of laned) {
        if (group.has(it) || sideOf(it) === 'after' || !(it.kind === 'node' && beside(it))) {
          continue
        }

        moveBeside(ranks[it.rank]!, it, 'after', inStrip)
        moved = true
      }
    }

    if (!moved) {
      break
    }
  }

  return ranks
}
