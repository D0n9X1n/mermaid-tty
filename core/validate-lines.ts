// The validator's line checks: each edge is one connected path from its source to its target, draws in its own style,
// leaves no dangling or stray cells, crosses only where it hides no junction, and merges only into real links. Also
// row widths and edge labels.
import type { Cell, Drawing } from './canvas.ts'
import type { Fail } from './fail.ts'
import { fail } from './fail.ts'
import { lineGlyph } from './canvas.ts'
import { width } from './width.ts'
import type { Side, Spot } from './validate-cells.ts'
import { JUNCTION, POINT, SIDES, at, beside, degree, owns, path } from './validate-cells.ts'
import type { Expect } from './validate.ts'

// The walk from an edge's from reaches every line and arrow cell of the edge, so its glyphs are one path
// between its ends: a part joined to nothing, a closed loop of them included, is a stray copy of the edge, and could
// show a
// style its path does not. A keyed label's legend row lies apart from the line by design; keys binds it. Run after
// edges
// and dangling, which name an open spur or a misplaced mark more exactly.
export function strays(d: Drawing, all: readonly Spot[]): Fail | null {
  for (const e of d.expect.edges) {
    const { mine, reached } = path(d, all, e)
    const got = new Set(reached)
    if (mine.some((p) => (p.cell.kind === 'line' || p.cell.kind === 'arrow') && !got.has(p))) {
      return fail('edge-disconnected')
    }
  }

  return null
}

export function edges(d: Drawing, all: readonly Spot[]): Fail | null {
  // The first of sides on which p touches a cell of any of ids.
  const toward = (p: Spot, ids: readonly string[], sides = SIDES) =>
    sides.find((s) => ids.some((id) => owns(beside(d, p, s), id)))
  // The side a mark meets its node on: the side its glyph points at, or any side for a mark with no point.
  const aim = (p: Spot, node: string) => {
    const s = POINT.get(p.cell.ch)
    return toward(p, [node], s ? [s] : SIDES)
  }
  for (const e of d.expect.edges) {
    const { mine, reached } = path(d, all, e)
    if (!reached.some((p) => toward(p, [e.to]))) {
      return fail('edge-disconnected')
    }
    // Every end claims its own arrow cell first; only then is the cell behind each, opposite the side it meets its node
    // on,
    // checked. An end whose glyph the edge draws fewer times than its ends need is missing; any other unclaimed end has
    // its
    // mark drawn somewhere else: beside the other node, or pointing away from its own.
    const pool = mine.filter((p) => p.cell.kind === 'arrow')
    const claimed: [Spot, Side][] = []
    const drawn = (g: string) => mine.filter((p) => p.cell.kind === 'arrow' && p.cell.ch === g).length
    for (const end of e.ends) {
      const i = pool.findIndex((p) => p.cell.ch === end.glyph && aim(p, end.node))
      if (i < 0) {
        return fail(
          drawn(end.glyph) < e.ends.filter((x) => x.glyph === end.glyph).length ? 'edge-disconnected' : 'end-misplaced',
        )
      }

      const p = pool.splice(i, 1)[0]!
      claimed.push([p, aim(p, end.node)!])
    }
    // Any arrow cell of the edge no end claimed is an extra head, as when the canvas merged it into another edge's
    // head.
    if (pool.length > 0) {
      return fail('head-extra')
    }

    for (const [p, s] of claimed) {
      if (degree(at(d, p.r - s.dr, p.c - s.dc)) >= JUNCTION) {
        return fail('head-on-junction')
      }
    }
  }

  return null
}

export function dangling(d: Drawing, all: readonly Spot[]): Fail | null {
  const edges = new Map(d.expect.edges.map((e) => [e.id, e]))
  for (const p of all) {
    if (p.cell.kind !== 'line') {
      continue
    }

    const mine = p.cell.owners.flatMap((id) => (edges.has(id) ? [edges.get(id)!] : []))
    if (mine.length === 0) {
      continue
    }

    if (degree(p.cell) < 2) {
      return fail('line-dangling')
    }

    for (const s of SIDES.filter((s) => p.cell.dirs & s.bit)) {
      // The owners that draw this arm, by the dirs the cell records for each; all of them if it records none.
      const by = p.cell.segs ? p.cell.segs.filter((x) => x.dirs & s.bit).map((x) => x.owner) : p.cell.owners
      const n = beside(d, p, s)
      const others = by.filter((id) => !edges.has(id))
      const connected =
        n &&
        ((n.kind === 'line' && (n.dirs & s.back) !== 0 && n.owners.some((id) => by.includes(id))) ||
          (n.kind !== 'line' && n.owners.some((id) => others.includes(id))) ||
          mine
            .filter((e) => by.includes(e.id))
            .some(
              (e) =>
                (n.kind === 'arrow' && owns(n, e.id)) ||
                ((n.kind === 'text' || n.kind === 'cont' || n.kind === 'key') && n.owners[0] === `${e.id}:label`) ||
                owns(n, e.from) ||
                owns(n, e.to),
            ))
      if (!connected) {
        return fail('line-dangling')
      }
    }
  }

  return null
}

// A line cell shows exactly the arms and style it records: its glyph is the one the canvas draws for them (lineGlyph:
// light and heavy arms by weight, a mixed crossing in its mixed glyph, a dotted cell ┄ ┆ or its light bend), its arms
// are
// its dirs, and its dirs are the union of the dirs each owner drew there. So a glyph cannot show an arm no owner drew,
// hide
// one, or show another line style: ┆ for │ reads a dependency as an association. The one other glyph is a row mark's
// corner (C, gitGraph's fork), which draws round. A cell that records no arms or style, as a hand-built one may not, is
// read as light, as canvas.line records a light line.
export const ROUND: Readonly<Record<string, string>> = { '┐': '╮', '┌': '╭', '┘': '╯', '└': '╰' }

export function lineGlyphs(d: Drawing, all: readonly Spot[]): Fail | null {
  const marks = new Set((d.expect.rows ?? []).map((x) => x.mark))
  const weight = new Map<string, string>()
  const styles = new Map(d.expect.edges.flatMap((e) => (e.style ? [[e.id, e.style] as const] : [])))
  const hidden = new Set(d.expect.hidden ?? [])
  // An invisible edge draws no cell of any kind: no line, head or label.
  if (
    all.some(({ cell: x }) => x.owners.some((o) => hidden.has(o) || hidden.has(o.replace(/:(label|tail|head)$/, ''))))
  ) {
    return fail('line-glyph')
  }
  // Each listed edge's line cells, and those of a dotted or thick edge that show its style: any cell but a straight
  // crossing.
  const lines = new Map<string, number>()
  const shown = new Set<string>()
  for (const { cell: x } of all) {
    if (x.kind !== 'line') {
      continue
    }

    const arms = x.arms ?? [1, 2, 4, 8].map((b) => (x.dirs & b ? '1' : '0')).join('')
    if ([1, 2, 4, 8].reduce((m, b, i) => (arms[i] !== '0' ? m | b : m), 0) !== x.dirs) {
      return fail('line-glyph')
    }
    // A cell joins its arms in one weight unless it is a straight crossing, ┼ of one │ and one ─ by the dirs it records
    // for
    // each owner: a corner or tee of two weights shows a thick branch on a thin line.
    const crossing = x.dirs === 15 && (x.segs ?? []).length > 1 && x.segs!.every((s) => s.dirs === 5 || s.dirs === 10)
    if (!crossing && new Set([...arms].filter((a) => a !== '0')).size > 1) {
      return fail('line-glyph')
    }
    // An edge draws in its own style. Each arm it draws has its weight, heavy for thick and light otherwise, and a cell
    // drawn dotted is drawn only for dotted edges. A dotted edge's cell may draw solid only at a straight crossing,
    // where the
    // canvas draws the other line's style and ┼ shows no dash.
    for (const o of x.owners) {
      lines.set(o, (lines.get(o) ?? 0) + 1)
      const style = styles.get(o)
      if (!style) {
        continue
      }
      // Its style shows in a cell of its own path: a dotted edge's in a straight ┄ or ┆ (a corner draws solid), a thick
      // edge's in any heavy cell but a crossing.
      if (style === 'dotted' ? x.style === 'dotted' && (x.dirs === 5 || x.dirs === 10) : !crossing) {
        shown.add(o)
      }

      const dirs = x.segs?.find((s) => s.owner === o)?.dirs ?? x.dirs
      if ([1, 2, 4, 8].some((b, i) => (dirs & b) !== 0 && arms[i] !== (style === 'thick' ? '2' : '1'))) {
        return fail('line-glyph')
      }

      if ((x.style === 'dotted') !== (style === 'dotted') && !(style === 'dotted' && crossing)) {
        return fail('line-glyph')
      }
    }
    // Each owner draws one weight in every arm it draws, by the dirs the cell records for it (all of them if none), so
    // no
    // arm shows a thick branch on a thin line or a thin one on a thick line. A crossing's two owners may differ.
    for (const o of x.owners) {
      const dirs = x.segs?.find((s) => s.owner === o)?.dirs ?? x.dirs
      for (const [i, b] of [1, 2, 4, 8].entries()) {
        if (!(dirs & b) || arms[i] === '0') {
          continue
        }

        if ((weight.get(o) ?? arms[i]) !== arms[i]) {
          return fail('line-glyph')
        }

        weight.set(o, arms[i]!)
      }
    }

    const g = lineGlyph(x.dirs, arms, x.style ?? 'light')
    const want = x.owners.some((o) => marks.has(o)) ? (ROUND[g] ?? g) : g
    if (x.ch !== want || (x.segs && x.segs.reduce((m, s) => m | s.dirs, 0) !== x.dirs)) {
      return fail('line-glyph')
    }
  }
  // Every edge draws at least one line cell, so a head alone (A►B) cannot hide its style; the router never
  // draws one. A dotted edge draws a straight ┄ or ┆, and a thick edge a heavy cell that is not a crossing: a corner
  // shows no
  // dash, and ┼ shows neither dash nor weight. edges keeps every cell on the path, so this cell is on it too.
  for (const e of d.expect.edges) {
    if (!lines.get(e.id)) {
      return fail('line-glyph')
    }

    if ((e.style === 'dotted' || e.style === 'thick') && !shown.has(e.id)) {
      return fail('line-glyph')
    }
  }

  return null
}

export type Edge = Expect['edges'][number]

// Whether two edges share an endpoint, so that a cell both draw may be a junction of theirs.
export const related = (a: Edge, b: Edge): boolean => [a.from, a.to].some((x) => x === b.from || x === b.to)

// Which drawn line each edge is on, as a reader joins them: its root id. Edges that own one arrow cell join there. A
// line
// cell joins its edges as its glyph shows: its arms meet in one joint, whatever dirs each edge drew there. Only a ┼
// whose
// edges each run straight through it, by the dirs the cell records for each, 5 (│) or 10 (─), is a crossing: there only
// the edges on one axis join. A line cell that records no dirs for an edge there, as a hand-built cell may not, joins
// all
// of its edges, so it fails closed.
export function joined(d: Drawing, all: readonly Spot[]): (id: string) => string {
  const root = new Map(d.expect.edges.map((e) => [e.id, e.id]))
  const find = (id: string): string => {
    let r = id
    while (root.get(r) !== r) {
      r = root.get(r)!
    }

    return r
  }
  for (const p of all) {
    const mine = p.cell.owners.filter((id) => root.has(id))
    const drew = (id: string) => p.cell.segs?.find((s) => s.owner === id)?.dirs
    const crossing = p.cell.dirs === 15 && mine.every((id) => drew(id) === 5 || drew(id) === 10)
    for (const [i, a] of mine.entries()) {
      for (const b of mine.slice(i + 1)) {
        if (p.cell.kind === 'arrow' || (p.cell.kind === 'line' && (!crossing || drew(a) === drew(b)))) {
          root.set(find(a), find(b))
        }
      }
    }
  }

  return find
}

// A crossing hides no junction. Where two edges that share no endpoint meet in a line cell, on two lines, each edge
// there
// drew it straight, 5 (│) or 10 (─), by the dirs the cell records for that edge, and each such pair crosses, one │ and
// one
// ─: read as a crossing, an edge turning inside would vanish, and read as a junction, the crossing edges would join. A
// cell where only related edges meet, a fan-out or fan-in, is fine; so is one whose edges all join, as a trunk's do,
// for
// merges to judge. Only pairs on different lines must cross: unrelated edges of one line, a complete-bipartite trunk's,
// run one axis through a ┼ another line crosses, and merges judges them as it does anywhere else on that line.
export function crossings(d: Drawing, all: readonly Spot[]): Fail | null {
  const edges = new Map(d.expect.edges.map((e) => [e.id, e]))
  const line = joined(d, all)
  for (const p of all) {
    if (p.cell.kind !== 'line') {
      continue
    }

    const mine = p.cell.owners.flatMap((id) => (edges.has(id) ? [edges.get(id)!] : []))
    if (new Set(mine.map((e) => line(e.id))).size === 1) {
      continue
    }

    const pairs = mine.flatMap((a, i) =>
      mine
        .slice(i + 1)
        .filter((b) => !related(a, b) && line(a.id) !== line(b.id))
        .map((b) => [a, b] as const),
    )
    if (pairs.length === 0) {
      continue
    }

    const drew = (e: Edge) => p.cell.segs?.find((s) => s.owner === e.id)?.dirs
    if (mine.some((e) => drew(e) !== 5 && drew(e) !== 10)) {
      return fail('crossing-ambiguous')
    }

    if (pairs.some(([a, b]) => drew(a) === drew(b))) {
      return fail('crossing-ambiguous')
    }
  }

  return null
}

// Merged lines imply only real links. Edges on one drawn line, as joined reads them, read as one line, so each end that
// may
// start a link seems to lead to every end of another edge on it. An end may start a link if it is bare (no mark), or if
// it
// is a mark of an edge marked at every end, as a two-headed edge is, whose heads lead either way. Each such start t
// and:
// - each mark h of another edge must be an edge of the drawing from t to h drawing h's mark kind (real), a self-loop
//   when t = h,
//   while a head t and a head h at one node are one shared head;
// - each endpoint of another edge with no marks, which shows no direction, must be t's own node or one some edge joins
//   to
//   t, either way (linked);
// and edges with no marks at all on one line must fan (fans). A fan-out, a fan-in and a complete bipartite merge pass;
// any
// other merge seems to draw a link that is not there, as two two-headed edges A <--> B and A <--> C on one line seem to
// link
// B and C.
export function merges(d: Drawing, all: readonly Spot[]): Fail | null {
  const line = joined(d, all)
  const groups = new Map<string, Edge[]>()
  for (const e of d.expect.edges) {
    groups.set(line(e.id), [...(groups.get(line(e.id)) ?? []), e])
  }
  // How many of e's end marks name n; e's endpoints at a node no mark covers, a self-loop's node counting twice.
  const marks = (e: Edge, n: string) => e.ends.filter((x) => x.node === n).length
  const bare = (e: Edge) =>
    [...new Set([e.from, e.to])].filter((n) => Number(e.from === n) + Number(e.to === n) > marks(e, n))
  // The ends of e that may start a link: its bare ends, or the marks of an edge marked at every end.
  const starts = (e: Edge) =>
    bare(e).length > 0 || e.ends.length === 0
      ? bare(e).map((n) => ({ n, head: false }))
      : e.ends.map((x) => ({ n: x.node, head: true }))
  // Whether an edge leads from t to h: one listed from t to h, or one listed from h to t whose ends mark h, as a
  // two-headed
  // edge's do, or those of an edge drawn reversed.
  // A real link also draws the mark seen at h, by kind: A-->D and B--xD on one line read as A--xD and B-->D,
  // and a bare start at h's own node reads as a self-loop with that head, so the loop there must draw it (A--xA is no
  // A-->A).
  const real = (t: string, h: string, g: string) =>
    d.expect.edges.some(
      (e) =>
        ((e.from === t && e.to === h) || (e.from === h && e.to === t)) &&
        e.ends.some((x) => x.node === h && headKind(x.glyph) === headKind(g)),
    )
  const linked = (t: string, n: string) =>
    t === n || d.expect.edges.some((e) => (e.from === t && e.to === n) || (e.from === n && e.to === t))
  // One line draws one style: a cell whose edges are all of one line, two or more of them on it, takes the
  // style of every other such cell of that line, so no implied link reads solid where its own edge is dotted.
  const styles = new Map<string, string>()
  for (const p of all) {
    if (p.cell.kind !== 'line') {
      continue
    }

    const mine = p.cell.owners.filter((id) => groups.has(line(id)) && d.expect.edges.some((e) => e.id === id))
    if (mine.length === 0 || new Set(mine.map(line)).size !== 1 || (groups.get(line(mine[0]!))?.length ?? 0) < 2) {
      continue
    }

    const k = line(mine[0]!)
    const style = p.cell.style ?? 'light'
    if ((styles.get(k) ?? style) !== style) {
      return fail('merge-ambiguous')
    }

    styles.set(k, style)
  }

  for (const group of groups.values()) {
    for (const a of group) {
      for (const b of group) {
        if (a === b) {
          continue
        }

        for (const t of starts(a)) {
          if (b.ends.some((x) => !(t.head && t.n === x.node) && !real(t.n, x.node, x.glyph))) {
            return fail('merge-ambiguous')
          }

          if (a.ends.length > 0 && b.ends.length === 0 && (!linked(t.n, b.from) || !linked(t.n, b.to))) {
            return fail('merge-ambiguous')
          }
        }
      }
    }

    if (!fans(group.filter((e) => e.ends.length === 0))) {
      return fail('merge-ambiguous')
    }
  }

  return null
}

// A head's kind: a pointed arrow ▲►▼◄ in any direction, a hollow triangle △▷▽◁ in any, or the glyph itself (o x ◆ ◇ ●
// ◉).
export function headKind(g: string): string {
  if ('▲►▼◄'.includes(g)) {
    return '▶'
  }

  if ('△▷▽◁'.includes(g)) {
    return '▷'
  }

  return g
}

// Whether unmarked edges on one line read true. With no mark to tell them apart, each end seems to lead to every other,
// so they must all leave one node, as a mindmap's siblings do, or all enter one; a line of one edge is just that edge.
export const fans = (open: readonly Edge[]): boolean =>
  open.length < 2 || open.every((e) => e.from === open[0]!.from) || open.every((e) => e.to === open[0]!.to)

// No row is wider than the budget, measured exactly as toRows emits it: an empty cell is a space, a cont cell adds
// nothing, a drawn cell counts whatever its ch, a space included, and only trailing empty cells drop.
export function rows(d: Drawing): Fail | null {
  const shownCell = (x: Cell | null): string => {
    if (!x) {
      return ' '
    }

    return x.kind === 'cont' ? '' : x.ch
  }
  const shown = (row: readonly (Cell | null)[]) =>
    row
      .slice(0, row.findLastIndex((x) => !!x) + 1)
      .map(shownCell)
      .join('')
  return d.cells.some((row) => width(shown(row)) > d.columns) ? fail('row-too-wide') : null
}

// Each edge label has a cell within Chebyshev distance 1 of a line or arrow cell of its edge.
export function edgeLabels(d: Drawing, all: readonly Spot[]): Fail | null {
  for (const { owner, edge } of d.expect.edgeLabels) {
    const route = all.filter((p) => (p.cell.kind === 'line' || p.cell.kind === 'arrow') && owns(p.cell, edge))
    const near = all.some(
      (p) => owns(p.cell, owner) && route.some((q) => Math.max(Math.abs(p.r - q.r), Math.abs(p.c - q.c)) <= 1),
    )
    if (!near) {
      return fail('label-not-adjacent')
    }
  }

  return null
}
