// The e2e scenarios' screen check: each diagram label is drawn in its role's color, or with none under mono (A3), and
// each prose line shows once. Node built-ins only (Cell is a type), so the main suite tests it with nothing installed.
import type { Cell, Color } from './screen.ts'

// none: mono, where a drawn row carries no color at all. hex: a curated palette's role colors as 0xRRGGBB; without it,
// as under the default mapping, which follows the user's Claude Code theme, only the color mode is checked.
export type ColorCheck = 'truecolor' | '256' | 'none'
export type ScreenSpec = { labels: Readonly<Record<string, string>>; prose: readonly string[]; color: ColorCheck; hex?: Readonly<Record<string, number>> }

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

// The rows of a screen's text that show a diagram drawn: those holding one of labels but none of the source lines, which
// hold the labels too. [] when every diagram shows as source.
export function drawnRows(text: string, labels: readonly string[], source: readonly string[]): string[] {
  return text.split('\n').filter(row => labels.some(l => row.includes(l)) && !source.some(s => row.includes(s)))
}
