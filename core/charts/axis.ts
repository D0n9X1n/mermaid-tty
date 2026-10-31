// The chart tick rule (plan C §4, T47): a ─ rule with ┬ at each kept tick, and the kept ticks' labels on the row below it.
import { createCanvas, type Drawing } from '../canvas.ts'
import { width } from '../width.ts'

// A tick at a cell of the field, and its label: a left label starts at the cell, a right label ends at it.
export type Tick = { cell: number; label: string; align: 'left' | 'right' }

// Row 0 is the field's w cells from column left: ─ caps with ┬ at each kept tick, in the frame role, owned by owner. Row 1
// draws each kept label in the value role, owned by `${owner}.t<i>`, i the tick's input index. expect places each label and
// each ┬, so a label stays under its tick and no tick moves. Ticks are taken in order: one
// stays when its label's columns lie in the field and start at least 2 after the last kept label's end, and any other drops
// with its label, so no label leaves the field or meets another (spec C rule 6). The drawing is columns wide.
export function axisRows(left: number, w: number, ticks: readonly Tick[], columns: number, owner: string): Drawing {
  const kept: { i: number; t: Tick; start: number }[] = []
  let end = -Infinity                                                // the last cell of the last kept label
  for (const [i, t] of ticks.entries()) {
    const n = width(t.label)
const  start = t.align === 'left' ? t.cell : t.cell - n + 1
    if (start < 0 || start + n > w || start < end + 2) { continue }
    kept.push({ i, t, start }); end = start + n - 1
  }
  const c = createCanvas(2, Math.max(0, left + w), columns)
const  marked = new Set(kept.map(k => k.t.cell))
  c.cap(0, left, Array.from({ length: w }, (_, x) => (marked.has(x) ? '┬' : '─')).join(''), 'frame', owner)
  for (const { i, t, start } of kept) { c.text(1, left + start, t.label, 'value', `${owner}.t${i}`) }
  return c.toDrawing({ labels: kept.map(({ i, t, start }) => ({ owner: `${owner}.t${i}`, text: t.label, at: { r: 1, c: left + start } })),
    edges: [], edgeLabels: [], frames: [], glyphs: kept.map(({ t }) => ({ owner, ch: '┬', at: { r: 0, c: left + t.cell } })) })
}
