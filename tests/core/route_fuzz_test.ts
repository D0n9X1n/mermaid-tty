import test from 'node:test'
import assert from 'node:assert/strict'
import { layoutGraph } from '../../core/graph/layered.ts'
import { routeGraph } from '../../core/graph/route.ts'
import { drawGraph } from '../../core/graph/draw.ts'
import { compact } from '../../core/graph/compact.ts'
import { validate } from '../../core/validate.ts'
import { falsePairs, g } from './graph-fixture.ts'

function random(seed: number) {
  return (n: number) => {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    return (seed >>> 0) % n
  }
}
const classes = ['dag', 'mixed', 'clusters', 'loops'] as const
// Strict clearance can require another spacing attempt; both rates have a two-point regression allowance.
const ceilings = { dag: 3.0, mixed: 6.2, clusters: 31.0, loops: 11.8 }
// clusters rose with V6 (raw 17.6 -> 22.0, retry 6.8 -> 11.6): each graph lost had an edge between nodes of its frame,
// most often a back edge on the outside lane, routed out of the frame and back, which validate rejects (edge-outside-frame).
// V8 won most back: a back edge between nodes of one open frame takes a lane inside it (raw 18.2, retry 7.4).
// clusters rose with edge-crosses-frame (2026-10-29; raw 18.2 -> 37.8, retry 7.4 -> 29.0): each graph lost had an edge
// that entered a frame holding neither of its ends, or crossed one more than once, which validate now rejects and the router
// now refuses. Routing such edges round the frame instead lowers these again.
const rawCeilings = { dag: 3.4, mixed: 15.0, clusters: 39.8, loops: 23.0 }

function graphFor(kind: (typeof classes)[number], index: number, next: (n: number) => number) {
  const count = 2 + next(11)
  const names = Array.from({ length: count }, (_, i) => `N${i}`)
  const specs: string[] = []
  const edge = (a: number, b: number) => {
    const style = kind === 'dag' ? '>' : ['>', '=>', '.>'][next(3)]!
    const label = kind !== 'dag' && next(10) < 3 ? `|${next(2) ? 'yes' : '成功'}` : ''
    specs.push(`${names[a]}${style}${names[b]}${label}`)
  }
  for (let i = 1; i < count; i++) {
    edge(next(i), i)
  }
  for (let i = 0; i < next(count); i++) {
    const a = next(count - 1)
    const b = a + 1 + next(count - a - 1)
    const reverse = kind !== 'dag' && next(4) === 0
    edge(reverse ? b : a, reverse ? a : b)
  }
  if (kind === 'loops') {
    const n = next(count)
    edge(n, n)
  }
  const graph = g(
    ['TB', 'BT', 'LR', 'RL'][index % 4] as 'TB',
    specs,
    kind === 'dag' ? {} : { N0: next(2) ? '读取<br/>配置' : 'start<br/>more' },
  )
  if (kind === 'clusters') {
    graph.clusters = [
      {
        id: 'S',
        title: next(2) ? '组' : null,
        dir: null,
        nodes: names.slice(next(count - 1), count - 1),
        clusters: [],
      },
    ]
    for (const e of graph.edges) {
      if (next(4) === 0) {
        e.tail = ['arrow', 'circle', 'cross'][next(3)] as 'arrow'
      }
    }
  }
  return graph
}

test('A1: seeded router property covers 2000 graphs without invalid drawings', () => {
  const next = random(0x17a10)
  const failures: string[] = []
  const rates: Record<string, number> = {}
  for (const kind of classes) {
    let conflicts = 0
    let raw = 0
    for (let i = 0; i < 500; i++) {
      const graph = graphFor(kind, i, next)
      let p = layoutGraph(graph, { rankGap: 3, nodeGap: 4, wrapAt: null })
      if ('reason' in p) {
        conflicts++
        raw++
        continue
      }
      let rs = routeGraph(p)
      if (!Array.isArray(rs)) {
        raw++
      }
      for (const extra of [2, 4]) {
        if (Array.isArray(rs) || rs.reason !== 'route-conflict') {
          break
        }
        const placed = layoutGraph(graph, { rankGap: 3 + extra, nodeGap: 4 + extra, wrapAt: null })
        if ('reason' in placed) {
          break
        }
        p = placed
        rs = routeGraph(p)
      }
      if (!Array.isArray(rs)) {
        conflicts++
        continue
      }
      // At layout coordinates, where the routes' cells are; compacted, as shown, it must validate too.
      const drawing = drawGraph(p, rs, 10000, (x) => x)
      const error = validate(drawing) ?? validate(compact(drawing))
      if (error) {
        failures.push(`${kind}/${i}: ${error.reason} ${JSON.stringify(graph)}`)
      }
      assert.deepEqual(falsePairs(drawing), [], `${kind}/${i} false implied pair`)
      assert.deepEqual(falsePairs(compact(drawing)), [], `${kind}/${i} compacted false implied pair`)
      for (const r of rs) {
        const loop = p.graph.edges.find((e) => e.id === r.edge)!
        if (loop.from === loop.to) {
          for (const c of r.cells) {
            const owners = drawing.cells[c.r]![c.c]!.segs ?? []
            if (drawing.cells[c.r]![c.c]!.dirs === 15 && owners.length > 1) {
              assert.ok(
                owners.every((s) => s.dirs === 5 || s.dirs === 10),
                `${kind}/${i} self-loop crossing`,
              )
            }
          }
        }
        for (const other of rs.slice(rs.indexOf(r) + 1)) {
          const otherCells = new Map(other.cells.map((c) => [`${c.r},${c.c}`, c]))
          const shared = new Set<string>()
          for (let k = 0; k < Math.min(r.cells.length, other.cells.length); k++) {
            const a = r.cells[k]!
            const b = other.cells[k]!
            if (a.r !== b.r || a.c !== b.c) {
              break
            }
            shared.add(`${a.r},${a.c}`)
          }
          for (let k = 1; k <= Math.min(r.cells.length, other.cells.length); k++) {
            const a = r.cells.at(-k)!
            const b = other.cells.at(-k)!
            if (a.r !== b.r || a.c !== b.c) {
              break
            }
            shared.add(`${a.r},${a.c}`)
          }
          for (const a of r.cells) {
            const b = otherCells.get(`${a.r},${a.c}`)
            if (b && !shared.has(`${a.r},${a.c}`)) {
              assert.ok(
                (a.dirs === 5 && b.dirs === 10) || (a.dirs === 10 && b.dirs === 5),
                `${kind}/${i}: unrelated shared run ${r.edge}/${other.edge}`,
              )
            }
          }
          const ownCells = new Set(r.cells.map((c) => `${c.r},${c.c}`))
          assert.ok(r.ends.every((a) => !otherCells.has(`${a.r},${a.c}`)))
          assert.ok(other.ends.every((a) => !ownCells.has(`${a.r},${a.c}`)))
        }
        const e = p.graph.edges.find((e) => e.id === r.edge)!
        assert.equal(r.ends.length, Number(e.tail !== 'none') + Number(e.head !== 'none'))
        const drawnPath = [
          ...(e.tail === 'none' ? [] : [r.ends[0]!]),
          ...r.cells,
          ...(e.head === 'none' ? [] : [r.ends.at(-1)!]),
        ]
        const label = p.boxes.get(`${e.id}:label`)
        const path: { r: number; c: number }[] = []
        for (const c of drawnPath) {
          const previous = path.at(-1)
          if (label && previous && (previous.c === c.c || previous.r === c.r)) {
            const distance = Math.abs(c.r - previous.r) + Math.abs(c.c - previous.c)
            const dr = Math.sign(c.r - previous.r)
            const dc = Math.sign(c.c - previous.c)
            for (let k = 1; k < distance; k++) {
              const row = previous.r + dr * k
              const col = previous.c + dc * k
              assert.ok(
                row >= label.row && row < label.row + label.rows && col >= label.col && col < label.col + label.cols,
              )
              path.push({ r: row, c: col })
            }
          }
          path.push(c)
        }
        const context = `${kind}/${i}/${e.id}`
        assert.equal(new Set(path.map((c) => `${c.r},${c.c}`)).size, path.length, context)
        assert.ok(
          path.every((c, i) => i === 0 || Math.abs(c.r - path[i - 1]!.r) + Math.abs(c.c - path[i - 1]!.c) === 1),
          context,
        )
        const a = p.boxes.get(e.from)!
        const b = p.boxes.get(e.to)!
        const distance = (c: { r: number; c: number }, b: typeof a) =>
          Math.max(0, b.row - c.r, c.r - b.row - b.rows + 1, b.col - c.c, c.c - b.col - b.cols + 1)
        assert.equal(distance(path[0]!, a), 1, context)
        assert.equal(distance(path.at(-1)!, b), 1, context)
        let previous = -1
        const dummies = [...p.boxes]
          .filter(([id]) => !e.reversed && id.startsWith(`${e.id}#`))
          .sort((a, b) => Number(a[0].split('#').at(-1)) - Number(b[0].split('#').at(-1)))
        for (const [, b] of dummies) {
          const index = path.findIndex((c) => c.r === b.row && c.c === b.col)
          assert.ok(index > previous, context)
          previous = index
        }
        if (label) {
          assert.ok(
            drawnPath.some((c) => distance(c, label) === 1),
            context,
          )
        }
        for (const [id, b] of p.boxes) {
          if (!id.startsWith(`${e.id}#`) && id !== `${e.id}:label`) {
            assert.ok(
              drawnPath.every((c) => distance(c, b) > 0),
              context,
            )
          }
        }
        assert.ok(
          r.cells.every((c) => drawing.cells[c.r]![c.c]!.kind === 'line'),
          context,
        )
        assert.ok(
          r.cells.every((c) => [3, 5, 6, 9, 10, 12].includes(c.dirs)),
          context,
        )
      }
    }
    rates[kind] = conflicts / 5
    console.log(`conflicts ${kind}: raw ${(raw / 5).toFixed(1)}%, retry ${rates[kind]!.toFixed(1)}%`)
    assert.ok(raw / 5 <= rawCeilings[kind], `${kind} raw conflict rate regressed`)
    assert.ok(rates[kind]! <= ceilings[kind], `${kind} conflict rate regressed`)
  }
  assert.deepEqual(failures.slice(0, 3), [])
  assert.equal(Object.keys(rates).length, 4)
})
