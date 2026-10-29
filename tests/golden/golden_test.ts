import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'; import { explain } from '../../core/render.ts'; import { goldenOf, goldenGlyphs, widest } from './golden-lib.ts'
const W = [60, 80, 120], EDGE = new Set(['flowchart-reject-04', 'sequence-reject-04']), X = (s: string, w: number) => explain(s, { columns: w, theme: 'mono' }) as any
const LADDER: Record<string, string> = { 'flowchart-ok-41': 'natural', 'flowchart-ok-42': 'tight', 'flowchart-ok-43': 'wrap', 'flowchart-ok-44': 'lrToTd' }
const src = (id: string) => readFileSync(join('fixtures', id.split('-')[0]!, `${id}.mmd`), 'utf8')
for (const type of ['flowchart', 'sequence']) for (const f of existsSync(`fixtures/${type}`) ? readdirSync(`fixtures/${type}`) : []) {
  const id = f.replace(/\.mmd$/, ''), A = type === 'flowchart' ? 'A1' : 'A2'
  if (id.includes('-reject-')) test(`${A}: ${id} falls back`, () => {
    for (const w of EDGE.has(id) ? [60] : W) assert.ok('reason' in X(src(id), w), `${id}@${w}`)
    if (EDGE.has(id)) assert.ok(!('reason' in X(src(id), 61)))
  })
  else test(`${A}: ${id} renders, validates and matches its golden at 60/80/120`, () => {
    const g = goldenOf(W.map(w => { const r = X(src(id), w); assert.ok(!('reason' in r), `${id}@${w} ${r.reason}`); return [w, r.drawing] as const }))
    const p = join('goldens', type, `${id}.golden`); if (process.env.UPDATE_GOLDEN === '1') writeFileSync(p, g); assert.equal(g, readFileSync(p, 'utf8'))
  })
}
for (const [id, step] of Object.entries(LADDER)) test(`A4.fit-ladder: ${id} first fits at ${step}`, () => {
  const r = X(src(id), 60); assert.equal(r.step, step); if (step === 'natural') assert.equal(widest(r.drawing), 60)
})
test('A3: shape fixtures draw each one-line label in exactly one row', () => {
  for (let i = 7; i <= 18; i++) { const id = `flowchart-ok-${String(i).padStart(2, '0')}`, d = X(src(id), 80).drawing
    for (const { owner } of d.expect.labels) assert.equal(d.cells.filter((row: any[]) => row.some(c => c?.kind === 'text' && c.owners.includes(owner))).length, 1, `${id} ${owner}`) }
})
test('A8.platforms: every drawn glyph in every golden is allow-listed', () => assert.deepEqual(goldenGlyphs('goldens'), []))
test('A1: weight glyphs in flowchart-ok-50…52', () => {
  for (const [id, re] of [['flowchart-ok-50', /[┏┓┗┛]/], ['flowchart-ok-51', /[╂┿]/], ['flowchart-ok-52', /┆/]] as const)
    assert.match(readFileSync(join('goldens', 'flowchart', `${id}.golden`), 'utf8'), re, id)
})
