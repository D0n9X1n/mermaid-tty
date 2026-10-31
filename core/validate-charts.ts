// The validator's checks for the chart and record types: bars draw their exact eighths, class members and keys sit in
// their rows, items keep source order, glyphs are allowed, titles and row labels are placed, side notes and lifelines
// stay clear, and node labels sit inside their pills.
import type { Cell, Drawing } from './canvas.ts'
import type { Fail } from './fail.ts'
import { fail } from './fail.ts'
import { bodyWidth, titleColumn, titleRows } from './title.ts'
import type { Spot } from './validate-cells.ts'
import { at, norm, owns } from './validate-cells.ts'

// Bar glyphs: █ counts 8 eighths on either axis, and a partial its index + 1: ▏…▉ growing right (h), ▁…▇ growing up
// (v).
export const FULL = '█'

export const PART = { h: [...'▏▎▍▌▋▊▉'], v: [...'▁▂▃▄▅▆▇'] } as const

export const BAR: ReadonlySet<string> = new Set([FULL, ...PART.h, ...PART.v])

// The eighths a run's glyphs show, in reading order: full cells, then at most one partial of its axis. NaN for any
// other run.
export function eighthsOf(gs: readonly string[], axis: 'h' | 'v'): number {
  const last = gs.at(-1)!
  const part = PART[axis].indexOf(last) + 1
  if (gs.slice(0, -1).some((g) => g !== FULL) || (last !== FULL && part === 0)) {
    return NaN
  }

  return 8 * (gs.length - 1) + (last === FULL ? 8 : part)
}

// Maximal runs of cells: row runs (h) or column runs (v). A run's lane is its row (h) or column (v); its base, the
// reading position of its axis-side end, its left column (h) or its bottom row (v); its glyphs, left to right (h) or
// bottom to top (v).
export type Run = { lane: number; base: number; glyphs: string[] }

export function runs(cells: readonly Spot[], axis: 'h' | 'v'): Run[] {
  const lane = (p: Spot) => (axis === 'h' ? p.r : p.c)
  const pos = (p: Spot) => (axis === 'h' ? p.c : -p.r)
  const out: Run[] = []
  for (const p of [...cells].sort((a, b) => lane(a) - lane(b) || pos(a) - pos(b))) {
    const run = out.at(-1)
    if (run?.lane === lane(p) && run.base + run.glyphs.length === pos(p)) {
      run.glyphs.push(p.cell.ch)
    } else {
      out.push({ lane: lane(p), base: pos(p), glyphs: [p.cell.ch] })
    }
  }

  return out
}

// C: each bar draws exactly its eighths, never vacuously. A bar cell is a cap in a bar glyph, so a status cap, a
// padding space or a ◆ its owner draws is none; a bar's runs are the maximal runs of the bar cells whose owners[0] is
// its owner. A bar of 0 has no cell. A positive bar has exactly lanes ?? 1 runs, one in each of that many adjacent rows
// (h) or columns (v), all on one baseline, each its full cells then at most one partial, summing to eighths, so each
// ⌈eighths / 8⌉ cells long. Else bar. A bar with at has its first run's base cell there, its left cell (h) or its
// bottom cell (v), else bar-misplaced, so a bar cannot leave the row or column of its category, slice or task. A bar
// cell whose owners[0] is no listed bar's owner is bar-stray.
export function bars(d: Drawing, all: readonly Spot[]): Fail | null {
  const cells = all.filter((p) => p.cell.kind === 'cap' && BAR.has(p.cell.ch))
  const listed = d.expect.bars ?? []
  for (const { owner, eighths, axis, lanes, at: pos } of listed) {
    const rs = runs(
      cells.filter((p) => p.cell.owners[0] === owner),
      axis,
    )
    const n = lanes ?? 1
    const ok =
      eighths === 0
        ? rs.length === 0
        : n >= 1 &&
          rs.length === n &&
          rs.every(
            (x, i) => x.lane === rs[0]!.lane + i && x.base === rs[0]!.base && eighthsOf(x.glyphs, axis) === eighths,
          )
    if (!ok) {
      return fail('bar')
    }

    const base = rs[0] && (axis === 'h' ? { r: rs[0].lane, c: rs[0].base } : { r: -rs[0].base, c: rs[0].lane })
    if (pos && base && (base.r !== pos.r || base.c !== pos.c)) {
      return fail('bar-misplaced')
    }
  }

  const owners = new Set(listed.map((b) => b.owner))
  return cells.some((p) => !owners.has(p.cell.owners[0]!)) ? fail('bar-stray') : null
}

// C: each listed member is drawn, owned by exactly its own id and its parent's: it has a cell, and every cell whose
// owners[0] is its id has owners [id, parent]. Else member. With members set, every text or key cell with two distinct
// owners, the second no edge of expect.edges, is a listed { id: owners[0], parent: owners[1] }, so an omitted row fails
// member-unlisted. A drawing that sets no members, as no A drawing does, has no row checked. A keyed member's legend
// key, legend text and their continuation rows are owned by [id] alone, and accepted; its in-place key keeps [id,
// parent], so its row still needs that cell. A keyed ER comment's text lives only in its legend row.
export function members(d: Drawing): Fail | null {
  const listed = d.expect.members
  if (!listed) {
    return null
  }

  const cells = d.cells.flat().filter((x): x is Cell => !!x)
  const keyed = new Set((d.expect.keys ?? []).map((k) => k.item))
  for (const { id, parent } of listed) {
    const mine = cells.filter((x) => x.owners[0] === id)
    const row = (x: Cell) => x.owners.length === 2 && x.owners[1] === parent
    const legend = (x: Cell) =>
      keyed.has(id) &&
      x.owners.length === 1 &&
      (x.kind === 'key' ? x.legend === true : x.kind === 'text' || x.kind === 'cont')
    if (!mine.some(row) || mine.some((x) => !row(x) && !legend(x))) {
      return fail('member')
    }
  }

  const edges = new Set(d.expect.edges.map((e) => e.id))
  const unlisted = (x: Cell) =>
    (x.kind === 'text' || x.kind === 'key') &&
    new Set(x.owners).size >= 2 &&
    !edges.has(x.owners[1]!) &&
    !listed.some((m) => m.id === x.owners[0] && m.parent === x.owners[1])
  return cells.some(unlisted) ? fail('member-unlisted') : null
}

// C: each placed member is bound to its place in its own pill, the box of the cap, fill and frame cells its parent
// draws as owners[0]. Every cell it draws in its row, owners [id, parent], lies in that box, else member-outside; its
// first, in reading order, is place from the box's top-left, else member-misplaced. place is relative, so compaction,
// which never cuts a pill's rows or columns, keeps it; and a member on another's row, out of source order, or off its
// left edge is misplaced.
export function memberPlaces(d: Drawing, all: readonly Spot[]): Fail | null {
  for (const { id, parent, place } of d.expect.members ?? []) {
    if (!place) {
      continue
    }

    const box = all.filter(
      (p) =>
        (p.cell.kind === 'cap' || p.cell.kind === 'fill' || p.cell.kind === 'frame') && p.cell.owners[0] === parent,
    )
    const mine = all.filter((p) => p.cell.owners[0] === id && p.cell.owners[1] === parent)
    if (box.length === 0 || mine.length === 0) {
      return fail('member-outside')
    }

    const top = Math.min(...box.map((p) => p.r))
    const bottom = Math.max(...box.map((p) => p.r))
    const left = Math.min(...box.map((p) => p.c))
    const right = Math.max(...box.map((p) => p.c))
    if (mine.some((p) => p.r < top || p.r > bottom || p.c < left || p.c > right)) {
      return fail('member-outside')
    }

    if (mine[0]!.r !== top + place.r || mine[0]!.c !== left + place.c) {
      return fail('member-misplaced')
    }
  }

  return null
}

// C: a key run is a maximal row run of key cells with one owners[0], its owner, and one legend flag. Its owners are
// those of all its cells, so a point key that several points own is a run of each. c is its first column, and end the
// column after it.
export type KeyRun = {
  owner: string
  legend: boolean
  owners: Set<string>
  text: string
  r: number
  c: number
  end: number
}

export function keyRuns(all: readonly Spot[]): KeyRun[] {
  const out: KeyRun[] = []
  for (const { r, c, cell } of all) {
    // spots come row by row, left to right
    if (cell.kind !== 'key') {
      continue
    }

    const run = out.at(-1)
    const legend = cell.legend === true
    if (run?.r === r && run.end === c && run.owner === cell.owners[0] && run.legend === legend) {
      run.text += cell.ch
      run.end++
      for (const o of cell.owners) {
        run.owners.add(o)
      }
    } else {
      out.push({ owner: cell.owners[0]!, legend, owners: new Set(cell.owners), text: cell.ch, r, c, end: c + 1 })
    }
  }

  return out
}

// C: a keyed item's text is replaced in place by its key, and drawn once in its own legend row after that key. Of the
// runs whose owners include an entry's item, exactly one is in place and one in the legend, else key-missing (fewer) or
// key-dup (more), and both read its key, else key-mismatch. The legend run is bound to its row: it is the row's first
// drawn cell, so a row holds one entry, then one empty cell, then a text cell whose owners[0] is the item, its legend
// text's start, else key-unbound; so the key at an item is the key in its own legend row. An entry's at, its own cell
// (a quadrant point's), is in its in-place run or beside it on its row, and a run the items of two or more entries own
// needs at on each, else key-unplaced. No key run touches a key cell on its row, which would read as one key with it,
// else key-adjacent: runs are maximal, so that cell is another run's. Each legend key row starts a block that runs to
// the row before the next one, and every text cell whose owners[0] is an entry's item, its wrapped rows included, is in
// its own legend row's block, else key-unbound; parts other owners draw, such as a value or a separator, are not
// checked. Then a run whose owner is no entry's item is key-stray; an entry that no keyable item matches by item and
// class is key-class; and a keyable class with an entry for some of its (item, cls) pairs but not all is key-partial,
// so keying an item in another class keys none of this one. labels checks the legend text, which the item itself owns.
export function keys(d: Drawing, all: readonly Spot[]): Fail | null {
  const runs = keyRuns(all)
  const listed = d.expect.keys ?? []
  const items = new Set(listed.map((k) => k.item))
  const home = new Map<string, number>()
  for (const { key, item, at: pos } of listed) {
    const mine = runs.filter((x) => x.owners.has(item))
    const here = mine.filter((x) => !x.legend)
    const there = mine.filter((x) => x.legend)
    if (here.length === 0 || there.length === 0) {
      return fail('key-missing')
    }

    if (here.length > 1 || there.length > 1) {
      return fail('key-dup')
    }

    if (here[0]!.text !== key || there[0]!.text !== key) {
      return fail('key-mismatch')
    }

    const { r, c: from, end } = there[0]!
    const x = at(d, r, end + 1)
    if (d.cells[r]!.slice(0, from).some((y) => y) || at(d, r, end) || x?.kind !== 'text' || x.owners[0] !== item) {
      return fail('key-unbound')
    }

    const h = here[0]!
    const shared = [...h.owners].filter((o) => items.has(o)).length > 1
    // at is the producer's statement of its item's cell, as expect.labels is: a point is drawn only as its key; goldens
    // pin it.
    if (pos ? pos.r !== h.r || pos.c < h.c - 1 || pos.c > h.end : shared) {
      return fail('key-unplaced')
    }

    home.set(item, r)
  }

  if (runs.some((x) => at(d, x.r, x.end)?.kind === 'key')) {
    return fail('key-adjacent')
  }

  const starts = runs.filter((x) => x.legend).map((x) => x.r)
  const block = (r: number) => starts.findLast((s) => s <= r)
  if (
    all.some(({ r, cell: x }) => x.kind === 'text' && home.has(x.owners[0]!) && block(r) !== home.get(x.owners[0]!))
  ) {
    return fail('key-unbound')
  }

  if (runs.some((x) => !items.has(x.owner))) {
    return fail('key-stray')
  }

  const keyable = d.expect.keyable ?? []
  if (listed.some((k) => !keyable.some((a) => a.item === k.item && a.cls === k.cls))) {
    return fail('key-class')
  }

  const has = (a: { item: string; cls: string }) => listed.some((k) => k.item === a.item && k.cls === a.cls)
  const partial = keyable.some((a) => keyable.some((b) => a.cls === b.cls && has(a) !== has(b)))
  return partial ? fail('key-partial') : null
}

// C: each order list's owners are each drawn on exactly one cell, in strictly increasing rows, and all in one column
// when column is set, so marks that only their position links (a gitGraph's commits on adjacent rows of a lane) cannot
// swap.
export function order(d: Drawing, all: readonly Spot[]): Fail | null {
  if (!d.expect.order) {
    return null
  }

  const cells = new Map<string, Spot[]>()
  for (const p of all) {
    for (const o of p.cell.owners) {
      cells.set(o, [...(cells.get(o) ?? []), p])
    }
  }

  for (const { ids, column } of d.expect.order) {
    const ps = ids.map((id) => cells.get(id) ?? [])
    if (ps.some((x) => x.length !== 1)) {
      return fail('order-broken')
    }

    const at = ps.map((x) => x[0]!)
    if (at.some((p, i) => i > 0 && (p.r <= at[i - 1]!.r || (column && p.c !== at[0]!.c)))) {
      return fail('order-broken')
    }
  }

  return null
}

// C: each listed owner with no at draws exactly one cell as owners[0], and it shows exactly its glyph, so a mark whose
// glyph is its meaning (a gitGraph commit's type) cannot show another's. An owner's entries with at state where it
// draws a glyph:
// the non-text cells it draws as owners[0] in that glyph are exactly those cells, else glyph-misplaced, so a tick mark
// or a point cannot move, and none can be added.
export function glyphs(d: Drawing, all: readonly Spot[]): Fail | null {
  const placed = new Map<string, Set<string>>()
  for (const { owner, ch, at: pos } of d.expect.glyphs ?? []) {
    const mine = all.filter((p) => p.cell.owners[0] === owner)
    if (pos) {
      placed.set(`${owner}|${ch}`, (placed.get(`${owner}|${ch}`) ?? new Set()).add(`${pos.r},${pos.c}`))
    } else if (mine.length !== 1 || mine[0]!.cell.ch !== ch) {
      return fail('glyph-wrong')
    }
  }

  for (const [k, want] of placed) {
    const got = all.filter(
      (p) => `${p.cell.owners[0]}|${p.cell.ch}` === k && p.cell.kind !== 'text' && p.cell.kind !== 'cont',
    )
    if (got.length !== want.size || got.some((p) => !want.has(`${p.r},${p.c}`))) {
      return fail('glyph-misplaced')
    }
  }

  return null
}

// C: each label stated at a cell is drawn there: the first text cell its owner draws as owners[0], in reading order, is
// that cell. So text that only its place gives meaning (an axis tick, a category, a header, a legend part) cannot move
// or swap with another of its width. A blank label draws no cell, so its at is not checked. Every diagram draws its
// Whether each row the title draws on alone starts at its centered column: half the room the rest of the drawing leaves
// beside it. A row the title shares with another cell is not checked, as it isn't moved.
function titleCentered(d: Drawing): boolean {
  const rows = titleRows(d.cells)
  const body = bodyWidth(d.cells, rows)
  return rows.every((r) => {
    const row = d.cells[r]!
    if (!row.every((x) => x === null || (x.role === 'title' && x.owners[0] === 'title'))) {
      return true
    }

    const first = row.findIndex((x) => x !== null)
    const shown = row.findLastIndex((x) => x !== null) + 1 - first
    return first === titleColumn(body, shown)
  })
}

// title first, from the top-left cell: the title's first cell, in the title ink, is there, so a title cannot move.
export function places(d: Drawing, all: readonly Spot[]): Fail | null {
  const first = new Map<string, Spot>()
  for (const p of all) {
    if (p.cell.kind === 'text' && !first.has(p.cell.owners[0]!)) {
      first.set(p.cell.owners[0]!, p)
    }
  }

  // A diagram's title heads the drawing: it starts on the top row, and each row it draws on, when it draws alone there,
  // is centered over the rest of the drawing, as Mermaid centers it.
  const title = first.get('title')
  if (title && title.cell.role === 'title' && (title.r !== 0 || !titleCentered(d))) {
    return fail('label-misplaced')
  }

  for (const { owner, text, at: pos } of d.expect.labels) {
    if (!pos || norm(text) === '') {
      continue
    }

    const p = first.get(owner)
    if (!p || p.r !== pos.r || p.c !== pos.c) {
      return fail('label-misplaced')
    }
  }

  return null
}

// C: each row's labels are bound to its mark, so a label cannot read as another's. Each mark owns exactly one cell, in
// strictly increasing rows; its block runs from its row to the row before the next mark's. Every text or cont cell its
// owners draw lies in its block, right of its mark, in reading order owner by owner, the first on the mark's own row.
export function rowLabels(d: Drawing, all: readonly Spot[]): Fail | null {
  if (!d.expect.rows) {
    return null
  }

  const text = (o: string) =>
    all.filter((p) => (p.cell.kind === 'text' || p.cell.kind === 'cont') && p.cell.owners[0] === o)
  const marks = d.expect.rows.map((x) => all.filter((p) => owns(p.cell, x.mark)))
  if (marks.some((m) => m.length !== 1)) {
    return fail('label-unbound')
  }

  const at = marks.map((m) => m[0]!)
  for (const [i, { owners }] of d.expect.rows.entries()) {
    const m = at[i]!
    const next = at[i + 1]?.r ?? d.cells.length
    const ps = owners.flatMap(text) // spots run in reading order
    if ((i > 0 && m.r <= at[i - 1]!.r) || (ps.length > 0 && ps[0]!.r !== m.r)) {
      return fail('label-unbound')
    }

    if (
      ps.some(
        (p, j) =>
          p.r >= next || p.c <= m.c || (j > 0 && (p.r < ps[j - 1]!.r || (p.r === ps[j - 1]!.r && p.c <= ps[j - 1]!.c))),
      )
    ) {
      return fail('label-unbound')
    }
  }

  return null
}

// C: a side note reads as its node's only beside its link, the cap cells `${id}:link` draws. Its text and cont cells,
// owner id, start on the link's row, each row from one column, and sit against the link: right of it, the first cell
// just past it; left of it, the widest row's last cell just before it. Else note-unbound. Compaction never cuts a
// column between them, which the widest row fills. A keyed note, whose text is its legend row's, is bound by keys
// instead; a link of line cells is an edge's, checked as one.
export function notes(all: readonly Spot[]): Fail | null {
  const text = new Map<string, Spot[]>()
  const link = new Map<string, Spot[]>()
  for (const p of all) {
    const o = p.cell.owners[0]!
    if (p.cell.kind === 'text' || p.cell.kind === 'cont') {
      text.set(o, [...(text.get(o) ?? []), p])
    } else if (p.cell.kind === 'cap' && o.endsWith(':link')) {
      link.set(o.slice(0, -5), [...(link.get(o.slice(0, -5)) ?? []), p])
    }
  }

  for (const [id, ls] of link) {
    const ps = text.get(id)
    if (!ps || all.some((p) => p.cell.kind === 'key' && p.cell.owners[0] === id)) {
      continue
    }

    const lo = Math.min(...ls.map((p) => p.c))
    const hi = Math.max(...ls.map((p) => p.c))
    const c0 = ps[0]!.c // spots run in reading order
    const aligned =
      ps.every((p, j) => j === 0 || p.r !== ps[j - 1]!.r || p.c > ps[j - 1]!.c) &&
      ps.every((p, j) => (j > 0 && p.r === ps[j - 1]!.r) || p.c === c0)
    const against = c0 > hi ? c0 === hi + 1 : Math.max(...ps.map((p) => p.c)) === lo - 1
    if (ps[0]!.r !== ls[0]!.r || !aligned || !against) {
      return fail('note-unbound')
    }
  }

  return null
}

// A lifeline reads as the participant whose pill heads it, so each lifeline cell lies within its own pill's columns,
// the cap cells its owner draws: pills of one width swapped over their lifelines would reverse every message.
export function lifelines(all: readonly Spot[]): Fail | null {
  const span = new Map<string, [number, number]>()
  for (const p of all) {
    if (p.cell.kind === 'cap') {
      const id = p.cell.owners[0]!
      const [lo, hi] = span.get(id) ?? [p.c, p.c]
      span.set(id, [Math.min(lo, p.c), Math.max(hi, p.c)])
    }
  }

  for (const p of all) {
    if (p.cell.kind === 'lifeline') {
      const s = span.get(p.cell.owners[0]!)
      if (!s || p.c < s[0] || p.c > s[1]) {
        return fail('lifeline-unbound')
      }
    }
  }

  return null
}

// A node's label reads as the node only inside its own pill: each text or cont cell a node draws as owners[0] lies in
// the box of the cap, fill and frame cells it draws so. Moved off it, the pill is left empty and the label floats
// beside a line it does not end. A node that draws no such cell (a gitGraph commit's labels are its row's) has no pill
// to leave; a keyed node (C), whose pill shows its key and whose text is its legend row's, is bound by keys instead. A
// node is an edge's end, or any owner that draws a fill cell, as a pill no edge reaches and a sequence note do.
export function inPills(d: Drawing, all: readonly Spot[]): Fail | null {
  const nodes = new Set([
    ...d.expect.edges.flatMap((e) => [e.from, e.to]),
    ...all.flatMap((p) => (p.cell.kind === 'fill' ? [p.cell.owners[0]!] : [])),
  ])
  const box = new Map<string, [number, number, number, number]>()
  for (const p of all) {
    if ((p.cell.kind === 'cap' || p.cell.kind === 'fill' || p.cell.kind === 'frame') && nodes.has(p.cell.owners[0]!)) {
      const id = p.cell.owners[0]!
      const b = box.get(id) ?? [p.r, p.r, p.c, p.c]
      box.set(id, [Math.min(b[0], p.r), Math.max(b[1], p.r), Math.min(b[2], p.c), Math.max(b[3], p.c)])
    }
  }

  for (const p of all) {
    if (p.cell.kind === 'key') {
      box.delete(p.cell.owners[0]!)
    }
  }

  for (const p of all) {
    if (p.cell.kind === 'text' || p.cell.kind === 'cont') {
      const b = box.get(p.cell.owners[0]!)
      if (b && (p.r < b[0] || p.r > b[1] || p.c < b[2] || p.c > b[3])) {
        return fail('label-unbound')
      }
    }
  }

  return null
}
