import test from 'node:test'; import assert from 'node:assert/strict'
import { parseFlowchart } from '../../core/diagrams/flowchart/parse.ts'; import { readSource, type Source } from '../../core/source.ts'
import { explain } from '../../core/render.ts'; import { validate } from '../../core/validate.ts'
const P = (t: string) => parseFlowchart(readSource(`flowchart TD\n${t}`) as Source) as any
test('A1: nested, titled subgraphs with direction', () => {
  const g = P('subgraph outer [Outer box]\n  direction LR\n  A --> B\n  subgraph inner\n    C\n  end\nend\nB --> C')
  assert.deepEqual(g.clusters.map((c: any) => [c.id, c.title, c.dir, c.nodes, c.clusters]),
    [['outer', 'Outer box', 'LR', ['A', 'B'], ['inner']], ['inner', 'inner', null, ['C'], []]])
})
test('A1: styling and accessibility directives are parsed and ignored', () => {
  const g = P('A:::hot --> B\nclassDef hot fill:#f00\nclass A hot\nstyle B fill:#0f0\nlinkStyle 0 stroke:#00f\nclick A "https://x"\n' +
    'accTitle: T\naccDescr { multi\nline }\nA e1@--> C\ne1@{ animate: true }')
  assert.deepEqual([g.nodes.map((n: any) => n.id), g.edges.length], [['A', 'B', 'C'], 2])
})
test('A5.errors: subgraph with no end', () => assert.equal(P('subgraph s\nA').reason, 'unclosed-subgraph'))

// Each cluster as [id, title, dir, nodes, clusters], in the order its subgraph opens.
const C = (t: string) => P(t).clusters.map((c: any) => [c.id, c.title, c.dir, c.nodes, c.clusters])
// Asserts that each input's parse fails with its reason.
const assertFails = (bad: (readonly [string, string])[]) => assert.deepEqual(bad.map(([s]) => [s, P(s)]), bad.map(([s, r]) => [s, { reason: r }]))

test('A1: each subgraph form: id; id [title], with or without a space; id ["title"]; "title", also its id', () => {
  assert.deepEqual(C('subgraph a\nA\nend\nsubgraph b [B t]\nB\nend\nsubgraph c[C]\nend\nsubgraph d ["读取: (配置), 写入"]\nend\nsubgraph "E t"\nE\nend'),
    [['a', 'a', null, ['A'], []], ['b', 'B t', null, ['B'], []], ['c', 'C', null, [], []], ['d', '读取: (配置), 写入', null, [], []], ['E t', 'E t', null, ['E'], []]])
})
test('A1: a node belongs to the innermost block that mentions it; of two that do, to the first to close', () => {
  assert.deepEqual(C('subgraph o\nA --> B\nsubgraph i\nB --> C\nend\nend'), [['o', 'o', null, ['A'], ['i']], ['i', 'i', null, ['B', 'C'], []]])
  assert.deepEqual(C('subgraph a\nX\nend\nsubgraph b\nX --> Y\nend\nX --> Z'), [['a', 'a', null, ['X'], []], ['b', 'b', null, ['Y'], []]])
})
test('A1: a node first mentioned outside a subgraph joins the one that mentions it later, and keeps its first-mention order', () => {
  const g = P('A --> B\nsubgraph s\nB\nend')
  assert.deepEqual([g.nodes.map((n: any) => [n.id, n.order]), C('A --> B\nsubgraph s\nB\nend')], [[['A', 0], ['B', 1]], [['s', 's', null, ['B'], []]]])
})
test('A1: direction X in a subgraph sets its dir, TD as TB; the last one wins', () => {
  const src = 'subgraph a\ndirection TD\nend\nsubgraph b\ndirection RL\ndirection BT\nend\nsubgraph c\n  direction  LR ;\nend'
  assert.deepEqual(C(src).map((c: any) => c[2]), ['TB', 'BT', 'LR'])
})
test('A5.errors: direction outside a subgraph, or on a line that holds anything else, fails syntax:<n>', () => {
  assertFails([['direction LR', 'syntax:2'], ['subgraph s\nend\ndirection LR', 'syntax:4'], ['subgraph s\nA; direction LR\nend', 'syntax:3'],
    ['subgraph s\ndirection LR; A\nend', 'syntax:3'], ['subgraph s\nA[go direction LR]\nend', 'syntax:3'], ['subgraph s\ndirection LRX\nend', 'syntax:3']])
})
test('A5.errors: an end with nothing open, a subgraph header in no listed form, and a second subgraph with an id fail syntax:<n>', () => {
  assertFails([['end', 'syntax:2'], ['subgraph s\nend\nend', 'syntax:4'], ['subgraph', 'syntax:2'], ['subgraph a b\nend', 'syntax:2'], ['subgraph a [x] y\nend', 'syntax:2'],
    ['subgraph a [x\nend', 'syntax:2'], ['subgraph a "x"\nend', 'syntax:2'], ['subgraph a []\nend', 'syntax:2'], ['subgraph a [ ]\nend', 'syntax:2'],
    ['subgraph "x" y\nend', 'syntax:2'], ['subgraph a\nend\nsubgraph a\nend', 'syntax:4']])
  assertFails([['subgraph s ["`**a **b** c**`"]\nend', 'markdown'], ['subgraph s ["a #nosuch; b"]\nend', 'entity']])
})
test('A5.errors: a subgraph left open fails unclosed-subgraph, nested or not', () => {
  assertFails([['subgraph a\nsubgraph b\nend', 'unclosed-subgraph'], ['subgraph a\nend\nsubgraph b', 'unclosed-subgraph']])
})
test('A1: a bare node id equal to a cluster id is an edge end on that cluster, before or after its subgraph, and no node', () => {
  const ends = (g: any) => [g.nodes.map((n: any) => [n.id, n.order]), g.edges.map((e: any) => [e.from, e.to]), g.clusters.map((c: any) => c.nodes)]
  assert.deepEqual(ends(P('subgraph s\nX\nend\nA --> s')), [[['X', 0], ['A', 1]], [['A', 's']], [['X']]])
  assert.deepEqual(ends(P('A --> s\nsubgraph s\nX\nend')), [[['A', 0], ['X', 1]], [['A', 's']], [['X']]])
})
test('A5.errors: a cluster id that a node with a shape, a label or an @{…} also has fails syntax:<n>; so does a cluster inside itself', () => {
  assertFails([['s[Box]\nsubgraph s\nend', 'syntax:3'], ['subgraph s\nend\ns((x))', 'syntax:4'], ['subgraph s\nend\ns@{ view: collapsed }', 'syntax:4'],
    ['subgraph s\ns[Box]\nend', 'syntax:3'], ['subgraph a\nsubgraph b\na\nend\nend', 'syntax:6']])
})

// The node a parse should give: one row per label line, centered, in the node's role; Box, a rect labeled with its id.
const N = (id: string, shape: string, role: string, order: number, ...lines: string[]) =>
  ({ id, shape, role, order, rows: lines.map(text => ({ text, role, align: 'center' })) })
const Box = (id: string, order: number) => N(id, 'rect', 'node', order, id)
// The edge a parse should give: a solid arrow with no label, minlen 1 and its pair's first default id, but for what o gives.
const L = (from: string, to: string, order: number, o: object = {}) =>
  ({ id: `L_${from}_${to}_0`, from, to, style: 'solid', tail: 'none', head: 'arrow', label: null, minlen: 1, order, ...o })
// The graph a flowchart TD with no frontmatter title should give, and a cluster in it.
const G = (nodes: object[], edges: object[], clusters: object[] = []) => ({ dir: 'TB', title: null, nodes, edges, clusters })
const K = (id: string, title: string, dir: string | null, nodes: string[], clusters: string[] = []) => ({ id, title, dir, nodes, clusters })

test('A1: classDef, class, style, linkStyle and click statements, and accTitle:, accDescr: and accDescr {…}, draw nothing', () => {
  const src = ['A --> B', 'classDef hot fill:#f00,color:#fff;', 'class A,B hot', 'style B fill:#0f0', 'linkStyle 0 stroke:#00f', 'linkStyle default stroke:#00f',
    'click A "https://x" "tip; here"', 'click B callback', 'accTitle: T; still the title', 'accTitle : T2', 'accDescr: d', 'accDescr{ one }',
    'accDescr {', '  direction LR', '  A --> Z', '}']
  assert.deepEqual(P(src.join('\n')), G([Box('A', 0), Box('B', 1)], [L('A', 'B', 0)]))
})
test('A1: a styling directive in a subgraph names no member of it', () => {
  assert.deepEqual(C('B\nsubgraph s\nA\nstyle B fill:#f00\nclass B hot\nclassDef hot fill:#0f0\nclick B "https://x"\nend'), [['s', 's', null, ['A'], []]])
})
test('A5.errors: an accDescr { block never closed fails syntax:<n>, n its line; after its }, the line reads on as statements', () => {
  assertFails([['A\naccDescr {\nB', 'syntax:3'], ['accDescr { x', 'syntax:2'], ['accDescr { x } y z', 'syntax:2']])
  assert.deepEqual(P('accDescr { x }; A').nodes, [Box('A', 0)])
})
test('A1: a :::name class after a node id or its shape draws nothing', () => {
  assert.deepEqual(P('A:::hot --> B[b]:::cold & C(c):::x-1\nD:::a.b'),
    G([Box('A', 0), N('B', 'rect', 'node', 1, 'b'), N('C', 'round', 'node', 2, 'c'), Box('D', 3)], [L('A', 'B', 0), L('A', 'C', 1)]))
  assertFails([['A:::', 'syntax:2'], ['A:::hot:::cold', 'syntax:2'], ['A::hot', 'syntax:2'], ['A :::hot', 'syntax:2'], ['A@{ shape: cyl }:::hot', 'syntax:2']])
})
test('A1: an id@{…} of a known edge, a default id too, declares no node', () => {
  assert.deepEqual(P('A --> B\nL_A_B_0@{ animate: true }\nA e1@--> C\ne1@{ curve: linear }\nx@{ shape: cyl }\nC --> x'),
    G([Box('A', 0), Box('B', 1), Box('C', 2), N('x', 'cylinder', 'node', 3, 'x')], [L('A', 'B', 0), L('A', 'C', 1, { id: 'e1' }), L('C', 'x', 2)]))
})
test('A5.errors: an edge id, given or default, that a node, a cluster or an earlier edge has fails id-collision, in either order', () => {
  assertFails([['B\nA B@--> C', 'id-collision'], ['A B@--> C\nB', 'id-collision'], ['A e1@--> B\ne1', 'id-collision'], ['A e1@--> B\nC --> e1[x]', 'id-collision'],
    ['A e1@--> B\ne1@{ animate: true } --> C', 'id-collision'], ['e2@{ shape: cyl }\nC e2@--> x', 'id-collision'], ['A --> B\nL_A_B_0', 'id-collision'],
    ['L_A_B_0\nA --> B', 'id-collision'], ['subgraph s\nend\nA s@--> B', 'id-collision'], ['A s@--> B\nsubgraph s\nend', 'id-collision'],
    ['C L_A_B_0@--> D\nA --> B', 'id-collision'], ['A --> B_C\nA_B --> C', 'id-collision']])
  assertFails([['A e1@--> B\ne1@{ animate: true', 'syntax:3']])
})
test('A1: default L_… edge ids differ from each other and from every node id in an ordinary graph', () => {
  const g = P('A --> B\nA --> B\nB --> A\nL_A --> B')
  assert.deepEqual([g.edges.map((e: any) => e.id), g.nodes.map((n: any) => n.id)], [['L_A_B_0', 'L_A_B_2', 'L_B_A_0', 'L_L_A_B_0'], ['A', 'B', 'L_A']])
})

// One input per diagram-matrix row that T15 covers, with the graph it should parse to. W parses a whole fence.
const W = (t: string) => parseFlowchart(readSource(t) as Source) as any
test('A1: matrix rows flowchart-ok-34…39, -47 and -48 parse to their graphs, and common rule 4 directives change nothing', () => {
  const ab = [Box('A', 0), Box('B', 1)], e = [L('A', 'B', 0)]
  assert.deepEqual(P('subgraph outer\n  C\n  subgraph inner\n    A --> B\n  end\nend\nC --> A'), G([Box('C', 0), Box('A', 1), Box('B', 2)],
    [L('A', 'B', 0), L('C', 'A', 1)], [K('outer', 'outer', null, ['C'], ['inner']), K('inner', 'inner', null, ['A', 'B'])]), 'flowchart-ok-34')
  assert.deepEqual(P('subgraph api [Public API]\n  G[Gateway] --> S[Service]\nend'), G([N('G', 'rect', 'node', 0, 'Gateway'),
    N('S', 'rect', 'node', 1, 'Service')], [L('G', 'S', 0)], [K('api', 'Public API', null, ['G', 'S'])]), 'flowchart-ok-35')
  assert.deepEqual(P('subgraph l\n  direction LR\n  A --> B\nend\nsubgraph r\n  direction BT\n  C --> D\nend\nB --> C'),
    G([...ab, Box('C', 2), Box('D', 3)], [L('A', 'B', 0), L('C', 'D', 1), L('B', 'C', 2)],
      [K('l', 'l', 'LR', ['A', 'B']), K('r', 'r', 'BT', ['C', 'D'])]), 'flowchart-ok-36')
  assert.deepEqual(P('%% a comment\nsubgraph s\n  %% inside\n  A --> B\nend'), G(ab, e, [K('s', 's', null, ['A', 'B'])]), 'flowchart-ok-37')
  assert.deepEqual(W('---\ntitle: Orders\n---\nflowchart TD\nA --> B'), { ...G(ab, e), title: 'Orders' }, 'flowchart-ok-38')
  assert.deepEqual(P('A --> B\nclassDef hot fill:#f00\nclass A hot\nstyle B fill:#0f0\nlinkStyle 0 stroke:#00f\nclick A "https://example.com"'),
    G(ab, e), 'flowchart-ok-39')
  assert.deepEqual(P('A e1@--> B\ne1@{ animate: true }'), G(ab, [L('A', 'B', 0, { id: 'e1' })]), 'flowchart-ok-47')
  assert.deepEqual(P('A:::hot --> B:::cold\naccTitle: Flow\naccDescr: Two steps\naccDescr {\n  more\n}'), G(ab, e), 'flowchart-ok-48')
  const body = 'subgraph s\nA:::hot --> B\nend'
  assert.deepEqual(P(`${body}\nclassDef hot fill:#f00\nclass A hot\nstyle B fill:#0f0\nlinkStyle default stroke:#00f\nclick A call cb()\naccTitle: T\naccDescr {\nd\n}`),
    P(body.replace(':::hot', '')), 'common rule 4')
})
test('A5.errors: matrix row flowchart-reject-02, a subgraph with no end, falls back', () => {
  assert.deepEqual(P('subgraph s\n  A --> B'), { reason: 'unclosed-subgraph' }, 'flowchart-reject-02')
})

// An LR chart with two subgraphs. Case 1 (flowchart-reject-06) can reach Data tier only by crossing it more than once
// or not at all, so it falls back at every width. Case 2 draws left to right at 120, each edge crossing a frame once; at 80
// and 60 every step crosses Data tier wrongly or conflicts, so it falls back rather than draw a broken frame.
test('An LR chart with two subgraphs, case 2, draws at 120 columns and falls back at 80 and 60', () => {
  const src = 'flowchart LR\n  User((User)) --> CDN[/CDN/] --> LB{{Load balancer}}\n  subgraph app [App tier]\n    LB --> W1[Web 1] & W2[Web 2]\n  end\n' +
    '  subgraph data [Data tier]\n    Cache[(Redis)]\n    DB[(Postgres)]\n  end\n  W1 --> Cache\n  W2 --> DB\n  W2 -.-> Q>Job queue] --> Worker[[Worker]]\n'
  const wide = explain(src, { columns: 120 })
  assert.ok('drawing' in wide && validate(wide.drawing) === null)
  for (const columns of [60, 80]) assert.ok(!('drawing' in explain(src, { columns })), `${columns}`)
})
