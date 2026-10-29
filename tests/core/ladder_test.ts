import test from 'node:test'; import assert from 'node:assert/strict'
import { graphSteps, drawAt, type Build } from '../../core/graph/ladder.ts'; import { validate } from '../../core/validate.ts'
import type { Drawing } from '../../core/canvas.ts'; import { g, text } from './graph-fixture.ts'
import type { Graph } from '../../core/graph/model.ts'
const keyable = [{ item: 'e0:label', cls: 'label' }]
const build: Build = ({ dir, keyed }) => {
  const gr = g(dir, ['A>B|uses', 'B>C']); if (!keyed) return { graph: gr, legend: [], keyable }
  gr.edges[0]!.labelKey = 'a'
  return { graph: gr, legend: [{ key: 'a', keyInk: 'label', item: 'e0:label', cls: 'label', parts: [{ text: 'uses', ink: 'label', owner: 'e0:label' }] }], keyable }
}
test('A4.fit-ladder: graph steps; lrToTd only for LR and RL; keyed last', () => {
  assert.deepEqual(graphSteps('TB', false), ['natural', 'tight', 'wrap'])
  assert.deepEqual(graphSteps('LR', true), ['natural', 'tight', 'wrap', 'lrToTd', 'keyed'])
})
test('A4.fit-ladder: drawAt stacks the title, the graph and the legend; keyed LR is redrawn TB', () => {
  const n = drawAt(build, 'LR', 'natural', 80, 'My graph') as Drawing, k = drawAt(build, 'LR', 'keyed', 80, null) as Drawing
  const at = (s: string) => text(k).findIndex(l => l.includes(s))
  assert.equal(validate(n), null); assert.equal(text(n)[0], 'My graph'); assert.equal(n.columns, 80)
  assert.equal(validate(k), null); assert.ok(at('[ A ]') < at('[ B ]') && at('[ B ]') < at('[ C ]')); assert.equal(text(k).at(-1), 'a uses')
  assert.deepEqual(k.expect.keys, [{ key: 'a', item: 'e0:label', cls: 'label' }])
})

// A build that counts its calls: drawAt builds once per layout try, so the count is the number of tries.
const counted = (gr: Graph) => {
  const calls = { n: 0 }
  const b: Build = ({ dir }) => { calls.n++; return { graph: { ...gr, dir }, legend: [], keyable: [] } }
  return { b, calls }
}
test('A4.fit-ladder: a route-conflict retries the try at two, then four more cells of gap', () => {
  const gr = g('LR', ['N0=>N1|成功', 'N0=>N1'], { N0: 'start<br/>more' }), { b, calls } = counted(gr)
  const d = drawAt(b, 'LR', 'natural', 120, null) as Drawing
  assert.equal(validate(d), null); assert.equal(calls.n, 2)
})
test('A4.fit-ladder: any other Fail returns at once, untried at wider gaps', () => {
  // A sits in X and links to X, so X is open, and an edge ending on an open cluster fails cluster-edge at any gap.
  const gr: Graph = { ...g('TB', ['A>X']), clusters: [{ id: 'X', title: null, dir: null, nodes: ['A'], clusters: [] }] }
  const { b, calls } = counted(gr)
  assert.deepEqual(drawAt(b, 'TB', 'natural', 80, null), { reason: 'cluster-edge' }); assert.equal(calls.n, 1)
})
test('A4.fit-ladder: flowchart runs on the graph ladder and re-exports its SPACING', async () => {
  const ladder = await import('../../core/graph/ladder.ts'), fc = await import('../../core/diagrams/flowchart/layout.ts')
  assert.equal(fc.SPACING, ladder.SPACING)
})
