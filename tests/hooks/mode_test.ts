import test from 'node:test'
import assert from 'node:assert/strict'
import { imagesReply, modeReply, parseModeArgs, passThrough } from '../../hooks/mode.ts'

test('A6.hook-tests: pass-through rules', () => {
  assert.equal(passThrough('desktop', {}, 'diagram'), true)
  assert.equal(passThrough('terminal', {}, 'source'), true)
  assert.equal(passThrough('terminal', { isExpanded: true }, 'diagram'), true)
  assert.equal(passThrough('terminal', {}, 'diagram'), false)
})

test('A6.command: arguments and replies', () => {
  assert.deepEqual(parseModeArgs(' source '), { set: 'source' })
  assert.deepEqual(parseModeArgs(''), { report: true })
  assert.ok('error' in parseModeArgs('svg'))
  assert.equal(modeReply('source', true), 'mermaid-tty: showing diagrams as source')
  assert.equal(modeReply('diagram', false), 'mermaid-tty mode: diagram')
})

// One word, trimmed and matched in any case; a second word is a usage error, not ignored.
test('A6.command: arguments are trimmed and case-blind; a second word is an error', () => {
  const usage = { error: 'usage: /mermaid-tty [source|diagram|text|images [auto|on|off]]' }
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

// $.command.run passes args through as given. Only a string is parsed, and left out (undefined) it reports; anything
// else is a usage error, never coerced: String(['source']) is 'source'.
test('A6.command: an argument that is not a string is a usage error, never coerced', () => {
  const usage = { error: 'usage: /mermaid-tty [source|diagram|text|images [auto|on|off]]' }
  assert.deepEqual(parseModeArgs(undefined), { report: true })
  for (const a of [['source'], { toString: null }, 42, null]) {
    assert.deepEqual(parseModeArgs(a), usage)
  }
})

// text: diagrams drawn as text even where the terminal shows pictures; only source passes replies through.
test('A6.command: text mode parses, replies, and still draws', () => {
  assert.deepEqual(parseModeArgs(' Text '), { set: 'text' })
  assert.equal(passThrough('terminal', {}, 'text'), false)
  assert.equal(modeReply('text', true), 'mermaid-tty: drawing diagrams as text')
  assert.equal(modeReply('text', false), 'mermaid-tty mode: text')
  assert.deepEqual(parseModeArgs('svg'), { error: 'usage: /mermaid-tty [source|diagram|text|images [auto|on|off]]' })
})

// images takes one optional word after it: left out it reports, auto/on/off set it, matched in any case; anything else,
// or a third word, is the usage.
test('A6.command: images parses its setting; bare images reports; anything else is the usage', () => {
  const usage = { error: 'usage: /mermaid-tty [source|diagram|text|images [auto|on|off]]' }
  assert.deepEqual(parseModeArgs('images'), { images: 'report' })
  assert.deepEqual(parseModeArgs(' IMAGES  Off '), { images: 'off' })
  assert.deepEqual(parseModeArgs('images on'), { images: 'on' })
  assert.deepEqual(parseModeArgs('images\tauto\n'), { images: 'auto' })
  assert.deepEqual(parseModeArgs('images maybe'), usage)
  assert.deepEqual(parseModeArgs('images on off'), usage)
  assert.deepEqual(parseModeArgs('source on'), usage)
})

test('A6.command: a reply for each images setting, changed or not', () => {
  assert.equal(imagesReply('auto', true), 'mermaid-tty: pictures where the terminal is detected to show them')
  assert.equal(imagesReply('on', true), 'mermaid-tty: pictures on, without terminal detection')
  assert.equal(imagesReply('off', true), 'mermaid-tty: pictures off')
  assert.equal(imagesReply('off', false), 'mermaid-tty images: off')
})
