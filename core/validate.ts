// What a drawing must show, from plan A §6, and the validator: the fail-closed gate between a layout and the screen. Any
// failure makes the hook show the fence's source instead of the drawing.
import type { Cell, Drawing } from './canvas.ts'
import type { Fail } from './fail.ts'
import { fail } from './fail.ts'
import { width } from './width.ts'

export type Expect = {
  labels: readonly { owner: string; text: string }[]                                     // every label instance, keyed by owner id
  edges: readonly { id: string; from: string; to: string; ends: readonly End[] }[]       // drawn edges; ~~~ is not listed
  edgeLabels: readonly { owner: string; edge: string }[]
  frames: readonly string[]                                                              // each frame's owner id: a cluster, a sequence frame or box
}
// A drawn end mark of an edge: its glyph, and the node it attaches to. A self-loop's ends both name its one node.
export type End = { node: string; glyph: string }

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

// The first broken invariant of d: labels, edges, dangling lines, crossings, conflicts, row widths, edge labels, frames.
// null if none.
export function validate(d: Drawing): Fail | null {
  const all = spots(d)
  return labels(d) ?? edges(d, all) ?? dangling(d, all) ?? crossings(d, all) ?? (d.conflicts.length > 0 ? fail('overwrite') : null) ??
    rows(d) ?? edgeLabels(d, all) ?? frames(d, all)
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
// must point at from), reaches a cell next to to. Each end mark is its own arrow cell of the edge beside its own node, and
// none sits on a junction.
function edges(d: Drawing, all: readonly Spot[]): Fail | null {
  // The first of sides on which p touches a cell of any of ids.
  const toward = (p: Spot, ids: readonly string[], sides = SIDES) => sides.find(s => ids.some(id => owns(beside(d, p, s), id)))
  // The side a mark meets its node on: the side its glyph points at, or any side for a mark with no point.
  const aim = (p: Spot, node: string) => { const s = POINT.get(p.cell.ch); return toward(p, [node], s ? [s] : SIDES) }
  for (const e of d.expect.edges) {
    const mine = all.filter(p => connects(p.cell, e.id))
    const starts = mine.filter(p => SIDES.some(s => owns(beside(d, p, s), e.from) &&
      (p.cell.kind === 'arrow' || (p.cell.kind === 'line' && (p.cell.dirs & s.bit) !== 0))))
    if (!walk(mine, starts).some(p => toward(p, [e.to]))) return fail('edge-disconnected')
    // Every end claims its own arrow cell first; only then is the cell behind each, opposite the side it meets its node on,
    // checked. An end whose glyph the edge draws fewer times than its ends need is missing; any other unclaimed end has its
    // mark drawn somewhere else: beside the other node, or pointing away from its own.
    const pool = mine.filter(p => p.cell.kind === 'arrow'), claimed: [Spot, Side][] = []
    const drawn = (g: string) => mine.filter(p => p.cell.kind === 'arrow' && p.cell.ch === g).length
    for (const end of e.ends) {
      const i = pool.findIndex(p => p.cell.ch === end.glyph && aim(p, end.node))
      if (i < 0) return fail(drawn(end.glyph) < e.ends.filter(x => x.glyph === end.glyph).length ? 'edge-disconnected' : 'end-misplaced')
      const p = pool.splice(i, 1)[0]!
      claimed.push([p, aim(p, end.node)!])
    }
    // Any arrow cell of the edge no end claimed is an extra head, as when the canvas merged it into another edge's head.
    if (pool.length > 0) return fail('head-extra')
    for (const [p, s] of claimed) if (degree(at(d, p.r - s.dr, p.c - s.dc)) >= JUNCTION) return fail('head-on-junction')
  }
  return null
}

function dangling(d: Drawing, all: readonly Spot[]): Fail | null {
  const edges = new Map(d.expect.edges.map(e => [e.id, e]))
  for (const p of all) {
    if (p.cell.kind !== 'line') continue
    const mine = p.cell.owners.flatMap(id => edges.has(id) ? [edges.get(id)!] : [])
    if (mine.length === 0) continue
    if (degree(p.cell) < 2) return fail('line-dangling')
    for (const s of SIDES.filter(s => p.cell.dirs & s.bit)) {
      const n = beside(d, p, s)
      const connected = n && ((n.kind === 'line' && (n.dirs & s.back) !== 0 && n.owners.some(id => p.cell.owners.includes(id))) ||
        mine.some(e => (n.kind === 'arrow' && owns(n, e.id)) ||
          ((n.kind === 'text' || n.kind === 'cont') && n.owners[0] === `${e.id}:label`) || owns(n, e.from) || owns(n, e.to)))
      if (!connected) return fail('line-dangling')
    }
  }
  return null
}

type Edge = Expect['edges'][number]
// Whether two edges share an endpoint, so that a cell both draw may be a junction of theirs.
const related = (a: Edge, b: Edge): boolean => [a.from, a.to].some(x => x === b.from || x === b.to)
// A crossing hides no junction. Where two edges that share no endpoint meet in a line cell, each edge there drew it
// straight, 5 (│) or 10 (─), by the dirs the cell records for that edge, and each such pair crosses, one │ and one ─: read
// as a crossing, an edge turning inside would vanish, and read as a junction, the crossing edges would join. A cell where
// only related edges meet, a fan-out or fan-in, is fine. A cell that records no dirs for an edge there, as a hand-built
// cell may not, fails closed: its glyph alone cannot tell a crossing from a turn.
function crossings(d: Drawing, all: readonly Spot[]): Fail | null {
  const edges = new Map(d.expect.edges.map(e => [e.id, e]))
  for (const p of all) {
    if (p.cell.kind !== 'line') continue
    const mine = p.cell.owners.flatMap(id => edges.has(id) ? [edges.get(id)!] : [])
    const pairs = mine.flatMap((a, i) => mine.slice(i + 1).filter(b => !related(a, b)).map(b => [a, b] as const))
    if (pairs.length === 0) continue
    const drew = (e: Edge) => p.cell.segs?.find(s => s.owner === e.id)?.dirs
    if (mine.some(e => drew(e) !== 5 && drew(e) !== 10)) return fail('crossing-ambiguous')
    if (pairs.some(([a, b]) => drew(a) === drew(b))) return fail('crossing-ambiguous')
  }
  return null
}

// No row is wider than the budget, measured exactly as toRows emits it: an empty cell is a space, a cont cell adds nothing,
// a drawn cell counts whatever its ch, a space included, and only trailing empty cells drop.
function rows(d: Drawing): Fail | null {
  const shown = (row: readonly (Cell | null)[]) =>
    row.slice(0, row.findLastIndex(x => !!x) + 1).map(x => (!x ? ' ' : x.kind === 'cont' ? '' : x.ch)).join('')
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

// A frame's corner glyphs, top-left, top-right, bottom-left, bottom-right, each in every light and heavy mix of its two arms.
const CORNERS: readonly ReadonlySet<string>[] = ['┌┍┎┏', '┐┑┒┓', '└┕┖┗', '┘┙┚┛'].map(s => new Set(s))

// Each frame stays closed. Its own frame cells span a real box, at least two rows and two columns, whose four corners are
// its own frame cells drawing its corner glyphs: text that erases a border and its corners leaves cells that span a smaller
// box, and no crossing or title sits on a corner. Each other cell on the box's border is a frame cell of its own or one of:
// its title, text or cont whose owners[0] is the frame, on the top border; a joint of one of its own dividers `${id}.${k}`,
// ├ on its left side or ┤ on its right; or a line only edges cross straight through, each by the dirs it drew there: │ (5)
// through the top or bottom, ─ (10) through a side. A lifeline needs no exception: a frame draws first, and a lifeline only
// fills empty cells. Text over a border, a run along it, or a frame with no cells is broken.
function frames(d: Drawing, all: readonly Spot[]): Fail | null {
  const edges = new Set(d.expect.edges.map(e => e.id))
  for (const id of d.expect.frames) {
    const mine = all.filter(p => p.cell.kind === 'frame' && p.cell.owners[0] === id)
    if (mine.length === 0) return fail('frame-broken')
    const rs = mine.map(p => p.r), cs = mine.map(p => p.c)
    const [top, bottom, left, right] = [Math.min(...rs), Math.max(...rs), Math.min(...cs), Math.max(...cs)]
    if (top >= bottom || left >= right) return fail('frame-broken')
    // Corner i, in CORNERS order, is its own frame cell drawing that corner's glyph.
    const corner = ([r, c]: readonly [number, number], i: number) => {
      const x = at(d, r, c)
      return x?.kind === 'frame' && x.owners[0] === id && CORNERS[i]!.has(x.ch)
    }
    if (!([[top, left], [top, right], [bottom, left], [bottom, right]] as const).every(corner)) return fail('frame-broken')
    const divider = (o: string) => o.startsWith(`${id}.`) && /^\d+$/.test(o.slice(id.length + 1))
    const kept = (r: number, c: number): boolean => {
      const x = at(d, r, c), across = r === top || r === bottom, side = c === left || c === right
      if (x?.kind === 'frame') return x.owners[0] === id
      if (!x || (across && side)) return false
      if (x.kind === 'text' || x.kind === 'cont') return r === top && x.owners[0] === id
      if (x.kind !== 'line' || x.owners.length === 0) return false
      if (side && x.dirs === (c === left ? 7 : 13) && x.owners.every(divider)) return true
      const dirs = across ? 5 : 10
      return x.dirs === dirs && x.owners.every(o => edges.has(o) && x.segs?.find(s => s.owner === o)?.dirs === dirs)
    }
    for (let c = left; c <= right; c++) if (!kept(top, c) || !kept(bottom, c)) return fail('frame-broken')
    for (let r = top + 1; r < bottom; r++) if (!kept(r, left) || !kept(r, right)) return fail('frame-broken')
  }
  return null
}
