// core/graph/draw.ts — a placed, routed graph drawn onto the canvas (plan A §6): node rows, frames, routes, labels.
import { CAPS } from '../caps.ts'
import { createCanvas } from '../canvas.ts'
import type { Canvas, Drawing } from '../canvas.ts'
import { labelLines, wrap } from '../text.ts'
import type { Piece } from '../text.ts'
import type { Role } from '../themes.ts'
import { validate } from '../validate.ts'
import type { Expect } from '../validate.ts'
import { width } from '../width.ts'
import { compactIfValid } from './compact.ts'
import type { Box, Placed } from './layered.ts'
import type { GCluster, GEdge, GNode, NodeRow, Note } from './model.ts'
import type { Route } from './route.ts'

// One row of a box: capL, a pad, the piece centred (or after one pad cell when flush, a left-aligned row), a pad, capR.
// Caps and fill are owned by owner, the text by owners; a keyed row's piece is its key, drawn in place.
function row(
  cv: Canvas,
  b: Box,
  r: number,
  caps: readonly [string, string],
  piece: Piece,
  role: Role,
  textRole: Role,
  owner: string,
  owners: readonly string[],
  keyed = false,
  flush = false,
): void {
  const [l, rt] = caps
  const inner = b.cols - width(l) - width(rt)
  const w = width(piece.text)
  const left = flush ? Math.min(1, Math.max(0, inner - w)) : (inner - w) >> 1
  cv.cap(r, b.col, l, role, owner)
  cv.fill(r, b.col + width(l), left, role, owner)
  if (keyed) {
    cv.key(r, b.col + width(l) + left, piece.text, textRole, owners, false)
  } else {
    cv.text(r, b.col + width(l) + left, piece.text, textRole, owners, piece.join)
  }
  cv.fill(r, b.col + width(l) + left + w, inner - left - w, role, owner)
  cv.cap(r, b.col + b.cols - width(rt), rt, role, owner)
}

// A mark node draws its glyph alone, as a cap its node owns: start ●, end ◉, choice ◇ in the decision role, and a bar a run of
// ━ across a 1-row box or ┃ down a 1-column box; a 1×1 bar runs across the flow, ━ when the ranks go down.
const MARK = { start: '●', end: '◉', choice: '◇' } as const
function mark(cv: Canvas, b: Box, n: GNode, across: boolean): void {
  if (n.mark !== 'bar') {
    cv.cap(b.row, b.col, MARK[n.mark!], n.mark === 'choice' ? 'decision' : 'node', n.id)
    return
  }
  const down = b.rows > 1 || (b.cols === 1 && across)
  for (let i = 0; i < (down ? b.rows : b.cols); i++) {
    cv.cap(b.row + (down ? i : 0), b.col + (down ? 0 : i), down ? '┃' : '━', 'node', n.id)
  }
}

// A route's line weight: thick draws heavy, dotted ┄/┆ with light bends, and solid light (the canvas merges mixed arms).
const WEIGHT = { solid: 'light', thick: 'heavy', dotted: 'dotted' } as const

// A fixed row, never re-wrapped (members.ts): capL, a pad cell and its indent, then its text left-aligned, or each of its
// cols at its offset, the widths before it plus a gap cell each, owned by [col.id, node], a keyed col its key in its place;
// then fill to capR. Its fill takes
// the row's role, its caps the node's; a blank part draws no cell. A part joins as given, else below the first row with '\n'.
// Each member part's first drawn cell, from b's top-left, goes in places, so the validator binds it there.
function fixedRow(
  cv: Canvas,
  b: Box,
  r: number,
  caps: readonly [string, string],
  role: Role,
  node: string,
  x: NodeRow,
  owners: readonly string[],
  below: boolean,
  places: Map<string, { r: number; c: number }>,
): void {
  const [l, rt] = caps
  const start = b.col + width(l) + 1 + (x.indent ?? 0)
  const end = b.col + b.cols - width(rt)
  const parts = x.cols
    ? x.cols.map((c, j) => ({
        ...c,
        owners: [c.id, node],
        at: x.cols!.slice(0, j).reduce((s, p) => s + p.width + 1, 0),
      }))
    : [{ text: x.text, role: x.role, owners, join: x.join, at: 0, key: undefined }]
  cv.cap(r, b.col, l, role, node)
  let c = b.col + width(l)
  for (const part of parts.filter((p) => p.text.trim() !== '')) {
    cv.fill(r, c, start + part.at - c, x.role, node)
    if (part.owners.length > 1 && !places.has(part.owners[0]!)) {
      places.set(part.owners[0]!, { r: r - b.row, c: start + part.at - b.col })
    }
    c =
      start +
      part.at +
      (part.key !== undefined
        ? cv.key(r, start + part.at, part.key, part.role, part.owners, false)
        : cv.text(r, start + part.at, part.text, part.role, part.owners, part.join ?? (below ? '\n' : undefined)))
  }
  cv.fill(r, c, end - c, x.role, node)
  cv.cap(r, end, rt, role, node)
}

// A box's lines, each wrapped at the box's content width: the layout sized the box to its widest piece wrapped at wrapAt,
// and greedy wrapping at that piece's width gives the same pieces. Line k > 0's first piece joins with '\n'. A fixed row,
// or a row of columns, draws as fixedRow; a key row is its key, unwrapped, drawn as a key.
type Line = { text: string; role: Role; owners: readonly string[]; row?: NodeRow }
function lines(
  cv: Canvas,
  b: Box,
  caps: readonly [string, string],
  role: Role,
  owner: string,
  rows: readonly Line[],
  textOnly = false,
  places = new Map<string, { r: number; c: number }>(),
): void {
  const max = b.cols - width(caps[0]) - width(caps[1]) - 2
  let r = b.row
  for (const [k, line] of rows.entries()) {
    if (line.row?.fixed || line.row?.cols) {
      fixedRow(cv, b, r++, caps, role, owner, line.row, line.owners, k > 0, places)
      continue
    }
    const flush = line.row?.align === 'left'
    if (line.row?.key) {
      row(cv, b, r++, caps, { text: line.text, join: '' }, role, line.role, owner, line.owners, true, flush)
      continue
    }
    const pieces: Piece[] = wrap(line.text, max) ?? [{ text: line.text, join: '' }]
    for (const [i, piece] of pieces.entries()) {
      const joined: Piece = i === 0 && k > 0 ? { ...piece, join: '\n' } : piece
      if (textOnly) {
        cv.text(r++, b.col + ((b.cols - width(piece.text)) >> 1), piece.text, line.role, line.owners, joined.join)
      } else {
        row(cv, b, r++, caps, joined, role, line.role, owner, line.owners, false, flush)
      }
    }
  }
}

// An end label (a cardinality) of true end t, owned by `${edge}:${t}`, at node, its true end's node: on a reversed edge the
// drawn tail is the true head. It sits beside its end's second cell out from its node, the cell past its mark or past the
// line cell that touches its node: right of that cell when its node is above or below it, else above it, running away from
// its node. So it clears its node's own rows and columns, and a neighbouring port there. at, its first cell at layout
// coordinates, is null with no route; a blank label is none.
type EndLabel = { owner: string; node: string; text: string; at: { r: number; c: number } | null }
function endLabel(p: Placed, e: GEdge, route: Route | undefined, t: 'tail' | 'head'): EndLabel | null {
  const drawn = e.reversed ? (t === 'tail' ? 'head' : 'tail') : t
  const text = drawn === 'tail' ? e.tailLabel : e.headLabel
  const node = drawn === 'tail' ? e.from : e.to
  const owner = `${e.id}:${t}`
  if (text === undefined || text.trim() === '') {
    return null
  }
  const marks = route?.ends ?? []
  const tail = e.tail === 'none' ? [] : marks.slice(0, 1)
  const head = e.head === 'none' ? [] : marks.slice(-1)
  const path = drawn === 'tail' ? [...tail, ...(route?.cells ?? [])] : [...head, ...(route?.cells ?? []).toReversed()]
  const a = path[1]
  const b = p.boxes.get(node) ?? p.frames.get(node)
  if (!a || !b) {
    return { owner, node, text, at: null }
  }
  if (a.c >= b.col && a.c < b.col + b.cols) {
    return { owner, node, text, at: { r: a.r, c: a.c + 1 } }
  }
  return { owner, node, text, at: { r: a.r - 1, c: b.col < a.c ? a.c : a.c - width(text) + 1 } }
}

// Between two consecutive frameless children of c, a divider of frame-role caps owned by `${c.id}:div<k>`: ┄ across c's
// inner width on the middle row of the gap between them, or ┆ down its inner height on the gap's middle column, when they
// sit side by side. Inside c's border; a frameless c has none, so its whole box.
function divide(cv: Canvas, c: GCluster, frame: (id: string) => Box | undefined, all: readonly GCluster[]): void {
  const f = frame(c.id)
  const inset = c.frameless ? 0 : 1
  const bare = (id: string) => all.find((x) => x.id === id)?.frameless === true
  if (!f) {
    return
  }
  let k = 0
  for (const [i, id] of c.clusters.entries()) {
    const a = frame(id)
    const b = frame(c.clusters[i + 1] ?? '')
    if (!a || !b || !bare(id) || !bare(c.clusters[i + 1]!)) {
      continue
    }
    const owner = `${c.id}:div${k++}`
    const stacked = a.row + a.rows <= b.row || b.row + b.rows <= a.row
    const [lo, hi] = stacked ? (a.row < b.row ? [a, b] : [b, a]) : a.col < b.col ? [a, b] : [b, a]
    const mid = stacked ? (lo.row + lo.rows + hi.row - 1) >> 1 : (lo.col + lo.cols + hi.col - 1) >> 1
    const n = (stacked ? f.cols : f.rows) - 2 * inset
    for (let j = 0; j < n; j++) {
      if (stacked) {
        cv.cap(mid, f.col + inset + j, '┄', 'frame', owner)
      } else {
        cv.cap(f.row + inset + j, mid, '┆', 'frame', owner)
      }
    }
  }
}

// A side note beside its pill b: each line, wrapped at its box's width, as note-role text owned by the note, its first
// line joined to the pill by ' ┄┄' caps (┄┄ ' ' on the right) owned by `${id}:link`. A keyed note draws its key in its
// text's place, and lists no label. Its text is listed even when its pill or box is missing, so a note not drawn fails closed.
function note(cv: Canvas, b: Box | undefined, at: Box | undefined, n: Note, labels: Expect['labels'][number][]): void {
  const text = labelLines(n.text)
  if (n.key === undefined) {
    labels.push({ owner: n.id, text: text.join('\n') })
  }
  if (!at || !b) {
    return
  }
  const link = `${n.id}:link`
  if (n.side === 'left') {
    cv.cap(at.row, b.col - 3, ' ', 'note', link)
    cv.cap(at.row, b.col - 2, '┄┄', 'note', link)
  } else {
    cv.cap(at.row, b.col + b.cols, '┄┄', 'note', link)
    cv.cap(at.row, b.col + b.cols + 2, ' ', 'note', link)
  }
  if (n.key !== undefined) {
    cv.key(at.row, at.col, n.key, 'note', n.id, false)
    return
  }
  let r = at.row
  for (const [k, line] of text.entries()) {
    for (const [i, piece] of (wrap(line, at.cols) ?? [{ text: line, join: '' }]).entries()) {
      cv.text(r++, at.col, piece.text, 'note', n.id, i === 0 && k > 0 ? '\n' : piece.join)
    }
  }
}

// The drawing, finished by compactIfValid unless finish says otherwise: a test that reads cells at layout coordinates
// passes d => d.
export function drawGraph(
  p: Placed,
  routes: readonly Route[],
  columns: number,
  finish: (d: Drawing) => Drawing = compactIfValid,
): Drawing {
  // Two edges merge their line cells when they share an endpoint, whatever their styles; other owners share nothing.
  const ends = new Map(p.graph.edges.map((e) => [e.id, [e.from, e.to]] as const))
  const shares = (a: string, b: string) => ends.get(a)?.some((x) => ends.get(b)?.includes(x) ?? false) ?? false
  // Each end label beside its terminal, from the routes. The grid grows on any side one overruns: a top or left overrun
  // shifts the whole graph down or right, as a title, which takes row 0, shifts it a row down; the grid is as wide as the title.
  const live = p.graph.edges.filter((e) => e.style !== 'invisible')
  const tags = new Map(
    live.map(
      (e) =>
        [
          e.id,
          (['tail', 'head'] as const).flatMap(
            (t) =>
              endLabel(
                p,
                e,
                routes.find((r) => r.edge === e.id),
                t,
              ) ?? [],
          ),
        ] as const,
    ),
  )
  const boxes = [...tags.values()].flat().flatMap((l) => (l.at ? [{ ...l.at, w: width(l.text) }] : []))
  const title = p.graph.title
  const dy = (title === null ? 0 : 1) + Math.max(0, ...boxes.map((l) => -l.r))
  const dx = Math.max(0, ...boxes.map((l) => -l.c))
  const at = (b: Box | undefined): Box | undefined => b && { ...b, row: b.row + dy, col: b.col + dx }
  const height = Math.max(p.rows, ...boxes.map((l) => l.r + 1)) + dy
  const wide = Math.max(p.cols, ...boxes.map((l) => l.c + l.w)) + dx
  const cv = createCanvas(height, Math.max(wide, width(title ?? '')), columns, shares)
  const labels: Expect['labels'][number][] = []
  const edges: Expect['edges'][number][] = []
  const edgeLabels: Expect['edgeLabels'][number][] = []
  const frames: string[] = []
  if (title !== null) {
    cv.text(0, 0, title, 'title', 'title')
    labels.push({ owner: 'title', text: title })
  }
  // Each cluster's frame, its title on the top border, owned by the cluster; a line crossing a border keeps its glyph.
  // Every framed cluster is listed, so one the layout did not place fails closed. A frameless one draws and lists none.
  for (const c of p.graph.clusters) {
    if (c.frameless) {
      continue
    }
    const f = at(p.frames.get(c.id))
    if (f) {
      cv.frame(f.row, f.col, f.row + f.rows - 1, f.col + f.cols - 1, 'frame', c.id, c.title ?? undefined)
    }
    frames.push(c.id)
    if (c.title !== null) {
      labels.push({ owner: c.id, text: c.title })
    }
  }
  for (const c of p.graph.clusters) {
    divide(cv, c, (id: string) => at(p.frames.get(id)), p.graph.clusters)
  }
  // A row's text is owned by [row id ?? node id, node id], deduplicated, and a column's by [col id, node id]. Each owner's
  // pieces, each joined by its join, else '\n', are one label. A blank column or fixed row draws no cell and is not listed.
  // Each column, and each row with its own id, that draws a cell is a member, in drawing order.
  const across = p.graph.dir === 'LR' || p.graph.dir === 'RL'
  const members = new Map<string, string>()
  const places = new Map<string, { r: number; c: number }>()
  const shown = (s: string) => s.trim() !== ''
  for (const n of p.graph.nodes) {
    const b = at(p.boxes.get(n.id))
    const side = () => {
      if (n.note) {
        note(cv, b, at(p.notes?.get(n.note.id)), n.note, labels)
      }
    } // a mark's note too
    if (n.mark) {
      if (b) {
        mark(cv, b, n, across)
      }
      side()
      continue
    }
    const rows = n.rows.map((x) => ({ text: x.text, role: x.role, owners: [...new Set([x.id ?? n.id, n.id])], row: x }))
    if (b) {
      lines(cv, b, CAPS[n.shape], n.role, n.id, rows, false, places)
    }
    const texts = new Map<string, string>()
    const add = (owner: string, text: string, join?: string) =>
      texts.set(owner, texts.has(owner) ? texts.get(owner)! + (join ?? '\n') + text : text)
    for (const { row: x, owners } of rows) {
      // A keyed row or column draws its key in its text's place: a member still, but its text is no label.
      if (x.cols) {
        for (const c of x.cols.filter((c) => shown(c.key ?? c.text))) {
          if (c.key === undefined) {
            add(c.id, c.text, c.join)
          }
          members.set(c.id, n.id)
        }
      } else if (x.key) {
        if (owners.length > 1) {
          members.set(owners[0]!, n.id)
        }
      } else if (!x.fixed || shown(x.text)) {
        add(owners[0]!, x.text, x.fixed ? x.join : undefined)
        if (owners.length > 1 && shown(x.text)) {
          members.set(owners[0]!, n.id)
        }
      }
    }
    for (const [owner, text] of texts) {
      labels.push({ owner, text })
    }
    side()
  }
  for (const route of routes) {
    for (const c of route.cells) {
      cv.line(c.r + dy, c.c + dx, c.dirs, WEIGHT[route.style], 'edge', route.edge)
    }
    for (const end of route.ends) {
      cv.arrow(end.r + dy, end.c + dx, end.ch, route.edge)
    }
  }
  for (const e of live) {
    // The layout marks a back edge it drew reversed, its from, to, tail and head swapped, so from and to swap back. Its
    // route's end marks are the drawn tail's, at the drawn from, then the drawn head's, at the drawn to: whichever way it was
    // drawn, each sits at the node named here.
    const route = routes.find((x) => x.edge === e.id)
    const nodes = [...(e.tail === 'none' ? [] : [e.from]), ...(e.head === 'none' ? [] : [e.to])]
    // Each end label is listed by its true end, in endLabels, labels and edgeLabels, and drawn in endRole ?? 'label', owned by
    // [its owner, the edge]; one that needs a drawn cell is a Conflict.
    const tagged = tags.get(e.id)!
    edges.push({
      id: e.id,
      from: e.reversed ? e.to : e.from,
      to: e.reversed ? e.from : e.to,
      style: e.style as 'solid' | 'thick' | 'dotted',
      ends: (route?.ends ?? []).map((m, i) => ({ node: nodes[i] ?? '', glyph: m.ch })),
      ...(tagged.length > 0 ? { endLabels: tagged.map((l) => ({ node: l.node, owner: l.owner })) } : {}),
    })
    for (const l of tagged) {
      labels.push({ owner: l.owner, text: l.text })
      edgeLabels.push({ owner: l.owner, edge: e.id })
      if (l.at) {
        cv.text(l.at.r + dy, l.at.c + dx, l.text, e.endRole ?? 'label', [l.owner, e.id])
      }
    }
    if (e.label === null) {
      continue
    }
    const owner = `${e.id}:label`
    const b = at(p.boxes.get(owner))
    const text = labelLines(e.label)
    edgeLabels.push({ owner, edge: e.id })
    // A keyed label draws its key where its text would go; its text is in no label.
    if (e.labelKey !== undefined) {
      if (b) {
        cv.key(b.row, b.col, e.labelKey, 'label', [owner, e.id], false)
      }
      continue
    }
    labels.push({ owner, text: text.join('\n') })
    if (b) {
      lines(
        cv,
        b,
        ['', ''],
        'label',
        owner,
        text.map((t) => ({ text: t, role: 'label' as const, owners: [owner, e.id] })),
        true,
      )
    }
  }
  // An invisible edge (~~~) is listed only as hidden: it draws nowhere.
  const hidden = p.graph.edges.filter((e) => e.style === 'invisible').map((e) => e.id)
  const made = cv.toDrawing({
    labels,
    edges,
    edgeLabels,
    frames,
    ...(hidden.length > 0 ? { hidden } : {}),
    ...(members.size > 0
      ? {
          members: [...members].map(([id, parent]) => ({
            id,
            parent,
            ...(places.has(id) ? { place: places.get(id)! } : {}),
          })),
        }
      : {}),
  })
  // An end label that meets other text on its row, end to end, would read as one with it: a Conflict, as an overlap is.
  const meets = [...tags.values()].flat().flatMap((l) =>
    l.at
      ? [-1, width(l.text)].flatMap((k) => {
          const r = l.at!.r + dy
          const c = l.at!.c + dx + k
          const had = made.cells[r]?.[c]
          return had && (had.kind === 'text' || had.kind === 'cont') && had.owners[0] !== l.owner
            ? [{ row: r, col: c, had: had.owners[0]!, by: l.owner }]
            : []
        })
      : [],
  )
  const drawn = meets.length > 0 ? { ...made, conflicts: [...made.conflicts, ...meets] } : made
  const out = finish(drawn)
  // Compaction keeps one row of a run of │ rows, so it can bring an end label's far terminal as near as its own: a drawing
  // with end labels that compacts to an invalid one keeps its drawn size.
  return out !== drawn && boxes.length > 0 && validate({ ...out, columns: Infinity }) !== null ? drawn : out
}
