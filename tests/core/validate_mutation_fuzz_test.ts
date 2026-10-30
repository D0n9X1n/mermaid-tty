// A convergence fuzz over real drawings. Each ok fixture, and every fourth corpus block, is drawn at 60 and 80 columns;
// each mutation keeps expect unchanged and changes what the cells show, so validate must fail it. A mutation that leaves
// the cells identical, or that only relabels an automorphism of the source, is skipped. Each class counts its mutants and
// fails on any survivor.
import test from 'node:test'; import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import type { Cell, Drawing } from '../../core/canvas.ts'; import { lineGlyph } from '../../core/canvas.ts'; import { BOX } from '../../core/box-table.ts'
import { explain } from '../../core/render.ts'; import { validate } from '../../core/validate.ts'

const ROOT = new URL('../../fixtures/', import.meta.url)
const files = (dir: string, keep: (f: string, i: number) => boolean) =>
  readdirSync(new URL(`${dir}/`, ROOT)).sort().filter(keep).map(f => `${dir}/${f}`)
const SOURCES = [...readdirSync(ROOT).filter(x => x !== 'corpus').sort().flatMap(x => files(x, f => /-ok-\d+\.mmd$/.test(f))),
  ...files('corpus', (f, i) => f.endsWith('.mmd') && i % 4 === 0)]
// A case is a drawing, and whether it is a chart's: a pie, gantt, journey, quadrant, timeline or xychart.
type Case = { name: string; d: Drawing; chart: boolean }
const CHART = /^\s*(pie|gantt|journey|quadrantChart|timeline|xychart(-beta)?)\b/m
const draw = (name: string, src: string): Case[] => [60, 80].flatMap(columns => {
  const r = explain(src, { columns, theme: 'mono' })
  return 'drawing' in r && r.drawing ? [{ name: `${name} @${columns}`, d: r.drawing as Drawing, chart: CHART.test(src) }] : []
})
const CASES: Case[] = SOURCES.flatMap(f => draw(f, readFileSync(new URL(f, ROOT), 'utf8')))

// A patch sets cells; run applies it, asks validate, and restores. null if the patch leaves every cell identical.
type Patch = [number, number, Cell | null][]
const same = (a: Cell | null, b: Cell | null) => JSON.stringify(a) === JSON.stringify(b)
function run(d: Drawing, patch: Patch): boolean | null {
  const old = patch.map(([r, c]) => d.cells[r]![c] ?? null)
  if (patch.every(([, , x], i) => same(x, old[i]!))) return null
  for (const [r, c, x] of patch) d.cells[r]![c] = x
  const failed = validate(d) !== null
  patch.forEach(([r, c], i) => { d.cells[r]![c] = old[i]! })
  return failed
}
type Tally = { mutants: number; survivors: string[] }
// Runs every patch each case yields and tallies it; a survivor is named by its case and the patch's own note.
function tally(t: { diagnostic(s: string): void }, label: string, gen: (d: Drawing, k: Case) => Iterable<[string, Patch]>, cases = CASES): Tally {
  const out: Tally = { mutants: 0, survivors: [] }
  for (const k of cases) {
    const { name, d } = k
    assert.equal(validate(d), null, name)
    for (const [note, patch] of gen(d, k)) {
      const failed = run(d, patch)
      if (failed === null) continue
      out.mutants++
      if (!failed) out.survivors.push(`${name}: ${note}`)
    }
  }
  t.diagnostic(`${label}: ${out.mutants} mutants, ${out.survivors.length} survivors${out.survivors.length ? `, e.g. ${out.survivors.slice(0, Number(process.env.SHOW ?? 5)).join('; ')}` : ''}`)
  return out
}
const spots = (d: Drawing) => d.cells.flatMap((row, r) => row.flatMap((x, c) => (x ? [{ r, c, x }] : [])))
// A drawing's line cells, at most two of each context: glyph, style and how many owners drew there. Cells of one context
// meet the validator's rules alike, and a big drawing has thousands of them.
function lineCells(d: Drawing) {
  const seen = new Map<string, number>()
  return spots(d).filter(({ x }) => {
    if (x.kind !== 'line') return false
    const k = `${x.ch}|${x.style}|${x.segs?.length ?? 0}`, n = seen.get(k) ?? 0
    seen.set(k, n + 1)
    return n < 2
  })
}

// Every line glyph by the dirs it draws: the Box Drawing table's light and heavy mixes, the dashed runs, the doubles and
// their single mixes, and the round corners.
const bits = (arms: string) => [1, 2, 4, 8].reduce((m, b, i) => (arms[i] !== '0' ? m | b : m), 0)
const DIRS = new Map<string, number>([...Object.entries(BOX).map(([a, g]) => [g, bits(a)] as const),
  ...([['┄┅┈┉╌╍═', 10], ['┆┇┊┋╎╏║', 5], ['╒╓╔╭', 6], ['╕╖╗╮', 12], ['╘╙╚╰', 3], ['╛╜╝╯', 9], ['╞╟╠', 7], ['╡╢╣', 13],
    ['╤╥╦', 14], ['╧╨╩', 11], ['╪╫╬', 15]] as const).flatMap(([gs, n]) => [...gs].map(g => [g, n] as const))])
const SAME_ARMS = (dirs: number) => [...DIRS].filter(([, n]) => n === dirs).map(([g]) => g)

test('A5.mutation-tests: fuzz: every line cell redrawn in another style of the same arms fails', t => {
  const { mutants, survivors } = tally(t, 'style', function* (d) {
    for (const { r, c, x } of lineCells(d)) for (const g of SAME_ARMS(x.dirs)) yield [`(${r},${c}) ${x.ch} as ${g}`, [[r, c, { ...x, ch: g }]]]
  })
  assert.ok(mutants > 0); assert.deepEqual(survivors, [])
})

// #18 re-review: one arm of a solid line cell redrawn in the other weight, light to heavy or heavy to light, its glyph the
// mixed one the canvas would draw for those arms, so the cell is self-consistent and only its weight is wrong: a thick
// branch on a thin line, or a thin one on a thick line. Dotted cells have no heavy arm to show, and a cell of one arm (a
// gitGraph lane's tail ╵) has no other arm to differ from: expect states no line's weight, so its weight is unchecked.
test('A5.mutation-tests: fuzz: one arm of a line cell redrawn in the other weight fails', t => {
  const { mutants, survivors } = tally(t, 'weight', function* (d) {
    for (const { r, c, x } of lineCells(d)) {
      if (x.style === 'dotted' || [1, 2, 4, 8].filter(b => x.dirs & b).length < 2) continue
      const arms = x.arms ?? [1, 2, 4, 8].map(b => (x.dirs & b ? '1' : '0')).join('')
      for (let i = 0; i < 4; i++) {
        if (arms[i] === '0') continue
        const flipped = arms.slice(0, i) + (arms[i] === '1' ? '2' : '1') + arms.slice(i + 1)
        yield [`(${r},${c}) ${x.ch} arm ${i} as ${lineGlyph(x.dirs, flipped, x.style ?? 'light')}`,
          [[r, c, { ...x, arms: flipped, ch: lineGlyph(x.dirs, flipped, x.style ?? 'light') }]]]
      }
    }
  })
  assert.ok(mutants > 0); assert.deepEqual(survivors, [])
})

// The edges of d grouped into joined networks: edges that share a line or arrow cell are on one network.
function networks(d: Drawing): (id: string) => string {
  const root = new Map(d.expect.edges.map(e => [e.id, e.id]))
  const find = (id: string): string => { let r = id; while (root.get(r) !== r) r = root.get(r)!; return r }
  for (const { x } of spots(d)) {
    const ids = x.kind === 'line' || x.kind === 'arrow' ? x.owners.filter(o => root.has(o)) : []
    for (const id of ids.slice(1)) root.set(find(id), find(ids[0]!))
  }
  return id => (root.has(id) ? find(id) : '')
}
// x with owner o's part given to e instead: its owners and its segs, e's dirs there OR-merged with o's.
function reassign(x: Cell, o: string, e: string): Cell {
  const owners = [...new Set(x.owners.map(y => (y === o ? e : y)))]
  const segs = x.segs?.reduce<{ owner: string; dirs: number }[]>((out, s) => {
    const owner = s.owner === o ? e : s.owner, had = out.find(y => y.owner === owner)
    if (had) had.dirs |= s.dirs; else out.push({ owner, dirs: s.dirs })
    return out
  }, [])
  return { ...x, owners, ...(segs ? { segs } : {}) }
}

test('A5.mutation-tests: fuzz: a line cell given to another edge of its joined network fails', t => {
  const { mutants, survivors } = tally(t, 'owner', function* (d) {
    const net = networks(d)
    for (const { r, c, x } of spots(d).filter(p => p.x.kind === 'line')) for (const o of x.owners) {
      if (!net(o)) continue
      for (const e of d.expect.edges) if (e.id !== o && net(e.id) === net(o)) yield [`(${r},${c}) ${o} as ${e.id}`, [[r, c, reassign(x, o, e.id)]]]
    }
  })
  assert.ok(mutants > 0); assert.deepEqual(survivors, [])
})

// Each node's pill: the box of the cap, fill, text, cont and frame cells it draws as owners[0], if that box holds no other
// cell; and the pill's shape, its empty, border and inner cells, so pills of one shape and size can swap.
const PILL = new Set(['cap', 'fill', 'text', 'cont', 'frame'])
function pills(d: Drawing) {
  const nodes = new Set(d.expect.edges.flatMap(e => [e.from, e.to])), out: { id: string; r: number; c: number; rows: (Cell | null)[][]; shape: string }[] = []
  for (const id of nodes) {
    const mine = spots(d).filter(p => p.x.owners[0] === id && PILL.has(p.x.kind))
    if (mine.length === 0) continue
    const [r0, r1, c0, c1] = [Math.min(...mine.map(p => p.r)), Math.max(...mine.map(p => p.r)), Math.min(...mine.map(p => p.c)), Math.max(...mine.map(p => p.c))]
    const rows = d.cells.slice(r0, r1 + 1).map(row => row.slice(c0, c1 + 1).map(x => x ?? null))
    if (rows.flat().some(x => x && (x.owners[0] !== id || !PILL.has(x.kind)))) continue
    out.push({ id, r: r0, c: c0, rows, shape: rows.map(row => row.map(x => (!x ? '.' : x.kind === 'cap' || x.kind === 'frame' ? x.ch : 'i')).join('')).join('/') })
  }
  return out
}
// Whether swapping nodes a and b maps the source onto itself: each edge, its ends and its label, read with a and b
// swapped, is an edge of the source. An edge with no marks shows no direction, so its endpoints are unordered.
function automorphic(d: Drawing, a: string, b: string): boolean {
  const sw = (n: string) => (n === a ? b : n === b ? a : n)
  const text = new Map(d.expect.labels.map(l => [l.owner, l.text]))
  const label = (id: string) => d.expect.edgeLabels.filter(l => l.edge === id).map(l => text.get(l.owner)).join('|')
  const key = (e: Drawing['expect']['edges'][number], f = (n: string) => n) =>
    `${(e.ends.length > 0 ? [f(e.from), f(e.to)] : [f(e.from), f(e.to)].sort()).join('>')}|${e.ends.map(x => `${f(x.node)}${x.glyph}`).sort().join()}|${label(e.id)}`
  const was = d.expect.edges.map(e => key(e)).sort(), now = d.expect.edges.map(e => key(e, sw)).sort()
  return was.join('\n') === now.join('\n')
}

test('A5.mutation-tests: fuzz: two node pills of one shape and size swapped fail', t => {
  const { mutants, survivors } = tally(t, 'pill', function* (d) {
    const ps = pills(d)
    for (const [i, p] of ps.entries()) for (const q of ps.slice(i + 1)) {
      if (p.shape !== q.shape || automorphic(d, p.id, q.id)) continue
      const patch: Patch = p.rows.flatMap((row, y) => row.flatMap((x, k): Patch => [[p.r + y, p.c + k, q.rows[y]![k]!], [q.r + y, q.c + k, x]]))
      yield [`${p.id} <-> ${q.id}`, patch]
    }
  })
  assert.ok(mutants > 0); assert.deepEqual(survivors, [])
})

// Where each label may lie, by its owner: an edge label within one cell of its edge's line or arrow cells (at least one of
// its cells), a node's label inside its pill's box (every cell), a row's label in its mark's block right of the mark (every
// cell). Other text (titles, axes, legends) has no span to leave, so it is not moved.
function spanOf(d: Drawing, owner: string): ((cells: [number, number][]) => boolean) | null {
  const all = spots(d), edge = d.expect.edgeLabels.find(l => l.owner === owner)?.edge
  if (edge) {
    const route = all.filter(p => (p.x.kind === 'line' || p.x.kind === 'arrow') && p.x.owners.includes(edge))
    return cells => cells.some(([r, c]) => route.some(q => Math.max(Math.abs(r - q.r), Math.abs(c - q.c)) <= 1))
  }
  const box = pills(d).find(p => p.id === owner)
  if (box) return cells => cells.every(([r, c]) => r >= box.r && r < box.r + box.rows.length && c >= box.c && c < box.c + box.rows[0]!.length)
  const rows = d.expect.rows ?? [], i = rows.findIndex(x => x.owners.includes(owner))
  if (i < 0) return null
  const markAt = (k: number) => all.find(p => p.x.owners.includes(rows[k]!.mark))!
  const m = markAt(i), next = i + 1 < rows.length ? markAt(i + 1).r : d.cells.length
  return cells => cells.every(([r, c]) => r >= m.r && r < next && c > m.c)
}

test('A5.mutation-tests: fuzz: a label moved one cell into free cells outside its owner\'s span fails', t => {
  const { mutants, survivors } = tally(t, 'label', function* (d) {
    const owners = new Set(d.expect.labels.map(l => l.owner))
    for (const owner of owners) {
      const inSpan = spanOf(d, owner)
      if (!inSpan) continue
      const mine = spots(d).filter(p => (p.x.kind === 'text' || p.x.kind === 'cont') && p.x.owners[0] === owner)
      if (mine.length === 0) continue
      const held = new Set(mine.map(p => `${p.r},${p.c}`))
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const to = mine.map(p => [p.r + dr, p.c + dc] as [number, number])
        if (to.some(([r, c]) => r < 0 || r >= d.cells.length || c < 0 || (d.cells[r]![c] && !held.has(`${r},${c}`))) || inSpan(to)) continue
        const patch: Patch = [...mine.map((p): Patch[number] => [p.r, p.c, null]), ...mine.map((p, k): Patch[number] => [to[k]![0], to[k]![1], p.x])]
        yield [`${owner} by (${dr},${dc})`, patch]
      }
    }
  })
  assert.ok(mutants > 0); assert.deepEqual(survivors, [])
})

// A placed text: the text, cont and key cells an owner draws as owners[0], legend keys apart, and its first cell.
type Unit = { owner: string; cells: { r: number; c: number; x: Cell }[]; text: string }
const PLACED = new Set(['text', 'cont', 'key'])
function units(d: Drawing): Unit[] {
  const by = new Map<string, Unit>()
  for (const { r, c, x } of spots(d)) if (PLACED.has(x.kind) && !x.legend) {
    const o = x.owners[0]!, u = by.get(o) ?? { owner: o, cells: [], text: '' }
    u.cells.push({ r, c, x }); u.text += x.ch; by.set(o, u)
  }
  return [...by.values()]
}
// u's cells moved so its first cell is at (r, c), and v's to u's, as one patch; null if a target is off the grid or holds
// a cell neither draws.
function relocate(d: Drawing, us: readonly Unit[], to: readonly [number, number][]): Patch | null {
  const held = new Set(us.flatMap(u => u.cells.map(p => `${p.r},${p.c}`))), writes: Patch = []
  for (const [i, u] of us.entries()) for (const p of u.cells) {
    const r = p.r + to[i]![0] - u.cells[0]!.r, c = p.c + to[i]![1] - u.cells[0]!.c
    if (r < 0 || c < 0 || r >= d.cells.length || (d.cells[r]![c] && !held.has(`${r},${c}`))) return null
    writes.push([r, c, p.x])
  }
  if (new Set(writes.map(([r, c]) => `${r},${c}`)).size < writes.length) return null
  return [...us.flatMap(u => u.cells.map((p): Patch[number] => [p.r, p.c, null])), ...writes]
}

test('A5.mutation-tests: fuzz: two placed chart texts swapped fail', t => {
  const { mutants, survivors } = tally(t, 'swap', function* (d, k) {
    if (!k.chart) return
    const us = units(d)
    for (const [i, u] of us.entries()) for (const v of us.slice(i + 1)) {
      if (u.text === v.text) continue
      const patch = relocate(d, [u, v], [[v.cells[0]!.r, v.cells[0]!.c], [u.cells[0]!.r, u.cells[0]!.c]])
      if (patch) yield [`${u.owner} '${u.text}' <-> ${v.owner} '${v.text}'`, patch]
    }
  })
  assert.ok(mutants > 0); assert.deepEqual(survivors, [])
})

test('A5.mutation-tests: fuzz: a title, axis title, frame title, header or legend row moved one cell fails', t => {
  const { mutants, survivors } = tally(t, 'move', function* (d, k) {
    for (const u of units(d)) {
      const inSpan = k.chart ? null : spanOf(d, u.owner)
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const to: [number, number] = [u.cells[0]!.r + dr, u.cells[0]!.c + dc]
        if (inSpan?.(u.cells.map(p => [p.r + dr, p.c + dc]))) continue
        const patch = relocate(d, [u], [to])
        if (patch) yield [`${u.owner} '${u.text}' by (${dr},${dc})`, patch]
      }
    }
  })
  assert.ok(mutants > 0); assert.deepEqual(survivors, [])
})

// C graphs no fixture draws: class heads △▽◆◇, ER and class end labels, state heads. Each at 60 and 80.
const C_GRAPHS: Case[] = [['class heads', 'classDiagram\nAnimal <|-- Duck\nDuck *-- Egg\nLake o-- Duck\nDuck ..|> Swimmer'],
  ['class ends', 'classDiagram\nA "1" --> "0..*" B : owns\nB "many" o-- "1" C'], ['er', 'erDiagram\nCAR ||--o{ DRIVER : drives\nCAR }|..|{ PART : has'],
  ['state', 'stateDiagram-v2\n[*] --> A\nA --> B\nB --> A\nB --> [*]']].flatMap(([name, src]) => draw(name!, src!))
// Every head glyph a drawing shows: directional, hollow, diamond, dot and sequence ends.
const HEADS = [...'►◄▲▼△▽▷◁◆◇●◉ox)']

test('A5.mutation-tests: fuzz: an arrowhead redrawn as another head glyph fails', t => {
  const { mutants, survivors } = tally(t, 'head', function* (d) {
    for (const { r, c, x } of spots(d)) if (x.kind === 'arrow') for (const g of HEADS) if (g !== x.ch) yield [`(${r},${c}) ${x.ch} as ${g}`, [[r, c, { ...x, ch: g }]]]
  }, [...CASES, ...C_GRAPHS])
  assert.ok(mutants > 0); assert.deepEqual(survivors, [])
})

test('A5.mutation-tests: fuzz: an edge\'s two end labels swapped fail', t => {
  const { mutants, survivors } = tally(t, 'ends', function* (d) {
    const us = new Map(units(d).map(u => [u.owner, u]))
    for (const e of d.expect.edges) {
      const a = us.get(`${e.id}:tail`), b = us.get(`${e.id}:head`)
      if (!a || !b || a.text === b.text) continue
      const patch = relocate(d, [a, b], [[b.cells[0]!.r, b.cells[0]!.c], [a.cells[0]!.r, a.cells[0]!.c]])
      if (patch) yield [`${e.id} '${a.text}' <-> '${b.text}'`, patch]
    }
  }, [...CASES, ...C_GRAPHS])
  assert.ok(mutants > 0); assert.deepEqual(survivors, [])
})

// Bar glyphs by axis, and a bar's own cells: the caps in a bar glyph its owner draws. Each run's base and tip are redrawn,
// since every inner cell is a full █ that the same rule reads; the tip is also cut, and grown by one cell.
const BAR_GLYPHS = { h: [...'█▏▎▍▌▋▊▉'], v: [...'█▁▂▃▄▅▆▇'] } as const
test('A5.mutation-tests: fuzz: a bar one cell longer, one cell shorter, or a cell redrawn another length fails', t => {
  const { mutants, survivors } = tally(t, 'bar', function* (d) {
    for (const b of d.expect.bars ?? []) {
      const mine = spots(d).filter(p => p.x.kind === 'cap' && p.x.owners[0] === b.owner && BAR_GLYPHS[b.axis].includes(p.x.ch as never))
      const has = (r: number, c: number) => mine.some(p => p.r === r && p.c === c)
      for (const { r, c, x } of mine) {
        const [nr, nc] = b.axis === 'h' ? [r, c + 1] : [r - 1, c], [pr, pc] = b.axis === 'h' ? [r, c - 1] : [r + 1, c]
        const tip = !has(nr, nc)
        if (!tip && has(pr, pc)) continue
        for (const g of BAR_GLYPHS[b.axis]) if (g !== x.ch) yield [`${b.owner} (${r},${c}) ${x.ch} as ${g}`, [[r, c, { ...x, ch: g }]]]
        if (tip) {
          yield [`${b.owner} (${r},${c}) cut`, [[r, c, null]]]
          if (nr >= 0 && !d.cells[nr]![nc]) yield [`${b.owner} (${r},${c}) grown`, [[nr, nc, { ...x, ch: '█' }]]]
        }
      }
    }
  })
  assert.ok(mutants > 0); assert.deepEqual(survivors, [])
})
