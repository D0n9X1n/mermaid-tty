// What a drawing must show, from plan A §6, and the validator: the fail-closed gate between a layout and the screen. Any
// failure makes the hook show the fence's source instead of the drawing.
import type { Cell, Drawing } from './canvas.ts'
import type { Fail } from './fail.ts'
import { fail } from './fail.ts'
import { width } from './width.ts'

export type Expect = {
  labels: readonly { owner: string; text: string }[]                                     // every label instance, keyed by owner id
  edges: readonly { id: string; from: string; to: string; ends: readonly End[]           // drawn edges; ~~~ is not listed
    endLabels?: readonly { node: string; owner: string }[] }[]   // C: each end label, owner `${id}:tail` or `${id}:head` by its true end
  edgeLabels: readonly { owner: string; edge: string }[]
  frames: readonly string[]                                                              // each frame's owner id: a cluster, a sequence frame or box
  bars?: readonly { owner: string; eighths: number; axis: 'h' | 'v'; lanes?: number }[]  // C: each bar; lanes: its width across the axis, default 1
  members?: readonly { id: string; parent: string }[]                                    // C: each drawn member row or column
}
// A drawn end mark of an edge: its glyph, and the node it attaches to. A self-loop's ends both name its one node.
export type End = { node: string; glyph: string }

// A drawn cell and where it is.
type Spot = { r: number; c: number; cell: Cell }
// A cell's sides: the dirs bit that points there (1 up, 2 right, 4 down, 8 left), the bit of the side facing back, and the
// step to the neighbor there.
type Side = { bit: number; back: number; dr: number; dc: number }
const SIDES: readonly Side[] = [{ bit: 1, back: 4, dr: -1, dc: 0 }, { bit: 2, back: 8, dr: 0, dc: 1 }, { bit: 4, back: 1, dr: 1, dc: 0 }, { bit: 8, back: 2, dr: 0, dc: -1 }]
// The side each directional head glyph points at, C's triangles △▷▽◁ included; any other head (● ◇ ◉, C's ◆ o x) has no point.
const POINT: ReadonlyMap<string, Side> = new Map([['▲', SIDES[0]!], ['►', SIDES[1]!], ['▼', SIDES[2]!], ['◄', SIDES[3]!],
  ['△', SIDES[0]!], ['▷', SIDES[1]!], ['▽', SIDES[2]!], ['◁', SIDES[3]!]])
// A head whose cell behind it has at least this many dirs bits sits on a junction, so its direction is ambiguous (VR.tangled).
const JUNCTION = 3

// The first broken invariant of d: labels, edges, dangling lines, crossings, merged lines, conflicts, row widths, edge
// labels, frames, then C's end labels, bars and member rows. null if none.
export function validate(d: Drawing): Fail | null {
  const all = spots(d)
  return labels(d) ?? edges(d, all) ?? dangling(d, all) ?? crossings(d, all) ?? merges(d, all) ??
    (d.conflicts.length > 0 ? fail('overwrite') : null) ?? rows(d) ?? edgeLabels(d, all) ?? frames(d, all) ??
    endLabels(d, all) ?? bars(d, all) ?? members(d)
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

// Merged lines imply only real edges. Two edges' lines join in a line cell where the dirs each drew there, by the cell's
// segs, share an arm: they run together there, where a perpendicular crossing shares none. An arrow cell that several
// edges own joins them too. Joined lines read as one line, so in each group of joined edges every end drawn with no mark
// seems to lead to every node a mark in the group points at. Each such pair of a bare end t and a head h, t ≠ h, must be
// an edge of the drawing, from t to h. A fan-out, a fan-in and a complete bipartite merge pass; any other merge seems to
// draw an edge that is not there. A line cell that records no dirs for an edge there, as a hand-built cell may not, joins
// it by the cell's whole dirs, so it fails closed.
function merges(d: Drawing, all: readonly Spot[]): Fail | null {
  const ids = new Set(d.expect.edges.map(e => e.id)), root = new Map(d.expect.edges.map(e => [e.id, e.id]))
  const find = (id: string): string => { let r = id; while (root.get(r) !== r) r = root.get(r)!; return r }
  for (const p of all) {
    if (p.cell.kind !== 'line' && p.cell.kind !== 'arrow') continue
    const mine = p.cell.owners.filter(id => ids.has(id))
    const drew = (id: string) => p.cell.segs?.find(s => s.owner === id)?.dirs ?? p.cell.dirs
    for (const [i, a] of mine.entries()) for (const b of mine.slice(i + 1)) {
      if (p.cell.kind === 'arrow' || (drew(a) & drew(b)) !== 0) root.set(find(a), find(b))
    }
  }
  const groups = new Map<string, Edge[]>()
  for (const e of d.expect.edges) groups.set(find(e.id), [...(groups.get(find(e.id)) ?? []), e])
  // How many of e's end marks name n; e's endpoints at a node no mark covers, a self-loop's node counting twice.
  const marks = (e: Edge, n: string) => e.ends.filter(x => x.node === n).length
  const bare = (e: Edge) => [...new Set([e.from, e.to])].filter(n => Number(e.from === n) + Number(e.to === n) > marks(e, n))
  // Whether an edge leads from t to h: one listed from t to h, or one listed from h to t whose ends mark h, as a two-headed
  // edge's do, or those of an edge drawn reversed.
  const real = (t: string, h: string) => d.expect.edges.some(e => (e.from === t && e.to === h) || (e.from === h && e.to === t && marks(e, h) > 0))
  for (const group of groups.values()) {
    const heads = new Set(group.flatMap(e => e.ends.map(x => x.node))), tails = new Set(group.flatMap(e => bare(e)))
    for (const t of tails) for (const h of heads) if (t !== h && !real(t, h)) return fail('merge-ambiguous')
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

// The Chebyshev distance between two cells, and the least between a cell of ps and one of qs: Infinity if either has none.
const cheb = (p: Spot, q: Spot): number => Math.max(Math.abs(p.r - q.r), Math.abs(p.c - q.c))
const gap = (ps: readonly Spot[], qs: readonly Spot[]): number => ps.reduce((m, p) => qs.reduce((n, q) => Math.min(n, cheb(p, q)), m), Infinity)

// C: each end label sits at its own end. A node's terminal is the edge's line or arrow cells beside it. The label's cells,
// taken together, come within distance 1 of its node's terminal, and strictly nearer it than the other end's terminal. A
// tie fails: a label that spans the edge, or any end label of a self-loop, whose two terminals are one. labels checks its text.
function endLabels(d: Drawing, all: readonly Spot[]): Fail | null {
  for (const e of d.expect.edges) {
    if (!e.endLabels) continue
    const route = all.filter(p => (p.cell.kind === 'line' || p.cell.kind === 'arrow') && owns(p.cell, e.id))
    const terminal = (node: string) => route.filter(p => SIDES.some(s => owns(beside(d, p, s), node)))
    for (const { node, owner } of e.endLabels) {
      const mine = all.filter(p => owns(p.cell, owner)), near = gap(mine, terminal(node))
      if (!(near <= 1 && near < gap(mine, terminal(node === e.from ? e.to : e.from)))) return fail('end-label')
    }
  }
  return null
}

// Bar glyphs: █ counts 8 eighths on either axis, and a partial its index + 1: ▏…▉ growing right (h), ▁…▇ growing up (v).
const FULL = '█'
const PART = { h: [...'▏▎▍▌▋▊▉'], v: [...'▁▂▃▄▅▆▇'] } as const
const BAR: ReadonlySet<string> = new Set([FULL, ...PART.h, ...PART.v])
// The eighths a run's glyphs show, in reading order: full cells, then at most one partial of its axis. NaN for any other run.
function eighthsOf(gs: readonly string[], axis: 'h' | 'v'): number {
  const last = gs.at(-1)!, part = PART[axis].indexOf(last) + 1
  if (gs.slice(0, -1).some(g => g !== FULL) || (last !== FULL && part === 0)) return NaN
  return 8 * (gs.length - 1) + (last === FULL ? 8 : part)
}
// Maximal runs of cells: row runs (h) or column runs (v). A run's lane is its row (h) or column (v); its base, the reading
// position of its axis-side end, its left column (h) or its bottom row (v); its glyphs, left to right (h) or bottom to top (v).
type Run = { lane: number; base: number; glyphs: string[] }
function runs(cells: readonly Spot[], axis: 'h' | 'v'): Run[] {
  const lane = (p: Spot) => (axis === 'h' ? p.r : p.c), pos = (p: Spot) => (axis === 'h' ? p.c : -p.r)
  const out: Run[] = []
  for (const p of [...cells].sort((a, b) => lane(a) - lane(b) || pos(a) - pos(b))) {
    const run = out.at(-1)
    if (run?.lane === lane(p) && run.base + run.glyphs.length === pos(p)) run.glyphs.push(p.cell.ch)
    else out.push({ lane: lane(p), base: pos(p), glyphs: [p.cell.ch] })
  }
  return out
}

// C: each bar draws exactly its eighths, never vacuously. A bar cell is a cap in a bar glyph, so a status cap, a padding space
// or a ◆ its owner draws is none; a bar's runs are the maximal runs of the bar cells whose owners[0] is its owner. A bar of 0
// has no cell. A positive bar has exactly lanes ?? 1 runs, one in each of that many adjacent rows (h) or columns (v), all on
// one baseline, each its full cells then at most one partial, summing to eighths, so each ⌈eighths / 8⌉ cells long. Else
// bar. A bar cell whose owners[0] is no listed bar's owner is bar-stray.
function bars(d: Drawing, all: readonly Spot[]): Fail | null {
  const cells = all.filter(p => p.cell.kind === 'cap' && BAR.has(p.cell.ch)), listed = d.expect.bars ?? []
  for (const { owner, eighths, axis, lanes } of listed) {
    const rs = runs(cells.filter(p => p.cell.owners[0] === owner), axis), n = lanes ?? 1
    const ok = eighths === 0 ? rs.length === 0 : n >= 1 && rs.length === n &&
      rs.every((x, i) => x.lane === rs[0]!.lane + i && x.base === rs[0]!.base && eighthsOf(x.glyphs, axis) === eighths)
    if (!ok) return fail('bar')
  }
  const owners = new Set(listed.map(b => b.owner))
  return cells.some(p => !owners.has(p.cell.owners[0]!)) ? fail('bar-stray') : null
}

// C: each listed member is drawn, owned by exactly its own id and its parent's: it has a cell, and every cell whose owners[0]
// is its id has owners [id, parent]. Else member. With members set, every text cell with two distinct owners, the second no
// edge of expect.edges, is a listed { id: owners[0], parent: owners[1] }, so an omitted row fails member-unlisted. A drawing
// that sets no members, as no A drawing does, has no row checked.
function members(d: Drawing): Fail | null {
  const listed = d.expect.members
  if (!listed) return null
  const cells = d.cells.flat().filter((x): x is Cell => !!x)
  for (const { id, parent } of listed) {
    const mine = cells.filter(x => x.owners[0] === id)
    if (mine.length === 0 || mine.some(x => x.owners.length !== 2 || x.owners[1] !== parent)) return fail('member')
  }
  const edges = new Set(d.expect.edges.map(e => e.id))
  const unlisted = (x: Cell) => x.kind === 'text' && new Set(x.owners).size >= 2 && !edges.has(x.owners[1]!) &&
    !listed.some(m => m.id === x.owners[0] && m.parent === x.owners[1])
  return cells.some(unlisted) ? fail('member-unlisted') : null
}
