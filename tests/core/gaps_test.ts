import test from 'node:test'; import assert from 'node:assert/strict'
import { gaps } from '../../core/graph/gaps.ts'; import { layoutGraph, type Placed } from '../../core/graph/layered.ts'; import { g } from './graph-fixture.ts'
const S = { rankGap: 3, nodeGap: 4, wrapAt: null }
test('A1: gaps gives each gap between bands, its border lines, and a sealed block\'s own gaps along its own axis', () => {
  const two = (dir: 'TB' | 'BT') => {
    const x = g(dir, ['A>B'])
    x.clusters.push({ id: 's1', title: 'S1', dir: null, nodes: ['A'], clusters: [] }, { id: 's2', title: 'S2', dir: null, nodes: ['B'], clusters: [] })
    return gaps(layoutGraph(x, S) as Placed)
  }
  assert.deepEqual(two('TB'), [{ block: null, axis: 'row', from: 2, to: 6, borders: [2, 3] }])
  assert.deepEqual(two('BT'), [{ block: null, axis: 'row', from: 2, to: 6, borders: [5, 6] }])
  const y = g('TB', ['P>h', 'A>B']); y.nodes = y.nodes.filter(n => n.id !== 'h')
  y.clusters.push({ id: 'h', title: 'H', dir: 'LR', nodes: ['A', 'B'], clusters: [] })
  assert.deepEqual(gaps(layoutGraph(y, S) as Placed), [
    { block: null, axis: 'row', from: 1, to: 3, borders: [] }, { block: 'h', axis: 'col', from: 7, to: 9, borders: [] }])
})
test('A1: gaps reads the bands the layout recorded, so a band a title widened stays whole, in all four directions', () => {
  const run = (dir: 'TB' | 'BT' | 'LR' | 'RL') => {
    const x = g(dir, ['X>A', 'A>Y']); x.clusters.push({ id: 's', title: '很长的子图标题', dir: null, nodes: ['A'], clusters: [] })
    const p = layoutGraph(x, S) as Placed
    return [p.bands?.map(b => [b.block, b.axis, b.from, b.to]), gaps(p).map(q => [q.block, q.axis, q.from, q.to, q.borders])]
  }
  const rows = [[null, 'row', 0, 0], [null, 'row', 5, 5], [null, 'row', 10, 10]]
const  cols = [[null, 'col', 0, 4], [null, 'col', 9, 21], [null, 'col', 26, 30]]
  assert.deepEqual(run('TB'), [rows, [[null, 'row', 1, 4, [1]], [null, 'row', 6, 9, [6]]]])
  assert.deepEqual(run('BT'), [rows, [[null, 'row', 1, 4, [4]], [null, 'row', 6, 9, [9]]]])
  assert.deepEqual(run('LR'), [cols, [[null, 'col', 5, 8, [5]], [null, 'col', 22, 25, [22]]]])
  assert.deepEqual(run('RL'), [cols, [[null, 'col', 5, 8, [8]], [null, 'col', 22, 25, [25]]]])
})
test('A1: a sealed block nested in another keeps its own bands, so gaps finds the inner gap and no false outer ones', () => {
  const x = g('TB', ['A>B'])
  x.clusters.push({ id: 'o', title: 'O', dir: 'TB', nodes: [], clusters: ['i'] }, { id: 'i', title: 'I', dir: 'LR', nodes: ['A', 'B'], clusters: [] })
  const p = layoutGraph(x, S) as Placed
  assert.deepEqual([p.boxes.get('A'), p.boxes.get('B')], [{ row: 2, col: 4, rows: 1, cols: 5 }, { row: 2, col: 12, rows: 1, cols: 5 }])
  assert.deepEqual(p.bands, [{ block: null, axis: 'row', from: 0, to: 4 }, { block: 'o', axis: 'row', from: 1, to: 3 },
    { block: 'i', axis: 'col', from: 4, to: 8 }, { block: 'i', axis: 'col', from: 12, to: 16 }])
  assert.deepEqual(gaps(p), [{ block: 'i', axis: 'col', from: 9, to: 11, borders: [] }])
})
