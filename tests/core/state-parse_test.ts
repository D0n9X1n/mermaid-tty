import test from 'node:test'
import assert from 'node:assert/strict'
import { parseState } from '../../core/diagrams/state/parse.ts'
import { readSource } from '../../core/source.ts'
const P = (body: string) => {
  const s = readSource(`stateDiagram-v2\n${body}`)
  return ('reason' in s ? s : parseState(s)) as any
}
test('A5: states, descriptions, transitions, marks, a composite and a note make one graph', () => {
  const m = P(
    [
      '[*] --> s1',
      's1 : First state',
      'state "Second" as s2',
      's1 --> s2 : go',
      's2 --> C',
      'state C {',
      '  [*] --> c1',
      '  c1 --> [*]',
      '}',
      'state ch <<choice>>',
      's2 --> ch',
      'ch --> [*]',
      'note left of s1 : remember',
    ].join('\n'),
  )
  const g = m.graph
  assert.deepEqual(
    g.nodes.map((n: any) => [n.id, n.mark ?? n.rows[0].text]),
    [
      ['start:root', 'start'],
      ['s1', 'First state'],
      ['s2', 'Second'],
      ['start:C', 'start'],
      ['c1', 'c1'],
      ['end:C', 'end'],
      ['ch', 'choice'],
      ['end:root', 'end'],
    ],
  )
  assert.deepEqual(
    g.edges.map((e: any) => [e.from, e.to, e.label]),
    [
      ['start:root', 's1', null],
      ['s1', 's2', 'go'],
      ['s2', 'C', null],
      ['start:C', 'c1', null],
      ['c1', 'end:C', null],
      ['s2', 'ch', null],
      ['ch', 'end:root', null],
    ],
  )
  assert.deepEqual(g.clusters, [{ id: 'C', title: 'C', dir: null, nodes: ['start:C', 'c1', 'end:C'], clusters: [] }])
  assert.deepEqual(g.nodes[1].note, { id: 's1:note', text: 'remember', side: 'left' })
  assert.equal(g.nodes[1].shape, 'round')
})
test('A5: regions are frameless clusters chained in order; direction; a multi-line note; ignored lines', () => {
  const g = P(
    [
      'direction LR',
      'state A {',
      '  [*] --> a1',
      '  --',
      '  [*] --> a2',
      '}',
      'state f <<fork>>',
      'state j [[join]]',
      'A --> f',
      'f --> j',
      'note right of a1',
      '  line one',
      '  line two',
      'end note',
      'hide empty description',
      'scale 350 width',
      'classDef bad fill:#f00',
      'click a1 href "x"',
    ].join('\n'),
  ).graph
  assert.equal(g.dir, 'LR')
  assert.deepEqual(
    g.clusters.map((c: any) => [c.id, c.nodes, c.clusters, c.frameless ?? false]),
    [
      ['A', [], ['A:r0', 'A:r1'], false],
      ['A:r0', ['start:A:r0', 'a1'], [], true],
      ['A:r1', ['start:A:r1', 'a2'], [], true],
    ],
  )
  assert.deepEqual(
    g.edges.filter((e: any) => e.style === 'invisible').map((e: any) => [e.from, e.to]),
    [['A:r0', 'A:r1']],
  )
  assert.deepEqual(
    g.nodes.filter((n: any) => n.mark === 'bar').map((n: any) => [n.id, n.span]),
    [
      ['f', 3],
      ['j', 3],
    ],
  )
  assert.equal(g.nodes.find((n: any) => n.id === 'a1').note.text, 'line one<br>line two')
})
test('A5.errors: unsupported, malformed and repeated statements fall back with their line', () => {
  for (const [body, why] of [
    ['s1 --> s2\nstate s9', 'syntax:3'],
    ['state Two Words {\n}', 'syntax:2'],
    ['state A {\ns1 --> s2', 'syntax:2'],
    ['s1 : one\ns1 : two', 'repeat:3'],
    ['note left of s1 : a\nnote right of s1 : b', 'repeat:3'],
    ['state A {\nx --> y\n}\nstate B {\nx --> z\n}', 'scope:6'],
    ['note "floating" as N', 'syntax:2'],
    ['state c <<choice>>\nc : label', 'mark-label:3'],
  ] as const) {
    assert.deepEqual(P(body), { reason: why }, body)
  }
})

// Beyond the plan's three: each rule's edges.
test("A5: a direction sets its own scope (root, composite or region); a nested composite is its parent scope's member cluster", () => {
  const g = P(
    [
      'state A {',
      '  direction LR',
      '  state B {',
      '    [*] --> b1',
      '  }',
      '  --',
      '  direction RL',
      '  [*] --> a2',
      '}',
      'state C {',
      '  direction TB',
      '  [*] --> c1',
      '}',
      'direction BT',
    ].join('\n'),
  ).graph
  assert.equal(g.dir, 'BT')
  assert.deepEqual(
    g.clusters.map((c: any) => [c.id, c.dir, c.nodes, c.clusters]),
    [
      ['A', null, [], ['A:r0', 'A:r1']],
      ['A:r0', 'LR', [], ['B']],
      ['B', null, ['start:B', 'b1'], []],
      ['A:r1', 'RL', ['start:A:r1', 'a2'], []],
      ['C', 'TB', ['start:C', 'c1'], []],
    ],
  )
})
test('A5.errors: a region divider outside a composite falls back', () =>
  assert.deepEqual(P('a --> b\n--'), { reason: 'syntax:3' }))
test('A5: a composite is titled by state "…" as id {, a state "…" as id line or an id : description line, once', () => {
  const title = (body: string) => P(body).graph.clusters[0].title
  assert.equal(title('state "Big one" as A {\n[*] --> a\n}'), 'Big one')
  assert.equal(title('A : Big one\nstate A {\n[*] --> a\n}'), 'Big one')
  assert.equal(title('state A {\n[*] --> a\n}\nstate "Big one" as A'), 'Big one')
  assert.deepEqual(P('state "One" as A {\n}\nA : Two'), { reason: 'repeat:4' })
})
test('A5.errors: drawn text falls back on a #…; entity, an unsupported character or a blank line; a lone # is ordinary text', () => {
  for (const [body, why] of [
    ['s1 : #9829;', 'entity'],
    ['state "a #amp; b" as s1', 'entity'],
    ['state "#9829;" as A {\n}', 'entity'],
    ['a --> b : #9829;', 'entity'],
    ['note left of s1 : #9829;\ns1 --> s2', 'entity'],
    ['note right of s1\n  #9829;\nend note\ns1 --> s2', 'entity'],
    ['s1 : a‍b', 'unsupported-char U+200D'],
    ['a --> b : x<br><br>y', 'label-blank-line'],
    ['s1 : a<br>', 'label-blank-line'],
  ] as const) {
    assert.deepEqual(P(body), { reason: why }, body)
  }
  const g = P('s1 : a # b\ns1 --> s2 : #1 pick\nnote left of s2 : see #3').graph
  assert.deepEqual([g.nodes[0].rows[0].text, g.edges[0].label, g.nodes[1].note.text], ['a # b', '#1 pick', 'see #3'])
})
test('A5: a fork or join bar spans max(3, 2·max(in, out) − 1) cells, counted once every transition is read', () => {
  const g = P(
    [
      'state f <<fork>>',
      'state j [[join]]',
      '[*] --> f',
      'f --> a',
      'f --> b',
      'f --> c',
      'a --> j',
      'b --> j',
      'c --> j',
      'j --> [*]',
      'state lone <<fork>>',
    ].join('\n'),
  ).graph
  assert.deepEqual(
    g.nodes.filter((n: any) => n.mark === 'bar').map((n: any) => [n.id, n.span, n.role, n.rows]),
    [
      ['f', 5, 'node', []],
      ['j', 5, 'node', []],
      ['lone', 3, 'node', []],
    ],
  )
})
test('A5: styling and accessibility draw nothing; a bare id declares a state; :::name is dropped; stateDiagram heads one too', () => {
  const g = P(
    [
      'accTitle: Machine',
      'accDescr: What it does',
      'accDescr {',
      '  many lines',
      '}',
      'classDef hot fill:#f00',
      'class s1 hot',
      'style s1 fill:#0f0',
      's0',
      '[*]:::hot --> s1:::hot : go',
      's1:::hot : Hot',
      'state C {',
      '  classDef cold fill:#00f',
      '  class c1 cold',
      '  style c1 fill:#fff',
      '  c1',
      '}',
    ].join('\n'),
  ).graph
  assert.deepEqual(
    g.nodes.map((n: any) => [n.id, n.rows[0]?.text ?? n.mark]),
    [
      ['s0', 's0'],
      ['start:root', 'start'],
      ['s1', 'Hot'],
      ['c1', 'c1'],
    ],
  )
  assert.deepEqual([g.edges.map((e: any) => e.label), g.clusters.map((c: any) => c.nodes)], [['go'], [['c1']]])
  const m = parseState(readSource('---\ntitle: Machine\n---\nstateDiagram\n[*] --> s1') as any) as any
  assert.deepEqual([m.title, m.graph.title, m.graph.nodes.length], ['Machine', null, 2])
})
test('A5.errors: a keyword in another case or starting a longer word, a bad header, or a line Mermaid reads as a direction falls back', () => {
  for (const [body, why] of [
    ['Note left of s1 : x', 'syntax:2'],
    ['STATE x {\n}', 'syntax:2'],
    ['stated', 'syntax:2'],
    ['state', 'syntax:2'],
    ['notes --> x', 'syntax:2'],
    ['Direction LR', 'syntax:2'],
    ['direction lr', 'syntax:2'],
    ['direction TD', 'syntax:2'],
    ['s1 : turn direction LR', 'syntax:2'],
    ['a --> b\nnote left of b : go direction LR', 'syntax:3'],
    ['accDescr {\n  text\n} s1 --> s2', 'syntax:4'],
  ] as const) {
    assert.deepEqual(P(body), { reason: why }, body)
  }
  assert.deepEqual(parseState(readSource('stateDiagram-v3\na') as any), { reason: 'header' })
})
test('A5.errors: root-only lines in a body, an empty region, a late or repeated mark, a note on no state, a second body fall back', () => {
  for (const [body, why] of [
    ['state A {\n  hide empty description\n}', 'syntax:3'],
    ['state A {\n  scale 350 width\n}', 'syntax:3'],
    ['state A {\n  click a href "x"\n}', 'syntax:3'],
    ['state A {\n  accTitle: x\n}', 'syntax:3'],
    ['state A {\n  accDescr {\n  x\n  }\n}', 'syntax:3'],
    ['state A {\n  --\n  a\n}', 'syntax:3'],
    ['state A {\n  a\n  --\n}', 'syntax:5'],
    ['state A {\n  a\n  --\n  --\n  b\n}', 'syntax:5'],
    ['a --> c\nstate c <<choice>>', 'syntax:3'],
    ['state c <<choice>>\nstate c <<fork>>', 'syntax:3'],
    ['state A {\n}\nstate A <<choice>>', 'syntax:4'],
    ['state A {\n}\nnote left of A : x', 'syntax:4'],
    ['state A {\n}\nstate A {\n}', 'repeat:4'],
  ] as const) {
    assert.deepEqual(P(body), { reason: why }, body)
  }
})
test('A5.errors: a note or accDescr block with no end, an end note in another form, an empty note or a blank line in one falls back', () => {
  for (const [body, why] of [
    ['s1\nnote left of s1\n  text', 'syntax:3'],
    ['s1\nnote left of s1\n  text\nEnd Note', 'syntax:5'],
    ['s1\nnote left of s1\n  text\nend notes', 'syntax:5'],
    ['s1\nnote left of s1\nend note', 'syntax:3'],
    ['accDescr {\n  text', 'syntax:2'],
    ['s1\nnote left of s1\n  a\n\n  b\nend note', 'label-blank-line'],
    ['state A {\nnote left of a\n  x\n}', 'syntax:3'],
  ] as const) {
    assert.deepEqual(P(body), { reason: why }, body)
  }
  assert.equal(P('s1\nnote left of s1\n\n  a\n\nend note').graph.nodes[0].note.text, 'a')
})
test('A5.errors: an id Mermaid drops or shares, a styling or click line it reads otherwise, and text after : it splits fall back', () => {
  for (const [body, why] of [
    ['[*] --> root', 'syntax:2'],
    ['state root {\n}', 'syntax:2'],
    ['a --> t0', 'id-collision'],
    ['classDef hot\na --> b', 'syntax:2'],
    ['style a\na --> b', 'syntax:2'],
    ['click a call foo()', 'syntax:2'],
    ['s1 : a; b', 'syntax:2'],
    ['s1 : a::b', 'syntax:2'],
    ['s1 : a:', 'syntax:2'],
    ['s1 :: a', 'syntax:2'],
    ['a --> b :', 'syntax:2'],
    ['s1\nnote left of s1 : a: b', 'syntax:3'],
    ['s1\nnote left of s1  : a', 'syntax:3'],
    ['state "" as s1', 'syntax:2'],
    ['state A {\n  ----\n}', 'syntax:3'],
    ['a---->b', 'syntax:2'],
    ['a- --> b', 'syntax:2'],
  ] as const) {
    assert.deepEqual(P(body), { reason: why }, body)
  }
  const g = P('s1 : at 10:30\ns1 --> long-name : a:b\nclick s1 "https://x" "tip"').graph
  assert.deepEqual([g.nodes[0].rows[0].text, g.nodes[1].id, g.edges[0].label], ['at 10:30', 'long-name', 'a:b'])
})
test('A5.errors: a state or composite mentioned in two regions of one composite falls back, as Mermaid moves it to the last', () => {
  for (const [body, why] of [
    ['state C {\na\n--\na --> b\n}', 'scope:5'],
    ['state C {\nb --> a\n--\nc\nnote left of a\n  x\nend note\n}', 'scope:6'],
    ['state C {\nstate B {\n}\n--\nB --> c\n}', 'scope:6'],
  ] as const) {
    assert.deepEqual(P(body), { reason: why }, body)
  }
  assert.deepEqual(
    P('state C {\n[*] --> a\n--\n[*] --> b\n}\nnote left of a : x').graph.nodes.find((n: any) => n.id === 'a').note
      .text,
    'x',
  )
})
test('A5: a note is a mention, in source order: its first mention declares a plain state in its scope', () => {
  for (const [body, why] of [
    ['note right of a : text\nstate a <<choice>>', 'syntax:3'],
    ['state A {\nnote left of a : x\n}\na --> b', 'scope:5'],
  ] as const) {
    assert.deepEqual(P(body), { reason: why }, body)
  }
  const g = P('note left of s9 : x').graph
  assert.deepEqual(g.nodes, [
    {
      id: 's9',
      shape: 'round',
      role: 'node',
      rows: [{ text: 's9', role: 'node', align: 'center' }],
      order: 0,
      note: { id: 's9:note', text: 'x', side: 'left' },
    },
  ])
})
test('A5.errors: a multi-line note whose first line starts with : falls back at its opener, as Mermaid reads a one-line note there', () => {
  for (const [body, why] of [
    ['a\nnote right of a\n: text\nb\nend note', 'syntax:3'],
    ['a\nnote right of a\n  :text\nend note', 'syntax:3'],
  ] as const) {
    assert.deepEqual(P(body), { reason: why }, body)
  }
  assert.equal(P('a\nnote right of a\n  x : y\nend note').graph.nodes[0].note.text, 'x : y')
})
test('A5: a transition and a region chain are whole edges: solid with an arrow head, or invisible with none', () => {
  assert.deepEqual(P('state C {\n[*] --> a : go\n--\n[*] --> b\n}').graph.edges, [
    {
      id: 't0',
      from: 'start:C:r0',
      to: 'a',
      style: 'solid',
      tail: 'none',
      head: 'arrow',
      label: 'go',
      minlen: 1,
      order: 0,
    },
    {
      id: 'C:chain0',
      from: 'C:r0',
      to: 'C:r1',
      style: 'invisible',
      tail: 'none',
      head: 'none',
      label: null,
      minlen: 1,
      order: 1,
    },
    {
      id: 't1',
      from: 'start:C:r1',
      to: 'b',
      style: 'solid',
      tail: 'none',
      head: 'arrow',
      label: null,
      minlen: 1,
      order: 2,
    },
  ])
})

// As Mermaid 12.2.0 shows them: a description, transition label or note is an HTML label
// each <br> splits; a composite's title draws on its frame, on one line. A ; Mermaid starts a new statement at falls back.
test('A5.errors (X2): text Mermaid shows otherwise in a state field falls back', () => {
  for (const [body, why] of [
    ['state "a<!--c-->b" as A', 'html'],
    ['A : a<i>b</i>', 'html'],
    ['A --> B : a<b>', 'html'],
    ['A\nnote left of A : &lt x', 'entity'],
    ['A\nnote left of A\n  a<b>\nend note', 'html'],
    ['state "First<br>Second" as C {\n  a\n}', 'html'],
    ['state C {\n  a\n}\nC : x<br>y', 'html'],
    ['state "a;b" as A', 'semicolon'],
    ['A\nnote left of A\n  a;b\nend note', 'semicolon'],
  ] as const) {
    assert.deepEqual(P(body), { reason: why }, body)
  }
  const g = P(
    'state "Q&A" as A\nA --> B : a < b\nB : x<br>Q&A\nnote left of A : a < b\nstate "a < b" as C {\n  c\n}',
  ).graph
  assert.deepEqual(
    [
      g.nodes.map((n: any) => n.rows.map((r: any) => r.text).join('|')),
      g.edges[0].label,
      g.nodes[0].note.text,
      g.clusters[0].title,
    ],
    [['Q&A', 'x|Q&A', 'c'], 'a < b', 'a < b', 'a < b'],
  )
})
// X3. Mermaid 12.2.0 gives every state node, note, transition and composite labelType 'markdown': marked renders each, a
// state's id included where it has no description, and createText swaps icons and KaTeX.
test('X3: Markdown the emphasis port cannot match, icons and math in a state text, or a state id shown as its label, fall back', () => {
  for (const [body, why] of [
    ['state "**a **b** c**" as A', 'markdown'],
    ['A --> B : a \\* b', 'markdown'],
    ['A\nnote left of A : *a *b* c*', 'markdown'],
    ['state "_c_" as C {\n  c\n}', 'markdown'],
    ['state __c__ {\n  c\n}', 'markdown'],
    ['A : fa:fa-book', 'icon'],
    ['A --> B : $$x^2$$', 'math'],
  ]) {
    assert.deepEqual(P(body), { reason: why }, body)
  }
  const g = P('state "snake_case" as A\nA --> my_b : a*b\nD : C:\\x').graph
  assert.deepEqual(
    [g.nodes.map((n: any) => n.rows.map((r: any) => r.text).join('|')), g.edges[0].label],
    [['snake_case', 'my_b', 'C:\\x'], 'a*b'],
  )
})

// X3. Mermaid 12.2.0 (JSDOM): a state's description, note and transition label, and a state id shown as its label, show
// <strong> and <em>; a composite's title shows **Comp** x as written, so emphasis there still falls back.
test('X3.emphasis: bold and italic in a state text or a state id shown as its label draw as Mermaid shows them', async () => {
  const { emphasize } = await import('../../core/emphasis.ts')
  const g = P('state "**D** x" as A\nA --> __y__ : __b__ _i_\nnote left of A : **n** _o_').graph
  assert.deepEqual(
    [g.nodes.map((n: any) => n.rows.map((r: any) => r.text).join('|')), g.edges[0].label, g.nodes[0].note.text],
    [[emphasize('**D** x'), emphasize('__y__')], emphasize('__b__ _i_'), emphasize('**n** _o_')],
  )
  assert.deepEqual(P('state "**Comp** x" as C {\n  c\n}'), { reason: 'markdown' })
})

test('X3.emphasis: a state transition label reads each <br> as a newline: a block start after one falls back; a note draws it', async () => {
  const { emphasize } = await import('../../core/emphasis.ts')
  assert.deepEqual(P('A --> B : a<br>- **b**'), { reason: 'markdown' })
  assert.equal(P('A --> B : **a<br>b**').graph.edges[0].label, emphasize('**a<br>b**', true))
  assert.equal(P('A\nnote left of A : a<br>- **b**').graph.nodes[0].note.text, emphasize('a<br>- **b**'))
})
