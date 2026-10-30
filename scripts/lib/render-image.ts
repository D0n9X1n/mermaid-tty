// Adapter: core's role rows -> styled rows -> SVG. Draws exactly the glyphs core emits; draws with the shared reference palette (palette.ts).
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Span, renderMermaid } from '../../core/render.ts';
import { width } from '../../core/width.ts';
import { type Image } from './images.ts';
import { CC_DARK } from './palette.ts';
import { type Styled, toSvg } from './svg.ts';
export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
// The reference palette lives in palette.ts, shared with the review gallery.
const DARK = CC_DARK;
const hex = (c: string) => { const v = c.startsWith('#') ? c : DARK[c]; if (!v) throw new Error(`no reference color for theme key ${c}`); return v; };
// Plan A's spans carry resolved colors (a CC ThemeKey or #rrggbb; none under mono; dimColor for mono notes); keys resolve through DARK (D2).
export function spanStyle(sp: Span): Omit<Styled, 'text'> {
  const fg = sp.dimColor ? DARK.inactive! : sp.color ? hex(sp.color) : DARK.text!;
  return { fg, ...(sp.backgroundColor ? { bg: hex(sp.backgroundColor) } : {}), ...(sp.bold ? { bold: true } : {}) };
}
export function styledRows(source: string, columns: number, theme: string, raw = false): Styled[][] | null {
  if (raw) return source.trimEnd().split(/\r?\n/).map((text) => [{ text, fg: DARK.text! }]);
  const rows = renderMermaid(source, theme === 'default' ? { columns } : { columns, theme });
  return rows && rows.map((row) => row.map((sp) => ({ text: sp.text, ...spanStyle(sp) })));
}
export function renderImage(img: Image): { svg: string; rows: Styled[][] } {
  const rows = styledRows(readFileSync(join(ROOT, img.source), 'utf8'), img.columns, img.theme, img.raw);
  if (!rows) throw new Error(`${img.source}: core fell back at ${img.columns} columns`);
  return { svg: toSvg(rows, width, basename(img.file, '.svg')), rows };
}
