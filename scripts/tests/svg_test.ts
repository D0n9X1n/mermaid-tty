import test from 'node:test';
import assert from 'node:assert/strict';
import { CELL, glyphCells, misplaced, toSvg } from '../lib/svg.ts';
import { width } from '../../core/width.ts';
// e\u0301 is e + U+0301 COMBINING ACUTE ACCENT, one grapheme; \u200B is ZERO WIDTH SPACE. Escapes, since a copy can lose either.
const rows = [[{ text: '[中]', fg: '#fff', bg: '#333' }, { text: '─►e\u0301\u200B<', fg: '#aaa' }]];
test('each glyph gets its own cell; wide glyphs take two; combining marks join their base', () =>
  assert.deepEqual(glyphCells(rows, width).map((g) => [g.col, g.text]),
    [[0, '['], [1, '中'], [3, ']'], [4, '─'], [5, '►'], [6, 'e\u0301'], [7, '<']]));
test('toSvg places every glyph at col × CELL and sizes pill backgrounds by width', () => {
  const svg = toSvg(rows, width, 'demo');
  assert.ok(svg.includes(`<text x="${3 * CELL}" y="14" fill="#fff">]</text>`));
  assert.ok(svg.includes(`<rect x="0" y="0" width="${4 * CELL}" height="18" fill="#333"/>`));
  assert.ok(svg.includes('>&lt;</text>'));
  assert.deepEqual(misplaced(svg, rows, width), []);
});
test('misplaced reports a glyph moved off its cell', () => {
  const bad = toSvg(rows, width, 'demo').replace(`<text x="${CELL}" `, `<text x="${CELL + 1}" `);
  assert.equal(misplaced(bad, rows, width).length, 1);
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
