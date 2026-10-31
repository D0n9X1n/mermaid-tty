// Side notes (plan C A3): a note is drawn beside its node when its node's ranks go down (TB, BT), placed by layered;
// when they go across (LR, RL) it becomes a note node joined to its node by a dotted, headless link edge.
import { labelLines } from '../text.ts'
import { ancestors, clusterTree } from './clusters.ts'
import type { Dir, GEdge, GNode, Graph, NodeRow } from './model.ts'

// g with each across note turned into a node and a link; pure. A node's direction is that of its nearest sealed
// ancestor cluster with one, else g's: sealed as before any note is added. The note node joins the innermost cluster
// that lists its node, so a sealed composite stays sealed. A keyed note's node has one key row.
export function withNotes(g: Graph): Graph {
  const t = clusterTree(g)
  const dirOf = (id: string): Dir =>
    ancestors(t.parent, id)
      .map((c) => t.byId.get(c)!)
      .find((c) => t.sealed.has(c.id) && c.dir !== null)?.dir ?? g.dir
  const nodes: GNode[] = []
  const added: GNode[] = []
  const edges: GEdge[] = []
  const home = new Map<string, string>()
  for (const n of g.nodes) {
    const d = n.note ? dirOf(n.id) : null
    if (!n.note || d === 'TB' || d === 'BT') {
      nodes.push(n)
      continue
    }

    const { note, ...rest } = n
    nodes.push(rest)
    const rows: NodeRow[] =
      note.key !== undefined
        ? [{ text: note.key, role: 'note', align: 'left', key: true }]
        : labelLines(note.text).map((text) => ({ text, role: 'note', align: 'left' }))
    added.push({ id: note.id, shape: 'plain', role: 'note', rows, order: g.nodes.length + added.length })
    const into = (note.side === 'left') === (d === 'LR')
    edges.push({
      id: `${note.id}:link`,
      from: into ? note.id : n.id,
      to: into ? n.id : note.id,
      style: 'dotted',
      tail: 'none',
      head: 'none',
      label: null,
      minlen: 1,
      order: g.edges.length + edges.length,
    })
    const c = t.parent.get(n.id)
    if (c !== undefined) {
      home.set(note.id, c)
    }
  }

  if (added.length === 0) {
    return g
  }

  const clusters = g.clusters.map((c) => {
    const more = added.filter((n) => home.get(n.id) === c.id).map((n) => n.id)
    return more.length > 0 ? { ...c, nodes: [...c.nodes, ...more] } : c
  })
  return { ...g, nodes: [...nodes, ...added], edges: [...g.edges, ...edges], clusters }
}
