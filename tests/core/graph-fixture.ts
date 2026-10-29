// Test fixture, not a test file: a Graph from short edge specs, and a Drawing's rows as text.
import type { Cell, Drawing } from '../../core/canvas.ts'
import type { Dir, GEdge, GNode, Graph } from '../../core/graph/model.ts'

const STYLES: Readonly<Record<string, GEdge['style']>> = { '>': 'solid', '=>': 'thick', '.>': 'dotted' }

// g('TB', ['A>B', 'A=>C', 'A.>D', 'D>E|label'], { B: 'one<br/>two' }): nodes in first-seen order, rect, role node, rows the
// label split at <br/> (default the id); edge i is e${i}, tail none, head arrow, minlen 1, its label or null, order i.
export function g(dir: Dir, specs: string[], labels: Record<string, string> = {}): Graph {
  const nodes = new Map<string, GNode>()
  const see = (id: string) => {
    if (!nodes.has(id)) nodes.set(id, { id, shape: 'rect', role: 'node', order: nodes.size,
      rows: (labels[id] ?? id).split('<br/>').map(text => ({ text, role: 'node', align: 'center' })) })
  }
  const edges = specs.map((spec, i): GEdge => {
    const [link = '', label = null] = spec.split('|')
    const [, from = '', op = '', to = ''] = /^(.+?)(=>|\.>|>)(.+)$/.exec(link) ?? []
    see(from); see(to)
    return { id: `e${i}`, from, to, style: STYLES[op]!, tail: 'none', head: 'arrow', label, minlen: 1, order: i }
  })
  return { dir, title: null, nodes: [...nodes.values()], edges, clusters: [] }
}

// One string per row: a cont cell is '', an empty cell ' ', any other its ch; trailing spaces trimmed.
const ch = (c: Cell | null) => (c === null ? ' ' : c.kind === 'cont' ? '' : c.ch)
export const text = (d: Drawing): string[] => d.cells.map(row => row.map(ch).join('').replace(/ +$/, ''))
