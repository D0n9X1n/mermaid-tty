import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'; import { explain } from '../../core/render.ts'; import { drawnGlyphs, goldenOf, goldenGlyphs, widest } from './golden-lib.ts'
const W = [60, 80, 120], EDGE = new Set(['flowchart-reject-04', 'sequence-reject-04']), X = (s: string, w: number) => explain(s, { columns: w, theme: 'mono' }) as any
const LADDER: Record<string, string> = { 'flowchart-ok-41': 'natural', 'flowchart-ok-42': 'tight', 'flowchart-ok-43': 'wrap', 'flowchart-ok-44': 'lrToTd',
  'sequence-ok-27': 'natural', 'sequence-ok-28': 'tight', 'sequence-ok-29': 'wrap' }
// Goldens whose drawing a validator rule now rejects as misleading, '<rule>: <id>', until their layout owners fix them.
const TODO: Record<string, string> = {}
const src =(id: string) => readFileSync(join('fixtures', id.split('-')[0]!, `${id}.mmd`), 'utf8')
for (const type of ['flowchart', 'sequence']) for (const f of existsSync(`fixtures/${type}`) ? readdirSync(`fixtures/${type}`) : []) {
  const id = f.replace(/\.mmd$/, ''), A = type === 'flowchart' ? 'A1' : 'A2'
  if (id.includes('-reject-')) test(`${A}: ${id} falls back`, () => {
    for (const w of EDGE.has(id) ? [60] : W) assert.ok('reason' in X(src(id), w), `${id}@${w}`)
    if (EDGE.has(id)) assert.ok(!('reason' in X(src(id), 61)))
  })
  else test(`${A}: ${id} renders, validates and matches its golden at 60/80/120`, { todo: TODO[id] ?? false }, () => {
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
// A golden cannot tell a drawn cell whose whole ch is zero-width from a mark in the source text before it, so each drawn
// cell is checked on the drawing too. A fixture that falls back has no drawing; A1 and A2 report it.
const OK = ['flowchart', 'sequence'].flatMap(t => (existsSync(`fixtures/${t}`) ? readdirSync(`fixtures/${t}`) : []).map(f => f.replace(/\.mmd$/, '')))
  .filter(id => !id.includes('-reject-')).sort()
test('A8.platforms: every drawn cell of every ok fixture holds one allow-listed glyph', () => assert.deepEqual(
  OK.flatMap(id => W.flatMap(w => { const r = X(src(id), w); return 'reason' in r ? [] : drawnGlyphs(r.drawing).map(s => `${id}@${w} ${s}`) })), []))
test('A1: weight glyphs in flowchart-ok-50…52', () => {
  for (const [id, re] of [['flowchart-ok-50', /[┏┓┗┛]/], ['flowchart-ok-51', /[╂┿]/], ['flowchart-ok-52', /┆/]] as const)
    assert.match(readFileSync(join('goldens', 'flowchart', `${id}.golden`), 'utf8'), re, id)
})
// vr-A: mono draws no note fill, so each note golden shows its note by ┆ caps at every width.
test('A2: every sequence golden with a note shows a ┆ note marker at 60/80/120', () => {
  for (const n of [14, 15, 16, 17, 26, 33, 38]) {
    const g = readFileSync(join('goldens', 'sequence', `sequence-ok-${n}.golden`), 'utf8')
    for (const w of W) assert.match(g.split(`@${w}\n`)[1]!.split(`@${w} roles`)[0]!, /┆[^\n]*┆/, `sequence-ok-${n}@${w}`)
  }
})
