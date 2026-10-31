// The gaps between rank bands, read back from a Placed alone, so the router finds its channels without rerunning the
// layout. Each level, the top and each sealed block on its own, runs along its own main axis: its bands are the ones
// the layout recorded in Placed.bands (with none, there are no gaps), and a gap the cells between two bands. borders:
// the gap's cells that hold the top or bottom border of an open cluster on that level, in order; the rest is the gap's
// channel.
import { ancestors, clusterTree } from './clusters.ts'
import type { Box, Placed } from './layered.ts'

export type Gap = { block: string | null; axis: 'row' | 'col'; from: number; to: number; borders: number[] }

export function gaps(p: Placed): Gap[] {
  const g = p.graph
  const t = clusterTree(g)
  const out: Gap[] = []
  // The sealed cluster a cluster is laid out in, or null for the top.
  const home = (x: string) => ancestors(t.parent, x).find((c) => t.sealed.has(c)) ?? null
  for (const b of [null, ...g.clusters.filter((c) => t.sealed.has(c.id)).map((c) => c.id)]) {
    const bands = (p.bands ?? []).filter((n) => n.block === b).sort((u, v) => u.from - v.from)
    const axis = bands[0]?.axis ?? 'row'
    const span = (x: Box) => (axis === 'row' ? [x.row, x.row + x.rows - 1] : [x.col, x.col + x.cols - 1])
    const lines = [...p.frames].filter(([id]) => !t.sealed.has(id) && home(id) === b).flatMap(([, x]) => span(x))
    for (let k = 1; k < bands.length; k++) {
      const from = bands[k - 1]!.to + 1
      const to = bands[k]!.from - 1
      out.push({
        block: b,
        axis,
        from,
        to,
        borders: [...new Set(lines.filter((l) => l >= from && l <= to))].sort((u, v) => u - v),
      })
    }
  }

  return out
}
