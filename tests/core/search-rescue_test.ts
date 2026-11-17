import test from 'node:test'
import assert from 'node:assert/strict'
import { isFail } from '../../core/fail.ts'
import { layoutGraph } from '../../core/graph/layered.ts'
import type { Placed } from '../../core/graph/layered.ts'
import { withNotes } from '../../core/graph/notes.ts'
import { routeGraph } from '../../core/graph/route.ts'
import type { Route } from '../../core/graph/route.ts'
import { parseFlowchart } from '../../core/diagrams/flowchart/parse.ts'
import type { Graph } from '../../core/graph/model.ts'
import { readSource } from '../../core/source.ts'

// W's dotted line to WD tries W's right face first, against every slot on WD, and none routes; without the rescue
// those tries spend the whole search budget before W's bottom face, which routes, is tried.
const SOURCE = [
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

// The chart laid out as the natural step lays it out: LR spacing, no wrap.
function placed(): Placed {
  const source = readSource(SOURCE)
  assert.ok(!isFail(source))
  const graph = parseFlowchart(source) as Graph
  return layoutGraph(withNotes(graph), { rankGap: 6, nodeGap: 1, wrapAt: null }) as Placed
}

test('without the rescue, the search runs out on the line whose first source slot reaches no target', () => {
  const routes = routeGraph(placed())

  assert.deepEqual(routes, { reason: 'route-conflict' })
})

test('with the rescue, the line takes a later source slot and every edge routes', () => {
  const p = placed()

  const routes = routeGraph(p, true) as Route[]

  assert.ok(Array.isArray(routes), JSON.stringify(routes))
  assert.deepEqual(
    routes.map((r) => r.edge),
    p.graph.edges.filter((e) => e.style !== 'invisible').map((e) => e.id),
  )
  assert.ok(routes.every((r) => r.cells.length > 0))
})
