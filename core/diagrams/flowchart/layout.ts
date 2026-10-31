// The flowchart diagram module: its parser, and its fit ladder, the graph ladder. It registers itself on import, after
// registry.ts has run, so MODULES is initialized when register runs.
import type { Step } from '../../fit.ts'
import { drawAt, graphSteps } from '../../graph/ladder.ts'
import type { Graph } from '../../graph/model.ts'
import type { DiagramModule } from '../../registry.ts'
import { register } from '../../registry.ts'
import { parseFlowchart } from './parse.ts'

export { SPACING } from '../../graph/ladder.ts'

// natural, tight and wrap, plus lrToTd for LR and RL; nothing to key. The title stays in the graph, where T18 draws it.
export const flowchart: DiagramModule<Graph> = {
  type: 'flowchart',
  parse: parseFlowchart,
  steps: (g: Graph): readonly Step[] => graphSteps(g.dir, false),
  layout: (g, step, columns) =>
    drawAt(({ dir }) => ({ graph: { ...g, dir }, legend: [], keyable: [] }), g.dir, step, columns, null),
}

register(flowchart as DiagramModule)
