import test from 'node:test'
import assert from 'node:assert/strict'
import { isFail } from '../../core/fail.ts'
import { explain } from '../../core/render.ts'

// Diagrams in the shapes assistants write that drew wrong and fell back. Each must draw, and pass the validator, at
// every common terminal width.
const WIDTHS = [60, 80, 120, 160]

const draws = (src: string) =>
  WIDTHS.map((columns) => {
    const r = explain(src, { columns })
    return isFail(r) ? `${columns}: ${r.reason}` : `${columns}: ok`
  })

test('an ER entity with two relations draws: each cardinality keeps a free cell beside its own line', () => {
  for (const src of [
    'erDiagram\nCUSTOMER ||--o{ ORDER : places\nCUSTOMER ||--o{ ADDRESS : has',
    'erDiagram\nORDER }o--|| CUSTOMER : "placed by"\nINVOICE }o--|| CUSTOMER : "billed to"',
  ]) {
    assert.deepEqual(
      draws(src),
      WIDTHS.map((w) => `${w}: ok`),
      src,
    )
  }
})

test('a state note beside the state a back edge leaves draws: the route keeps off the note and its link', () => {
  for (const side of ['right', 'left']) {
    const src = `stateDiagram-v2\n[*] --> Ready\nReady --> Busy: start\nBusy --> Ready: retry\nnote ${side} of Busy: Backoff`
    assert.deepEqual(
      draws(src),
      WIDTHS.map((w) => `${w}: ok`),
      side,
    )
  }
})

test('a class diagram with 40 labelled relations still draws: end-label placement scales with the route cells', () => {
  const relations = Array.from(
    { length: 39 },
    (_, i) => `N${i} "${i === 0 ? 'a'.repeat(60) : '1'}" -- "0..*" N${i + 1}`,
  )
  const src = ['classDiagram', 'direction LR', ...relations].join('\n')
  const r = explain(src, { columns: 160 })
  assert.ok(!isFail(r), JSON.stringify(r))
})
