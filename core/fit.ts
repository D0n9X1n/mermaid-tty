// The fit ladder runner (plan A §6, A4.fit-ladder): a type's layout steps, tried in its order until one draws a drawing
// the validator accepts.
import type { Drawing } from './canvas.ts'
import type { Fail } from './fail.ts'
import { fail, isFail } from './fail.ts'
import type { DiagramModule } from './registry.ts'
import { validate } from './validate.ts'

export type Step = 'natural' | 'tight' | 'wrap' | 'lrToTd'          // C widens this union with its own steps

// The first step whose drawing validate accepts, with that drawing. A step is skipped when its layout fails, when its
// drawing declares other columns than it was given (validate measures rows against the drawing's own columns, so a wider
// claim would pass it), or when validate rejects its drawing. If every step is skipped, the last one's reason; 'too-wide'
// when the ladder has no step.
export function fitLadder<M>(mod: DiagramModule<M>, model: M, columns: number): { step: Step; drawing: Drawing } | Fail {
  let last = fail('too-wide')
  for (const step of mod.steps(model)) {
    const drawing = mod.layout(model, step, columns)
    if (isFail(drawing)) { last = drawing; continue }
    const rejected = drawing.columns !== columns ? fail('columns-mismatch') : validate(drawing)
    if (rejected) { last = rejected; continue }
    return { step, drawing }
  }
  return last
}
