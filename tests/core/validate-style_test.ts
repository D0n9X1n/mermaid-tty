import test from 'node:test'; import assert from 'node:assert/strict'; import { readdirSync, readFileSync } from 'node:fs'
import type { Drawing } from '../../core/canvas.ts'; import { validate } from '../../core/validate.ts'; import { explain } from '../../core/render.ts'

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

// #27: an edge draws in its own line style. Each line cell of `A --> B` redrawn whole in another style, its arms, style and
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

// #27: an invisible edge (~~~) draws nowhere. Listed as hidden, a line cell drawn for it, self-consistent, fails line-glyph:
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
