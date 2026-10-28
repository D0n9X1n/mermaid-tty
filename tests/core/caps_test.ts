import test from 'node:test'
import assert from 'node:assert/strict'
import { CAPS, shapeFromName } from '../../core/caps.ts'

test('A3: every shape has its own cap pair', () => {
  const seen = new Map<string, string>()
  for (const [s, [l, r]] of Object.entries(CAPS)) { const k = `${l}\u0000${r}`; assert.ok(!seen.has(k), `${s} = ${seen.get(k)}`); seen.set(k, s) }
})

test('A1: @{shape} names resolve; unknown → rect', () => {
  assert.equal(shapeFromName('cyl'), 'cylinder'); assert.equal(shapeFromName('diam'), 'diamond'); assert.equal(shapeFromName('h-cyl'), 'hcyl')
  assert.equal(shapeFromName('no-such-shape'), 'rect'); assert.deepEqual(CAPS.stadium, ['([', '])']); assert.deepEqual(CAPS.arrowR, ['', '►'])
})

test('A1: @{shape} names are trimmed before lookup', () => {
  assert.equal(shapeFromName(' cyl\t'), 'cylinder')
})

test('A1: names inherited from Object.prototype are unknown → rect', () => {
  const leaked = ['constructor', 'toString', 'hasOwnProperty', '__proto__'].filter(n => shapeFromName(n) !== 'rect')
  assert.deepEqual(leaked, [])
})

// Transcribed from docs/decisions/task0-spikes.md S4: every flowchart.md name
// whose shape has a row in the matrix's End caps table.
test('A1: every flowchart.md @{shape} name for a capped shape resolves to that shape', () => {
  const names: Record<string, readonly string[]> = {
    rect: ['rect', 'rectangle', 'proc', 'process'],
    round: ['rounded', 'event'],
    stadium: ['stadium', 'pill', 'terminal'],
    subroutine: ['fr-rect', 'framed-rectangle', 'subproc', 'subprocess', 'subroutine'],
    cylinder: ['cyl', 'cylinder', 'database', 'db'],
    hcyl: ['h-cyl', 'das', 'horizontal-cylinder'],
    circle: ['circle', 'circ'],
    dcircle: ['dbl-circ', 'double-circle'],
    diamond: ['diam', 'diamond', 'decision', 'question'],
    hexagon: ['hex', 'hexagon', 'prepare'],
    leanR: ['lean-r', 'lean-right', 'in-out'],
    leanL: ['lean-l', 'lean-left', 'out-in'],
    trap: ['trap-b', 'trapezoid', 'trapezoid-bottom', 'priority'],
    trapInv: ['trap-t', 'inv-trapezoid', 'trapezoid-top', 'manual'],
    asym: ['odd'],
    bang: ['bang'],
    cloud: ['cloud'],
  }
  const wrong = Object.entries(names).flatMap(([shape, ns]) =>
    ns.filter(n => shapeFromName(n) !== shape).map(n => `${n} → ${shapeFromName(n)}, want ${shape}`))
  assert.deepEqual(wrong, [])
})
