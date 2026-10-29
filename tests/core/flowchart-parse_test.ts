import test from 'node:test'; import assert from 'node:assert/strict'
import { parseFlowchart } from '../../core/diagrams/flowchart/parse.ts'; import { readSource, type Source } from '../../core/source.ts'
import { ALIASES } from '../../core/caps.ts'
const P = (t: string) => parseFlowchart(readSource(t) as Source) as any
test('A1: headers and directions', () => {
  for (const [d, w] of [['TD', 'TB'], ['TB', 'TB'], ['BT', 'BT'], ['LR', 'LR'], ['RL', 'RL']]) assert.equal(P(`flowchart ${d}\nA`).dir, w)
  assert.equal(P('graph LR\nA').dir, 'LR'); assert.equal(P('flowchart\nA').dir, 'TB'); assert.equal(P('graph\nA').dir, 'TB')
})
test('A1: every bracket shape, @{shape}, quoted and <br/> labels', () => {
  const S: [string, string][] = [['A[x]', 'rect'], ['A(x)', 'round'], ['A([x])', 'stadium'], ['A[[x]]', 'subroutine'], ['A[(x)]', 'cylinder'],
    ['A((x))', 'circle'], ['A{x}', 'diamond'], ['A{{x}}', 'hexagon'], ['A[/x/]', 'leanR'], ['A[\\x\\]', 'leanL'], ['A[/x\\]', 'trap'],
    ['A[\\x/]', 'trapInv'], ['A>x]', 'asym'], ['A(((x)))', 'dcircle'], ['A@{ shape: cyl, label: "x" }', 'cylinder'], ['A@{ shape: zzz }', 'rect']]
  for (const [src, shape] of S) assert.equal(P(`flowchart TD\n${src}`).nodes[0].shape, shape, src)
  assert.equal(P('flowchart TD\nA["a, b: (c)!"]').nodes[0].rows[0].text, 'a, b: (c)!')
  assert.deepEqual(P('flowchart TD\nA[one<br/>two<br>three]').nodes[0].rows.map((r: any) => r.text), ['one', 'two', 'three'])
  assert.equal(P('flowchart TD\nA{ok?}').nodes[0].role, 'decision')
})
test('A5.errors: malformed node; ZWJ label', () => {
  assert.match(P('flowchart TD\nA[open --> B').reason, /^syntax:2/)
  assert.equal(P('flowchart TD\nA[👨‍👩]').reason, 'unsupported-char U+200D')
})

// The node a parse should give: one row per label line, centered, in the node's role.
const N = (id: string, shape: string, role: string, order: number, ...lines: string[]) =>
  ({ id, shape, role, order, rows: lines.map(text => ({ text, role, align: 'center' })) })
// The graph a node-only flowchart with no frontmatter title should give.
const G = (dir: string, ...nodes: object[]) => ({ dir, title: null, nodes, edges: [], clusters: [] })

// One node-only input per row of the diagram matrix's flowchart tables that T13 can parse; rows with links wait for T14.
test('A1: matrix rows flowchart-ok-01…22 and -49 parse to their graphs', () => {
  const rows: [string, string, object][] = [
    ['flowchart-ok-01', 'flowchart TD\nA[Start]', G('TB', N('A', 'rect', 'node', 0, 'Start'))],
    ['flowchart-ok-02', 'flowchart TB\nA[Start]', G('TB', N('A', 'rect', 'node', 0, 'Start'))],
    ['flowchart-ok-03', 'flowchart BT\nA[Start]', G('BT', N('A', 'rect', 'node', 0, 'Start'))],
    ['flowchart-ok-04', 'flowchart LR\nA[Start]', G('LR', N('A', 'rect', 'node', 0, 'Start'))],
    ['flowchart-ok-05', 'flowchart RL\nA[Start]', G('RL', N('A', 'rect', 'node', 0, 'Start'))],
    ['flowchart-ok-06', 'graph TD\nA[Start]', G('TB', N('A', 'rect', 'node', 0, 'Start'))],
    ['flowchart-ok-07', 'flowchart TD\nA[Rectangle]', G('TB', N('A', 'rect', 'node', 0, 'Rectangle'))],
    ['flowchart-ok-08', 'flowchart TD\nA(Round)', G('TB', N('A', 'round', 'node', 0, 'Round'))],
    ['flowchart-ok-09', 'flowchart TD\nA([Stadium])', G('TB', N('A', 'stadium', 'node', 0, 'Stadium'))],
    ['flowchart-ok-10', 'flowchart TD\nA[[Subroutine]]', G('TB', N('A', 'subroutine', 'node', 0, 'Subroutine'))],
    ['flowchart-ok-11', 'flowchart TD\nA[(Database)]', G('TB', N('A', 'cylinder', 'node', 0, 'Database'))],
    ['flowchart-ok-12', 'flowchart TD\nA((Circle))', G('TB', N('A', 'circle', 'node', 0, 'Circle'))],
    ['flowchart-ok-13', 'flowchart TD\nA{Rhombus}', G('TB', N('A', 'diamond', 'decision', 0, 'Rhombus'))],
    ['flowchart-ok-14', 'flowchart TD\nA{{Hexagon}}', G('TB', N('A', 'hexagon', 'node', 0, 'Hexagon'))],
    ['flowchart-ok-15', 'flowchart TD\nA[/Read input/]\nB[\\Write output\\]', G('TB', N('A', 'leanR', 'node', 0, 'Read input'), N('B', 'leanL', 'node', 1, 'Write output'))],
    ['flowchart-ok-16', 'flowchart TD\nA[/Priority\\]\nB[\\Manual/]', G('TB', N('A', 'trap', 'node', 0, 'Priority'), N('B', 'trapInv', 'node', 1, 'Manual'))],
    ['flowchart-ok-17', 'flowchart TD\nA>Flag]', G('TB', N('A', 'asym', 'node', 0, 'Flag'))],
    ['flowchart-ok-18', 'flowchart TD\nA(((Stop)))', G('TB', N('A', 'dcircle', 'node', 0, 'Stop'))],
    ['flowchart-ok-19', 'flowchart TD\nA@{ shape: hex }', G('TB', N('A', 'hexagon', 'node', 0, 'A'))],
    ['flowchart-ok-20', 'flowchart TD\nA@{ shape: zzz }', G('TB', N('A', 'rect', 'node', 0, 'A'))],
    ['flowchart-ok-21', 'flowchart TD\nA["Total: $5, (net) [ok]!"]', G('TB', N('A', 'rect', 'node', 0, 'Total: $5, (net) [ok]!'))],
    ['flowchart-ok-22', 'flowchart TD\nA["one<br/>two<br/>three"]', G('TB', N('A', 'rect', 'node', 0, 'one', 'two', 'three'))],
    ['flowchart-ok-49', 'flowchart\nA[Start]', G('TB', N('A', 'rect', 'node', 0, 'Start'))],
  ]
  assert.deepEqual(rows.map(([id, src]) => [id, P(src)]), rows.map(([id, , want]) => [id, want]))
})

test('A5.errors: matrix rows flowchart-reject-01 and -03 fall back', () => {
  assert.deepEqual(P('flowchart TD\nA[open --> B'), { reason: 'syntax:2' }, 'flowchart-reject-01')
  assert.deepEqual(P('flowchart TD\nA["Family \u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}"]'), { reason: 'unsupported-char U+200D' }, 'flowchart-reject-03')
})

test('A1: an opener takes the first of its own closers outside "…"', () => {
  assert.deepEqual(P('flowchart TD\nA[/a/b\\]\nB[\\a\\b/]\nC[/a\\b/]\nD("x) y]")\nE{"}"}').nodes, [N('A', 'trap', 'node', 0, 'a/b'),
    N('B', 'trapInv', 'node', 1, 'a\\b'), N('C', 'leanR', 'node', 2, 'a\\b'), N('D', 'round', 'node', 3, 'x) y]'), N('E', 'diamond', 'decision', 4, '}')])
})

test('A1: an id joins letters, digits and _ with single . or -, CJK included; a node with no label shows its id', () => {
  assert.deepEqual(P('flowchart TD\nfoo_1.bar-2[x]\n读取[读取配置]\nB').nodes,
    [N('foo_1.bar-2', 'rect', 'node', 0, 'x'), N('读取', 'rect', 'node', 1, '读取配置'), N('B', 'rect', 'node', 2, 'B')])
})

test('A5.errors: a header other than flowchart or graph, alone or with TD, TB, BT, LR or RL, falls back as header', () => {
  const bad = ['flowchart XY', 'flowchart td', 'Flowchart TD', 'flowcharts TD', 'flowchart-elk TD', 'graph TDX', 'graphTD', 'flowchart TD LR', 'graph LR; A']
  assert.deepEqual(bad.map(h => [h, P(`${h}\nA`)]), bad.map(h => [h, { reason: 'header' }]))
})

test('A5.errors: text left on a statement after its node fails syntax:<n>, n the source line', () => {
  const bad = ['A[x]]', 'A(x))', 'A{x}}', 'A[x] y', 'A [x]', 'A-', 'A.', 'A@{ shape: cyl', 'A@{ shape: cyl }}']
  assert.deepEqual(bad.map(s => [s, P(`flowchart TD\n${s}`)]), bad.map(s => [s, { reason: 'syntax:2' }]))
  assert.deepEqual(P('---\ntitle: T\n---\nflowchart TD\n\nA[a]\n%% note\nB[x] y'), { reason: 'syntax:8' })
})

test('A1: ; ends a statement only outside "…"; each statement keeps its source line', () => {
  assert.deepEqual(P('flowchart TD\nA["x;y"]; B;;C;').nodes, [N('A', 'rect', 'node', 0, 'x;y'), N('B', 'rect', 'node', 1, 'B'), N('C', 'rect', 'node', 2, 'C')])
  assert.deepEqual(P('flowchart TD\nA\nB; C; D; E[x] y; F'), { reason: 'syntax:3' })
})

test('A1: nodes keep first-mention order; a later label or shape wins, a bare mention changes neither, and role follows the last shape', () => {
  assert.deepEqual(P('flowchart TD\nA\nB\nC{c}\nA[a]\nB{b}\nA(z)\nC[c2]\nA\nB').nodes,
    [N('A', 'round', 'node', 0, 'z'), N('B', 'diamond', 'decision', 1, 'b'), N('C', 'rect', 'node', 2, 'c2')])
})

test('A1: a label is trimmed, as Mermaid trims node text', () => {
  assert.deepEqual(P('flowchart TD\nA[ x ]\nB{ ok? }').nodes, [N('A', 'rect', 'node', 0, 'x'), N('B', 'diamond', 'decision', 1, 'ok?')])
})

test('A1: @{…} reads shape through ALIASES and label, ignores other keys, and splits pairs outside "…"', () => {
  assert.deepEqual(P('flowchart TD\nA@{ shape: db, label: "Store" }').nodes, [N('A', 'cylinder', 'node', 0, 'Store')])
  assert.deepEqual(P('flowchart TD\nA@{ icon: "x, label: no", label: "a, b: {c}", shape: question }').nodes, [N('A', 'diamond', 'decision', 0, 'a, b: {c}')])
  for (const [name, shape] of ALIASES) assert.equal(P(`flowchart TD\nA@{ shape: ${name} }`).nodes[0].shape, shape, name)
})

test('A1: a later @{…} replaces only the shape or label it gives', () => {
  assert.deepEqual(P('flowchart TD\nA{x}\nB[b]\nA@{ label: "y" }\nB@{ shape: dbl-circ }').nodes,
    [N('A', 'diamond', 'decision', 0, 'y'), N('B', 'dcircle', 'node', 1, 'b')])
})

test('A1: an @{…} value loses one pair of matching double or single quotes, as YAML reads it; a plain value keeps its apostrophes', () => {
  const src = ['A@{ shape: "cyl" }', "B@{ shape: 'diam' }", "C@{ label: 'a, b' }", 'D@{ label: x }',
    'E@{   shape :  "cyl"  ,   label :  "x"   }', `F@{ label: "'x'" }`, `G@{ label: '"x"' }`, "H@{ label: it's ok }"]
  assert.deepEqual(P(`flowchart TD\n${src.join('\n')}`).nodes, [N('A', 'cylinder', 'node', 0, 'A'), N('B', 'diamond', 'decision', 1, 'B'),
    N('C', 'rect', 'node', 2, 'a, b'), N('D', 'rect', 'node', 3, 'x'), N('E', 'cylinder', 'node', 4, 'x'), N('F', 'rect', 'node', 5, "'x'"),
    N('G', 'rect', 'node', 6, '"x"'), N('H', 'rect', 'node', 7, "it's ok")])
})

test('A5.errors: an @{…} label is checked like a bracket label', () => {
  assert.deepEqual(P('flowchart TD\nA@{ shape: cyl, label: "a\u{200D}b" }'), { reason: 'unsupported-char U+200D' })
})

test('A5.errors: a "`…`" markdown string falls back as markdown-string; a backquote elsewhere is text', () => {
  const md = ['A["`**bold**`"]', 'A("`a b`")', 'A@{ label: "`b`" }', "A@{ label: '`b`' }"]
  assert.deepEqual(md.map(s => [s, P(`flowchart TD\n${s}`)]), md.map(s => [s, { reason: 'markdown-string' }]))
  assert.deepEqual(P('flowchart TD\nA[`x`]\nB["x `y`"]').nodes, [N('A', 'rect', 'node', 0, '`x`'), N('B', 'rect', 'node', 1, 'x `y`')])
})

test('A5.errors: a #…; entity falls back as entity; # and ; apart are text', () => {
  const ent = ['A["#quot;"]', 'A["a #35; b"]', 'A@{ label: "#9829;" }']
  assert.deepEqual(ent.map(s => [s, P(`flowchart TD\n${s}`)]), ent.map(s => [s, { reason: 'entity' }]))
  assert.deepEqual(P('flowchart TD\nA["C# 1; # x;"]').nodes, [N('A', 'rect', 'node', 0, 'C# 1; # x;')])
})

test('A1: Graph.title is the frontmatter title', () => {
  assert.deepEqual(P('---\ntitle: Order flow\n---\nflowchart LR\nA'), { dir: 'LR', title: 'Order flow', nodes: [N('A', 'rect', 'node', 0, 'A')], edges: [], clusters: [] })
})

// QA findings on @{…}: a quoted value's ; and }, an ignored key's value, and text left in the body.
test('A1: a quoted @{…} value is one value: its ; , and } are text, in single quotes as in double', () => {
  assert.deepEqual(P("flowchart TD\nA@{ label: 'x};B@{label:y' }").nodes, [N('A', 'rect', 'node', 0, 'x};B@{label:y')])
  assert.deepEqual(P(`flowchart TD\nA@{ label: 'a;b}', shape: cyl, }; B@{ label: "c;d" }`).nodes,
    [N('A', 'cylinder', 'node', 0, 'a;b}'), N('B', 'rect', 'node', 1, 'c;d')])
})

test('A1: an ignored @{…} key is read like any other, so pairs inside its quoted value are text', () => {
  assert.deepEqual(P('flowchart TD\nA@{ ignored-key: "x, shape: diam, y" }').nodes, [N('A', 'rect', 'node', 0, 'A')])
})

test('A1: outside @{…} only "…" quotes, so an apostrophe is text and ; still ends the statement', () => {
  assert.deepEqual(P("flowchart TD\nA[it's]; B[x]").nodes, [N('A', 'rect', 'node', 0, "it's"), N('B', 'rect', 'node', 1, 'x')])
})

test('A5.errors: an @{…} body that does not read whole as key: value pairs, each key once, fails syntax:<n>; so does one split over lines', () => {
  const bad = ['A@{ label: "x" label: "y" }', 'A@{ label: "x", label: "y" }', 'A@{ shape }', 'A@{ , shape: cyl }',
    'A@{ shape: cyl,, label: x }', "A@{ label: 'x }", 'A@{ label: {x} }', 'A@{ shape: cyl,\n  label: "x" }', 'A@{\n  shape: cyl\n}']
  assert.deepEqual(bad.map(s => [s, P(`flowchart TD\n${s}`)]), bad.map(s => [s, { reason: 'syntax:2' }]))
})
