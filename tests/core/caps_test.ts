import test from 'node:test'
import assert from 'node:assert/strict'
import { ALIASES, CAPS, shapeFromName } from '../../core/caps.ts'

test('A3: every shape has its own cap pair', () => {
  const seen = new Map<string, string>()
  for (const [s, [l, r]] of Object.entries(CAPS)) {
    const k = `${l}\u0000${r}`
    assert.ok(!seen.has(k), `${s} = ${seen.get(k)}`)
    seen.set(k, s)
  }
})

// Each shape's end caps, as drawn in place of Mermaid's outline; the block arrow gives four shapes. Keys are
// core/caps.ts's Shape names, and '' is no cap.
test("A3: CAPS is exactly the 22 shapes' end caps", () => {
  const matrix = {
    rect: ['[', ']'],
    round: ['(', ')'],
    stadium: ['([', '])'],
    subroutine: ['[[', ']]'],
    cylinder: ['[(', ')]'],
    hcyl: ['(|', '|)'],
    circle: ['((', '))'],
    dcircle: ['(((', ')))'],
    diamond: ['{', '}'],
    hexagon: ['{{', '}}'],
    leanR: ['/', '/'],
    leanL: ['\\', '\\'],
    trap: ['/', '\\'],
    trapInv: ['\\', '/'],
    asym: ['>', ']'],
    bang: ['))', '(('],
    cloud: [')', '('],
    arrowR: ['', '►'],
    arrowL: ['◄', ''],
    arrowU: ['▲', ''],
    arrowD: ['', '▼'],
    plain: ['', ''],
  }
  assert.deepEqual(CAPS, matrix)
})

test('A1: @{shape} names resolve; unknown → rect', () => {
  assert.equal(shapeFromName('cyl'), 'cylinder')
  assert.equal(shapeFromName('diam'), 'diamond')
  assert.equal(shapeFromName('h-cyl'), 'hcyl')
  assert.equal(shapeFromName('no-such-shape'), 'rect')
})

test('A1: @{shape} names are trimmed before lookup', () => {
  assert.equal(shapeFromName(' cyl\t'), 'cylinder')
})

test('A1: names inherited from Object.prototype are unknown → rect', () => {
  const leaked = ['constructor', 'toString', 'hasOwnProperty', '__proto__'].filter((n) => shapeFromName(n) !== 'rect')
  assert.deepEqual(leaked, [])
})

// Every flowchart.md @{shape} name whose shape has end caps, with that shape. There are 49.
test('A1: ALIASES is exactly the 49 @{shape} aliases; shapeFromName agrees', () => {
  const aliases: Record<string, string> = {
    rect: 'rect',
    rectangle: 'rect',
    proc: 'rect',
    process: 'rect',
    rounded: 'round',
    event: 'round',
    stadium: 'stadium',
    pill: 'stadium',
    terminal: 'stadium',
    'fr-rect': 'subroutine',
    'framed-rectangle': 'subroutine',
    subproc: 'subroutine',
    subprocess: 'subroutine',
    subroutine: 'subroutine',
    cyl: 'cylinder',
    cylinder: 'cylinder',
    database: 'cylinder',
    db: 'cylinder',
    'h-cyl': 'hcyl',
    das: 'hcyl',
    'horizontal-cylinder': 'hcyl',
    circle: 'circle',
    circ: 'circle',
    'dbl-circ': 'dcircle',
    'double-circle': 'dcircle',
    diam: 'diamond',
    diamond: 'diamond',
    decision: 'diamond',
    question: 'diamond',
    hex: 'hexagon',
    hexagon: 'hexagon',
    prepare: 'hexagon',
    'lean-r': 'leanR',
    'lean-right': 'leanR',
    'in-out': 'leanR',
    'lean-l': 'leanL',
    'lean-left': 'leanL',
    'out-in': 'leanL',
    'trap-b': 'trap',
    trapezoid: 'trap',
    'trapezoid-bottom': 'trap',
    priority: 'trap',
    'trap-t': 'trapInv',
    'inv-trapezoid': 'trapInv',
    'trapezoid-top': 'trapInv',
    manual: 'trapInv',
    odd: 'asym',
    bang: 'bang',
    cloud: 'cloud',
  }
  assert.deepEqual(ALIASES, new Map(Object.entries(aliases)))
  assert.equal(ALIASES.size, 49)
  assert.deepEqual(Object.fromEntries(Object.keys(aliases).map((n) => [n, shapeFromName(n)])), aliases)
})
