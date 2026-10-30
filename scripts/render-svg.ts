// node scripts/render-svg.ts FILE COLS THEME OUT.svg: writes the rows core draws of FILE at COLS columns under THEME
// as an SVG, for review outside a terminal. Every glyph is its own <text> at x = col × cellW, a W/F glyph taking two
// cells, so the columns line up whatever font the viewer picks. Exits 1 when core falls back, 2 on bad arguments.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { Rows } from '../core/render.ts'
import { renderMermaid } from '../core/render.ts'
import { THEMES } from '../core/themes.ts'
import { width } from '../core/width.ts'
import { isMain } from './lib/is-main.ts'
import { CC_DARK } from './lib/palette.ts'
import { BG, PAD, esc, glyphCells, toSvg } from './lib/svg.ts'

// A fixed hex preview of Claude Code's dark theme (palette.ts), for the ThemeKeys the default theme draws with. A preview,
// not the real theme: CC resolves each key at render time from the user's own theme, whose colors may differ.
const USED = ['text', 'inverseText', 'inactive', 'subtle', 'suggestion', 'permission', 'claude', 'success', 'error', 'warning', 'merged', 'planMode'] as const
export const DARK_KEYS: Readonly<Record<string, string>> = Object.fromEntries(USED.map(k => [k, CC_DARK[k]!]))

// A span's color as hex: a '#rrggbb' as given, a ThemeKey through DARK_KEYS. Anything else throws, rather than
// writing a color no viewer can draw.
function paint(c: string): string {
  if (/^#[0-9a-f]{6}$/i.test(c)) return c
  if (Object.hasOwn(DARK_KEYS, c)) return DARK_KEYS[c]!
  throw new Error(`render-svg: no color for ${JSON.stringify(c)}`)
}

// The default cell, in px: about a terminal cell's 1:2.
export const CELL_W = 10, CELL_H = 20

// rows as a dark SVG page of cellW × cellH cells: a <rect> per background run, the most neighbouring cells of a row
// with one background, then a <text> per glyph that is not blank. Bold sets font-weight, italic font-style; dimColor, which terminals
// draw faint, sets opacity 0.5.
export function rowsToSvg(rows: Rows, { cellW = CELL_W, cellH = CELL_H }: { cellW?: number; cellH?: number } = {}): string {
  const runs: { r: number; col: number; w: number; fill: string }[] = []
  rows.forEach((row, r) => {
    let col = 0
    for (const sp of row) {
      const w = width(sp.text), last = runs[runs.length - 1]
      if (sp.backgroundColor !== undefined) {
        const fill = paint(sp.backgroundColor)
        if (last?.r === r && last.fill === fill && last.col + last.w === col) last.w += w
        else runs.push({ r, col, w, fill })
      }
      col += w
    }
  })
  const cols = Math.max(1, ...rows.map(row => row.reduce((n, sp) => n + width(sp.text), 0)))
  const W = cols * cellW + 2 * PAD, H = rows.length * cellH + 2 * PAD
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="${BG}"/>`,
    `<g transform="translate(${PAD} ${PAD})" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="${cellW * 17 / 10}" fill="${DARK_KEYS.text}">`,
    ...runs.map(u => `<rect x="${u.col * cellW}" y="${u.r * cellH}" width="${u.w * cellW}" height="${cellH}" fill="${u.fill}"/>`)]
  for (const g of glyphCells(rows, width)) {
    const sp = rows[g.row]![g.span]!
    const style = (sp.color !== undefined ? ` fill="${paint(sp.color)}"` : '') + (sp.bold ? ' font-weight="bold"' : '') + (sp.italic ? ' font-style="italic"' : '') + (sp.dimColor ? ' opacity="0.5"' : '')
    out.push(`<text x="${g.col * cellW}" y="${g.row * cellH + Math.round(cellH * 0.8)}"${style}>${esc(g.text)}</text>`)
  }
  return [...out, '</g>', '</svg>', ''].join('\n')
}

const UNESC: Readonly<Record<string, string>> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"' }

// Each <text>'s glyph, unescaped, and its x, in document order.
export function glyphXs(svg: string): [string, number][] {
  return [...svg.matchAll(/<text x="([^"]*)"[^>]*>([^<]*)<\/text>/g)].map(m => [m[2]!.replace(/&(?:amp|lt|gt|quot);/g, e => UNESC[e]!), Number(m[1])])
}

// The self-check, which measures columns on its own rather than through glyphCells, the renderer's placement: it walks
// each row's text a code point at a time, summing width(ch), and expects a glyph wherever ch is neither blank nor
// zero-width, so a combining mark rides on its base. Returns each glyph svg does not draw, starting with its code point,
// at x / cellW = its column, or both glyph counts when they differ. It counts code points, not graphemes: a base and a
// spacing mark, which the renderer draws as one glyph, fail it, loudly rather than silently.
export function offGrid(svg: string, rows: Rows, cellW: number): string[] {
  const want: { row: number; col: number; ch: string }[] = [], got = glyphXs(svg)
  rows.forEach((row, r) => {
    let col = 0
    for (const ch of row.map(sp => sp.text).join('')) {
      const w = width(ch)
      if (w > 0 && ch.trim()) want.push({ row: r, col, ch })
      col += w
    }
  })
  if (want.length !== got.length) return [`expected ${want.length} glyphs, found ${got.length}`]
  return want.flatMap((g, i) => {
    const [text, x] = got[i]!
    return text.startsWith(g.ch) && x / cellW === g.col ? [] : [`row ${g.row} col ${g.col}: want ${g.ch} at x=${g.col * cellW}, found ${text} at x=${x}`]
  })
}

const USAGE = 'usage: node scripts/render-svg.ts FILE COLS THEME OUT.svg'

// Writes the SVG of FILE's rows at COLS columns under THEME to OUT.svg. Exits 1 when core falls back, 2 on bad arguments.
function main(): number {
  const [file, cols, theme, out, ...rest] = process.argv.slice(2)
  if (!file || !cols || !theme || !out || rest.length || !/^\d+$/.test(cols) || !Object.hasOwn(THEMES, theme)) { console.error(USAGE); return 2 }
  const rows = renderMermaid(readFileSync(file, 'utf8'), { columns: Number(cols), theme })
  if (!rows) { console.error(`render-svg: core fell back on ${file} at ${cols} columns`); return 1 }
  writeFileSync(out, rowsToSvg(rows))
  console.log(`render-svg: wrote ${out}`)
  return 0
}

// B: --readme rewrites the manifest; --stdout FILE [COLUMNS] [THEME] prints SVG (fallback exits 3).
// Load B's adapter only for these modes: A's standalone review gallery needs no README files.
if (isMain(import.meta) && process.argv[2] === '--readme') {
  const { IMAGES } = await import('./lib/images.ts')
  const { ROOT, renderImage } = await import('./lib/render-image.ts')
  for (const img of IMAGES) {
    mkdirSync(dirname(join(ROOT, img.file)), { recursive: true })
    writeFileSync(join(ROOT, img.file), renderImage(img).svg)
  }
  console.log(`render-svg: wrote ${IMAGES.length} images`)
} else if (isMain(import.meta) && process.argv[2] === '--stdout') {
  const [file, cols = '80', theme = 'default'] = process.argv.slice(3)
  if (!file) { console.error('usage: node scripts/render-svg.ts --stdout FILE [COLUMNS] [THEME]'); process.exitCode = 2 }
  else {
    const { styledRows } = await import('./lib/render-image.ts')
    const rows = styledRows(readFileSync(file, 'utf8'), Number(cols), theme)
    if (!rows) { console.error(`render-svg: core fell back for ${file} at ${cols} columns`); process.exitCode = 3 }
    else process.stdout.write(toSvg(rows, width, basename(file)))
  }
} else if (isMain(import.meta)) process.exitCode = main()
