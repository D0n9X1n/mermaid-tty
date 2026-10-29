// The e2e scenarios' screen check: each drawn diagram's rows, as core/render.ts draws them, show in order; each diagram
// label is drawn in its role's color, or with none under mono (A3); and each prose line shows once. Node built-ins and
// the repo's own modules only (Cell is a type), so the main suite tests it with nothing installed.
import { isFail } from '../../core/fail.ts'
import { explain } from '../../core/render.ts'
import { splitFences } from '../../hooks/fences.ts'
import type { Cell, Color } from './screen.ts'

// none: mono, where a drawn row carries no color at all. hex: a curated palette's role colors as 0xRRGGBB; without it,
// as under the default mapping, which follows the user's Claude Code theme, only the color mode is checked.
export type ColorCheck = 'truecolor' | '256' | 'none'
// diagrams: each drawn diagram's rows, in screen order, as drawnDiagrams gives them.
export type ScreenSpec = { labels: Readonly<Record<string, string>>; prose: readonly string[]; diagrams: readonly (readonly string[])[]; color: ColorCheck; hex?: Readonly<Record<string, number>> }

// The rows each of reply's closed mermaid fences draws as, at columns in theme, in order; a fence that falls back has none.
// Read from the drawing's cells, before toRows styles them, so a renderer that drops cells on the way to the screen
// changes the screen but not these rows.
export function drawnDiagrams(reply: string, columns: number, theme: string): string[][] {
  return splitFences(reply).flatMap(f => {
    const r = f.kind === 'mermaid' ? explain(f.body, { columns, theme }) : null
    if (r === null || isFail(r)) return []
    return [r.drawing.cells.map(row => row.map(c => (c === null ? ' ' : c.kind === 'cont' ? '' : c.ch)).join('').trimEnd())]
  })
}

// The first screen row at or after from where rows show, one per screen row, all after one left margin that is blank
// or holds the reply bullet; -1 when there is none. Wide characters' second cells, whose ch is '', add nothing.
function findRows(cells: Cell[][], rows: readonly string[], from: number): number {
  const rest = (row: Cell[], m: number) => row.slice(m).map(c => c.ch).join('').trimEnd()
  const margin = (row: Cell[], m: number) => /^⏺?$/.test(row.slice(0, m).map(c => c.ch).join('').trim())
  for (let i = from; i + rows.length <= cells.length; i++) for (let m = 0; m <= 8; m++) {
    if (rows.every((r, k) => margin(cells[i + k]!, m) && rest(cells[i + k]!, m) === r)) return i
  }
  return -1
}

// The roles drawn as filled pills, whose label shows on the role's background; every other role colors its text.
const PILLS = new Set(['node', 'decision'])

// A row's text, the cells after wide characters skipped, and for each UTF-16 unit of it the index of its cell.
function joined(row: Cell[]): { text: string; at: number[] } {
  let text = ''
  const at: number[] = []
  row.forEach((c, i) => { for (let k = 0; k < c.ch.length; k++) at.push(i); text += c.ch })
  return { text, at }
}
const show = (c: Color) => `${c.mode} ${c.mode === 'rgb' ? `#${c.value.toString(16).padStart(6, '0')}` : c.value}`
const plain = (c: Color) => c.mode === 'default'

// The problems found on the screen's cells, one line each; [] when there are none.
export function checkDiagramScreen(cells: Cell[][], spec: ScreenSpec): string[] {
  const problems: string[] = []
  let from = 0
  spec.diagrams.forEach((rows, n) => {
    const at = findRows(cells, rows, from)
    if (at < 0) problems.push(`diagram ${n + 1}: not drawn; expected its rows:\n${rows.join('\n')}`)
    else from = at + rows.length
  })
  for (const [label, role] of Object.entries(spec.labels)) {
    const found = cells.map(row => ({ row, ...joined(row) })).find(r => r.text.includes(label))
    if (!found) { problems.push(`${label}: not drawn`); continue }
    if (spec.color === 'none') {
      const bad = found.row.find(c => !plain(c.fg) || !plain(c.bg))
      if (bad) problems.push(`${label}: expected no color, got '${bad.ch}' fg ${show(bad.fg)} bg ${show(bad.bg)}`)
      continue
    }
    const from = found.text.indexOf(label), own = [...new Set(found.at.slice(from, from + label.length))].map(i => found.row[i]!)
    const pill = PILLS.has(role), want = spec.hex?.[role], mode = spec.color === 'truecolor' ? 'rgb' : 'p256'
    const bad = own.map(c => (pill ? c.bg : c.fg)).find(c => c.mode !== mode || (mode === 'rgb' && want !== undefined && c.value !== want))
    if (bad) problems.push(`${label}: expected ${role} ${pill ? 'background' : 'foreground'} ${want === undefined ? mode : show({ mode: 'rgb', value: want })}, got ${show(bad)}`)
  }
  const text = cells.map(row => row.map(c => c.ch).join('').trimEnd()).join('\n')
  for (const line of spec.prose) if (text.split(line).length !== 2) problems.push(`${line}: prose`)
  return problems
}

// The problems of a screen's text that shows a drawn diagram's source: each of its source lines that holds a node or an
// edge ('[', '(' or '>') and shows on screen. Its other lines, like a bare header, may show in prose by chance.
export function sourceShown(text: string, source: readonly string[]): string[] {
  return source.filter(l => /[[(>]/.test(l) && text.includes(l)).map(l => `${l}: drawn diagram shown as source`)
}

// The rows of a screen's text that show a diagram drawn: those holding one of labels but none of the source lines, which
// hold the labels too. [] when every diagram shows as source.
export function drawnRows(text: string, labels: readonly string[], source: readonly string[]): string[] {
  return text.split('\n').filter(row => labels.some(l => row.includes(l)) && !source.some(s => row.includes(s)))
}
