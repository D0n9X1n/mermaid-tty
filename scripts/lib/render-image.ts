// Adapter: core's role rows -> styled rows -> SVG. Draws exactly the glyphs core emits; owns the reference palette.
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Span, renderMermaid } from '../../core/render.ts';
import { width } from '../../core/width.ts';
import { type Image } from './images.ts';
import { type Styled, toSvg } from './svg.ts';
export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
// Claude Code 2.1.308's built-in dark theme (the rgb() table whose text is rgb(255,255,255)), as hex.
const DARK: Record<string, string> = { claude: '#d77757', permission: '#b1b9f9', planMode: '#48968c', ide: '#4782c8',
  text: '#ffffff', inverseText: '#000000', inactive: '#999999', subtle: '#505050', suggestion: '#b1b9f9', success: '#4eba65', error: '#ff6b80',
  warning: '#ffc107', merged: '#af87ff', professionalBlue: '#6a9bcc', rainbow_red: '#eb5f57', rainbow_orange: '#f58b57',
  rainbow_yellow: '#fac35f', rainbow_green: '#91c882', rainbow_blue: '#82aadc', rainbow_indigo: '#9b82c8', rainbow_violet: '#c882b4',
  red_FOR_SUBAGENTS_ONLY: '#dc2626', blue_FOR_SUBAGENTS_ONLY: '#6a9bcc', green_FOR_SUBAGENTS_ONLY: '#16a34a',
  yellow_FOR_SUBAGENTS_ONLY: '#ca8a04', purple_FOR_SUBAGENTS_ONLY: '#827dbd', orange_FOR_SUBAGENTS_ONLY: '#d97757',
  pink_FOR_SUBAGENTS_ONLY: '#c46686', cyan_FOR_SUBAGENTS_ONLY: '#0891b2' };
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
