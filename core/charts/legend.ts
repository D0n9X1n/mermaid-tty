// Keyed legends (plan C, T46). When an item's text does not fit in place, the item draws a short key there, and its
// legend
// row, below the chart, draws that key, one blank, then the item's own text. T87's keys rule checks both: each key once
// in
// place and once in its own row, bound to the text its item owns, and a class keyed all or none.
import { createCanvas, type Drawing } from '../canvas.ts'
import type { Fail } from '../fail.ts'
import { fail, isFail } from '../fail.ts'
import { wrap, type Piece } from '../text.ts'
import type { Ink } from '../themes.ts'
import type { Expect } from '../validate.ts'
import { width } from '../width.ts'
import { stack } from './sheet.ts'

const letter = (i: number): string => String.fromCharCode(97 + i)
// A field key: a…z, aa…zz, aaa…, bijective base 26, so 26 is aa and 702 aaa. One sequence per diagram, in source order.
export const fieldKey = (i: number): string => (i < 26 ? letter(i) : fieldKey(Math.floor(i / 26) - 1) + letter(i % 26))
// A point key: 1, 2, …
export const pointKey = (i: number): string => String(i + 1)

// A run of a legend row's text, drawn in ink. A part with an owner is text that owner's label lists; an owner-null part
// is
// a separator such as ' · ', drawn as caps.
export type LegendPart = { text: string; ink: Ink; owner: string | null }
// A keyed item's legend row: key in keyInk, then parts. item is the keyed thing's own id, such as a note, `r3:label` or
// `t2.t`, which owns the key; the first part, which the key binds to, must be owned by item too. cls is item's class.
// at:
// the cell its in-place key starts at, in the drawing withLegend is given, when the item has one place.
export type LegendRow = {
  key: string
  keyInk: Ink
  item: string
  cls: string
  parts: readonly LegendPart[]
  at?: { r: number; c: number }
}

// s packed greedily into a line of field cells whose first used cells are taken, one space after them, then into more
// lines: wrap packs a stand-in word used cells wide, then s, so s breaks exactly where wrap breaks a label. The first
// piece
// is what fits on the line, possibly '', and each later piece starts a line. null if a word is wider than field.
function fill(s: string, used: number, field: number): Piece[] | null {
  if (used === 0) {
    return wrap(s, field)
  }

  const ps = wrap('x'.repeat(used) + ' ' + s, field)
  return ps && [{ ...ps[0]!, text: ps[0]!.text.slice(used + 1) }, ...ps.slice(1)]
}

// A piece of a row's part, at line of the row and column col, drawn with join, if any.
type Run = { line: number; col: number; text: string; join?: Piece['join']; part: LegendPart }

// row's parts' words packed greedily after its key, from start = width(key) + 1 to columns: within a part as wrap packs
// them, and one blank cell between parts. A part's first piece goes where it fits, with no join, so it starts its own
// instance; each later piece starts the next line, indented to start, with its wrap join. null if a word is wider than
// columns − start.
function layout(row: LegendRow, columns: number): { runs: Run[]; lines: number } | null {
  const start = width(row.key) + 1
  const field = columns - start
  const runs: Run[] = []
  let line = 0
  let used = 0 // used: the cells this line's text takes from start
  for (const part of row.parts) {
    const ps = fill(part.text, used, field)
    if (!ps) {
      return null
    }

    let first = true
    for (const [i, p] of ps.entries()) {
      if (i > 0) {
        line++
        used = 0
      }

      if (!p.text) {
        continue
      }

      const col = start + (used === 0 ? 0 : used + 1)
      runs.push({ line, col, text: p.text, part, ...(first ? {} : { join: p.join }) })
      used = col - start + width(p.text)
      first = false
    }
  }

  return { runs, lines: line + 1 }
}

// rows top to bottom, each its key at column 0, legend: true and owned by its item, then its parts by layout: an owned
// part
// is text its owner owns, and an owner-null part caps its item owns. expect lists each owned part's text under its
// owner.
// 'word-too-wide' if a word is wider than a row's field.
export function legendRows(rows: readonly LegendRow[], columns: number): Drawing | Fail {
  const laid: { row: LegendRow; runs: Run[]; lines: number }[] = []
  for (const row of rows) {
    const l = layout(row, columns)
    if (!l) {
      return fail('word-too-wide')
    }

    laid.push({ row, ...l })
  }

  const wide = Math.max(
    0,
    ...laid.map(({ row, runs }) => Math.max(width(row.key), ...runs.map((x) => x.col + width(x.text)))),
  )
  const c = createCanvas(
    laid.reduce((n, l) => n + l.lines, 0),
    wide,
    columns,
  )
  const labels: Expect['labels'][number][] = []
  let top = 0
  for (const { row, runs, lines } of laid) {
    for (const p of row.parts) {
      // an owned part is placed at its first run
      const x = runs.find((y) => y.part === p)
      if (p.owner !== null) {
        labels.push(
          x ? { owner: p.owner, text: p.text, at: { r: top + x.line, c: x.col } } : { owner: p.owner, text: p.text },
        )
      }
    }

    c.key(top, 0, row.key, row.keyInk, row.item, true)
    for (const x of runs) {
      if (x.part.owner === null) {
        c.cap(top + x.line, x.col, x.text, x.part.ink, row.item)
      } else {
        c.text(top + x.line, x.col, x.text, x.part.ink, x.part.owner, x.join)
      }
    }

    top += lines
  }

  return c.toDrawing({ labels, edges: [], edgeLabels: [], frames: [] })
}

// d with rows' legend stacked under it, columns wide. Its expect.keys gains every row's key and its expect.keyable
// gains
// keyable, with or without rows, so T87 checks the keys d drew in place: one missing there, or one no row lists, fails.
// A Fail, d's or the legend's, is returned as is.
export function withLegend(
  d: Drawing | Fail,
  rows: readonly LegendRow[],
  columns: number,
  keyable: NonNullable<Expect['keyable']> = [],
): Drawing | Fail {
  if (isFail(d)) {
    return d
  }

  const legend = rows.length > 0 ? legendRows(rows, columns) : null
  if (isFail(legend)) {
    return legend
  }

  const out = legend ? stack([d, legend], columns) : d
  const keys = rows.map((r) => ({ key: r.key, item: r.item, cls: r.cls, ...(r.at ? { at: r.at } : {}) }))
  return {
    ...out,
    expect: {
      ...out.expect,
      keys: [...(out.expect.keys ?? []), ...keys],
      keyable: [...(out.expect.keyable ?? []), ...keyable],
    },
  }
}
