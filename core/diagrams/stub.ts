// The module of a Tier 1 type whose own task has not landed (plan C §4, T40): its parse and its layout fail
// 'unimplemented:<type>' and its ladder has no step, so explain falls back to the fence's source. The type's task
// replaces the layout.ts that files this stub with its own module.
import type { Fail } from '../fail.ts'
import { fail } from '../fail.ts'
import type { DiagramModule, DiagramType } from '../registry.ts'

export function stub(type: DiagramType): DiagramModule {
  const unimplemented = (): Fail => fail(`unimplemented:${type}`)
  return { type, parse: unimplemented, steps: () => [], layout: unimplemented }
}
