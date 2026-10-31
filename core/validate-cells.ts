// The validator's shared reading of a drawing: drawn cells and their sides, owners, label instances, and the walk along
// an edge's cells. The checks in validate-lines, validate-frames and validate-charts build on these.
import type { Cell, Drawing } from './canvas.ts'
import type { Fail } from './fail.ts'
import { fail } from './fail.ts'
import { marker } from './emphasis.ts'
import type { Expect } from './validate.ts'

// A drawn cell and where it is.
export type Spot = { r: number; c: number; cell: Cell }

// A cell's sides: the dirs bit that points there (1 up, 2 right, 4 down, 8 left), the bit of the side facing back, and
// the step to the neighbor there.
export type Side = { bit: number; back: number; dr: number; dc: number }

export const SIDES: readonly Side[] = [
  { bit: 1, back: 4, dr: -1, dc: 0 },
  { bit: 2, back: 8, dr: 0, dc: 1 },
  { bit: 4, back: 1, dr: 1, dc: 0 },
  { bit: 8, back: 2, dr: 0, dc: -1 },
]

// The side each directional head glyph points at, C's triangles △▷▽◁ included; any other head (● ◇ ◉, C's ◆ o x) has no
// point.
export const POINT: ReadonlyMap<string, Side> = new Map([
  ['▲', SIDES[0]!],
  ['►', SIDES[1]!],
  ['▼', SIDES[2]!],
  ['◄', SIDES[3]!],
  ['△', SIDES[0]!],
  ['▷', SIDES[1]!],
  ['▽', SIDES[2]!],
  ['◁', SIDES[3]!],
])

// A head whose cell behind it has at least this many dirs bits sits on a junction, so its direction is ambiguous
// (VR.tangled).
export const JUNCTION = 3

export const at = (d: Drawing, r: number, c: number): Cell | null => d.cells[r]?.[c] ?? null

// The cell beside p on side s.
export const beside = (d: Drawing, p: Spot, s: Side): Cell | null => at(d, p.r + s.dr, p.c + s.dc)

// Whether x is drawn for id. A cell lists every id it is drawn for: a member row its own id, then its node's; a shared
// junction each edge through it; an edge label's cell the label's id, then the edge's.
export const owns = (x: Cell | null, id: string): boolean => x?.owners.includes(id) ?? false

// How many sides x's dirs point at.
export const degree = (x: Cell | null): number => SIDES.filter((s) => ((x?.dirs ?? 0) & s.bit) !== 0).length

export function spots(d: Drawing): Spot[] {
  const out: Spot[] = []
  d.cells.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (cell) {
        out.push({ r, c, cell })
      }
    }),
  )
  return out
}

// Label text as compared: each whitespace run, \n included, one space, and the ends trimmed, as wrap draws it.
export const norm = (s: string): string => s.replace(/\s+/g, ' ').trim()

// Each text owner's drawn label instances, in reading order. A run is consecutive text and cont cells with one
// owners[0]. A run starts an instance if its first cell has no join or its owner has none yet; any other run joins the
// owner's last instance by its join. A cell with em reads as its marker (core/emphasis.ts), then its ch.
export function instances(d: Drawing): Map<string, string[]> {
  const drawn = new Map<string, string[]>()
  for (const row of d.cells) {
    let prev: string | undefined // the owner of the run the last cell belongs to
    for (const x of row) {
      if (x?.kind !== 'text' && x?.kind !== 'cont') {
        prev = undefined
        continue
      }

      const owner = x.owners[0]!
      const list = drawn.get(owner) ?? []
      const ch = marker(x.em ?? 0) + x.ch
      if (owner === prev) {
        list.push(list.pop()! + ch)
      } else if (x.join === undefined || list.length === 0) {
        list.push(ch)
      } else {
        list.push(list.pop()! + x.join + ch)
      }

      drawn.set(owner, list)
      prev = owner
    }
  }

  return drawn
}

// X3. em is a text cell's emphasis (BOLD, ITALIC or both); no other cell has one. instances reads it back as its
// marker, so labels compares emphasis as part of the text. No cell's ch holds a control character: a marker there would
// read as em, and the row would show the character with no style. Source text never holds one (unsupported), nor does a
// glyph.
export const CONTROL = /\p{Cc}/u

export function emphasis(all: readonly Spot[]): Fail | null {
  return all.some(
    ({ cell: x }) => CONTROL.test(x.ch) || (x.em !== undefined && (x.kind !== 'text' || ![1, 2, 3].includes(x.em))),
  )
    ? fail('emphasis')
    : null
}

// Each listed label is drawn exactly once, as its text. One blank after norm is drawn nowhere, since text('') writes no
// cell. Text drawn twice, by a blank label's owner, or by an owner expect does not list is a duplicate.
export function labels(d: Drawing): Fail | null {
  const drawn = instances(d)
  for (const { owner, text } of d.expect.labels) {
    const got = drawn.get(owner) ?? []
    if (norm(text) === '') {
      if (got.length > 0) {
        return fail('label-dup')
      }

      continue
    }

    if (got.length === 0 || got.some((t) => norm(t) !== norm(text))) {
      return fail('label-missing')
    }

    if (got.length > 1) {
      return fail('label-dup')
    }
  }

  const listed = new Set(d.expect.labels.map((l) => l.owner))
  for (const owner of drawn.keys()) {
    if (!listed.has(owner)) {
      return fail('label-dup')
    }
  }

  return null
}

// The cells of mine a walk from starts reaches. A step into or out of a line cell needs that cell's arm on that side:
// two
// line cells step only where their dirs point at each other, and a line cell and an arrow or label cell only where the
// line
// points at it (a ┌ under a label, its arms away from it, is not joined to it). Arrow and label cells step to
// each other freely, as a label's rows do.
export function walk(mine: readonly Spot[], starts: readonly Spot[]): Spot[] {
  const byPos = new Map(mine.map((p) => [`${p.r},${p.c}`, p]))
  const reached = new Set(starts)
  for (const p of reached) {
    for (const s of SIDES) {
      // a Set's for…of also visits what the loop adds
      const q = byPos.get(`${p.r + s.dr},${p.c + s.dc}`)
      if (
        q &&
        (p.cell.kind !== 'line' || (p.cell.dirs & s.bit) !== 0) &&
        (q.cell.kind !== 'line' || (q.cell.dirs & s.back) !== 0)
      ) {
        reached.add(q)
      }
    }
  }

  return [...reached]
}

// Whether x is a cell edge id's walk may step through: a line or arrow cell of the edge, or a text, cont or key cell of
// its own label, owner `${id}:label`. A fill, cap or other text cell never is, even one the edge owns.
export const connects = (x: Cell, id: string): boolean =>
  ((x.kind === 'line' || x.kind === 'arrow') && owns(x, id)) ||
  ((x.kind === 'text' || x.kind === 'cont' || x.kind === 'key') && x.owners[0] === `${id}:label`)

// Each edge is connected: a walk over the cells that connect it, from its line or arrow cells next to from (a line
// there must point at from), reaches a cell next to to. Each end mark is its own arrow cell of the edge beside its own
// node, and none sits on a junction. The cells that connect edge e, and those a walk reaches from its line or arrow
// cells next to its from (a line there must point at from).
export function path(d: Drawing, all: readonly Spot[], e: Expect['edges'][number]): { mine: Spot[]; reached: Spot[] } {
  const mine = all.filter((p) => connects(p.cell, e.id))
  const starts = mine.filter((p) =>
    SIDES.some(
      (s) =>
        owns(beside(d, p, s), e.from) &&
        (p.cell.kind === 'arrow' || (p.cell.kind === 'line' && (p.cell.dirs & s.bit) !== 0)),
    ),
  )
  return { mine, reached: walk(mine, starts) }
}

// The Chebyshev distance between two cells, and the least between a cell of ps and one of qs: Infinity if either has
// none.
export const cheb = (p: Spot, q: Spot): number => Math.max(Math.abs(p.r - q.r), Math.abs(p.c - q.c))

export const gap = (ps: readonly Spot[], qs: readonly Spot[]): number =>
  ps.reduce((m, p) => qs.reduce((n, q) => Math.min(n, cheb(p, q)), m), Infinity)
