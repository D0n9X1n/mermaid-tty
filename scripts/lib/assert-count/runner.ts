// node:test, whose test and it, with their only, skip, todo and expectFailure, run each test's function counted (count.ts):
// a test whose function settles having executed no assertion fails.
import real from 'node:test'
import { registrar, running } from './count.ts'

export * from 'node:test'
const test = registrar(real, running) as typeof real
// test's other properties are node:test's own: describe, suite, before, mock and the rest. test.test and test.it are test.
for (const key of Reflect.ownKeys(real)) {
  if (!Object.hasOwn(test, key)) {
    Object.defineProperty(test, key, Object.getOwnPropertyDescriptor(real, key)!)
  }
}
Object.assign(test, { test, it: test })
export const { only, skip, todo, expectFailure } = test
export { test, test as it, test as default, test as 'module.exports' }
