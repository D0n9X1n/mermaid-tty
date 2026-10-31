// Counts the assertions each test executes. A test's function runs in a store { count, parent }: an assertion adds one to
// the store of the test running it and to each ancestor's, so a parent whose children assert passes, and a test whose
// function settles, returning, resolving or calling done, with a count of 0 fails with Error('no assertion executed').
import realAssert from 'node:assert'
import { AsyncLocalStorage } from 'node:async_hooks'

type Store = { count: number; parent?: Store }
type Context = { test: Function; assert: object }
const als = new AsyncLocalStorage<Store>()
// The store of the test whose function is running, if any. Accepted, fail-closed: an EventEmitterAsyncResource runs its
// listeners in the async context it was made in, so a node:assert call in a listener of one made outside the test counts
// for no test, and the test must also assert in its own flow. Likewise, a plain EventEmitter runs its listeners in the
// emitter's caller's context, so under { concurrency } a listener's node:assert counts for the test that emitted. Both
// can only fail a test that asserts, never pass one that does not. t.assert counts for its own test wherever it is called.
export const running = () => als.getStore()

// Adds one to store and to each of its ancestors'.
function bump(store?: Store): void {
  for (let s = store; s; s = s.parent) {
    s.count++
  }
}
// Whether the property key, of descriptor d, is an assertion: a function under a lowercase name.
const isAssertion = (key: string | symbol, d: PropertyDescriptor) =>
  typeof d.value === 'function' && typeof key === 'string' && /^[a-z]/.test(key)
// A copy of value, an assertion function or object, whose assertions, at any depth, bump storeOf() when called, and whose
// Assert is countingAssert's. seen keeps what value shares shared: the copy of assert.strict.strict is the copy of
// assert.strict, and assert.strict.Assert is assert.Assert.
function counting<T extends object>(value: T, storeOf: () => Store | undefined, seen = new Map<object, object>()): T {
  const known = seen.get(value)
  if (known) {
    return known as T
  }
  const copy =
    typeof value === 'function'
      ? function (this: unknown, ...args: unknown[]) {
          bump(storeOf())
          return Reflect.apply(value, this, args)
        }
      : Object.create(Object.getPrototypeOf(value))
  seen.set(value, copy)
  for (const key of Reflect.ownKeys(value)) {
    if (key === 'prototype') {
      continue
    }
    const d = Object.getOwnPropertyDescriptor(value, key)!
    if (isAssertion(key, d)) {
      d.value = counting(d.value, storeOf, seen)
    } else if (key === 'Assert' && typeof d.value === 'function') {
      d.value = countingAssert(d.value, storeOf, seen)
    }
    Object.defineProperty(copy, key, d)
  }
  return copy
}
// A subclass of node:assert's Assert (Node 24.6+), its options passed on, whose prototype's assertions bump storeOf() when
// called. An instance's own assertions count too, once: a strict one's equal, deepEqual, notEqual and notDeepEqual are
// what Assert's constructor read from this, the copies of strictEqual and the rest.
function countingAssert(
  Base: new (...args: any[]) => object,
  storeOf: () => Store | undefined,
  seen: Map<object, object>,
): Function {
  const known = seen.get(Base)
  if (known) {
    return known as Function
  }
  const Counted = class Assert extends Base {}
  seen.set(Base, Counted)
  for (const key of Reflect.ownKeys(Base.prototype)) {
    const d = Object.getOwnPropertyDescriptor(Base.prototype, key)!
    if (key === 'constructor' || !isAssertion(key, d)) {
      continue
    }
    d.value = counting(d.value, storeOf, seen)
    Object.defineProperty(Counted.prototype, key, d)
  }
  return Counted
}
// node:assert, each of whose assertions, and each of its Assert's instances', counts for the test running when called.
export const assertion = counting(realAssert, running)

// fn as a test's function, run in a store under parent: the test fails if fn settles with no assertion executed. this, the
// context and done are node:test's; the copy's length is fn's, which tells node:test whether fn takes done.
function counted(fn: Function, parent: Store | undefined): Function {
  const run = function (this: unknown, t: Context, ...rest: unknown[]) {
    const store: Store = { count: 0, parent }
    adopt(t, store)
    // The error of a test whose function executed no assertion, or undefined.
    const none = () => (store.count === 0 ? new Error('no assertion executed') : undefined)
    return als.run(store, () => {
      const done = rest[0]
      if (typeof done === 'function') {
        return Reflect.apply(fn, this, [t, (err: unknown) => done(err || none())])
      }
      const settle = (value: unknown) => {
        const e = none()
        if (e) {
          throw e
        }
        return value
      }
      const result = Reflect.apply(fn, this, [t, ...rest])
      // node:test awaits any thenable fn returns, which instanceof Promise misses unless it is this realm's promise.
      return typeof result?.then === 'function' ? Promise.resolve(result).then(settle) : settle(result)
    })
  }
  return Object.defineProperties(run, { length: { value: fn.length }, name: { value: fn.name } })
}
// Makes t.test register each subtest under store, and t.assert count for store. node's t.assert counts toward a t.plan
// only if set before its first read, so node's is read, and copied, at the test's own first read of t.assert, not here.
function adopt(t: Context, store: Store): void {
  const context = Object.getPrototypeOf(t)
  let assert: object | undefined
  Object.defineProperties(t, {
    test: { value: registrar(t.test.bind(t), () => store), configurable: true, writable: true },
    assert: { get: () => (assert ??= counting(Reflect.get(context, 'assert', t), () => store)), configurable: true },
  })
}
// register, node:test's test or a context's t.test, made to run each test's function counted under parentOf() at the call.
// It finds the function as node:test does in test([name][, options][, fn]), and gives a test with none a function that
// executes no assertion. Its only, skip, todo and expectFailure, where it has them, register the same way.
export function registrar(register: Function, parentOf: () => Store | undefined): Function {
  const wrapped = (...args: unknown[]) => {
    const at =
      typeof args[0] === 'function'
        ? 0
        : (typeof args[0] === 'object' && args[0] !== null) || typeof args[1] === 'function'
          ? 1
          : 2
    const fn = args[at]
    args[at] = counted(typeof fn === 'function' ? fn : () => {}, parentOf())
    return Reflect.apply(register, undefined, args)
  }
  for (const key of ['only', 'skip', 'todo', 'expectFailure']) {
    if (typeof (register as any)[key] === 'function') {
      ;(wrapped as any)[key] = registrar((register as any)[key], parentOf)
    }
  }
  return wrapped
}
