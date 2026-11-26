// The fit ladder runner: a type's layout steps, tried in its order until one draws a drawing the validator accepts.
import type { Drawing } from './canvas.ts'
import type { Fail } from './fail.ts'
import { fail, isFail } from './fail.ts'
import type { DiagramModule } from './registry.ts'
import { validate } from './validate.ts'

// A's four steps, then C's. A type's ladder lists only the steps its layout draws.
export type Step =
  | 'natural'
  | 'tight'
  | 'wrap'
  | 'lrToTd'
  | 'keyed'
  | 'keyedWrap'
  | 'horizontal'
  | 'oneActor'
  | 'compact'
  | 'outline'

// The reasons that only say a drawing is wider than the terminal. A ladder's later steps are its narrower ones, so they
// often fail for width alone; that says nothing about why a wider step that fitted was rejected.
const WIDTH = new Set(['too-wide', 'row-too-wide', 'word-too-wide'])

// The path-search expansions one fitLadder call's whole rescue pass may spend, across every step, wrap, gap and search.
// A rescue that draws needs well under this; one that cannot stops here instead of searching on.
export const RESCUE_WORK = 50000

// The steps that draw the diagram another way when its own layout cannot: lrToTd, a left-to-right graph top to bottom.
// The steps before one can spend a rescue pass's whole budget, so it starts with RESCUE_WORK of its own.
const FALLBACK: ReadonlySet<Step> = new Set(['lrToTd'])

// The first step whose drawing validate accepts, with that drawing. A step is skipped when its layout fails, when its
// drawing declares other columns than it was given (validate measures rows against the drawing's own columns, so a
// wider claim would pass it), or when validate rejects its drawing. If every step is skipped, the first reason that is
// not about width, so the debug log names what kept a fitting drawing off the screen; the last step's reason when width
// is all that failed; 'too-wide' when the ladder has no step. Only then, if the type has a rescue, each step runs again
// through it, in order, under the same checks, until RESCUE_WORK expansions are spent, a FALLBACK step on RESCUE_WORK
// of its own; the first it draws is taken. If none does, a second rescue pass runs the same way, on RESCUE_WORK of its
// own, with rip set: the search router then routes again with each edge it got stuck on first. Running them last keeps
// every drawing the steps find exactly as it is, the second pass keeps every drawing the first finds, and a rescue that
// draws nothing leaves the steps' reason.
export function fitLadder<M>(
  mod: DiagramModule<M>,
  model: M,
  columns: number,
): { step: Step; drawing: Drawing } | Fail {
  let last = fail('too-wide')
  let cause: Fail | null = null
  const skip = (f: Fail) => {
    last = f
    if (cause === null && !WIDTH.has(f.reason)) {
      cause = f
    }
  }

  for (const step of mod.steps(model)) {
    const drawing = mod.layout(model, step, columns)
    const rejected = check(drawing, columns)
    if (rejected) {
      skip(rejected)
      continue
    }

    return { step, drawing: drawing as Drawing }
  }

  for (const rip of [false, true]) {
    let work = { left: RESCUE_WORK, rip }
    for (const step of mod.rescue ? mod.steps(model) : []) {
      if (FALLBACK.has(step)) {
        work = { left: RESCUE_WORK, rip }
      }

      if (work.left <= 0) {
        continue
      }

      const drawing = mod.rescue!(model, step, columns, work)
      if (!check(drawing, columns)) {
        return { step, drawing: drawing as Drawing }
      }
    }
  }

  return cause ?? last
}

// Why a layout's result is not a drawing to show: its own Fail, columns-mismatch when it declares other columns than it
// was given (validate measures rows against the drawing's own columns, so a wider claim would pass it), or what
// validate rejects; null when it is one.
function check(drawing: Drawing | Fail, columns: number): Fail | null {
  if (isFail(drawing)) {
    return drawing
  }

  return drawing.columns !== columns ? fail('columns-mismatch') : validate(drawing)
}
