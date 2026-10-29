import test from 'node:test'; import assert from 'node:assert/strict'
import { layoutGraph, type Placed } from '../../core/graph/layered.ts'; import { g } from './graph-fixture.ts'
import { crossings, order } from '../../core/graph/order.ts'; import type { Item } from '../../core/graph/chains.ts'
const S = { rankGap: 3, nodeGap: 4, wrapAt: null }, L = (...a: Parameters<typeof g>) => layoutGraph(g(...a), S) as Placed
const hit = (a: any, b: any) => a.row < b.row + b.rows && b.row < a.row + a.rows && a.col < b.col + b.cols && b.col < a.col + a.cols
test('A1: TB ranks go down, LR ranks go right, cycles lay out', () => {
  const t = L('TB', ['A>B', 'B>C']); assert.ok(t.boxes.get('A')!.row < t.boxes.get('B')!.row && t.boxes.get('B')!.row < t.boxes.get('C')!.row)
  const l = L('LR', ['A>B']); assert.ok(l.boxes.get('A')!.col < l.boxes.get('B')!.col)
  const c = L('TB', ['A>B', 'B>C', 'C>A']); assert.ok(c.boxes.get('A')!.row < c.boxes.get('C')!.row)
})
test('A1: no boxes overlap; an edge label has a rank of its own; cluster strips keep outsiders out', () => {
  const p = L('TB', ['A>B', 'A>C', 'A>D', 'B>E', 'C>E', 'D>E|done']), bs = [...p.boxes.values()]
  bs.forEach((x, i) => bs.slice(i + 1).forEach(y => assert.ok(!hit(x, y))))
  const lab = p.boxes.get('e5:label')!; assert.ok(p.boxes.get('D')!.row < lab.row && lab.row < p.boxes.get('E')!.row)
  const x = g('TB', ['A>B', 'X>B']); x.clusters.push({ id: 's', title: 'S', dir: null, nodes: ['A', 'B'], clusters: [] })
  const q = layoutGraph(x, S) as Placed, f = q.frames.get('s')!
  assert.ok(hit(f, q.boxes.get('A')) && hit(f, q.boxes.get('B')) && !hit(f, q.boxes.get('X')))
})
test('A3: a box is its widest row, a pad cell each side and its caps wide, with one row per line', () => {
  const p = layoutGraph(g('TB', ['A>B', 'B>C|完成'], { A: '读取配置', B: 'one<br/>two' }), S) as Placed
  assert.deepEqual([p.boxes.get('A')!.cols, p.boxes.get('A')!.rows], [12, 1])
  assert.deepEqual([p.boxes.get('B')!.cols, p.boxes.get('B')!.rows], [7, 2])
  assert.deepEqual([p.boxes.get('e1:label')!.cols, p.boxes.get('e1:label')!.rows], [6, 1])
  const x = g('TB', ['A>B']); x.nodes[0]!.shape = 'dcircle'
  assert.equal((layoutGraph(x, S) as Placed).boxes.get('A')!.cols, 9)
})
test('A3: wrapAt wraps rows into pieces; a word wider than wrapAt fails word-too-wide', () => {
  const w = { ...S, wrapAt: 3 }, p = layoutGraph(g('TB', ['A>B|ab cd'], { A: 'ab cd' }), w) as Placed
  assert.deepEqual([p.boxes.get('A')!.cols, p.boxes.get('A')!.rows], [6, 2])
  assert.deepEqual([p.boxes.get('e0:label')!.cols, p.boxes.get('e0:label')!.rows], [4, 2])
  assert.deepEqual(layoutGraph(g('TB', ['A>B'], { A: 'abcd' }), w), { reason: 'word-too-wide' })
  assert.deepEqual(layoutGraph(g('TB', ['A>B|abcd']), w), { reason: 'word-too-wide' })
})
test('A1: a long span gets a 1×1 dummy on each rank it crosses, its label on the middle one', () => {
  const p = L('TB', ['A>B', 'B>C', 'C>D', 'A>D|x', 'A>C'])
  assert.deepEqual([...p.boxes.keys()].sort(), ['A', 'B', 'C', 'D', 'e3#2', 'e3:label', 'e4#1'])
  const row = (id: string) => p.boxes.get(id)!.row
  assert.deepEqual([row('e3:label'), row('e3#2'), row('e4#1')], [row('B'), row('C'), row('B')])
  assert.deepEqual([p.boxes.get('e4#1')!.rows, p.boxes.get('e4#1')!.cols], [1, 1])
})
test('A3: an edge label breaks at <br/> as node rows do: a<br/>bb is 2 rows, 4 wide', () => {
  const p = L('TB', ['A>B|a<br/>bb'])
  assert.deepEqual([p.boxes.get('e0:label')!.rows, p.boxes.get('e0:label')!.cols], [2, 4])
})
test('A1: barycenter sweeps clear the crossing that source order has (D before E under B before C)', () => {
  const p = L('TB', ['A>B', 'A>C', 'C>D', 'B>E']), col = (id: string) => p.boxes.get(id)!.col
  assert.ok(col('B') < col('C'))
  assert.ok(col('E') < col('D'))
})
test('A1: crossings counts each pair of segments whose ends swap order; order keeps the fewest', () => {
  const item = (id: string, rank: number, key: number): Item => ({ id, rank, key, kind: 'node', owner: null, cross: 1, main: 1 })
  const ranks = [[item('a', 0, 0), item('b', 0, 1), item('c', 0, 2)], [item('x', 1, 3), item('y', 1, 4), item('z', 1, 5)]]
  const segs = [['a', 'z'], ['b', 'y'], ['c', 'x'], ['a', 'x']].map(([upper = '', lower = '']) => ({ edge: upper + lower, upper, lower }))
  assert.equal(crossings(ranks, segs), 3)
  const best = order(ranks, segs)
  assert.equal(crossings(best, segs), 0)
  assert.deepEqual(best.map(r => r.map(i => i.id).join('')), ['acb', 'zxy'])
})
test('A1: a parent centres over its children, which sit nodeGap apart', () => {
  const p = L('TB', ['A>B', 'A>C'])
  assert.deepEqual([p.boxes.get('A'), p.boxes.get('B'), p.boxes.get('C')], [
    { row: 0, col: 4, rows: 1, cols: 5 }, { row: 4, col: 0, rows: 1, cols: 5 }, { row: 4, col: 9, rows: 1, cols: 5 }])
  assert.deepEqual([p.rows, p.cols], [5, 14])
})
test('A1: a gap is max(rankGap, tracks + 2) rows, its tracks the distinct sources crossing it', () => {
  assert.equal(L('TB', ['A>C', 'A>D', 'B>C']).boxes.get('C')!.row, 5)
  assert.equal((layoutGraph(g('TB', ['A>B', 'A>C']), { ...S, rankGap: 6 }) as Placed).boxes.get('B')!.row, 7)
})
test('A3: a band is as tall as its tallest box, and a shorter box is centred in it', () => {
  const p = L('TB', ['A>B', 'A>C', 'C>D'], { B: 'a<br/>b<br/>c' })
  assert.deepEqual([p.boxes.get('B')!.row, p.boxes.get('C')!.row, p.boxes.get('D')!.row], [4, 5, 10])
})
test('A1: a strip keeps outsiders out even on a rank where it has no member', () => {
  const x = g('TB', ['A>X', 'X>C']); x.clusters.push({ id: 's', title: 'S', dir: null, nodes: ['A', 'C'], clusters: [] })
  const p = layoutGraph(x, S) as Placed
  assert.deepEqual([p.frames.get('s'), p.boxes.get('X')], [{ row: 0, col: 0, rows: 11, cols: 9 }, { row: 5, col: 13, rows: 1, cols: 5 }])
})
test('A1: nested clusters give nested frames, a border and a pad cell apart', () => {
  const x = g('TB', ['X>A', 'A>B', 'B>Y'])
  x.clusters.push({ id: 'o', title: 'O', dir: null, nodes: ['A'], clusters: ['i'] }, { id: 'i', title: 'I', dir: null, nodes: ['B'], clusters: [] })
  const p = layoutGraph(x, S) as Placed
  assert.deepEqual([p.frames.get('o'), p.frames.get('i')], [{ row: 1, col: 0, rows: 12, cols: 13 }, { row: 6, col: 2, rows: 6, cols: 9 }])
  assert.deepEqual(p.boxes.get('B'), { row: 10, col: 4, rows: 1, cols: 5 })
})
test('A1: an edge that ends on an open cluster fails cluster-edge', () => {
  const x = g('TB', ['A>B', 'X>B', 'X>s']); x.nodes = x.nodes.filter(n => n.id !== 's')
  x.clusters.push({ id: 's', title: 'S', dir: null, nodes: ['A', 'B'], clusters: [] })
  assert.deepEqual(layoutGraph(x, S), { reason: 'cluster-edge' })
})
test('A1: a sealed LR subgraph in a TB graph is one block, its members side by side; an edge to it ends on its frame', () => {
  const x = g('TB', ['P>h', 'A>B']); x.nodes = x.nodes.filter(n => n.id !== 'h')
  x.clusters.push({ id: 'h', title: 'H', dir: 'LR', nodes: ['A', 'B'], clusters: [] })
  const p = layoutGraph(x, S) as Placed
  assert.deepEqual(p.frames.get('h'), { row: 4, col: 0, rows: 3, cols: 17 })
  assert.deepEqual([p.boxes.get('A'), p.boxes.get('B')], [{ row: 5, col: 2, rows: 1, cols: 5 }, { row: 5, col: 10, rows: 1, cols: 5 }])
  assert.deepEqual([[...p.boxes.keys()].sort(), p.rows, p.cols], [['A', 'B', 'P'], 7, 17])
})
test('A1: BT and RL mirror TB and LR along the main axis, frames included', () => {
  const run = (dir: 'TB' | 'BT' | 'LR' | 'RL') => {
    const x = g(dir, ['X>A', 'A>B', 'B>Y', 'A>Y|go']); x.clusters.push({ id: 'o', title: 'O', dir: null, nodes: ['A', 'B'], clusters: [] })
    return layoutGraph(x, S) as Placed
  }
  const [tb, bt, lr, rl] = (['TB', 'BT', 'LR', 'RL'] as const).map(run)
  assert.deepEqual([bt.rows, bt.cols, bt.boxes.size, rl.rows, rl.cols, rl.boxes.size], [tb.rows, tb.cols, 5, lr.rows, lr.cols, 5])
  for (const k of ['boxes', 'frames'] as const) for (const [id, b] of tb[k]) assert.deepEqual(bt[k].get(id), { ...b, row: tb.rows - b.row - b.rows })
  for (const k of ['boxes', 'frames'] as const) for (const [id, b] of lr[k]) assert.deepEqual(rl[k].get(id), { ...b, col: lr.cols - b.col - b.cols })
  assert.ok(bt.boxes.get('Y')!.row < bt.boxes.get('X')!.row && rl.boxes.get('Y')!.col < rl.boxes.get('X')!.col)
})
test('A1: the same input always gives the same Placed', () => {
  const run = () => {
    const x = g('LR', ['A>B', 'A>C', 'C>A', 'B>D|x', 'C>D', 'E>D']); x.clusters.push({ id: 's', title: 'S', dir: null, nodes: ['B', 'C'], clusters: [] })
    return layoutGraph(x, S)
  }
  assert.deepEqual(run(), run())
})
test('A1: a top border sits at the top of the gap above its first band, so an edge into the strip has its in-stem and head inside', () => {
  const x = g('TB', ['A>B']); x.clusters.push({ id: 's', title: 'S', dir: null, nodes: ['B'], clusters: [] })
  const p = layoutGraph(x, S) as Placed, f = p.frames.get('s')!, b = p.boxes.get('B')!
  assert.deepEqual([f, b.row, p.rows], [{ row: 1, col: 0, rows: 6, cols: 9 }, 5, 7])
  assert.ok(b.row - f.row - 1 >= 2)
})
test('A1: where borders meet in one gap, the ending bottom border comes first, then the starting top border', () => {
  const x = g('TB', ['A>B'])
  x.clusters.push({ id: 's1', title: 'S1', dir: null, nodes: ['A'], clusters: [] }, { id: 's2', title: 'S2', dir: null, nodes: ['B'], clusters: [] })
  const p = layoutGraph(x, S) as Placed
  assert.deepEqual([p.frames.get('s1'), p.frames.get('s2')], [{ row: 0, col: 0, rows: 3, cols: 9 }, { row: 3, col: 0, rows: 6, cols: 9 }])
})
test('A1: a back edge is reversed with its ends swapped, so its head still points at its own target', () => {
  const x = g('TB', ['A>B', 'B>C', 'C>A']), y = g('TB', ['A>B', 'B>C', 'C>A']); y.edges[2]!.tail = 'arrow'; y.edges[2]!.head = 'circle'
  const p = layoutGraph(x, S) as Placed, q = layoutGraph(y, S) as Placed
  assert.deepEqual(p.graph.edges[2], { ...x.edges[2], from: 'A', to: 'C', tail: 'arrow', head: 'none' })
  assert.deepEqual(q.graph.edges[2], { ...y.edges[2], from: 'A', to: 'C', tail: 'circle', head: 'arrow' })
  assert.deepEqual([p.graph.edges.slice(0, 2), q.graph.edges.slice(0, 2)], [x.edges.slice(0, 2), y.edges.slice(0, 2)])
})
test('A1: a frame is at least its title + 4 wide; a narrower strip or block widens, its members centred', () => {
  const T = '很长的子图标题', x = g('TB', ['X>A']), y = g('TB', ['B>C'])
  x.clusters.push({ id: 's', title: T, dir: null, nodes: ['A'], clusters: [] })
  y.clusters.push({ id: 'h', title: T, dir: null, nodes: ['B', 'C'], clusters: [] })
  const p = layoutGraph(x, S) as Placed, q = layoutGraph(y, S) as Placed
  assert.deepEqual([p.frames.get('s'), p.boxes.get('A'), p.boxes.get('X'), p.cols], [
    { row: 1, col: 0, rows: 6, cols: 18 }, { row: 5, col: 6, rows: 1, cols: 5 }, { row: 0, col: 6, rows: 1, cols: 5 }, 18])
  assert.deepEqual([q.frames.get('h'), q.boxes.get('B'), q.cols], [{ row: 0, col: 0, rows: 7, cols: 18 }, { row: 1, col: 6, rows: 1, cols: 5 }, 18])
})
test('A1: in LR a title runs along the ranks, so a strip too short for it grows its band, its members centred there', () => {
  const x = g('LR', ['X>A']); x.clusters.push({ id: 's', title: '很长的子图标题', dir: null, nodes: ['A'], clusters: [] })
  const p = layoutGraph(x, S) as Placed
  assert.deepEqual([p.frames.get('s'), p.boxes.get('A'), p.cols], [{ row: 0, col: 5, rows: 5, cols: 18 }, { row: 2, col: 13, rows: 1, cols: 5 }, 23])
})
