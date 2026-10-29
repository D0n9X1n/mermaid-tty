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
