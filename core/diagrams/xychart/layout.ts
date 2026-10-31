// The xychart module (plan C T72; matrix, xychart): an 8-row plot over an axis row, a group of sub-columns per category
// and a value row per series (vertical), or one row per category and series over a tick rule (horizontal). The header's
// orientation draws first; a vertical chart that does not fit is redrawn horizontal, then with W = 10 and wrapped
// categories. It registers itself on import, as flowchart's does.
import { createCanvas, type Drawing } from '../../canvas.ts'
import { axisRows } from '../../charts/axis.ts'
import { hbar, vbar } from '../../charts/bars.ts'
import { add, cmp, dec, div, sub, toExact, type Dec } from '../../charts/decimal.ts'
import { cellOf, eighths, rowAt } from '../../charts/scale.ts'
import { heading, placed, stack } from '../../charts/sheet.ts'
import { fail, isFail, type Fail } from '../../fail.ts'
import type { Step } from '../../fit.ts'
import { register, type DiagramModule } from '../../registry.ts'
import { wrap, type Piece } from '../../text.ts'
import type { Ink, SeriesKey } from '../../themes.ts'
import type { Expect } from '../../validate.ts'
import { width } from '../../width.ts'
import { parseXy, type Xy } from './parse.ts'

type Label = Expect['labels'][number]
type Bar = NonNullable<Expect['bars']>[number]
type Glyph = NonNullable<Expect['glyphs']>[number]
const widest = (xs: readonly string[]): number => Math.max(0, ...xs.map(width))
// Every label, bar and glyph states its cell (at), so a tick, category, value, bar or point cannot leave its place.
const expect = (labels: Label[], bars: Bar[] = [], glyphs: Glyph[] = []): Expect => ({
  labels,
  edges: [],
  edgeLabels: [],
  frames: [],
  bars,
  glyphs,
})
// A part of a sheet: a drawing, a Fail, or null for an absent one, as a missing axis title is.
type Part = Drawing | Fail | null
// text's heading rows in ink, owned by owner; null without text.
const head = (text: string | null, ink: Ink, owner: string, columns: number): Part =>
  text === null ? null : heading(text, ink, owner, columns)

// The plot's rows, and each line series' marker, in source order over the line series.
const H = 8
const MARKERS = [...'●◆▲■○◇△□']

// The y range: the explicit one, else y0 = min(0, smallest value) and y1 = max(0, largest), as parse checked it; M = y1
// − y0.
// lo, hi and mid are the tick labels y0, y1 and (y0 + y1)/2: an explicit bound as written, a computed bound and the
// midpoint
// as the shortest exact decimal. Every bound is a source number, whose denominator is a power of 10, so it and the
// midpoint
// have one.
type Scale = { y0: Dec; M: Dec; lo: string; hi: string; mid: string }
function scale(xy: Xy): Scale {
  const vs = xy.series.flatMap((s) => s.values.map((v) => v.value))
  const zero = dec(0)
  const y0 = xy.range?.lo.value ?? vs.reduce((a, v) => (cmp(v, a) < 0 ? v : a), zero)
  const y1 = xy.range?.hi.value ?? vs.reduce((a, v) => (cmp(v, a) > 0 ? v : a), zero)
  return {
    y0,
    M: sub(y1, y0),
    lo: xy.range?.lo.raw ?? toExact(y0)!,
    hi: xy.range?.hi.raw ?? toExact(y1)!,
    mid: toExact(div(add(y0, y1), dec(2))!)!,
  }
}

// A series as drawn: its kind, its index k over all series in source order, its ink s<k mod 8 + 1>, its tag (a, b, …
// for
// bars, its marker for lines), its name, its text (its tag, then its name if it has one) and its values, each as
// written and
// measured from y0.
type Drawn = {
  kind: 'bar' | 'line'
  k: number
  ink: SeriesKey
  tag: string
  name: string | null
  text: string
  values: { raw: string; v: Dec }[]
}
function drawn(xy: Xy, y0: Dec): Drawn[] {
  let bars = 0
  let lines = 0
  return xy.series.map((s, k) => {
    const tag = s.kind === 'bar' ? String.fromCharCode(97 + bars++) : MARKERS[lines++]!
    return {
      kind: s.kind,
      k,
      ink: `s${(k % 8) + 1}` as SeriesKey,
      tag,
      name: s.name,
      text: s.name === null ? tag : `${tag} ${s.name}`,
      values: s.values.map((n) => ({ raw: n.raw, v: sub(n.value, y0) })),
    }
  })
}

// The vertical drawing's parts: the y-axis title, the plot over its axis row and category row, the x-axis title, then
// one
// row per series, its text in the gutter and its values right-aligned in the groups. G is 1 + the widest tick label or
// text. A group is a gap cell, then c content cells, c the widest category or value or the number of series; each line
// series takes 1 cell and the bar series share the rest evenly, rounded down, in source order. 'too-wide' if the chart,
// G + 1 + n·(c + 1) cells, is wider than columns.
function vertical(xy: Xy, sc: Scale, ss: Drawn[], columns: number): Part[] | Fail {
  const cats = xy.categories ?? []
  const n = xy.categories?.length ?? ss[0]?.values.length ?? 0
  const c = Math.max(widest(cats), widest(ss.flatMap((s) => s.values.map((v) => v.raw))), ss.length)
  const G = 1 + Math.max(widest([sc.lo, sc.hi, sc.mid]), widest(ss.map((s) => s.text)))
  const wide = G + 1 + n * (c + 1)
  if (wide > columns) {
    return fail('too-wide')
  }

  const lines = ss.filter((s) => s.kind === 'line').length
  const share = Math.floor((c - lines) / Math.max(1, ss.length - lines))
  let at = 0
  const lane = ss.map((s) => {
    const x = at
    at += s.kind === 'line' ? 1 : share
    return x
  }) // each series' sub-column
  const left = (j: number) => G + 2 + j * (c + 1) // group j's first content cell
  // Canvas rows 0 … 7 are plot rows 8 … 1, row 8 is the axis row and row 9 the categories.
  const plot = createCanvas(H + 1 + (xy.categories ? 1 : 0), wide, columns)
  const labels: Label[] = []
  const bs: Bar[] = []
  const gs: Glyph[] = []
  for (let r = 0; r <= H; r++) {
    const ch = r === H ? '└' : r % (H / 2) === 0 ? '┤' : '│'
    plot.cap(r, G, ch, 'frame', 'axis')
    gs.push({ owner: 'axis', ch, at: { r, c: G } })
  }

  plot.cap(
    H,
    G + 1,
    Array.from({ length: n * (c + 1) }, (_, x) => (x % (c + 1) === 1 ? '┬' : '─')).join(''),
    'frame',
    'axis',
  )
  for (let j = 0; j < n; j++) {
    gs.push({ owner: 'axis', ch: '┬', at: { r: H, c: left(j) } })
  }

  const ticks = [
    [H, sc.lo],
    [0, sc.hi],
    [H / 2, sc.mid],
  ] as const
  ticks.forEach(([r, t], i) => {
    const at = { r, c: G - 1 - width(t) }
    plot.text(at.r, at.c, t, 'value', `axis.t${i}`)
    labels.push({ owner: `axis.t${i}`, text: t, at })
  })
  cats.forEach((cat, j) => {
    plot.text(H + 1, left(j), cat, 'label', `c${j}`)
    labels.push({ owner: `c${j}`, text: cat, at: { r: H + 1, c: left(j) } })
  })
  for (const s of ss) {
    s.values.forEach(({ v }, j) => {
      const x = left(j) + lane[s.k]!
      if (s.kind === 'line') {
        const at = { r: H - rowAt(v, sc.M, H), c: x }
        plot.cap(at.r, at.c, s.tag, s.ink, `x${s.k}:mark`)
        gs.push({ owner: `x${s.k}:mark`, ch: s.tag, at })
        return
      }

      const e = eighths(v, sc.M, H)
      vbar(e, H).forEach((g, r) => {
        if (g !== ' ') {
          plot.cap(r, x, g.repeat(share), s.ink, `x${s.k}.b${j}`)
        }
      })
      bs.push({ owner: `x${s.k}.b${j}`, eighths: e, axis: 'v', lanes: share, at: { r: H - 1, c: x } })
    })
  }

  const rows = createCanvas(ss.length, wide, columns)
  const named: Label[] = []
  for (const s of ss) {
    rows.text(s.k, 0, s.text, 'label', `x${s.k}`)
    named.push({ owner: `x${s.k}`, text: s.text, at: { r: s.k, c: 0 } })
    s.values.forEach(({ raw }, j) => {
      const at = { r: s.k, c: left(j) + c - width(raw) }
      rows.text(at.r, at.c, raw, 'value', `x${s.k}.v${j}`)
      named.push({ owner: `x${s.k}.v${j}`, text: raw, at })
    })
  }

  return [
    head(xy.yTitle, 'label', 'yTitle', columns),
    plot.toDrawing(expect(labels, bs, gs)),
    head(xy.xTitle, 'label', 'xTitle', columns),
    rows.toDrawing(expect(named)),
  ]
}

// The horizontal drawing's parts: the x-axis title; per category, one row per series, each the category (first row
// only,
// padded to C), its tag, its field of W cells and its value right-aligned to V; the tick rule under the field, y0 at
// its
// left end and y1 at its right; the y-axis title; then the legend. wrapped: W = 10 and categories wrap to columns − V −
// 14,
// a category's later pieces taking the rows below (more rows than series if need be); else W = min(60, columns − C − V
// − 4),
// and 'too-wide' when that is under 10. Either is 'too-wide' when y0 and y1, with a space between them, are wider than
// W.
function horizontal(xy: Xy, sc: Scale, ss: Drawn[], columns: number, wrapped: boolean): Part[] | Fail {
  const n = xy.categories?.length ?? ss[0]?.values.length ?? 0
  const V = widest(ss.flatMap((s) => s.values.map((v) => v.raw)))
  const cats: { text: string; ps: Piece[] }[] = []
  for (const text of xy.categories ?? []) {
    const ps = wrap(text, wrapped ? columns - V - 14 : Infinity)
    if (!ps) {
      return fail('word-too-wide')
    }

    cats.push({ text, ps })
  }

  const C = widest(cats.flatMap((c) => c.ps.map((p) => p.text)))
  const W = wrapped ? 10 : Math.min(60, columns - C - V - 4)
  if (W < 10 || width(sc.lo) + 1 + width(sc.hi) > W) {
    return fail('too-wide')
  }

  const tops: number[] = [] // each group's first row
  let h = 0
  for (let j = 0; j < n; j++) {
    tops.push(h)
    h += Math.max(ss.length, cats[j]?.ps.length ?? 0)
  }

  const grid = createCanvas(h, C + W + V + 4, columns)
  const labels: Label[] = []
  const bs: Bar[] = []
  const gs: Glyph[] = []
  cats.forEach(({ text, ps }, j) => {
    ps.forEach((p, i) => grid.text(tops[j]! + i, 0, p.text, 'label', `c${j}`, i > 0 ? p.join : undefined))
    labels.push(placed(`c${j}`, text, ps, tops[j]!, 0))
  })
  for (const s of ss) {
    s.values.forEach(({ raw, v }, j) => {
      const r = tops[j]! + s.k
      const mark = (c: number, ink: Ink) => {
        grid.cap(r, c, s.tag, ink, `x${s.k}:mark`)
        gs.push({ owner: `x${s.k}:mark`, ch: s.tag, at: { r, c } })
      }
      mark(C + 1, 'label')
      if (s.kind === 'line') {
        mark(C + 3 + Math.min(W - 1, cellOf(v, sc.M, W)), s.ink)
      } else {
        const e = eighths(v, sc.M, W)
        grid.cap(r, C + 3, hbar(e), s.ink, `x${s.k}.b${j}`)
        bs.push({ owner: `x${s.k}.b${j}`, eighths: e, axis: 'h', lanes: 1, at: { r, c: C + 3 } })
      }

      const at = { r, c: C + W + 4 + V - width(raw) }
      grid.text(at.r, at.c, raw, 'value', `x${s.k}.v${j}`)
      labels.push({ owner: `x${s.k}.v${j}`, text: raw, at })
    })
  }

  const axis = axisRows(
    C + 3,
    W,
    [
      { cell: 0, label: sc.lo, align: 'left' },
      { cell: W - 1, label: sc.hi, align: 'right' },
    ],
    columns,
    'axis',
  )
  return [
    head(xy.xTitle, 'label', 'xTitle', columns),
    grid.toDrawing(expect(labels, bs, gs)),
    axis,
    head(xy.yTitle, 'label', 'yTitle', columns),
    legend(ss, columns),
  ]
}

// The legend: a row per named series, in source order, its tag, a space, then its name wrapped to columns − 2, each
// later
// piece indented under the first. Unnamed series are left out. 'word-too-wide' if a word is wider than columns − 2.
function legend(ss: Drawn[], columns: number): Part {
  const rows: { s: Drawn; ps: Piece[] }[] = []
  for (const s of ss) {
    if (s.name === null) {
      continue
    }

    const ps = wrap(s.name, columns - 2)
    if (!ps) {
      return fail('word-too-wide')
    }

    rows.push({ s, ps })
  }

  const lines = rows.flatMap((x) => x.ps)
  const cv = createCanvas(lines.length, 2 + widest(lines.map((p) => p.text)), columns)
  const labels: Label[] = []
  let r = 0
  for (const { s, ps } of rows) {
    ps.forEach((p, i) =>
      cv.text(
        r + i,
        i > 0 ? 2 : 0,
        i > 0 ? p.text : `${s.tag} ${p.text}`,
        'label',
        `x${s.k}`,
        i > 0 ? p.join : undefined,
      ),
    )
    labels.push(placed(`x${s.k}`, s.text, [{ text: s.tag }, ...ps.slice(1)], r, 0, 2))
    r += ps.length
  }

  return cv.toDrawing(expect(labels))
}

// A vertical header's ladder: vertical, then horizontal, then horizontal with W = 10; a horizontal header's:
// horizontal,
// then W = 10.
const steps = (xy: Xy): readonly Step[] =>
  xy.orientation === 'vertical' ? ['natural', 'horizontal', 'wrap'] : ['natural', 'wrap']

// natural draws the header's orientation, horizontal a vertical header's chart horizontally, and wrap with W = 10. A
// step
// off the header's ladder fails 'step'.
function layout(xy: Xy, step: Step, columns: number): Drawing | Fail {
  if (!steps(xy).includes(step)) {
    return fail('step')
  }

  const sc = scale(xy)
  const ss = drawn(xy, sc.y0)
  const body =
    step === 'natural' && xy.orientation === 'vertical'
      ? vertical(xy, sc, ss, columns)
      : horizontal(xy, sc, ss, columns, step === 'wrap')
  return sheet(xy.title, body, columns)
}

// The title's heading, then parts, stacked top to bottom columns wide, each absent part left out; or the first Fail.
function sheet(title: string | null, parts: Part[] | Fail, columns: number): Drawing | Fail {
  if (isFail(parts)) {
    return parts
  }

  const out: Drawing[] = []
  for (const p of [head(title, 'title', 'title', columns), ...parts]) {
    if (isFail(p)) {
      return p
    }

    if (p) {
      out.push(p)
    }
  }

  return stack(out, columns)
}

export const xychart: DiagramModule<Xy> = { type: 'xychart', parse: parseXy, steps, layout }

register(xychart as DiagramModule)
