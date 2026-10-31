// The validator's frame checks: each subgraph or sequence frame stays a closed box, keeps the edges between its own
// nodes inside it, and is crossed only as its hold on an edge's ends needs; and each end label names its own edge's
// end.
import type { Drawing } from './canvas.ts'
import type { Fail } from './fail.ts'
import { fail } from './fail.ts'
import type { Spot } from './validate-cells.ts'
import { SIDES, at, beside, connects, gap, owns } from './validate-cells.ts'

// The box frame id's own frame cells span: null if it has none, or they span less than two rows or two columns.
export type FrameBox = { top: number; bottom: number; left: number; right: number }

export function frameBox(all: readonly Spot[], id: string): FrameBox | null {
  const mine = all.filter((p) => p.cell.kind === 'frame' && p.cell.owners[0] === id)
  if (mine.length === 0) {
    return null
  }

  const rs = mine.map((p) => p.r)
  const cs = mine.map((p) => p.c)
  const [top, bottom, left, right] = [Math.min(...rs), Math.max(...rs), Math.min(...cs), Math.max(...cs)]
  return top < bottom && left < right ? { top, bottom, left, right } : null
}

// A frame's corner glyphs, top-left, top-right, bottom-left, bottom-right, each in every light and heavy mix of its two
// arms.
export const CORNERS: readonly ReadonlySet<string>[] = ['┌┍┎┏', '┐┑┒┓', '└┕┖┗', '┘┙┚┛'].map((s) => new Set(s))

// Each frame stays closed. Its own frame cells span a real box, at least two rows and two columns, whose four corners
// are
// its own frame cells drawing its corner glyphs: text that erases a border and its corners leaves cells that span a
// smaller
// box, and no crossing or title sits on a corner. Each other cell on the box's border is a frame cell of its own
// drawing
// that border, ─ or ━ across and │ or ┃ down a side, or a tee ┬ ┴ ├ ┤ one of its own dividers continues inside;
// or:
// its title, text or cont whose owners[0] is the frame, on the top border; a joint of one of its own dividers
// `${id}.${k}`,
// ├ on its left side or ┤ on its right; or a line only edges cross straight through, each by the dirs it drew there: │
// (5)
// through the top or bottom, ─ (10) through a side. A lifeline needs no exception: a frame draws first, and a lifeline
// only
// fills empty cells. Text over a border, a run along it, or a frame with no cells is broken.
export function frames(d: Drawing, all: readonly Spot[]): Fail | null {
  const edges = new Set(d.expect.edges.map((e) => e.id))
  for (const id of d.expect.frames) {
    const b = frameBox(all, id)
    if (!b) {
      return fail('frame-broken')
    }

    const { top, bottom, left, right } = b
    // Corner i, in CORNERS order, is its own frame cell drawing that corner's glyph.
    const corner = ([r, c]: readonly [number, number], i: number) => {
      const x = at(d, r, c)
      return x?.kind === 'frame' && x.owners[0] === id && CORNERS[i]!.has(x.ch)
    }
    if (
      !(
        [
          [top, left],
          [top, right],
          [bottom, left],
          [bottom, right],
        ] as const
      ).every(corner)
    ) {
      return fail('frame-broken')
    }

    const divider = (o: string) => o.startsWith(`${id}.`) && /^\d+$/.test(o.slice(id.length + 1))
    // Whether the line cell at (r, c) is this frame's divider and points back, by bit, at the border cell beside it.
    const stem = (r: number, c: number, bit: number) => {
      const y = at(d, r, c)
      return y?.kind === 'line' && (y.dirs & bit) !== 0 && y.owners.length > 0 && y.owners.every(divider)
    }
    // A frame cell of its own on a border draws that border: ─ ━ across, │ ┃ down a side, or a tee a divider continues.
    const drawn = (ch: string, r: number, c: number, across: boolean) =>
      across
        ? '─━'.includes(ch) || (ch === (r === top ? '┬' : '┴') && stem(r === top ? r + 1 : r - 1, c, r === top ? 1 : 4))
        : '│┃'.includes(ch) ||
          (ch === (c === left ? '├' : '┤') && stem(r, c === left ? c + 1 : c - 1, c === left ? 8 : 2))
    const kept = (r: number, c: number): boolean => {
      const x = at(d, r, c)
      const across = r === top || r === bottom
      const side = c === left || c === right
      if (x?.kind === 'frame') {
        return x.owners[0] === id && ((across && side) || drawn(x.ch, r, c, across))
      }

      if (!x || (across && side)) {
        return false
      }

      if (x.kind === 'text' || x.kind === 'cont') {
        return r === top && x.owners[0] === id
      }

      if (x.kind !== 'line' || x.owners.length === 0) {
        return false
      }

      if (side && x.dirs === (c === left ? 7 : 13) && x.owners.every(divider)) {
        return true
      }

      const dirs = across ? 5 : 10
      return x.dirs === dirs && x.owners.every((o) => edges.has(o) && x.segs?.find((s) => s.owner === o)?.dirs === dirs)
    }
    for (let c = left; c <= right; c++) {
      if (!kept(top, c) || !kept(bottom, c)) {
        return fail('frame-broken')
      }
    }

    for (let r = top + 1; r < bottom; r++) {
      if (!kept(r, left) || !kept(r, right)) {
        return fail('frame-broken')
      }
    }
  }

  return null
}

// An edge between nodes of one frame stays inside it. A frame holds a node when every cell drawn for the node, by its
// owners, lies strictly inside the frame's box; a node with no cells, or an endpoint that is itself a frame, whose own
// border is drawn for it, is held by none. For each frame that holds both ends of an edge, every line, arrow and label
// cell of the edge lies strictly inside too: one on its border or past it reads as the edge leaving the frame. Run
// after frames, so every listed frame spans a box.
export function inFrames(d: Drawing, all: readonly Spot[]): Fail | null {
  const boxes = d.expect.frames.flatMap((id) => frameBox(all, id) ?? [])
  const within = (p: Spot, b: FrameBox) => p.r > b.top && p.r < b.bottom && p.c > b.left && p.c < b.right
  const drawn = new Map<string, Spot[]>()
  for (const p of all) {
    for (const o of p.cell.owners) {
      drawn.set(o, [...(drawn.get(o) ?? []), p])
    }
  }

  const holds = (b: FrameBox, n: string) => (drawn.get(n) ?? []).length > 0 && drawn.get(n)!.every((p) => within(p, b))
  for (const e of d.expect.edges) {
    const held = boxes.filter((b) => holds(b, e.from) && holds(b, e.to))
    if (held.length === 0) {
      continue
    }

    const mine = all.filter((p) => connects(p.cell, e.id))
    if (held.some((b) => !mine.every((p) => within(p, b)))) {
      return fail('edge-outside-frame')
    }
  }

  return null
}

// An edge crosses a frame's border only as often as the frame's hold on its ends needs: once when the frame holds one
// end, as inFrames reads holding, and never when it holds neither (or both, which inFrames checks). A crossing is a
// line cell of the edge on the border; frames lets only a straight one sit there. An edge that runs through a frame
// holding neither end, or leaves and re-enters it, reads as reaching into it. A frame never holds itself, so an edge
// ending at the frame crosses it never: its mark, an arrow cell, meets the border from outside, and its line stays
// outside (a self-loop on a frame that ran through it). Run after frames, so every listed frame spans a box.
export function crossFrames(d: Drawing, all: readonly Spot[]): Fail | null {
  const drawn = new Map<string, Spot[]>()
  for (const p of all) {
    for (const o of p.cell.owners) {
      drawn.set(o, [...(drawn.get(o) ?? []), p])
    }
  }

  for (const id of d.expect.frames) {
    const b = frameBox(all, id)
    if (!b) {
      continue
    }

    const within = (p: Spot) => p.r > b.top && p.r < b.bottom && p.c > b.left && p.c < b.right
    const onBorder = (p: Spot) => !within(p) && p.r >= b.top && p.r <= b.bottom && p.c >= b.left && p.c <= b.right
    const holds = (n: string) => (drawn.get(n) ?? []).length > 0 && drawn.get(n)!.every(within)
    for (const e of d.expect.edges) {
      const got = all.filter((p) => p.cell.kind === 'line' && owns(p.cell, e.id) && onBorder(p)).length
      if (got !== (holds(e.from) !== holds(e.to) ? 1 : 0)) {
        return fail('edge-crosses-frame')
      }
    }
  }

  return null
}

// C: each end label names its own edge and end unambiguously. A node's terminal is the edge's line or arrow cells
// beside it. The label's cells, taken together, come within distance 1 of its node's terminal, and strictly nearer it
// than every rival:
// the edge's other terminal, and every line or arrow cell the edge does not own. And no cell of its terminal within
// distance 1 of the label is another edge's too. So a tie fails: a label that spans the edge, sits between parallel
// edges, or ends a self-loop, whose two terminals are one; and so does a label on a stem two edges share, a fan-out's
// or a fan-in's, which keeps every glyph when its owners swap. labels checks its text.
export function endLabels(d: Drawing, all: readonly Spot[]): Fail | null {
  const lines = all.filter((p) => p.cell.kind === 'line' || p.cell.kind === 'arrow')
  for (const e of d.expect.edges) {
    if (!e.endLabels) {
      continue
    }

    const route = lines.filter((p) => owns(p.cell, e.id))
    const others = lines.filter((p) => !owns(p.cell, e.id))
    const terminal = (node: string) => route.filter((p) => SIDES.some((s) => owns(beside(d, p, s), node)))
    for (const { node, owner } of e.endLabels) {
      const mine = all.filter((p) => owns(p.cell, owner))
      const own = terminal(node)
      const near = gap(mine, own)
      const rivals = [...terminal(node === e.from ? e.to : e.from), ...others]
      const shared = own.some((p) => p.cell.owners.some((o) => o !== e.id) && gap(mine, [p]) <= 1)
      if (!(near <= 1 && near < gap(mine, rivals)) || shared) {
        return fail('end-label')
      }
    }
  }

  return null
}
