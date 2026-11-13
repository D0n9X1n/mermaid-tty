import test from 'node:test'
import assert from 'node:assert/strict'
import { forkPrompt, isBtw, SIDE_QUESTION, takesBtw } from '../../hooks/btw.ts'

test('A6.command: mermaid-tty takes /btw only in a terminal, outside source mode, for a question', () => {
  assert.equal(takesBtw('why?', true, 'diagram'), true)
  assert.equal(takesBtw('why?', true, 'text'), true)
  assert.equal(takesBtw('why?', true, 'source'), false)
  assert.equal(takesBtw('why?', false, 'diagram'), false)
  assert.equal(takesBtw('', true, 'diagram'), false)
  assert.equal(takesBtw(' \t ', true, 'diagram'), false)
  assert.equal(takesBtw(undefined, true, 'diagram'), false)
  assert.equal(takesBtw(['why?'], true, 'diagram'), false)
})

test('A6.command: the fork is told it answers a side question, with no tools, before the question itself', () => {
  const prompt = forkPrompt('what is X?')

  assert.ok(prompt.startsWith(SIDE_QUESTION))
  assert.ok(prompt.endsWith('what is X?'))
  assert.match(SIDE_QUESTION, /side question/)
  assert.match(SIDE_QUESTION, /no tools/)
})

test('A6.command: a stored answer is read back only whole', () => {
  assert.equal(isBtw({ question: 'q', text: 't' }), true)
  assert.equal(isBtw({ question: 'q' }), false)
  assert.equal(isBtw({ question: 1, text: 't' }), false)
  assert.equal(isBtw(null), false)
  assert.equal(isBtw('q'), false)
})
