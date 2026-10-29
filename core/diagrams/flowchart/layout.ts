// The flowchart diagram module (plan A §6, T19): its parser, its fit ladder, and each step's layout at the given
// columns. It registers itself on import, after registry.ts has run, so MODULES is initialized when register runs.
import type { Drawing } from '../../canvas.ts'
import type { Fail } from '../../fail.ts'
import { fail, isFail } from '../../fail.ts'
import type { Step } from '../../fit.ts'
import { drawGraph } from '../../graph/draw.ts'
import type { Spacing } from '../../graph/layered.ts'
import { layoutGraph } from '../../graph/layered.ts'
import type { Graph } from '../../graph/model.ts'
import { routeGraph } from '../../graph/route.ts'
import type { DiagramModule } from '../../registry.ts'
import { register } from '../../registry.ts'
import { validate } from '../../validate.ts'
import { parseFlowchart } from './parse.ts'

type Gaps = { rankGap: number; nodeGap: number }

// Each step's gaps for a TB or BT graph, and for an LR or RL one. lrToTd draws its TB or BT graph at tight's TB gaps.
export const SPACING: Readonly<Record<'natural' | 'tight' | 'wrap', { TB: Gaps; LR: Gaps }>> = {
  natural: { TB: { rankGap: 3, nodeGap: 4 }, LR: { rankGap: 6, nodeGap: 1 } },
  tight: { TB: { rankGap: 2, nodeGap: 2 }, LR: { rankGap: 4, nodeGap: 1 } },
  wrap: { TB: { rankGap: 2, nodeGap: 2 }, LR: { rankGap: 4, nodeGap: 1 } },
}
const WRAPS = [24, 20, 16, 12, 8] as const

const across = (g: Graph): boolean => g.dir === 'LR' || g.dir === 'RL'

// One attempt: layout, route and draw at the given columns, passing any Fail through.
function attempt(g: Graph, s: Spacing, columns: number): Drawing | Fail {
  for (const extra of [0, 2, 4]) {
    const placed = layoutGraph(g, { ...s, rankGap: s.rankGap + extra, nodeGap: s.nodeGap + extra })
    if (isFail(placed)) return placed
    const routes = routeGraph(placed)
    if (!isFail(routes)) return drawGraph(placed, routes, columns)
    if (routes.reason !== 'route-conflict' || extra === 4) return routes
  }
  return fail('route-conflict')
}

// One attempt per wrapAt, in order: the first drawing validate accepts, else the last attempt.
function firstValid(g: Graph, gaps: Gaps, wraps: readonly (number | null)[], columns: number): Drawing | Fail {
  let last: Drawing | Fail = fail('too-wide')
  for (const wrapAt of wraps) {
    last = attempt(g, { ...gaps, wrapAt }, columns)
    if (!isFail(last) && validate(last) === null) return last
  }
  return last
}

// natural and tight draw once, unwrapped; wrap tries each wrapAt; lrToTd (LR and RL only) redraws LR as TB, RL as BT.
function layout(g: Graph, step: Step, columns: number): Drawing | Fail {
  if (step === 'lrToTd') return firstValid({ ...g, dir: g.dir === 'RL' ? 'BT' : 'TB' }, SPACING.tight.TB, [null, ...WRAPS], columns)
  const gaps = SPACING[step][across(g) ? 'LR' : 'TB']
  return step === 'wrap' ? firstValid(g, gaps, WRAPS, columns) : attempt(g, { ...gaps, wrapAt: null }, columns)
}

export const flowchart: DiagramModule<Graph> = {
  type: 'flowchart',
  parse: parseFlowchart,
  steps: (g: Graph): readonly Step[] => across(g) ? ['natural', 'tight', 'wrap', 'lrToTd'] : ['natural', 'tight', 'wrap'],
  layout,
}

register(flowchart as DiagramModule)
