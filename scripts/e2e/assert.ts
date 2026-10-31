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

// The first screen row at or after from where rows show, one per screen row, all after one left margin of m cells that
// is blank or holds the reply bullet; null when there is none. Wide characters' second cells, whose ch is '', add nothing.
function findRows(cells: Cell[][], rows: readonly string[], from: number): { at: number; m: number } | null {
  const rest = (row: Cell[], m: number) => row.slice(m).map(c => c.ch).join('').trimEnd()
  const margin = (row: Cell[], m: number) => /^⏺?$/.test(row.slice(0, m).map(c => c.ch).join('').trim())
  for (let i = from; i + rows.length <= cells.length; i++) for (let m = 0; m <= 8; m++) {
    if (rows.every((r, k) => margin(cells[i + k]!, m) && rest(cells[i + k]!, m) === r)) return { at: i, m }
  }
  return null
}

// The cells of a screen row, from m on, that a drawn row of text covers, a wide character's second cell included.
function span(row: Cell[], m: number, text: string): Cell[] {
  let n = m, got = ''
  while (n < row.length && (got.length < text.length || row[n]!.ch === '')) got += row[n++]!.ch
  return row.slice(m, n)
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
  // The rows the diagrams were found on: a label is looked for there first, so other text that holds it, like Claude
  // Code's cwd line (C:\Users\... on Windows), is not taken for it.
  const drawn = new Set<number>()
  // Under mono, only the cells each diagram's rows cover must carry no color: a cell outside them may be Claude Code's
  // own UI, like its spinner, colored while the screen was read. A blank cell shows no foreground, so only its background
  // counts: Claude Code's spinner can leave its color on one, on Windows.
  const colored = (c: Cell) => (c.ch.trim() !== '' && !plain(c.fg)) || !plain(c.bg)
  const noColor = (what: string, c: Cell | undefined) => {
    if (c) problems.push(`${what}: expected no color, got '${c.ch}' fg ${show(c.fg)} bg ${show(c.bg)}`)
  }
  spec.diagrams.forEach((rows, n) => {
    const found = findRows(cells, rows, from)
    if (!found) { problems.push(`diagram ${n + 1}: not drawn; expected its rows:\n${rows.join('\n')}`); return }
    const { at, m } = found
    from = at + rows.length
    rows.forEach((_, k) => drawn.add(at + k))
    if (spec.color === 'none') noColor(`diagram ${n + 1}`, rows.flatMap((r, k) => span(cells[at + k]!, m, r)).find(colored))
  })
  const all = cells.map((row, y) => ({ row, y, ...joined(row) }))
  for (const [label, role] of Object.entries(spec.labels)) {
    const holds = (r: typeof all[number]) => r.text.includes(label)
    const found = all.find(r => drawn.has(r.y) && holds(r)) ?? all.find(holds)
    if (!found) { problems.push(`${label}: not drawn`); continue }
    const from = found.text.indexOf(label), own = [...new Set(found.at.slice(from, from + label.length))].map(i => found.row[i]!)
    if (spec.color === 'none') { noColor(label, own.find(colored)); continue }
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
