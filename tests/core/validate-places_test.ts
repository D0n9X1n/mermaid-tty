import test from 'node:test'
import assert from 'node:assert/strict'
import { createCanvas, type Drawing } from '../../core/canvas.ts'
import { validate } from '../../core/validate.ts'
import { explain } from '../../core/render.ts'
import { readdirSync, readFileSync } from 'node:fs'
const X = (src: string, columns: number) => (explain(src, { columns, theme: 'mono' }) as any).drawing as Drawing
// Two placed labels: '8' at (0, 0) owned by hi, '0' at (2, 0) owned by lo.
function ticks(): Drawing {
  const c = createCanvas(3, 2, 80)
  c.text(0, 0, '8', 'value', 'hi')
  c.text(2, 0, '0', 'value', 'lo')
  return c.toDrawing({
    labels: [
      { owner: 'hi', text: '8', at: { r: 0, c: 0 } },
      { owner: 'lo', text: '0', at: { r: 2, c: 0 } },
    ],
    edges: [],
    edgeLabels: [],
    frames: [],
  })
}
const swap = (d: Drawing, [r1, c1]: [number, number], [r2, c2]: [number, number]) => {
  const x = d.cells[r1]![c1]!
  d.cells[r1]![c1] = d.cells[r2]![c2]!
  d.cells[r2]![c2] = x
  return d
}
test('C: a label with at passes where its first cell is drawn there', () => assert.equal(validate(ticks()), null))
test('A5.mutation-tests: a placed label drawn elsewhere fails label-misplaced', () => {
  assert.deepEqual(validate(swap(ticks(), [0, 0], [2, 0])), { reason: 'label-misplaced' })
  const d = ticks()
  d.cells[1]![1] = d.cells[0]![0]!
  d.cells[0]![0] = null
  assert.deepEqual(validate(d), { reason: 'label-misplaced' })
})
test('A5.mutation-tests: the xychart 8 and 0 ticks swapped fail label-misplaced', () => {
  const d = X('xychart-beta\nx-axis [a, b]\ny-axis 0 --> 8\nbar [2, 5]', 80)
  assert.equal(validate(d), null)
  assert.deepEqual(validate(swap(d, [0, 0], [8, 0])), { reason: 'label-misplaced' })
})
// Two h bars of 16 eighths: b0 at (0, 1), b1 at (1, 1); and a mark m drawing ┬ at (2, 0) and (2, 2), ─ between.
function placed(): Drawing {
  const c = createCanvas(3, 3, 80)
  c.cap(0, 1, '██', 's1', 'b0')
  c.cap(1, 1, '██', 's2', 'b1')
  c.cap(2, 0, '┬─┬', 'frame', 'm')
  return c.toDrawing({
    labels: [],
    edges: [],
    edgeLabels: [],
    frames: [],
    bars: [
      { owner: 'b0', eighths: 16, axis: 'h', at: { r: 0, c: 1 } },
      { owner: 'b1', eighths: 16, axis: 'h', at: { r: 1, c: 1 } },
    ],
    glyphs: [
      { owner: 'm', ch: '┬', at: { r: 2, c: 0 } },
      { owner: 'm', ch: '┬', at: { r: 2, c: 2 } },
    ],
  })
}
test('C: bars and glyphs with at pass where they are drawn', () => assert.equal(validate(placed()), null))
test('A5.mutation-tests: a bar off its base fails bar-misplaced; two bars swapped fail', () => {
  const d = placed()
  d.cells[0]![0] = d.cells[0]![2]!
  d.cells[0]![2] = null
  assert.deepEqual(validate(d), { reason: 'bar-misplaced' })
  const e = placed()
  ;[e.cells[0], e.cells[1]] = [e.cells[1]!, e.cells[0]!]
  assert.deepEqual(validate(e), { reason: 'bar-misplaced' })
})
test('A5.mutation-tests: a placed glyph moved, or one more drawn, fails glyph-misplaced', () => {
  const d = placed()
  swap(d, [2, 1], [2, 2])
  assert.deepEqual(validate(d), { reason: 'glyph-misplaced' })
  const e = placed()
  e.cells[2]![1] = e.cells[2]![0]!
  assert.deepEqual(validate(e), { reason: 'glyph-misplaced' })
})
// Every chart fixture, at 40, 60 and 80 columns: each label with text, and each bar with a cell, states where it is drawn.
const CHARTS = ['gantt', 'journey', 'pie', 'quadrant', 'timeline', 'xychart']
test('C: every chart places each label with text and each drawn bar', () => {
  const unplaced: string[] = []
  for (const dir of CHARTS) {
    for (const f of readdirSync(new URL(`../../fixtures/${dir}/`, import.meta.url)).filter((f) =>
      /-ok-\d+\.mmd$/.test(f),
    )) {
      for (const columns of [40, 60, 80]) {
        const d = X(readFileSync(new URL(`../../fixtures/${dir}/${f}`, import.meta.url), 'utf8'), columns)
        if (!d) {
          continue
        }
        assert.equal(validate(d), null, `${f} @${columns}`)
        for (const l of d.expect.labels) {
          if (l.text.trim() !== '' && !l.at) {
            unplaced.push(`${f} @${columns} ${l.owner}`)
          }
        }
        for (const b of d.expect.bars ?? []) {
          if (b.eighths > 0 && !b.at) {
            unplaced.push(`${f} @${columns} bar ${b.owner}`)
          }
        }
      }
    }
  }
  assert.deepEqual(unplaced.slice(0, 10), [])
})
// d with owner o's text and cont cells moved by (dr, dc), into cells that must be free, or past a row's end.
function shove(d: Drawing, o: string, dr: number, dc: number): Drawing {
  const mine = d.cells.flatMap((row, r) =>
    row.flatMap((x, c) => (x && (x.kind === 'text' || x.kind === 'cont') && x.owners[0] === o ? [{ r, c, x }] : [])),
  )
  for (const p of mine) {
    d.cells[p.r]![p.c] = null
  }
  for (const p of mine) {
    assert.equal(d.cells[p.r + dr]![p.c + dc] ?? null, null)
    d.cells[p.r + dr]![p.c + dc] = p.x
  }
  return d
}
test('A5.mutation-tests: a diagram title moved off the top-left cell fails label-misplaced', () => {
  const d = X('---\ntitle: My flow\n---\nflowchart TD\nA --> B', 60)
  assert.equal(validate(d), null)
  assert.deepEqual(validate(shove(d, 'title', 0, 1)), { reason: 'label-misplaced' })
})
test('A5.mutation-tests: a node or note label moved out of its pill fails label-unbound, edges or none', () => {
  const f = X('flowchart TD\nA ~~~ B\nA --> C', 60)
  const s = X('sequenceDiagram\nA->>B: hi\nNote left of A: n', 60)
  assert.equal(validate(f), null)
  assert.equal(validate(s), null)
  const B = f.cells.findIndex((row) => row.some((x) => x?.kind === 'text' && x.owners[0] === 'B'))
  assert.deepEqual(validate(shove(f, 'B', -1, 0)), { reason: 'label-unbound' }, `B on row ${B}`)
  assert.deepEqual(validate(shove(s, 'n0', -1, 0)), { reason: 'label-unbound' })
})
