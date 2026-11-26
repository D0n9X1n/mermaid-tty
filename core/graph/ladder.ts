// The graph fit ladder: flowchart's, state's, class's and ER's steps, and one step's drawing at the given columns: a
// graph, its title above and its legend below.
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
type Try = { row: Row; wrapAt: number | null }
const tries = (row: Row, wraps: readonly (number | null)[]): Try[] => wraps.map((wrapAt) => ({ row, wrapAt }))
// Each ladder step's tries, in order: a spacing row and a wrapAt each. Typed by GraphStep, so a step added there with
// no tries fails to compile. lrToTd is a left-to-right graph that cannot draw so, falling back to top to bottom: it
// tries what a top-to-bottom graph's own steps try, natural, then tight, then wrap, so it draws as that graph would.
const PLAN: Readonly<Record<GraphStep, readonly Try[]>> = {
  natural: tries('natural', [null]),
  tight: tries('tight', [null]),
  wrap: tries('wrap', WRAPS),
  lrToTd: [...tries('natural', [null]), ...tries('tight', [null]), ...tries('wrap', WRAPS)],
  keyed: tries('wrap', [null, ...WRAPS]),
}
// A step's tries on the rescue pass, where they share one budget, when they differ from its plain tries. natural, the
// widest, can spend that budget at a width only a tighter spacing fits, so lrToTd's rescue tries the tight spacing
// first, wrapped as the terminal needs, then natural.
const RESCUE: Readonly<Partial<Record<GraphStep, readonly Try[]>>> = {
  lrToTd: [...tries('wrap', [null, ...WRAPS]), ...tries('natural', [null])],
}
const isGraphStep = (s: Step): s is GraphStep => Object.hasOwn(PLAN, s)
const across = (d: Dir): boolean => d === 'LR' || d === 'RL'

// What a diagram builds for a direction and a try's wrapAt: its graph, keyed or not, the legend rows of its keys and
// the items it may key. A Fail (a member word wider than wrapAt) ends the try.
export type Build = (o: {
  dir: Dir
  keyed: boolean
  wrapAt: number | null
}) => { graph: Graph; legend: readonly LegendRow[]; keyable: NonNullable<Expect['keyable']> } | Fail

// The steps that turn a left-to-right graph top to bottom, lrToTd and keyed, its fallbacks when it cannot draw as
// written; none for a top-to-bottom graph, whose keyed step keeps its direction.
export function graphFallbacks(dir: Dir): GraphStep[] {
  return across(dir) ? ['lrToTd', 'keyed'] : []
}

// natural, tight and wrap, plus lrToTd for LR and RL, plus keyed when the diagram has items to key.
export function graphSteps(dir: Dir, keyable: boolean): GraphStep[] {
  return [
    ...(['natural', 'tight', 'wrap'] as const),
    ...(across(dir) ? ['lrToTd' as const] : []),
    ...(keyable ? ['keyed' as const] : []),
  ]
}

// One try at wrapAt: build the graph, add its notes, lay it out at 0, then 2, then 4 extra cells of rank and node gap
// while routing conflicts, draw it, stack the title above, then the legend below. work, a rescue pass's budget, goes to
// the router, and the try stops once it is spent (routeGraph). Build runs once per layout, so each retry starts fresh.
// Any Fail but a route-conflict returns at once; keyed with nothing keyable fails 'step'.
function attempt(
  build: Build,
  dir: Dir,
  keyed: boolean,
  gaps: Gaps,
  wrapAt: number | null,
  columns: number,
  title: string | null,
  work: { left: number } | undefined,
): Drawing | Fail {
  let last: Fail = fail('route-conflict')
  for (const extra of [0, 2, 4]) {
    if (work && work.left <= 0) {
      return last
    }

    const b = build({ dir, keyed, wrapAt })
    if (isFail(b)) {
      return b
    }

    if (keyed && b.keyable.length === 0) {
      return fail('step')
    }

    const placed = layoutGraph(withNotes(b.graph), {
      rankGap: gaps.rankGap + extra,
      nodeGap: gaps.nodeGap + extra,
      wrapAt,
    })
    if (isFail(placed)) {
      return placed
    }

    const routes = routeGraph(placed, work)
    if (isFail(routes)) {
      if (routes.reason !== 'route-conflict') {
        return routes
      }

      last = routes
      continue
    }

    const d = drawGraph(placed, routes, columns)
    const head = title === null ? null : heading(title, 'title', 'title', columns)
    let titled: Drawing | Fail = d
    if (head !== null) {
      titled = isFail(head) ? head : stack([head, d], columns)
    }

    // Nothing to key (flowchart): no legend pass, so the drawing's expect stays exactly A's, with no empty keys or
    // keyable.
    return b.legend.length === 0 && b.keyable.length === 0 ? titled : withLegend(titled, b.legend, columns, b.keyable)
  }

  return last
}

// step's drawing at columns: each of its tries in order, the first drawing validate accepts, else the last try. lrToTd
// and keyed draw LR as TB and RL as BT; only keyed builds keyed. A step off the graph ladder fails 'step'. With work,
// every try routes on the rescue pass's shared budget: a graph module's rescue layout, which fitLadder runs only after
// every step failed without it, so a drawing the normal ladder finds is never replaced.
export function drawAt(
  build: Build,
  dir: Dir,
  step: Step,
  columns: number,
  title: string | null,
  work?: { left: number },
): Drawing | Fail {
  if (!isGraphStep(step)) {
    return fail('step')
  }

  const turn = step === 'lrToTd' || step === 'keyed'
  // A step that turns the graph draws a left-to-right graph top to bottom, and right-to-left bottom to top.
  const TURNED: Partial<Record<Dir, Dir>> = { LR: 'TB', RL: 'BT' }
  const drawn: Dir = turn ? (TURNED[dir] ?? dir) : dir
  let last: Drawing | Fail = fail('too-wide')
  for (const { row, wrapAt } of (work && RESCUE[step]) || PLAN[step]) {
    const gaps = SPACING[row][across(drawn) ? 'LR' : 'TB']
    last = attempt(build, drawn, step === 'keyed', gaps, wrapAt, columns, title, work)
    if (!isFail(last) && validate(last) === null) {
      return last
    }
  }

  return last
}
