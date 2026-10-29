// The timeline module (plan C T83; matrix, timeline): LR draws one column per period, in source order, under the title
// and the section names: its pill, an axis row of ─ with ● at each column's start, then its events. TD, and LR's last
// step, draw a left axis: ● and the period on one row, then │ and each indented event, a section name on its own row.
// It registers itself on import, as flowchart's does.
import { createCanvas, type Canvas, type Drawing } from '../../canvas.ts'
import { heading, stack } from '../../charts/sheet.ts'
import { fail, isFail, type Fail } from '../../fail.ts'
import type { Step } from '../../fit.ts'
import { register, type DiagramModule } from '../../registry.ts'
import { wrap, type Piece } from '../../text.ts'
import type { SeriesKey } from '../../themes.ts'
import type { Expect } from '../../validate.ts'
import { width } from '../../width.ts'
import { parseTimeline, type Timeline } from './parse.ts'

const LR: readonly Step[] = ['natural', 'tight', 'wrap', 'lrToTd'], TD: readonly Step[] = ['natural', 'wrap']
const ink = (k: number): SeriesKey => `s${k % 8 + 1}` as SeriesKey
const widest = (ps: readonly Piece[]): number => Math.max(0, ...ps.map(p => width(p.text)))

// t's rows at most max cells wide: split at each lowercase <br>, the only break Mermaid 12.2.0 makes in a timeline (parse.ts),
// so <BR> or <br/> draws as written; each line wrapped. A later line's first piece joins '\n', so validate reads one label.
// null if a word is wider than max.
function pieces(t: string, max: number): Piece[] | null {
  const out: Piece[] = []
  for (const [i, line] of t.split('<br>').entries()) {
    const ps = wrap(line, max)
    if (!ps) return null
    ps.forEach((p, j) => out.push(j > 0 || i === 0 ? p : { ...p, join: '\n' }))
  }
  return out
}
// ps drawn down from row r at column c in ink, owned by owner; its row count.
function put(cv: Canvas, ps: readonly Piece[], r: number, c: number, i: SeriesKey, owner: string): number {
  ps.forEach((p, j) => cv.text(r + j, c, p.text, i, owner, j > 0 ? p.join : undefined))
  return ps.length
}
const label = (t: string): string => t.split('<br>').join('\n')

// Each period with its owner index k, its section's index s, and its ink: its section's, when sections are named; else
// the next series ink, or s1 for every period without multicolor (Mermaid applies the option only without sections).
type Item = { k: number; s: number; text: string; events: string[]; ink: SeriesKey }
function items(tl: Timeline): Item[] {
  const named = tl.sections.some(s => s.name !== null)
  return tl.sections.flatMap((sec, s) => sec.periods.map(p => ({ s, text: p.text, events: p.events })))
    .map((p, k) => ({ ...p, k, ink: ink(named ? p.s : tl.multicolor ? k : 0) }))
}

// LR at step. A column is as wide as its widest pill, a pill its text with a pad cell each side, its events pills too;
// the gap is 2 at natural, else 1. wrap caps every column at the largest w with n·w + (n − 1) ≤ columns, wrapping pills
// to w − 2 and a section name to its span at that cap less 2. A section name wider than its span widens its last
// column. A section with no period has no column to span, so it fails here and draws at lrToTd. 'too-wide' if a word
// is wider than its cap, or the columns and gaps are wider than columns: the axis row runs across all of them.
function lr(tl: Timeline, step: Step, columns: number): Drawing | Fail {
  const its = items(tl), n = its.length, gap = step === 'natural' ? 2 : 1
  const w = step === 'wrap' ? Math.floor((columns + 1) / n) - 1 : Infinity
  const heads = its.map(p => pieces(p.text, w - 2)), evs = its.map(p => p.events.map(e => pieces(e, w - 2)))
  if (heads.some(h => !h) || evs.flat().some(e => !e)) return fail('too-wide')
  const cw = its.map((_, i) => Math.max(widest(heads[i]!), ...evs[i]!.map(e => widest(e!))) + 2)
  const spans = tl.sections.map((_, s) => its.filter(p => p.s === s).map(p => p.k))
  const names: Piece[][] = []
  for (const [s, sec] of tl.sections.entries()) {
    if (sec.name === null) continue
    const ks = spans[s]!, ps = pieces(sec.name, ks.length * (w + 1) - 3)
    if (ks.length === 0) return fail('empty-section')
    if (!ps) return fail('too-wide')
    const span = ks.reduce((t, k) => t + cw[k]!, 0) + gap * (ks.length - 1), need = widest(ps) + 2
    if (need > span) cw[ks.at(-1)!]! += need - span
    names[s] = ps
  }
  const total = cw.reduce((t, c) => t + c, 0) + gap * Math.max(0, n - 1)
  if (total > columns) return fail('too-wide')
  const x = cw.map((_, i) => cw.slice(0, i).reduce((t, c) => t + c + gap, 0))
  const S = Math.max(0, ...names.map(ps => ps?.length ?? 0)), P = Math.max(0, ...heads.map(h => h!.length))
  const E = Math.max(0, ...evs.map(es => es.reduce((t, e) => t + e!.length, 0)))
  const cv = createCanvas(S + P + 1 + E, total, columns), labels: Expect['labels'][number][] = []
  tl.sections.forEach((sec, s) => {
    if (sec.name === null) return
    put(cv, names[s]!, 0, x[spans[s]![0]!]! + 1, ink(s), `sec${s}`)
    labels.push({ owner: `sec${s}`, text: label(sec.name) })
  })
  for (const p of its) {
    const at = x[p.k]! + 1
    put(cv, heads[p.k]!, S, at, p.ink, `p${p.k}`)
    labels.push({ owner: `p${p.k}`, text: label(p.text) })
    let r = S + P + 1
    p.events.forEach((e, j) => {
      r += put(cv, evs[p.k]![j]!, r, at, p.ink, `p${p.k}.e${j}`)
      labels.push({ owner: `p${p.k}.e${j}`, text: label(e) })
    })
  }
  const dots = new Map(its.map(p => [x[p.k]!, p]))
  for (let c = 0; c < total; c++) {
    const p = dots.get(c)
    if (p) cv.cap(S + P, c, '●', p.ink, `p${p.k}:mark`)
    else cv.cap(S + P, c, '─', 'edge', 'axis')
  }
  return cv.toDrawing({ labels, edges: [], edgeLabels: [], frames: [] })
}

// TD, unwrapped, or with wrapped true: section names wrap to columns, periods to columns − 2 and events to columns − 4. A
// section name takes its own rows before its first period. A period's ● and pill share its first row; each later row it
// takes, its pill's and its events', starts with │, and an event's pill sits after two blank cells. 'too-wide' if a word
// is wider than its field, or, unwrapped, a row is wider than columns: rows end at their text, as validate measures them.
function td(tl: Timeline, wrapped: boolean, columns: number): Drawing | Fail {
  const its = items(tl), cap = (less: number) => (wrapped ? columns - less : Infinity)
  const names = tl.sections.map(s => (s.name === null ? [] : pieces(s.name, cap(0))))
  const heads = its.map(p => pieces(p.text, cap(2))), evs = its.map(p => p.events.map(e => pieces(e, cap(4))))
  if (names.some(x => !x) || heads.some(h => !h) || evs.flat().some(e => !e)) return fail('too-wide')
  const wide = Math.max(...names.map(x => widest(x!)), ...heads.map(h => widest(h!) + 2), ...evs.flat().map(e => widest(e!) + 4))
  if (wide > columns) return fail('too-wide')
  const height = names.reduce((t, x) => t + x!.length, 0) + heads.reduce((t, h) => t + h!.length, 0) +
    evs.flat().reduce((t, e) => t + e!.length, 0)
  const cv = createCanvas(height, wide, columns), labels: Expect['labels'][number][] = []
  let r = 0
  tl.sections.forEach((sec, s) => {
    if (sec.name !== null) {
      r += put(cv, names[s]!, r, 0, ink(s), `sec${s}`)
      labels.push({ owner: `sec${s}`, text: label(sec.name) })
    }
    for (const p of its.filter(q => q.s === s)) {
      const top = r
      cv.cap(r, 0, '●', p.ink, `p${p.k}:mark`)
      r += put(cv, heads[p.k]!, r, 2, p.ink, `p${p.k}`)
      labels.push({ owner: `p${p.k}`, text: label(p.text) })
      p.events.forEach((e, j) => {
        r += put(cv, evs[p.k]![j]!, r, 4, p.ink, `p${p.k}.e${j}`)
        labels.push({ owner: `p${p.k}.e${j}`, text: label(e) })
      })
      for (let y = top + 1; y < r; y++) cv.cap(y, 0, '│', 'edge', 'axis')
    }
  })
  return cv.toDrawing({ labels, edges: [], edgeLabels: [], frames: [] })
}

// LR, and a bare header: natural, tight, wrap, then lrToTd, which draws TD wrapped. TD: natural, unwrapped, then wrap.
// lrToTd needs no unwrapped try first: TD unwrapped fits only when every text fits its field, and then wrapping to those
// fields changes nothing. Any step off the ladder fails 'step'. The title heads the body, wrapped at columns (common rule 3).
function layout(tl: Timeline, step: Step, columns: number): Drawing | Fail {
  if (!(tl.dir === 'TD' ? TD : LR).includes(step)) return fail('step')
  const body = tl.dir === 'TD' || step === 'lrToTd' ? td(tl, step !== 'natural', columns) : lr(tl, step, columns)
  if (isFail(body) || tl.title === null) return body
  const head = heading(tl.title, 'title', 'title', columns)
  return isFail(head) ? head : stack([head, body], columns)
}

export const timeline: DiagramModule<Timeline> = { type: 'timeline', parse: parseTimeline,
  steps: tl => (tl.dir === 'TD' ? TD : LR), layout }

register(timeline as DiagramModule)
