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

test('a line whose first source slot reaches no target still draws: that slot cannot spend the search other slots need', () => {
  const src = [
    'flowchart LR',
    '  U[Client application user]',
    '  subgraph REQ["Regional request path - held for approval"]',
    '    S[Chat front end - held until approval]',
    '    E[Identity login.region.example]',
    '    W[Gateway service - shard alpha beta]',
    '    DS[Directory Service]',
    '    I[Index service region]',
    '    M[Mailbox service region]',
    '  end',
    '  subgraph TEL["Regional telemetry"]',
    '    G[Collector pipeline region one]',
    '    K[Query cluster - inferred]',
    '    A[Archive storage regionlogs]',
    '  end',
    '  subgraph PUB["Public cloud"]',
    '    C[Cosmos store prod collector log]',
    '    WD[Processor job process log - to confirm]',
    '  end',
    '  U --> S',
    '  S --> W',
    '  W -.-> E',
    '  W --> DS',
    '  W --> M',
    '  W --> I',
    '  W -.-> G',
    '  G -.-> K',
    '  G -.-> A',
    '  G -.-> C',
    '  W -.-> WD',
  ].join('\n')

  const drawn = [160, 200].map((columns) => {
    const r = explain(src, { columns })
    return isFail(r) ? `${columns}: ${r.reason}` : `${columns}: ok`
  })

  assert.deepEqual(drawn, ['160: ok', '200: ok'])
})
