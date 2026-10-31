import test from 'node:test'; import assert from 'node:assert/strict'
import { createCanvas, type Drawing } from '../../core/canvas.ts'; import { validate } from '../../core/validate.ts'
import { sequence } from '../../core/diagrams/sequence/layout.ts'; import { parseSequence } from '../../core/diagrams/sequence/parse.ts'
import { parseFlowchart } from '../../core/diagrams/flowchart/parse.ts'; import { readSource, type Source } from '../../core/source.ts'
import { drawGraph } from '../../core/graph/draw.ts'; import { layoutGraph } from '../../core/graph/layered.ts'; import { routeGraph } from '../../core/graph/route.ts'
import type { Graph } from '../../core/graph/model.ts'; import { text } from './graph-fixture.ts'

// A sequence body, and a flowchart `dir\nbody`, each drawn at its natural step in 80 columns.
const S = (t: string): Drawing => sequence.layout(parseSequence(readSource(`sequenceDiagram\n${t}`) as Source) as any, 'natural', 80) as any
function F(t: string): Drawing {
  const p = layoutGraph(parseFlowchart(readSource(`flowchart ${t}`) as Source) as Graph, { rankGap: 3, nodeGap: 4, wrapAt: null })
  if ('reason' in p) { throw new Error(p.reason) }
  const routes = routeGraph(p); if ('reason' in routes) { throw new Error(routes.reason) }
  return drawGraph(p, routes, 80)
}
type At = { r: number; c: number }
const STEPS = [[0, 1], [0, -1], [1, 0], [-1, 0]] as const
// Edge id's line and arrow cells; whether p has a cell of id beside it; d with the cells at a and b swapped.
const route = (d: Drawing, id: string): At[] => d.cells.flatMap((row, r) => row.flatMap((x, c) =>
  x && (x.kind === 'line' || x.kind === 'arrow') && x.owners.includes(id) ? [{ r, c }] : []))
const touches = (d: Drawing, p: At, id: string) => STEPS.some(([dr, dc]) => d.cells[p.r + dr]?.[p.c + dc]?.owners.includes(id) ?? false)
function swap(d: Drawing, a: At, b: At): Drawing {
  const x = d.cells[a.r]![a.c]!; d.cells[a.r]![a.c] = d.cells[b.r]![b.c]!; d.cells[b.r]![b.c] = x; return d
}
const show = (d: Drawing) => text(d).join('\n')

// QA's repro: B-xA draws its x beside A; swapped with the line cell beside B, the x sits at the sender.
test('A5.mutation-tests: a sequence end mark beside the wrong participant fails end-misplaced', () => {
  const d = S('participant A\nparticipant B\nB-xA: bye')
const  cells = route(d, d.expect.edges[0]!.id)
  assert.equal(validate(d), null, show(d))
  const x = cells.find(p => d.cells[p.r]![p.c]!.ch === 'x')!
  const far = cells.filter(p => p.r === x.r).reduce((m, p) => (Math.abs(p.c - x.c) > Math.abs(m.c - x.c) ? p : m))
  assert.equal(validate(swap(d, x, far))?.reason, 'end-misplaced', show(d))
})
// Each edge's head swapped with its line cell beside A: ► then points away from A; ● and x have no point.
test('A5.mutation-tests: a flowchart head moved beside its tail node fails end-misplaced', () => {
  for (const t of ['LR\nA --> B', 'LR\nA --o B', 'TB\nA --x B']) {
    const d = F(t)
const  cells = route(d, d.expect.edges[0]!.id)
    assert.equal(validate(d), null, show(d))
    const head = cells.find(p => d.cells[p.r]![p.c]!.kind === 'arrow')!
    const nearA = cells.find(p => d.cells[p.r]![p.c]!.kind === 'line' && touches(d, p, 'A'))!
    assert.equal(validate(swap(d, head, nearA))?.reason, 'end-misplaced', `${t}\n${show(d)}`)
  }
})
// Each mark names its own node: <--> and o--o one at each end, and a reversed back edge its head at its own to.
test('A5.mutation-tests: flowchart ends name their own node; two-headed, circle, cross and reversed edges pass', () => {
  const nodes = (t: string) => { const d = F(t); assert.equal(validate(d), null, show(d)); return d.expect.edges.map(e => e.ends.map(x => x.node).sort().join('')) }
  assert.deepEqual(nodes('LR\nA <--> B'), ['AB'])
  assert.deepEqual(nodes('LR\nA o--o B'), ['AB'])
  assert.deepEqual(nodes('LR\nA --o B\nA --x C'), ['B', 'C'])
  assert.deepEqual(nodes('TB\nA --> B\nB --> A'), ['B', 'A'])
})
test('A5.mutation-tests: sequence ends put the head at to and the tail mark at from, a self-message both at its one participant', () => {
  const d = S('participant A\nparticipant B\nA<<->>B: both\nA->>A: me\nB-)A: async'); assert.equal(validate(d), null, show(d))
  assert.deepEqual(d.expect.edges.map(e => e.ends), [[{ node: 'B', glyph: '►' }, { node: 'A', glyph: '◄' }], [{ node: 'A', glyph: '◄' }], [{ node: 'A', glyph: ')' }]])
})
// a───b►: the ► beside B points away from it. Listed with no ends, the ► is an extra head.
function past(ends: { node: string; glyph: string }[]): Drawing {
  const c = createCanvas(1, 6, 6); c.text(0, 0, 'a', 'node', 'A'); c.text(0, 4, 'b', 'node', 'B'); c.arrow(0, 5, '►', 'e')
  for (let i = 1; i < 4; i++) { c.line(0, i, 10, 'light', 'edge', 'e') }
  return c.toDrawing({ labels: [{ owner: 'A', text: 'a' }, { owner: 'B', text: 'b' }], edges: [{ id: 'e', from: 'A', to: 'B', ends }], edgeLabels: [] })
}
test('A5.mutation-tests: a directional mark beside its node must point at it, and a mark no end claims is an extra head', () => {
  assert.equal(validate(past([{ node: 'B', glyph: '►' }]))?.reason, 'end-misplaced')
  assert.equal(validate(past([]))?.reason, 'head-extra')
})
