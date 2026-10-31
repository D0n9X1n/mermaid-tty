// What a drawing must show, and the validator: the fail-closed gate between a layout and the screen. Any failure makes
// the hook show the fence's source instead of the drawing. The checks live in validate-cells, validate-lines,
// validate-frames and validate-charts; validate runs them in order and returns the first failure.
import type { Drawing } from './canvas.ts'
import type { Fail } from './fail.ts'
import { fail } from './fail.ts'
import { emphasis, labels, spots } from './validate-cells.ts'
import {
  bars,
  glyphs,
  inPills,
  keys,
  lifelines,
  memberPlaces,
  members,
  notes,
  order,
  places,
  rowLabels,
} from './validate-charts.ts'
import { crossFrames, endLabels, frames, inFrames } from './validate-frames.ts'
import { crossings, dangling, edgeLabels, edges, lineGlyphs, merges, rows, strays } from './validate-lines.ts'

export type Expect = {
  // every label instance, keyed by owner id; C: at, its first cell
  labels: readonly { owner: string; text: string; at?: { r: number; c: number } }[]
  edges: readonly {
    id: string
    from: string
    to: string
    ends: readonly End[] // drawn edges; ~~~ is not listed
    // C: each end label, owner `${id}:tail` or `${id}:head` by its true end
    endLabels?: readonly { node: string; owner: string }[]
    style?: 'solid' | 'thick' | 'dotted'
  }[] // the source's line style, which every line cell of it draws
  hidden?: readonly string[] // invisible edges (~~~), drawn nowhere
  edgeLabels: readonly { owner: string; edge: string }[]
  frames: readonly string[] // each frame's owner id: a cluster, a sequence frame or box
  // C: each bar; lanes: its width across the axis, default 1; at: its base cell
  bars?: readonly { owner: string; eighths: number; axis: 'h' | 'v'; lanes?: number; at?: { r: number; c: number } }[]
  // C: each drawn member row or column; place: its first cell, from its pill's top-left
  members?: readonly { id: string; parent: string; place?: { r: number; c: number } }[]
  // C: each keyed item, its key, class and own cell
  keys?: readonly { key: string; item: string; cls: string; at?: { r: number; c: number } }[]
  keyable?: readonly { item: string; cls: string }[] // C: each item a class may key
  order?: readonly { ids: readonly string[]; column: boolean }[] // C: owners drawn in this row order
  // C: marks drawn as exactly this glyph; at: drawn exactly there
  glyphs?: readonly { owner: string; ch: string; at?: { r: number; c: number } }[]
  rows?: readonly { mark: string; owners: readonly string[] }[] // C: each mark, in row order, and its labels
}

// A drawn end mark of an edge: its glyph, and the node it attaches to. A self-loop's ends both name its one node.
export type End = { node: string; glyph: string }

// The first broken invariant of d: emphasis, labels, edges, dangling lines, stray parts of an edge, crossings, line
// glyphs, merged lines, conflicts, row widths, edge labels, frames, edges kept inside their frames, edges crossing
// frames only as their ends need, then end labels, bars, member rows and their places, keys, order, glyphs, titles and
// labels in place, row labels, side notes, lifelines and node labels in their pills. null if none.
export function validate(d: Drawing): Fail | null {
  const all = spots(d)
  return (
    emphasis(all) ??
    labels(d) ??
    edges(d, all) ??
    dangling(d, all) ??
    strays(d, all) ??
    crossings(d, all) ??
    lineGlyphs(d, all) ??
    merges(d, all) ??
    (d.conflicts.length > 0 ? fail('overwrite') : null) ??
    rows(d) ??
    edgeLabels(d, all) ??
    frames(d, all) ??
    inFrames(d, all) ??
    crossFrames(d, all) ??
    endLabels(d, all) ??
    bars(d, all) ??
    members(d) ??
    memberPlaces(d, all) ??
    keys(d, all) ??
    order(d, all) ??
    glyphs(d, all) ??
    places(d, all) ??
    rowLabels(d, all) ??
    notes(all) ??
    lifelines(all) ??
    inPills(d, all)
  )
}
