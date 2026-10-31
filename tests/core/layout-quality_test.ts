// tests/core/layout-quality_test.ts — drawings that are correct but read worse than they should: detours, far labels.
import test from 'node:test'; import assert from 'node:assert/strict'
import { explain } from '../../core/render.ts'; import { validate } from '../../core/validate.ts'
import { fx } from '../golden/c-lib.ts'; import { text } from './graph-fixture.ts'
const W = [60, 80, 120]
const  X = (id: string, w: number) => explain(fx(id), { columns: w, theme: 'mono' }) as any

// Each pair of end marks drawn side by side, along a row or down a column: 'r,c r,c'.
function touchingMarks(d: any): string[] {
  const mark = (r: number, c: number) => { const x = d.cells[r]?.[c]; return !!x && x.kind !== 'text' && x.kind !== 'cont' && x.role === 'arrow' }
  const out: string[] = []
  d.cells.forEach((row: unknown[], r: number) => row.forEach((_, c) => {
    if (mark(r, c) && mark(r, c + 1)) { out.push(`${r},${c} ${r},${c + 1}`) }
    if (mark(r, c) && mark(r + 1, c)) { out.push(`${r},${c} ${r + 1},${c}`) }
  }))
  return out
}

test('Inheritance heads meeting one face stand at least a column apart', () => {
  for (const id of ['class-ok-01', 'class-ok-02']) { for (const w of W) {
    const r = X(id, w); assert.ok(!('reason' in r), `${id}@${w}`); assert.equal(validate(r.drawing), null)
    assert.deepEqual(touchingMarks(r.drawing), [], `${id}@${w}\n${text(r.drawing).join('\n')}`)
  } }
})

// The rows (or, when cols, the columns) of the cells owner draws.
const extent = (d: any, owner: string, cols = false): number[] => d.cells.flatMap((row: any[], r: number) =>
  row.flatMap((x, c) => x && x.kind !== 'cont' && (x.owner === owner || x.owners?.includes(owner) || x.segs?.some((g: any) => g.owner === owner)) ? [cols ? c : r] : []))
test('A long back edge keeps its label beside the turn at one of its ends, not mid-span', () => {
  for (const w of W) {
    const r = X('er-ok-19', w); assert.ok(!('reason' in r), `er-ok-19@${w}`); assert.equal(validate(r.drawing), null)
    const ends = ['A', 'C'].map(n => extent(r.drawing, n))
const  body = Math.max(...ends.flat())  // the legend lies below the body
    const label = extent(r.drawing, 'r2:label').filter(row => row <= body)
    assert.ok(label.length > 0 && ends.every(e => e.length > 0), `er-ok-19@${w} owners`)
    const gap = Math.min(...ends.map(e => Math.min(Math.abs(Math.min(...label) - Math.max(...e)), Math.abs(Math.min(...e) - Math.max(...label)))))
    assert.ok(gap <= 2, `er-ok-19@${w} label ${gap} rows from the nearer end\n${text(r.drawing).join('\n')}`)
  }
})

test('A 2-cycle draws as two parallel edges between its nodes, the back edge in the nearest free column', () => {
  for (const w of W) {
    const r = X('state-ok-01', w); assert.ok(!('reason' in r), `state-ok-01@${w}`); assert.equal(validate(r.drawing), null)
    const still = extent(r.drawing, 'Still')
const  moving = extent(r.drawing, 'Moving')
const  back = extent(r.drawing, 't3')
    const down = extent(r.drawing, 't2', true)
const  up = extent(r.drawing, 't3', true)
    assert.ok(back.every(row => row > Math.max(...still) && row < Math.min(...moving)), `state-ok-01@${w} t3 leaves the span\n${text(r.drawing).join('\n')}`)
    assert.ok(Math.min(...up.map(c => Math.min(...down.map(d => Math.abs(c - d))))) >= 1, `state-ok-01@${w} t2 and t3 share a column\n${text(r.drawing).join('\n')}`)
  }
})

const BENDS = new Set([...'┌┐└┘'])
test('An exit into a crowded end mark comes in from the side nearer its source, not around it', () => {
  for (const w of W) {
    const r = X('state-ok-01', w); assert.ok(!('reason' in r), `state-ok-01@${w}`); assert.equal(validate(r.drawing), null)
    const bends = r.drawing.cells.flat().filter((x: any) => x?.kind === 'line' && BENDS.has(x.ch) && x.segs?.some((g: any) => g.owner === 't5'))
    assert.ok(bends.length <= 2, `state-ok-01@${w} t5 bends ${bends.length}\n${text(r.drawing).join('\n')}`)
  }
})
