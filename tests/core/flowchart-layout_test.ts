import test from 'node:test'; import assert from 'node:assert/strict'
import { flowchart, SPACING } from '../../core/diagrams/flowchart/layout.ts'; import { lookup } from '../../core/registry.ts'
import { readSource } from '../../core/source.ts'; import { isFail } from '../../core/fail.ts'; import { validate } from '../../core/validate.ts'
import { layoutGraph } from '../../core/graph/layered.ts'; import { routeGraph } from '../../core/graph/route.ts'
import { drawGraph } from '../../core/graph/draw.ts'
import { explain } from '../../core/render.ts'
import { text } from './graph-fixture.ts'
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

test('A1: Q1 smoke labels interrupt a straight centered line', () => {
  const result = explain('flowchart TB\nA[Start] --> B{Ready?}\nB -->|yes| C([Done])', { columns: 80 })
  assert.ok(!isFail(result))
  assert.equal(validate(result.drawing), null)
  assert.equal(text(result.drawing).join('\n'), [
    ' [ Start ]', '     │', '     │', '     ▼', ' { Ready? }',
    '      │', '      │', '      │', '     yes', '      │', '      │', '      ▼', '([ Done ])',
  ].join('\n'))
})

test('A1: Q1 LR labels interrupt a straight line with no padding gaps', () => {
  const result = explain('flowchart LR\nA -->|yes| B', { columns: 80 })
  assert.ok(!isFail(result))
  assert.equal(result.step, 'natural')
  assert.equal(validate(result.drawing), null)
  assert.equal(text(result.drawing).join('\n'), '[ A ]───────yes──────►[ B ]')
})

test('A1: Q1 labelled decision branches keep labels on their straight stems', () => {
  const vertical = explain('flowchart TB\nB{检查} -->|通过| C[部署]\nB -->|失败| D[回滚]', { columns: 80 })
  assert.ok(!isFail(vertical))
  assert.equal(text(vertical.drawing).join('\n'), [
    '     { 检查 }', '    ┌────┴──────┐', '    │           │', '    │           │', '  通过        失败',
    '    │           │', '    │           │', '    │           │', '    ▼           ▼', '[ 部署 ]    [ 回滚 ]',
  ].join('\n'))
  const horizontal = explain('flowchart LR\nA[读取配置] --> B{有效?}\nB -->|是| C[启动]\nB -->|否| D[报错]', { columns: 80 })
  assert.ok(!isFail(horizontal))
  assert.equal(text(horizontal.drawing).join('\n'), [
    '[ 读取配置 ]─────►{ 有效? }──┬────是──────►[ 启动 ]',
    '                             │', '                             └────否──────►[ 报错 ]',
  ].join('\n'))
  assert.equal(validate(vertical.drawing), null)
  assert.equal(validate(horizontal.drawing), null)
})

test('A1: Q1 retry edges run outside and enter a side port', () => {
  const result = explain('flowchart TB\nA[开始] --> B{检查}\nB -->|通过| C[部署]\nB -->|失败| D[回滚]\nD --> A', { columns: 80 })
  assert.ok(!isFail(result))
  assert.equal(validate(result.drawing), null)
  const rows = text(result.drawing)
  assert.ok(rows[0]!.includes('◄'), rows.join('\n'))
  assert.ok(!rows.some(row => /[┼╂┿╋]/.test(row)), rows.join('\n'))
  assert.equal(result.drawing.expect.edges.find(e => e.from === 'D' && e.to === 'A')!.heads[0], '◄')
  assert.equal(rows.join('\n'), [
    '     [ 开始 ]◄──────────┐', '      ┌──┘              │', '      │                 │', '      ▼                 │',
    '  { 检查 }              │', '    ┌─┴──────────┐      │', '    │            │      │', '    │            │      │',
    '    │            │      │', '  通过         失败     │', '    │            │      │', '    │            │      │',
    '    │            │      │', '    │            │      │', '    ▼            ▼      │', '[ 部署 ]     [ 回滚 ]───┘',
  ].join('\n'))
  const horizontal = explain('flowchart LR\nA-->B\nB-->C\nC-->A', { columns: 80 })
  assert.ok(!isFail(horizontal))
  assert.equal(validate(horizontal.drawing), null)
  assert.equal(text(horizontal.drawing).join('\n'), [
    '     ┌────►[ B ]┐', '[ A ]┘          └────►[ C ]', '  ▲                     │',
    '  │                     │', '  │                     │', '  └─────────────────────┘',
  ].join('\n'))
})

test('A1: Q1 diamond junctions are centered under and over their nodes', () => {
  const result = explain('flowchart TB\nA-->B\nA-->C\nB-->D\nC-->D', { columns: 80 })
  assert.ok(!isFail(result))
  assert.equal(validate(result.drawing), null)
  assert.equal(text(result.drawing).join('\n'), [
    '    [ A ]', '  ┌───┴────┐', '  │        │', '  ▼        ▼', '[ B ]    [ C ]',
    '  └───┬────┘', '      │', '      │', '      ▼', '    [ D ]',
  ].join('\n'))
})

test('A1: Q1 route conflicts retry the same step with two more cells of spacing', () => {
  const g = graph('flowchart LR\nN0-->N1\nN1-->N2\nN2-->N3\nN1-->N4\nN0-->N5\nN3-->N6\nN3-->N5\nN5-->N6\nN4-->N5\nN4-->N6')
  assert.equal(verdict(pipeline(g, { rankGap: 6, nodeGap: 1, wrapAt: null }, 120)), 'route-conflict')
  const expected = pipeline(g, { rankGap: 8, nodeGap: 3, wrapAt: null }, 120)
  assert.equal(verdict(expected), 'valid')
  assert.deepEqual(flowchart.layout(g, 'natural', 120), expected)
  assert.notEqual(verdict(flowchart.layout(g, 'natural', 20)), 'valid')
})

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
