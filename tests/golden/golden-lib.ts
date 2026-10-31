// tests/golden/golden-lib.ts — the golden file format, the golden glyph scan, and a drawing's widest row.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Cell, Drawing } from '../../core/canvas.ts'
import { GLYPHS } from '../../core/glyphs.ts'
import type { Ink } from '../../core/themes.ts'
import { width } from '../../core/width.ts'

// Each ink's role code on a drawn cell. Series inks are digits.
const CODE: Readonly<Record<Ink, string>> = {
  node: 'n',
  decision: 'd',
  edge: 'e',
  arrow: 'a',
  label: 'l',
  frame: 'f',
  note: 'o',
  title: 't',
  value: 'v',
  s1: '1',
  s2: '2',
  s3: '3',
  s4: '4',
  s5: '5',
  s6: '6',
  s7: '7',
  s8: '8',
}
// A text cell's (source text's) role code: its ink's code in uppercase, or for a series ink the shifted key of its digit,
// !@#$%^&* for 1–8, so the glyph scan never reads source text as a drawn series glyph.
const SHIFTED = '!@#$%^&*'
const textCode = (code: string): string => (/^[1-8]$/.test(code) ? SHIFTED[Number(code) - 1]! : code.toUpperCase())
const glyph = (c: Cell | null): string => (c === null ? ' ' : c.kind === 'cont' ? '' : c.ch)
// A cell's role code: ' ' when empty, '~' on a cont cell, textCode on a text cell, and its ink's code on any other kind.
export const roleCode = (c: Cell | null): string =>
  c === null ? ' ' : c.kind === 'cont' ? '~' : c.kind === 'text' ? textCode(CODE[c.role]) : CODE[c.role]
// One row per canvas row, each cell mapped by f, right-trimmed of spaces only.
const rows = (d: Drawing, f: (c: Cell | null) => string): string[] =>
  d.cells.map((row) => row.map(f).join('').replace(/ +$/, ''))

// A text cell's emphasis code (core/emphasis.ts): b bold, i italic, x both; ' ' for no emphasis or any other cell.
const STYLE = [' ', 'b', 'i', 'x']
const styleCode = (c: Cell | null): string => (c?.kind === 'text' && c.em ? (STYLE[c.em] ?? '?') : ' ')

// For each width: '@w' and its text rows, then '@w roles' and one role row per text row, cell for cell; then, only when
// a cell has emphasis, '@w styles' and one style row per text row. One LF at the end.
export function goldenOf(runs: readonly (readonly [number, Drawing])[]): string {
  return (
    runs
      .map(([w, d]) => {
        const styled = d.cells.some((row) => row.some((c) => c?.em !== undefined))
        return [
          `@${w}`,
          ...rows(d, glyph),
          `@${w} roles`,
          ...rows(d, roleCode),
          ...(styled ? [`@${w} styles`, ...rows(d, styleCode)] : []),
        ].join('\n')
      })
      .join('\n') + '\n'
  )
}

// The widest right-trimmed row, in terminal columns.
export const widest = (d: Drawing): number => Math.max(0, ...rows(d, glyph).map((r) => width(r)))

// A string's code points, as 'U+XXXX' separated by spaces.
const hex = (s: string): string =>
  [...s].map((ch) => 'U+' + ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')).join(' ')

// 'row r col c U+XXXX' for each drawn cell (any kind but text and cont) whose ch is not an allow-listed glyph of width 1 or
// more, or holds a zero-width code point. A golden cannot tell a drawn cell whose whole ch is zero-width from a mark in the
// source text before it, so this checks the drawing itself.
export function drawnGlyphs(d: Drawing): string[] {
  const out: string[] = []
  d.cells.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (!cell || cell.kind === 'text' || cell.kind === 'cont') {
        return
      }
      if (!GLYPHS.has(cell.ch) || width(cell.ch) < 1 || [...cell.ch].some((ch) => width(ch) === 0)) {
        out.push(`row ${r} col ${c} ${hex(cell.ch)}`)
      }
    }),
  )
  return out
}

// 'file:line ch' for each drawn (lowercase) or series (digit) cell in dir's *.golden files, at any depth, whose glyph is not
// allow-listed, and for each zero-width code point not inside source text (see scan). Source text (uppercase, or a series
// ink's shifted digit) is not checked.
export function goldenGlyphs(dir: string): string[] {
  const out: string[] = []
  const files = (readdirSync(dir, { recursive: true }) as string[]).filter((f) => f.endsWith('.golden')).sort()
  for (const f of files) {
    const p = join(dir, f)
    const lines = readFileSync(p, 'utf8').split('\n')
    for (let i = 0; i < lines.length; i++) {
      const w = /^@(\d+)$/.exec(lines[i]!)?.[1]
      const r = w === undefined ? -1 : lines.indexOf(`@${w} roles`, i + 1)
      if (r < 0) {
        continue
      }
      for (let k = i + 1; k < r; k++) {
        scan(lines[k]!, lines[r + k - i] ?? '', `${p}:${k + 1}`, out)
      }
      i = 2 * r - i - 1 // the section's last role row
    }
  }
  return out
}

// Is a role code a drawn or series cell (lowercase or digit), or source text (uppercase, or a series ink's shifted digit)?
// Neither for ' ', '~' or none.
const drawn = (code: string | undefined): boolean => code !== undefined && /[a-z0-9]/.test(code)
const sourceText = (code: string | undefined): boolean => code !== undefined && /[A-Z!@#$%^&*]/.test(code)

// Pairs a text row with its role row by column: a character takes width(ch) columns, and a zero-width code point joins the
// cell before it, as canvas.text() joins it. So it is part of source text when that cell is source text, and is flagged
// otherwise: on a drawn cell, since no allow-listed glyph holds one, and on an empty cell or at a row's start, where no cell
// can take it. A drawn cell whose whole ch is zero-width reads the same in a golden as a mark in the source text before it;
// drawnGlyphs catches that one on the drawing.
function scan(text: string, roles: string, where: string, out: string[]): void {
  let col = 0
  let lead = -1 // lead: the column of the last character that took a column
  for (const ch of text) {
    const w = width(ch)
    const bad = w > 0 ? drawn(roles[col]) && !GLYPHS.has(ch) : !sourceText(roles[lead])
    if (bad) {
      out.push(`${where} ${ch}`)
    }
    if (w > 0) {
      lead = col
    }
    col += w
  }
}
