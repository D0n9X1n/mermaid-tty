// Test fixture, not a test file: a Graph from short edge specs, and a Drawing's rows as text.
import type { Cell, Drawing } from '../../core/canvas.ts'
import type { Dir, GEdge, GNode, Graph } from '../../core/graph/model.ts'

const STYLES: Readonly<Record<string, GEdge['style']>> = { '>': 'solid', '=>': 'thick', '.>': 'dotted' }

// g('TB', ['A>B', 'A=>C', 'A.>D', 'D>E|label'], { B: 'one<br/>two' }): nodes in first-seen order, rect, role node, rows the
// label split at <br/> (default the id); edge i is e${i}, tail none, head arrow, minlen 1, its label or null, order i.
export function g(dir: Dir, specs: string[], labels: Record<string, string> = {}): Graph {
  const nodes = new Map<string, GNode>()
  const see = (id: string) => {
    if (!nodes.has(id)) {
      nodes.set(id, {
        id,
        shape: 'rect',
        role: 'node',
        order: nodes.size,
        rows: (labels[id] ?? id).split('<br/>').map((text) => ({ text, role: 'node', align: 'center' })),
      })
    }
  }
  const edges = specs.map((spec, i): GEdge => {
    const [link = '', label = null] = spec.split('|')
    const [, from = '', op = '', to = ''] = /^(.+?)(=>|\.>|>)(.+)$/.exec(link) ?? []
    see(from)
    see(to)
    return { id: `e${i}`, from, to, style: STYLES[op]!, tail: 'none', head: 'arrow', label, minlen: 1, order: i }
  })
  return { dir, title: null, nodes: [...nodes.values()], edges, clusters: [] }
}

// One string per row: a cont cell is '', an empty cell ' ', any other its ch; trailing spaces trimmed.
const ch = (c: Cell | null) => (c === null ? ' ' : c.kind === 'cont' ? '' : c.ch)
export const text = (d: Drawing): string[] => d.cells.map((row) => row.map(ch).join('').replace(/ +$/, ''))

// Independently read shared arms as joined edge networks, then enumerate the bare-end/mark pairs they imply that no edge draws.
export function falsePairs(d: Drawing): string[] {
  const edges = new Map(d.expect.edges.map((e) => [e.id, e]))
  const groups = new Map(d.expect.edges.map((e) => [e.id, new Set([e.id])]))
  for (const row of d.cells) {
    for (const c of row) {
      if (c?.kind !== 'line') {
        continue
      }
      const segs = (c.segs ?? []).filter((s) => edges.has(s.owner))
      for (const a of segs) {
        for (const b of segs) {
          if (a.dirs & b.dirs) {
            const all = new Set([...groups.get(a.owner)!, ...groups.get(b.owner)!])
            for (const id of all) {
              groups.set(id, all)
            }
          }
        }
      }
    }
  }
  // Per edge, its bare ends (an endpoint no mark names; a self-loop's node twice) and its marks, each `-${kind}${node}`: an
  // arrow `->`, a circle `-o`, a cross `-x`, any other glyph itself. A pair t-kh reads from a bare end t to a mark kh.
  const kind = (glyph: string) => ('▼▲►◄'.includes(glyph) ? '>' : glyph)
  const marks = (e: Drawing['expect']['edges'][number]) => (e.ends ?? []).map((end) => `-${kind(end.glyph)}${end.node}`)
  const bare = (e: Drawing['expect']['edges'][number]) =>
    [...new Set([e.from, e.to])].filter(
      (n) => Number(e.from === n) + Number(e.to === n) > (e.ends ?? []).filter((end) => end.node === n).length,
    )
  const read = (a: Drawing['expect']['edges'][number], b: Drawing['expect']['edges'][number]) =>
    bare(a).flatMap((t) => marks(b).map((m) => `${t}${m}`))
  const pairs = new Set(d.expect.edges.flatMap((e) => read(e, e)))
  const bad = new Set<string>()
  for (const ids of new Set(groups.values())) {
    if (ids.size < 2) {
      continue
    }
    const members = [...ids].map((id) => edges.get(id)!)
    for (const a of members) {
      for (const b of members) {
        for (const pair of read(a, b)) {
          if (!pairs.has(pair)) {
            bad.add(pair)
          }
        }
      }
    }
  }
  return [...bad].sort()
}
