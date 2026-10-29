import test from 'node:test'; import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { explain } from '../../core/render.ts'; import { validate } from '../../core/validate.ts'
const DIR = new URL('../../fixtures/gitGraph/', import.meta.url)
const SOURCES = readdirSync(DIR).filter(f => /-ok-\d+\.mmd$/.test(f)).sort().map(f => [f, readFileSync(new URL(f, DIR), 'utf8')] as const)
const COMMITS = '●⊗■◉◎', STARTS = '╷╵', CROSSES = '─│┼┴┬├┤'

// Each real gitGraph drawing validates; each mutation of it must not: every label moved to another mark's row, every
// declared glyph changed to another type's, and every crossing cell (two owners' arms) flipped to another line glyph.
test('A5.mutation-tests: gitGraph fuzz: moved labels, retyped commits and flipped crossings all fail', t => {
  assert.equal(SOURCES.length, 15)
  const n = { label: 0, glyph: 0, cross: 0 }
  for (const [f, src] of SOURCES) for (const columns of [40, 80]) {
    const r = explain(src, { columns, theme: 'mono' }) as any
    assert.ok(r.drawing, `${f} @${columns}`)
    const d = r.drawing
    assert.equal(validate(d), null, `${f} @${columns}`)
    const where = (o: string) => d.cells.flatMap((row: any[], y: number) => row.flatMap((x, c) => (x?.owners.includes(o) ? [[y, c]] : [])))
    const markRow = new Map<string, number>(d.expect.rows.map((x: any) => [x.mark, where(x.mark)[0][0]]))
    for (const { mark, owners } of d.expect.rows) for (const owner of owners) for (const other of d.expect.rows) {
      const dr = markRow.get(other.mark)! - markRow.get(mark)!
      if (dr === 0) continue
      const m = structuredClone(d), lifted: [number, number, any][] = []
      m.cells.forEach((row: any[], y: number) => row.forEach((x, c) => {
        if (x && (x.kind === 'text' || x.kind === 'cont') && x.owners[0] === owner) { lifted.push([y + dr, c, x]); row[c] = null }
      }))
      if (lifted.length === 0 || lifted.some(([y]) => y < 0 || y >= m.cells.length)) continue
      for (const [y, c, x] of lifted) m.cells[y][c] = x
      assert.ok(validate(m), `${f} @${columns}: ${owner} to ${other.mark}'s row`); n.label++
    }
    for (const { owner, ch } of d.expect.glyphs) for (const g of owner.startsWith('s') ? STARTS : COMMITS) {
      if (g === ch) continue
      const m = structuredClone(d), [y, c] = where(owner)[0]
      m.cells[y][c] = { ...m.cells[y][c], ch: g }
      assert.ok(validate(m), `${f} @${columns}: ${owner} as ${g}`); n.glyph++
    }
    d.cells.forEach((row: any[], y: number) => row.forEach((x, c) => {
      if (x?.kind !== 'line' || (x.segs ?? []).length < 2) return
      for (const g of CROSSES) {
        if (g === x.ch) continue
        const m = structuredClone(d); m.cells[y][c] = { ...x, ch: g }
        assert.ok(validate(m), `${f} @${columns}: [${y}][${c}] ${x.ch} as ${g}`); n.cross++
      }
    }))
  }
  t.diagnostic(`mutations failed: ${n.label} labels, ${n.glyph} glyphs, ${n.cross} crossings`)
  assert.ok(n.label > 0 && n.glyph > 0 && n.cross > 0)
})
