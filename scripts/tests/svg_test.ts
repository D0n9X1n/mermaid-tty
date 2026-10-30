import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE, CELL, ROW, glyphCells, misplaced, toSvg } from '../lib/svg.ts';
import { width } from '../../core/width.ts';
// e\u0301 is e + U+0301 COMBINING ACUTE ACCENT, one grapheme; \u200B is ZERO WIDTH SPACE. Escapes, since a copy can lose either.
const rows = [[{ text: '[中]', fg: '#fff', bg: '#333' }, { text: '─►e\u0301\u200B<', fg: '#aaa' }]];
test('each glyph gets its own cell; wide glyphs take two; combining marks join their base', () =>
  assert.deepEqual(glyphCells(rows, width).map((g) => [g.col, g.text]),
    [[0, '['], [1, '中'], [3, ']'], [4, '─'], [5, '►'], [6, 'e\u0301'], [7, '<']]));
// U+0301 begins the second span. toSvg segments the row's text whole, so the mark joins the e before it, not a zero-width grapheme of its own.
test("a combining mark at a span's start joins its base: one <text>, at the base's cell and fill", () => {
  const split = [[{ text: 'e', fg: '#fff' }, { text: '\u0301x', fg: '#aaa' }]], svg = toSvg(split, width, 'split');
  assert.deepEqual(svg.match(/<text [^>]*>[^<]*<\/text>/g), ['<text x="0" y="14" fill="#fff">e\u0301</text>', `<text x="${CELL}" y="14" fill="#aaa">x</text>`]);
  assert.deepEqual(misplaced(svg, split, width), []);
});
test('toSvg places every glyph at col × CELL and sizes pill backgrounds by width', () => {
  const svg = toSvg(rows, width, 'demo');
  assert.ok(svg.includes(`<text x="${3 * CELL}" y="14" fill="#fff">]</text>`));
  assert.ok(svg.includes(`<rect x="0" y="0" width="${4 * CELL}" height="18" fill="#333"/>`));
  assert.ok(svg.includes('>&lt;</text>'));
  assert.deepEqual(misplaced(svg, rows, width), []);
});
test('a glyph in row 1 sits at y = ROW + BASE, and its background at y = ROW', () => {
  const two = [[{ text: 'a', fg: '#fff' }], [{ text: 'b', fg: '#aaa', bg: '#333' }]], svg = toSvg(two, width, 'two');
  assert.ok(svg.includes(`<text x="0" y="${ROW + BASE}" fill="#aaa">b</text>`));
  assert.ok(svg.includes(`<rect x="0" y="${ROW}" width="${CELL}" height="${ROW}" fill="#333"/>`));
  assert.deepEqual(misplaced(svg, two, width), []);
});
test('misplaced reports a glyph moved off its cell', () => {
  const bad = toSvg(rows, width, 'demo').replace(`<text x="${CELL}" `, `<text x="${CELL + 1}" `);
  assert.equal(misplaced(bad, rows, width).length, 1);
});
test('misplaced reports every glyph moved off its cell, not only the first', () => {
  const bad = toSvg(rows, width, 'demo').replace(`<text x="${CELL}" `, `<text x="${CELL + 1}" `).replace(`<text x="${3 * CELL}" `, `<text x="${3 * CELL + 1}" `);
  assert.deepEqual(misplaced(bad, rows, width), [`${CELL},14,中`, `${3 * CELL},14,]`]);
});
test('misplaced reports a dropped glyph as a glyph count, not as moved glyphs', () => {
  const bad = toSvg(rows, width, 'demo').replace(`<text x="${4 * CELL}" y="14" fill="#aaa">─</text>`, '');
  assert.deepEqual(misplaced(bad, rows, width), ['expected 7 glyphs, found 6']);
});
test('a bold span sets font-weight on its glyphs, and a plain span does not', () => {
  const bold = [[{ text: 'B', fg: '#fff', bold: true }, { text: 'p', fg: '#aaa' }]], svg = toSvg(bold, width, 'bold');
  assert.ok(svg.includes('<text x="0" y="14" fill="#fff" font-weight="bold">B</text>'));
  assert.ok(svg.includes(`<text x="${CELL}" y="14" fill="#aaa">p</text>`));
  assert.deepEqual(misplaced(svg, bold, width), []);
});
test('toSvg escapes " in the aria-label and in glyphs', () => {
  const quoted = [[{ text: 'a "b"', fg: '#fff' }]], svg = toSvg(quoted, width, 'a "b" <c>');
  assert.ok(svg.includes('aria-label="a &quot;b&quot; &lt;c&gt;"'));
  assert.ok(svg.includes('>&quot;</text>'));
  assert.deepEqual(misplaced(svg, quoted, width), []);
});
// & is replaced first: replaced after <, it would turn &lt; into &amp;lt;.
test('toSvg escapes & as &amp;, first, in the aria-label and in glyphs', () => {
  const amp = [[{ text: 'R&D', fg: '#fff' }]], svg = toSvg(amp, width, 'a < b & c');
  assert.ok(svg.includes('aria-label="a &lt; b &amp; c"'));
  assert.ok(svg.includes(`<text x="${CELL}" y="14" fill="#fff">&amp;</text>`));
  assert.deepEqual(misplaced(svg, amp, width), []);
});

test('an italic span sets font-style on its glyphs; bold and italic set both', () => {
  const rows = [[{ text: 'I', fg: '#fff', italic: true }, { text: 'X', fg: '#fff', bold: true, italic: true }, { text: 'p', fg: '#aaa' }]], svg = toSvg(rows, width, 'italic');
  assert.ok(svg.includes('<text x="0" y="14" fill="#fff" font-style="italic">I</text>'));
  assert.ok(svg.includes('<text x="9" y="14" fill="#fff" font-weight="bold" font-style="italic">X</text>'));
  assert.ok(svg.includes('<text x="18" y="14" fill="#aaa">p</text>'));
  assert.deepEqual(misplaced(svg, rows, width), []);
});

test('spanStyle carries a span\'s bold and italic to its styled span', async () => {
  const { spanStyle } = await import('../lib/render-image.ts');
  assert.deepEqual(spanStyle({ text: 'x', bold: true, italic: true }), { fg: spanStyle({ text: 'x' }).fg, bold: true, italic: true });
});
test('toSvg draws a picture as an <image> of its PNG over its cells, beside the glyphs', () => {
  const svg = toSvg([[{ text: 'a', fg: '#fff' }], [], []], width, 'pic', [{ row: 1, col: 0, columns: 4, rows: 2, png: 'iVBORw0K' }]);
  assert.ok(svg.includes(`<image x="0" y="${ROW}" width="${4 * CELL}" height="${2 * ROW}" href="data:image/png;base64,iVBORw0K"/>`));
  assert.ok(svg.includes('<text x="0" y="14" fill="#fff">a</text>'));
});
