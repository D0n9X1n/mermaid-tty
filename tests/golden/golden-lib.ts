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
// allow-listed. Source text (uppercase) is not checked.
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

// Pairs a text row with its role row by column: a character takes width(ch) columns, and a zero-width one joins the cell
// before it, so it is checked against that cell's code.
function scan(text: string, roles: string, where: string, out: string[]): void {
  let col = 0, lead = 0
  for (const ch of text) {
    const w = width(ch)
    if (w > 0) lead = col
    if (/[a-z0-9]/.test(roles[lead] ?? ' ') && !GLYPHS.has(ch)) out.push(`${where} ${ch}`)
    col += w
  }
}
