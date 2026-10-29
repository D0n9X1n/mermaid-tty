import test from 'node:test'
import assert from 'node:assert/strict'
import { modeReply, parseModeArgs, passThrough } from '../../hooks/mode.ts'

test('A6.hook-tests: pass-through rules', () => {
  assert.equal(passThrough('desktop', {}, 'diagram'), true)
  assert.equal(passThrough('terminal', {}, 'source'), true)
  assert.equal(passThrough('terminal', { isExpanded: true }, 'diagram'), true)
  assert.equal(passThrough('terminal', {}, 'diagram'), false)
})

test('A6.command: arguments and replies', () => {
  assert.deepEqual(parseModeArgs(' source '), { set: 'source' }); assert.deepEqual(parseModeArgs(''), { report: true }); assert.ok('error' in parseModeArgs('svg'))
  assert.equal(modeReply('source', true), 'mermaid-tty: showing diagrams as source'); assert.equal(modeReply('diagram', false), 'mermaid-tty mode: diagram')
})

// One word, trimmed and matched in any case; a second word is a usage error, not ignored.
test('A6.command: arguments are trimmed and case-blind; a second word is an error', () => {
  const usage = { error: 'usage: /mermaid-tty [source|diagram]' }
  assert.deepEqual(parseModeArgs('diagram'), { set: 'diagram' })
  assert.deepEqual(parseModeArgs('  '), { report: true })
  assert.deepEqual(parseModeArgs('SOURCE'), { set: 'source' })
  assert.deepEqual(parseModeArgs('Diagram\n'), { set: 'diagram' })
  assert.deepEqual(parseModeArgs('source extra'), usage)
  assert.deepEqual(parseModeArgs('svg'), usage)
})

test('A6.command: a reply for each mode, changed or not', () => {
  assert.equal(modeReply('source', true), 'mermaid-tty: showing diagrams as source')
  assert.equal(modeReply('diagram', true), 'mermaid-tty: drawing diagrams')
  assert.equal(modeReply('source', false), 'mermaid-tty mode: source')
  assert.equal(modeReply('diagram', false), 'mermaid-tty mode: diagram')
})
