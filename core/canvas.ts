// core/canvas.ts — a cell grid with owners, a write policy and a conflict log (plan A §6).
import { boxGlyph, junction } from './glyphs.ts'
import type { Piece } from './text.ts'
import type { Ink } from './themes.ts'
import type { Expect } from './validate.ts'
import { width } from './width.ts'

export type Kind = 'text' | 'cap' | 'fill' | 'line' | 'arrow' | 'frame' | 'title' | 'lifeline' | 'cont'  // cont = 2nd cell of a W/F char
export type Cell = { ch: string; role: Ink; kind: Kind; owners: readonly string[]; dirs: number; join?: Piece['join']; arms?: string; style?: 'light' | 'heavy' | 'dotted' }  // arms: per-arm weights 'urdl'
export type Conflict = { row: number; col: number; had: string; by: string }  // had: owners[0] of the cell hit, or 'out-of-bounds'; by: owners[0] of the write
export type Drawing = { columns: number; cells: (Cell | null)[][]; conflicts: readonly Conflict[]; expect: Expect }
export type Canvas = {
  text(r: number, c: number, s: string, role: Ink, owner: string | readonly string[], join?: Piece['join']): number  // columns used; owners[0] owns the text
  cap(r: number, c: number, s: string, role: Ink, owner: string): void
  fill(r: number, c: number, n: number, role: Ink, owner: string): void
  line(r: number, c: number, dirs: number, weight: 'light' | 'heavy' | 'dotted', role: Ink, owner: string): void
  arrow(r: number, c: number, ch: string, owner: string): void
  frame(top: number, left: number, bottom: number, right: number, role: Ink, owner: string, title?: string): void
  lifeline(r: number, c: number, heavy: boolean, owner: string): void
  toDrawing(expect: Expect): Drawing
}

// A dotted cell's arms are all light, since a solid line makes it solid (see line): a straight run draws ┄ or ┆, and a bend or
// branch the light glyph (rule 12). Any other line draws the glyph of its arms, light and heavy arms meeting in their mixed glyph.
const glyph = (dirs: number, arms: string, style: NonNullable<Cell['style']>): string => (style === 'dotted' ? junction(dirs, 'dotted') : boxGlyph(arms))

// Frames and lifelines are background: a text, cap, fill, arrow or line write replaces them.
const BACKGROUND: ReadonlySet<Kind> = new Set<Kind>(['frame', 'lifeline'])

// Two cells' arms 'urdl' merged arm by arm, or null if one arm is claimed with two weights.
function mergeArms(a: string, b: string): string | null {
  let out = ''
  for (let i = 0; i < 4; i++) {
    const x = a[i]!, y = b[i]!
    if (x !== '0' && y !== '0' && x !== y) return null
    out += x === '0' ? y : x
  }
  return out
}

// Write policy: text, cap, fill, arrow and title cells are exclusive, so a later text, cap, fill, arrow or line write on one is a
// Conflict, and the old cell stays. A line on a line merges arm by arm when shares(old owner, new owner) holds for any old owner;
// unrelated owners may only cross straight and perpendicular (┼ ╂ ┿ ╋). One arm claimed with two weights, or any other meeting,
// is a Conflict. An arrow on an arrow of the same glyph merges owners when shares holds for any old owner. A frame or lifeline
// draws only into empty cells, so on a drawn cell it is a no-op.
// shares: may two owners merge a line or arrow cell (default a === b).
export function createCanvas(rows: number, cols: number, columns: number, shares: (a: string, b: string) => boolean = (a, b) => a === b): Canvas {
  const cells: (Cell | null)[][] = Array.from({ length: rows }, () => Array<Cell | null>(cols).fill(null))
  const conflicts: Conflict[] = []
  // A write outside [0, rows) × [0, cols), or at a non-integer row or column, is a Conflict and is skipped: it never throws and
  // never grows the grid, so validation fails closed and the render falls back.
  const inGrid = (r: number, c: number, by: string): boolean => {
    if (Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r < rows && c >= 0 && c < cols) return true
    conflicts.push({ row: r, col: c, had: 'out-of-bounds', by })
    return false
  }
  // An exclusive write takes an empty or background cell; on any other cell it logs a conflict and keeps the old cell.
  const put = (r: number, c: number, cell: Cell): void => {
    if (!inGrid(r, c, cell.owners[0]!)) return
    const old = cells[r]![c]
    if (old && !BACKGROUND.has(old.kind)) conflicts.push({ row: r, col: c, had: old.owners[0]!, by: cell.owners[0]! })
    else cells[r]![c] = cell
  }
  // A frame or lifeline writes only into an empty cell: on a drawn cell it is a no-op, not a Conflict, which sequence layering relies on.
  const under = (r: number, c: number, cell: Cell): void => { if (inGrid(r, c, cell.owners[0]!) && !cells[r]![c]) cells[r]![c] = cell }
  const canvas: Canvas = {
    // text('') writes no cell, so it carries no join.
    text(r, c, s, role, owner, join) {
      const owners = typeof owner === 'string' ? [owner] : owner
      let col = c, lead: Cell | null = null            // the lead cell this call made last; a zero-width character joins only it
      for (const ch of s) {
        const w = width(ch)
        if (w === 0) { if (lead) lead.ch += ch; continue }   // with no lead cell it drops; the validator's text compare catches that
        lead = { ch, role, kind: 'text', owners, dirs: 0, ...(col === c && join !== undefined ? { join } : {}) }
        put(r, col, lead)
        if (w === 2) put(r, col + 1, { ch: '', role, kind: 'cont', owners, dirs: 0 })
        col += w
      }
      return col - c
    },
    cap(r, c, s, role, owner) {
      let col = c
      for (const ch of s) put(r, col++, { ch, role, kind: 'cap', owners: [owner], dirs: 0 })
    },
    fill(r, c, n, role, owner) {
      for (let i = 0; i < n; i++) put(r, c + i, { ch: ' ', role, kind: 'fill', owners: [owner], dirs: 0 })
    },
    // An arrow on an arrow of the same glyph merges owners when shares holds for an old owner, so edges into one node end in
    // one head that each owns. Any other write on an arrow is a Conflict (put).
    arrow(r, c, ch, owner) {
      const old = cells[r]?.[c]
      if (old?.kind === 'arrow' && old.ch === ch && old.owners.some(o => shares(o, owner))) {
        if (!old.owners.includes(owner)) cells[r]![c] = { ...old, owners: [...old.owners, owner] }
        return
      }
      put(r, c, { ch, role: 'arrow', kind: 'arrow', owners: [owner], dirs: 0 })
    },
    line(r, c, dirs, weight, role, owner) {
      if (!inGrid(r, c, owner)) return
      const k = weight === 'heavy' ? '2' : '1'
      const arms = [1, 2, 4, 8].map(b => (dirs & b ? k : '0')).join('')
      const old = cells[r]![c]
      if (!old || BACKGROUND.has(old.kind)) {
        cells[r]![c] = { ch: glyph(dirs, arms, weight), role, kind: 'line', owners: [owner], dirs, arms, style: weight }
        return
      }
      // Any other kind is exclusive: a Conflict at once, so line asks shares only about a line cell's owners.
      if (old.kind !== 'line') { conflicts.push({ row: r, col: c, had: old.owners[0]!, by: owner }); return }
      const related = old.owners.some(o => shares(o, owner))
      const crossing = (old.dirs === 10 && dirs === 5) || (old.dirs === 5 && dirs === 10)
      const merged = related || crossing ? mergeArms(old.arms!, arms) : null
      if (merged === null) { conflicts.push({ row: r, col: c, had: old.owners[0]!, by: owner }); return }
      const all = old.dirs | dirs
      const style = old.style === 'dotted' ? weight : old.style!   // a dotted cell takes the new line's style: dotted only while every line in it is
      const owners = old.owners.includes(owner) ? old.owners : [...old.owners, owner]
      cells[r]![c] = { ...old, ch: glyph(all, merged, style), owners, dirs: all, arms: merged, style }
    },
    lifeline(r, c, heavy, owner) { under(r, c, { ch: junction(5, heavy ? 'heavy' : 'light'), role: 'note', kind: 'lifeline', owners: [owner], dirs: 5 }) },
    frame(top, left, bottom, right, role, owner, title) {
      const edge = (r: number, c: number, dirs: number) => under(r, c, { ch: junction(dirs, 'light'), role, kind: 'frame', owners: [owner], dirs })
      for (let c = left + 1; c < right; c++) { edge(top, c, 10); edge(bottom, c, 10) }
      for (let r = top + 1; r < bottom; r++) { edge(r, left, 5); edge(r, right, 5) }
      edge(top, left, 6); edge(top, right, 12); edge(bottom, left, 3); edge(bottom, right, 9)
      if (title) canvas.text(top, left + 2, title, role, owner)
    },
    toDrawing(expect) { return { columns, cells, conflicts, expect } },
  }
  return canvas
}
