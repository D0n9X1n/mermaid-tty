import test from 'node:test'
import assert from 'node:assert/strict'
import { createLru } from '../../core/lru.ts'
test('A8.cache: hit, miss, and LRU eviction on the 65th entry', () => {
  const c = createLru<string, number>(64)
  c.set('a', 1)
  assert.equal(c.get('a'), 1)
  assert.equal(c.get('b'), undefined)
  for (let i = 0; i < 63; i++) {
    c.set(`k${i}`, i)
  }
  c.get('a')
  c.set('k63', 63)
  assert.equal(c.size, 64)
  assert.equal(c.get('a'), 1)
  assert.equal(c.get('k0'), undefined)
})
test('A8.cache: set on a cached key updates it and marks it most recent', () => {
  const c = createLru<string, number>(2)
  c.set('a', 1)
  c.set('b', 2)
  c.set('a', 3)
  c.set('c', 4)
  assert.equal(c.size, 2)
  assert.equal(c.get('a'), 3)
  assert.equal(c.get('b'), undefined)
})
test('A8.cache: size counts entries; a miss or an update adds none; a new key past capacity evicts only the least recent', () => {
  const c = createLru<string, number>(3)
  assert.equal(c.size, 0)
  c.set('a', 1)
  c.set('b', 2)
  assert.equal(c.size, 2)
  assert.equal(c.get('z'), undefined)
  assert.equal(c.size, 2)
  c.set('c', 3)
  c.set('c', 30)
  assert.equal(c.size, 3)
  assert.deepEqual(
    ['a', 'b', 'c'].map((k) => c.get(k)),
    [1, 2, 30],
  )
  c.set('d', 4)
  assert.equal(c.size, 3)
  assert.deepEqual(
    ['a', 'b', 'c', 'd'].map((k) => c.get(k)),
    [undefined, 2, 30, 4],
  )
})
test('A8.cache: a key stored as undefined is still a hit, so get refreshes it', () => {
  const c = createLru<string, number | undefined>(2)
  c.set('u', undefined)
  c.set('x', 1)
  assert.equal(c.get('u'), undefined)
  c.set('y', 2)
  assert.equal(c.size, 2)
  assert.equal(c.get('x'), undefined)
  assert.equal(c.get('y'), 2)
})
