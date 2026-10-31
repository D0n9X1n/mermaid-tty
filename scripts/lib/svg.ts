// Serializes styled terminal rows to SVG. Every glyph is its own <text> at x = col × CELL, so
// alignment never depends on the viewer's font metrics (spec B, requirement 1, Images).
export const CELL = 9
export const  ROW = 18
export const  FONT = 15
export const  BASE = 14
export const  PAD = 16
export const  BAR = 28
export const  BG = '#1e1f26';
export type Styled = { text: string; fg: string; bg?: string; bold?: boolean; italic?: boolean };
export type Glyph = { row: number; col: number; text: string; span: number };
// A PNG over a block of cells, as the plugin's image mode shows a fence in kitty and Ghostty.
export type Pic = { row: number; col: number; columns: number; rows: number; png: string };
const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Segments each row's text whole, so a mark that begins a span joins the base before it. A grapheme belongs to the span
// that holds its first code point, whose fg, bold and italic it takes; col advances by its width.
export function glyphCells(rows: { text: string }[][], width: (s: string) => number): Glyph[] {
  const out: Glyph[] = [];
  rows.forEach((row, r) => {
    const ends: number[] = [];
    let len = 0
let  col = 0;
    for (const sp of row) { ends.push((len += sp.text.length)); }
    for (const { segment, index } of seg.segment(row.map((sp) => sp.text).join(''))) {
      const w = width(segment);
      if (w > 0 && segment.trim()) { out.push({ row: r, col, text: segment, span: ends.findIndex((e) => index < e) }); }
      col += w;
    }
  });
  return out;
}
export function toSvg(rows: Styled[][], width: (s: string) => number, title: string, pics: Pic[] = []): string {
  const cols = Math.max(1, ...rows.map((r) => r.reduce((n, sp) => n + width(sp.text), 0)), ...pics.map((p) => p.col + p.columns));
  const W = cols * CELL + 2 * PAD
const  H = rows.length * ROW + 2 * PAD + BAR
const  out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">`,
    `<rect width="${W}" height="${H}" rx="10" fill="${BG}"/>`,
    ...['#ff5f57', '#febc2e', '#28c840'].map((c, i) => `<circle cx="${PAD + 6 + i * 18}" cy="14" r="5" fill="${c}"/>`),
    `<g transform="translate(${PAD} ${PAD + BAR})" font-family="Menlo, Consolas, 'DejaVu Sans Mono', 'PingFang SC', 'Noto Sans Mono CJK SC', monospace" font-size="${FONT}">`);
  rows.forEach((row, r) => {
    let col = 0;
    for (const sp of row) {
      const w = width(sp.text);
      if (sp.bg) { out.push(`<rect x="${col * CELL}" y="${r * ROW}" width="${w * CELL}" height="${ROW}" fill="${sp.bg}"/>`); }
      col += w;
    }
  });
  for (const p of pics) { out.push(`<image x="${p.col * CELL}" y="${p.row * ROW}" width="${p.columns * CELL}" height="${p.rows * ROW}" href="data:image/png;base64,${p.png}"/>`); }
  for (const g of glyphCells(rows, width)) {
    const sp = rows[g.row]![g.span]!;
    out.push(`<text x="${g.col * CELL}" y="${g.row * ROW + BASE}" fill="${sp.fg}"${sp.bold ? ' font-weight="bold"' : ''}${sp.italic ? ' font-style="italic"' : ''}>${esc(g.text)}</text>`);
  }
  return [...out, '</g>', '</svg>', ''].join('\n');
}
// B1 glyph rule: lists every glyph whose <text> is not at x = col × CELL, y = row × ROW + BASE.
export function misplaced(svg: string, rows: Styled[][], width: (s: string) => number): string[] {
  const want = glyphCells(rows, width).map((g) => `${g.col * CELL},${g.row * ROW + BASE},${esc(g.text)}`);
  const got = [...svg.matchAll(/<text x="(\d+)" y="(\d+)"[^>]*>([^<]*)<\/text>/g)].map((m) => `${m[1]},${m[2]},${m[3]}`);
  return want.length === got.length ? want.filter((w, i) => w !== got[i]) : [`expected ${want.length} glyphs, found ${got.length}`];
}
