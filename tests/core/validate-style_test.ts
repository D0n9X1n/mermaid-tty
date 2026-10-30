import test from 'node:test'; import assert from 'node:assert/strict'
import type { Drawing } from '../../core/canvas.ts'; import { validate } from '../../core/validate.ts'; import { explain } from '../../core/render.ts'

const drawing = (src: string): Drawing => {
  const r = explain(src, { columns: 80, theme: 'mono' })
  assert.ok('drawing' in r, src)
  return (r as { drawing: Drawing }).drawing
}
// The drawing of src with the line cell at (r, c), which must show was, redrawn as ch: its arms, style and owners kept.
const restyled = (src: string, r: number, c: number, was: string, ch: string): Drawing => {
  const d = structuredClone(drawing(src)), x = d.cells[r]![c]!
  assert.equal(x.kind, 'line'); assert.equal(x.ch, was)
  d.cells[r]![c] = { ...x, ch }
  return d
}

// QA: a glyph that shows another line style than its cell records says the wrong thing (a dependency for a realization, a
// non-identifying relation for an identifying one, a reply for a call), so it fails line-glyph like a wrong arm does.
test('line-glyph: a line cell drawn in another style than it records fails', () => {
  for (const [src, r, c, was, ch] of [
    ['classDiagram\nA ..> B', 1, 2, '┆', '│'],
    ['erDiagram\nA }o..o{ B : x', 1, 2, '┆', '│'],
    ['sequenceDiagram\nA-->>B: hi', 2, 3, '┄', '─'],
    ['flowchart TB\nA ==> B', 1, 2, '┃', '│'],
    ['flowchart TB\nA --> B', 1, 2, '│', '┆'],
    ['flowchart TB\nA --> B', 1, 2, '│', '║'],
  ] as const) {
    assert.equal(validate(drawing(src)), null, src)
    assert.equal(validate(restyled(src, r, c, was, ch))?.reason, 'line-glyph', `${src}: ${was} as ${ch}`)
  }
})
