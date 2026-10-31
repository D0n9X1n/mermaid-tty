// A diagram's title, centered over the drawing as Mermaid centers it. Layouts draw the title at its row's left edge;
// centerTitle moves each title row right, so it sits in the middle of the rest of the drawing. The validator checks the
// result on its own, the same way: each title row's first cell at half the gap between its text and the drawing.
import type { Cell, Drawing } from './canvas.ts'

// The cells of the drawing's title: its text and the cont cells of its wide characters, drawn in the title role. A
// node, subgraph or edge whose id is 'title' draws in its own role, so it is never taken for the title.
const isTitle = (x: Cell | null): boolean => x !== null && x.role === 'title' && x.owners[0] === 'title'

// The rows the title draws on: each row with a title text cell. Empty if the drawing has no title.
export function titleRows(cells: readonly (readonly (Cell | null)[])[]): number[] {
  return cells.flatMap((row, r) => (row.some((x) => x?.kind === 'text' && isTitle(x)) ? [r] : []))
}

// The width the title centers over: the widest row of the rest of the drawing, its trailing empty cells dropped.
export function bodyWidth(cells: readonly (readonly (Cell | null)[])[], rows: readonly number[]): number {
  const widths = cells.filter((_, r) => !rows.includes(r)).map((row) => row.findLastIndex((x) => x !== null) + 1)
  return Math.max(0, ...widths)
}

// Where a title row of shown cells starts: half the room the drawing leaves beside it, rounded down; 0 when the title
// is as wide as the drawing or wider.
export const titleColumn = (body: number, shown: number): number => Math.max(0, Math.floor((body - shown) / 2))

// d with each title row moved right to its centered column, and the title's stated place in expect moved with it. A row
// the title shares with any other cell is left as it is, so nothing else moves; d itself if nothing moves.
export function centerTitle(d: Drawing): Drawing {
  const rows = titleRows(d.cells)
  if (rows.length === 0) {
    return d
  }

  const body = bodyWidth(d.cells, rows)
  const shifts = new Map<number, number>()
  for (const r of rows) {
    const row = d.cells[r]!
    const first = row.findIndex((x) => x !== null)
    const last = row.findLastIndex((x) => x !== null)
    const onlyTitle = row.every((x) => x === null || isTitle(x))
    const by = titleColumn(body, last + 1 - first) - first
    if (onlyTitle && by > 0) {
      shifts.set(r, by)
    }
  }

  if (shifts.size === 0) {
    return d
  }

  const cells = d.cells.map((row, r) => {
    const by = shifts.get(r)
    return by === undefined ? row : [...Array<Cell | null>(by).fill(null), ...row].slice(0, Math.max(row.length, body))
  })
  const labels = d.expect.labels.map((label) => {
    const by = label.owner === 'title' && label.at ? shifts.get(label.at.r) : undefined
    return by === undefined ? label : { ...label, at: { r: label.at!.r, c: label.at!.c + by } }
  })
  return { ...d, cells, expect: { ...d.expect, labels } }
}
