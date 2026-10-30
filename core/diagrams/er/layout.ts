// The er module (plan C T61; matrix, ER): its parser, and the graph ladder. An entity is a pill of its label and its aligned
// attribute columns; a relation an unheaded line, solid or dotted, with its cardinality at each end. At keyed, comments and
// relation labels take one key sequence, in source order; cardinality is never keyed. It registers itself on import.
import { fieldKey, type LegendRow } from '../../charts/legend.ts'
import { fail, isFail, type Fail } from '../../fail.ts'
import { drawAt, graphSteps, type Build } from '../../graph/ladder.ts'
import { erRows } from '../../graph/members.ts'
import type { GEdge, GNode, NodeRow } from '../../graph/model.ts'
import type { DiagramModule } from '../../registry.ts'
import { register } from '../../registry.ts'
import type { Source } from '../../source.ts'
import { labelLines } from '../../text.ts'
import { parseEr, type ErModel } from './parse.ts'

// The model, or 'id-clash' when an entity or subgraph id is an owner id the drawing mints: a relation's r<k>, its end labels,
// label and chain cells, an attribute column's, or the title. Owners would then be ambiguous, so the fence falls back.
function parse(src: Source): ErModel | Fail {
  const m = parseEr(src)
  if (isFail(m)) return m
  const minted = new Set([...(m.title === null ? [] : ['title']), ...m.relations.flatMap(r => [r.id, `${r.id}:label`, `${r.id}:tail`, `${r.id}:head`]),
    ...m.entities.flatMap(e => e.attrs.flatMap((_, k) => ['type', 'name', 'keys', 'comment'].map(f => `${e.id}.a${k}.${f}`)))])
  const ids = [...m.entities.map(e => e.id), ...m.subgraphs.map(s => s.id)]
  return ids.some(id => minted.has(id) || m.relations.some(r => id.startsWith(`${r.id}#`))) ? fail('id-clash') : m
}

// The graph for one try. Keyed, each keyable item's text is its key: a comment column's, drawn in its place, or an edge's labelKey.
function build(m: ErModel, { dir, keyed, wrapAt }: Parameters<Build>[0]): ReturnType<Build> {
  const key = new Map(keyed ? m.keyable.map((x, k) => [x.owner, fieldKey(k)] as const) : [])
  const nodes: GNode[] = []
  for (const e of m.entities) {
    const owner = (k: number) => `${e.id}.a${k}.comment`
    const rows = erRows(e.id, e.attrs.map((a, k) => (key.has(owner(k)) ? { ...a, comment: key.get(owner(k))! } : a)), wrapAt)
    if (isFail(rows)) return rows
    const keyedRows = rows.map((r): NodeRow => (r.cols ? { ...r, cols: r.cols.map(c => (key.has(c.id) ? { ...c, key: key.get(c.id)! } : c)) } : r))
    nodes.push({ id: e.id, shape: 'rect', role: 'node', order: e.order, rows: [{ text: e.label, role: 'node', align: 'center' }, ...keyedRows] })
  }
  const edges = m.relations.map((r): GEdge => ({ id: r.id, from: r.from, to: r.to, style: r.line, tail: 'none', head: 'none',
    label: r.label === '' ? null : r.label, minlen: 1, order: r.order, tailLabel: r.left, headLabel: r.right, endRole: 'arrow',
    ...(key.has(`${r.id}:label`) ? { labelKey: key.get(`${r.id}:label`)! } : {}) }))
  const clusters = m.subgraphs.map(s => ({ id: s.id, title: s.title ?? s.id, dir: s.dir, nodes: [...s.entities], clusters: [...s.subgraphs] }))
  const cls = (owner: string) => (owner.endsWith(':label') ? 'label' as const : 'comment' as const)
  const legend = m.keyable.filter(x => key.has(x.owner)).map((x): LegendRow => {
    const ink = cls(x.owner) === 'label' ? 'label' : 'note'
    return { key: key.get(x.owner)!, keyInk: ink, item: x.owner, cls: cls(x.owner), parts: [{ text: labelLines(x.text).join(' '), ink, owner: x.owner }] }
  })
  return { graph: { dir, title: null, nodes, edges, clusters }, legend, keyable: m.keyable.map(x => ({ item: x.owner, cls: cls(x.owner) })) }
}

export const er: DiagramModule<ErModel> = {
  type: 'er',
  parse,
  steps: m => graphSteps(m.dir, true),
  layout: (m, step, columns) => drawAt(o => build(m, o), m.dir, step, columns, m.title),
}

register(er as DiagramModule)
