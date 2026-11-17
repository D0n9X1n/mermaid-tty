import test from 'node:test'
import assert from 'node:assert/strict'
import { createCanvas, type Drawing } from '../../core/canvas.ts'
import { fail, type Fail } from '../../core/fail.ts'
import { fitLadder, type Step } from '../../core/fit.ts'
import { lookup, type DiagramModule } from '../../core/registry.ts'
import { explain } from '../../core/render.ts'
import { text } from './graph-fixture.ts'

// A fake type whose model lists what each step draws, normally and with the rescue: a one-row label n cells wide, or a
// Fail. calls logs every layout and rescue, in order.
type Plan = { normal: readonly (readonly [Step, number | Fail])[]; rescue: readonly (readonly [Step, number | Fail])[] }
function draw(what: number | Fail, columns: number): Drawing | Fail {
  if (typeof what === 'object') {
    return what
  }

  const t = 'x'.repeat(what)
  const c = createCanvas(1, 12, columns)
  c.text(0, 0, t, 'node', 'A')
  return c.toDrawing({ labels: [{ owner: 'A', text: t }], edges: [], edgeLabels: [], frames: [] })
}

function fit(plan: Plan, columns: number, calls: string[]) {
  const mod: DiagramModule<Plan> = {
    type: 'flowchart',
    parse: () => fail('unused'),
    steps: (m) => m.normal.map(([step]) => step),
    layout: (m, step, cols) => {
      calls.push(`layout ${step}`)
      return draw(m.normal.find(([s]) => s === step)![1], cols)
    },
    rescue: (m, step, cols) => {
      calls.push(`rescue ${step}`)
      return draw(m.rescue.find(([s]) => s === step)![1], cols)
    },
  }
  return fitLadder(mod, plan, columns)
}

test('a step that fits normally is taken, even the last, and the rescue never runs', () => {
  const calls: string[] = []

  const r = fit(
    {
      normal: [
        ['natural', 11],
        ['tight', 11],
        ['wrap', 9],
      ],
      rescue: [
        ['natural', 5],
        ['tight', 5],
        ['wrap', 5],
      ],
    },
    10,
    calls,
  )

  assert.deepEqual(r, { step: 'wrap', drawing: draw(9, 10) })
  assert.deepEqual(calls, ['layout natural', 'layout tight', 'layout wrap'])
})

test('the rescue runs only after every step failed normally, in ladder order, and its drawing is checked the same', () => {
  const calls: string[] = []

  const r = fit(
    {
      normal: [
        ['natural', fail('route-conflict')],
        ['tight', 11],
        ['wrap', fail('route-conflict')],
      ],
      rescue: [
        ['natural', 11],
        ['tight', 7],
        ['wrap', 5],
      ],
    },
    10,
    calls,
  )

  assert.deepEqual(r, { step: 'tight', drawing: draw(7, 10) })
  assert.deepEqual(calls, ['layout natural', 'layout tight', 'layout wrap', 'rescue natural', 'rescue tight'])
})

test('when the rescue draws nothing either, the reason is the one the normal ladder gave', () => {
  const r = fit(
    {
      normal: [
        ['natural', fail('route-conflict')],
        ['tight', 11],
      ],
      rescue: [
        ['natural', fail('no-route')],
        ['tight', 12],
      ],
    },
    10,
    [],
  )

  assert.deepEqual(r, { reason: 'route-conflict' })
})

test('only the graph types have a rescue', () => {
  const headers = [
    'flowchart',
    'stateDiagram-v2',
    'classDiagram',
    'erDiagram',
    'sequenceDiagram',
    'gantt',
    'pie',
    'journey',
    'mindmap',
    'timeline',
    'gitGraph',
    'quadrantChart',
    'xychart-beta',
  ]

  const rescued = headers.filter((h) => {
    const mod = lookup(h)
    return 'rescue' in mod && mod.rescue !== undefined
  })

  assert.deepEqual(rescued, ['flowchart', 'stateDiagram-v2', 'classDiagram', 'erDiagram'])
})

// This chart fits at wrap with wrapAt 16 and no rescue. The rescue routes it at a wider wrapAt, which must not win: a
// drawing the normal ladder finds stays exactly as it was.
const FITS_NORMALLY = [
  'flowchart LR',
  '  U[Client application user]',
  '  subgraph REQ["Regional request path - held for approval"]',
  '    S[Chat front end - held until approval]',
  '    E[Identity login.regio]',
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

test('a chart the normal ladder draws keeps that exact drawing at 160 columns', () => {
  const r = explain(FITS_NORMALLY, { columns: 160 })

  assert.ok('drawing' in r, JSON.stringify(r))
  assert.equal(r.step, 'wrap')
  assert.deepEqual(text(r.drawing), [
    '                    ┌─Regional request path - held for approval──────────────────────────────┐',
    '                    │                                                                        │',
    '[      Client      ]──┐                                                 ┌┄►[  Identity   ]   │',
    '[ application user ]│ │                                                 ┆  [ login.regio ]   │',
    '                    │ │  [ Chat front end - ]                           ┆                    │',
    '                    │ └─►[    held until    ]─┐                        ┌┼──►[ Directory ]    │',
    '                    │    [     approval     ] │                        │┆   [  Service  ]    │',
    '                    │                         │  [ Gateway service ]   │┆                    │',
    '                    │                         └─►[  - shard alpha  ]┄┬┄┼┘ [ Index service ]  │',
    '                    │                            [      beta       ]─┼┬┴─►[    region     ]  │',
    '                    │                                     ┆          ┆│                      │',
    '                    │                                     ┆          ┆└─►[ Mailbox service ] │',
    '                    │                                     ┆          ┆   [     region      ] │',
    '                    │                                     ┆          ┆                       │',
    '                    └─────────────────────────────────────┆──────────┆───────────────────────┘',
    '                                                          ┆          ┆',
    '                                                          ┆         ┌┆Regional telemetry─────────────────────────────┐',
    '                                                          ┆         │┆                                               │',
    '                                                          ┆         │┆                         ┌┄►[ Query cluster - ]│',
    '                                                          ┆         │┆   [    Collector    ]   ┆  [    inferred     ]│',
    '                                                          ┆         │└┄┄►[ pipeline region ]┄┄┄┤                     │',
    '                                                          ┆         │    [       one       ]   ├┄►[ Archive storage ]│',
    '                                                          ┆         │                          ┆  [   regionlogs    ]│',
    '                                                          ┆         │                          ┆                     │',
    '                                                          ┆         └──────────────────────────┆─────────────────────┘',
    '                                                          ┆                                    ┆',
    '                                                          ┆         ┌─Public cloud─────────────┆─────────────────────┐',
    '                                                          ┆         │                          ┆                     │',
    '                                                          ┆         │    [  Processor job   ]  ┆  [  Cosmos store  ] │',
    '                                                          └┄┄┄┄┄┄┄┄┄┄┄┄┄►[ process log - to ]  └┄►[ prod collector ] │',
    '                                                                    │    [     confirm      ]     [      log       ] │',
    '                                                                    │                                                │',
    '                                                                    └────────────────────────────────────────────────┘',
  ])
})
