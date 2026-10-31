// The class module (plan C T58): its parser, and the graph ladder (T53) with relation labels and notes keyable. Each class is
// a rect pill: its «annot» row, its label, then its member rows (members.ts). It registers itself on import, as flowchart's does.
import { fieldKey, type LegendRow } from '../../charts/legend.ts'
import { fail, isFail, type Fail } from '../../fail.ts'
import { drawAt, graphSteps, type Build } from '../../graph/ladder.ts'
import { classRows } from '../../graph/members.ts'
import type { GEdge, GNode, NodeRow } from '../../graph/model.ts'
import type { DiagramModule } from '../../registry.ts'
import { register } from '../../registry.ts'
import type { Source } from '../../source.ts'
import { labelLines } from '../../text.ts'
import { parseClass, type ClassModel } from './parse.ts'

// Relation k is edge r<k>; note k is node note<k>.
const rel = (k: number): string => `r${k}`
// A name a generated owner takes, or may: an edge r<k>, a note note<k>.
const RESERVED = /^(?:r|note)\d+$/

// Every owner id the drawing will use: classes, their annotation and member rows, namespaces, relations, their label and end
// labels, notes and their links. A class or namespace named as a relation or note could be, or any id twice, makes owners
// ambiguous: 'id-clash'.
function clash(m: ClassModel): Fail | null {
  const named = [...m.classes.map((c) => c.id), ...m.namespaces.map((n) => n.id)]
  const ids = [
    ...named,
    ...m.classes.flatMap((c) => [`${c.id}.annot`, ...c.members.map((_, k) => `${c.id}.m${k}`)]),
    ...m.relations.flatMap((_, k) => [rel(k), `${rel(k)}:label`, `${rel(k)}:tail`, `${rel(k)}:head`]),
    ...m.notes.flatMap((n) => [n.id, `${n.id}:link`]),
  ]
  return named.some((id) => RESERVED.test(id)) || new Set(ids).size !== ids.length ? fail('id-clash') : null
}

function parse(src: Source): ClassModel | Fail {
  const m = parseClass(src)
  return isFail(m) ? m : (clash(m) ?? m)
}

// The keyable items, relation labels and notes, in source order: the order the parse gives them together.
function items(m: ClassModel): { item: string; cls: 'label' | 'note'; text: string }[] {
  return [
    ...m.relations.flatMap((r, k) =>
      r.label === null ? [] : [{ item: `${rel(k)}:label`, cls: 'label' as const, text: r.label, order: r.order }],
    ),
    ...m.notes.map((n) => ({ item: n.id, cls: 'note' as const, text: n.text, order: n.order })),
  ]
    .sort((a, b) => a.order - b.order)
    .map(({ order: _, ...x }) => x)
}

// The graph for a direction and wrapAt: class pills, note nodes (one key row when keyed), relation edges r<k>, a dotted
// headless link from each `note for` note to its class, and a cluster per namespace. Keyed, each keyable item in order takes
// fieldKey(k) in place and a legend row; keyable lists every item, so each class is keyed all or none (T87).
function build(m: ClassModel): Build {
  return ({ dir, keyed, wrapAt }) => {
    const all = items(m)
    const keys = new Map(all.map((x, k) => [x.item, fieldKey(k)]))
    const nodes: GNode[] = []
    for (const c of m.classes) {
      const members = classRows(c.id, c.members, wrapAt)
      if (isFail(members)) {
        return members
      }
      const head: NodeRow[] = [
        ...(c.annot === null
          ? []
          : [{ text: `«${c.annot}»`, role: 'node' as const, align: 'center' as const, id: `${c.id}.annot` }]),
        ...labelLines(c.label).map((text): NodeRow => ({ text, role: 'node', align: 'center' })),
      ]
      nodes.push({ id: c.id, shape: 'rect', role: 'node', rows: [...head, ...members], order: nodes.length })
    }
    for (const n of m.notes) {
      const key = keyed ? keys.get(n.id) : undefined
      const rows: NodeRow[] =
        key !== undefined
          ? [{ text: key, role: 'note', align: 'left', key: true }]
          : labelLines(n.text).map((text) => ({ text, role: 'note', align: 'left' }))
      nodes.push({ id: n.id, shape: 'plain', role: 'note', rows, order: nodes.length })
    }
    const edges: GEdge[] = m.relations.map((r, k): GEdge => {
      const key = keyed && r.label !== null ? keys.get(`${rel(k)}:label`) : undefined
      return {
        id: rel(k),
        from: r.from,
        to: r.to,
        style: r.line,
        tail: r.tail,
        head: r.head,
        label: r.label,
        minlen: 1,
        order: k,
        ...(r.tailLabel === null ? {} : { tailLabel: r.tailLabel }),
        ...(r.headLabel === null ? {} : { headLabel: r.headLabel }),
        ...(key === undefined ? {} : { labelKey: key }),
      }
    })
    for (const n of m.notes) {
      if (n.for !== null) {
        edges.push({
          id: `${n.id}:link`,
          from: n.id,
          to: n.for,
          style: 'dotted',
          tail: 'none',
          head: 'none',
          label: null,
          minlen: 1,
          order: edges.length,
        })
      }
    }
    const clusters = m.namespaces.map((s) => ({
      id: s.id,
      title: s.label,
      dir: null,
      nodes: [...s.classes, ...s.notes],
      clusters: [],
    }))
    const legend: LegendRow[] = keyed
      ? all.map((x) => ({
          key: keys.get(x.item)!,
          keyInk: x.cls,
          item: x.item,
          cls: x.cls,
          parts: [{ text: labelLines(x.text).join(' '), ink: x.cls, owner: x.item }],
        }))
      : []
    return {
      graph: { dir, title: null, nodes, edges, clusters },
      legend,
      keyable: all.map(({ item, cls }) => ({ item, cls })),
    }
  }
}

// The title stays outside the graph: drawAt stacks it above.
export const classDiagram: DiagramModule<ClassModel> = {
  type: 'class',
  parse,
  steps: (m: ClassModel) => graphSteps(m.dir, items(m).length > 0),
  layout: (m, step, columns) => drawAt(build(m), m.dir, step, columns, m.title),
}

register(classDiagram as DiagramModule)
