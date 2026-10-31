// The state diagram module (plan C T55): its parser, and the graph ladder (T53) with a keyed step for its notes. It
// registers itself on import, as flowchart's does. Roles come from the parse (states, marks and bars node, a choice
// decision) and from the graph drawing (composites frame, transition labels label, notes note).
import { fieldKey, type LegendRow } from '../../charts/legend.ts'
import type { Step } from '../../fit.ts'
import { drawAt, graphSteps, type Build } from '../../graph/ladder.ts'
import { labelLines } from '../../text.ts'
import type { DiagramModule } from '../../registry.ts'
import { register } from '../../registry.ts'
import { parseState, type StateModel } from './parse.ts'

// The graph drawn in dir. Keyed: each note, in source order, keyed a, b, … in place, with its legend row; its text joined
// by spaces. Unkeyed: the notes as written and no legend. Either way every note is keyable, so keyed keys all or none.
function build(m: StateModel, { dir, keyed }: Parameters<Build>[0]): ReturnType<Build> {
  const byId = new Map(m.graph.nodes.flatMap((n) => (n.note ? [[n.note.id, n.note] as const] : [])))
  const noted = m.notes.map((id) => byId.get(id)!)
  const keyable = noted.map((n) => ({ item: n.id, cls: 'note' }))
  if (!keyed) {
    return { graph: { ...m.graph, dir }, legend: [], keyable }
  }
  const keys = new Map(noted.map((n, k) => [n.id, fieldKey(k)]))
  const nodes = m.graph.nodes.map((n) => (n.note ? { ...n, note: { ...n.note, key: keys.get(n.note.id)! } } : n))
  const legend: LegendRow[] = noted.map((n) => ({
    key: keys.get(n.id)!,
    keyInk: 'note',
    item: n.id,
    cls: 'note',
    parts: [{ text: labelLines(n.text).join(' '), ink: 'note', owner: n.id }],
  }))
  return { graph: { ...m.graph, dir, nodes }, legend, keyable }
}

// natural, tight and wrap, lrToTd for LR and RL, and keyed; keyed with no note fails 'step'. The title goes above.
export const state: DiagramModule<StateModel> = {
  type: 'state',
  parse: parseState,
  steps: (m: StateModel): readonly Step[] => graphSteps(m.graph.dir, true),
  layout: (m, step, columns) => drawAt((o) => build(m, o), m.graph.dir, step, columns, m.title),
}

register(state as DiagramModule)
