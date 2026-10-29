import test from 'node:test'
import assert from 'node:assert/strict'
import { layoutGraph } from '../../core/graph/layered.ts'
import type { Placed } from '../../core/graph/layered.ts'
import { routeGraph } from '../../core/graph/route.ts'
import type { Route } from '../../core/graph/route.ts'
import { g } from './graph-fixture.ts'

const R = (dir: 'TB' | 'LR', e: string[]) => routeGraph(layoutGraph(g(dir, e), {
  rankGap: 3, nodeGap: 4, wrapAt: null,
}) as Placed) as Route[]
const linked = (r: Route) => r.cells.every((c, i) => !i ||
  Math.abs(c.r - r.cells[i - 1]!.r) + Math.abs(c.c - r.cells[i - 1]!.c) === 1)
const at = (r: Route) => new Set(r.cells.map(c => `${c.r},${c.c}`))

test('A1: a fan-out shares its stem; unrelated routes share no cell', () => {
  const [ab, ac, de] = R('TB', ['A>B', 'A>C', 'D>E']).map(at)
  assert.ok([...ab!].some(k => ac!.has(k)))
  assert.ok(![...de!].some(k => ab!.has(k) || ac!.has(k)))
  const fan = R('TB', ['A>B', 'A>C'])
  assert.deepEqual(fan[0]!.cells[0], { ...fan[1]!.cells[0]!, dirs: fan[0]!.cells[0]!.dirs })
  const styles = routeGraph(layoutGraph(g('TB', ['A>B', 'A=>C', 'A.>D']), {
    rankGap: 5, nodeGap: 4, wrapAt: null,
  }) as Placed) as Route[]
  assert.equal(new Set(styles.map(r => `${r.cells[0]!.r},${r.cells[0]!.c}`)).size, 3)
  const incoming = R('TB', ['A>B', 'C=>B', 'D.>B'])
  assert.equal(new Set(incoming.map(r => `${r.ends[0]!.r},${r.ends[0]!.c}`)).size, 3)
})

test('A1: bends have corners; each head follows a straight cell; crossings are perpendicular', () => {
  const rs = R('TB', ['A>B', 'A>C'])
  assert.ok(rs.some(r => r.cells.some(c => [3, 6, 9, 12].includes(c.dirs))))
  for (const r of rs) assert.ok([5, 10].includes(r.cells.at(-1)!.dirs), r.edge)
  const [, ad, bc] = R('TB', ['A>C', 'A=>D', 'B>C', 'B>D'])
  const dirOf = (r: Route, k: string) => r.cells.find(c => `${c.r},${c.c}` === k)!.dirs
  const shared = [...at(ad!)].filter(k => at(bc!).has(k))
  assert.ok(shared.length > 0)
  for (const k of shared) assert.equal(dirOf(ad!, k) + dirOf(bc!, k), 15)
})

test('A1: invisible edges have no route and visible styles survive', () => {
  const graph = g('TB', ['A>B', 'C=>D', 'E.>F', 'G>H'])
  graph.edges[3]!.style = 'invisible'
  const rs = routeGraph(layoutGraph(graph, { rankGap: 3, nodeGap: 4, wrapAt: null }) as Placed) as Route[]
  assert.deepEqual(rs.map(r => [r.edge, r.style]), [['e0', 'solid'], ['e1', 'thick'], ['e2', 'dotted']])
})

test('A1: BT and RL point their heads toward the target', () => {
  for (const [dir, ch] of [['BT', '▲'], ['RL', '◄']] as const) {
    const p = layoutGraph(g(dir, ['A>B']), { rankGap: 3, nodeGap: 4, wrapAt: null }) as Placed
    const rs = routeGraph(p)
    assert.ok(Array.isArray(rs))
    assert.equal(rs[0]!.ends[0]!.ch, ch)
    assert.ok(linked(rs[0]!))
    const b = p.boxes.get('B')!, h = rs[0]!.ends[0]!
    assert.equal(dir === 'BT' ? h.r : h.c, dir === 'BT' ? b.row + b.rows : b.col + b.cols)
  }
})

test('A1: circle and cross heads occupy the cell before the target', () => {
  for (const [head, ch] of [['circle', 'o'], ['cross', 'x']] as const) {
    const graph = g('TB', ['A>B'])
    graph.edges[0]!.head = head
    const p = layoutGraph(graph, { rankGap: 3, nodeGap: 4, wrapAt: null }) as Placed
    const r = (routeGraph(p) as Route[])[0]!
    assert.deepEqual(r.ends, [{ r: p.boxes.get('B')!.row - 1, c: 2, ch }])
    assert.equal(r.cells.at(-1)!.dirs, 5)
  }
})

test('A1: tail marks point at the source and an unmarked head remains a line', () => {
  for (const [tail, ch] of [['arrow', '▲'], ['circle', 'o'], ['cross', 'x']] as const) {
    const graph = g('TB', ['A>B'])
    Object.assign(graph.edges[0]!, { tail, head: 'none' })
    const p = layoutGraph(graph, { rankGap: 3, nodeGap: 4, wrapAt: null }) as Placed
    const r = (routeGraph(p) as Route[])[0]!
    assert.deepEqual(r.ends, [{ r: 1, c: 2, ch }])
    assert.deepEqual(r.cells.at(-1), { r: 3, c: 2, dirs: 5 })
    assert.ok(!at(r).has('1,2'))
    assert.ok(linked(r))
  }
})

test('A1: a long edge visits each of its dummies exactly once', () => {
  const p = layoutGraph(g('TB', ['A>B', 'B>C', 'C>D', 'A>D']), {
    rankGap: 3, nodeGap: 4, wrapAt: null,
  }) as Placed
  const rs = routeGraph(p)
  assert.ok(Array.isArray(rs))
  const r = rs.find(r => r.edge === 'e3')!
  const dummies = [...p.boxes].filter(([id]) => id.startsWith('e3#'))
  assert.equal(dummies.length, 2)
  for (const [, b] of dummies) {
    assert.equal(r.cells.filter(c => c.r === b.row && c.c === b.col).length, 1)
    assert.ok(rs.filter(s => s !== r).every(s => !at(s).has(`${b.row},${b.col}`)))
  }
  assert.ok(linked(r))
})

test('A1: labelled edges pass beside their label without entering it', () => {
  for (const dir of ['TB', 'LR', 'BT', 'RL'] as const) {
    const p = layoutGraph(g(dir, ['A>B|yes', 'A>C', 'C>D']), {
      rankGap: 4, nodeGap: 4, wrapAt: null,
    }) as Placed
    const rs = routeGraph(p)
    assert.ok(Array.isArray(rs))
    const r = rs[0]!, b = p.boxes.get('e0:label')!
    const distance = (c: { r: number; c: number }) => Math.max(
      b.row - c.r, c.r - b.row - b.rows + 1, b.col - c.c, c.c - b.col - b.cols + 1, 0)
    assert.ok(r.cells.some(c => distance(c) === 1))
    assert.ok(r.cells.every(c => distance(c) > 0))
    assert.ok(linked(r))
  }
})

test('A1: a back-edge head points at its real target after a straight in-stem', () => {
  const p = layoutGraph(g('TB', ['A>B|yes', 'A>C', 'C>D', 'D>A']), {
    rankGap: 3, nodeGap: 4, wrapAt: null,
  }) as Placed
  const rs = routeGraph(p)
  assert.ok(Array.isArray(rs))
  const r = rs.find(r => r.edge === 'e3')!, a = p.boxes.get('A')!, h = r.ends[0]!
  assert.equal(h.ch, '▲')
  assert.equal(h.r, a.row + a.rows)
  assert.ok(h.c >= a.col && h.c < a.col + a.cols)
  assert.ok(linked(r))
  const stem = r.cells.find(c => c.r === h.r + 1 && c.c === h.c)
  assert.equal(stem?.dirs, 5)
  assert.equal(r.ends.length, 1)
})

test('A1: routes avoid every node, label and foreign dummy box', () => {
  const p = layoutGraph(g('TB', ['A>B']), { rankGap: 9, nodeGap: 4, wrapAt: null }) as Placed
  const boxes = new Map(p.boxes)
  boxes.set('obstacle', { row: 4, col: 1, rows: 2, cols: 3 })
  boxes.set('foreign#1', { row: 7, col: 2, rows: 1, cols: 1 })
  boxes.set('foreign:label', { row: 6, col: 3, rows: 1, cols: 2 })
  const rs = routeGraph({ ...p, boxes })
  assert.ok(Array.isArray(rs))
  assert.equal(rs.length, 1)
  assert.ok(linked(rs[0]!))
  for (const c of [...rs[0]!.cells, ...rs[0]!.ends]) for (const b of boxes.values()) {
    assert.ok(c.r < b.row || c.r >= b.row + b.rows || c.c < b.col || c.c >= b.col + b.cols)
  }
  assert.ok(rs[0]!.cells[0]!.dirs & 1)
  assert.equal(rs[0]!.cells.at(-1)!.dirs, 5)
})

test('A1: frame borders are crossed straight and perpendicular', () => {
  const graph = g('TB', ['A>B', 'A>C'])
  graph.clusters = [{ id: 's', title: null, dir: null, nodes: ['B'], clusters: [] }]
  const p = layoutGraph(graph, { rankGap: 3, nodeGap: 4, wrapAt: null }) as Placed
  const rs = routeGraph(p)
  assert.ok(Array.isArray(rs))
  const f = p.frames.get('s')!
  let crossed = 0
  for (const r of rs) for (const c of r.cells) {
    if (c.c >= f.col && c.c < f.col + f.cols && (c.r === f.row || c.r === f.row + f.rows - 1)) {
      assert.equal(c.dirs, 5)
      crossed++
    }
    if (c.r >= f.row && c.r < f.row + f.rows && (c.c === f.col || c.c === f.col + f.cols - 1)) {
      assert.equal(c.dirs, 10)
      crossed++
    }
  }
  assert.ok(crossed > 0)
})

test('A1: routes avoid the full display width of frame title cells', () => {
  const graph = g('TB', ['A>B'])
  graph.clusters = [{ id: 's', title: '界', dir: null, nodes: ['B'], clusters: [] }]
  const p = layoutGraph(graph, { rankGap: 3, nodeGap: 4, wrapAt: null }) as Placed
  const rs = routeGraph(p)
  assert.ok(Array.isArray(rs))
  const f = p.frames.get('s')!, r = rs[0]!
  assert.ok(linked(r))
  for (const c of [...r.cells, ...r.ends]) {
    assert.ok(c.r !== f.row || c.c < f.col + 2 || c.c > f.col + 5)
  }
  assert.equal(r.cells.at(-1)!.dirs, 5)
})

test('A1: a back-edge head on a bottom border enters a side face instead', () => {
  const graph = g('TB', ['A>B', 'B>C', 'C>A'])
  graph.clusters = [{ id: 's', title: 'group', dir: null, nodes: ['A'], clusters: [] }]
  const p = layoutGraph(graph, { rankGap: 3, nodeGap: 4, wrapAt: null }) as Placed
  const rs = routeGraph(p)
  assert.ok(Array.isArray(rs))
  const r = rs.find(r => r.edge === 'e2')!, h = r.ends[0]!, a = p.boxes.get('A')!, f = p.frames.get('s')!
  assert.notEqual(h.r, f.row + f.rows - 1)
  assert.ok(h.r >= a.row && h.r < a.row + a.rows)
  assert.ok(h.c === a.col - 1 || h.c === a.col + a.cols)
  assert.equal(h.ch, h.c < a.col ? '►' : '◄')
  assert.equal(r.cells[0]!.dirs, 10)
  assert.equal(Math.abs(r.cells[0]!.r - h.r) + Math.abs(r.cells[0]!.c - h.c), 1)
  assert.ok(linked(r))
  assert.equal(at(r).size, r.cells.length)
  assert.ok(r.cells.every(c => [3, 5, 6, 9, 10, 12].includes(c.dirs)))
})

test('A1: impossible border heads report route-conflict', () => {
  const graph = g('TB', ['A>B'])
  graph.clusters = [{ id: 's', title: null, dir: null, nodes: ['B'], clusters: [] }]
  const p = layoutGraph(graph, { rankGap: 3, nodeGap: 4, wrapAt: null }) as Placed
  const b = p.boxes.get('B')!, f = p.frames.get('s')!
  const frames = new Map(p.frames).set('s', { ...f, row: b.row - 1, rows: 3 })
  const boxes = new Map(p.boxes).set('left', { row: b.row, col: 0, rows: 1, cols: b.col })
    .set('right', { row: b.row, col: b.col + b.cols, rows: 1, cols: p.cols - b.col - b.cols })
  assert.deepEqual(routeGraph({ ...p, boxes, frames }), { reason: 'route-conflict' })
})

test('A1: sealed clusters use their local direction and accept frame endpoints', () => {
  const graph = g('TB', ['A>B', 'X>S'])
  graph.nodes = graph.nodes.filter(n => n.id !== 'S')
  graph.clusters = [{ id: 'S', title: null, dir: 'LR', nodes: ['A', 'B'], clusters: [] }]
  const p = layoutGraph(graph, { rankGap: 3, nodeGap: 4, wrapAt: null }) as Placed
  const rs = routeGraph(p)
  assert.ok(Array.isArray(rs))
  assert.deepEqual(rs.map(r => r.ends[0]!.ch), ['►', '▼'])
  assert.equal(rs[1]!.ends[0]!.r, p.frames.get('S')!.row - 1)
  assert.ok(rs.every(linked))
})

test('A1: title detours cannot turn on a border to bypass an obstacle', () => {
  const graph = g('TB', ['A>B'])
  graph.clusters = [{ id: 's', title: 'wide title', dir: null, nodes: ['B'], clusters: [] }]
  const p = layoutGraph(graph, { rankGap: 8, nodeGap: 4, wrapAt: null }) as Placed
  const f = p.frames.get('s')!
  const frames = new Map(p.frames).set('s', { ...f, row: 3, rows: f.rows - 2 })
  const boxes = new Map(p.boxes).set('obstacle', { row: 4, col: 1, rows: 1, cols: 1 })
  assert.deepEqual(routeGraph({ ...p, boxes, frames }), { reason: 'route-conflict' })
})

test('A1: a back-edge side entry fails when both side stems are blocked', () => {
  const graph = g('TB', ['A>B', 'B>C', 'C>A'])
  graph.clusters = [{ id: 's', title: 'group', dir: null, nodes: ['A'], clusters: [] }]
  const original = layoutGraph(graph, { rankGap: 3, nodeGap: 4, wrapAt: null }) as Placed
  const p = { ...original, cols: original.cols + 3,
    boxes: new Map([...original.boxes].map(([id, b]) => [id, { ...b, col: b.col + 3 }])),
    frames: new Map([...original.frames].map(([id, b]) => [id, { ...b, col: b.col + 3 }])) }
  p.graph.edges[0]!.style = 'invisible'
  p.graph.edges[1]!.style = 'invisible'
  const a = p.boxes.get('A')!
  const boxes = new Map(p.boxes).set('left', { row: a.row, col: a.col - 1, rows: 1, cols: 1 })
    .set('right', { row: a.row, col: a.col + a.cols, rows: 1, cols: 1 })
  const result = routeGraph({ ...p, boxes })
  assert.deepEqual(result, { reason: 'route-conflict' })
  boxes.delete('left')
  const free = routeGraph({ ...p, boxes })
  assert.ok(Array.isArray(free))
  assert.equal(free.find(r => r.edge === 'e2')!.ends[0]!.ch, '►')
})

test('A1: distinct port groups cannot occupy the same face cell', () => {
  const p = layoutGraph(g('LR', ['A>B', 'A=>C']), { rankGap: 5, nodeGap: 4, wrapAt: null }) as Placed
  assert.deepEqual(routeGraph(p), { reason: 'route-conflict' })
})

test('A1: unrelated routes cannot share a one-cell obstacle passage', () => {
  const p = layoutGraph(g('TB', ['A>C', 'B>D']), { rankGap: 8, nodeGap: 4, wrapAt: null }) as Placed
  const boxes = new Map(p.boxes).set('left-wall', { row: 4, col: 0, rows: 1, cols: 2 })
    .set('right-wall', { row: 4, col: 3, rows: 1, cols: p.cols - 3 })
  assert.deepEqual(routeGraph({ ...p, boxes }), { reason: 'route-conflict' })
})

test('A1: obstacle detours preserve mandatory dummy waypoints', () => {
  const p = layoutGraph(g('TB', ['A>B', 'B>C', 'C>D', 'A>D']), {
    rankGap: 4, nodeGap: 4, wrapAt: null,
  }) as Placed
  const d = p.boxes.get('e3#1')!
  const boxes = new Map(p.boxes).set('obstacle', { row: d.row - 1, col: d.col, rows: 1, cols: 1 })
  const rs = routeGraph({ ...p, boxes })
  assert.ok(Array.isArray(rs))
  const r = rs.find(r => r.edge === 'e3')!
  assert.equal(r.cells.filter(c => c.r === d.row && c.c === d.col).length, 1)
  assert.ok(linked(r))
})

test('A1: crossings cannot turn the cell behind a head into a junction', () => {
  const graph = g('TB', ['A>B', 'C>D'])
  const boxes = new Map([
    ['A', { row: 0, col: 3, rows: 1, cols: 5 }], ['B', { row: 5, col: 3, rows: 1, cols: 5 }],
    ['C', { row: 2, col: 0, rows: 1, cols: 3 }], ['D', { row: 8, col: 8, rows: 1, cols: 3 }],
  ])
  const p = { graph, boxes, frames: new Map(), rows: 9, cols: 11 }
  assert.deepEqual(routeGraph(p), { reason: 'route-conflict' })
})

test('A1: routing is deterministic with ties in source order', () => {
  const p = layoutGraph(g('TB', ['A>C', 'A=>D', 'B>C', 'B>D']), {
    rankGap: 4, nodeGap: 4, wrapAt: null,
  }) as Placed
  const expected = routeGraph(p)
  assert.ok(Array.isArray(expected))
  assert.deepEqual(routeGraph(p), expected)
  assert.deepEqual(routeGraph({ ...p, boxes: new Map([...p.boxes].reverse()),
    graph: { ...p.graph, edges: [...p.graph.edges].reverse() } }), expected)
})

test('A1: unrelated nets have distinct channel tracks', () => {
  const p = layoutGraph(g('TB', ['A>C', 'B>D']), { rankGap: 4, nodeGap: 4, wrapAt: null }) as Placed
  const a = p.boxes.get('A')!, b = p.boxes.get('B')!
  const c = p.boxes.get('C')!, d = p.boxes.get('D')!
  const rs = routeGraph({ ...p, boxes: new Map(p.boxes).set('C', { ...c, col: b.col })
    .set('D', { ...d, col: a.col }) }) as Route[]
  assert.equal(rs.length, 2)
  const tracks = rs.map(r => r.cells.filter(c => c.dirs === 10).map(c => c.r))
  assert.ok(tracks.every(t => t.length > 0))
  assert.notEqual(tracks[0]![0], tracks[1]![0])
  for (const c of rs[0]!.cells) {
    const other = rs[1]!.cells.find(d => c.r === d.r && c.c === d.c)
    if (other) assert.deepEqual(new Set([c.dirs, other.dirs]), new Set([5, 10]))
  }
})

test('A1: routes are 4-connected and end in one allowed head', () => {
  const rs = R('TB', ['A>B', 'A>C', 'B>D', 'C>D'])
  assert.equal(rs.length, 4)
  for (const r of rs) {
    assert.ok(linked(r), r.edge)
    assert.deepEqual(r.ends.map(e => e.ch), ['▼'])
  }
  assert.deepEqual(R('LR', ['A>B'])[0]!.ends.map(e => e.ch), ['►'])
  for (const dir of ['TB', 'LR'] as const) {
    const r = R(dir, ['A>B'])[0]!, head = r.ends[0]!, last = r.cells.at(-1)!
    assert.equal(r.cells.length, 2)
    assert.ok(r.cells.every(c => c.dirs === (dir === 'TB' ? 5 : 10)))
    assert.equal(Math.abs(last.r - head.r) + Math.abs(last.c - head.c), 1)
  }
})
