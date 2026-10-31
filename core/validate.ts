// What a drawing must show, from plan A §6, and the validator: the fail-closed gate between a layout and the screen. Any
// failure makes the hook show the fence's source instead of the drawing.
import type { Cell, Drawing } from './canvas.ts'
import type { Fail } from './fail.ts'
import { fail } from './fail.ts'
import { lineGlyph } from './canvas.ts'
import { marker } from './emphasis.ts'
import { width } from './width.ts'

export type Expect = {
  labels: readonly { owner: string; text: string; at?: { r: number; c: number } }[]    // every label instance, keyed by owner id; C: at, its first cell
  edges: readonly { id: string; from: string; to: string; ends: readonly End[]           // drawn edges; ~~~ is not listed
    endLabels?: readonly { node: string; owner: string }[]       // C: each end label, owner `${id}:tail` or `${id}:head` by its true end
    style?: 'solid' | 'thick' | 'dotted' }[]                      // the source's line style, which every line cell of it draws
  hidden?: readonly string[]                                                              // invisible edges (~~~), drawn nowhere
  edgeLabels: readonly { owner: string; edge: string }[]
  frames: readonly string[]                                                              // each frame's owner id: a cluster, a sequence frame or box
  bars?: readonly { owner: string; eighths: number; axis: 'h' | 'v'; lanes?: number; at?: { r: number; c: number } }[]  // C: each bar; lanes: its width across the axis, default 1; at: its base cell
  members?: readonly { id: string; parent: string; place?: { r: number; c: number } }[]  // C: each drawn member row or column; place: its first cell, from its pill's top-left
  keys?: readonly { key: string; item: string; cls: string; at?: { r: number; c: number } }[]  // C: each keyed item, its key, class and own cell
  keyable?: readonly { item: string; cls: string }[]                                     // C: each item a class may key
  order?: readonly { ids: readonly string[]; column: boolean }[]                         // C: owners drawn in this row order
  glyphs?: readonly { owner: string; ch: string; at?: { r: number; c: number } }[]       // C: marks drawn as exactly this glyph; at: drawn exactly there
  rows?: readonly { mark: string; owners: readonly string[] }[]                          // C: each mark, in row order, and its labels
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

// The first broken invariant of d: emphasis, labels, edges, dangling lines, stray parts of an edge, crossings, merged lines, conflicts, row widths, edge
// labels, frames, edges kept inside their frames, edges crossing frames only as their ends need, then C's end labels, bars, member rows and their places, keys, order, glyphs, row labels and side notes, then lifelines and node labels in their pills. null if none.
export function validate(d: Drawing): Fail | null {
  const all = spots(d)
  return emphasis(all) ?? labels(d) ?? edges(d, all) ?? dangling(d, all) ?? strays(d, all) ?? crossings(d, all) ?? lineGlyphs(d, all) ?? merges(d, all) ??
    (d.conflicts.length > 0 ? fail('overwrite') : null) ?? rows(d) ?? edgeLabels(d, all) ?? frames(d, all) ??
    inFrames(d, all) ?? crossFrames(d, all) ?? endLabels(d, all) ?? bars(d, all) ?? members(d) ?? memberPlaces(d, all) ?? keys(d, all) ?? order(d, all) ?? glyphs(d, all) ?? places(d, all) ?? rowLabels(d, all) ?? notes(all) ?? lifelines(all) ?? inPills(d, all)
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
// instance by its join. A cell with em reads as its marker (core/emphasis.ts), then its ch.
function instances(d: Drawing): Map<string, string[]> {
  const drawn = new Map<string, string[]>()
  for (const row of d.cells) {
    let prev: string | undefined                                  // the owner of the run the last cell belongs to
    for (const x of row) {
      if (x?.kind !== 'text' && x?.kind !== 'cont') { prev = undefined; continue }
      const owner = x.owners[0]!, list = drawn.get(owner) ?? [], ch = marker(x.em ?? 0) + x.ch
      if (owner === prev) list.push(list.pop()! + ch)
      else if (x.join === undefined || list.length === 0) list.push(ch)
      else list.push(list.pop()! + x.join + ch)
      drawn.set(owner, list); prev = owner
    }
  }
  return drawn
}

// X3. em is a text cell's emphasis (BOLD, ITALIC or both); no other cell has one. instances reads it back as its marker,
// so labels compares emphasis as part of the text. No cell's ch holds a control character: a marker there would read as
// em, and the row would show the character with no style. Source text never holds one (unsupported), nor does a glyph.
const CONTROL = /\p{Cc}/u
function emphasis(all: readonly Spot[]): Fail | null {
  return all.some(({ cell: x }) => CONTROL.test(x.ch) || (x.em !== undefined && (x.kind !== 'text' || ![1, 2, 3].includes(x.em))))
    ? fail('emphasis') : null
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

// The cells of mine a walk from starts reaches. A step into or out of a line cell needs that cell's arm on that side: two
// line cells step only where their dirs point at each other, and a line cell and an arrow or label cell only where the line
// points at it (a ┌ under a label, its arms away from it, is not joined to it). Arrow and label cells step to
// each other freely, as a label's rows do.
function walk(mine: readonly Spot[], starts: readonly Spot[]): Spot[] {
  const byPos = new Map(mine.map(p => [`${p.r},${p.c}`, p]))
  const reached = new Set(starts)
  for (const p of reached) for (const s of SIDES) {               // a Set's for…of also visits what the loop adds
    const q = byPos.get(`${p.r + s.dr},${p.c + s.dc}`)
    if (q && (p.cell.kind !== 'line' || (p.cell.dirs & s.bit) !== 0) && (q.cell.kind !== 'line' || (q.cell.dirs & s.back) !== 0)) reached.add(q)
  }
  return [...reached]
}

// Whether x is a cell edge id's walk may step through: a line or arrow cell of the edge, or a text, cont or key cell of its
// own label, owner `${id}:label`. A fill, cap or other text cell never is, even one the edge owns.
const connects = (x: Cell, id: string): boolean =>
  ((x.kind === 'line' || x.kind === 'arrow') && owns(x, id)) || ((x.kind === 'text' || x.kind === 'cont' || x.kind === 'key') && x.owners[0] === `${id}:label`)

// Each edge is connected: a walk over the cells that connect it, from its line or arrow cells next to from (a line there
// must point at from), reaches a cell next to to. Each end mark is its own arrow cell of the edge beside its own node, and
// none sits on a junction.
// The cells that connect edge e, and those a walk reaches from its line or arrow cells next to its from (a line there must
// point at from).
function path(d: Drawing, all: readonly Spot[], e: Expect['edges'][number]): { mine: Spot[]; reached: Spot[] } {
  const mine = all.filter(p => connects(p.cell, e.id))
  const starts = mine.filter(p => SIDES.some(s => owns(beside(d, p, s), e.from) &&
    (p.cell.kind === 'arrow' || (p.cell.kind === 'line' && (p.cell.dirs & s.bit) !== 0))))
  return { mine, reached: walk(mine, starts) }
}

// The walk from an edge's from reaches every line and arrow cell of the edge, so its glyphs are one path
// between its ends: a part joined to nothing, a closed loop of them included, is a stray copy of the edge, and could show a
// style its path does not. A keyed label's legend row lies apart from the line by design; keys binds it. Run after edges
// and dangling, which name an open spur or a misplaced mark more exactly.
function strays(d: Drawing, all: readonly Spot[]): Fail | null {
  for (const e of d.expect.edges) {
    const { mine, reached } = path(d, all, e), got = new Set(reached)
    if (mine.some(p => (p.cell.kind === 'line' || p.cell.kind === 'arrow') && !got.has(p))) return fail('edge-disconnected')
  }
  return null
}

function edges(d: Drawing, all: readonly Spot[]): Fail | null {
  // The first of sides on which p touches a cell of any of ids.
  const toward = (p: Spot, ids: readonly string[], sides = SIDES) => sides.find(s => ids.some(id => owns(beside(d, p, s), id)))
  // The side a mark meets its node on: the side its glyph points at, or any side for a mark with no point.
  const aim = (p: Spot, node: string) => { const s = POINT.get(p.cell.ch); return toward(p, [node], s ? [s] : SIDES) }
  for (const e of d.expect.edges) {
    const { mine, reached } = path(d, all, e)
    if (!reached.some(p => toward(p, [e.to]))) return fail('edge-disconnected')
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
      // The owners that draw this arm, by the dirs the cell records for each; all of them if it records none.
      const by = p.cell.segs ? p.cell.segs.filter(x => x.dirs & s.bit).map(x => x.owner) : p.cell.owners
      const n = beside(d, p, s), others = by.filter(id => !edges.has(id))
      const connected = n && ((n.kind === 'line' && (n.dirs & s.back) !== 0 && n.owners.some(id => by.includes(id))) ||
        (n.kind !== 'line' && n.owners.some(id => others.includes(id))) ||
        mine.filter(e => by.includes(e.id)).some(e => (n.kind === 'arrow' && owns(n, e.id)) ||
          ((n.kind === 'text' || n.kind === 'cont' || n.kind === 'key') && n.owners[0] === `${e.id}:label`) || owns(n, e.from) || owns(n, e.to)))
      if (!connected) return fail('line-dangling')
    }
  }
  return null
}

// A line cell shows exactly the arms and style it records: its glyph is the one the canvas draws for them (lineGlyph:
// light and heavy arms by weight, a mixed crossing in its mixed glyph, a dotted cell ┄ ┆ or its light bend), its arms are
// its dirs, and its dirs are the union of the dirs each owner drew there. So a glyph cannot show an arm no owner drew, hide
// one, or show another line style: ┆ for │ reads a dependency as an association. The one other glyph is a row mark's
// corner (C, gitGraph's fork), which draws round. A cell that records no arms or style, as a hand-built one may not, is
// read as light, as canvas.line records a light line.
const ROUND: Readonly<Record<string, string>> = { '┐': '╮', '┌': '╭', '┘': '╯', '└': '╰' }
function lineGlyphs(d: Drawing, all: readonly Spot[]): Fail | null {
  const marks = new Set((d.expect.rows ?? []).map(x => x.mark)), weight = new Map<string, string>()
  const styles = new Map(d.expect.edges.flatMap(e => (e.style ? [[e.id, e.style] as const] : []))), hidden = new Set(d.expect.hidden ?? [])
  // An invisible edge draws no cell of any kind: no line, head or label.
  if (all.some(({ cell: x }) => x.owners.some(o => hidden.has(o) || hidden.has(o.replace(/:(label|tail|head)$/, ''))))) return fail('line-glyph')
  // Each listed edge's line cells, and those of a dotted or thick edge that show its style: any cell but a straight crossing.
  const lines = new Map<string, number>(), shown = new Set<string>()
  for (const { cell: x } of all) {
    if (x.kind !== 'line') continue
    const arms = x.arms ?? [1, 2, 4, 8].map(b => (x.dirs & b ? '1' : '0')).join('')
    if ([1, 2, 4, 8].reduce((m, b, i) => (arms[i] !== '0' ? m | b : m), 0) !== x.dirs) return fail('line-glyph')
    // A cell joins its arms in one weight unless it is a straight crossing, ┼ of one │ and one ─ by the dirs it records for
    // each owner: a corner or tee of two weights shows a thick branch on a thin line.
    const crossing = x.dirs === 15 && (x.segs ?? []).length > 1 && x.segs!.every(s => s.dirs === 5 || s.dirs === 10)
    if (!crossing && new Set([...arms].filter(a => a !== '0')).size > 1) return fail('line-glyph')
    // An edge draws in its own style. Each arm it draws has its weight, heavy for thick and light otherwise, and a cell
    // drawn dotted is drawn only for dotted edges. A dotted edge's cell may draw solid only at a straight crossing, where the
    // canvas draws the other line's style and ┼ shows no dash.
    for (const o of x.owners) {
      lines.set(o, (lines.get(o) ?? 0) + 1)
      const style = styles.get(o)
      if (!style) continue
      // Its style shows in a cell of its own path: a dotted edge's in a straight ┄ or ┆ (a corner draws solid), a thick
      // edge's in any heavy cell but a crossing.
      if (style === 'dotted' ? x.style === 'dotted' && (x.dirs === 5 || x.dirs === 10) : !crossing) shown.add(o)
      const dirs = x.segs?.find(s => s.owner === o)?.dirs ?? x.dirs
      if ([1, 2, 4, 8].some((b, i) => (dirs & b) !== 0 && arms[i] !== (style === 'thick' ? '2' : '1'))) return fail('line-glyph')
      if ((x.style === 'dotted') !== (style === 'dotted') && !(style === 'dotted' && crossing)) return fail('line-glyph')
    }
    // Each owner draws one weight in every arm it draws, by the dirs the cell records for it (all of them if none), so no
    // arm shows a thick branch on a thin line or a thin one on a thick line. A crossing's two owners may differ.
    for (const o of x.owners) {
      const dirs = x.segs?.find(s => s.owner === o)?.dirs ?? x.dirs
      for (const [i, b] of [1, 2, 4, 8].entries()) {
        if (!(dirs & b) || arms[i] === '0') continue
        if ((weight.get(o) ?? arms[i]) !== arms[i]) return fail('line-glyph')
        weight.set(o, arms[i]!)
      }
    }
    const g = lineGlyph(x.dirs, arms, x.style ?? 'light'), want = x.owners.some(o => marks.has(o)) ? ROUND[g] ?? g : g
    if (x.ch !== want || (x.segs && x.segs.reduce((m, s) => m | s.dirs, 0) !== x.dirs)) return fail('line-glyph')
  }
  // Every edge draws at least one line cell, so a head alone (A►B) cannot hide its style; the router never
  // draws one. A dotted edge draws a straight ┄ or ┆, and a thick edge a heavy cell that is not a crossing: a corner shows no
  // dash, and ┼ shows neither dash nor weight. edges keeps every cell on the path, so this cell is on it too.
  for (const e of d.expect.edges) {
    if (!lines.get(e.id)) return fail('line-glyph')
    if ((e.style === 'dotted' || e.style === 'thick') && !shown.has(e.id)) return fail('line-glyph')
  }
  return null
}

type Edge = Expect['edges'][number]
// Whether two edges share an endpoint, so that a cell both draw may be a junction of theirs.
const related = (a: Edge, b: Edge): boolean => [a.from, a.to].some(x => x === b.from || x === b.to)
// Which drawn line each edge is on, as a reader joins them: its root id. Edges that own one arrow cell join there. A line
// cell joins its edges as its glyph shows: its arms meet in one joint, whatever dirs each edge drew there. Only a ┼ whose
// edges each run straight through it, by the dirs the cell records for each, 5 (│) or 10 (─), is a crossing: there only
// the edges on one axis join. A line cell that records no dirs for an edge there, as a hand-built cell may not, joins all
// of its edges, so it fails closed.
function joined(d: Drawing, all: readonly Spot[]): (id: string) => string {
  const root = new Map(d.expect.edges.map(e => [e.id, e.id]))
  const find = (id: string): string => { let r = id; while (root.get(r) !== r) r = root.get(r)!; return r }
  for (const p of all) {
    const mine = p.cell.owners.filter(id => root.has(id))
    const drew = (id: string) => p.cell.segs?.find(s => s.owner === id)?.dirs
    const crossing = p.cell.dirs === 15 && mine.every(id => drew(id) === 5 || drew(id) === 10)
    for (const [i, a] of mine.entries()) for (const b of mine.slice(i + 1)) {
      if (p.cell.kind === 'arrow' || (p.cell.kind === 'line' && (!crossing || drew(a) === drew(b)))) root.set(find(a), find(b))
    }
  }
  return find
}

// A crossing hides no junction. Where two edges that share no endpoint meet in a line cell, on two lines, each edge there
// drew it straight, 5 (│) or 10 (─), by the dirs the cell records for that edge, and each such pair crosses, one │ and one
// ─: read as a crossing, an edge turning inside would vanish, and read as a junction, the crossing edges would join. A
// cell where only related edges meet, a fan-out or fan-in, is fine; so is one whose edges all join, as a trunk's do, for
// merges to judge. Only pairs on different lines must cross: unrelated edges of one line, a complete-bipartite trunk's,
// run one axis through a ┼ another line crosses, and merges judges them as it does anywhere else on that line.
function crossings(d: Drawing, all: readonly Spot[]): Fail | null {
  const edges = new Map(d.expect.edges.map(e => [e.id, e])), line = joined(d, all)
  for (const p of all) {
    if (p.cell.kind !== 'line') continue
    const mine = p.cell.owners.flatMap(id => edges.has(id) ? [edges.get(id)!] : [])
    if (new Set(mine.map(e => line(e.id))).size === 1) continue
    const pairs = mine.flatMap((a, i) => mine.slice(i + 1).filter(b => !related(a, b) && line(a.id) !== line(b.id)).map(b => [a, b] as const))
    if (pairs.length === 0) continue
    const drew = (e: Edge) => p.cell.segs?.find(s => s.owner === e.id)?.dirs
    if (mine.some(e => drew(e) !== 5 && drew(e) !== 10)) return fail('crossing-ambiguous')
    if (pairs.some(([a, b]) => drew(a) === drew(b))) return fail('crossing-ambiguous')
  }
  return null
}

// Merged lines imply only real links. Edges on one drawn line, as joined reads them, read as one line, so each end that may
// start a link seems to lead to every end of another edge on it. An end may start a link if it is bare (no mark), or if it
// is a mark of an edge marked at every end, as a two-headed edge is, whose heads lead either way. Each such start t and:
// - each mark h of another edge must be an edge of the drawing from t to h drawing h's mark kind (real), a self-loop when t = h,
//   while a head t and a head h at one node are one shared head;
// - each endpoint of another edge with no marks, which shows no direction, must be t's own node or one some edge joins to
//   t, either way (linked);
// and edges with no marks at all on one line must fan (fans). A fan-out, a fan-in and a complete bipartite merge pass; any
// other merge seems to draw a link that is not there, as two two-headed edges A <--> B and A <--> C on one line seem to link
// B and C.
function merges(d: Drawing, all: readonly Spot[]): Fail | null {
  const line = joined(d, all), groups = new Map<string, Edge[]>()
  for (const e of d.expect.edges) groups.set(line(e.id), [...(groups.get(line(e.id)) ?? []), e])
  // How many of e's end marks name n; e's endpoints at a node no mark covers, a self-loop's node counting twice.
  const marks = (e: Edge, n: string) => e.ends.filter(x => x.node === n).length
  const bare = (e: Edge) => [...new Set([e.from, e.to])].filter(n => Number(e.from === n) + Number(e.to === n) > marks(e, n))
  // The ends of e that may start a link: its bare ends, or the marks of an edge marked at every end.
  const starts = (e: Edge) => (bare(e).length > 0 || e.ends.length === 0 ? bare(e).map(n => ({ n, head: false })) : e.ends.map(x => ({ n: x.node, head: true })))
  // Whether an edge leads from t to h: one listed from t to h, or one listed from h to t whose ends mark h, as a two-headed
  // edge's do, or those of an edge drawn reversed.
  // A real link also draws the mark seen at h, by kind: A-->D and B--xD on one line read as A--xD and B-->D,
  // and a bare start at h's own node reads as a self-loop with that head, so the loop there must draw it (A--xA is no A-->A).
  const real = (t: string, h: string, g: string) => d.expect.edges.some(e => ((e.from === t && e.to === h) || (e.from === h && e.to === t)) &&
    e.ends.some(x => x.node === h && headKind(x.glyph) === headKind(g)))
  const linked = (t: string, n: string) => t === n || d.expect.edges.some(e => (e.from === t && e.to === n) || (e.from === n && e.to === t))
  // One line draws one style: a cell whose edges are all of one line, two or more of them on it, takes the
  // style of every other such cell of that line, so no implied link reads solid where its own edge is dotted.
  const styles = new Map<string, string>()
  for (const p of all) {
    if (p.cell.kind !== 'line') continue
    const mine = p.cell.owners.filter(id => groups.has(line(id)) && d.expect.edges.some(e => e.id === id))
    if (mine.length === 0 || new Set(mine.map(line)).size !== 1 || (groups.get(line(mine[0]!))?.length ?? 0) < 2) continue
    const k = line(mine[0]!), style = p.cell.style ?? 'light'
    if ((styles.get(k) ?? style) !== style) return fail('merge-ambiguous')
    styles.set(k, style)
  }
  for (const group of groups.values()) {
    for (const a of group) for (const b of group) {
      if (a === b) continue
      for (const t of starts(a)) {
        if (b.ends.some(x => !(t.head && t.n === x.node) && !real(t.n, x.node, x.glyph))) return fail('merge-ambiguous')
        if (a.ends.length > 0 && b.ends.length === 0 && (!linked(t.n, b.from) || !linked(t.n, b.to))) return fail('merge-ambiguous')
      }
    }
    if (!fans(group.filter(e => e.ends.length === 0))) return fail('merge-ambiguous')
  }
  return null
}
// Whether unmarked edges on one line read true. With no mark to tell them apart, each end seems to lead to every other, so
// they must all leave one node, as a mindmap's siblings do, or all enter one; a line of one edge is just that edge.
// A head's kind: a pointed arrow ▲►▼◄ in any direction, a hollow triangle △▷▽◁ in any, or the glyph itself (o x ◆ ◇ ● ◉).
const headKind = (g: string): string => ('▲►▼◄'.includes(g) ? '▶' : '△▷▽◁'.includes(g) ? '▷' : g)
const fans = (open: readonly Edge[]): boolean =>
  open.length < 2 || open.every(e => e.from === open[0]!.from) || open.every(e => e.to === open[0]!.to)

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

// The box frame id's own frame cells span: null if it has none, or they span less than two rows or two columns.
type FrameBox = { top: number; bottom: number; left: number; right: number }
function frameBox(all: readonly Spot[], id: string): FrameBox | null {
  const mine = all.filter(p => p.cell.kind === 'frame' && p.cell.owners[0] === id)
  if (mine.length === 0) return null
  const rs = mine.map(p => p.r), cs = mine.map(p => p.c)
  const [top, bottom, left, right] = [Math.min(...rs), Math.max(...rs), Math.min(...cs), Math.max(...cs)]
  return top < bottom && left < right ? { top, bottom, left, right } : null
}

// A frame's corner glyphs, top-left, top-right, bottom-left, bottom-right, each in every light and heavy mix of its two arms.
const CORNERS: readonly ReadonlySet<string>[] = ['┌┍┎┏', '┐┑┒┓', '└┕┖┗', '┘┙┚┛'].map(s => new Set(s))

// Each frame stays closed. Its own frame cells span a real box, at least two rows and two columns, whose four corners are
// its own frame cells drawing its corner glyphs: text that erases a border and its corners leaves cells that span a smaller
// box, and no crossing or title sits on a corner. Each other cell on the box's border is a frame cell of its own drawing
// that border (V5), ─ or ━ across and │ or ┃ down a side, or a tee ┬ ┴ ├ ┤ one of its own dividers continues inside; or:
// its title, text or cont whose owners[0] is the frame, on the top border; a joint of one of its own dividers `${id}.${k}`,
// ├ on its left side or ┤ on its right; or a line only edges cross straight through, each by the dirs it drew there: │ (5)
// through the top or bottom, ─ (10) through a side. A lifeline needs no exception: a frame draws first, and a lifeline only
// fills empty cells. Text over a border, a run along it, or a frame with no cells is broken.
function frames(d: Drawing, all: readonly Spot[]): Fail | null {
  const edges = new Set(d.expect.edges.map(e => e.id))
  for (const id of d.expect.frames) {
    const b = frameBox(all, id)
    if (!b) return fail('frame-broken')
    const { top, bottom, left, right } = b
    // Corner i, in CORNERS order, is its own frame cell drawing that corner's glyph.
    const corner = ([r, c]: readonly [number, number], i: number) => {
      const x = at(d, r, c)
      return x?.kind === 'frame' && x.owners[0] === id && CORNERS[i]!.has(x.ch)
    }
    if (!([[top, left], [top, right], [bottom, left], [bottom, right]] as const).every(corner)) return fail('frame-broken')
    const divider = (o: string) => o.startsWith(`${id}.`) && /^\d+$/.test(o.slice(id.length + 1))
    // Whether the line cell at (r, c) is this frame's divider and points back, by bit, at the border cell beside it.
    const stem = (r: number, c: number, bit: number) => {
      const y = at(d, r, c)
      return y?.kind === 'line' && (y.dirs & bit) !== 0 && y.owners.length > 0 && y.owners.every(divider)
    }
    // A frame cell of its own on a border draws that border: ─ ━ across, │ ┃ down a side, or a tee a divider continues.
    const drawn = (ch: string, r: number, c: number, across: boolean) => across
      ? '─━'.includes(ch) || ch === (r === top ? '┬' : '┴') && stem(r === top ? r + 1 : r - 1, c, r === top ? 1 : 4)
      : '│┃'.includes(ch) || ch === (c === left ? '├' : '┤') && stem(r, c === left ? c + 1 : c - 1, c === left ? 8 : 2)
    const kept = (r: number, c: number): boolean => {
      const x = at(d, r, c), across = r === top || r === bottom, side = c === left || c === right
      if (x?.kind === 'frame') return x.owners[0] === id && (across && side || drawn(x.ch, r, c, across))
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

// V6: an edge between nodes of one frame stays inside it. A frame holds a node when every cell drawn for the node, by its
// owners, lies strictly inside the frame's box; a node with no cells, or an endpoint that is itself a frame, whose own
// border is drawn for it, is held by none. For each frame that holds both ends of an edge, every line, arrow and label cell
// of the edge lies strictly inside too: one on its border or past it reads as the edge leaving the frame. Run after frames,
// so every listed frame spans a box.
function inFrames(d: Drawing, all: readonly Spot[]): Fail | null {
  const boxes = d.expect.frames.flatMap(id => frameBox(all, id) ?? [])
  const within = (p: Spot, b: FrameBox) => p.r > b.top && p.r < b.bottom && p.c > b.left && p.c < b.right
  const drawn = new Map<string, Spot[]>()
  for (const p of all) for (const o of p.cell.owners) drawn.set(o, [...(drawn.get(o) ?? []), p])
  const holds = (b: FrameBox, n: string) => (drawn.get(n) ?? []).length > 0 && drawn.get(n)!.every(p => within(p, b))
  for (const e of d.expect.edges) {
    const held = boxes.filter(b => holds(b, e.from) && holds(b, e.to))
    if (held.length === 0) continue
    const mine = all.filter(p => connects(p.cell, e.id))
    if (held.some(b => !mine.every(p => within(p, b)))) return fail('edge-outside-frame')
  }
  return null
}

// An edge crosses a frame's border only as often as the frame's hold on its ends needs: once when the frame holds one
// end, as inFrames reads holding, and never when it holds neither (or both, which inFrames checks). A crossing is a line cell
// of the edge on the border; frames lets only a straight one sit there. An edge that runs through a frame holding neither
// end, or leaves and re-enters it, reads as reaching into it. A frame never holds itself, so an edge ending at the frame
// crosses it never: its mark, an arrow cell, meets the border from outside, and its line stays outside (a
// self-loop on a frame that ran through it). Run after frames, so every listed frame spans a box.
function crossFrames(d: Drawing, all: readonly Spot[]): Fail | null {
  const drawn = new Map<string, Spot[]>()
  for (const p of all) for (const o of p.cell.owners) drawn.set(o, [...(drawn.get(o) ?? []), p])
  for (const id of d.expect.frames) {
    const b = frameBox(all, id)
    if (!b) continue
    const within = (p: Spot) => p.r > b.top && p.r < b.bottom && p.c > b.left && p.c < b.right
    const onBorder = (p: Spot) => !within(p) && p.r >= b.top && p.r <= b.bottom && p.c >= b.left && p.c <= b.right
    const holds = (n: string) => (drawn.get(n) ?? []).length > 0 && drawn.get(n)!.every(within)
    for (const e of d.expect.edges) {
      const got = all.filter(p => p.cell.kind === 'line' && owns(p.cell, e.id) && onBorder(p)).length
      if (got !== (holds(e.from) !== holds(e.to) ? 1 : 0)) return fail('edge-crosses-frame')
    }
  }
  return null
}

// The Chebyshev distance between two cells, and the least between a cell of ps and one of qs: Infinity if either has none.
const cheb = (p: Spot, q: Spot): number => Math.max(Math.abs(p.r - q.r), Math.abs(p.c - q.c))
const gap = (ps: readonly Spot[], qs: readonly Spot[]): number => ps.reduce((m, p) => qs.reduce((n, q) => Math.min(n, cheb(p, q)), m), Infinity)

// C: each end label names its own edge and end unambiguously. A node's terminal is the edge's line or arrow cells beside it.
// The label's cells, taken together, come within distance 1 of its node's terminal, and strictly nearer it than every rival:
// the edge's other terminal, and every line or arrow cell the edge does not own. And no cell of its terminal within distance
// 1 of the label is another edge's too. So a tie fails: a label that spans the edge, sits between parallel edges, or ends a
// self-loop, whose two terminals are one; and so does a label on a stem two edges share, a fan-out's or a fan-in's, which
// keeps every glyph when its owners swap. labels checks its text.
function endLabels(d: Drawing, all: readonly Spot[]): Fail | null {
  const lines = all.filter(p => p.cell.kind === 'line' || p.cell.kind === 'arrow')
  for (const e of d.expect.edges) {
    if (!e.endLabels) continue
    const route = lines.filter(p => owns(p.cell, e.id)), others = lines.filter(p => !owns(p.cell, e.id))
    const terminal = (node: string) => route.filter(p => SIDES.some(s => owns(beside(d, p, s), node)))
    for (const { node, owner } of e.endLabels) {
      const mine = all.filter(p => owns(p.cell, owner)), own = terminal(node), near = gap(mine, own)
      const rivals = [...terminal(node === e.from ? e.to : e.from), ...others]
      const shared = own.some(p => p.cell.owners.some(o => o !== e.id) && gap(mine, [p]) <= 1)
      if (!(near <= 1 && near < gap(mine, rivals)) || shared) return fail('end-label')
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
// bar. A bar with at has its first run's base cell there, its left cell (h) or its bottom cell (v), else bar-misplaced, so
// a bar cannot leave the row or column of its category, slice or task. A bar cell whose owners[0] is no listed bar's owner
// is bar-stray.
function bars(d: Drawing, all: readonly Spot[]): Fail | null {
  const cells = all.filter(p => p.cell.kind === 'cap' && BAR.has(p.cell.ch)), listed = d.expect.bars ?? []
  for (const { owner, eighths, axis, lanes, at: pos } of listed) {
    const rs = runs(cells.filter(p => p.cell.owners[0] === owner), axis), n = lanes ?? 1
    const ok = eighths === 0 ? rs.length === 0 : n >= 1 && rs.length === n &&
      rs.every((x, i) => x.lane === rs[0]!.lane + i && x.base === rs[0]!.base && eighthsOf(x.glyphs, axis) === eighths)
    if (!ok) return fail('bar')
    const base = rs[0] && (axis === 'h' ? { r: rs[0].lane, c: rs[0].base } : { r: -rs[0].base, c: rs[0].lane })
    if (pos && base && (base.r !== pos.r || base.c !== pos.c)) return fail('bar-misplaced')
  }
  const owners = new Set(listed.map(b => b.owner))
  return cells.some(p => !owners.has(p.cell.owners[0]!)) ? fail('bar-stray') : null
}

// C: each listed member is drawn, owned by exactly its own id and its parent's: it has a cell, and every cell whose owners[0]
// is its id has owners [id, parent]. Else member. With members set, every text or key cell with two distinct owners, the second no
// edge of expect.edges, is a listed { id: owners[0], parent: owners[1] }, so an omitted row fails member-unlisted. A drawing
// that sets no members, as no A drawing does, has no row checked. A keyed member's legend key, legend text and their
// continuation rows are owned by [id] alone, and accepted; its in-place key keeps [id, parent], so its row still needs that
// cell. A keyed ER comment's text lives only in its legend row.
function members(d: Drawing): Fail | null {
  const listed = d.expect.members
  if (!listed) return null
  const cells = d.cells.flat().filter((x): x is Cell => !!x)
  const keyed = new Set((d.expect.keys ?? []).map(k => k.item))
  for (const { id, parent } of listed) {
    const mine = cells.filter(x => x.owners[0] === id)
    const row = (x: Cell) => x.owners.length === 2 && x.owners[1] === parent
    const legend = (x: Cell) => keyed.has(id) && x.owners.length === 1 && (x.kind === 'key' ? x.legend === true : x.kind === 'text' || x.kind === 'cont')
    if (!mine.some(row) || mine.some(x => !row(x) && !legend(x))) return fail('member')
  }
  const edges = new Set(d.expect.edges.map(e => e.id))
  const unlisted = (x: Cell) => (x.kind === 'text' || x.kind === 'key') && new Set(x.owners).size >= 2 && !edges.has(x.owners[1]!) &&
    !listed.some(m => m.id === x.owners[0] && m.parent === x.owners[1])
  return cells.some(unlisted) ? fail('member-unlisted') : null
}

// C: each placed member is bound to its place in its own pill, the box of the cap, fill and frame cells its parent draws as
// owners[0]. Every cell it draws in its row, owners [id, parent], lies in that box, else member-outside; its first, in reading
// order, is place from the box's top-left, else member-misplaced. place is relative, so compaction, which never cuts a pill's
// rows or columns, keeps it; and a member on another's row, out of source order, or off its left edge is misplaced.
function memberPlaces(d: Drawing, all: readonly Spot[]): Fail | null {
  for (const { id, parent, place } of d.expect.members ?? []) {
    if (!place) continue
    const box = all.filter(p => (p.cell.kind === 'cap' || p.cell.kind === 'fill' || p.cell.kind === 'frame') && p.cell.owners[0] === parent)
    const mine = all.filter(p => p.cell.owners[0] === id && p.cell.owners[1] === parent)
    if (box.length === 0 || mine.length === 0) return fail('member-outside')
    const top = Math.min(...box.map(p => p.r)), bottom = Math.max(...box.map(p => p.r))
    const left = Math.min(...box.map(p => p.c)), right = Math.max(...box.map(p => p.c))
    if (mine.some(p => p.r < top || p.r > bottom || p.c < left || p.c > right)) return fail('member-outside')
    if (mine[0]!.r !== top + place.r || mine[0]!.c !== left + place.c) return fail('member-misplaced')
  }
  return null
}

// C: a key run is a maximal row run of key cells with one owners[0], its owner, and one legend flag. Its owners are those of
// all its cells, so a point key that several points own is a run of each. c is its first column, and end the column after it.
type KeyRun = { owner: string; legend: boolean; owners: Set<string>; text: string; r: number; c: number; end: number }
function keyRuns(all: readonly Spot[]): KeyRun[] {
  const out: KeyRun[] = []
  for (const { r, c, cell } of all) {                             // spots come row by row, left to right
    if (cell.kind !== 'key') continue
    const run = out.at(-1), legend = cell.legend === true
    if (run?.r === r && run.end === c && run.owner === cell.owners[0] && run.legend === legend) {
      run.text += cell.ch; run.end++; for (const o of cell.owners) run.owners.add(o)
    } else out.push({ owner: cell.owners[0]!, legend, owners: new Set(cell.owners), text: cell.ch, r, c, end: c + 1 })
  }
  return out
}

// C: a keyed item's text is replaced in place by its key, and drawn once in its own legend row after that key. Of the runs
// whose owners include an entry's item, exactly one is in place and one in the legend, else key-missing (fewer) or key-dup
// (more), and both read its key, else key-mismatch. The legend run is bound to its row: it is the row's first drawn cell,
// so a row holds one entry, then one empty cell, then a text cell whose owners[0] is the item, its legend text's start,
// else key-unbound; so the key at an item is the key in its own legend row. An entry's at, its own cell (a quadrant point's), is in its in-place run or beside it on its row, and a run
// the items of two or more entries own needs at on each, else key-unplaced. No key run touches a key cell on its row, which
// would read as one key with it, else key-adjacent: runs are maximal, so that cell is another run's. Each legend key row
// starts a block that runs to the row before the next one, and every text cell whose owners[0] is an entry's item, its
// wrapped rows included, is in its own legend row's block, else key-unbound; parts other owners draw, such as a value or a
// separator, are not checked. Then a run whose owner is no entry's item is key-stray; an entry that no keyable item matches
// by item and class is key-class; and a keyable class with an entry for some of its (item, cls) pairs but not all is
// key-partial, so keying an item in another class keys none of this one. labels checks the legend text, which the item
// itself owns.
function keys(d: Drawing, all: readonly Spot[]): Fail | null {
  const runs = keyRuns(all), listed = d.expect.keys ?? [], items = new Set(listed.map(k => k.item)), home = new Map<string, number>()
  for (const { key, item, at: pos } of listed) {
    const mine = runs.filter(x => x.owners.has(item)), here = mine.filter(x => !x.legend), there = mine.filter(x => x.legend)
    if (here.length === 0 || there.length === 0) return fail('key-missing')
    if (here.length > 1 || there.length > 1) return fail('key-dup')
    if (here[0]!.text !== key || there[0]!.text !== key) return fail('key-mismatch')
    const { r, c: from, end } = there[0]!, x = at(d, r, end + 1)
    if (d.cells[r]!.slice(0, from).some(y => y) || at(d, r, end) || x?.kind !== 'text' || x.owners[0] !== item) return fail('key-unbound')
    const h = here[0]!, shared = [...h.owners].filter(o => items.has(o)).length > 1
    // at is the producer's statement of its item's cell, as expect.labels is: a point is drawn only as its key; goldens pin it.
    if (pos ? pos.r !== h.r || pos.c < h.c - 1 || pos.c > h.end : shared) return fail('key-unplaced')
    home.set(item, r)
  }
  if (runs.some(x => at(d, x.r, x.end)?.kind === 'key')) return fail('key-adjacent')
  const starts = runs.filter(x => x.legend).map(x => x.r), block = (r: number) => starts.findLast(s => s <= r)
  if (all.some(({ r, cell: x }) => x.kind === 'text' && home.has(x.owners[0]!) && block(r) !== home.get(x.owners[0]!))) return fail('key-unbound')
  if (runs.some(x => !items.has(x.owner))) return fail('key-stray')
  const keyable = d.expect.keyable ?? []
  if (listed.some(k => !keyable.some(a => a.item === k.item && a.cls === k.cls))) return fail('key-class')
  const has = (a: { item: string; cls: string }) => listed.some(k => k.item === a.item && k.cls === a.cls)
  const partial = keyable.some(a => keyable.some(b => a.cls === b.cls && has(a) !== has(b)))
  return partial ? fail('key-partial') : null
}

// C: each order list's owners are each drawn on exactly one cell, in strictly increasing rows, and all in one column when
// column is set, so marks that only their position links (a gitGraph's commits on adjacent rows of a lane) cannot swap.
function order(d: Drawing, all: readonly Spot[]): Fail | null {
  if (!d.expect.order) return null
  const cells = new Map<string, Spot[]>()
  for (const p of all) for (const o of p.cell.owners) cells.set(o, [...(cells.get(o) ?? []), p])
  for (const { ids, column } of d.expect.order) {
    const ps = ids.map(id => cells.get(id) ?? [])
    if (ps.some(x => x.length !== 1)) return fail('order-broken')
    const at = ps.map(x => x[0]!)
    if (at.some((p, i) => i > 0 && (p.r <= at[i - 1]!.r || (column && p.c !== at[0]!.c)))) return fail('order-broken')
  }
  return null
}

// C: each listed owner with no at draws exactly one cell as owners[0], and it shows exactly its glyph, so a mark whose glyph
// is its meaning (a gitGraph commit's type) cannot show another's. An owner's entries with at state where it draws a glyph:
// the non-text cells it draws as owners[0] in that glyph are exactly those cells, else glyph-misplaced, so a tick mark or a
// point cannot move, and none can be added.
function glyphs(d: Drawing, all: readonly Spot[]): Fail | null {
  const placed = new Map<string, Set<string>>()
  for (const { owner, ch, at: pos } of d.expect.glyphs ?? []) {
    const mine = all.filter(p => p.cell.owners[0] === owner)
    if (pos) placed.set(`${owner}|${ch}`, (placed.get(`${owner}|${ch}`) ?? new Set()).add(`${pos.r},${pos.c}`))
    else if (mine.length !== 1 || mine[0]!.cell.ch !== ch) return fail('glyph-wrong')
  }
  for (const [k, want] of placed) {
    const got = all.filter(p => `${p.cell.owners[0]}|${p.cell.ch}` === k && p.cell.kind !== 'text' && p.cell.kind !== 'cont')
    if (got.length !== want.size || got.some(p => !want.has(`${p.r},${p.c}`))) return fail('glyph-misplaced')
  }
  return null
}

// C: each label stated at a cell is drawn there: the first text cell its owner draws as owners[0], in reading order, is
// that cell. So text that only its place gives meaning (an axis tick, a category, a header, a legend part) cannot move or
// swap with another of its width. A blank label draws no cell, so its at is not checked. Every diagram draws its title
// first, from the top-left cell: the title's first cell, in the title ink, is there, so a title cannot move.
function places(d: Drawing, all: readonly Spot[]): Fail | null {
  const first = new Map<string, Spot>()
  for (const p of all) if (p.cell.kind === 'text' && !first.has(p.cell.owners[0]!)) first.set(p.cell.owners[0]!, p)
  const title = first.get('title')
  if (title && title.cell.role === 'title' && (title.r !== 0 || title.c !== 0)) return fail('label-misplaced')
  for (const { owner, text, at: pos } of d.expect.labels) {
    if (!pos || norm(text) === '') continue
    const p = first.get(owner)
    if (!p || p.r !== pos.r || p.c !== pos.c) return fail('label-misplaced')
  }
  return null
}

// C: each row's labels are bound to its mark, so a label cannot read as another's. Each mark owns exactly one cell, in
// strictly increasing rows; its block runs from its row to the row before the next mark's. Every text or cont cell its
// owners draw lies in its block, right of its mark, in reading order owner by owner, the first on the mark's own row.
function rowLabels(d: Drawing, all: readonly Spot[]): Fail | null {
  if (!d.expect.rows) return null
  const text = (o: string) => all.filter(p => (p.cell.kind === 'text' || p.cell.kind === 'cont') && p.cell.owners[0] === o)
  const marks = d.expect.rows.map(x => all.filter(p => owns(p.cell, x.mark)))
  if (marks.some(m => m.length !== 1)) return fail('label-unbound')
  const at = marks.map(m => m[0]!)
  for (const [i, { owners }] of d.expect.rows.entries()) {
    const m = at[i]!, next = at[i + 1]?.r ?? d.cells.length, ps = owners.flatMap(text)   // spots run in reading order
    if ((i > 0 && m.r <= at[i - 1]!.r) || (ps.length > 0 && ps[0]!.r !== m.r)) return fail('label-unbound')
    if (ps.some((p, j) => p.r >= next || p.c <= m.c || (j > 0 && (p.r < ps[j - 1]!.r || (p.r === ps[j - 1]!.r && p.c <= ps[j - 1]!.c))))) return fail('label-unbound')
  }
  return null
}

// C: a side note reads as its node's only beside its link, the cap cells `${id}:link` draws. Its text and cont cells, owner
// id, start on the link's row, each row from one column, and sit against the link: right of it, the first cell just past
// it; left of it, the widest row's last cell just before it. Else note-unbound. Compaction never cuts a column between
// them, which the widest row fills. A keyed note, whose text is its legend row's, is bound by keys instead; a link of line
// cells is an edge's, checked as one.
function notes(all: readonly Spot[]): Fail | null {
  const text = new Map<string, Spot[]>(), link = new Map<string, Spot[]>()
  for (const p of all) {
    const o = p.cell.owners[0]!
    if (p.cell.kind === 'text' || p.cell.kind === 'cont') text.set(o, [...(text.get(o) ?? []), p])
    else if (p.cell.kind === 'cap' && o.endsWith(':link')) link.set(o.slice(0, -5), [...(link.get(o.slice(0, -5)) ?? []), p])
  }
  for (const [id, ls] of link) {
    const ps = text.get(id)
    if (!ps || all.some(p => p.cell.kind === 'key' && p.cell.owners[0] === id)) continue
    const lo = Math.min(...ls.map(p => p.c)), hi = Math.max(...ls.map(p => p.c)), c0 = ps[0]!.c   // spots run in reading order
    const aligned = ps.every((p, j) => j === 0 || p.r !== ps[j - 1]!.r || p.c > ps[j - 1]!.c) &&
      ps.every((p, j) => (j > 0 && p.r === ps[j - 1]!.r) || p.c === c0)
    const against = c0 > hi ? c0 === hi + 1 : Math.max(...ps.map(p => p.c)) === lo - 1
    if (ps[0]!.r !== ls[0]!.r || !aligned || !against) return fail('note-unbound')
  }
  return null
}

// A lifeline reads as the participant whose pill heads it, so each lifeline cell lies within its own pill's columns, the
// cap cells its owner draws: pills of one width swapped over their lifelines would reverse every message.
function lifelines(all: readonly Spot[]): Fail | null {
  const span = new Map<string, [number, number]>()
  for (const p of all) if (p.cell.kind === 'cap') {
    const id = p.cell.owners[0]!, [lo, hi] = span.get(id) ?? [p.c, p.c]
    span.set(id, [Math.min(lo, p.c), Math.max(hi, p.c)])
  }
  for (const p of all) if (p.cell.kind === 'lifeline') {
    const s = span.get(p.cell.owners[0]!)
    if (!s || p.c < s[0] || p.c > s[1]) return fail('lifeline-unbound')
  }
  return null
}

// A node's label reads as the node only inside its own pill: each text or cont cell a node draws as owners[0] lies in the
// box of the cap, fill and frame cells it draws so. Moved off it, the pill is left empty and the label floats beside a line
// it does not end. A node that draws no such cell (a gitGraph commit's labels are its row's) has no pill to leave; a keyed
// node (C), whose pill shows its key and whose text is its legend row's, is bound by keys instead. A node is an edge's end,
// or any owner that draws a fill cell, as a pill no edge reaches and a sequence note do.
function inPills(d: Drawing, all: readonly Spot[]): Fail | null {
  const nodes = new Set([...d.expect.edges.flatMap(e => [e.from, e.to]), ...all.flatMap(p => (p.cell.kind === 'fill' ? [p.cell.owners[0]!] : []))]), box = new Map<string, [number, number, number, number]>()
  for (const p of all) if ((p.cell.kind === 'cap' || p.cell.kind === 'fill' || p.cell.kind === 'frame') && nodes.has(p.cell.owners[0]!)) {
    const id = p.cell.owners[0]!, b = box.get(id) ?? [p.r, p.r, p.c, p.c]
    box.set(id, [Math.min(b[0], p.r), Math.max(b[1], p.r), Math.min(b[2], p.c), Math.max(b[3], p.c)])
  }
  for (const p of all) if (p.cell.kind === 'key') box.delete(p.cell.owners[0]!)
  for (const p of all) if (p.cell.kind === 'text' || p.cell.kind === 'cont') {
    const b = box.get(p.cell.owners[0]!)
    if (b && (p.r < b[0] || p.r > b[1] || p.c < b[2] || p.c > b[3])) return fail('label-unbound')
  }
  return null
}
