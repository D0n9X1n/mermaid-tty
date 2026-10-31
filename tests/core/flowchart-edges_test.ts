import test from 'node:test'
import assert from 'node:assert/strict'
import { parseFlowchart } from '../../core/diagrams/flowchart/parse.ts'
import { readSource, type Source } from '../../core/source.ts'
const E = (l: string) => (parseFlowchart(readSource(`flowchart TD\n${l}`) as Source) as any).edges
const k = (e: any) => [e.style, e.tail, e.head, e.label].join(' ')
test('A1: edge kinds, ends and labels', () => {
  for (const [src, want] of [
    ['A-->B', 'solid none arrow '],
    ['A-.->B', 'dotted none arrow '],
    ['A==>B', 'thick none arrow '],
    ['A<-->B', 'solid arrow arrow '],
    ['A--oB', 'solid none circle '],
    ['A--xB', 'solid none cross '],
    ['A---B', 'solid none none '],
    ['A~~~B', 'invisible none none '],
    ['A-->|yes|B', 'solid none arrow yes'],
    ['A-- yes -->B', 'solid none arrow yes'],
    ['A-. maybe .->B', 'dotted none arrow maybe'],
    ['A== big ==>B', 'thick none arrow big'],
  ] as const) {
    assert.equal(k(E(src)[0]), want, src)
  }
})
test('A1: chains, & fan-out and fan-in, minlen, edge IDs', () => {
  assert.deepEqual(
    E('A --> B --> C').map((e: any) => e.from + e.to),
    ['AB', 'BC'],
  )
  assert.deepEqual(
    E('A & B --> C & D').map((e: any) => e.from + e.to),
    ['AC', 'AD', 'BC', 'BD'],
  )
  assert.equal(E('A ----> B')[0].minlen, 3)
  assert.equal(E('A e1@--> B')[0].id, 'e1')
})

const P = (t: string) => parseFlowchart(readSource(t) as Source) as any
// The node a parse should give: one row per label line, centered, in the node's role.
const N = (id: string, shape: string, role: string, order: number, ...lines: string[]) => ({
  id,
  shape,
  role,
  order,
  rows: lines.map((text) => ({ text, role, align: 'center' })),
})
// The edge a parse should give: a solid arrow with no label, minlen 1 and its pair's first default id, but for what o
// gives.
const L = (from: string, to: string, order: number, o: object = {}) => ({
  id: `L_${from}_${to}_0`,
  from,
  to,
  style: 'solid',
  tail: 'none',
  head: 'arrow',
  label: null,
  minlen: 1,
  order,
  ...o,
})
// The graph a flowchart TD with no frontmatter title should give.
const G = (nodes: object[], edges: object[]) => ({ dir: 'TB', title: null, nodes, edges, clusters: [] })
const ends = (l: string) => E(l).map((e: any) => e.from + e.to)

// One input per supported flowchart link form, with the graph it should parse to.
test('A1: matrix rows flowchart-ok-23…33, -46 and -47 parse to their graphs', () => {
  const [a, b, c, d] = ['A', 'B', 'C', 'D'].map((id, i) => N(id, 'rect', 'node', i, id))
  assert.deepEqual(
    P('flowchart TD\nA[Start] --> B[End]'),
    G([N('A', 'rect', 'node', 0, 'Start'), N('B', 'rect', 'node', 1, 'End')], [L('A', 'B', 0)]),
    'flowchart-ok-23',
  )
  assert.deepEqual(P('flowchart TD\nA -.-> B'), G([a!, b!], [L('A', 'B', 0, { style: 'dotted' })]), 'flowchart-ok-24')
  assert.deepEqual(P('flowchart TD\nA ==> B'), G([a!, b!], [L('A', 'B', 0, { style: 'thick' })]), 'flowchart-ok-25')
  assert.deepEqual(P('flowchart TD\nA <--> B'), G([a!, b!], [L('A', 'B', 0, { tail: 'arrow' })]), 'flowchart-ok-26')
  assert.deepEqual(P('flowchart TD\nA --o B'), G([a!, b!], [L('A', 'B', 0, { head: 'circle' })]), 'flowchart-ok-27')
  assert.deepEqual(P('flowchart TD\nA --x B'), G([a!, b!], [L('A', 'B', 0, { head: 'cross' })]), 'flowchart-ok-28')
  assert.deepEqual(P('flowchart TD\nA --- B'), G([a!, b!], [L('A', 'B', 0, { head: 'none' })]), 'flowchart-ok-29')
  assert.deepEqual(P('flowchart TD\nA -->|x| B'), G([a!, b!], [L('A', 'B', 0, { label: 'x' })]), 'flowchart-ok-30')
  assert.deepEqual(P('flowchart TD\nA -- x --> B'), G([a!, b!], [L('A', 'B', 0, { label: 'x' })]), 'flowchart-ok-31')
  assert.deepEqual(
    P('flowchart TD\nA --> B --> C'),
    G([a!, b!, c!], [L('A', 'B', 0), L('B', 'C', 1)]),
    'flowchart-ok-32',
  )
  assert.deepEqual(
    P('flowchart TD\nA --> B & C\nB & C --> D'),
    G([a!, b!, c!, d!], [L('A', 'B', 0), L('A', 'C', 1), L('B', 'D', 2), L('C', 'D', 3)]),
    'flowchart-ok-33',
  )
  assert.deepEqual(
    P('flowchart TD\nA ~~~ B'),
    G([a!, b!], [L('A', 'B', 0, { style: 'invisible', head: 'none' })]),
    'flowchart-ok-46',
  )
  // Only the edges: what the e1@{…} line does, an ignored directive, flowchart-subgraph_test.ts covers; here it must
  // not fail the parse.
  assert.deepEqual(
    P('flowchart TD\nA e1@--> B\ne1@{ animate: true }').edges,
    [L('A', 'B', 0, { id: 'e1' })],
    'flowchart-ok-47',
  )
})

test('A1: a tail mark draws the tail end, as in o--o, x--x, <==> and <-.->', () => {
  for (const [src, want] of [
    ['A o--o B', 'solid circle circle '],
    ['A x--x B', 'solid cross cross '],
    ['A <==> B', 'thick arrow arrow '],
    ['A <-.-> B', 'dotted arrow arrow '],
  ] as const) {
    assert.equal(k(E(src)[0]), want, src)
  }
})

test('A1: a text form ends in o, x or no mark, as a basic form does', () => {
  for (const [src, want] of [
    ['A-- t --oB', 'solid none circle t'],
    ['A== t ==xB', 'thick none cross t'],
    ['A-. t .-oB', 'dotted none circle t'],
    ['A-- t ---B', 'solid none none t'],
  ] as const) {
    assert.equal(k(E(src)[0]), want, src)
  }
})

test('A1: each link of a chain joins every node of the group before it to every node of the group after it, in source order', () => {
  assert.deepEqual(ends('A --> B & C --> D'), ['AB', 'AC', 'BD', 'CD'])
  assert.deepEqual(ends('A & B --> C --> D & E'), ['AC', 'BC', 'CD', 'CE'])
})

test('A1: minlen is 1 plus the line over its base: -- or == with a head, --- or === without, ~~~, one dot', () => {
  const want = [
    ['-->', 1],
    ['--->', 2],
    ['---', 1],
    ['----', 2],
    ['-.->', 1],
    ['-..->', 2],
    ['==>', 1],
    ['===>', 2],
    ['===', 1],
    ['====', 2],
    ['-.-', 1],
    ['-..-', 2],
    ['~~~', 1],
    ['~~~~', 2],
    ['--o', 1],
    ['---x', 2],
    ['-- t -->', 1],
    ['-- t --->', 2],
    ['-- t ---', 1],
    ['== t ===>', 2],
    ['-. t ..->', 2],
  ] as const
  assert.deepEqual(
    want.map(([l]) => [l, E(`A ${l} B`)[0].minlen]),
    want,
  )
})

test('A1: an edge label is trimmed and loses one enclosing "…", which keeps its punctuation; spaces around |…| are free', () => {
  const src = [
    'A -->|"a, b"| B',
    'A -->|"a|b"| B',
    'A -->| x |B',
    'A --> |x| B',
    'A-->|x|B',
    'A -- "a -- b" --> B',
    'A-- x -->B',
  ]
  assert.deepEqual(
    src.map((s) => E(s)[0].label),
    ['a, b', 'a|b', 'x', 'x', 'x', 'a -- b', 'x'],
  )
})

test('A1: an edge label keeps its <br> as written, for layout to split with labelLines', () => {
  assert.deepEqual(
    ['A -->|one<br/>two| B', 'A -- one<br>two --> B'].map((s) => E(s)[0].label),
    ['one<br/>two', 'one<br>two'],
  )
})

test('A1: a default edge id is L_<from>_<to>_<n>, n as Mermaid counts it: 0 for the first edge of a pair, then the edges so far plus 1', () => {
  assert.deepEqual(
    E('A --> B\nA --> B\nA --> B\nB --> A').map((e: any) => e.id),
    ['L_A_B_0', 'L_A_B_2', 'L_A_B_3', 'L_B_A_0'],
  )
})

test('A1: id@ names the edge from the last node before the link to the first after it; of a & group, that edge alone, so one id is no reuse', () => {
  assert.deepEqual(
    E('A & B e1@--> C & D').map((e: any) => e.id),
    ['L_A_C_0', 'L_A_D_0', 'e1', 'L_B_D_0'],
  )
  assert.deepEqual(
    E('A e1@--> B\nE e2@-- t --> F').map((e: any) => e.id),
    ['e1', 'e2'],
  )
})
test('A5.errors: an explicit edge id already taken fails id-collision, never renamed: reused, an earlier default id, two edges of one group', () => {
  const bad = [
    'A e1@--> B\nC e1@--> D',
    'A --> B\nC L_A_B_0@--> D',
    'A & B L_A_C_0@--> C',
    'A e1@--> B e1@--> C',
    'A & A e1@--> B',
  ]
  assert.deepEqual(
    bad.map((s) => [s, P(`flowchart TD\n${s}`)]),
    bad.map((s) => [s, { reason: 'id-collision' }]),
  )
})

test('A1: order counts edges across the whole diagram, in source order', () => {
  assert.deepEqual(
    E('A --> B; C --> D\nE --> F --> G').map((e: any) => [e.from + e.to, e.order]),
    [
      ['AB', 0],
      ['CD', 1],
      ['EF', 2],
      ['FG', 3],
    ],
  )
})

test('A1: nodes in a chain or an & group keep their shapes and labels, in first-mention order; a group alone draws no edge', () => {
  assert.deepEqual(P('flowchart TD\nA[x] --> B((y)) --> C{z} --> D@{ shape: cyl }').nodes, [
    N('A', 'rect', 'node', 0, 'x'),
    N('B', 'circle', 'node', 1, 'y'),
    N('C', 'diamond', 'decision', 2, 'z'),
    N('D', 'cylinder', 'node', 3, 'D'),
  ])
  assert.deepEqual(
    P('flowchart TD\nA[a] & B(b) --> C\nD & E'),
    G(
      [
        N('A', 'rect', 'node', 0, 'a'),
        N('B', 'round', 'node', 1, 'b'),
        N('C', 'rect', 'node', 2, 'C'),
        N('D', 'rect', 'node', 3, 'D'),
        N('E', 'rect', 'node', 4, 'E'),
      ],
      [L('A', 'C', 0), L('B', 'C', 1)],
    ),
  )
})

test('A5.errors: a link not read whole fails syntax:<n>: a text form with no closer, -- alone, no node after it, a bad &, a second label', () => {
  const bad = [
    'A-- t B',
    'A -- B',
    'A == B',
    'A -. B',
    'A ~~ B',
    'A -->',
    'A --> B -->',
    'A -->|x|',
    'A -->|x B',
    'A & --> B',
    'A &',
    'A&B --> C',
    'A -- a -- b --> B',
    'A == t --> B',
    'A-- t -->|u| B',
    'A --> B C',
  ]
  assert.deepEqual(
    bad.map((s) => [s, P(`flowchart TD\n${s}`)]),
    bad.map((s) => [s, { reason: 'syntax:2' }]),
  )
  assert.deepEqual(P('flowchart TD\nA --> B\n\nC -- D'), { reason: 'syntax:4' })
})

test('A5.errors: an edge label fails as a node label does: markdown, entity, unsupported-char', () => {
  const bad = [
    ['A -->|"`**a **b** c**`"| B', 'markdown'],
    ['A -- "`a \\* b`" --> B', 'markdown'],
    ['A -->|"#nosuch;"| B', 'entity'],
    ['A -->|a\u{200D}b| B', 'unsupported-char U+200D'],
    ['A -. a\u{200D}b .-> B', 'unsupported-char U+200D'],
  ] as const
  assert.deepEqual(
    bad.map(([s]) => [s, P(`flowchart TD\n${s}`)]),
    bad.map(([s, r]) => [s, { reason: r }]),
  )
})

// Mermaid 12.2.0 (flowDb destructEndLink): a tail mark with no partner head draws only the head, and stays part of the
// line:
// it adds 1 to the length, and a thick line no longer starts with =, so it draws solid.
test('A1: a tail mark whose head is not its partner draws only the head, as Mermaid does: <--o, o-->, x--o, <---', () => {
  const want = [
    ['A <--o B', 'solid none circle 2'],
    ['A <==o B', 'solid none circle 2'],
    ['A <--- B', 'solid none none 2'],
    ['A o--> B', 'solid none arrow 2'],
    ['A x-.-o B', 'dotted none circle 1'],
    ['A x==> B', 'solid none arrow 2'],
    ['A <=== B', 'solid none none 2'],
    ['A o==o B', 'thick circle circle 1'],
    ['A e1@o--x B', 'solid none cross 2'],
  ] as const
  assert.deepEqual(
    want.map(([s]) => [s, `${k(E(s)[0])}${E(s)[0].minlen}`]),
    want,
  )
})
// Mermaid's destructLink: a text form's opener mark pairs with its closer's head: <-- t --> is two-headed; a mark that
// does not pair, or a stroke that differs, is INVALID.
test('A1: a text form with a tail mark draws both ends when its closer has the partner head: <-- t -->, x-- t --x, o-- t --o', () => {
  const want = [
    ['A <-- t --> B', 'solid arrow arrow t1'],
    ['A <-. t .-> B', 'dotted arrow arrow t1'],
    ['A <== t ==> B', 'thick arrow arrow t1'],
    ['A x-- t --x B', 'solid cross cross t1'],
    ['A o-- t --o B', 'solid circle circle t1'],
    ['A <-- t ---> B', 'solid arrow arrow t2'],
    ['A -- t <--> B', 'solid arrow arrow t1'],
    ['A -- a<--> B', 'solid arrow arrow a1'],
    ['A -- fo x--> B', 'solid none arrow fo2'],
  ] as const
  assert.deepEqual(
    want.map(([s]) => [s, `${k(E(s)[0])}${E(s)[0].minlen}`]),
    want,
  )
})
test('A5.errors: a text form Mermaid cannot read, or reads INVALID, fails syntax:<n>', () => {
  const bad = [
    'A <-- t --- B',
    'A <-- t --o B',
    'A <-- t <--> B',
    'A x-- t --> B',
    'A <== t x==> B',
    'A == t x==> B',
    'A -. a.b .-> B',
    'A == a=b ==> B',
    'A -- a "b" --> B',
    'A --  --> B',
    'A -- "" --> B',
    'A == "" ==> B',
  ]
  assert.deepEqual(
    bad.map((s) => [s, P(`flowchart TD\n${s}`)]),
    bad.map((s) => [s, { reason: 'syntax:2' }]),
  )
})
test('A1: a tail mark with its partner head draws both ends: <-->, o--o, x--x', () => {
  assert.deepEqual(
    ['A <--> B', 'A o--o B', 'A x--x B', 'A --o B', 'A --x B', 'A --> B'].map((s) => k(E(s)[0])),
    [
      'solid arrow arrow ',
      'solid circle circle ',
      'solid cross cross ',
      'solid none circle ',
      'solid none cross ',
      'solid none arrow ',
    ],
  )
})
test('A1: minlen is capped at 10, as Mermaid caps an edge length', () => {
  const want = [
    ['---------->', 9],
    ['----------->', 10],
    ['------------>', 10],
    ['-------------------->', 10],
    ['-.........->', 9],
    ['-..........->', 10],
    ['-...........->', 10],
    ['=============', 10],
    ['~~~~~~~~~~~~~~', 10],
    ['-- t ------------>', 10],
  ] as const
  assert.deepEqual(
    want.map(([l]) => [l, E(`A ${l} B`)[0].minlen]),
    want,
  )
})

test('A1: an edge label blank once its one enclosing "…" is stripped and it is trimmed is no label: label is null', () => {
  const src = ['A -->|  | B', 'A -->|" "| B', 'A -. " " .-> B', 'A == " " ==> B']
  assert.deepEqual(
    src.map((s) => [s, E(s)[0].label]),
    src.map((s) => [s, null]),
  )
})

// Mermaid 12.2.0 lexes a label as one "…" string first, then text with no ": it shows the two joined and trimmed. Text
// before the string, a space before it, a second string, or an empty string is a parse error.
test('A1: a label that starts with one "…" and goes on unquoted draws as Mermaid joins them: ["a" b] is a b', () => {
  const g = P(
    'flowchart TD\nA["a" b] --> C("c"d) -->|"e" f | D{"g"  h  i}\nC -- "j" k --> D\nsubgraph s ["t" u]\nD\nend',
  )
  assert.deepEqual(
    [g.nodes.map((n: any) => n.rows[0].text), g.edges.map((e: any) => e.label), g.clusters[0].title],
    [['a b', 'cd', 'g  h  i'], [null, 'e f', 'j k'], 't u'],
  )
})
test('A5.errors: a label with a " where Mermaid reads none, a second string, a space before it, or an empty one fails syntax:<n>', () => {
  const bad = [
    'A -->|a "b"| B',
    'A[a "b" c]',
    'A["a" "b"]',
    'A["a "b" c"]',
    'A -->|"a"b"c"| B',
    'A[ "a" ]',
    'A[ "a" b]',
    'A(( "a" ))',
    'A -->| "a" b| B',
    'A -->|""| B',
    'A -->|| B',
    'A[""]',
    'A[]',
    'A -- a "b" --> B',
    'subgraph s [ "a" b]\nend',
  ]
  assert.deepEqual(
    bad.map((s) => [s, P(`flowchart TD\n${s}`)]),
    bad.map((s) => [s, { reason: 'syntax:2' }]),
  )
})
test('A1: a label that one "…" encloses whole still loses those quotes and keeps what they hold', () => {
  const g = P('flowchart TD\nA["a, b: (c)"] -->|"a|b"| B["x [y]"]\nB -- "a -- b" --> C\nsubgraph s ["T: 1, 2"]\nC\nend')
  assert.deepEqual(
    [g.nodes.map((n: any) => n.rows[0].text), g.edges.map((e: any) => e.label), g.clusters[0].title],
    [['a, b: (c)', 'x [y]', 'C'], ['a|b', 'a -- b'], 'T: 1, 2'],
  )
})

// How Mermaid draws a label on ~~~ is unknown, so such a diagram falls back to its source; an unlabelled ~~~ parses
// (-46).
test('A5.errors: a label on an invisible link fails invisible-label; an unlabelled ~~~ still parses', () => {
  for (const s of ['A ~~~|secret| B', 'A ~~~~ |secret| B']) {
    assert.deepEqual(P(`flowchart TD\n${s}`), { reason: 'invisible-label' }, s)
  }

  assert.deepEqual(
    P('flowchart TD\nA ~~~ B').edges.map((e: { style: string }) => e.style),
    ['invisible'],
  )
})
