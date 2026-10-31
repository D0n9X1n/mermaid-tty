// Adapter: core's role rows -> styled rows -> SVG. Draws exactly the glyphs core emits; draws with the shared reference
// palette (palette.ts).
import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Span, renderMermaid } from '../../core/render.ts'
import { width } from '../../core/width.ts'
import { type Image } from './images.ts'
import { CC_DARK } from './palette.ts'
import { fit, pngSize } from '../../hooks/image.ts'
import { type Pic, type Styled, toSvg } from './svg.ts'
export const ROOT = fileURLToPath(new URL('../../', import.meta.url))
// The reference palette lives in palette.ts, shared with the review gallery.
const DARK = CC_DARK
const hex = (c: string) => {
  const v = c.startsWith('#') ? c : DARK[c]
  if (!v) {
    throw new Error(`no reference color for theme key ${c}`)
  }

  return v
}
// Plan A's spans carry resolved colors (a CC ThemeKey or #rrggbb; none under mono; dimColor for mono notes); keys
// resolve through DARK (D2).
export function spanStyle(sp: Span): Omit<Styled, 'text'> {
  const fg = sp.dimColor ? DARK.inactive! : sp.color ? hex(sp.color) : DARK.text!
  return {
    fg,
    ...(sp.backgroundColor ? { bg: hex(sp.backgroundColor) } : {}),
    ...(sp.bold ? { bold: true } : {}),
    ...(sp.italic ? { italic: true } : {}),
  }
}
export function styledRows(source: string, columns: number, theme: string, raw = false): Styled[][] | null {
  if (raw) {
    return source
      .trimEnd()
      .split(/\r?\n/)
      .map((text) => [{ text, fg: DARK.text! }])
  }

  const rows = renderMermaid(source, theme === 'default' ? { columns } : { columns, theme })
  return rows && rows.map((row) => row.map((sp) => ({ text: sp.text, ...spanStyle(sp) })))
}
// A reply as Claude Code shows it with the plugin on: each prose line as written, each closed mermaid fence drawn
// by core. null if any fence falls back, so the preview never shows a fence core would not draw. With png (base64),
// each
// fence instead leaves blank the cells the plugin's image mode gives that picture (fit), pushed onto pics.
export function replyRows(
  source: string,
  columns: number,
  theme: string,
  png?: string,
  pics: Pic[] = [],
): Styled[][] | null {
  const out: Styled[][] = []
  const parts = source.trimEnd().split(/^```mermaid\r?\n([\s\S]*?)^```\r?$/m)
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      for (const text of parts[i]!.replace(/^\r?\n|\r?\n$/g, '').split(/\r?\n/)) {
        out.push(text ? [{ text, fg: DARK.text! }] : [])
      }

      continue
    }

    const rows = styledRows(parts[i]!, columns, theme)
    if (!rows) {
      return null
    }

    if (png === undefined) {
      out.push([], ...rows, [])
      continue
    }

    const size = pngSize(png)
    const box = size && fit(size.width, size.height, columns)
    if (!box) {
      throw new Error('picture: not a PNG, or over 255 rows')
    }

    pics.push({ row: out.length + 1, col: 0, png, ...box })
    out.push([], ...Array.from({ length: box.rows }, () => []), [])
  }

  return out
}
export function renderImage(img: Image): { svg: string; rows: Styled[][] } {
  const src = readFileSync(join(ROOT, img.source), 'utf8')
  const pics: Pic[] = []
  const png = img.picture && readFileSync(join(ROOT, img.picture)).toString('base64')
  const rows = img.reply
    ? replyRows(src, img.columns, img.theme, png || undefined, pics)
    : styledRows(src, img.columns, img.theme, img.raw)
  if (!rows) {
    throw new Error(`${img.source}: core fell back at ${img.columns} columns`)
  }

  return { svg: toSvg(rows, width, basename(img.file, '.svg'), pics), rows }
}
