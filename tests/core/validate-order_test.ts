import test from 'node:test'
import assert from 'node:assert/strict'
import { createCanvas, type Drawing } from '../../core/canvas.ts'
import { validate } from '../../core/validate.ts'
// Three marks: A at (0, 0), B at (1, 0), C at (2, 2), each a cap owned by its id.
function marks(
  order: { ids: string[]; column: boolean }[],
  at: Record<string, [number, number]> = { A: [0, 0], B: [1, 0], C: [2, 2] },
): Drawing {
  const c = createCanvas(3, 3, 80)
  for (const [id, [r, col]] of Object.entries(at)) {
    c.cap(r, col, '●', 'node', id)
  }

  return c.toDrawing({ labels: [], edges: [], edgeLabels: [], frames: [], order })
}

test('C: order passes owners drawn in strictly increasing rows, in one column when column is set', () => {
  assert.equal(
    validate(
      marks([
        { ids: ['A', 'B'], column: true },
        { ids: ['A', 'B', 'C'], column: false },
      ]),
    ),
    null,
  )
})
test('A5.mutation-tests: order fails a swap, a shared row, a column change, a missing owner, or an owner on two cells', () => {
  const o = [{ ids: ['A', 'B'], column: true }]
  assert.deepEqual(validate(marks(o, { A: [1, 0], B: [0, 0], C: [2, 2] })), { reason: 'order-broken' })
  assert.deepEqual(validate(marks([{ ids: ['A', 'C'], column: false }], { A: [1, 0], B: [0, 1], C: [1, 2] })), {
    reason: 'order-broken',
  })
  assert.deepEqual(validate(marks([{ ids: ['A', 'C'], column: true }])), { reason: 'order-broken' })
  assert.deepEqual(validate(marks([{ ids: ['A', 'Z'], column: false }])), { reason: 'order-broken' })
  const d = marks(o)
  d.cells[2]![0] = { ...d.cells[0]![0]! }
  assert.deepEqual(validate(d), { reason: 'order-broken' })
})
test('A5.mutation-tests: glyphs pins the one cell an owner draws to its glyph', () => {
  const d = marks([])
  d.expect = { ...d.expect, glyphs: [{ owner: 'A', ch: '●' }] }
  assert.equal(validate(d), null)
  const other = structuredClone(d)
  other.cells[0]![0] = { ...other.cells[0]![0]!, ch: '⊗' }
  assert.deepEqual(validate(other), { reason: 'glyph-wrong' })
  const two = structuredClone(d)
  two.cells[2]![0] = { ...two.cells[0]![0]! }
  assert.deepEqual(validate(two), { reason: 'glyph-wrong' })
  assert.deepEqual(validate({ ...d, expect: { ...d.expect, glyphs: [{ owner: 'Z', ch: '●' }] } }), {
    reason: 'glyph-wrong',
  })
})
