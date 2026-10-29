import test from 'node:test'
import assert from 'node:assert/strict'
import { layoutGraph } from '../../core/graph/layered.ts'
import { routeGraph } from '../../core/graph/route.ts'
import { drawGraph } from '../../core/graph/draw.ts'
import { validate } from '../../core/validate.ts'
import { g } from './graph-fixture.ts'

function random(seed: number) {
  return (n: number) => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % n }
}
const classes = ['dag', 'mixed', 'clusters', 'loops'] as const
const ceilings = { dag: 5.8, mixed: 10.0, clusters: 17.4, loops: 14.6 }

function graphFor(kind: typeof classes[number], index: number, next: (n: number) => number) {
  const count = 2 + next(11), names = Array.from({ length: count }, (_, i) => `N${i}`)
  const specs: string[] = []
  const edge = (a: number, b: number) => {
    const style = kind === 'dag' ? '>' : ['>', '=>', '.>'][next(3)]!
    const label = kind !== 'dag' && next(10) < 3 ? `|${next(2) ? 'yes' : '成功'}` : ''
    specs.push(`${names[a]}${style}${names[b]}${label}`)
  }
  for (let i = 1; i < count; i++) edge(next(i), i)
  for (let i = 0; i < next(count); i++) {
    const a = next(count - 1), b = a + 1 + next(count - a - 1)
    const reverse = kind !== 'dag' && next(4) === 0
    edge(reverse ? b : a, reverse ? a : b)
  }
  if (kind === 'loops') { const n = next(count); edge(n, n) }
  const graph = g(['TB', 'BT', 'LR', 'RL'][index % 4] as 'TB', specs,
    kind === 'dag' ? {} : { N0: next(2) ? '读取<br/>配置' : 'start<br/>more' })
  if (kind === 'clusters') {
    graph.clusters = [{ id: 'S', title: next(2) ? '组' : null, dir: null,
      nodes: names.slice(next(count - 1), count - 1), clusters: [] }]
    for (const e of graph.edges) if (next(4) === 0) e.tail = ['arrow', 'circle', 'cross'][next(3)] as 'arrow'
  }
  return graph
}

test('A1: seeded router property covers 2000 graphs without invalid drawings', () => {
  const next = random(0x17a10), failures: string[] = [], rates: Record<string, number> = {}
  for (const kind of classes) {
    let conflicts = 0
    for (let i = 0; i < 500; i++) {
      const graph = graphFor(kind, i, next)
      const p = layoutGraph(graph, { rankGap: 3, nodeGap: 4, wrapAt: null })
      if ('reason' in p) { conflicts++; continue }
      const rs = routeGraph(p)
      if (!Array.isArray(rs)) { conflicts++; continue }
      const error = validate(drawGraph(p, rs, 10000))
      if (error) failures.push(`${kind}/${i}: ${error.reason} ${JSON.stringify(graph)}`)
      for (const r of rs) {
        for (const other of rs.slice(rs.indexOf(r) + 1)) {
          const otherCells = new Map(other.cells.map(c => [`${c.r},${c.c}`, c]))
          const shared = new Set<string>()
          for (let k = 0; k < Math.min(r.cells.length, other.cells.length); k++) {
            const a = r.cells[k]!, b = other.cells[k]!
            if (a.r !== b.r || a.c !== b.c) break
            shared.add(`${a.r},${a.c}`)
          }
          for (let k = 1; k <= Math.min(r.cells.length, other.cells.length); k++) {
            const a = r.cells.at(-k)!, b = other.cells.at(-k)!
            if (a.r !== b.r || a.c !== b.c) break
            shared.add(`${a.r},${a.c}`)
          }
          for (const a of r.cells) {
            const b = otherCells.get(`${a.r},${a.c}`)
            if (b && !shared.has(`${a.r},${a.c}`)) assert.ok(a.dirs === 5 && b.dirs === 10 || a.dirs === 10 && b.dirs === 5,
              `${kind}/${i}: unrelated shared run ${r.edge}/${other.edge}`)
          }
          const ownCells = new Set(r.cells.map(c => `${c.r},${c.c}`))
          assert.ok(r.ends.every(a => !otherCells.has(`${a.r},${a.c}`)))
          assert.ok(other.ends.every(a => !ownCells.has(`${a.r},${a.c}`)))
        }
        const e = p.graph.edges.find(e => e.id === r.edge)!
        assert.equal(r.ends.length, Number(e.tail !== 'none') + Number(e.head !== 'none'))
        const path = [...(e.tail === 'none' ? [] : [r.ends[0]!]), ...r.cells,
          ...(e.head === 'none' ? [] : [r.ends.at(-1)!])]
        const context = `${kind}/${i}/${e.id}`
        assert.equal(new Set(path.map(c => `${c.r},${c.c}`)).size, path.length, context)
        assert.ok(path.every((c, i) => i === 0 || Math.abs(c.r - path[i - 1]!.r) + Math.abs(c.c - path[i - 1]!.c) === 1), context)
        const a = p.boxes.get(e.from)!, b = p.boxes.get(e.to)!
        const distance = (c: { r: number; c: number }, b: typeof a) => Math.max(0,
          b.row - c.r, c.r - b.row - b.rows + 1, b.col - c.c, c.c - b.col - b.cols + 1)
        assert.equal(distance(path[0]!, a), 1, context)
        assert.equal(distance(path.at(-1)!, b), 1, context)
        let previous = -1
        const dummies = [...p.boxes].filter(([id]) => id.startsWith(`${e.id}#`))
          .sort((a, b) => Number(a[0].split('#').at(-1)) - Number(b[0].split('#').at(-1)))
        for (const [, b] of dummies) {
          const index = path.findIndex(c => c.r === b.row && c.c === b.col)
          assert.ok(index > previous, context)
          previous = index
        }
        const label = p.boxes.get(`${e.id}:label`)
        if (label) assert.ok(path.some(c => distance(c, label) === 1), context)
        for (const [id, b] of p.boxes) if (!id.startsWith(`${e.id}#`)) assert.ok(path.every(c => distance(c, b) > 0), context)
        assert.ok(r.cells.every(c => [3, 5, 6, 9, 10, 12].includes(c.dirs)), context)
      }
    }
    rates[kind] = conflicts / 5
    console.log(`conflicts ${kind}: ${rates[kind]!.toFixed(1)}%`)
    assert.ok(rates[kind]! <= ceilings[kind], `${kind} conflict rate regressed`)
  }
  assert.deepEqual(failures.slice(0, 3), [])
  assert.equal(Object.keys(rates).length, 4)
})
