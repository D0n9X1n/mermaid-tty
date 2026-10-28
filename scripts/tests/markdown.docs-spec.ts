import test from 'node:test';
import assert from 'node:assert/strict';
import { CJK, all, headings, lineOf, links, parse, section, text, within } from '../docs/markdown.ts';
const md = '# T\n\n[中文](Home-zh-CN)\n\n```sh\n# not a heading [x](Fake)\n```\n\n## A\n`[c](Code)` and [Usage](Usage) ![i](a.svg)\n\n### A1\n\n## B\n';
test('the GFM tree: fenced and inline code hold no headings, links or images', () => {
  assert.deepEqual(headings(md).map((h) => h.depth), [1, 2, 3, 2]);
  assert.deepEqual(links(md).map((l) => l.target), ['Home-zh-CN', 'Usage']);
  assert.deepEqual(all(parse(md), 'image').map((i) => i.url), ['a.svg']);
  assert.deepEqual(headings(md), [{ depth: 1, text: 'T', line: 1 }, { depth: 2, text: 'A', line: 9 }, { depth: 3, text: 'A1', line: 12 }, { depth: 2, text: 'B', line: 14 }]);
  assert.deepEqual(links(md), [{ line: 3, label: '中文', target: 'Home-zh-CN' }, { line: 10, label: 'Usage', target: 'Usage' }]);
});
test('what the old scanner got wrong: an invalid fence opener, a double-backtick span, HTML continuation', () => {
  assert.equal(all(parse('``` `\n\n![x](a.svg)'), 'image').length, 1);
  assert.equal(all(parse('``![x](a.svg)``'), 'image').length, 0);
  assert.equal(all(parse('<p align="center"></p>\n![x](a.svg)'), 'image').length, 0);
});
test('section runs to the next h1/h2; text drops code; CJK', () => {
  assert.equal(section(md, 'A'), '`[c](Code)` and [Usage](Usage) ![i](a.svg)\n\n### A1\n\n');
  assert.equal(section(md, 'Missing'), null);
  assert.equal(text(parse('`x` [甲](Y) z')).trim(), '甲 z');
  assert.ok(CJK.test('中') && CJK.test('한') && !CJK.test('─►é'));
  // An h1 also ends a section, only an h2 opens one, the last runs to the end, and a heading on the last line has an empty body.
  assert.deepEqual([section('## A\nx\n# B\ny\n', 'A'), section('# A\nx\n', 'A'), section('## A\nx', 'A'), section('## A', 'A')], ['x\n', null, 'x', '']);
  // A setext heading's body starts on the line after its underline.
  assert.equal(section('A\n---\nx\n## B\n', 'A'), 'x\n');
  // Inline code, raw HTML and a code block each count as exactly one space.
  assert.equal(text(parse('`x` [甲](Y) z')), '  甲 z');
  assert.equal(text(parse('a<br>b\n\n    code\n')), 'a b ');
  // Every CJK range, checked one code point either side of each end.
  for (const [a, b] of [[0x3040, 0x30ff], [0x3400, 0x4dbf], [0x4e00, 0x9fff], [0xac00, 0xd7af], [0xf900, 0xfaff]] as const)
    assert.deepEqual([a - 1, a, b, b + 1].map((c) => CJK.test(String.fromCharCode(c))), [false, true, true, false], a.toString(16));
});
test('GFM: a table and an autolink literal parse; within walks the parent links up to the root', () => {
  const src = '| a | b |\n| - | - |\n| [![i](a.svg)](L) | see https://x.example/a |\n', t = parse(src), img = all(t, 'image')[0]!;
  assert.equal(all(t, 'table').length, 1);
  assert.deepEqual([img.url, within(img, 'link'), within(img, 'table'), within(img, 'blockquote'), within(t, 'root')], ['a.svg', true, true, false, false]);
  // An image-only link has no visible label; a bare URL links to itself.
  assert.deepEqual(links(src), [{ line: 3, label: '', target: 'L' }, { line: 3, label: 'https://x.example/a', target: 'https://x.example/a' }]);
});
test('lineOf: a node with no position takes the line of its nearest ancestor that has one; links() leaves out reference-style links', () => {
  // The GFM transform makes this literal autolink, and its text, with no position: both take the paragraph's line 3, not the root's 1.
  const src = '# T\n\nsay "www.x.example"\n', link = all(parse(src), 'link')[0]!;
  assert.deepEqual(links(src), [{ line: 3, label: 'www.x.example', target: 'http://www.x.example' }]);
  assert.deepEqual([link.position, lineOf(link.children![0]!)], [undefined, 3]);
  // A node that spans lines reports its first.
  assert.deepEqual(headings('A\n---\n'), [{ depth: 2, text: 'A', line: 1 }]);
  // A reference-style link is a linkReference, not a link; the docs rules reject those on their own (D15b).
  assert.deepEqual(links('[x][r]\n\n[r]: Y'), []);
});
