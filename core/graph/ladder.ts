// The graph fit ladder (plan C T53): flowchart's, state's, class's and ER's steps, and one step's drawing at the given
// columns: a graph, its title above and its legend below.
import type { Drawing } from '../canvas.ts'
import { heading, stack } from '../charts/sheet.ts'
import { withLegend, type LegendRow } from '../charts/legend.ts'
import type { Fail } from '../fail.ts'
import { fail, isFail } from '../fail.ts'
import type { Step } from '../fit.ts'
import { validate, type Expect } from '../validate.ts'
import { drawGraph } from './draw.ts'
import { layoutGraph } from './layered.ts'
import type { Dir, Graph } from './model.ts'
import { withNotes } from './notes.ts'
import { routeGraph } from './route.ts'

type Gaps = { rankGap: number; nodeGap: number }
type GraphStep = 'natural' | 'tight' | 'wrap' | 'lrToTd' | 'keyed'
type Row = 'natural' | 'tight' | 'wrap'

// Each spacing row's gaps for the direction drawn: TB for a TB or BT graph, LR for an LR or RL one.
export const SPACING: Readonly<Record<Row, { TB: Gaps; LR: Gaps }>> = {
  natural: { TB: { rankGap: 3, nodeGap: 4 }, LR: { rankGap: 6, nodeGap: 1 } },
  tight: { TB: { rankGap: 2, nodeGap: 2 }, LR: { rankGap: 4, nodeGap: 1 } },
  wrap: { TB: { rankGap: 2, nodeGap: 2 }, LR: { rankGap: 4, nodeGap: 1 } },
}
const WRAPS = [24, 20, 16, 12, 8] as const
// Each ladder step's spacing row and wrapAt tries. Typed by GraphStep, so a step added there with no row fails to compile.
const PLAN: Readonly<Record<GraphStep, { row: Row; wraps: readonly (number | null)[] }>> = {
  natural: { row: 'natural', wraps: [null] }, tight: { row: 'tight', wraps: [null] }, wrap: { row: 'wrap', wraps: WRAPS },
  lrToTd: { row: 'wrap', wraps: [null, ...WRAPS] }, keyed: { row: 'wrap', wraps: [null, ...WRAPS] },
}
const isGraphStep = (s: Step): s is GraphStep => Object.hasOwn(PLAN, s)
const across = (d: Dir): boolean => d === 'LR' || d === 'RL'

// What a diagram builds for a direction and a try's wrapAt: its graph, keyed or not, the legend rows of its keys and the items
// it may key. A Fail (a member word wider than wrapAt) ends the try.
export type Build = (o: { dir: Dir; keyed: boolean; wrapAt: number | null }) => { graph: Graph; legend: readonly LegendRow[]; keyable: NonNullable<Expect['keyable']> } | Fail

// natural, tight and wrap, plus lrToTd for LR and RL, plus keyed when the diagram has items to key.
export function graphSteps(dir: Dir, keyable: boolean): GraphStep[] {
  return [...(['natural', 'tight', 'wrap'] as const), ...(across(dir) ? ['lrToTd' as const] : []), ...(keyable ? ['keyed' as const] : [])]
}

// One try at wrapAt: build the graph, add its notes, lay it out at 0, then 2, then 4 extra cells of rank and node gap while
// routing conflicts, draw it, stack the title above, then the legend below. Build runs once per layout, so each retry
// starts fresh. Any Fail but a route-conflict returns at once; keyed with nothing keyable fails 'step'.
function attempt(build: Build, dir: Dir, keyed: boolean, gaps: Gaps, wrapAt: number | null, columns: number,
  title: string | null): Drawing | Fail {
  let last: Fail = fail('route-conflict')
  for (const extra of [0, 2, 4]) {
    const b = build({ dir, keyed, wrapAt })
    if (isFail(b)) return b
    if (keyed && b.keyable.length === 0) return fail('step')
    const placed = layoutGraph(withNotes(b.graph), { rankGap: gaps.rankGap + extra, nodeGap: gaps.nodeGap + extra, wrapAt })
    if (isFail(placed)) return placed
    const routes = routeGraph(placed)
    if (isFail(routes)) { if (routes.reason !== 'route-conflict') return routes; last = routes; continue }
    const d = drawGraph(placed, routes, columns), head = title === null ? null : heading(title, 'title', 'title', columns)
    const titled = head === null ? d : isFail(head) ? head : stack([head, d], columns)
    // Nothing to key (flowchart): no legend pass, so the drawing's expect stays exactly A's, with no empty keys or keyable.
    return b.legend.length === 0 && b.keyable.length === 0 ? titled : withLegend(titled, b.legend, columns, b.keyable)
  }
  return last
}

// step's drawing at columns: each of its wrapAt tries in order, the first drawing validate accepts, else the last try.
// lrToTd and keyed draw LR as TB and RL as BT; only keyed builds keyed. A step off the graph ladder fails 'step'.
export function drawAt(build: Build, dir: Dir, step: Step, columns: number, title: string | null): Drawing | Fail {
  if (!isGraphStep(step)) return fail('step')
  const { row, wraps } = PLAN[step], turn = step === 'lrToTd' || step === 'keyed'
  const drawn: Dir = !turn ? dir : dir === 'LR' ? 'TB' : dir === 'RL' ? 'BT' : dir
  const gaps = SPACING[row][across(drawn) ? 'LR' : 'TB']
  let last: Drawing | Fail = fail('too-wide')
  for (const wrapAt of wraps) {
    last = attempt(build, drawn, step === 'keyed', gaps, wrapAt, columns, title)
    if (!isFail(last) && validate(last) === null) return last
  }
  return last
}
