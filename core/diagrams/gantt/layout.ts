// The gantt module (plan C T69; matrix, gantt): under the title, each section's header rows in its series ink, then its
// tasks: a 2-cell status, the name padded to N, the timing padded to T or its key, and the bar field W, then the tick rule
// and labels, and at the keyed steps a legend of the timings. It registers itself on import, as flowchart's does.
import { createCanvas, type Drawing } from '../../canvas.ts'
import { axisRows, type Tick } from '../../charts/axis.ts'
import { hbar } from '../../charts/bars.ts'
import { add, dec, div, sub, type Dec } from '../../charts/decimal.ts'
import { fieldKey, withLegend, type LegendRow } from '../../charts/legend.ts'
import { cellOf, eighths } from '../../charts/scale.ts'
import { heading, stack } from '../../charts/sheet.ts'
import { fail, isFail, type Fail } from '../../fail.ts'
import type { Step } from '../../fit.ts'
import { register, type DiagramModule } from '../../registry.ts'
import { drawable, labelLines, wrap, type Piece } from '../../text.ts'
import type { Ink, SeriesKey } from '../../themes.ts'
import type { Expect } from '../../validate.ts'
import { width } from '../../width.ts'
import { parseGantt, type Gantt, type GanttTask } from './parse.ts'
import { formatAxis, tickStep } from './time.ts'

const STEPS: readonly Step[] = ['natural', 'keyed', 'keyedWrap']
const widest = (xs: readonly string[]): number => Math.max(0, ...xs.map(width))

// The scale: t0, the earliest start, and M = t1 − t0, ms, t1 the latest end. null when M = 0 or there is no task.
type Scale = { t0: number; M: Dec }
function scale(tasks: readonly GanttTask[]): Scale | null {
  if (tasks.length === 0) return null
  const t0 = tasks.reduce((t, x) => Math.min(t, x.start), Infinity), t1 = tasks.reduce((t, x) => Math.max(t, x.end), -Infinity)
  return t1 > t0 ? { t0, M: sub(dec(t1), dec(t0)) } : null
}

// A task's status, bar and ◆ ink: arrow for crit, else note for done, else decision for active, else its section's series.
const inkOf = (t: GanttTask, series: SeriesKey): Ink =>
  t.tags.includes('crit') ? 'arrow' : t.tags.includes('done') ? 'note' : t.tags.includes('active') ? 'decision' : series
// The status cells: ! for crit, then ✓ for done, else ▸ for active.
const statusOf = (t: GanttTask): string =>
  (t.tags.includes('crit') ? '!' : ' ') + (t.tags.includes('done') ? '✓' : t.tags.includes('active') ? '▸' : ' ')

// Why g's text would draw other text than Mermaid 12.2.0 shows: 'section-repeat' for two sections of one name, which
// Mermaid merges into one label; 'section-empty' for a section with no task, whose header Mermaid does not draw; 'entity'
// for a marker, or 'html' for a title Mermaid sanitizes. A task name draws as written, a section name split at any <br>,
// and a title is sanitized, with no <br>.
function undrawable(g: Gantt): Fail | null {
  const title = g.title === null ? null : drawable(g.title, 'sanitized', 'none')
  if (title) return title
  if (new Set(g.sections).size < g.sections.length) return fail('section-repeat')
  if (g.sections.some((_, k) => !g.tasks.some(t => t.section === k))) return fail('section-empty')
  for (const t of g.tasks) { const bad = drawable(t.name, 'plain', 'literal'); if (bad) return bad }
  for (const s of g.sections) { const bad = drawable(s, 'plain', 'any'); if (bad) return bad }
  return null
}

// A step's widths: each name's pieces, N the widest, F the timing or key field, W the bar field, keyed whether keys stand
// for the timings. natural: W = min(60, columns − N − T − 5). keyed: W = min(60, columns − N − 5 − K). keyedWrap: W = 20,
// names wrapped to columns − 25 − K. 'too-wide' for W below 20 or a word wider than its field.
type Plan = { names: Piece[][]; N: number; F: number; W: number; keyed: boolean }
function plan(tasks: readonly GanttTask[], step: Step, columns: number): Plan | Fail {
  const keyed = step !== 'natural', F = keyed ? width(fieldKey(tasks.length - 1)) : widest(tasks.map(t => t.timing))
  const names: Piece[][] = []
  for (const t of tasks) {
    const ps = wrap(t.name, step === 'keyedWrap' ? columns - 25 - F : Infinity)
    if (!ps) return fail('too-wide')
    names.push(ps)
  }
  const N = widest(names.flat().map(p => p.text)), W = step === 'keyedWrap' ? 20 : Math.min(60, columns - N - F - 5)
  return W < 20 ? fail('too-wide') : { names, N, F, W, keyed }
}

// A section's header pieces: its <br> lines (all four spellings), each wrapped at columns; a later line's first piece
// joins with '\n', so validate reads the rows back as one label. null if a word is wider than columns.
function header(name: string, columns: number): Piece[] | null {
  const out: Piece[] = []
  for (const line of labelLines(name)) {
    const ps = wrap(line, columns)
    if (!ps) return null
    ps.forEach((x, j) => out.push(j > 0 ? x : { text: x.text, join: '\n' }))
  }
  return out
}

// The body: each section's header rows in its series ink, owned by sec<k>, then its tasks. Tasks before the first section
// have no header and take s1, so the sections take s2, s3, …; with none, the first section takes s1. Task i's row: its
// status caps, its name pieces from cell 3 (t<i>), its timing (t<i>.t) or key from N + 4, then from the field's cell
// left = N + F + 5 its bar, or a milestone's ◆ at min(W − 1, the cell of start + duration/2). The status, bar and ◆ are
// caps owned by t<i>; its key and bar sit on its name's first row.
function body(g: Gantt, p: Plan, s: Scale, columns: number): Drawing | Fail {
  const heads: Piece[][] = []
  for (const name of g.sections) { const h = header(name, columns); if (!h) return fail('too-wide'); heads.push(h) }
  const shift = g.tasks.some(t => t.section < 0) ? 1 : 0, series = (k: number) => `s${(k + shift) % 8 + 1}` as SeriesKey
  const left = p.N + p.F + 5, height = [...heads, ...p.names].reduce((n, ps) => n + ps.length, 0), t0 = dec(s.t0)
  const cell = (v: Dec) => cellOf(sub(v, t0), s.M, p.W)              // the field cell of time v, ms
  const cv = createCanvas(height, Math.max(left + p.W, widest(heads.flat().map(x => x.text))), columns)
  const labels: Expect['labels'][number][] = [], bars: NonNullable<Expect['bars']>[number][] = []
  let r = 0, shown = -1                                             // shown: the last section whose header is drawn
  const section = (k: number) => {
    heads[k]!.forEach((x, j) => cv.text(r + j, 0, x.text, series(k), `sec${k}`, j > 0 ? x.join : undefined))
    labels.push({ owner: `sec${k}`, text: labelLines(g.sections[k]!).join('\n') }); r += heads[k]!.length
  }
  g.tasks.forEach((t, i) => {
    while (shown < t.section) section(++shown)
    const id = `t${i}`, ink = inkOf(t, series(t.section)), milestone = t.tags.includes('milestone')
    ;[...statusOf(t)].forEach((ch, c) => { if (ch !== ' ') cv.cap(r, c, ch, ink, id) })
    p.names[i]!.forEach((x, j) => cv.text(r + j, 3, x.text, 'label', id, j > 0 ? x.join : undefined))
    if (p.keyed) cv.key(r, p.N + 4, fieldKey(i), 'label', `${id}.t`, false)
    else cv.text(r, p.N + 4, t.timing, 'value', `${id}.t`)
    const e = milestone ? 0 : eighths(sub(dec(t.end), dec(t.start)), s.M, p.W), mid = div(add(dec(t.start), dec(t.end)), dec(2))!
    if (milestone) cv.cap(r, left + Math.min(p.W - 1, cell(mid)), '◆', ink, id)
    else cv.cap(r, left + cell(dec(t.start)), hbar(e), ink, id)
    labels.push({ owner: id, text: t.name }, ...(p.keyed ? [] : [{ owner: `${id}.t`, text: t.timing }]))
    bars.push({ owner: id, eighths: e, axis: 'h' })
    r += p.names[i]!.length
  })
  while (shown < g.sections.length - 1) section(++shown)
  return cv.toDrawing({ labels, edges: [], edgeLabels: [], frames: [], bars })
}

// The tick rule under the field, from cell left: L the width of t0's label, step = tickStep(M, W, L), and a tick at each
// k·step ≤ M, at cell ⌊W·k·step/M⌋, labelled with t0 + k·step; with no step, only t0's. axisRows drops a label that leaves
// the field. M and k·step are exact Numbers: every time lies between year 100, parseDate's least, and 8.64e15 ms, so M plus
// one step stays below 2^53.
function axis(g: Gantt, s: Scale, left: number, W: number, columns: number): Drawing {
  const L = width(formatAxis(s.t0, g.axis)), M = Number(s.M.n), step = tickStep(M, W, L), ticks: Tick[] = []
  for (let k = 0; k === 0 || (step !== null && k * step <= M); k++) {
    const at = k * (step ?? 0)
    ticks.push({ cell: cellOf(dec(at), s.M, W), label: formatAxis(s.t0 + at, g.axis), align: 'left' })
  }
  return axisRows(left, W, ticks, columns, 'axis')
}

// Task i's legend row at the keyed steps: its key, then its timing, owned by t<i>.t.
const legendRow = (t: GanttTask, i: number): LegendRow =>
  ({ key: fieldKey(i), keyInk: 'label', item: `t${i}.t`, cls: 'timing', parts: [{ text: t.timing, ink: 'value', owner: `t${i}.t` }] })

// The title's heading, the body and the tick rule on one sheet, then at the keyed steps the legend under it. Every task's
// timing is keyable. 'step' off the ladder; 'domain' for M = 0 or no task.
function layout(g: Gantt, step: Step, columns: number): Drawing | Fail {
  if (!STEPS.includes(step)) return fail('step')
  const bad = undrawable(g)
  if (bad) return bad
  const s = scale(g.tasks)
  if (!s) return fail('domain')
  const p = plan(g.tasks, step, columns)
  if (isFail(p)) return p
  const b = body(g, p, s, columns)
  if (isFail(b)) return b
  const head = g.title === null ? null : heading(g.title, 'title', 'title', columns)
  if (isFail(head)) return head
  const sheet = stack([...(head ? [head] : []), b, axis(g, s, p.N + p.F + 5, p.W, columns)], columns)
  const keyable = g.tasks.map((_, i) => ({ item: `t${i}.t`, cls: 'timing' }))
  return withLegend(sheet, p.keyed ? g.tasks.map(legendRow) : [], columns, keyable)
}

export const gantt: DiagramModule<Gantt> = { type: 'gantt', parse: parseGantt, steps: () => STEPS, layout }

register(gantt as DiagramModule)
