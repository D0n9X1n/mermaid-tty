// What a drawing must show, from plan A §6, and the validator: the fail-closed gate between a layout and the screen. Any
// failure makes the hook show the fence's source instead of the drawing.
import type { Cell, Drawing } from './canvas.ts'
import type { Fail } from './fail.ts'
import { fail } from './fail.ts'
import { width } from './width.ts'

export type Expect = {
  labels: readonly { owner: string; text: string }[]                                     // every label instance, keyed by owner id
  edges: readonly { id: string; from: string; to: string; heads: readonly string[] }[]  // drawn edges; ~~~ is not listed
  edgeLabels: readonly { owner: string; edge: string }[]
}

// A drawn cell and where it is.
type Spot = { r: number; c: number; cell: Cell }
// A cell's sides: the dirs bit that points there (1 up, 2 right, 4 down, 8 left), the bit of the side facing back, and the
// step to the neighbor there.
type Side = { bit: number; back: number; dr: number; dc: number }
const SIDES: readonly Side[] = [{ bit: 1, back: 4, dr: -1, dc: 0 }, { bit: 2, back: 8, dr: 0, dc: 1 }, { bit: 4, back: 1, dr: 1, dc: 0 }, { bit: 8, back: 2, dr: 0, dc: -1 }]
// The side each directional head glyph points at; any other head (● ◇ ◉) has no point.
const POINT: ReadonlyMap<string, Side> = new Map([['▲', SIDES[0]!], ['►', SIDES[1]!], ['▼', SIDES[2]!], ['◄', SIDES[3]!]])
// A head whose cell behind it has at least this many dirs bits sits on a junction, so its direction is ambiguous (VR.tangled).
const JUNCTION = 3

// The first broken invariant of d, checked in order: labels, edges, conflicts, row widths, edge labels. null if none.
export function validate(d: Drawing): Fail | null {
  const all = spots(d)
  return labels(d) ?? edges(d, all) ?? (d.conflicts.length > 0 ? fail('overwrite') : null) ?? rows(d) ?? edgeLabels(d, all)
}

const at = (d: Drawing, r: number, c: number): Cell | null => d.cells[r]?.[c] ?? null
// The cell beside p on side s.
const beside = (d: Drawing, p: Spot, s: Side): Cell | null => at(d, p.r + s.dr, p.c + s.dc)
// Whether x is drawn for id. A cell lists every id it is drawn for: a member row its own id, then its node's; a shared
// junction each edge through it; an edge label's cell the label's id, then the edge's.
const owns = (x: Cell | null, id: string): boolean => x?.owners.includes(id) ?? false
// How many sides x's dirs point at.
const degree = (x: Cell | null): number => SIDES.filter(s => ((x?.dirs ?? 0) & s.bit) !== 0).length
function spots(d: Drawing): Spot[] {
  const out: Spot[] = []
  d.cells.forEach((row, r) => row.forEach((cell, c) => { if (cell) out.push({ r, c, cell }) }))
  return out
}

// Label text as compared: each whitespace run, \n included, one space, and the ends trimmed, as wrap draws it.
const norm = (s: string): string => s.replace(/\s+/g, ' ').trim()

// Each text owner's drawn label instances, in reading order. A run is consecutive text and cont cells with one owners[0].
// A run starts an instance if its first cell has no join or its owner has none yet; any other run joins the owner's last
// instance by its join.
function instances(d: Drawing): Map<string, string[]> {
  const drawn = new Map<string, string[]>()
  for (const row of d.cells) {
    let prev: string | undefined                                  // the owner of the run the last cell belongs to
    for (const x of row) {
      if (x?.kind !== 'text' && x?.kind !== 'cont') { prev = undefined; continue }
      const owner = x.owners[0]!, list = drawn.get(owner) ?? []
      if (owner === prev) list.push(list.pop()! + x.ch)
      else if (x.join === undefined || list.length === 0) list.push(x.ch)
      else list.push(list.pop()! + x.join + x.ch)
      drawn.set(owner, list); prev = owner
    }
  }
  return drawn
}

// Each listed label is drawn exactly once, as its text. One blank after norm is drawn nowhere, since text('') writes no
// cell. Text drawn twice, by a blank label's owner, or by an owner expect does not list is a duplicate.
function labels(d: Drawing): Fail | null {
  const drawn = instances(d)
  for (const { owner, text } of d.expect.labels) {
    const got = drawn.get(owner) ?? []
    if (norm(text) === '') { if (got.length > 0) return fail('label-dup'); continue }
    if (got.length === 0 || got.some(t => norm(t) !== norm(text))) return fail('label-missing')
    if (got.length > 1) return fail('label-dup')
  }
  const listed = new Set(d.expect.labels.map(l => l.owner))
  for (const owner of drawn.keys()) if (!listed.has(owner)) return fail('label-dup')
  return null
}

// The cells of mine a walk from starts reaches. Two line cells step only where their dirs point at each other; an arrow or
// label cell steps to any adjacent cell.
function walk(mine: readonly Spot[], starts: readonly Spot[]): Spot[] {
  const byPos = new Map(mine.map(p => [`${p.r},${p.c}`, p]))
  const reached = new Set(starts)
  for (const p of reached) for (const s of SIDES) {               // a Set's for…of also visits what the loop adds
    const q = byPos.get(`${p.r + s.dr},${p.c + s.dc}`)
    if (q && (p.cell.kind !== 'line' || q.cell.kind !== 'line' || ((p.cell.dirs & s.bit) !== 0 && (q.cell.dirs & s.back) !== 0))) reached.add(q)
  }
  return [...reached]
}

// Whether x is a cell edge id's walk may step through: a line or arrow cell of the edge, or a text or cont cell of its own
// label, owner `${id}:label`. A fill, cap or other text cell never is, even one the edge owns.
const connects = (x: Cell, id: string): boolean =>
  ((x.kind === 'line' || x.kind === 'arrow') && owns(x, id)) || ((x.kind === 'text' || x.kind === 'cont') && x.owners[0] === `${id}:label`)

// Each edge is connected: a walk over the cells that connect it, from its line or arrow cells next to from (a line there
// must point at from), reaches a cell next to to. Each head is its own arrow cell of the edge at an end node, and none
// sits on a junction.
function edges(d: Drawing, all: readonly Spot[]): Fail | null {
  // The first of sides on which p touches a cell of any of ids.
  const toward = (p: Spot, ids: readonly string[], sides = SIDES) => sides.find(s => ids.some(id => owns(beside(d, p, s), id)))
  // The side a head meets an end node on: the side its glyph points at, or any side for a head with no point.
  const aim = (p: Spot, ids: readonly string[]) => { const s = POINT.get(p.cell.ch); return toward(p, ids, s ? [s] : SIDES) }
  for (const e of d.expect.edges) {
    const mine = all.filter(p => connects(p.cell, e.id))
    const starts = mine.filter(p => SIDES.some(s => owns(beside(d, p, s), e.from) &&
      (p.cell.kind === 'arrow' || (p.cell.kind === 'line' && (p.cell.dirs & s.bit) !== 0))))
    if (!walk(mine, starts).some(p => toward(p, [e.to]))) return fail('edge-disconnected')
    // Every head claims its own arrow cell first; only then is the cell behind each, opposite its point, checked.
    const pool = mine.filter(p => p.cell.kind === 'arrow'), heads: Spot[] = []
    for (const h of e.heads) {
      const i = pool.findIndex(p => p.cell.ch === h && aim(p, [e.from, e.to]))
      if (i < 0) return fail('edge-disconnected')
      heads.push(...pool.splice(i, 1))
    }
    // Any arrow cell of the edge no head claimed is an extra head, as when the canvas merged it into another edge's head.
    if (pool.length > 0) return fail('head-extra')
    for (const head of heads) {
      const s = aim(head, [e.from, e.to])!
      if (degree(at(d, head.r - s.dr, head.c - s.dc)) >= JUNCTION) return fail('head-on-junction')
    }
  }
  return null
}

// No row is wider than the budget, measured as the terminal shows it: an empty cell is a space, a cont cell adds nothing,
// and trailing spaces drop.
function rows(d: Drawing): Fail | null {
  const shown = (row: readonly (Cell | null)[]) => row.map(x => (!x ? ' ' : x.kind === 'cont' ? '' : x.ch)).join('').replace(/ +$/, '')
  return d.cells.some(row => width(shown(row)) > d.columns) ? fail('row-too-wide') : null
}

// Each edge label has a cell within Chebyshev distance 1 of a line or arrow cell of its edge.
function edgeLabels(d: Drawing, all: readonly Spot[]): Fail | null {
  for (const { owner, edge } of d.expect.edgeLabels) {
    const route = all.filter(p => (p.cell.kind === 'line' || p.cell.kind === 'arrow') && owns(p.cell, edge))
    const near = all.some(p => owns(p.cell, owner) && route.some(q => Math.max(Math.abs(p.r - q.r), Math.abs(p.c - q.c)) <= 1))
    if (!near) return fail('label-not-adjacent')
  }
  return null
}
