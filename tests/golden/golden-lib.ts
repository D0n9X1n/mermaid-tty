// tests/golden/golden-lib.ts — the golden file format, the golden glyph scan, and a drawing's widest row.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Cell, Drawing } from '../../core/canvas.ts'
import { GLYPHS } from '../../core/glyphs.ts'
import type { Ink } from '../../core/themes.ts'
import { width } from '../../core/width.ts'

// Each ink's role code on a drawn cell; a text cell (source text) takes it in uppercase. Series inks are digits.
const CODE: Readonly<Record<Ink, string>> = {
  node: 'n', decision: 'd', edge: 'e', arrow: 'a', label: 'l', frame: 'f', note: 'o', title: 't', value: 'v',
  s1: '1', s2: '2', s3: '3', s4: '4', s5: '5', s6: '6', s7: '7', s8: '8',
}
const glyph = (c: Cell | null): string => (c === null ? ' ' : c.kind === 'cont' ? '' : c.ch)
const code = (c: Cell | null): string => (c === null ? ' ' : c.kind === 'cont' ? '~' : c.kind === 'text' ? CODE[c.role].toUpperCase() : CODE[c.role])
// One row per canvas row, each cell mapped by f, right-trimmed of spaces only.
const rows = (d: Drawing, f: (c: Cell | null) => string): string[] => d.cells.map(row => row.map(f).join('').replace(/ +$/, ''))

// For each width: '@w' and its text rows, then '@w roles' and one role row per text row, cell for cell. One LF at the end.
export function goldenOf(runs: readonly (readonly [number, Drawing])[]): string {
  return runs.map(([w, d]) => [`@${w}`, ...rows(d, glyph), `@${w} roles`, ...rows(d, code)].join('\n')).join('\n') + '\n'
}

// The widest right-trimmed row, in terminal columns.
export const widest = (d: Drawing): number => Math.max(0, ...rows(d, glyph).map(r => width(r)))

// 'file:line ch' for each drawn (lowercase) or series (digit) cell in dir's *.golden files, at any depth, whose glyph is not
// allow-listed, and for each zero-width code point not inside source text (see scan). Source text (uppercase) is not checked.
export function goldenGlyphs(dir: string): string[] {
  const out: string[] = []
  const files = (readdirSync(dir, { recursive: true }) as string[]).filter(f => f.endsWith('.golden')).sort()
  for (const f of files) {
    const p = join(dir, f), lines = readFileSync(p, 'utf8').split('\n')
    for (let i = 0; i < lines.length; i++) {
      const w = /^@(\d+)$/.exec(lines[i]!)?.[1]
      const r = w === undefined ? -1 : lines.indexOf(`@${w} roles`, i + 1)
      if (r < 0) continue
      for (let k = i + 1; k < r; k++) scan(lines[k]!, lines[r + k - i] ?? '', `${p}:${k + 1}`, out)
      i = 2 * r - i - 1   // the section's last role row
    }
  }
  return out
}

// Is a role code a drawn or series cell (lowercase or digit), or source text (uppercase)? Neither for ' ', '~' or none.
const drawn = (code: string | undefined): boolean => code !== undefined && /[a-z0-9]/.test(code)
const sourceText = (code: string | undefined): boolean => code !== undefined && /[A-Z]/.test(code)

// Pairs a text row with its role row by column: a character takes width(ch) columns. A zero-width code point is either a
// cell of its own, on the next column, or part of the cell before it, and a golden cannot tell which; so it is flagged
// unless both readings are safe: its own column is not drawn, and the cell it would join is source text. It never inherits
// a text exemption from a drawn cell beside it. No allow-listed glyph is zero-width, so a drawn one never passes.
function scan(text: string, roles: string, where: string, out: string[]): void {
  let col = 0, lead = -1                        // lead: the column of the last character that took a column
  for (const ch of text) {
    const w = width(ch)
    const bad = w > 0 ? drawn(roles[col]) && !GLYPHS.has(ch) : drawn(roles[col]) || !sourceText(roles[lead])
    if (bad) out.push(`${where} ${ch}`)
    if (w > 0) lead = col
    col += w
  }
}
