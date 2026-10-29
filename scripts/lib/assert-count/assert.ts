// node:assert, each of whose functions counts for the test running when it is called (count.ts).
import { assertion } from './count.ts'

export * from 'node:assert'
export const { ok, fail, equal, notEqual, deepEqual, notDeepEqual, deepStrictEqual, notDeepStrictEqual, strictEqual, notStrictEqual,
  partialDeepStrictEqual, match, doesNotMatch, throws, rejects, doesNotThrow, doesNotReject, ifError, strict } = assertion
export { assertion as default, assertion as 'module.exports' }
