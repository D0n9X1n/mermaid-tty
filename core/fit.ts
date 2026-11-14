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

// The first step whose drawing validate accepts, with that drawing. A step is skipped when its layout fails, when its
// drawing declares other columns than it was given (validate measures rows against the drawing's own columns, so a
// wider claim would pass it), or when validate rejects its drawing. If every step is skipped, the first reason that is
// not about width, so the debug log names what kept a fitting drawing off the screen; the last step's reason when width
// is all that failed; 'too-wide' when the ladder has no step.
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
    if (isFail(drawing)) {
      skip(drawing)
      continue
    }

    const rejected = drawing.columns !== columns ? fail('columns-mismatch') : validate(drawing)
    if (rejected) {
      skip(rejected)
      continue
    }

    return { step, drawing }
  }

  return cause ?? last
}
