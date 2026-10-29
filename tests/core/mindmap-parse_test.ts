import test from 'node:test'; import assert from 'node:assert/strict'
import { parseMindmap } from '../../core/diagrams/mindmap/parse.ts'; import { readSource } from '../../core/source.ts'
const P = (src: string) => { const s = readSource(src); return ('reason' in s ? s : parseMindmap(s)) as any }
const flat = (n: any, d = 0): any[] => [[d, n.shape, n.lines.join('|')], ...n.children.flatMap((c: any) => flat(c, d + 1))]
test('A5: one root; nesting by indentation; every shape; ids optional; quoted text; <br> lines', () => {
  const m = P(['mindmap', 'root((Center))', '  sq[Square]', '    r(Rounded)', '  b))Bang((', '  c)Cloud(', '  h{{Hex}}', '  [No id]', '  q["quoted (text)"]', '  plain', '  two<br/>lines'].join('\n'))
  assert.deepEqual(flat(m.root), [[0, 'circle', 'Center'], [1, 'rect', 'Square'], [2, 'round', 'Rounded'], [1, 'bang', 'Bang'], [1, 'cloud', 'Cloud'],
    [1, 'hexagon', 'Hex'], [1, 'rect', 'No id'], [1, 'rect', 'quoted (text)'], [1, 'plain', 'plain'], [1, 'plain', 'two|lines']])
})
test('A5: a parent is the nearest earlier node with less indentation; colorBy; :::class ignored; frontmatter title', () => {
  const m = P(['---', 'title: Ideas', 'config:', '  mindmap:', '    colorBy: depth', '---', 'mindmap', 'Root', '      A', '   B', '     C', '  D', ':::urgent'].join('\n'))
  assert.deepEqual(flat(m.root).map(([d, , t]) => [d, t]), [[0, 'Root'], [1, 'A'], [1, 'B'], [2, 'C'], [1, 'D']])
  assert.deepEqual([m.title, m.colorBy], ['Ideas', 'depth'])
})
test('A5.errors: an icon, a second root, mismatched delimiters, a markdown string and a header alone fall back', () => {
  for (const [src, why] of [['mindmap\nRoot\n  A\n  ::icon(fa fa-book)', 'syntax:4'], ['mindmap\nRoot\nOther', 'root:3'], ['mindmap\nRoot\n  id[Square)', 'syntax:3'],
    ['mindmap\nRoot\n  "`**bold**`"', 'markdown:3'], ['mindmap', 'empty']] as const) assert.deepEqual(P(src), { reason: why }, src)
})
test('A5.errors: text after the header, another case, a trailing %% and a typed non-string colorBy', () => {
  for (const [src, why] of [['mindmap extra\nRoot', 'header'], ['MINDMAP\nRoot', 'header'], ['mindmap\nRoot %% note', 'directive']] as const)
    assert.deepEqual(P(src), { reason: why }, src)
  const c = (v: string) => P(`---\nconfig:\n  mindmap:\n    colorBy: ${v}\n---\nmindmap\nRoot`).colorBy
  assert.deepEqual(['1', 'true', '"depth"', 'branch'].map(c), ['branch', 'branch', 'depth', 'branch'])
  assert.deepEqual([P('mindmap\nRoot').colorBy, P('mindmap\nRoot').title], ['branch', null])
})
test('A5: tabs and spaces count one each; an indented root; indented class lines; k in source order', () => {
  const m = P('mindmap\n  Root\n\t\t\tA\n   B\n  \t  C\n    :::x\n   D')
  assert.deepEqual(flat(m.root).map(([d, , t]) => [d, t]), [[0, 'Root'], [1, 'A'], [1, 'B'], [2, 'C'], [1, 'D']])
  assert.deepEqual([m.root.k, ...m.root.children.map((c: any) => c.k), m.root.children[1].children[0].k], [0, 1, 2, 4, 3])
  assert.deepEqual(P('mindmap\n  Root\n  A'), { reason: 'root:3' })
  assert.deepEqual(P('mindmap\n  Root\n    A\n Z'), { reason: 'root:4' })
})
test('A5: labels are HTML labels: any <br> spelling splits, quoted text keeps brackets, & and < before a space stay', () => {
  const m = P('mindmap\nr[ Q&A ]\n  a<BR>b\n  c<br />d\n  q["x[y]z"]\n  a < b\n  snake_case\n  ids:x')
  assert.deepEqual(flat(m.root).map(([, , t]) => t), ['Q&A', 'a|b', 'c|d', 'x[y]z', 'a < b', 'snake_case', 'ids:x'])
})
test('A5.errors: entities, other HTML, markdown, a blank line and unsupported characters fall back on their line', () => {
  for (const [body, why] of [['Root #9829;', 'entity:2'], ['R\n  a[ﬂ°x¶ß]', 'entity:3'], ['R\n  &lt;', 'entity:3'], ['R\n  <b>bold</b>', 'html:3'],
    ['R\n  a</br>b', 'html:3'], ['R\n  a *b*', 'markdown:3'], ['R\n  _x_', 'markdown:3'], ['R\n  \\#x', 'markdown:3'], ['R\n  a["`x`"]', 'markdown:3'],
    ['R\n  a<br><br>b', 'blank:3'], ['R\n  a[ ]', 'blank:3'], ['R\n  a‍b', 'unsupported-char U+200D']] as const)
    assert.deepEqual(P(`mindmap\n${body}`), { reason: why }, body)
})
test('A5.errors: lines mindmap.jison reads otherwise or rejects fall back as syntax', () => {
  assert.deepEqual(P('mindmap\n:::x\nR'), { reason: 'syntax:2' })
  for (const body of ['R\n:::', 'R\n  A :::urgent', 'R\n  a[x]:::c', 'R\n  a[x] y', 'R\n  a[x]]', 'R\n  Mindmap ideas', 'R\n  ::ICON(x)',
    'R\n  -)x(-', 'R\n  (-x-)', 'R\n  a(-x-)', 'R\n  a[]', 'R\n  a[""]', 'R\n  a["x" y]', 'R\n  a[x', 'R\n  a{x}', 'R\n  a}', 'R\n  ((x)', 'R\n  (x(',
    'R\n  a))x)', 'R\n  fa:fa-book', 'R\n  $$x$$', 'R\n  a\u2028b'])
    assert.deepEqual(P(`mindmap\n${body}`), { reason: `syntax:${body.split('\n').length + 1}` }, body)
})
