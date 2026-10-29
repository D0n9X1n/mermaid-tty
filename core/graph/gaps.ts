// The gaps between rank bands, read back from a Placed alone (plan A §7.6), so the router (T17) finds its channels without
// rerunning the layout. Each level, the top and each sealed block on its own, runs along its own main axis: its bands are
// the merged spans of its boxes and blocks there, and a gap the cells between two bands. borders: the gap's cells that hold
// the top or bottom border of an open cluster on that level, in order; the rest is the gap's channel.
import { ancestors, clusterTree } from './clusters.ts'
import type { Box, Placed } from './layered.ts'

export type Gap = { block: string | null; axis: 'row' | 'col'; from: number; to: number; borders: number[] }

export function gaps(p: Placed): Gap[] {
  const g = p.graph, t = clusterTree(g), nodes = new Set(g.nodes.map(n => n.id)), edges = new Map(g.edges.map(e => [e.id, e]))
  // The sealed cluster a node or cluster is laid out in, or null for the top.
  const home = (x: string) => ancestors(t.parent, x).find(c => t.sealed.has(c)) ?? null
  // A box is a node's, or an edge's label or dummy, which lies on the level of the edge's ends.
  const homeOf = (id: string) => home(nodes.has(id) ? id : edges.get(id.replace(/(:label|#\d+)$/, ''))?.from ?? id)
  const dirOf = (b: string | null): string => (b === null ? g.dir : t.byId.get(b)!.dir ?? dirOf(home(b)))
  const out: Gap[] = []
  for (const b of [null, ...g.clusters.filter(c => t.sealed.has(c.id)).map(c => c.id)]) {
    const axis = dirOf(b) === 'LR' || dirOf(b) === 'RL' ? 'col' : 'row'
    const span = (x: Box): [number, number] => (axis === 'row' ? [x.row, x.row + x.rows - 1] : [x.col, x.col + x.cols - 1])
    const items = [...[...p.boxes].filter(([id]) => homeOf(id) === b), ...[...p.frames].filter(([id]) => t.sealed.has(id) && home(id) === b)]
    const bands: [number, number][] = []
    for (const [a, z] of items.map(([, x]) => span(x)).sort((u, v) => u[0] - v[0])) {
      const last = bands.at(-1)
      if (last && a <= last[1]) last[1] = Math.max(last[1], z)
      else bands.push([a, z])
    }
    const lines = [...p.frames].filter(([id]) => !t.sealed.has(id) && home(id) === b).flatMap(([, x]) => span(x))
    for (let k = 1; k < bands.length; k++) {
      const from = bands[k - 1]![1] + 1, to = bands[k]![0] - 1
      out.push({ block: b, axis, from, to, borders: [...new Set(lines.filter(l => l >= from && l <= to))].sort((u, v) => u - v) })
    }
  }
  return out
}
