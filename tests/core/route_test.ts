import test from 'node:test'
import assert from 'node:assert/strict'
import { layoutGraph } from '../../core/graph/layered.ts'
import type { Placed } from '../../core/graph/layered.ts'
import { routeGraph } from '../../core/graph/route.ts'
import type { Route } from '../../core/graph/route.ts'
import { g } from './graph-fixture.ts'
import { drawGraph } from '../../core/graph/draw.ts'
import { validate } from '../../core/validate.ts'
import { explain } from '../../core/render.ts'

const R = (dir: 'TB' | 'LR', e: string[]) => routeGraph(layoutGraph(g(dir, e), {
  rankGap: 3, nodeGap: 4, wrapAt: null,
}) as Placed) as Route[]
const linked = (r: Route, p?: Placed) => r.cells.every((c, i) => {
  if (!i) return true
  const a = r.cells[i - 1]!, distance = Math.abs(c.r - a.r) + Math.abs(c.c - a.c)
  if (distance === 1) return true
  const b = p?.boxes.get(`${r.edge}:label`)
  if (!b || c.c !== a.c && c.r !== a.r) return false
  const dr = Math.sign(c.r - a.r), dc = Math.sign(c.c - a.c)
  for (let k = 1; k < distance; k++) {
    const row = a.r + dr * k, col = a.c + dc * k
    if (row < b.row || row >= b.row + b.rows || col < b.col || col >= b.col + b.cols) return false
  }
  return true
})
const at = (r: Route) => new Set(r.cells.map(c => `${c.r},${c.c}`))

test('A1: R2 every owner stays straight where unrelated edges cross', () => {
  const p = layoutGraph(g('TB', ['A>B', 'B>D', 'B>E', 'E>E', 'C>D']), {
    rankGap: 3, nodeGap: 4, wrapAt: null,
  }) as Placed
  const rs = routeGraph(p)
  assert.ok(Array.isArray(rs))
  assert.equal(validate(drawGraph(p, rs, 120)), null)
  const spots = new Map<string, { edge: string; dirs: number }[]>()
  for (const r of rs) for (const c of r.cells) {
    const key = `${c.r},${c.c}`
    spots.set(key, [...(spots.get(key) ?? []), { edge: r.edge, dirs: c.dirs }])
  }
  for (const owners of spots.values()) {
    const unrelated = owners.some(a => owners.some(b => {
      const x = p.graph.edges.find(e => e.id === a.edge)!, y = p.graph.edges.find(e => e.id === b.edge)!
      return ![x.from, x.to].some(id => id === y.from || id === y.to)
    }))
    if (unrelated) assert.ok(owners.every(c => c.dirs === 5 || c.dirs === 10))
  }
})

test('A1: R2 horizontal label waypoints use geometry when the middle line is blank', () => {
  for (const dir of ['LR', 'RL'] as const) {
    const p = layoutGraph(g(dir, ['A>A|one<br/><br/>two']), { rankGap: 3, nodeGap: 4, wrapAt: null }) as Placed
    const rs = routeGraph(p)
    assert.ok(Array.isArray(rs))
    const b = p.boxes.get('e0:label')!
    assert.ok(rs[0]!.cells.some(c => c.r === b.row + 1 && c.c === b.col + (b.cols >> 1)))
    assert.equal(validate(drawGraph(p, rs, 120)), null)
  }
})

test('A1: R2 an outside head never crosses a line on its own in-stem', () => {
  const p = layoutGraph(g('LR', ['N0>N1', 'N1=>N2', 'N1>N3', 'N1>N4', 'N4>N5|yes', 'N5=>N6',
    'N4.>N7', 'N3.>N7', 'N3.>N7', 'N3.>N1', 'N4.>N2'], { N0: '读取<br/>配置' }), {
    rankGap: 5, nodeGap: 6, wrapAt: null,
  }) as Placed
  const rs = routeGraph(p)
  if (!Array.isArray(rs)) { assert.equal(rs.reason, 'route-conflict'); return }
  assert.equal(validate(drawGraph(p, rs, 120)), null)
})

test('A1: Q1 outside lanes are deterministic when routing the same placement twice', () => {
  const p = layoutGraph(g('TB', ['A>B', 'B>C', 'C>A']), { rankGap: 3, nodeGap: 4, wrapAt: null }) as Placed
  const first = routeGraph(p)
  assert.ok(Array.isArray(first))
  const extent = [p.rows, p.cols]
  assert.deepEqual(routeGraph(p), first)
  assert.deepEqual([p.rows, p.cols], extent)
})

test('A1: shared end groups never hide arrow-on-bend conflicts', () => {
  const graph = g('TB', ['A>E', 'A>E'])
  graph.edges[0]!.tail = 'arrow'
  const p = layoutGraph(graph, { rankGap: 3, nodeGap: 4, wrapAt: null }) as Placed
  const rs = routeGraph(p)
  if (!Array.isArray(rs)) { assert.equal(rs.reason, 'route-conflict'); return }
  for (const r of rs) for (const other of rs.filter(s => s !== r)) {
    assert.ok(r.ends.every(h => !at(other).has(`${h.r},${h.c}`)))
  }
  assert.equal(validate(drawGraph(p, rs, 120)), null)
})

test('A1: even-width faces allocate distinct ports to every group', () => {
  const graph = g('LR', ['C>D', 'C>E'], { C: 'C<br/>more' })
  graph.edges[0]!.tail = 'arrow'
  const p = layoutGraph(graph, { rankGap: 8, nodeGap: 4, wrapAt: null }) as Placed
  const rs = routeGraph(p)
  assert.ok(Array.isArray(rs))
  assert.notEqual(rs[0]!.ends[0]!.r, rs[1]!.cells[0]!.r)
  assert.equal(rs[0]!.ends[0]!.c, rs[1]!.cells[0]!.c)
  assert.equal(validate(drawGraph(p, rs, 120)), null)
  const repro = g('LR', ['C>D|no way', 'C>D'], { C: 'C<br/>more' })
  repro.edges[0]!.tail = 'arrow'
  const q = layoutGraph(repro, { rankGap: 3, nodeGap: 4, wrapAt: null }) as Placed
  const routes = routeGraph(q)
  assert.ok(!Array.isArray(routes) || routes[0]!.ends[0]!.r !== routes[1]!.cells[0]!.r)
})

test('A1: side-entry splices never retrace a cell or create a one-arm spur', () => {
  const graph = g('BT', ['B>A'], { B: 'B long name' })
  graph.edges[0]!.tail = 'arrow'
  graph.clusters = [
    { id: 'S1', nodes: ['B'], title: null, dir: null, clusters: [] },
    { id: 'S3', nodes: ['A'], title: 'a much longer title', dir: null, clusters: [] },
  ]
  const p = layoutGraph(graph, { rankGap: 3, nodeGap: 4, wrapAt: null }) as Placed
  const rs = routeGraph(p)
  if (!Array.isArray(rs)) { assert.equal(rs.reason, 'route-conflict'); return }
  assert.equal(at(rs[0]!).size, rs[0]!.cells.length)
  assert.ok(rs[0]!.cells.every(c => [3, 5, 6, 9, 10, 12].includes(c.dirs)))
  assert.equal(validate(drawGraph(p, rs, 120)), null)
})

test('A1: side-entry splices preserve all dummy and label waypoints in order', () => {
  const graph = g('TB', ['D>E', 'B>E'])
  Object.assign(graph.edges[1]!, { tail: 'arrow', minlen: 3 })
  graph.clusters = [{ id: 'S2', nodes: ['B'], title: null, dir: null, clusters: [] }]
  const p = layoutGraph(graph, { rankGap: 3, nodeGap: 4, wrapAt: null }) as Placed
  const rs = routeGraph(p)
  if (!Array.isArray(rs)) { assert.equal(rs.reason, 'route-conflict'); return }
  const r = rs.find(r => r.edge === 'e1')!, waypoints = [...p.boxes].filter(([id]) => id.startsWith('e1#'))
    .sort((a, b) => a[1].row - b[1].row)
  let previous = -1
  for (const [, b] of waypoints) {
    const index = r.cells.findIndex(c => c.r === b.row && c.c === b.col)
    assert.ok(index > previous)
    previous = index
  }
  assert.equal(validate(drawGraph(p, rs, 120)), null)
})

test('A1: related routes cannot put a junction behind another head', () => {
  const graph = g('TB', ['A>B', 'A>C'])
  const p: Placed = { graph, frames: new Map(), rows: 9, cols: 14, boxes: new Map([
    ['A', { row: 0, col: 5, rows: 1, cols: 5 }], ['B', { row: 5, col: 5, rows: 1, cols: 5 }],
    ['C', { row: 8, col: 0, rows: 1, cols: 5 }],
  ]), bands: [{ block: null, axis: 'row', from: 0, to: 2 }, { block: null, axis: 'row', from: 7, to: 8 }] }
  const result = routeGraph(p)
  if (!Array.isArray(result)) { assert.equal(result.reason, 'route-conflict'); return }
  assert.equal(validate(drawGraph(p, result, 120)), null)
})

test('A1: labelled forks, horizontal cycles, mixed styles and self-loops render', () => {
  for (const [dir, specs] of [
    ['TB', ['A>B|yes', 'A>C|no']], ['LR', ['A>B', 'B>A']],
    ['TB', ['A=>B', 'A>C']], ['TB', ['A>A']],
  ] as const) {
    const p = layoutGraph(g(dir, [...specs]), { rankGap: 3, nodeGap: 4, wrapAt: null }) as Placed
    const before = [...p.boxes].map(([id, b]) => [id, { ...b }])
    const rs = routeGraph(p)
    assert.ok(Array.isArray(rs), `${dir} ${specs}`)
    assert.equal(validate(drawGraph(p, rs, 80)), null, `${dir} ${specs}`)
    assert.equal(validate(drawGraph(p, rs, 120)), null, `${dir} ${specs}`)
    assert.deepEqual([...p.boxes], before)
    for (const r of rs) { assert.ok(linked(r, p)); assert.equal(at(r).size, r.cells.length) }
  }
})

test('A1: aligned one-to-one chains use centered straight ports', () => {
  const graph = g('TB', ['A>B', 'B>C'])
  graph.clusters = [{ id: 'S', title: '处理', dir: null, nodes: ['A', 'B'], clusters: [] }]
  const p = layoutGraph(graph, { rankGap: 3, nodeGap: 4, wrapAt: null }) as Placed
  const rs = routeGraph(p)
  assert.ok(Array.isArray(rs))
  for (const r of rs) assert.ok(r.cells.every(c => c.dirs === 5))
  assert.equal(validate(drawGraph(p, rs, 80)), null)
})

test('A1: one-column offsets keep the head aligned with the source port', () => {
  const p = layoutGraph(g('TB', ['A>B']), { rankGap: 3, nodeGap: 4, wrapAt: null }) as Placed
  const b = p.boxes.get('B')!
  const q = { ...p, cols: p.cols + 1, boxes: new Map(p.boxes).set('B', { ...b, col: b.col + 1 }) }
  const rs = routeGraph(q)
  assert.ok(Array.isArray(rs))
  assert.ok(rs[0]!.cells.every(c => c.dirs === 5))
  assert.equal(rs[0]!.cells[0]!.c, rs[0]!.ends[0]!.c)
})

test('A1: CJK labelled LR branches render without switching direction', () => {
  const source = 'flowchart LR\nA[读取配置] --> B{有效?}\nB -->|是| C[启动]\nB -->|否| D[报错]'
  const result = explain(source, { columns: 80 })
  assert.ok(!('reason' in result))
  assert.ok(result.step === 'natural' || result.step === 'tight')
  assert.equal(validate(result.drawing), null)
})

test('A1: mixed back-directed labels route without channel conflicts', () => {
  const graph = g('BT', ['N0>N1', 'N0>N2', 'N0.>N3', 'N1.>N4', 'N4>N5', 'N1>N6', 'N4.>N6|成功', 'N0=>N6|成功'],
    { N0: '读取<br/>配置' })
  const p = layoutGraph(graph, { rankGap: 3, nodeGap: 4, wrapAt: null }) as Placed
  const rs = routeGraph(p)
  assert.ok(Array.isArray(rs))
  assert.equal(validate(drawGraph(p, rs, 120)), null)
})

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

test('A1: labelled edges join through their label without overwriting its text', () => {
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
    const d = drawGraph(p, rs, 120, x => x)                // at layout coordinates, where the route's cells are
    assert.ok(r.cells.every(c => !['text', 'cont'].includes(d.cells[c.r]![c.c]!.kind)))
    assert.ok(linked(r, p))
    assert.equal(validate(d), null)
  }
})

test('A1: a back-edge head points at its real target after a straight in-stem', () => {
  const p = layoutGraph(g('TB', ['A>B|yes', 'A>C', 'C>D', 'D>A']), {
    rankGap: 3, nodeGap: 4, wrapAt: null,
  }) as Placed
  const rs = routeGraph(p)
  assert.ok(Array.isArray(rs))
  const r = rs.find(r => r.edge === 'e3')!, a = p.boxes.get('A')!, h = r.ends[0]!
  assert.equal(h.ch, '◄')
  assert.equal(h.c, a.col + a.cols)
  assert.ok(h.r >= a.row && h.r < a.row + a.rows)
  assert.ok(linked(r))
  const stem = r.cells.find(c => c.r === h.r && c.c === h.c + 1)
  assert.equal(stem?.dirs, 10)
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
  assert.ok([5, 10].includes(rs[0]!.cells.at(-1)!.dirs))
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
  if (Array.isArray(free)) assert.equal(free.find(r => r.edge === 'e2')!.ends[0]!.ch, '►')
  else assert.equal(free.reason, 'route-conflict') // The remaining obstacle's clearance can also block the connector.
})

test('A1: distinct port groups cannot occupy the same face cell', () => {
  const p = layoutGraph(g('LR', ['A>B', 'A=>C']), { rankGap: 5, nodeGap: 4, wrapAt: null }) as Placed
  const rs = routeGraph(p)
  if (!Array.isArray(rs)) { assert.equal(rs.reason, 'route-conflict'); return }
  assert.notDeepEqual(rs[0]!.cells[0], rs[1]!.cells[0])
  assert.equal(validate(drawGraph(p, rs, 120)), null)
})

test('A1: unrelated routes cannot share a one-cell obstacle passage', () => {
  const p = layoutGraph(g('TB', ['A>C', 'B>D']), { rankGap: 8, nodeGap: 4, wrapAt: null }) as Placed
  const boxes = new Map(p.boxes).set('left-wall', { row: 4, col: 0, rows: 1, cols: 2 })
    .set('right-wall', { row: 4, col: 3, rows: 1, cols: p.cols - 3 })
  const q = { ...p, boxes }, rs = routeGraph(q)
  if (!Array.isArray(rs)) { assert.equal(rs.reason, 'route-conflict'); return }
  assert.equal(validate(drawGraph(q, rs, 120)), null)
  assert.ok(![...at(rs[0]!)].some(k => at(rs[1]!).has(k)))
})

test('A1: obstacle detours preserve mandatory dummy waypoints', () => {
  const p = layoutGraph(g('TB', ['A>B', 'B>C', 'C>D', 'A>D']), {
    rankGap: 4, nodeGap: 4, wrapAt: null,
  }) as Placed
  const d = p.boxes.get('e3#1')!
  const boxes = new Map(p.boxes).set('obstacle', { row: d.row - 2, col: d.col, rows: 1, cols: 1 })
  const rs = routeGraph({ ...p, boxes })
  if (!Array.isArray(rs)) { assert.equal(rs.reason, 'route-conflict'); return }
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
  const rs = routeGraph(p)
  if (!Array.isArray(rs)) { assert.equal(rs.reason, 'route-conflict'); return }
  for (const r of rs) for (const h of r.ends) {
    const stem = r.cells.find(c => Math.abs(c.r - h.r) + Math.abs(c.c - h.c) === 1)!
    const dirs = rs.flatMap(s => s.cells).filter(c => c.r === stem.r && c.c === stem.c).reduce((d, c) => d | c.dirs, 0)
    assert.ok([5, 10].includes(dirs))
  }
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
