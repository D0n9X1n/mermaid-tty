// Mermaid 12.2.0's geometry for the frames of a sequence diagram. Mermaid sizes a frame (loop, alt, opt, par,
// critical, break or rect) to the bounds inserted while it is open, 10 px beyond them for each frame open inside it
// then,
// and draws a box 20 px beyond its members' pills; both turn on text widths a terminal does not know. So a frame draws
// only where, at every text width, it covers the lifelines its run covers and nests in or stands clear of each box:
// checked on Mermaid's narrowest layout, every pill 150 px and every gap its least, since text only widens a gap.
// Mirrors
// sequenceRenderer's addActorRenderingData, getMaxMessageWidthPerActor, bounds.insert, boundMessage, activationBounds,
// buildNoteModel and box drawing.
import type { Fail } from '../../fail.ts'
import { fail } from '../../fail.ts'
import type { Frame, Item, Seq } from './parse.ts'

// Mermaid 12.2.0's sequence defaults, in px: width, actorMargin, boxMargin, boxTextMargin.
const WIDTH = 150
const GAP = 50
const MARGIN = 10
const TEXT = 5

type Run = { lo: number; hi: number }
type Reach = { l: number; r: number }
// A bound whose reach past lifeline i on one side turns on text width: ok, if it stays short of the next lifeline
// there.
type Risk = { i: number; side: 'l' | 'r'; ok: boolean }

// Each lifeline's center and each box border, in px, in Mermaid's narrowest layout. A box border stands 2 boxMargins
// beyond the box Mermaid lays out, which starts where its first member would and ends a boxTextMargin past its last.
function narrowest(seq: Seq): { center: number[]; borders: number[] } {
  const at = new Map(seq.participants.map((p, i) => [p.id, i]))
  const boxOf = seq.participants.map(() => -1)
  seq.boxes.forEach((b, k) =>
    b.ids.forEach((id) => {
      boxOf[at.get(id)!] = k
    }),
  )
  const center: number[] = []
  const borders: number[] = []
  let width = 0
  let margin = 0
  let prev = -1
  boxOf.forEach((box, i) => {
    if (prev !== -1 && prev !== box) {
      borders.push(width + TEXT + 2 * MARGIN)
      margin += MARGIN + TEXT
    }

    if (box !== -1 && box !== prev) {
      borders.push(width + margin - 2 * MARGIN)
      margin += TEXT
    }

    center.push(width + margin + WIDTH / 2)
    width += WIDTH + margin
    margin = GAP
    prev = box
    if (box !== -1 && i === boxOf.length - 1) {
      borders.push(width + TEXT + 2 * MARGIN)
    }
  })
  return { center, borders }
}

// A Fail unless Mermaid draws each frame over the lifelines of its run (runs, as layout draws it) and inside or clear
// of
// each box, at every text width: box-frame with a box, frame-extent without. A participant created or destroyed in a
// frame, or a frame with no bounds at all, falls back. With a box, so does a self-message or a note on or beside one
// lifeline, whose bounds turn on text width. Without one, such a bound is drawn where Mermaid's own gap sizing keeps it
// short of the next lifeline (getMaxMessageWidthPerActor widens the gap on the side the text grows), and falls back
// where a lifeline stands beyond the frame on a side whose reach no gap bounds.
export function frameExtents(seq: Seq, runs: ReadonlyMap<Frame, Run>): Fail | null {
  const { center, borders } = narrowest(seq)
  const at = new Map(seq.participants.map((p, i) => [p.id, i]))
  const boxed = seq.boxes.length > 0
  const why = boxed ? 'box-frame' : 'frame-extent'
  const changed = new Set<string>()
  const marks = (items: readonly Item[]): void =>
    items.forEach((it) => {
      if (it.kind === 'frame') {
        it.sections.forEach((s) => marks(s.items))
      } else if (it.kind === 'create' || it.kind === 'destroy') {
        changed.add(it.id)
      }
    })
  marks(seq.items)
  // Each frame's reach so far, null once it holds a bound it cannot check, and its risks; the open frames, outermost
  // first; each lifeline's open activations.
  const reach = new Map<Frame, Reach | null>()
  const risks = new Map<Frame, Risk[]>()
  const open: Frame[] = []
  const active = seq.participants.map(() => 0)
  // bounds.insert: each open frame reaches pad = 10 px beyond l and r per frame open inside it, itself included. A text
  // width bound inserts its least reach, and for each side whether its reach past lifeline i stays short at that pad.
  const insert = (
    l: number,
    r: number,
    risk?: { i: number; l: (pad: number) => boolean; r: (pad: number) => boolean },
  ) =>
    open.forEach((f, k) => {
      const got = reach.get(f)
      const pad = MARGIN * (open.length - k)
      if (!got) {
        return
      }

      reach.set(f, { l: Math.min(got.l, l - pad), r: Math.max(got.r, r + pad) })
      if (risk) {
        risks.get(f)!.push({ i: risk.i, side: 'l', ok: risk.l(pad) }, { i: risk.i, side: 'r', ok: risk.r(pad) })
      }
    })
  const spoil = () => open.forEach((f) => reach.set(f, null))
  // activationBounds: a lifeline's center ± 1, or across its open activations, each 10 px wide and 5 px right of the
  // last.
  const bounds = (i: number): Reach =>
    active[i] ? { l: center[i]! - 5, r: center[i]! + 5 * active[i]! } : { l: center[i]! - 1, r: center[i]! + 1 }
  // An activation ends: its own bar is inserted.
  const end = (i: number) => {
    const k = active[i]!
    if (k > 0) {
      active[i] = k - 1
      insert(center[i]! + 5 * (k - 2), center[i]! + 5 * k)
    }
  }
  const never = () => false
  const always = () => true
  const walk = (items: readonly Item[]): void =>
    items.forEach((it) => {
      if (it.kind === 'frame') {
        reach.set(it, { l: Infinity, r: -Infinity })
        risks.set(it, [])
        open.push(it)
        it.sections.forEach((s) => walk(s.items))
        open.pop()
      } else if (it.kind === 'create' || it.kind === 'destroy') {
        spoil()
      } else if (it.kind === 'activate') {
        active[at.get(it.id)!]!++
      } else if (it.kind === 'deactivate') {
        end(at.get(it.id)!)
      } else if (it.kind === 'note') {
        const is = [...new Set(it.ids)].map((id) => at.get(id)!)
        const c = center[is[0]!]!
        // buildNoteModel: a note over two lifelines spans their centers and half an actorMargin beyond each.
        if (it.side === 'over' && is.length === 2) {
          insert(Math.min(c, center[is[1]!]!) - GAP / 2, Math.max(c, center[is[1]!]!) + GAP / 2)
        } else if (boxed) {
          spoil()
        }
        // Over one lifeline: centered, max(pill, 150, text + 20) px wide; the text widens the gap each side by half
        // that,
        // so the note stays short of either neighbour while pad < 50.
        else if (it.side === 'over') {
          insert(c - WIDTH / 2, c + WIDTH / 2, { i: is[0]!, l: (pad) => pad < 50, r: (pad) => pad < 50 })
        }
        // Beside one lifeline: from half an actorMargin off it, max(pill, text + 20) px wide; a long pill widens no
        // gap.
        else if (it.side === 'right of') {
          insert(c + GAP / 2, c + GAP / 2 + WIDTH, { i: is[0]!, l: always, r: never })
        } else {
          insert(c - GAP / 2 - WIDTH, c - GAP / 2, { i: is[0]!, l: never, r: always })
        }
      } else if (it.kind === 'msg') {
        const f = at.get(it.from)!
        const t = at.get(it.to)!
        if (changed.has(it.from) || changed.has(it.to) || (f === t && boxed)) {
          spoil()
        }
        // boundMessage: a self-message reaches max(text / 2, 75) px either side of its start, a px right of its
        // lifeline;
        // its text widens only the gap on its right, enough for the reach while a + pad < 60.
        else if (f === t) {
          const a = bounds(f).r - center[f]!
          insert(center[f]! + a - WIDTH / 2, center[f]! + a + WIDTH / 2, { i: f, l: never, r: (pad) => a + pad < 60 })
        } else {
          const a = bounds(f)
          const b = bounds(t)
          insert(Math.min(a.l, b.l), Math.max(a.r, b.r))
        }

        if (it.activate) {
          active[t]!++
        }

        if (it.deactivate) {
          end(f)
        }
      }
    })
  walk(seq.items)
  // Each frame reaches past its run's end lifelines but not to the next lifeline or box border beyond them; its run
  // lies
  // in each box or clear of it; and no bound of unknown reach faces a lifeline beyond its run.
  const points = [...center, ...borders]
  const last = center.length - 1
  for (const [f, got] of reach) {
    const run = runs.get(f)
    if (!got || !run || got.l > got.r) {
      return fail(why)
    }

    const lo = center[run.lo]!
    const hi = center[run.hi]!
    const below = Math.max(-Infinity, ...points.filter((p) => p < lo))
    const above = Math.min(Infinity, ...points.filter((p) => p > hi))
    if (!(below < got.l && got.l < lo && hi < got.r && got.r < above)) {
      return fail(why)
    }

    for (const b of seq.boxes) {
      const is = b.ids.map((id) => at.get(id)!)
      const a = Math.min(...is)
      const z = Math.max(...is)
      if (!(a <= run.lo && run.hi <= z) && !(run.hi < a || run.lo > z)) {
        return fail(why)
      }
    }
    // A risk past lifeline i is checked against its neighbour; one farther in the run faces a farther lifeline still.
    if (risks.get(f)!.some((k) => !k.ok && (k.side === 'l' ? run.lo > 0 : run.hi < last))) {
      return fail(why)
    }
  }

  return null
}
