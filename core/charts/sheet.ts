// Chart sheets: a heading's wrapped rows, and parts stacked top to bottom into one drawing.
import { createCanvas, type Cell, type Conflict, type Drawing } from '../canvas.ts'
import type { Fail } from '../fail.ts'
import { fail } from '../fail.ts'
import { labelLines, wrap, type Piece } from '../text.ts'
import { centerTitle } from '../title.ts'
import type { Ink } from '../themes.ts'
import type { Expect } from '../validate.ts'
import { width } from '../width.ts'

// A label as a chart lists it: its owner and text, and at, its first drawn cell, when pieces ps are drawn one a row
// down from row r at column c, a later piece at c + indent: the first piece with text. No at if none has text, as none
// draws.
export function placed(
  owner: string,
  text: string,
  ps: readonly { text: string }[],
  r: number,
  c: number,
  indent = 0,
): Expect['labels'][number] {
  const j = ps.findIndex((p) => p.text !== '')
  return j < 0 ? { owner, text } : { owner, text, at: { r: r + j, c: c + (j > 0 ? indent : 0) } }
}

// text's <br> lines, each wrapped at columns, drawn one row per piece in ink and owned by owner (matrix common rules 3
// and 6). The first piece has no join, a later piece its wrap join, and the first piece of each later line '\n', so
// validate reads the rows back as one label. Its expect is the text as drawn, each <br> a '\n', as draw lists a <br>
// label. 'word-too-wide' if a word is wider than columns.
export function heading(text: string, ink: Ink, owner: string, columns: number): Drawing | Fail {
  const lines = labelLines(text)
  const pieces: { text: string; join?: Piece['join'] }[] = []
  for (const [i, line] of lines.entries()) {
    const ps = wrap(line, columns)
    if (!ps) {
      return fail('word-too-wide')
    }

    ps.forEach((p, j) => pieces.push(j > 0 ? p : i > 0 ? { ...p, join: '\n' } : { text: p.text }))
  }

  const c = createCanvas(pieces.length, Math.max(0, ...pieces.map((p) => width(p.text))), columns)
  pieces.forEach((p, r) => c.text(r, 0, p.text, ink, owner, p.join))
  return c.toDrawing({ labels: [placed(owner, lines.join('\n'), pieces, 0, 0)], edges: [], edgeLabels: [], frames: [] })
}

// parts top to bottom in one drawing, columns wide so that validate measures every row against the budget. Each row is
// padded with null to the widest part, each part's conflicts move down by its row offset, and its expect merges by
// name.
export function stack(parts: readonly Drawing[], columns: number): Drawing {
  const wide = parts.reduce((w, p) => p.cells.reduce((v, r) => Math.max(v, r.length), w), 0)
  const cells: (Cell | null)[][] = []
  const conflicts: Conflict[] = []
  const expects: Expect[] = []
  for (const p of parts) {
    expects.push(shift(p.expect, cells.length))
    for (const x of p.conflicts) {
      conflicts.push({ ...x, row: x.row + cells.length })
    }

    for (const r of p.cells) {
      cells.push([...r, ...Array<Cell | null>(wide - r.length).fill(null)])
    }
  }

  return centerTitle({ columns, cells, conflicts, expect: merge(expects) })
}

// A part's expect as it sits dr rows down: an entry's at, in any field (a key's, a label's, a bar's, a glyph's), names
// a cell, so it moves with the part's cells.
type At = { at?: { r: number; c: number } }
const shift = (e: Expect, dr: number): Expect =>
  dr === 0
    ? e
    : (Object.fromEntries(
        Object.entries(e).map(([k, v]) => [
          k,
          Array.isArray(v)
            ? v.map((x: At) => (x && typeof x === 'object' && x.at ? { ...x, at: { r: x.at.r + dr, c: x.at.c } } : x))
            : v,
        ]),
      ) as Expect)

// Every array field of the expects, each concatenated in their order by name: A's labels, edges (with their ends and
// endLabels), edgeLabels and frames, C's bars, members, keys and keyable, and any field a later task adds. A's four
// start empty, since every Expect lists them; any other field no expect has stays absent, so nothing is invented or
// dropped.
function merge(expects: readonly Expect[]): Expect {
  const out: Record<string, unknown[]> = { labels: [], edges: [], edgeLabels: [], frames: [] }
  for (const e of expects) {
    for (const [k, v] of Object.entries(e)) {
      if (Array.isArray(v)) {
        out[k] = (out[k] ?? []).concat(v)
      }
    }
  }

  return out as unknown as Expect
}
