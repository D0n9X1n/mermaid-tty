import test from 'node:test'; import assert from 'node:assert/strict'; import { readdirSync, readFileSync } from 'node:fs'
import { createCanvas, type Drawing } from '../../core/canvas.ts'; import { validate } from '../../core/validate.ts'; import { explain } from '../../core/render.ts'

const drawing = (src: string): Drawing => {
  const r = explain(src, { columns: 80, theme: 'mono' })
  assert.ok('drawing' in r, src)
  return (r as { drawing: Drawing }).drawing
}
// The drawing of src with the line cell at (r, c), which must show was, redrawn as ch: its arms, style and owners kept.
const restyled = (src: string, r: number, c: number, was: string, ch: string): Drawing => {
  const d = structuredClone(drawing(src)), x = d.cells[r]![c]!
  assert.equal(x.kind, 'line'); assert.equal(x.ch, was)
  d.cells[r]![c] = { ...x, ch }
  return d
}

// QA: a glyph that shows another line style than its cell records says the wrong thing (a dependency for a realization, a
// non-identifying relation for an identifying one, a reply for a call), so it fails line-glyph like a wrong arm does.
test('line-glyph: a line cell drawn in another style than it records fails', () => {
  for (const [src, r, c, was, ch] of [
    ['classDiagram\nA ..> B', 1, 2, '┆', '│'],
    ['erDiagram\nA }o..o{ B : x', 1, 2, '┆', '│'],
    ['sequenceDiagram\nA-->>B: hi', 2, 3, '┄', '─'],
    ['flowchart TB\nA ==> B', 1, 2, '┃', '│'],
    ['flowchart TB\nA --> B', 1, 2, '│', '┆'],
    ['flowchart TB\nA --> B', 1, 2, '│', '║'],
  ] as const) {
    assert.equal(validate(drawing(src)), null, src)
    assert.equal(validate(restyled(src, r, c, was, ch))?.reason, 'line-glyph', `${src}: ${was} as ${ch}`)
  }
})

// An edge draws in its own line style. Each line cell of `A --> B` redrawn whole in another style, its arms, style and
// glyph all agreeing, reads as another arrow: ━━ as Mermaid's thick ==>, ┄┄ as dotted -.->. expect records the style.
test('#27: a whole edge redrawn heavy or dotted fails line-glyph', () => {
  const r = explain('flowchart LR\nA --> B', { columns: 60, theme: 'mono' }) as { drawing: Drawing }
  const lines = r.drawing.cells.flatMap((row, y) => row.flatMap((x, c) => (x?.kind === 'line' ? [[y, c] as const] : [])))
  assert.equal(lines.length, 2)
  for (const [style, weight, ch] of [['heavy', '2', '━'], ['dotted', '1', '┄']] as const) {
    const d = structuredClone(r.drawing)
    for (const [y, c] of lines) d.cells[y]![c] = { ...d.cells[y]![c]!, ch, style, arms: `0${weight}0${weight}` }
    assert.match(d.cells.map(row => row.map(x => (x ? x.ch : ' ')).join('')).join('\n'), new RegExp(`\\]${ch}${ch}►\\[`))
    assert.equal(validate(d)?.reason, 'line-glyph', style)
  }
  assert.equal(validate(r.drawing), null)
})

// An invisible edge (~~~) draws nowhere. Listed as hidden, a line cell drawn for it, self-consistent, fails line-glyph:
// before, its owner was in no list, so nothing checked the cell.
test('#27: a line cell drawn for an invisible edge fails line-glyph', () => {
  const r = explain('flowchart LR\nA --> B\nB ~~~ C', { columns: 60, theme: 'mono' }) as { drawing: Drawing }
  const [id] = r.drawing.expect.hidden ?? []
  assert.ok(id, 'the ~~~ edge is listed as hidden')
  assert.equal(validate(r.drawing), null)
  const d = structuredClone(r.drawing), row = d.cells.findIndex(x => x.some(c => c?.owners.includes('C')))
  const col = d.cells[row]!.findIndex(c => c?.owners.includes('C')) - 1
  assert.equal(d.cells[row]![col], null)
  d.cells[row]![col] = { ch: '─', role: 'edge', kind: 'line', owners: [id!], dirs: 10, arms: '0101', style: 'light', segs: [{ owner: id!, dirs: 10 }] }
  assert.equal(validate(d)?.reason, 'line-glyph')
})
// Every edge a fixture draws states its style, so the check above is never skipped for want of one.
test('#27: every drawn edge of every ok fixture records its line style', () => {
  const missing: string[] = []
  for (const dir of readdirSync('fixtures').filter(x => x !== 'corpus')) for (const f of readdirSync(`fixtures/${dir}`).filter(f => f.includes('-ok-'))) {
    const r = explain(readFileSync(`fixtures/${dir}/${f}`, 'utf8'), { columns: 80, theme: 'mono' })
    if ('drawing' in r) for (const e of r.drawing.expect.edges) if (!e.style) missing.push(`${f} ${e.id}`)
  }
  assert.deepEqual(missing, [])
})

// Line-style cases a renderer can get wrong. In each, expect is the renderer's and the cells change.
const drawn = (src: string): Drawing => structuredClone((explain(src, { columns: 60, theme: 'mono' }) as { drawing: Drawing }).drawing)
const rows = (d: Drawing) => d.cells.map(row => row.map(x => (!x ? ' ' : x.kind === 'cont' ? '' : x.ch)).join('').replace(/ +$/, ''))
const lineCell = (ch: string, segs: { owner: string; dirs: number }[], style: 'light' | 'dotted' = 'light') => {
  const dirs = segs.reduce((m, s) => m | s.dirs, 0)
  return { ch, role: 'edge' as const, kind: 'line' as const, owners: segs.map(s => s.owner), dirs, arms: [1, 2, 4, 8].map(b => (dirs & b ? '1' : '0')).join(''), style, segs }
}
// Hole 1: a dotted edge whose every cell is a crossing shows no dash. C---D, rerouted up through both of A-.-B's cells,
// draws [ A ]┼┼[ B ]: A-.-B reads as solid.
test('#27 review: a dotted edge drawn only as crossings fails line-glyph', () => {
  const d = drawn('flowchart LR\nA -.- B\nC --- D\nE --- F'), [ab, cd] = d.expect.edges.map(e => e.id) as [string, string]
  d.cells.unshift(Array(d.cells[0]!.length).fill(null))   // a row above A-.-B for C---D to turn in
  d.cells[3]![5] = lineCell('┘', [{ owner: cd, dirs: 9 }]); d.cells[2]![5] = lineCell('│', [{ owner: cd, dirs: 5 }])
  d.cells[1]![5] = lineCell('┼', [{ owner: ab, dirs: 10 }, { owner: cd, dirs: 5 }]); d.cells[0]![5] = lineCell('┌', [{ owner: cd, dirs: 6 }])
  d.cells[0]![6] = lineCell('┐', [{ owner: cd, dirs: 12 }]); d.cells[1]![6] = lineCell('┼', [{ owner: ab, dirs: 10 }, { owner: cd, dirs: 5 }])
  d.cells[2]![6] = lineCell('│', [{ owner: cd, dirs: 5 }]); d.cells[3]![6] = lineCell('└', [{ owner: cd, dirs: 3 }])
  assert.equal(rows(d)[1], '[ A ]┼┼[ B ]')
  assert.equal(validate(d)?.reason, 'line-glyph', rows(d).join('\n'))
})
// Hole 2: an edge drawn as its head alone has no line to show its style. A-.->B with its two ┄ columns cut: [ A ]►[ B ].
test('#27 review: an edge drawn with no line cell fails line-glyph', () => {
  const d = drawn('flowchart LR\nA -.-> B')
  for (const row of d.cells) row.splice(5, 2)
  assert.equal(rows(d)[0], '[ A ]►[ B ]')
  assert.equal(validate(d)?.reason, 'line-glyph', rows(d).join('\n'))
})
// Hole 3: an invisible edge draws no cell of any kind, a head included. A ~~~ B with a ► owned by it between them.
test('#27 review: a head drawn for an invisible edge fails line-glyph', () => {
  const d = drawn('flowchart LR\nA ~~~ B'), [id] = d.expect.hidden ?? []
  assert.equal(d.cells[0]![5], null)
  d.cells[0]![5] = { ch: '►', role: 'arrow', kind: 'arrow', owners: [id!], dirs: 0 }
  assert.equal(validate(d)?.reason, 'line-glyph', rows(d).join('\n'))
})

// A corner shows no dash: a dotted edge needs a straight dotted cell, ┄ or ┆, on its path.
// A -.- B drawn as ┐ then a ┼ that C---D crosses: every cell of it reads as solid.
function cornerCross(ring = false): Drawing {
  const c = createCanvas(ring ? 8 : 4, 8, 8)
  c.text(1, 0, 'a', 'node', 'A'); c.text(3, 1, 'b', 'node', 'B'); c.text(2, 0, 'c', 'node', 'C'); c.text(2, 2, 'd', 'node', 'D')
  c.line(1, 1, 12, 'dotted', 'edge', 'AB'); c.line(2, 1, 5, 'dotted', 'edge', 'AB'); c.line(2, 1, 10, 'light', 'edge', 'CD')
  // A closed ┄ ring owned by A-.-B, joined to nothing: a dotted witness off its path.
  if (ring) for (const [r, col, dirs] of [[5, 4, 6], [5, 5, 10], [5, 6, 12], [6, 4, 5], [6, 6, 5], [7, 4, 3], [7, 5, 10], [7, 6, 9]] as const) c.line(r, col, dirs, 'dotted', 'edge', 'AB')
  return c.toDrawing({ labels: ['A', 'B', 'C', 'D'].map(o => ({ owner: o, text: o.toLowerCase() })), edgeLabels: [], frames: [],
    edges: [{ id: 'AB', from: 'A', to: 'B', ends: [], style: 'dotted' }, { id: 'CD', from: 'C', to: 'D', ends: [], style: 'solid' }] })
}
test('#27 re-review: a dotted edge drawn only as a corner and a crossing fails line-glyph', () => {
  const d = cornerCross()
  assert.deepEqual(d.conflicts, []); assert.deepEqual(rows(d), ['', 'a┐', 'c┼d', ' b'])
  assert.equal(validate(d)?.reason, 'line-glyph', rows(d).join('\n'))
})
// The renderer did this: a dotted two-headed self-message's line was only ┐┘, as a solid one's is. It must draw a ┄ or fall back.
test('#27 re-review: a dotted two-headed self-message draws a dotted straight cell, or falls back', () => {
  for (const columns of [60, 80, 120]) {
    const r = explain('sequenceDiagram\nA<<-->>A: x', { columns, theme: 'mono' })
    if (!('drawing' in r)) continue
    const mine = r.drawing.cells.flat().filter(x => x?.kind === 'line' && x.owners.includes('m0'))
    assert.ok(mine.some(x => x!.style === 'dotted' && (x!.dirs === 5 || x!.dirs === 10)), `${columns}\n${rows(r.drawing).join('\n')}`)
    assert.equal(validate(r.drawing), null, `${columns}`)
  }
})
// An edge's cells form one connected path between its ends: a closed ┄ ring of A-.-B's own, off its path, is a stray part.
test('#27 re-review: an edge with a part joined to nothing fails edge-disconnected', () => {
  const d = cornerCross(true)
  assert.deepEqual(d.conflicts, []); assert.equal(rows(d)[6], '    ┆ ┆')
  assert.equal(validate(d)?.reason, 'edge-disconnected', rows(d).join('\n'))
})

// A walk through an edge label into a line cell needs that cell to point at the label, as
// line to line does. A -.-|x| B drawn as [ A ]┼┼x[ B ], C---D and E---F crossing its two cells, plus a closed ┄ ring of
// A-.-B's own whose ┌ sits right under x: ┌ has no arm toward x, so the ring is joined to nothing, and it is no witness.
test('#27 re-review: a stray ring beside an edge label is not reached through the label, and fails edge-disconnected', () => {
  const c = createCanvas(5, 13, 13)
  c.text(1, 0, '[ A ]', 'node', 'A'); c.text(1, 8, '[ B ]', 'node', 'B')
  c.text(0, 5, 'c', 'node', 'C'); c.text(2, 5, 'd', 'node', 'D'); c.text(0, 6, 'e', 'node', 'E'); c.text(2, 6, 'f', 'node', 'F')
  c.line(1, 5, 10, 'dotted', 'edge', 'AB'); c.line(1, 6, 10, 'dotted', 'edge', 'AB')
  c.line(1, 5, 5, 'light', 'edge', 'CD'); c.line(1, 6, 5, 'light', 'edge', 'EF')
  c.text(1, 7, 'x', 'label', ['AB:label', 'AB'])
  for (const [r, col, dirs] of [[2, 7, 6], [2, 8, 10], [2, 9, 12], [3, 7, 5], [3, 9, 5], [4, 7, 3], [4, 8, 10], [4, 9, 9]] as const) c.line(r, col, dirs, 'dotted', 'edge', 'AB')
  const d = c.toDrawing({ labels: [...['A', 'B'].map(o => ({ owner: o, text: `[ ${o} ]` })), ...['C', 'D', 'E', 'F'].map(o => ({ owner: o, text: o.toLowerCase() })),
    { owner: 'AB:label', text: 'x' }], edgeLabels: [{ owner: 'AB:label', edge: 'AB' }], frames: [],
    edges: [{ id: 'AB', from: 'A', to: 'B', ends: [], style: 'dotted' }, { id: 'CD', from: 'C', to: 'D', ends: [], style: 'solid' },
      { id: 'EF', from: 'E', to: 'F', ends: [], style: 'solid' }] })
  assert.deepEqual(d.conflicts, []); assert.deepEqual(rows(d).slice(1, 3), ['[ A ]┼┼x[ B ]', '     df┌┄┐'])
  assert.equal(validate(d)?.reason, 'edge-disconnected', rows(d).join('\n'))
})
