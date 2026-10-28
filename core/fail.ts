// The one fallback result: a step that cannot draw returns a Fail, and the
// hook falls back to the fence's source.
export type Fail = { reason: string }

export const fail = (reason: string): Fail => ({ reason })

export const isFail = (x: unknown): x is Fail => typeof x === 'object' && x !== null && 'reason' in x
