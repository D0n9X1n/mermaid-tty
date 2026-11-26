import test from 'node:test'
import assert from 'node:assert/strict'
import { createCanvas, type Drawing } from '../../core/canvas.ts'
import { fail, isFail, type Fail } from '../../core/fail.ts'
import { fitLadder, RESCUE_WORK, type Step } from '../../core/fit.ts'
import { flowchart } from '../../core/diagrams/flowchart/layout.ts'
import type { Graph } from '../../core/graph/model.ts'
import { lookup, type DiagramModule } from '../../core/registry.ts'
import { explain } from '../../core/render.ts'
import { readSource, type Source } from '../../core/source.ts'
import { validate } from '../../core/validate.ts'

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

// This chart fits at wrap without the rescue, which also draws it there. Whatever the rescue would draw must not win:
// a drawing the normal ladder finds is shown exactly as the ladder draws it, and the rescue never runs.
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

test('a chart the normal ladder draws keeps that drawing at 160 columns, and the rescue never runs', () => {
  const model = flowchart.parse(readSource(FITS_NORMALLY) as Source) as Graph
  const { rescue, ...normal } = flowchart
  const calls: Step[] = []
  const spied: DiagramModule<Graph> = {
    ...flowchart,
    rescue: (m, step, columns, work) => {
      calls.push(step)
      return rescue!(m, step, columns, work)
    },
  }

  const alone = fitLadder(normal, model, 160)
  const fitted = fitLadder(spied, model, 160)
  const shown = explain(FITS_NORMALLY, { columns: 160 })
  const rescued = rescue!(model, 'wrap', 160, { left: RESCUE_WORK })

  assert.ok('drawing' in alone, JSON.stringify(alone))
  assert.equal(alone.step, 'wrap')
  assert.deepEqual(fitted, alone)
  assert.deepEqual(shown, alone)
  assert.deepEqual(calls, [])
  assert.ok(!isFail(rescued), JSON.stringify(rescued))
  assert.equal(validate(rescued), null)
})

// A fallback draws the diagram another way, as lrToTd draws a left-to-right graph top to bottom. It runs only once
// every other step has failed, plainly and through both rescue passes; then it runs the same way, on budgets of its
// own, whatever the steps before it spent.
test('a fallback runs only after every other step and rescue pass failed, on rescue budgets of its own', () => {
  const calls: string[] = []
  const mod: DiagramModule<null> = {
    type: 'flowchart',
    parse: () => fail('unused'),
    steps: () => ['natural', 'tight', 'lrToTd'],
    fallbacks: () => ['lrToTd'],
    layout: (_, step) => {
      calls.push(`layout ${step}`)
      return fail('route-conflict')
    },
    rescue: (_, step, cols, work) => {
      calls.push(`rescue${work.rip ? ' rip' : ''} ${step} ${work.left}`)
      if (step !== 'lrToTd') {
        work.left -= RESCUE_WORK
        return fail('route-conflict')
      }

      return work.rip ? draw(5, cols) : fail('route-conflict')
    },
  }

  const r = fitLadder(mod, null, 10)

  assert.deepEqual(r, { step: 'lrToTd', drawing: draw(5, 10) })
  assert.deepEqual(calls, [
    'layout natural',
    'layout tight',
    `rescue natural ${RESCUE_WORK}`,
    `rescue rip natural ${RESCUE_WORK}`,
    'layout lrToTd',
    `rescue lrToTd ${RESCUE_WORK}`,
    `rescue rip lrToTd ${RESCUE_WORK}`,
  ])
})

// A step the rescue draws in its own direction wins over a fallback that would draw at once.
test('a diagram draws its own way through the rescue before a fallback draws it another way', () => {
  const mod: DiagramModule<null> = {
    type: 'flowchart',
    parse: () => fail('unused'),
    steps: () => ['natural', 'lrToTd'],
    fallbacks: () => ['lrToTd'],
    layout: (_, step, cols) => (step === 'lrToTd' ? draw(5, cols) : fail('route-conflict')),
    rescue: (_, step, cols, work) => (work.rip && step === 'natural' ? draw(7, cols) : fail('route-conflict')),
  }

  assert.deepEqual(fitLadder(mod, null, 10), { step: 'natural', drawing: draw(7, 10) })
})

// This flowchart fails to route left to right at every step, even with the rescue; top to bottom, on a budget the
// left-to-right rescue has not spent, it draws, exactly as the same graph written TD draws.
test('an LR flowchart that only draws top to bottom falls back to it', () => {
  const source = [
    'flowchart LR',
    '  A["Retry"]',
    '  B["Render"]',
    '  C["Retry"]',
    '  D["Load config"]',
    '  E["Parse"]',
    '  F["Done"]',
    '  G["Ask the model"]',
    '  E -->|yes| G',
    '  G -->|retry| C',
    '  B -->|retry| C',
    '  C -->|ok| B',
    '  C --> A',
    '  B -->|ok| G',
    '  B --> C',
    '  E --> F',
  ].join('\n')
  const turned = explain(source.replace('flowchart LR', 'flowchart TD'), { columns: 80 })
  assert.ok(!isFail(turned), `TD draws: ${JSON.stringify(turned)}`)

  const r = explain(source, { columns: 80 })

  assert.ok(!isFail(r), JSON.stringify(r))
  assert.equal(r.step, 'lrToTd')
  assert.equal(validate(r.drawing), null)
  assert.deepEqual(r.drawing.cells, turned.drawing.cells)
})

// RL falls back to bottom to top the same way: this graph routes no way right to left at 44 columns, and draws bottom
// to top, as the same graph written BT does. Both draw through the rescue, the fallback at its tighter spacing first.
test('an RL flowchart that only draws bottom to top falls back to it', () => {
  const source = [
    'flowchart RL',
    '  G --> B',
    '  E -->|ok| E',
    '  A -->|ok| G',
    '  B -->|ok| A',
    '  D --> E',
    '  E -->|ok| A',
    '  D --> G',
    '  B --> F',
  ].join('\n')
  const turned = explain(source.replace('flowchart RL', 'flowchart BT'), { columns: 44 })
  assert.ok(!isFail(turned), `BT draws: ${JSON.stringify(turned)}`)

  const r = explain(source, { columns: 44 })

  assert.ok(!isFail(r), JSON.stringify(r))
  assert.equal(r.step, 'lrToTd')
  assert.equal(validate(r.drawing), null)
  const top = (d: Drawing, id: string) => d.cells.findIndex((row) => row.some((c) => c?.owners.includes(id)))
  assert.ok(top(r.drawing, 'D') > top(r.drawing, 'A'), 'D, the source, draws below A, as bottom to top puts it')
})

// The fallback's rescue shares one budget across its tries. At 25 columns natural spacing cannot fit this graph, and
// searching it would spend that budget before the tight spacing that draws it gets a turn: the rescue tries tight
// first.
test('the fallback rescue tries the tight spacing before natural, so a narrow terminal still draws', () => {
  const source = [
    'flowchart RL',
    '  E -->|ok| C',
    '  B -->|ok| E',
    '  C -->|ok| F',
    '  B -->|ok| B',
    '  G --> B',
    '  F --> G',
    '  A -->|ok| B',
    '  A -->|ok| A',
  ].join('\n')

  const r = explain(source, { columns: 25 })

  assert.ok(!isFail(r), JSON.stringify(r))
  assert.equal(r.step, 'lrToTd')
  assert.equal(validate(r.drawing), null)
})
