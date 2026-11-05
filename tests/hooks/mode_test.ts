import test from 'node:test'
import assert from 'node:assert/strict'
import {
  directionNote,
  directionReply,
  directionSection,
  imagesReply,
  modeReply,
  parseModeArgs,
  passThrough,
  themeReply,
} from '../../hooks/mode.ts'

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
  const usage = {
    error:
      'usage: /mermaid-tty [source|diagram|text|images [auto|on|off]|theme [default|nord|dracula|gruvbox|solarized|mono]|direction [LR|TB|off]]',
  }
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
  const usage = {
    error:
      'usage: /mermaid-tty [source|diagram|text|images [auto|on|off]|theme [default|nord|dracula|gruvbox|solarized|mono]|direction [LR|TB|off]]',
  }
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
  assert.deepEqual(parseModeArgs('svg'), {
    error:
      'usage: /mermaid-tty [source|diagram|text|images [auto|on|off]|theme [default|nord|dracula|gruvbox|solarized|mono]|direction [LR|TB|off]]',
  })
})

// images takes one optional word after it: left out it reports, auto/on/off set it, matched in any case; anything else,
// or a third word, is the usage.
test('A6.command: images parses its setting; bare images reports; anything else is the usage', () => {
  const usage = {
    error:
      'usage: /mermaid-tty [source|diagram|text|images [auto|on|off]|theme [default|nord|dracula|gruvbox|solarized|mono]|direction [LR|TB|off]]',
  }
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

// theme takes one optional word after it: left out it reports, a theme name sets it, matched in any case; any other
// word, or a third one, is the usage.
test('A6.command: theme parses a theme name; bare theme reports; anything else is the usage', () => {
  const usage = {
    error:
      'usage: /mermaid-tty [source|diagram|text|images [auto|on|off]|theme [default|nord|dracula|gruvbox|solarized|mono]|direction [LR|TB|off]]',
  }
  assert.deepEqual(parseModeArgs('theme'), { theme: 'report' })
  assert.deepEqual(parseModeArgs(' THEME  Dracula '), { theme: 'dracula' })
  assert.deepEqual(parseModeArgs('theme mono'), { theme: 'mono' })
  assert.deepEqual(parseModeArgs('theme default'), { theme: 'default' })
  assert.deepEqual(parseModeArgs('theme neon'), usage)
  assert.deepEqual(parseModeArgs('theme nord mono'), usage)
  assert.deepEqual(parseModeArgs('theme toString'), usage)
  assert.deepEqual(parseModeArgs('nord'), usage)
})

test('A6.command: a theme reply names the theme, says whether it changed, and whether it was saved', () => {
  assert.equal(themeReply('nord', false, true), 'mermaid-tty theme: nord')
  assert.equal(themeReply('dracula', true, true), 'mermaid-tty: drawing in dracula')
  assert.equal(
    themeReply('dracula', true, false),
    'mermaid-tty: drawing in dracula (this session only: the setting was not saved)',
  )
  assert.equal(
    themeReply('dracula', false, false),
    'mermaid-tty theme: dracula (this session only: the setting was not saved)',
  )
})

// direction takes one optional word after it: left out it reports; LR, TB or off set it, matched in any case and
// written back in its own case; any other word, or a third one, is the usage.
test('A6.command: direction parses LR, TB or off; bare direction reports; anything else is the usage', () => {
  const usage = {
    error:
      'usage: /mermaid-tty [source|diagram|text|images [auto|on|off]|theme [default|nord|dracula|gruvbox|solarized|mono]|direction [LR|TB|off]]',
  }
  assert.deepEqual(parseModeArgs('direction'), { direction: 'report' })
  assert.deepEqual(parseModeArgs(' DIRECTION lr '), { direction: 'LR' })
  assert.deepEqual(parseModeArgs('direction TB'), { direction: 'TB' })
  assert.deepEqual(parseModeArgs('direction Off'), { direction: 'off' })
  assert.deepEqual(parseModeArgs('direction RL'), usage)
  assert.deepEqual(parseModeArgs('direction LR TB'), usage)
  assert.deepEqual(parseModeArgs('LR'), usage)
})

test('A6.command: a direction reply names the setting, says whether it changed, and whether it was saved', () => {
  assert.equal(directionReply('LR', false, true), 'mermaid-tty direction: LR')
  assert.equal(
    directionReply('TB', true, true, false),
    'mermaid-tty: asking Claude for top-to-bottom flowcharts ' +
      '(Claude was not told in this conversation; new conversations get it)',
  )
  assert.equal(
    directionReply('TB', false, false),
    'mermaid-tty direction: TB (this session only: the setting was not saved)',
  )
  assert.equal(directionReply('TB', true, true), 'mermaid-tty: asking Claude for top-to-bottom flowcharts')
  assert.equal(directionReply('LR', true, true), 'mermaid-tty: asking Claude for left-to-right flowcharts')
  assert.equal(directionReply('off', true, true), 'mermaid-tty: leaving flowchart direction to Claude')
  assert.equal(
    directionReply('off', true, false),
    'mermaid-tty: leaving flowchart direction to Claude (this session only: the setting was not saved)',
  )
})

// The section names the header Claude should write, and leaves a direction the person chose alone; off has none.
test('A6.direction: the system-prompt section asks for the configured header, and off asks for nothing', () => {
  assert.match(directionSection('LR') ?? '', /`flowchart LR`/)
  assert.match(directionSection('TB') ?? '', /`flowchart TB`/)
  assert.match(directionSection('LR') ?? '', /asks for another direction/)
  assert.equal(directionSection('off'), null)
  assert.match(directionNote('TB'), /`flowchart TB`/)
  assert.match(directionNote('off'), /no longer/)
})
