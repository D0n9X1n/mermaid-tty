// The sequence diagram module (plan A §6, T24): its parser, its fit ladder, and each step's layout at the given columns.
// One lifeline per participant, in declaration order, under a header of pills; then rows per statement. Frames draw
// first, then lifelines, then lines, arrows, text and caps, so each layer replaces the one below it without a conflict.
// It registers itself on import, after registry.ts has run, so MODULES is initialized when register runs.
import type { Canvas, Drawing } from '../../canvas.ts'
import { createCanvas } from '../../canvas.ts'
import { CAPS } from '../../caps.ts'
import type { Fail } from '../../fail.ts'
import { fail, isFail } from '../../fail.ts'
import type { Step } from '../../fit.ts'
import type { DiagramModule } from '../../registry.ts'
import { register } from '../../registry.ts'
import type { Piece } from '../../text.ts'
import { labelLines, wrap } from '../../text.ts'
import type { Ink } from '../../themes.ts'
import type { Expect } from '../../validate.ts'
import { validate } from '../../validate.ts'
import { width } from '../../width.ts'
import { frameExtents } from './frames.ts'
import type { Frame, Item, Msg, Note, Participant, Seq } from './parse.ts'
import { parseSequence } from './parse.ts'

const WRAPS = [24, 20, 16, 12, 8] as const
// Each head's glyph pointing right, then pointing left; an open head draws none.
const HEAD: Readonly<Record<Msg['head'], readonly [string, string] | null>> = {
  arrow: ['►', '◄'],
  cross: ['x', 'x'],
  async: [')', ')'],
  open: null,
}
// A drawing step, run once every column is known: dx shifts each column so the leftmost drawn one is 0.
type Op = (cv: Canvas, dx: number) => void
type Label = Expect['labels'][number]
type Edge = Expect['edges'][number]
type EdgeLabel = Expect['edgeLabels'][number]
type Mark = { owner: string; r: number; c: number }
type Pill = ReturnType<typeof pill>
// What both passes read: the pills, each participant's index, each message, note and frame's number among its kind,
// each message and note's label text and wrapped pieces, and the columns from each lifeline to the right border of the
// box it ends (rb) and to the left border of the box it starts (lb), 0 for none; each frame's run, and the most frame
// borders stacked right (fr) and left (fl) of each lifeline.
type Ctx = {
  seq: Seq
  pad: number
  pills: Pill[]
  at: ReadonlyMap<string, number>
  no: ReadonlyMap<Item, number>
  text: ReadonlyMap<Item, string>
  pcs: ReadonlyMap<Item, Piece[]>
  rb: number[]
  lb: number[]
  outer: ReadonlyMap<Frame, Span>
  fr: number[]
  fl: number[]
}

// A label's pieces: each <br> line wrapped at wrapAt (null: unwrapped), each later line's first piece joined by '\n'.
// null if a word is wider than wrapAt.
function pieces(label: string, wrapAt: number | null): Piece[] | null {
  const out: Piece[] = []
  for (const [i, line] of labelLines(label).entries()) {
    const ps = wrap(line, wrapAt ?? Infinity)
    if (!ps) {
      return null
    }
    ps.forEach((p, j) => out.push(i > 0 && j === 0 ? { ...p, join: '\n' } : p))
  }
  return out
}
const widest = (ps: readonly Piece[]): number => Math.max(0, ...ps.map((p) => width(p.text)))
// A label as validate compares it: each <br> a space.
const plain = (label: string): string => labelLines(label).join(' ')

// A participant's pill, capL ␠ label ␠ capR: rect caps for a participant, stadium caps for an actor. left and right are
// its columns either side of its lifeline's.
function pill(p: Participant) {
  const [l, r] = CAPS[p.kind === 'actor' ? 'stadium' : 'rect']
  const w = width(l) + width(p.label) + width(r) + 2
  return { l, r, w, left: Math.floor((w - 1) / 2), right: w - 1 - Math.floor((w - 1) / 2) }
}

// Draws p's pill on row from column c; every cell is p's.
function drawPill(cv: Canvas, row: number, c: number, p: Participant): void {
  const { l, r } = pill(p)
  cv.cap(row, c, l, 'node', p.id)
  cv.fill(row, c + width(l), 1, 'node', p.id)
  const n = cv.text(row, c + width(l) + 1, p.label, 'node', p.id)
  cv.fill(row, c + width(l) + 1 + n, 1, 'node', p.id)
  cv.cap(row, c + width(l) + 2 + n, r, 'node', p.id)
}

// Numbers each message, note and frame among its kind in source order, a frame before its contents, wraps each
// message's and note's label, a message's after its autonumber, and finds each frame's run and each box's borders. A Fail
// for a box with no participants or a word wider than wrapAt. parseSequence has checked each autonumber is a safe integer.
function context(seq: Seq, pad: number, wrapAt: number | null): Ctx | Fail {
  if (seq.boxes.some((b) => b.ids.length === 0)) {
    return fail('empty-box')
  }
  const no = new Map<Item, number>()
  const text = new Map<Item, string>()
  const pcs = new Map<Item, Piece[]>()
  const count = { msg: 0, note: 0, frame: 0 }
  // wide, if a label has a word wider than wrapAt.
  let wide = false
  const walk = (items: readonly Item[]): void => {
    for (const it of items) {
      if (it.kind === 'frame') {
        no.set(it, count.frame++)
        it.sections.forEach((s) => walk(s.items))
        continue
      }
      if (it.kind !== 'msg' && it.kind !== 'note') {
        continue
      }
      const i = count[it.kind]++
      const n = it.kind === 'msg' ? it.num : null
      const t = n === null ? it.text : `${n}. ${it.text}`
      const ps = pieces(t, wrapAt)
      no.set(it, i)
      text.set(it, t)
      if (ps) {
        pcs.set(it, ps)
      } else {
        wide = true
      }
    }
  }
  walk(seq.items)
  if (wide) {
    return fail('too-wide')
  }
  const pills = seq.participants.map(pill)
  const at = new Map(seq.participants.map((p, i) => [p.id, i]))
  const last = pills.length - 1
  // A frame's run covers its contents' lifelines (every lifeline, if it has none), its borders one more than theirs.
  const outer = new Map<Frame, Span>()
  const fr = pills.map(() => 0)
  const fl = pills.map(() => 0)
  const run = (items: readonly Item[]): Span | null => items.reduce<Span | null>((s, it) => join(s, span(it)), null)
  const span = (it: Item): Span | null => {
    if (it.kind === 'msg' || it.kind === 'note') {
      const is = (it.kind === 'msg' ? [it.from, it.to] : it.ids).map((id) => at.get(id)!)
      return { lo: Math.min(...is), hi: Math.max(...is), l: 0, r: 0 }
    }
    if (it.kind !== 'frame') {
      return null
    }
    const s =
      it.sections.reduce<Span | null>((a, x) => join(a, run(x.items)), null) ??
      (last < 0 ? null : { lo: 0, hi: last, l: 0, r: 0 })
    if (!s) {
      return null
    }
    const o = { ...s, l: s.l + 1, r: s.r + 1 }
    outer.set(it, o)
    fr[o.hi] = Math.max(fr[o.hi]!, o.r)
    fl[o.lo] = Math.max(fl[o.lo]!, o.l)
    return o
  }
  run(seq.items)
  // Each frame draws only where Mermaid's own geometry puts it (frames.ts).
  const extent = frameExtents(seq, outer)
  if (extent) {
    return extent
  }
  // A box's borders stand 2 columns beyond its pills, and a blank column beyond the frame borders stacked at its ends, 2
  // columns each; a one-member box's right one beyond its title too, as draw puts it.
  const rb = pills.map(() => 0)
  const lb = pills.map(() => 0)
  for (const b of seq.boxes) {
    const a = Math.min(...b.ids.map((id) => at.get(id)!))
    const z = Math.max(...b.ids.map((id) => at.get(id)!))
    lb[a] = Math.max(pills[a]!.left + 2, 2 * fl[a]! + 2)
    rb[z] = Math.max(
      pills[z]!.right + 2 + (a === z ? Math.max(0, width(b.label ?? '') - 1 - pills[a]!.left - pills[z]!.right) : 0),
      2 * fr[z]! + 2,
    )
  }
  return { seq, pad, pills, at, no, text, pcs, rb, lb, outer, fr, fl }
}

// A run of lifelines lo..hi, with l and r frame borders stacked at its ends.
type Span = { lo: number; hi: number; l: number; r: number }
// The run covering a and b, with the borders stacked at its ends.
function join(a: Span | null, b: Span | null): Span | null {
  if (!a || !b) {
    return a ?? b
  }
  const lo = Math.min(a.lo, b.lo)
  const hi = Math.max(a.hi, b.hi)
  return {
    lo,
    hi,
    l: Math.max(a.lo === lo ? a.l : 0, b.lo === lo ? b.l : 0),
    r: Math.max(a.hi === hi ? a.r : 0, b.hi === hi ? b.r : 0),
  }
}
// A frame's title, then each later section's divider text: '' for none.
const titles = (f: Frame): string[] => [
  f.type === 'rect' ? '' : f.sections[0]!.cond ? `${f.type} [${f.sections[0]!.cond}]` : f.type,
  ...f.sections.slice(1).map((s) => (s.cond ? `[${s.cond}]` : '')),
]
// A box's first and last member lifelines, or null if it has none.
const members = (c: Ctx, ids: readonly string[]): [number, number] | null =>
  ids.length ? [Math.min(...ids.map((id) => c.at.get(id)!)), Math.max(...ids.map((id) => c.at.get(id)!))] : null
// A bound of a message label's stretch: a lifeline (tie) and a column offset from it; cut marks a box border.
type Bound = { tie: number; off: number; cut: boolean }
// Where a message from lifeline f to t centers its label: its run cut at each box border it crosses, its end at a
// created target cap columns short of the lifeline; of those pieces, the first from the sender that a gap can widen.
function stretch(c: Ctx, f: number, t: number, cap: number): [Bound, Bound] {
  const lo = Math.min(f, t)
  const hi = Math.max(f, t)
  const bs: Bound[] = [{ tie: lo, off: t < f ? cap : 0, cut: false }]
  for (let g = lo; g < hi; g++) {
    if (c.rb[g]) {
      bs.push({ tie: g, off: c.rb[g]!, cut: true })
    }
    if (c.lb[g + 1]) {
      bs.push({ tie: g + 1, off: -c.lb[g + 1]!, cut: true })
    }
  }
  bs.push({ tie: hi, off: t > f ? -cap : 0, cut: false })
  const ks = bs.slice(1).flatMap((b, k) => (b.tie > bs[k]!.tie ? [k] : []))
  const k = t > f ? ks[0]! : ks.at(-1)!
  return [bs[k]!, bs[k + 1]!]
}

// Each lifeline's column. The gap between neighbours is the largest of their pill halves + 2, the widest label of a
// message spanning only that gap + pad, 2 × the frame borders between them + 1, and, where a box border stands between
// them, what stands each side of the gap (that box's border, or a pill half or 2 × the frame borders) + 2; a
// message spanning several gaps spreads its need evenly over them. Not in the plan: a self-message's label needs 2 + its
// width + pad / 2 right of its lifeline (+ its pill's right half if it creates its participant); a note left or right of a
// lifeline needs its box + 3 on that side; a message to a created participant needs the half of its pill facing the
// sender too; a message crossing a box border needs its label's stretch to hold it + 2 blanks; a frame or box title fits
// between its borders.
function measure(c: Ctx): number[] {
  const { pills, at, pad } = c
  const last = pills.length - 1
  const need = pills.slice(1).map((p, i) => pills[i]!.right + p.left + 2)
  // Grows the gaps between lifelines a < b to n columns in all.
  const spread = (a: number, b: number, n: number) => {
    for (let g = a; g < b; g++) {
      need[g] = Math.max(need[g]!, Math.ceil(n / (b - a)))
    }
  }
  for (const b of c.seq.boxes) {
    const m = members(c, b.ids)
    if (!m) {
      continue
    }
    const [a, z] = m
    if (a < z) {
      spread(a, z, width(b.label ?? '') - 1 - pills[a]!.left - pills[z]!.right)
    }
  }
  const born = new Set<string>()
  const walk = (items: readonly Item[]): void => items.forEach(one)
  const one = (it: Item): void => {
    if (it.kind === 'frame') {
      return frame(it)
    }
    if (it.kind === 'create') {
      born.add(it.id)
    }
    if (it.kind === 'note') {
      const is = it.ids.map((id) => at.get(id)!)
      const i = is[0]!
      const w = widest(c.pcs.get(it)!) + 4
      if (it.side === 'right of' && i < last) {
        spread(i, i + 1, w + 3)
      }
      if (it.side === 'left of' && i > 0) {
        spread(i - 1, i, w + 3)
      }
      return
    }
    if (it.kind !== 'msg') {
      return
    }
    const f = at.get(it.from)!
    const t = at.get(it.to)!
    const w = widest(c.pcs.get(it)!)
    // A created target's pill: the half facing the sender, or a self-message's right half, which its loop starts beyond.
    const cap = born.delete(it.to) ? (t > f ? pills[t]!.left : pills[t]!.right) : 0
    if (f === t) {
      if (f < last) {
        spread(f, f + 1, w + 2 + cap + pad / 2)
      }
    } else {
      // The stretch holds the label + pad - 1 blanks, and at least 2 where a box border bounds it, one each side.
      const [p, q] = stretch(c, f, t, cap)
      const n = w + Math.max(pad - 1, p.cut || q.cut ? 2 : 0)
      spread(p.tie, q.tie, n + 1 + p.off - q.off)
    }
  }
  // A frame's title fits between its borders, which context stacked two columns beyond its contents'.
  const frame = (f: Frame): void => {
    f.sections.forEach((x) => walk(x.items))
    const o = c.outer.get(f)
    if (!o) {
      return
    }
    const tw = Math.max(...titles(f).map((t) => width(t)))
    if (o.lo < o.hi) {
      spread(o.lo, o.hi, tw + 3 - 2 * (o.l + o.r))
    } else if (o.hi < last) {
      spread(o.hi, o.hi + 1, tw + 4 - 2 * o.l)
    }
  }
  walk(c.seq.items)
  // Right of lifeline g, its box's border, or its pill half or frame borders; left of lifeline g + 1 likewise.
  const { rb, lb, fr, fl } = c
  need.forEach((n, g) => {
    need[g] = Math.max(n, 2 * (fr[g]! + fl[g + 1]!) + 1)
    if (!rb[g] && !lb[g + 1]) {
      return
    }
    const r = rb[g] || Math.max(pills[g]!.right, 2 * fr[g]!)
    const l = lb[g + 1] || Math.max(pills[g + 1]!.left, 2 * fl[g + 1]!)
    need[g] = Math.max(need[g]!, r + l + 2)
  })
  const xs: number[] = []
  pills.forEach((_, i) => xs.push(i === 0 ? 0 : xs[i - 1]! + need[i - 1]!))
  return xs
}

// One drawing of seq: pad columns either side of a message label, labels wrapped at wrapAt (null: unwrapped).
function draw(seq: Seq, pad: number, wrapAt: number | null, columns: number): Drawing | Fail {
  const c = context(seq, pad, wrapAt)
  if (isFail(c)) {
    return c
  }
  const xs = measure(c)
  const back: Op[] = []
  const fore: Op[] = []
  const labels: Label[] = []
  const edges: Edge[] = []
  const edgeLabels: EdgeLabel[] = []
  const marks: Mark[] = [] // each note's ┆ cap, before the shift: validate holds it there
  // The header row: below the title row, if any, and the box tops, if any box has a member.
  const title = seq.title || null
  const boxed = seq.boxes.some((b) => b.ids.length > 0)
  const head = (title ? 1 : 0) + (boxed ? 1 : 0)
  let row = head + 1
  let lo = 0
  let hi = -1 // the next free row; the drawn columns, before the shift
  const touch = (a: number, b: number) => {
    lo = Math.min(lo, a)
    hi = Math.max(hi, b)
  }
  // Draws ps one per row from row r, each at col(its width); a piece after the first joins the one before it.
  const stack = (r: number, ps: readonly Piece[], col: (w: number) => number, role: Ink, owner: string) =>
    ps.forEach((p, k) => {
      const at = col(width(p.text))
      touch(at, at + width(p.text) - 1)
      fore.push((cv, dx) => cv.text(r + k, at + dx, p.text, role, owner, k > 0 ? p.join : undefined))
    })
  // Each participant's activation steps (row, +1 or -1), the row its pill is on if not the header, and the row its
  // lifeline ends on if not the last; and the create and destroy statements waiting for their message.
  const steps = new Map<string, { r: number; by: number }[]>()
  const born = new Map<string, number>()
  const died = new Map<string, number>()
  const pending = new Set<string>()
  const doomed = new Set<string>()
  const shift = (id: string, r: number, by: number) => void steps.set(id, [...(steps.get(id) ?? []), { r, by }])
  // Draws participant i's pill on row r, centered on its lifeline.
  const pillAt = (i: number, r: number) => {
    const col = xs[i]! - c.pills[i]!.left
    const p = seq.participants[i]!
    fore.push((cv, dx) => drawPill(cv, r, col + dx, p))
    touch(col, col + c.pills[i]!.w - 1)
  }
  // A message: its label rows, then its line row, or a self-message's ─┐ and ◄┘ rows. A created target's pill sits on
  // the line row: a line stops at its cap, and a self-message's loop starts beyond its right cap.
  const message = (m: Msg) => {
    const id = `m${c.no.get(m)!}`
    const ps = c.pcs.get(m)!
    const top = row
    const line = row + ps.length
    const weight = m.line === 'dotted' ? 'dotted' : 'light'
    const f = c.at.get(m.from)!
    const t = c.at.get(m.to)!
    const xf = xs[f]!
    const xt = xs[t]!
    const right = xt > xf
    const make = pending.delete(m.to)
    const head = HEAD[m.head]?.[right ? 0 : 1] ?? null
    const tail = m.tail === 'arrow' ? (xt < xf ? '►' : '◄') : null
    const seg = (r: number, col: number, dirs: number, end: string | null): Op =>
      end ? (cv, dx) => cv.arrow(r, col + dx, end, id) : (cv, dx) => cv.line(r, col + dx, dirs, weight, 'edge', id)
    const cap = make ? (right ? c.pills[t]!.left : c.pills[t]!.right) : 0
    if (xf !== xt) {
      const a = right ? xf + 1 : xt + cap + 1
      const b = right ? xt - cap - 1 : xf - 1
      for (let col = a; col <= b; col++) {
        fore.push(seg(line, col, 10, col === (right ? b : a) ? head : col === (right ? a : b) ? tail : null))
      }
      touch(a - 1, b + 1)
      // The label centers in its stretch: between the lifelines, or between the box borders and lifelines bounding it.
      const [p, q] = stretch(c, f, t, cap)
      const from = xs[p.tie]! + p.off
      const to = xs[q.tie]! + q.off
      stack(top, ps, (w) => from + 1 + Math.floor((to - from - 1 - w) / 2), 'label', `${id}:label`)
    } else {
      // ─┐ beyond the lifeline, or beyond its new pill's right cap, then back under ┘ to ◄ beside the lifeline. With a head
      // at its start too (<<->>), each row runs one cell further, ◄─┐ over ◄─┘, so a straight cell shows its style: ◄┄┐ for
      // a dotted one, which ◄┐ would draw as solid.
      const k = tail ? 1 : 0
      const turn = xf + cap + 2 + k
      fore.push(
        seg(line, xf + cap + 1, 10, tail),
        ...(k ? [seg(line, xf + cap + 2, 10, null)] : []),
        seg(line, turn, 12, null),
        seg(line + 1, turn, 9, null),
      )
      for (let col = xf + 1; col < turn; col++) {
        fore.push(seg(line + 1, col, 10, col === xf + 1 ? head : null))
      }
      touch(xf, turn)
      stack(top, ps, () => turn, 'label', `${id}:label`)
    }
    if (make) {
      born.set(m.to, line)
      pillAt(t, line)
    }
    const end = line + (xf === xt ? 1 : 0)
    for (const d of doomed) {
      died.set(d, end)
    }
    doomed.clear()
    row = end + 1
    // + activates the target from its arrow on; - deactivates the sender after this message.
    if (m.activate) {
      shift(m.to, end, 1)
    }
    if (m.deactivate) {
      shift(m.from, end + 1, -1)
    }
    labels.push({ owner: `${id}:label`, text: plain(c.text.get(m)!) })
    edges.push({
      id,
      from: m.from,
      to: m.to,
      style: m.line === 'dotted' ? 'dotted' : 'solid',
      ends: [...(head ? [{ node: m.to, glyph: head }] : []), ...(tail ? [{ node: m.from, glyph: tail }] : [])],
    })
    if (ps.some((p) => p.text)) {
      edgeLabels.push({ owner: `${id}:label`, edge: id })
    }
  }
  // A note: one row per line, centered between ┆ caps in a box of note fill, cap and blank one column each beyond its
  // widest line, so it reads as a note without color; over its lifelines, a column beyond each, or beside its lifeline,
  // a column off it.
  const note = (n: Note) => {
    const id = `n${c.no.get(n)!}`
    const ps = c.pcs.get(n)!
    const top = row
    const w = widest(ps) + 4
    const xa = Math.min(...n.ids.map((p) => xs[c.at.get(p)!]!))
    const xb = Math.max(...n.ids.map((p) => xs[c.at.get(p)!]!))
    const span = n.side === 'over' ? Math.max(w, xb - xa + 3) : w
    const left =
      n.side === 'left of'
        ? xa - 1 - span
        : n.side === 'right of'
          ? xa + 2
          : xa - Math.floor((span - 1 - (xb - xa)) / 2)
    ps.forEach((p, k) => {
      const pw = width(p.text)
      const at = left + Math.floor((span - pw) / 2)
      fore.push((cv, dx) => {
        cv.cap(top + k, left + dx, '┆', 'note', id)
        cv.fill(top + k, left + 1 + dx, at - left - 1, 'note', id)
        cv.text(top + k, at + dx, p.text, 'note', id, k > 0 ? p.join : undefined)
        cv.fill(top + k, at + pw + dx, left + span - 1 - at - pw, 'note', id)
        cv.cap(top + k, left + span - 1 + dx, '┆', 'note', id)
      })
      marks.push({ owner: id, r: top + k, c: left }, { owner: id, r: top + k, c: left + span - 1 })
    })
    touch(left, left + span - 1)
    row = top + ps.length
    labels.push({ owner: id, text: plain(c.text.get(n)!) })
  }
  const frames: string[] = [] // each drawn frame's and box's owner id
  // stray: a frame drawn over a lifeline beyond its run, which Mermaid's frame leaves out.
  let stray = false
  // A frame: its top border carrying its title, its sections' rows with a ┄ divider row carrying [cond] before each one
  // after the first, then its bottom border; two columns beyond its contents, wider if its title needs it.
  const frame = (f: Frame) => {
    const id = `f${c.no.get(f)!}`
    const ts = titles(f)
    const top = row++
    const dividers: number[] = []
    const [olo, ohi] = [lo, hi]
    lo = Infinity
    hi = -Infinity
    f.sections.forEach((s, k) => {
      if (k > 0) {
        dividers.push(row++)
      }
      walk(s.items)
    })
    if (hi < lo) {
      lo = xs[0] ?? 0
      hi = xs.at(-1) ?? 0
    }
    const left = lo - 2
    const right = Math.max(hi + 2, left + Math.max(...ts.map((t) => width(t))) + 3)
    const bottom = row++
    lo = Math.min(olo, left)
    hi = Math.max(ohi, right)
    const o = c.outer.get(f)
    if (o && ((o.lo > 0 && left <= xs[o.lo - 1]!) || (o.hi < xs.length - 1 && right >= xs[o.hi + 1]!))) {
      stray = true
    }
    const role: Ink = f.type === 'rect' ? 'note' : 'frame'
    back.push((cv, dx) => cv.frame(top, left + dx, bottom, right + dx, role, id, ts[0] || undefined))
    frames.push(id)
    if (ts[0]) {
      labels.push({ owner: id, text: ts[0] })
    }
    dividers.forEach((r, j) => {
      const own = `${id}.${j + 1}`
      const t = ts[j + 1]!
      const tl = width(t)
      back.push((cv, dx) => {
        cv.line(r, left + dx, 7, 'light', role, own)
        cv.line(r, right + dx, 13, 'light', role, own)
        cv.text(r, left + 2 + dx, t, role, own)
        for (let col = left + 1; col < right; col++) {
          if (col < left + 2 || col >= left + 2 + tl) {
            cv.line(r, col + dx, 10, 'dotted', role, own)
          }
        }
      })
      if (t) {
        labels.push({ owner: own, text: t })
      }
    })
  }
  const walk = (items: readonly Item[]): void =>
    items.forEach((it) => {
      if (it.kind === 'frame') {
        frame(it)
      } else if (it.kind === 'msg') {
        message(it)
      } else if (it.kind === 'note') {
        note(it)
      } else if (it.kind === 'create') {
        pending.add(it.id)
      } else if (it.kind === 'destroy') {
        doomed.add(it.id)
      } else {
        shift(it.id, it.kind === 'activate' ? row - 1 : row, it.kind === 'activate' ? 1 : -1)
      }
    })
  walk(seq.items)
  if (stray) {
    return fail(seq.boxes.length ? 'box-frame' : 'frame-extent')
  }
  const last = row - 1 // the last body row
  seq.participants.forEach((p, i) => {
    labels.push({ owner: p.id, text: p.label })
    if (!born.has(p.id)) {
      pillAt(i, head)
    }
  })
  // A box: a titled frame around its members' pills and the frames stacked at its ends, from above the header to below
  // the last body row; drawn first.
  seq.boxes.forEach((b, i) => {
    const m = members(c, b.ids)
    if (!m) {
      return
    }
    const left = xs[m[0]]! - c.lb[m[0]]!
    const right = Math.max(xs[m[1]]! + c.rb[m[1]]!, left + width(b.label ?? '') + 3)
    back.unshift((cv, dx) =>
      cv.frame(head - 1, left + dx, last + 1, right + dx, 'frame', `b${i}`, b.label ?? undefined),
    )
    frames.push(`b${i}`)
    touch(left, right)
    if (b.label) {
      labels.push({ owner: `b${i}`, text: b.label })
    }
  })
  // Each lifeline runs from below its pill to its destroying message or the last body row: ┃ where it is active.
  const life: Op[] = []
  seq.participants.forEach((p, i) => {
    const s = steps.get(p.id) ?? []
    for (let r = (born.get(p.id) ?? head) + 1; r <= (died.get(p.id) ?? last); r++) {
      const heavy = s.reduce((n, x) => n + (x.r <= r ? x.by : 0), 0) > 0
      life.push((cv, dx) => cv.lifeline(r, xs[i]! + dx, heavy, p.id))
    }
  })
  // The title: a bold row 0 from the first column, as flowchart draws it; the grid is at least as wide.
  if (title) {
    hi = Math.max(hi, lo + width(title) - 1)
    fore.push((cv) => void cv.text(0, 0, title, 'title', 'title'))
    labels.push({ owner: 'title', text: title })
  }
  const cv = createCanvas(last + 1 + (boxed ? 1 : 0), hi - lo + 1, columns)
  for (const op of [...back, ...life, ...fore]) {
    op(cv, -lo)
  }
  const glyphs = marks.map((m) => ({ owner: m.owner, ch: '┆', at: { r: m.r, c: m.c - lo } }))
  return cv.toDrawing({ labels, edges, edgeLabels, frames, ...(glyphs.length ? { glyphs } : {}) })
}

// natural and tight draw once, unwrapped; wrap tries each width in WRAPS: the first drawing validate accepts, else the last.
function layout(seq: Seq, step: Step, columns: number): Drawing | Fail {
  const pad = step === 'natural' ? 4 : 2
  if (step !== 'wrap') {
    return draw(seq, pad, null, columns)
  }
  let last: Drawing | Fail = fail('too-wide')
  for (const wrapAt of WRAPS) {
    last = draw(seq, pad, wrapAt, columns)
    if (!isFail(last) && validate(last) === null) {
      return last
    }
  }
  return last
}

export const sequence: DiagramModule<Seq> = {
  type: 'sequence',
  parse: parseSequence,
  steps: () => ['natural', 'tight', 'wrap'],
  layout,
}

register(sequence as DiagramModule)
