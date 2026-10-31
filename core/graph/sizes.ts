// Box sizes: a node is its widest piece, a pad cell each side and its caps wide; an edge label its widest piece and a
// pad cell each side. Each takes one row per piece, its lines wrapped at wrapAt, or as they are when wrapAt is null; a
// member row built fixed, or a row of columns, is one piece and never wraps.
import { CAPS } from '../caps.ts'
import { fail } from '../fail.ts'
import type { Fail } from '../fail.ts'
import { labelLines, wrap } from '../text.ts'
import { width } from '../width.ts'
import type { GNode, NodeRow } from './model.ts'

export type Size = { rows: number; cols: number }

// lines' pieces, the widest plus extra wide, or word-too-wide when a word is wider than wrapAt. A line given as a
// number is
// one piece that wide.
function size(lines: readonly (string | number)[], wrapAt: number | null, extra: number): Size | Fail {
  const widths: number[] = []
  for (const line of lines) {
    if (typeof line === 'number') {
      widths.push(line)
      continue
    }

    const ps = wrapAt === null ? [line] : wrap(line, wrapAt)?.map((p) => p.text)
    if (!ps) {
      return fail('word-too-wide')
    }

    widths.push(...ps.map(width))
  }

  return { rows: widths.length, cols: Math.max(0, ...widths) + extra }
}

// A row of columns is its indent, then each column's width, a gap cell apart; a fixed row is its indent, then its text.
// null for a row that wraps.
function fixedWidth(r: NodeRow): number | null {
  if (r.cols) {
    return (r.indent ?? 0) + r.cols.reduce((s, c) => s + c.width, 0) + r.cols.length - 1
  }

  return r.fixed ? (r.indent ?? 0) + width(r.text) : null
}

// A mark is one glyph cell, whatever its rows. A bar is span cells across the flow: a row of them, or a column when the
// ranks go across, so layered's cross extent is always span. A bar with no span is one cell.
export function nodeSize(n: GNode, wrapAt: number | null, across = false): Size | Fail {
  if (n.mark === 'bar') {
    return across ? { rows: n.span ?? 1, cols: 1 } : { rows: 1, cols: n.span ?? 1 }
  }

  if (n.mark) {
    return { rows: 1, cols: 1 }
  }

  return size(
    n.rows.map((r) => fixedWidth(r) ?? r.text),
    wrapAt,
    2 + width(CAPS[n.shape][0]) + width(CAPS[n.shape][1]),
  )
}

// An edge label's lines break at <br/> as a node's rows do.
export const labelSize = (label: string, wrapAt: number | null): Size | Fail => size(labelLines(label), wrapAt, 2)
