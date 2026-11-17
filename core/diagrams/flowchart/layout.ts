// The flowchart diagram module: its parser, and its fit ladder, the graph ladder. It registers itself on import, after
// registry.ts has run, so MODULES is initialized when register runs.
import type { Step } from '../../fit.ts'
import { drawAt, graphSteps, type Build } from '../../graph/ladder.ts'
import type { Graph } from '../../graph/model.ts'
import type { DiagramModule } from '../../registry.ts'
import { register } from '../../registry.ts'
import { parseFlowchart } from './parse.ts'

export { SPACING } from '../../graph/ladder.ts'

// The graph in the direction a step draws it, with nothing to key.
const build =
  (g: Graph): Build =>
  ({ dir }) => ({ graph: { ...g, dir }, legend: [], keyable: [] })

// natural, tight and wrap, plus lrToTd for LR and RL; nothing to key. The title stays in the graph, where graph/draw.ts
// draws it on row 0.
export const flowchart: DiagramModule<Graph> = {
  type: 'flowchart',
  parse: parseFlowchart,
  steps: (g: Graph): readonly Step[] => graphSteps(g.dir, false),
  layout: (g, step, columns) => drawAt(build(g), g.dir, step, columns, null),
  rescue: (g, step, columns, work) => drawAt(build(g), g.dir, step, columns, null, work),
}

register(flowchart as DiagramModule)
