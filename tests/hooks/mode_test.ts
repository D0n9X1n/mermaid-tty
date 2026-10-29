import test from 'node:test'
import assert from 'node:assert/strict'
import { passThrough } from '../../hooks/mode.ts'

test('A6.hook-tests: pass-through rules', () => {
  assert.equal(passThrough('desktop', {}, 'diagram'), true)
  assert.equal(passThrough('terminal', {}, 'source'), true)
  assert.equal(passThrough('terminal', { isExpanded: true }, 'diagram'), true)
  assert.equal(passThrough('terminal', {}, 'diagram'), false)
})
