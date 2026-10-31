// core/graph/compact.ts — a graph drawing without its slack (Q2a): each run of rows that only carry │, and of columns that
// only carry ─, shortened. In a valid drawing, such a row's neighbours above and below are cells that point at each other
// across it, or empty, so dropping it only shortens straight lines and frame sides: what the drawing connects, owns and
// labels is unchanged.
import type { Cell, Drawing } from '../canvas.ts'
import { validate } from '../validate.ts'

// Whether x is empty, or a line or frame cell running straight along dirs (5 │, 10 ─), for every edge in it. A cont cell
// never is, so a wide character keeps both its cells.
const straight = (x: Cell | null, dirs: number): boolean =>
  x === null ||
  ((x.kind === 'line' || x.kind === 'frame') && x.dirs === dirs && (x.segs ?? []).every((s) => s.dirs === dirs))

// The indices to keep: every false one, and the first n of each maximal run of true ones.
function keep(pass: readonly boolean[], n: number): number[] {
  const out: number[] = []
  let run = 0
  pass.forEach((p, i) => {
    run = p ? run + 1 : 0
    if (run <= n) {
      out.push(i)
    }
  })
  return out
}

// d with each run of pass-through rows cut to its first row, and each run of pass-through columns to its first two, so an
// LR edge still reads ──►; the empty columns at the left edge go entirely. The row kept sits right under the row above the
// run, so a head below a box keeps a │ between them. expect holds no coordinates, so it and conflicts carry over.
export function compact(d: Drawing): Drawing {
  const rows = keep(
    d.cells.map((row) => row.every((x) => straight(x, 5))),
    1,
  ).map((r) => d.cells[r]!)
  const width = rows[0]?.length ?? 0
  const column = (c: number) => rows.map((row) => row[c] ?? null)
  let lead = 0
  while (lead < width && column(lead).every((x) => x === null)) {
    lead++
  }
  const cols = keep(
    Array.from({ length: width - lead }, (_, i) => column(lead + i).every((x) => straight(x, 10))),
    2,
  )
  return { ...d, cells: rows.map((row) => cols.map((i) => row[lead + i] ?? null)) }
}

// d compacted if it validates apart from width, which is what compaction changes; else d as it is. On a broken drawing,
// compaction may drop the very cell that shows the break, a gap in a ─ run or in a frame side, so a broken drawing stays
// as drawn and is still rejected. Width is exempt so that a drawing too wide only uncompacted still fits; the caller
// validates the result at its budget, the gate against compaction breaking a valid drawing.
export function compactIfValid(d: Drawing): Drawing {
  return validate({ ...d, columns: Infinity }) === null ? compact(d) : d
}
