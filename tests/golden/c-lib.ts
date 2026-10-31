// tests/golden/c-lib.ts — C's golden harness helpers (plan C T48): the gated fixture folders, each ladder fixture's
// widths,
// a fixture's %% expect lines, the Coverage rows' problems, and probes of a drawing or its rows.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Cell, Drawing } from '../../core/canvas.ts'
import type { Step } from '../../core/fit.ts'
import { TIER1, TIER2_PASSED } from '../../core/registry.ts'
import type { Rows, Span } from '../../core/render.ts'
import { drawnGlyphs } from './golden-lib.ts'

// The fixture folders the harness gates, in the registry's order: each Tier 1 type, then each passed Tier 2 type. Each
// folder is named for its type, as are the type's Coverage rows.
export const GATED_DIRS: readonly string[] = [...TIER1, ...TIER2_PASSED]

// Each ladder fixture, and the exact sorted widths its %% expect lines must cover.
const at = (widths: readonly number[], ids: readonly string[]) => ids.map((id) => [id, widths] as const)
export const LADDER: Readonly<Record<string, readonly number[]>> = Object.fromEntries([
  ...at(
    [59, 60, 61],
    [
      'state-ok-18',
      'class-ok-24',
      'er-ok-18',
      'gantt-ok-12',
      'pie-ok-08',
      'journey-ok-05',
      'xychart-ok-09',
      'mindmap-ok-09',
      'gitGraph-ok-10',
      'timeline-ok-10',
    ],
  ),
  ...at([58, 59, 60], ['quadrant-ok-08']),
  ...at(
    [60],
    [
      'state-ok-19',
      'state-ok-20',
      'state-ok-21',
      'state-ok-22',
      'class-ok-25',
      'class-ok-26',
      'class-ok-27',
      'class-ok-28',
      'er-ok-19',
      'er-ok-20',
      'er-ok-21',
      'er-ok-22',
      'gantt-ok-13',
      'pie-ok-09',
      'journey-ok-06',
      'xychart-ok-10',
      'quadrant-ok-09',
      'mindmap-ok-10',
      'mindmap-ok-11',
      'mindmap-ok-12',
      'timeline-ok-11',
      'timeline-ok-12',
    ],
  ),
  ...at([60, 80, 120], ['gantt-ok-05', 'gantt-ok-15']),
  ...at([42], ['gantt-ok-16']),
  ...at([18], ['quadrant-reject-09']),
  ...at([60, 120], ['gantt-reject-14', 'pie-reject-06', 'journey-reject-08', 'xychart-reject-12']),
  ...at([60, 80], ['mindmap-reject-06', 'gitGraph-reject-07', 'timeline-reject-07']),
])

// A fixture's `%% expect <cols> <step> [widest <n>]` line: at cols columns the fixture takes step, or falls back; given
// widest, its drawing's widest row is that many columns.
export type ExpectLine = { cols: number; step: Step | 'fallback'; widest?: number }

// src's %% expect lines, in order, each without widest when it names none.
export function expectLines(src: string): ExpectLine[] {
  return src.split('\n').flatMap((line) => {
    const m = /^%% expect (\d+) (\w+)(?: widest (\d+))?$/.exec(line)
    if (!m) {
      return []
    }

    const e: ExpectLine = { cols: Number(m[1]), step: m[2] as ExpectLine['step'] }
    return [m[3] === undefined ? e : { ...e, widest: Number(m[3]) }]
  })
}

// Fixture id's source, from fixtures/<id less its -ok-NN or -reject-NN>/<id>.mmd.
export const fx = (id: string): string =>
  readFileSync(join('fixtures', id.replace(/-(ok|reject)-\d+$/, ''), `${id}.mmd`), 'utf8')

// A table row's trimmed cells, split at each | no backslash escapes: '| a | b\|c |' gives ['a', 'b\|c'].
const cells = (row: string): string[] =>
  row
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((s) => s.trim())

// The owners of d's cells of the given kinds.
const ownersOf = (d: Drawing, kinds: readonly string[]): Set<string> =>
  new Set(d.cells.flat().flatMap((c) => (c && kinds.includes(c.kind) ? c.owners : [])))

// 'owner@row' for each row holding a cap or fill cell of an owner that has text but none of its text cells there: a
// border-only row of a labelled item. Owners with no text (marks, bars, connectors, point keys) pass; a key cell is
// neither a cap nor a fill.
export function borderRows(d: Drawing): string[] {
  const texted = ownersOf(d, ['text', 'cont'])
  return d.cells.flatMap((row, r) => {
    const text = new Set(row.flatMap((c) => (c?.kind === 'text' ? c.owners : [])))
    const edged = new Set(row.flatMap((c) => (c?.kind === 'cap' || c?.kind === 'fill' ? c.owners : [])))
    return [...edged].filter((o) => texted.has(o) && !text.has(o)).map((o) => `${o}@${r}`)
  })
}

// The sorted owners of d's frame cells that d.expect.frames does not list.
export function unlistedFrames(d: Drawing): string[] {
  const listed = new Set(d.expect.frames)
  return [...ownersOf(d, ['frame'])].filter((o) => !listed.has(o)).sort()
}

// Every fault A4 checks on each drawing beyond render and validate: its border-only rows, its unlisted frames, and each
// drawn
// cell that is not one allow-listed glyph. A golden reads a drawn cell whose whole ch is zero-width as a mark joined to
// the
// cell before it, which the glyph scan skips after source text, so drawn cells are checked on the drawing
// (drawnGlyphs).
export const drawingFaults = (d: Drawing): string[] => [...borderRows(d), ...unlistedFrames(d), ...drawnGlyphs(d)]

// The first span of rows, in reading order, whose text matches re (search ignores re's lastIndex).
export const spanOf = (rows: Rows, re: RegExp): Span | undefined => rows.flat().find((s) => s.text.search(re) >= 0)

// A cap's eighths on a bar axis: █ counts 8 and a partial its index + 1, ▏…▉ growing right (h), ▁…▇ growing up (v); 0
// for any other cell.
const BARS = { h: [...'▏▎▍▌▋▊▉█'], v: [...'▁▂▃▄▅▆▇█'] }
const eighths = (cell: Cell | null | undefined, axis: 'h' | 'v'): number =>
  cell?.kind === 'cap' ? BARS[axis].indexOf(cell.ch) + 1 : 0
// The summed eighths of the bar caps from (r, c) on, a step of dr rows and dc columns at a time, up to the first other
// cell.
function run(d: Drawing, r: number, c: number, dr: number, dc: number, axis: 'h' | 'v'): number {
  let sum = 0
  let e = eighths(d.cells[r]?.[c], axis)
  while (e > 0) {
    sum += e
    r += dr
    c += dc
    e = eighths(d.cells[r]?.[c], axis)
  }

  return sum
}
// The eighths of the consecutive ▏…█ caps rightward from (row, col).
export const hrun = (d: Drawing, row: number, col: number): number => run(d, row, col, 0, 1, 'h')
// The eighths of the consecutive ▁…█ caps in column col, upward from row base − 1.
export const vrun = (d: Drawing, col: number, base: number): number => run(d, base - 1, col, -1, 0, 'v')
