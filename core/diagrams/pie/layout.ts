// The pie module (plan C T63; matrix, pie): a row per slice, largest first, each its label, a bar of its share of the
// field, its value as written and its percentage, under the title; a wrapped label's later pieces take the rows below.
// It registers itself on import, as flowchart's does.
import { createCanvas, type Drawing } from '../../canvas.ts'
import { hbar } from '../../charts/bars.ts'
import { add, cmp, dec } from '../../charts/decimal.ts'
import { eighths, percent } from '../../charts/scale.ts'
import { heading, placed, stack } from '../../charts/sheet.ts'
import { fail, isFail, type Fail } from '../../fail.ts'
import type { Step } from '../../fit.ts'
import { register, type DiagramModule } from '../../registry.ts'
import { wrap, type Piece } from '../../text.ts'
import type { SeriesKey } from '../../themes.ts'
import type { Expect } from '../../validate.ts'
import { width } from '../../width.ts'
import { parsePie, type Pie } from './parse.ts'

const widest = (xs: readonly string[]): number => Math.max(0, ...xs.map(width))

// Both steps draw each label as wrap's pieces, so a run of spaces draws as one and the ends trim, as validate reads it.
// A label never splits at a <br>: Mermaid shows a slice's <br> as written, so it wraps only at spaces.
// natural: labels unwrapped, and the bar field W = min(60, columns − N − V − P − 3), at least 10. wrap: W = 10, and
// labels
// wrap to columns − V − P − 13, so the row still fits. Any other step fails 'step'.
function layout(pie: Pie, step: Step, columns: number): Drawing | Fail {
  if (step !== 'natural' && step !== 'wrap') {
    return fail('step')
  }
  // toSorted is stable, so ties keep source order.
  const ranked = pie.slices.toSorted((a, b) => cmp(b.value, a.value))
  const total = ranked.reduce((t, s) => add(t, s.value), dec(0))
  const pcts = ranked.map((s) => percent(s.value, total))
  const V = widest(ranked.map((s) => s.raw))
  const P = widest(pcts)
  const lines: Piece[][] = []
  for (const s of ranked) {
    const ps = wrap(s.label, step === 'natural' ? Infinity : columns - V - P - 13)
    if (!ps) {
      return fail('word-too-wide')
    }

    lines.push(ps)
  }

  const N = widest(lines.flat().map((p) => p.text))
  const W = step === 'natural' ? Math.min(60, columns - N - V - P - 3) : 10
  if (W < 10) {
    return fail('too-wide')
  }

  const cv = createCanvas(lines.flat().length, N + W + V + P + 3, columns)
  const labels: Expect['labels'][number][] = []
  const bars: NonNullable<Expect['bars']>[number][] = []
  let r = 0 // the slice's first row: its bar's
  ranked.forEach((s, i) => {
    const id = `s${s.order}`
    const e = eighths(s.value, total, W)
    const pct = pcts[i]!
    const ps = lines[i]!
    ps.forEach((p, j) => cv.text(r + j, 0, p.text, 'label', id, j > 0 ? p.join : undefined))
    // A slice's row binds its label, bar, value and share: each states its cell on the slice's first row.
    const v = { r, c: N + W + 2 + V - width(s.raw) }
    const q = { r, c: N + W + V + 3 + P - width(pct) }
    cv.cap(r, N + 1, hbar(e), `s${(s.order % 8) + 1}` as SeriesKey, id)
    cv.text(v.r, v.c, s.raw, 'value', `${id}.v`)
    cv.text(q.r, q.c, pct, 'value', `${id}.p`)
    labels.push(
      placed(id, s.label, ps, r, 0),
      { owner: `${id}.v`, text: s.raw, at: v },
      { owner: `${id}.p`, text: pct, at: q },
    )
    bars.push({ owner: id, eighths: e, axis: 'h', at: { r, c: N + 1 } })
    r += ps.length
  })
  const body = cv.toDrawing({ labels, edges: [], edgeLabels: [], frames: [], bars })
  if (pie.title === null) {
    return body
  }

  const head = heading(pie.title, 'title', 'title', columns)
  return isFail(head) ? head : stack([head, body], columns)
}

export const pie: DiagramModule<Pie> = { type: 'pie', parse: parsePie, steps: () => ['natural', 'wrap'], layout }

register(pie as DiagramModule)
