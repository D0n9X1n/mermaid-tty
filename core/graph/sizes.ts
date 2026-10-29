// Box sizes (plan A §7): a node is its widest piece, a pad cell each side and its caps wide; an edge label its widest piece and
// a pad cell each side. Each takes one row per piece, its lines wrapped at wrapAt, or as they are when wrapAt is null.
import { CAPS } from '../caps.ts'
import { fail } from '../fail.ts'
import type { Fail } from '../fail.ts'
import { labelLines, wrap } from '../text.ts'
import { width } from '../width.ts'
import type { GNode } from './model.ts'

export type Size = { rows: number; cols: number }

// lines' pieces, the widest plus extra wide, or word-too-wide when a word is wider than wrapAt.
function size(lines: readonly string[], wrapAt: number | null, extra: number): Size | Fail {
  const pieces: string[] = []
  for (const line of lines) {
    const ps = wrapAt === null ? [line] : wrap(line, wrapAt)?.map(p => p.text)
    if (!ps) return fail('word-too-wide')
    pieces.push(...ps)
  }
  return { rows: pieces.length, cols: Math.max(0, ...pieces.map(width)) + extra }
}

export const nodeSize = (n: GNode, wrapAt: number | null): Size | Fail =>
  size(n.rows.map(r => r.text), wrapAt, 2 + width(CAPS[n.shape][0]) + width(CAPS[n.shape][1]))

// An edge label's lines break at <br/> as a node's rows do.
export const labelSize = (label: string, wrapAt: number | null): Size | Fail => size(labelLines(label), wrapAt, 2)
