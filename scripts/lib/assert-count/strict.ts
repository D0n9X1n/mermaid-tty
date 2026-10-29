// node:assert/strict, each of whose functions counts for the test running when it is called (count.ts).
import { assertion } from './count.ts'

export * from 'node:assert/strict'
const strictAssertion = assertion.strict
export const { ok, fail, equal, notEqual, deepEqual, notDeepEqual, deepStrictEqual, notDeepStrictEqual, strictEqual, notStrictEqual,
  partialDeepStrictEqual, match, doesNotMatch, throws, rejects, doesNotThrow, doesNotReject, ifError, strict } = strictAssertion
export { strictAssertion as default, strictAssertion as 'module.exports' }
