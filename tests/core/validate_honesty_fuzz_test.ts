// A cell-level honesty fuzz. Each seeded graph the pipeline draws and the validator passes is read back from its cells
// alone, by a checker that shares no code with core/validate.ts: (i) each edge's own cells form one simple path from beside
// its from node to its head or heads, (ii) where two edges that share no endpoint meet in a line cell, every edge there runs
// straight through it, (iii) every arrow cell is owned only by edges that end there, and (iv) lines that join imply no edge
// the source does not have.
import test from 'node:test'; import assert from 'node:assert/strict'
import type { Cell, Drawing } from '../../core/canvas.ts'
import { drawGraph } from '../../core/graph/draw.ts'; import { layoutGraph } from '../../core/graph/layered.ts'; import { routeGraph } from '../../core/graph/route.ts'
import { compact } from '../../core/graph/compact.ts'
import type { End, Graph } from '../../core/graph/model.ts'
import { validate } from '../../core/validate.ts'
import { falsePairs as drawnFalsePairs, g } from './graph-fixture.ts'

// xorshift32 from a fixed seed: next(n) is an integer in [0, n).
function random(seed: number) { return (n: number) => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % n } }
function pick<T>(next: (n: number) => number, xs: readonly T[]): T { return xs[next(xs.length)]! }

// Graph i: TB or LR, 2–9 nodes, a spanning tree, then up to count extra edges, each a forward edge, a back edge to the
// parent or the root, a repeat of an earlier pair, or a self-loop. A quarter of the edges are labelled; some ends are
// circles, crosses, open or two-headed; some nodes have two-line or wide labels; a third of the graphs frame a run of nodes.
function graphFor(i: number, next: (n: number) => number): Graph {
  const count = 2 + next(8), name = (k: number) => `N${k}`, parent = [0], pairs: [number, number][] = [], specs: string[] = []
  const edge = (a: number, b: number) => {
    pairs.push([a, b])
    specs.push(`${name(a)}${pick(next, ['>', '=>', '.>'])}${name(b)}${next(4) === 0 ? `|${pick(next, ['yes', '成功', 'a long label'])}` : ''}`)
  }
  for (let k = 1; k < count; k++) { parent.push(next(k)); edge(parent[k]!, k) }
  for (let n = next(count + 1); n > 0; n--) {
    const a = next(count), b = next(count), kind = next(4)
    if (kind === 0) edge(Math.min(a, b), Math.max(a, b))
    else if (kind === 1 && a > 0) edge(a, next(2) ? parent[a]! : 0)
    else if (kind === 2) edge(...pick(next, pairs))
    else edge(a, a)
  }
  const labels: Record<string, string> = {}
  for (let k = 0; k < count; k++) if (next(5) === 0) labels[name(k)] = pick(next, ['two<br/>lines', '读取配置', 'a wider node'])
  const graph = g(i % 2 ? 'LR' : 'TB', specs, labels)
  for (const e of graph.edges) {
    if (next(6) === 0) e.tail = pick<End>(next, ['arrow', 'circle', 'cross'])
    if (next(8) === 0) e.head = pick<End>(next, ['none', 'circle', 'cross'])
  }
  if (next(3) === 0) {
    const lo = next(count), hi = lo + 1 + next(count - lo)
    graph.clusters = [{ id: 'S', title: next(2) ? '组' : null, dir: null, nodes: Array.from({ length: hi - lo }, (_, k) => name(lo + k)), clusters: [] }]
  }
  return graph
}

// The pipeline at explain's natural step, rankGap 3, nodeGap 4 and no wrap, on a grid wide enough that no row fails; null
// if it cannot draw. Retrying a route conflict wider, as A1 does, would cost more time than it adds drawings. finish is
// drawGraph's, compact unless given.
function drawn(graph: Graph, finish?: (d: Drawing) => Drawing): Drawing | null {
  const p = layoutGraph(graph, { rankGap: 3, nodeGap: 4, wrapAt: null })
  if ('reason' in p) return null
  const routes = routeGraph(p)
  return Array.isArray(routes) ? drawGraph(p, routes, 10000, finish) : null
}

// An edge as the source graph declares it, before the layout reverses a back edge.
type Src = { id: string; from: string; to: string; tail: End; head: End }
type Spot = { r: number; c: number; cell: Cell }
// Each side as [its dirs bit, the bit of the side facing back, row step, column step]: up, right, down, left.
const SIDES = [[1, 4, -1, 0], [2, 8, 0, 1], [4, 1, 1, 0], [8, 2, 0, -1]] as const
// The side each pointed head glyph points at, and the end kind a head glyph draws.
const POINTS: Readonly<Record<string, number>> = { '▲': 0, '►': 1, '▼': 2, '◄': 3 }
const kindOf = (ch: string): End => (ch in POINTS ? 'arrow' : ch === 'o' ? 'circle' : ch === 'x' ? 'cross' : 'none')

// e's cells as a graph. A vertex is a line or arrow cell of e. A link joins two lines of e whose dirs point at each other,
// or a line of e and an arrow of e it points at, next to each other or across e's own label, which a route runs straight
// through. An end is a line's arm into a cell of e's from or to node, F, T or FT, or an arrow's point at one; o and x point
// at whichever side touches one. A side is an index into SIDES, or -1 on an arrow, which has no dirs.
type Vertex = { arrow: string | null; links: { to: string; side: number }[]; ends: { at: string; side: number }[] }
function graphOf(d: Drawing, e: Src, mine: readonly Spot[]): Map<string, Vertex> {
  const key = (r: number, c: number) => `${r},${c}`, at = (r: number, c: number) => d.cells[r]?.[c] ?? null
  const label = `${e.id}:label`, isLabel = (x: Cell | null) => (x?.kind === 'text' || x?.kind === 'cont') && x.owners[0] === label
  const endOf = (x: Cell | null) => (x?.owners.includes(e.from) ? 'F' : '') + (x?.owners.includes(e.to) ? 'T' : '')
  const byPos = new Map(mine.map(p => [key(p.r, p.c), p]))
  const verts = new Map(mine.map(p => [key(p.r, p.c), { arrow: p.cell.kind === 'arrow' ? p.cell.ch : null, links: [], ends: [] } as Vertex]))
  const link = (a: string, sa: number, b: string, sb: number) => { verts.get(a)!.links.push({ to: b, side: sa }); verts.get(b)!.links.push({ to: a, side: sb }) }
  for (const p of mine) {
    const k = key(p.r, p.c), v = verts.get(k)!, step = (s: number, n: number) => at(p.r + SIDES[s]![2] * n, p.c + SIDES[s]![3] * n)
    if (p.cell.kind === 'arrow') {
      const face = POINTS[p.cell.ch] ?? [0, 1, 2, 3].find(s => endOf(step(s, 1)) !== '') ?? -1
      if (face >= 0 && endOf(step(face, 1)) !== '') v.ends.push({ at: endOf(step(face, 1)), side: face })
      continue
    }
    SIDES.forEach(([bit, back, dr, dc], s) => {
      if ((p.cell.dirs & bit) === 0) return
      let n = 1
      while (isLabel(step(s, n))) n++                              // past e's own label, straight on
      const q = byPos.get(key(p.r + dr * n, p.c + dc * n))
      if (q?.cell.kind === 'line' && (q.cell.dirs & back) !== 0) { if (s === 1 || s === 2) link(k, s, key(q.r, q.c), (s + 2) % 4) }
      else if (q?.cell.kind === 'arrow') link(k, s, key(q.r, q.c), -1)
      else if (endOf(step(s, 1)) !== '') v.ends.push({ at: endOf(step(s, 1)), side: s })
    })
  }
  return verts
}

// One simple path through all of e's vertices: from e's from node, through its tail glyph if it has one, to its to node,
// through its head glyph if it has one, with arrows only at its ends. Each vertex's sides on it as dirs bits, or null if
// there is none. A shared cell's dirs may hold arms of other edges, so the search tries each way on.
function pathOf(e: Src, verts: ReadonlyMap<string, Vertex>): Map<string, number> | null {
  const bit = (s: number) => (s >= 0 ? SIDES[s]![0] : 0)
  const fits = (v: Vertex, end: End, at: string) =>
    (end === 'none' ? v.arrow === null : v.arrow !== null && kindOf(v.arrow) === end) && v.ends.some(x => x.at.includes(at))
  const used = new Map<string, number>(), seen = new Set<string>()
  let budget = 100_000
  // Extends the path at k, entered on side s, until it holds every vertex and leaves its last for T.
  const go = (k: string, s: number): boolean => {
    const v = verts.get(k)!
    if (--budget < 0) return false
    if (seen.size === verts.size) {
      const out = fits(v, e.head, 'T') ? v.ends.find(x => x.at.includes('T') && (seen.size > 1 || x.side !== s)) : undefined
      if (out) used.set(k, bit(s) | bit(out.side))
      return out !== undefined
    }
    if (v.arrow !== null && seen.size > 1) return false
    for (const l of v.links) {
      if (seen.has(l.to)) continue
      seen.add(l.to); used.set(k, bit(s) | bit(l.side))
      if (go(l.to, verts.get(l.to)!.links.find(x => x.to === k)?.side ?? -1)) return true
      seen.delete(l.to)
    }
    return false
  }
  for (const [k, v] of verts) {
    if (!fits(v, e.tail, 'F')) continue
    for (const x of v.ends.filter(x => x.at.includes('F'))) { seen.clear(); seen.add(k); used.clear(); if (go(k, x.side)) return used }
  }
  return null
}

// (iv) Lines that join read as one line, so each end drawn with no mark seems to lead to each node a mark on it points at.
// Two edges join in a cell both own: an arrow; or a line, as its glyph shows, unless the glyph is ┼ and every edge there runs
// straight through it by the sides its own path uses, when only edges on one axis join. An edge with no path runs no way
// straight, so it joins every edge it shares a cell with. Each seeming pair of one edge's unmarked end t and another edge's
// mark at h, h = t included, must be a source edge t to h, or one h to t whose tail at t is marked, so drawn from t to h.
function falsePairs(src: readonly Src[], cells: ReadonlyMap<string, Spot[]>, paths: ReadonlyMap<string, Map<string, number> | null>): string[] {
  const here = new Map<string, [Src, Spot][]>(), near = new Map(src.map(e => [e.id, new Set<string>()]))
  for (const e of src) for (const p of cells.get(e.id)!) {
    const k = `${p.r},${p.c}`
    if (!here.has(k)) here.set(k, [])
    here.get(k)!.push([e, p])
  }
  const side = (e: Src, k: string) => paths.get(e.id)?.get(k)
  for (const [k, list] of here) {
    const cell = list[0]![1].cell, through = cell.dirs === 15 && list.every(([e]) => side(e, k) === 5 || side(e, k) === 10)
    for (const [a] of list) for (const [b] of list) {
      if (a !== b && (cell.kind === 'arrow' || !through || side(a, k) === side(b, k))) near.get(a.id)!.add(b.id)
    }
  }
  const real = (t: string, h: string) => src.some(e => (e.from === t && e.to === h) || (e.from === h && e.to === t && e.tail !== 'none'))
  const ends = (x: Src, marked: boolean) => [[x.from, x.tail], [x.to, x.head]].filter(([, k]) => (k !== 'none') === marked).map(([n]) => n!)
  const seen = new Set<string>(), out: string[] = []
  for (const e of src) {
    if (seen.has(e.id)) continue
    const group = [e]; seen.add(e.id)
    for (const x of group) for (const id of near.get(x.id)!) if (!seen.has(id)) { seen.add(id); group.push(src.find(s => s.id === id)!) }
    for (const a of group) for (const b of group) if (a !== b) for (const t of ends(a, false)) for (const h of ends(b, true)) {
      if (!real(t, h)) out.push(`(iv) ${t} seems to lead to ${h} on the line of ${group.map(x => x.id).join(' ')}`)
    }
  }
  return out
}

// Each way d's cells mislead about src's edges: (i) an edge that is not one simple path between its ends, (ii) an edge that
// turns in a line cell where two unrelated edges meet, (iii) an arrow cell owned by an edge that does not end there, (iv) a
// merged line that seems to draw an edge src does not have.
function honesty(d: Drawing, src: readonly Src[]): string[] {
  const byId = new Map(src.map(e => [e.id, e])), cells = new Map(src.map(e => [e.id, [] as Spot[]]))
  const lines: Spot[] = [], arrows: Spot[] = [], out: string[] = []
  d.cells.forEach((row, r) => row.forEach((cell, c) => {
    if (cell?.kind !== 'line' && cell?.kind !== 'arrow') return
    const p = { r, c, cell }
    for (const o of cell.owners) cells.get(o)?.push(p)
    if (cell.kind === 'line') lines.push(p)
    else arrows.push(p)
  }))
  const graphs = new Map(src.map(e => [e.id, graphOf(d, e, cells.get(e.id)!)]))
  const paths = new Map(src.map(e => [e.id, pathOf(e, graphs.get(e.id)!)]))
  for (const e of src) if (!paths.get(e.id)) out.push(`(i) ${e.id} is not one simple path from ${e.from} to ${e.to}`)
  const related = (a: Src, b: Src) => [a.from, a.to].some(x => x === b.from || x === b.to)
  for (const p of lines) {
    const mine = p.cell.owners.flatMap(o => byId.get(o) ?? [])
    if (!mine.some((a, i) => mine.slice(i + 1).some(b => !related(a, b)))) continue
    for (const e of mine) {
      const s = paths.get(e.id)?.get(`${p.r},${p.c}`)
      if (s !== undefined && s !== 5 && s !== 10) out.push(`(ii) ${e.id} turns at ${p.r},${p.c} among unrelated edges`)
    }
  }
  for (const p of arrows) for (const o of p.cell.owners) {
    if (!graphs.get(o)?.get(`${p.r},${p.c}`)?.ends.length) out.push(`(iii) ${o} owns the arrow at ${p.r},${p.c} but does not end there`)
  }
  out.push(...falsePairs(src, cells, paths))
  return out
}

// 1,500 seeded graphs. Each the pipeline draws and the validator passes must read honestly from its cells. implied counts
// the ones that seem to draw an edge the source does not have, (iv); the floor of validated drawings keeps the check meaningful.
test('A1: every seeded drawing the validator passes reads honestly from its cells', async t => {
  const next = random(0x5eed2), bad: string[] = []
  let routed = 0, validated = 0, implied = 0, implications = 0
  for (let i = 0; i < 1500; i++) {
    const graph = graphFor(i, next)
    const src: Src[] = graph.edges.map(({ id, from, to, tail, head }) => ({ id, from, to, tail, head }))
    const d = drawn(graph)
    if (!d) continue
    routed++
    if (validate(d)) continue
    validated++
    const pairs = drawnFalsePairs(d)
    if (pairs.length) implications++
    for (const pair of pairs) bad.push(`graph ${i}: false implied pair ${pair}`)
    const lies = honesty(d, src)
    if (lies.some(v => v.startsWith('(iv)'))) implied++
    for (const v of lies) bad.push(`graph ${i}: ${v}`)
  }
  t.diagnostic(`graphs 1500, drawn ${routed}, validated ${validated}, implying a false pair ${implied}, shared-arm false pairs ${implications}, violations ${bad.length}`)
  assert.equal(implied, 0, `${implied} validated drawings imply a false pair, as ${bad.find(v => v.includes('(iv)'))}`)
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} violations`)
  await t.test('at least 1,000 of the 1,500 graphs validate',
    () => assert.ok(validated >= 1000, `only ${validated} of 1500 validated`))
})

// Compaction (Q2a) changes no verdict but width. On a grid wide enough that no row fails, each seeded drawing validates
// compacted exactly when it validates at layout coordinates, for the same reason. At 40 columns, where many are too wide,
// compaction may fit one that failed only for width, and never breaks or passes any other.
test('A1: Q2a compaction keeps every seeded drawing\'s verdict but width', t => {
  const next = random(0xc0a1a), bad: string[] = [], verdict = (d: Drawing) => validate(d)?.reason ?? 'valid'
  let count = 0, fitted = 0
  for (let i = 0; i < 1500; i++) {
    const raw = drawn(graphFor(i, next), d => d)
    if (!raw) continue
    count++
    const wide = [verdict(raw), verdict(compact(raw))], narrow = [verdict({ ...raw, columns: 40 }), verdict(compact({ ...raw, columns: 40 }))]
    if (wide[0] !== wide[1]) bad.push(`graph ${i}: ${wide.join(' -> ')}`)
    if (narrow[0] === 'row-too-wide' && narrow[1] === 'valid') fitted++
    else if (narrow[0] !== narrow[1]) bad.push(`graph ${i} at 40 columns: ${narrow.join(' -> ')}`)
  }
  t.diagnostic(`drawn ${count}, fitted at 40 columns by compaction ${fitted}, other verdicts changed ${bad.length}`)
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} verdicts changed`)
  assert.ok(count >= 1000 && fitted > 0, `drawn ${count}, fitted ${fitted}`)
})
