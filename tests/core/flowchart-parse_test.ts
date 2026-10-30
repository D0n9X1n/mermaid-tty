import test from 'node:test'; import assert from 'node:assert/strict'
import { isFail } from '../../core/fail.ts'
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
    ['A[\\x/]', 'trapInv'], ['A>x]', 'asym'], ['A(((x)))', 'dcircle'], ['A@{ shape: cyl, label: "x" }', 'cylinder'], ['A@{ shape: rect }', 'rect']]
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
    ['flowchart-ok-20', 'flowchart TD\nA@{ shape: rect }', G('TB', N('A', 'rect', 'node', 0, 'A'))],
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
  assert.deepEqual(P('flowchart TD\nA@{ note: "x, label: no", label: "a, b: {c}", shape: question }').nodes, [N('A', 'diamond', 'decision', 0, 'a, b: {c}')])
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

// Mermaid 12.2.0 lexes "`…`" as a Markdown string (labelType markdown): it shows the text without its quotes and backquotes,
// joined to any text after it, through marked. Emphasis or an escape falls back as any Markdown field's does.
test('A1: a "`…`" Markdown string with no emphasis draws its text, as Mermaid shows it', () => {
  const g = P('flowchart TD\nA["`plain text`"] -->|"`edge words`"| B["`a_b x*y`" more]\nC("`a b`") -- "`t`" --> D\nsubgraph s ["`title t`"]\nD\nend')
  assert.deepEqual([g.nodes.map((n: any) => n.rows.map((r: any) => r.text).join('|')), g.edges.map((e: any) => e.label), g.clusters[0].title],
    [['plain text', 'a_b x*y more', 'a b', 'D'], ['edge words', 't'], 'title t'])
  assert.deepEqual(P('flowchart TD\nA["`a<br>b`"]').nodes, [N('A', 'rect', 'node', 0, 'a', 'b')])
})
test('A5.errors: a Markdown string with emphasis or an escape falls back as markdown; a malformed one as syntax; a backquote elsewhere is text', () => {
  const md = ['A["`**bold**`"]', 'A -->|"`**b**`"| B', 'subgraph s ["`*b*`"]\nend', 'A["`a \\* b`"]', 'A -- "`_i_`" --> B']
  assert.deepEqual(md.map(s => [s, P(`flowchart TD\n${s}`)]), md.map(s => [s, { reason: 'markdown' }]))
  const bad = ['A["`a`b`"]', 'A["``"]', 'A["`a` "b"]']
  assert.deepEqual(bad.map(s => [s, P(`flowchart TD\n${s}`)]), bad.map(s => [s, { reason: 'syntax:2' }]))
  const yaml = ['A@{ label: "`b`" }', "A@{ label: '`b`' }"]
  assert.deepEqual(yaml.map(s => [s, P(`flowchart TD\n${s}`)]), yaml.map(s => [s, { reason: 'markdown-string' }]))
  assert.deepEqual(P('flowchart TD\nA[`x`]\nB["x `y`"]').nodes, [N('A', 'rect', 'node', 0, '`x`'), N('B', 'rect', 'node', 1, 'x `y`')])
})

// Mermaid 12.2.0 (encodeEntities, then the browser) shows a #…; code as its character: a decimal code, or a name it knows.
test('A1: a #…; code draws as the character Mermaid shows: a decimal code or a known name; # and ; apart are text', () => {
  const g = P('flowchart TD\nA["#quot;"] -->|#35; x| B[a #9829; #169; #59; b]\nC@{ label: "x #amp; y" }\nsubgraph s [t #lt; u]\nB\nend')
  assert.deepEqual([g.nodes.map((n: any) => n.rows[0].text), g.edges[0].label, g.clusters[0].title], [['"', 'a ♥ © ; b', 'x & y'], '# x', 't < u'])
  assert.deepEqual(P('flowchart TD\nA["C# 1; # x;"]').nodes, [N('A', 'rect', 'node', 0, 'C# 1; # x;')])
})
test('A5.errors: a #…; code Mermaid would not show as one drawable character falls back', () => {
  const bad = [['A["#Hearts;"]', 'entity'], ['A[#nosuch;]', 'entity'], ['A[#0;]', 'entity'], ['A[#160;]', 'entity'], ['A[#1114112;]', 'entity'],
    ['A["#35;35;"]', 'entity'], ['A-->B\nstyle A fill:#f9f;stroke:#333;', 'syntax:3'], ['A[#60;b#62;]', 'html'], ['A[fa#58;fa-user]', 'icon'], ['A-->B\nlinkStyle 0 stroke:#f00;', 'syntax:3']] as const
  assert.deepEqual(bad.map(([s]) => [s, P(`flowchart TD\n${s}`)]), bad.map(([s, r]) => [s, { reason: r }]))
  assert.equal(P('flowchart TD\nA-->B\nclick A href "https://x.y/#a;"').edges.length, 1)
})

// Mermaid 12.2.0 reads an @{ … } body with a line break as a YAML block mapping: key: value lines at one indent, then }.
test('A1: an @{ … } split over lines, one key: value per line at one indent, draws as its one-line form', () => {
  const pairs = [['A@{\n  shape: rounded\n  label: "x y"\n}', 'A@{ shape: rounded, label: "x y" }'],
    ['A@{\n    shape: diamond\n    label: \'q\'\n}\nX --> A', 'A@{ shape: diamond, label: \'q\' }\nX --> A'],
    ['A@{\nshape: cyl\nlabel: Store\n} --> B', 'A@{ shape: cyl, label: Store } --> B']]
  assert.deepEqual(pairs.map(([m]) => P(`flowchart TD\n${m}`)), pairs.map(([, o]) => P(`flowchart TD\n${o}`)))
})
test('A5.errors: an @{ … } over lines falls back where its YAML may read otherwise: an uneven indent, a comma, a tab, a quote over lines', () => {
  const bad = ['A@{\n  shape: rounded\n   label: x\n}', 'A@{\n  label: a, b\n}', 'A@{\n\tshape: cyl\n}', 'A@{\n  label: "x\n  y"\n}',
    'A@{\n  shape: cyl', 'A@{\n  shape: cyl\n} x']
  assert.deepEqual(bad.map(s => isFail(P(`flowchart TD\n${s}`))), bad.map(() => true))
})

// Mermaid 12.2.0 gives an @{ label } labelType markdown (flowDb sanitizeNodeLabelType): A@{ label: "a*b*c" } shows a<em>b</em>c.
test('A5.errors: an @{ label } is a Markdown label: emphasis falls back as markdown, as in other Markdown fields', () => {
  const bad = ['A@{ label: "a*b*c" }', 'A@{ label: "_a_" }', "A@{ label: 'a \\* b' }"]
  assert.deepEqual(bad.map(s => [s, P(`flowchart TD\n${s}`)]), bad.map(s => [s, { reason: 'markdown' }]))
  assert.deepEqual(P('flowchart TD\nA@{ label: "snake_case a*b" }').nodes, [N('A', 'rect', 'node', 0, 'snake_case a*b')])
})

test('A1: Graph.title is the frontmatter title', () => {
  assert.deepEqual(P('---\ntitle: Order flow\n---\nflowchart LR\nA'), { dir: 'LR', title: 'Order flow', nodes: [N('A', 'rect', 'node', 0, 'A')], edges: [], clusters: [] })
})

// QA findings on @{…}: a quoted value's ; and , are text. Mermaid's shape-data lexer protects only "…", so a } in '…'
// ends the body there, and the statement fails.
test('A1: a quoted @{…} value is one value: its ; and , are text; a } is text only in double quotes', () => {
  assert.deepEqual(P(`flowchart TD\nA@{ label: "a;b}", shape: cyl, }; B@{ label: 'c;d' }`).nodes,
    [N('A', 'cylinder', 'node', 0, 'a;b}'), N('B', 'rect', 'node', 1, 'c;d')])
  assert.ok(isFail(P("flowchart TD\nA@{ label: 'x};B@{label:y' }")))
})

test('A1: an ignored @{…} key is read like any other, so pairs inside its quoted value are text', () => {
  assert.deepEqual(P('flowchart TD\nA@{ ignored-key: "x, shape: diam, y" }').nodes, [N('A', 'rect', 'node', 0, 'A')])
})

test('A1: outside @{…} only "…" quotes, so an apostrophe is text and ; still ends the statement', () => {
  assert.deepEqual(P("flowchart TD\nA[it's]; B[x]").nodes, [N('A', 'rect', 'node', 0, "it's"), N('B', 'rect', 'node', 1, 'x')])
})

test('A5.errors: an @{…} body that does not read whole as key: value pairs, each key once, fails syntax:<n>; so does one split mid-line', () => {
  const bad = ['A@{ label: "x" label: "y" }', 'A@{ label: "x", label: "y" }', 'A@{ shape }', 'A@{ , shape: cyl }',
    'A@{ shape: cyl,, label: x }', "A@{ label: 'x }", 'A@{ label: {x} }', 'A@{ shape: cyl,\n  label: "x" }']
  assert.deepEqual(bad.map(s => [s, P(`flowchart TD\n${s}`)]), bad.map(s => [s, { reason: 'syntax:2' }]))
})

// A blank label line, from consecutive <br/> or a <br/> leading or trailing the trimmed label, is a box row with no text,
// and an inline edge label whose middle line the router cannot place. A label blank as a whole is still allowed.
test('A5.errors: a node or edge label with a blank line fails label-blank-line', () => {
  const bad = ['A[a<br/><br/>b]', 'A[<br/>a]', 'A[a<br/>]', 'A[" a<br/> "]', 'A[a<br/> <br>b]', 'A@{ label: "a<br><br>b" }',
    'A -->|a<br/><br/>b| B', 'A -->|<br/>a| B', 'A -- a<br/> --> B', 'A -->|<br/>| B']
  assert.deepEqual(bad.map(s => [s, P(`flowchart TD\n${s}`)]), bad.map(s => [s, { reason: 'label-blank-line' }]))
  for (const s of ['A[a<br/>b]', 'A[ a <br/> b ]', 'A -->|a<br>b| B', 'A[ ]', 'A -->| | B']) assert.ok(!('reason' in P(`flowchart TD\n${s}`)), s)
})
// X3. Mermaid 12.2.0 draws a flowchart node, edge label or subgraph title (labelType 'text') through createText with
// markdown off: marked never runs, so **x** shows as written, but replaceIconSubstring swaps an icon, $$…$$ is KaTeX, and
// nonMarkdownToHTML turns a literal \n into <br />.
test('X3: an icon, a $$…$$ formula or a literal \\n in a flowchart label falls back; Markdown in a plain label draws', () => {
  for (const [s, why] of [['A[fa:fa-book]', 'icon'], ['A["fab:fa-github x"]', 'icon'], ['A -->|fa:fa-car| B', 'icon'], ['A["$$x^2$$"]', 'math'],
    ['A -->|"$$x$$"| B', 'math'], ['subgraph S ["fa:fa-a"]\nA\nend', 'icon'], ['A["a\\nb"]', 'newline'], ['A -->|"a\\nb"| B', 'newline']])
    assert.deepEqual(P(`flowchart TD\n${s}`), { reason: why }, s)
  assert.ok(!('reason' in P('flowchart TD\nA["**bold** snake_case"] -->|_x_| B')))
})

// Cross-family review of 37a8ff2: each repro verified against Mermaid 12.2.0 under JSDOM. Where we would draw other than
// Mermaid shows, we fall back.
const F = (s: string) => P(`flowchart TD\n${s}`)
test('A1: a "`…`" subgraph title takes its text as id, as Mermaid does, so A --> C joins the cluster', () => {
  const g = F('subgraph "`A`"\nB\nend\nA --> C')
  assert.deepEqual([g.clusters.map((c: any) => c.id), g.nodes.map((n: any) => n.id), g.edges.map((e: any) => e.from + e.to)], [['A'], ['B', 'C'], ['AC']])
})
test('A5.errors: a #…; code named like an Object property falls back as entity', () => {
  const bad = ['A[#__proto__;]', 'A[#constructor;]', 'A[#toString;]', 'A[#hasOwnProperty;]']
  assert.deepEqual(bad.map(s => [s, F(s)]), bad.map(s => [s, { reason: 'entity' }]))
})
test('A1: an @{ labelType } of text or string makes the label HTML, as Mermaid does; any other leaves it Markdown', () => {
  assert.deepEqual(F("A@{ labelType: text, label: 'a\\nb' }"), { reason: 'newline' })
  assert.deepEqual(F('A@{ labelType: text, label: "a*b*c" }').nodes, [N('A', 'rect', 'node', 0, 'a*b*c')])
  assert.deepEqual(F('A@{ labelType: markdown, label: "a*b*c" }'), { reason: 'markdown' })
})
test('A5.errors: an @{ … } value YAML types, or one the lexer of Mermaid cuts or rejects, falls back', () => {
  const bad = ['A@{\n  label: false\n}', 'A@{\n  label: null\n}', 'A@{\n  label: 0\n}', 'A@{\n  label: ""\n}', 'A@{\n  label: 1.5\n}',
    'A@{ label: false }', 'A@{ label: True }', 'A@{ label: ~ }', 'A@{ label: 1.5 }', 'A@{ label: "" }', 'A@{ label: [x] }', 'A@{ label: a #b }',
    'A@{ label: &x }', 'A@{ label: "a\\nb" }', "A@{\n  label: 'a}b'\n}", "A@{\n  label: 'a^b'\n}", "A@{ label: 'a}b' }", 'A@{ label: a^b }',
    'A@{ label: x, foo: *y }', 'A@{ icon: "fa:user", label: x }', 'A@{ img: "x.png" }', 'e1@{ animate: *x }\nA e1@--> B']
  assert.deepEqual(bad.map(s => [s, isFail(F(s))]), bad.map(s => [s, true]))
})
test('A5.errors: an @{ that opens inside a quoted label is no metadata, so the label line fails', () => {
  assert.deepEqual(F('A["a@{\n  label: b\n}"]'), { reason: 'syntax:2' })
})
test('A5.errors: unquoted label text with ( ) [ ] { } | or a leading ~~~ fails syntax, as the text token of Mermaid stops there', () => {
  const bad = ['A["a" (b)]', 'A -->|"a" (b)| B', 'A[a (b)]', 'A(a [b])', 'A{{a (b)}}', 'A["a" {b}]', 'A["a" b|c]', 'A -->|a (b)| B',
    'A[~~~ b]', 'A["a" ~~~ b]', 'A -->|~~~ b| B', 'subgraph s [a (b)]\nB\nend']
  assert.deepEqual(bad.map(s => [s, F(s)]), bad.map(s => [s, { reason: 'syntax:2' }]))
  assert.deepEqual([F('A["a" b>c]').nodes[0].rows[0].text, F('A[a ~~~ b]').nodes[0].rows[0].text, F('A -- a (b) --> B').edges[0].label],
    ['a b>c', 'a ~~~ b', 'a (b)'])
})
test('A5.errors: an @{ shape } Mermaid does not know fails syntax, one line or several', () => {
  const bad = ['A@{\n  shape: nope\n}', 'A@{ shape: nope }', 'A@{ shape: Rect }', 'A@{ shape: lean_r }']
  assert.deepEqual(bad.map(s => [s, F(s)]), bad.map(s => [s, { reason: 'syntax:2' }]))
})

// Re-review of cf4faef, each verified against Mermaid 12.2.0 under JSDOM.
test('A5.errors: a subgraph title with a ` that is not one "`…`" pair around it all falls back', () => {
  const bad = ['subgraph "A`"\nB\nend\nA --> C', 'subgraph s ["a`b"]\nB\nend', 'subgraph s [a`b]\nB\nend', 'subgraph "`A` x"\nB\nend']
  assert.deepEqual(bad.map(s => [s, isFail(F(s))]), bad.map(s => [s, true]))
  assert.deepEqual(F('subgraph "`A`"\nB\nend').clusters.map((c: any) => c.id), ['A'])
})
test('A5.errors: an @{ … } pair with no space after its colon falls back: Mermaid reads label:x as one key', () => {
  const bad = ['A@{ label:x }', 'A@{ shape:hex }', 'A@{ labelType:text, label: "a*b" }', 'A@{\n  label:x\n}', 'A@{ label :x }',
    'A e1@--> B\ne1@{ animate:true }']
  assert.deepEqual(bad.map(s => [s, isFail(F(s))]), bad.map(s => [s, true]))
  assert.deepEqual(F('A@{ label : x }').nodes, [N('A', 'rect', 'node', 0, 'x')])
})
test('A5.errors: an @{ … } body with a control character, or a space YAML does not read as one, falls back', () => {
  const bad = ['A@{ label: x }', 'A@{ label : x }', 'A@{ ignored: "a\u0001b", label: x }', 'A@{ label: "a\u007Fb" }',
    'A@{ label: x }', 'A@{　label: x }', 'A@{ label: "a\u0085b" }', 'A@{ label: ﻿x }', 'A@{\n  label: x\n}']
  assert.deepEqual(bad.map(s => [s, isFail(F(s))]), bad.map(s => [s, true]))
  assert.deepEqual(F('A@{\tlabel: x }').nodes, [N('A', 'rect', 'node', 0, 'x')])
})
test('A5.errors: a "}" value does not end the @{ … } character check early', () => {
  const nb = String.fromCharCode(0xa0), c1 = String.fromCharCode(1), ls = String.fromCharCode(0x2028), bom = String.fromCharCode(0xfeff)
  const bad = [`A@{ ignored: "}", label:${nb}x }`, `A@{ ignored: "}${c1}", label: x }`, `A@{\n  ignored: "}"\n  note: "${c1}"\n  label: x\n}`,
    `A e1@--> B\ne1@{ ignored: "}", animate:${ls}true }`, `A@{ ignored: "}", label: ${bom}x }`,
    `A@{${nb}\n  label: x\n}`, `A@{\n  label: x\n${nb}}`, `A@{\n  label: x\n${bom}}`, `${nb}A@{\n  label: x\n}`]
  assert.deepEqual(bad.map(s => [s, isFail(F(s))]), bad.map(s => [s, true]))
  assert.deepEqual(F('A@{ note: "}", label: x }').nodes, [N('A', 'rect', 'node', 0, 'x')])
})
test('A5.errors: an @{ … } key YAML reads as no string, or that repeats as YAML compares keys, falls back', () => {
  const bad = ['A@{ true: x, True: y }', 'A@{ 01: x, 1: y }', 'A e1@--> B\ne1@{ true: x, True: y }', 'A@{ null: x }', 'A@{ ~: x }', 'A@{ 1: x }',
    'A@{ FALSE: x, label: y }']
  assert.deepEqual(bad.map(s => [s, isFail(F(s))]), bad.map(s => [s, true]))
  assert.deepEqual(F('A@{ yes: x, label: y }').nodes, [N('A', 'rect', 'node', 0, 'y')])
})
test('A5.errors: an @{ that ends a line joins the next lines only on a line that is just <id>@{', () => {
  const bad = ['A -- B@{\n  label: x\n  shape: rect\n} --> C', 'A; accTitle: B@{\n  label: x\n}\nC', 'X --> A@{\n  label: x\n}', 'A; B@{\n  label: x\n}']
  assert.deepEqual(bad.map(s => [s, isFail(F(s))]), bad.map(s => [s, true]))
  assert.deepEqual(F('  A@{\n    label: x\n  } --> B').nodes.map((n: any) => n.rows[0].text), ['x', 'B'])
})

// Issue #4: Mermaid 12.2.0's lexer (flow.jison) tries its keyword rules at each token start before an id's own token: the
// id's start, after a leading digit run (NUM), and after each non-ASCII character (UNICODE_TEXT, one table character).
// Verified under JSDOM, at the start, after a link and after &.
test('A5.errors: an id the lexer of Mermaid reads as a keyword, or cannot lex, falls back', () => {
  const bad = ['style --> B', 'style.x --> B', 'A --> end-x', 'A & class.x --> B', 'graph --> B', 'A --> flowchart', 'A --> _self', 'swimlane-beta --> B',
    'styleé --> B', 'interpolate --> B', 'linkStyle.x --> B', 'classDef-x --> B', 'A --> call', 'href --> B', 'A & call --> B', 'A --> call ;',
    '1style --> B', 'éend --> B', 'aéstyle --> B', 'A style.x@--> B', 'A default.x@--> B', 'A end@--> B', 'A --> styleX:::end', 'A:::style',
    'subgraph end\nB\nend', 'subgraph default\nB\nend', 'subgraph interpolate.x\nB\nend', 'subgraph call\nB\nend', 'subgraph 1interpolate\nB\nend',
    'A-->B\nclass A,B end', 'A-->B\nstyle call fill:#f00', 'A-->B\nclassDef end fill:#f00', '𝐀 --> B', '² --> B', '٣ --> B',
    'A 1style@--> B\n1style@{ animate: true }', 'A 𝐀@--> B\n𝐀@{ animate: true }']
  assert.deepEqual(bad.map(s => [s, isFail(F(s))]), bad.map(s => [s, true]))
})
test('A1: an id the lexer of Mermaid reads as itself still draws: styleX, endpoint, default.x, call;, call[x], subgraph style', () => {
  const ok = ['styleX --> B', 'classDefX --> B', 'clickX --> B', 'linkStyleX --> B', 'endX --> B', 'classX --> B', 'endpoint --> B', 'classic --> B',
    'style_x --> B', 'a.style --> B', 'a-end --> B', '1styleX --> B', 'éstyleX --> B', 'default.x --> B', 'v.x --> B', 'accTitle --> B', 'TB --> B',
    'A --> call;', 'call[x] --> B', 'A call.x@--> B', 'A defaultX@--> B', 'A:::default', 'subgraph style\nB\nend', 'subgraph end.x\nB\nend',
    'subgraph end [t]\nB\nend', 'subgraph call[t]\nB\nend', 'A-->B\nstyle styleX fill:#f00', 'A-->B\nclassDef default fill:#f00',
    'A-->B\nclick A call cb()', 'ā --> B', '中文 --> B', 'A e1@--> B\ne1@{ animate: true }']
  assert.deepEqual(ok.map(s => [s, isFail(F(s))]), ok.map(s => [s, false]))
})
