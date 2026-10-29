import test from 'node:test'; import assert from 'node:assert/strict'
import { flowchart, SPACING } from '../../core/diagrams/flowchart/layout.ts'; import { lookup } from '../../core/registry.ts'
import { readSource } from '../../core/source.ts'; import { isFail } from '../../core/fail.ts'; import { validate } from '../../core/validate.ts'
import { layoutGraph } from '../../core/graph/layered.ts'; import { routeGraph } from '../../core/graph/route.ts'
import { drawGraph } from '../../core/graph/draw.ts'
import type { Drawing } from '../../core/canvas.ts'
import type { Fail } from '../../core/fail.ts'
import type { Graph } from '../../core/graph/model.ts'
import type { Spacing } from '../../core/graph/layered.ts'

// The flowchart model of src; a source or parse failure throws.
function graph(src: string): Graph {
  const s = readSource(src)
  if (isFail(s)) throw new Error(s.reason)
  const g = flowchart.parse(s)
  if (isFail(g)) throw new Error(g.reason)
  return g
}
// What layout → route → draw makes of g at spacing s and the given columns, or the first Fail.
function pipeline(g: Graph, s: Spacing, columns: number): Drawing | Fail {
  const placed = layoutGraph(g, s)
  if (isFail(placed)) return placed
  const routes = routeGraph(placed)
  return isFail(routes) ? routes : drawGraph(placed, routes, columns)
}
const verdict = (d: Drawing | Fail) => isFail(d) ? d.reason : validate(d)?.reason ?? 'valid'
const LONG = 'A[the quick brown fox jumps over the lazy dog] --> B[ok]'

test('A1: the flowchart module registers itself for the flowchart and graph keywords', () => {
  assert.equal(lookup('flowchart TD'), flowchart)
  assert.equal(lookup('graph LR'), flowchart)
})
test('A4.fit-ladder: flowchart steps are natural, tight, wrap, plus lrToTd for LR and RL only', () => {
  const steps = ['TD', 'TB', 'BT', 'LR', 'RL'].map(d => flowchart.steps(graph(`flowchart ${d}\nA --> B`)))
  assert.deepEqual(steps, [...Array(3).fill(['natural', 'tight', 'wrap']), ...Array(2).fill(['natural', 'tight', 'wrap', 'lrToTd'])])
})
test('A4.fit-ladder: the spacing table gives rankGap/nodeGap per step, for TB/BT and for LR/RL', () => {
  assert.deepEqual(SPACING, { natural: { TB: { rankGap: 3, nodeGap: 4 }, LR: { rankGap: 6, nodeGap: 1 } },
    tight: { TB: { rankGap: 2, nodeGap: 2 }, LR: { rankGap: 4, nodeGap: 1 } }, wrap: { TB: { rankGap: 2, nodeGap: 2 }, LR: { rankGap: 4, nodeGap: 1 } } })
})
// Each row: direction, step, rankGap, nodeGap, wrapAt. The labels are short, so wrap's first wrapAt, 24, validates.
const ROWS = [['TD', 'natural', 3, 4, null], ['TD', 'tight', 2, 2, null], ['TD', 'wrap', 2, 2, 24], ['BT', 'natural', 3, 4, null],
  ['BT', 'tight', 2, 2, null], ['BT', 'wrap', 2, 2, 24], ['LR', 'natural', 6, 1, null], ['LR', 'tight', 4, 1, null],
  ['LR', 'wrap', 4, 1, 24], ['RL', 'natural', 6, 1, null], ['RL', 'tight', 4, 1, null], ['RL', 'wrap', 4, 1, 24]] as const
test('A4.fit-ladder: each step lays out, routes and draws at its spacing and the given columns', () => {
  for (const [dir, step, rankGap, nodeGap, wrapAt] of ROWS) {
    const g = graph(`flowchart ${dir}\nA[alpha] --> B[beta]\nA --> C[gamma]`)
    assert.deepEqual(flowchart.layout(g, step, 80), pipeline(g, { rankGap, nodeGap, wrapAt }, 80), `${dir} ${step}`)
  }
})
test('A4.fit-ladder: wrap takes the first of wrapAt 24, 20, 16, 12, 8 that validates, else the last attempt', () => {
  const g = graph(`flowchart TD\n${LONG}`), at = (wrapAt: number, cols = 22) => pipeline(g, { rankGap: 2, nodeGap: 2, wrapAt }, cols)
  assert.deepEqual([24, 20, 16, 12].map(w => verdict(at(w))), ['row-too-wide', 'row-too-wide', 'valid', 'valid'])
  assert.deepEqual(flowchart.layout(g, 'wrap', 22), at(16))
  assert.notDeepEqual(at(16), at(12))
  assert.deepEqual(flowchart.layout(g, 'wrap', 10), at(8, 10))
})
test('A4.fit-ladder: lrToTd draws LR as TB and RL as BT at the tight spacing, trying wrapAt null, 24, 20, 16, 12, 8', () => {
  for (const [dir, to] of [['LR', 'TB'], ['RL', 'BT']] as const) {
    const g = graph(`flowchart ${dir}\n${LONG}\nA --> C[fine]`)
    for (const [columns, tried] of [[80, [null]], [30, [null, 24]], [22, [null, 24, 20, 16]]] as const) {
      const td = (wrapAt: number | null) => pipeline({ ...g, dir: to }, { rankGap: 2, nodeGap: 2, wrapAt }, columns)
      assert.deepEqual(tried.map(w => verdict(td(w))), tried.map((_, i) => i === tried.length - 1 ? 'valid' : 'row-too-wide'))
      assert.deepEqual(flowchart.layout(g, 'lrToTd', columns), td(tried[tried.length - 1] ?? null), `${dir} ${columns}`)
    }
    assert.equal(g.dir, dir)
  }
})
