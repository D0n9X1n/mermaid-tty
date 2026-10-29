// The cluster tree (plan A §7.3, §7.7): what holds each node and cluster, which clusters are sealed (no edge crosses their
// border) and a sealed cluster's subgraph.
import type { GCluster, Graph } from './model.ts'

export type Tree = { parent: ReadonlyMap<string, string>; byId: ReadonlyMap<string, GCluster>; sealed: ReadonlySet<string> }

// The clusters around x, innermost first; a malformed loop stops where it repeats.
export function ancestors(parent: ReadonlyMap<string, string>, x: string): string[] {
  const out: string[] = []
  for (let c = parent.get(x); c !== undefined && c !== x && !out.includes(c); c = parent.get(c)) out.push(c)
  return out
}

// An edge crosses a cluster's border when exactly one of its ends lies inside it; an end on the cluster itself is not inside.
export function clusterTree(g: Pick<Graph, 'edges' | 'clusters'>): Tree {
  const parent = new Map<string, string>(), byId = new Map(g.clusters.map(c => [c.id, c]))
  for (const c of g.clusters) for (const x of [...c.nodes, ...c.clusters]) parent.set(x, c.id)
  const open = new Set<string>()
  for (const e of g.edges) {
    const a = ancestors(parent, e.from), b = ancestors(parent, e.to)
    for (const c of [...a, ...b]) if (!(a.includes(c) && b.includes(c))) open.add(c)
  }
  return { parent, byId, sealed: new Set(g.clusters.map(c => c.id).filter(id => !open.has(id))) }
}

// A sealed cluster's subgraph: the nodes, edges and clusters inside it, in its own direction or else g's.
export function subgraph(g: Graph, t: Tree, c: GCluster): Graph {
  const inside = (x: string) => ancestors(t.parent, x).includes(c.id)
  return { dir: c.dir ?? g.dir, title: null, nodes: g.nodes.filter(n => inside(n.id)),
    edges: g.edges.filter(e => inside(e.from) && inside(e.to)), clusters: g.clusters.filter(k => inside(k.id)) }
}
