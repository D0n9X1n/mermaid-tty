// Mermaid 12.2.0's geometry for the frames of a sequence diagram with a box (#17). Mermaid sizes a frame (loop, alt,
// opt, par, critical, break or rect) to the bounds inserted while it is open, 10 px beyond them for each frame open
// inside it then, and draws a box 20 px beyond its members' pills; both turn on text widths a terminal does not know. So
// a frame draws only where, at every text width, it covers the lifelines its run covers and nests in or stands clear of
// each box: checked on Mermaid's narrowest layout, every pill 150 px and every gap its least, since text only widens a
// gap. Mirrors sequenceRenderer's addActorRenderingData, bounds.insert, activationBounds, buildNoteModel and box drawing.
import type { Fail } from '../../fail.ts'
import { fail } from '../../fail.ts'
import type { Frame, Item, Seq } from './parse.ts'

// Mermaid 12.2.0's sequence defaults, in px: width, actorMargin, boxMargin, boxTextMargin.
const WIDTH = 150, GAP = 50, MARGIN = 10, TEXT = 5

type Run = { lo: number; hi: number }
type Reach = { l: number; r: number }

// Each lifeline's center and each box border, in px, in Mermaid's narrowest layout. A box border stands 2 boxMargins
// beyond the box Mermaid lays out, which starts where its first member would and ends a boxTextMargin past its last.
function narrowest(seq: Seq): { center: number[]; borders: number[] } {
  const at = new Map(seq.participants.map((p, i) => [p.id, i])), boxOf = seq.participants.map(() => -1)
  seq.boxes.forEach((b, k) => b.ids.forEach(id => { boxOf[at.get(id)!] = k }))
  const center: number[] = [], borders: number[] = []
  let width = 0, margin = 0, prev = -1
  boxOf.forEach((box, i) => {
    if (prev !== -1 && prev !== box) { borders.push(width + TEXT + 2 * MARGIN); margin += MARGIN + TEXT }
    if (box !== -1 && box !== prev) { borders.push(width + margin - 2 * MARGIN); margin += TEXT }
    center.push(width + margin + WIDTH / 2)
    width += WIDTH + margin; margin = GAP; prev = box
    if (box !== -1 && i === boxOf.length - 1) borders.push(width + TEXT + 2 * MARGIN)
  })
  return { center, borders }
}

// A Fail unless Mermaid draws each frame over the lifelines of its run (runs, as layout draws it) and inside or clear of
// each box, at every text width. A self-message, a note on or beside one lifeline, or a participant created or destroyed
// in a frame has bounds that turn on text width, so its frame falls back, as does a frame with no bounds at all.
export function boxFrames(seq: Seq, runs: ReadonlyMap<Frame, Run>): Fail | null {
  const { center, borders } = narrowest(seq), at = new Map(seq.participants.map((p, i) => [p.id, i]))
  const changed = new Set<string>()
  const marks = (items: readonly Item[]): void => items.forEach(it => {
    if (it.kind === 'frame') it.sections.forEach(s => marks(s.items))
    else if (it.kind === 'create' || it.kind === 'destroy') changed.add(it.id)
  })
  marks(seq.items)
  // Each frame's reach so far, null once it holds a bound that turns on text width; the open frames, outermost first;
  // each lifeline's open activations.
  const reach = new Map<Frame, Reach | null>(), open: Frame[] = [], active = seq.participants.map(() => 0)
  // bounds.insert: each open frame reaches 10 px beyond l and r per frame open inside it, itself included.
  const insert = (l: number, r: number) => open.forEach((f, k) => {
    const got = reach.get(f), pad = MARGIN * (open.length - k)
    if (got) reach.set(f, { l: Math.min(got.l, l - pad), r: Math.max(got.r, r + pad) })
  })
  const spoil = () => open.forEach(f => reach.set(f, null))
  // activationBounds: a lifeline's center ± 1, or across its open activations, each 10 px wide and 5 px right of the last.
  const bounds = (i: number): Reach => active[i] ? { l: center[i]! - 5, r: center[i]! + 5 * active[i]! } : { l: center[i]! - 1, r: center[i]! + 1 }
  // An activation ends: its own bar is inserted.
  const end = (i: number) => {
    const k = active[i]!
    if (k > 0) { active[i] = k - 1; insert(center[i]! + 5 * (k - 2), center[i]! + 5 * k) }
  }
  const walk = (items: readonly Item[]): void => items.forEach(it => {
    if (it.kind === 'frame') {
      reach.set(it, { l: Infinity, r: -Infinity }); open.push(it)
      it.sections.forEach(s => walk(s.items))
      open.pop()
    } else if (it.kind === 'create' || it.kind === 'destroy') spoil()
    else if (it.kind === 'activate') active[at.get(it.id)!]!++
    else if (it.kind === 'deactivate') end(at.get(it.id)!)
    else if (it.kind === 'note') {
      // buildNoteModel: a note over two lifelines spans their centers and half an actorMargin beyond each.
      const cs = [...new Set(it.ids)].map(id => center[at.get(id)!]!)
      if (it.side === 'over' && cs.length === 2) insert(Math.min(...cs) - GAP / 2, Math.max(...cs) + GAP / 2)
      else spoil()
    } else if (it.kind === 'msg') {
      const f = at.get(it.from)!, t = at.get(it.to)!
      if (f === t || changed.has(it.from) || changed.has(it.to)) spoil()
      else { const a = bounds(f), b = bounds(t); insert(Math.min(a.l, b.l), Math.max(a.r, b.r)) }
      if (it.activate) active[t]!++
      if (it.deactivate) end(f)
    }
  })
  walk(seq.items)
  // Each frame reaches past its run's end lifelines but not to the next lifeline or box border beyond them; its run lies
  // in each box or clear of it.
  const points = [...center, ...borders]
  for (const [f, got] of reach) {
    const run = runs.get(f)
    if (!got || !run || got.l > got.r) return fail('box-frame')
    const lo = center[run.lo]!, hi = center[run.hi]!
    const below = Math.max(-Infinity, ...points.filter(p => p < lo)), above = Math.min(Infinity, ...points.filter(p => p > hi))
    if (!(below < got.l && got.l < lo && hi < got.r && got.r < above)) return fail('box-frame')
    for (const b of seq.boxes) {
      const is = b.ids.map(id => at.get(id)!), a = Math.min(...is), z = Math.max(...is)
      if (!(a <= run.lo && run.hi <= z) && !(run.hi < a || run.lo > z)) return fail('box-frame')
    }
  }
  return null
}
