// core/graph/draw.ts — a placed, routed graph drawn onto the canvas (plan A §6): node rows, frames, routes, labels.
import { CAPS } from '../caps.ts'
import { createCanvas } from '../canvas.ts'
import type { Canvas, Drawing } from '../canvas.ts'
import { labelLines, wrap } from '../text.ts'
import type { Piece } from '../text.ts'
import type { Role } from '../themes.ts'
import type { Expect } from '../validate.ts'
import { width } from '../width.ts'
import type { Box, Placed } from './layered.ts'
import type { Route } from './route.ts'

// One row of a box: capL, a pad, the piece centred, a pad, capR. Caps and fill are owned by owner, the text by owners.
function row(cv: Canvas, b: Box, r: number, caps: readonly [string, string], piece: Piece, role: Role, textRole: Role,
  owner: string, owners: readonly string[]): void {
  const [l, rt] = caps, inner = b.cols - width(l) - width(rt), w = width(piece.text), left = (inner - w) >> 1
  cv.cap(r, b.col, l, role, owner)
  cv.fill(r, b.col + width(l), left, role, owner)
  cv.text(r, b.col + width(l) + left, piece.text, textRole, owners, piece.join)
  cv.fill(r, b.col + width(l) + left + w, inner - left - w, role, owner)
  cv.cap(r, b.col + b.cols - width(rt), rt, role, owner)
}

// A route's line weight: thick draws heavy, dotted ┄/┆ with light bends, and solid light (the canvas merges mixed arms).
const WEIGHT = { solid: 'light', thick: 'heavy', dotted: 'dotted' } as const

// A box's lines, each wrapped at the box's content width: the layout sized the box to its widest piece wrapped at wrapAt,
// and greedy wrapping at that piece's width gives the same pieces. Line k > 0's first piece joins with '\n'.
type Line = { text: string; role: Role; owners: readonly string[] }
function lines(cv: Canvas, b: Box, caps: readonly [string, string], role: Role, owner: string, rows: readonly Line[], textOnly = false): void {
  const max = b.cols - width(caps[0]) - width(caps[1]) - 2
  let r = b.row
  for (const [k, line] of rows.entries()) {
    const pieces: Piece[] = wrap(line.text, max) ?? [{ text: line.text, join: '' }]
    for (const [i, piece] of pieces.entries()) {
      const joined = i === 0 && k > 0 ? { ...piece, join: '\n' } : piece
      if (textOnly) {
        cv.text(r++, b.col + ((b.cols - width(piece.text)) >> 1), piece.text, line.role, line.owners, joined.join)
      } else row(cv, b, r++, caps, joined, role, line.role, owner, line.owners)
    }
  }
}

export function drawGraph(p: Placed, routes: readonly Route[], columns: number): Drawing {
  // Two edges merge their line cells when they share an endpoint, whatever their styles; other owners share nothing.
  const ends = new Map(p.graph.edges.map(e => [e.id, [e.from, e.to]] as const))
  const shares = (a: string, b: string) => ends.get(a)?.some(x => ends.get(b)?.includes(x) ?? false) ?? false
  // A title takes row 0, so the graph is drawn a row down, on a grid at least as wide as the title.
  const title = p.graph.title, y = title === null ? 0 : 1
  const at = (b: Box | undefined): Box | undefined => b && { ...b, row: b.row + y }
  const cv = createCanvas(p.rows + y, Math.max(p.cols, width(title ?? '')), columns, shares)
  const labels: Expect['labels'][number][] = [], edges: Expect['edges'][number][] = []
  const edgeLabels: Expect['edgeLabels'][number][] = []
  if (title !== null) {
    cv.text(0, 0, title, 'title', 'title')
    labels.push({ owner: 'title', text: title })
  }
  // Each cluster's frame, its title on the top border, owned by the cluster; a line crossing a border keeps its glyph.
  for (const c of p.graph.clusters) {
    const f = at(p.frames.get(c.id))
    if (f) cv.frame(f.row, f.col, f.row + f.rows - 1, f.col + f.cols - 1, 'frame', c.id, c.title ?? undefined)
    if (c.title !== null) labels.push({ owner: c.id, text: c.title })
  }
  // A row's text is owned by [row id ?? node id, node id], deduplicated; each owner's rows, joined by '\n', are one label.
  for (const n of p.graph.nodes) {
    const b = at(p.boxes.get(n.id))
    const rows = n.rows.map(x => ({ text: x.text, role: x.role, owners: [...new Set([x.id ?? n.id, n.id])] }))
    if (b) lines(cv, b, CAPS[n.shape], n.role, n.id, rows)
    for (const owner of new Set(rows.map(x => x.owners[0]!))) {
      labels.push({ owner, text: rows.filter(x => x.owners[0] === owner).map(x => x.text).join('\n') })
    }
  }
  for (const route of routes) {
    for (const c of route.cells) cv.line(c.r + y, c.c, c.dirs, WEIGHT[route.style], 'edge', route.edge)
    for (const end of route.ends) cv.arrow(end.r + y, end.c, end.ch, route.edge)
  }
  for (const e of p.graph.edges.filter(x => x.style !== 'invisible')) {
    // The layout marks a back edge it drew reversed, so its ends swap back. Its heads are its route's end glyphs.
    const route = routes.find(x => x.edge === e.id)
    edges.push({ id: e.id, from: e.reversed ? e.to : e.from, to: e.reversed ? e.from : e.to, heads: route?.ends.map(x => x.ch) ?? [] })
    if (e.label === null) continue
    const owner = `${e.id}:label`, b = at(p.boxes.get(owner)), text = labelLines(e.label)
    labels.push({ owner, text: text.join('\n') })
    edgeLabels.push({ owner, edge: e.id })
    if (b) lines(cv, b, ['', ''], 'label', owner, text.map(t => ({ text: t, role: 'label' as const, owners: [owner, e.id] })), true)
  }
  return cv.toDrawing({ labels, edges, edgeLabels })
}
