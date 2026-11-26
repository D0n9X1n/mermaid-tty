import test from 'node:test'
import assert from 'node:assert/strict'
import { isFail } from '../../core/fail.ts'
import { RESCUE_WORK } from '../../core/fit.ts'
import { layoutGraph } from '../../core/graph/layered.ts'
import type { Placed } from '../../core/graph/layered.ts'
import { withNotes } from '../../core/graph/notes.ts'
import { routeGraph } from '../../core/graph/route.ts'
import { searchRoutes } from '../../core/graph/search.ts'
import { drawGraph } from '../../core/graph/draw.ts'
import { validate } from '../../core/validate.ts'
import type { Route } from '../../core/graph/route.ts'
import { parseFlowchart } from '../../core/diagrams/flowchart/parse.ts'
import type { Graph } from '../../core/graph/model.ts'
import { readSource } from '../../core/source.ts'

// W's dotted line to WD tries W's right face first, against every slot on WD, before W's bottom face, which routes. The
// rescue's budget lets a later source slot be tried when the first spends its share.
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

// The chart laid out with no wrap, by default as the natural step lays it out: LR spacing.
function placed(src = SOURCE, rankGap = 6, nodeGap = 1): Placed {
  const source = readSource(src)
  assert.ok(!isFail(source))
  const graph = parseFlowchart(source) as Graph
  return layoutGraph(withNotes(graph), { rankGap, nodeGap, wrapAt: null }) as Placed
}

// The tries from W's right face once ran through subgraphs that hold neither end of the line, each refused only after
// its search, and spent the budget before W's bottom face was tried. The search goes round such a subgraph now, so the
// line routes without the rescue too.
test('without the rescue, the line goes round the subgraphs that hold neither end and every edge routes', () => {
  const p = placed()

  const routes = routeGraph(p)

  assert.ok(Array.isArray(routes), JSON.stringify(routes))
  assert.equal(validate(drawGraph(p, routes, p.cols)), null)
})

test('with the rescue, the line takes a later source slot and every edge routes', () => {
  const p = placed()

  const routes = routeGraph(p, { left: RESCUE_WORK }) as Route[]

  assert.ok(Array.isArray(routes), JSON.stringify(routes))
  assert.deepEqual(
    routes.map((r) => r.edge),
    p.graph.edges.filter((e) => e.style !== 'invisible').map((e) => e.id),
  )
  assert.ok(routes.every((r) => r.cells.length > 0))
})

// Two 77-cell lines in Directory Service push W's other targets far apart, so one try from a source slot can spend more
// than that slot's share on its own. The share must bound each path search inside a try, not only the tries.
test('with the rescue, one try cannot spend more than its source slot share, so a later slot still routes', () => {
  const wide = 'X'.repeat(77)
  const p = placed(SOURCE.replace('DS[Directory Service]', `DS[${wide}<br/>${wide}]`), 8, 3)

  const routes = searchRoutes(p, false, [], { left: RESCUE_WORK })

  assert.ok(Array.isArray(routes), JSON.stringify(routes))
  assert.deepEqual(
    routes.map((r) => r.edge),
    p.graph.edges.filter((e) => e.style !== 'invisible').map((e) => e.id),
  )
  assert.equal(validate(drawGraph(p, routes, p.cols)), null)
})
