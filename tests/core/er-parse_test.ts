import test from 'node:test'; import assert from 'node:assert/strict'
import { parseEr } from '../../core/diagrams/er/parse.ts'; import { readSource } from '../../core/source.ts'
const P = (body: string) => { const s = readSource(`erDiagram\n${body}`); return ('reason' in s ? s : parseEr(s)) as any }
test('A5: entities, aliases, attribute blocks, cardinalities, word forms and labels', () => {
  const m = P(['CUSTOMER ||--o{ ORDER : places', 'p[Person] {', '  string name PK "the name"', '  int age', '}', 'a["Customer Account"]', 'p {', '  string id UK, FK', '}',
    'ORDER }|..|{ LINE-ITEM : "is in"', 'p |o--|| a : ""', 'p 1 to zero or more ORDER : owns', 'a many(0) optionally to 0+ ORDER : may', '"NAMED DRIVER"'].join('\n'))
  assert.deepEqual(m.entities.map((e: any) => [e.id, e.label]), [['CUSTOMER', 'CUSTOMER'], ['ORDER', 'ORDER'], ['p', 'Person'], ['a', 'Customer Account'],
    ['LINE-ITEM', 'LINE-ITEM'], ['NAMED DRIVER', 'NAMED DRIVER']])
  assert.deepEqual(m.entities[2].attrs, [{ type: 'string', name: 'name', keys: 'PK', comment: 'the name' }, { type: 'int', name: 'age', keys: '', comment: '' },
    { type: 'string', name: 'id', keys: 'UK, FK', comment: '' }])
  assert.deepEqual(m.relations.map((r: any) => [r.from, r.to, r.left, r.right, r.line, r.label]), [['CUSTOMER', 'ORDER', '1', '0..*', 'solid', 'places'],
    ['ORDER', 'LINE-ITEM', '1..*', '1..*', 'dotted', 'is in'], ['p', 'a', '0..1', '1', 'solid', ''], ['p', 'ORDER', '1', '0..*', 'solid', 'owns'],
    ['a', 'ORDER', '0..*', '0..*', 'dotted', 'may']])
})
test('A5: subgraphs nest, take a direction and a title, and can be relation ends', () => {
  const m = P(['subgraph outer [Sales domain]', '  direction LR', '  CUSTOMER ||--o{ ORDER : places', '  subgraph inner', '    INVOICE', '  end', 'end', 'outer ||--|| BILLING : bills'].join('\n'))
  assert.deepEqual(m.subgraphs, [{ id: 'outer', title: 'Sales domain', dir: 'LR', entities: ['CUSTOMER', 'ORDER'], subgraphs: ['inner'] },
    { id: 'inner', title: null, dir: null, entities: ['INVOICE'], subgraphs: [] }])
  assert.deepEqual([m.relations.at(-1).from, m.relations.at(-1).to], ['outer', 'BILLING'])
})
test('A5.errors: unsupported, malformed and repeated statements fall back with their line', () => {
  for (const [body, why] of [['A ||--|| B : x\nA u--|| B : x', 'syntax:3'], ['A ||--|| B : x\n"This **is** _Markdown_"', 'markdown:3'], ['A ||--o{ B', 'syntax:2'],
    ['CAR {\nstring id', 'syntax:2'], ['p[Person]\np[Human]', 'repeat:3'], ['subgraph s1\nCAR\nend\nsubgraph s2\nCAR\nend', 'repeat:6'],
    ['Sales\nsubgraph Sales\nX\nend', 'repeat:3']] as const) assert.deepEqual(P(body), { reason: why }, body)
  assert.deepEqual(P('A ||--o{ B : x %% note'), { reason: 'directive' })
})

// Beyond the plan's three: the shared rules (matrix, Common rules) as ER reads them.
test('A5.common: entities, unsupported characters and blank label lines fall back; a lone # is text', () => {
  for (const body of ['"I #9829; you"', 'A ||--|| B : "#9829;"', 'p["#9829;"]', 'CAR {\n  string id "x #9829;"\n}', 'subgraph s ["#9829;"]\nA\nend',
    'subgraph "#9829;"\nA\nend']) assert.deepEqual(P(body), { reason: 'entity' }, body)
  const m = P('"C#" ||--|| B : "a # b"\nB {\n  string id "c#"\n}')
  assert.deepEqual([m.entities[0].label, m.relations[0].label, m.entities[1].attrs[0].comment], ['C#', 'a # b', 'c#'])
  assert.deepEqual(P('A ||--|| B : "x\u200Dy"'), { reason: 'unsupported-char U+200D' })
  assert.deepEqual(P('CAR {\n  string id "a\u200Db"\n}'), { reason: 'unsupported-char U+200D' })
  assert.deepEqual(P('A ||--|| B : "a<br><br>b"'), { reason: 'label-blank-line' })
  // An alias and a comment draw on one line, so any <br> there falls back first (X2).
  for (const body of ['p["a<br/><br>b"]', 'CAR {\n  string id "a<br><br>b"\n}']) assert.deepEqual(P(body), { reason: 'html' }, body)
})
test('A5.common: headers and keywords are case-sensitive and whole; styling and accessibility are ignored', () => {
  for (const h of ['erdiagram', 'ERDIAGRAM', 'erDiagrams', 'erDiagram LR']) {
    const s = readSource(`${h}\nA`); assert.deepEqual('reason' in s ? s : parseEr(s), { reason: 'header' }, h)
  }
  for (const body of ['Endpoint', 'subgraphs', 'END', 'Classroom', 'stylesheet', 'Direction LR', 'direction lr', 'directions', 'Subgraph s\nA\nend', 'accTitle',
    'Click A', 'click A call cb()', 'A ||--|| B : "direction LR"']) assert.deepEqual(P(body), { reason: 'syntax:2' }, body)   // Mermaid's ER grammar has no click
  const m = P(['style A fill:#f9f', 'classDef foo fill:#f00;', 'class A foo', 'accTitle: Orders', 'accDescr: All orders', 'accDescr {',
    '  many lines', '}', 'A:::foo ||--|| B:::bar,baz : x', 'C:::foo', 'p[Person]:::foo {', '  int id', '}'].join('\n'))
  assert.deepEqual([m.entities.map((e: any) => e.id), m.relations.length, m.entities[3].attrs.length], [['A', 'B', 'C', 'p'], 1, 1])
  const s = readSource('---\ntitle: Orders\n---\nerDiagram\nA'), t = 'reason' in s ? s : parseEr(s) as any
  assert.deepEqual([t.title, t.dir], ['Orders', 'TB'])
})
test('A5: attribute forms, empty blocks, all four lines, ids, order and keyable texts', () => {
  const m = P(['A ||--o{ B : places', 'A {', '  string? name PK "the name"', '  string(99) code', '  string[] tags ""', '  decimal(10,2) price', '  int *id PK, FK "k"', '}',
    'A { }', 'C {}', 'B ||.-|| C : ""', 'C ||-.|| A : y', 'A ||..|| C : "z w"'].join('\n'))
  assert.deepEqual(m.entities[0].attrs.map((a: any) => [a.type, a.name, a.keys, a.comment]), [['string?', 'name', 'PK', 'the name'], ['string(99)', 'code', '', ''],
    ['string[]', 'tags', '', ''], ['decimal(10,2)', 'price', '', ''], ['int', '*id', 'PK, FK', 'k']])
  assert.deepEqual(m.relations.map((r: any) => [r.id, r.order, r.line]), [['r0', 0, 'solid'], ['r1', 1, 'dotted'], ['r2', 2, 'dotted'], ['r3', 3, 'dotted']])
  assert.deepEqual(m.entities.map((e: any) => [e.id, e.order]), [['A', 0], ['B', 1], ['C', 2]])
  assert.deepEqual(m.keyable, [{ owner: 'r0:label', text: 'places' }, { owner: 'A.a0.comment', text: 'the name' }, { owner: 'A.a4.comment', text: 'k' },
    { owner: 'r2:label', text: 'y' }, { owner: 'r3:label', text: 'z w' }])
  assert.deepEqual(JSON.parse(JSON.stringify(m)), m)
})
test('A5.errors: words Mermaid lexes as something else, attribute keys and Markdown names fall back', () => {
  for (const [body, why] of [['A ||--|| one : x', 'syntax:2'], ['only one to one B : x', 'syntax:2'], ['A ||--|| B : many', 'syntax:2'], ['1 one to one B : x', 'syntax:2'],
    ['2FA', 'syntax:2'], ['A ||--|| B : 3', 'syntax:2'], ['o{', 'syntax:2'], ['u-boat ||--|| B : x', 'syntax:2'], ['A ||--|| B:::1x : y', 'syntax:2'],
    ['A ||--|| accDescr : x', 'syntax:2'], ['subgraph s [zero or more]\nA\nend', 'syntax:2'], ['subgraph " s "\nA\nend', 'syntax:2'], ['p[" Person"]', 'syntax:2'],
    ['CAR {\n  string pk\n}', 'syntax:3'], ['CAR {\n  string `id`\n}', 'syntax:3'], ['CAR {\n  string id pk\n}', 'syntax:3'],
    ['`CAR`', 'markdown:2'], ['*CAR*', 'markdown:2'], ['p[`Person`]', 'markdown:2'], ['p["**a **b** c**"]', 'markdown:2'], ['A ||--o{ B : "a \\\\* b"', 'markdown:2'],
    ['A ||--o{ B : "*a *b* c*"', 'markdown:2'], ['subgraph s [`T`]\nA\nend', 'markdown:2'], ['subgraph s\nA', 'syntax:2'], ['end', 'syntax:2']] as const)
    assert.deepEqual(P(body), { reason: why }, body)
  assert.deepEqual(P('12 ||--|| B : x\nTOTAL').entities.map((e: any) => e.id), ['12', 'B', 'TOTAL'])
})
// Mermaid 12.2.0's erBox draws an entity's label (only when it has attributes; one with none is a plain rect label)
// and each attribute column through addText, which runs parseGenericTypes: each comma piece's ~ pairs become <…> from the
// outside in. A relation label and a subgraph title show ~ as written. Each case below was rendered under JSDOM.
test('~…~ in an ER entity label with attributes and in attribute columns draws as <…>, as erBox shows it', () => {
  const m = P(['A["List~T~"] {', '  List~T~? items PK', '  Map~K,V~ m', '  string x~T~', '  ~T~ t', '  string c "a b~c~"', '  string d "a ~b"', '}',
    'B["x~T~"]', 'A ||--o{ B : "r~T~"', 'subgraph S ["t~T~"]', 'C', 'end'].join('\n'))
  assert.deepEqual(m.entities.map((e: any) => [e.id, e.label]), [['A', 'List<T>'], ['B', 'x~T~'], ['C', 'C']])
  const a = (type: string, name: string, keys = '', comment = '') => ({ type, name, keys, comment })
  assert.deepEqual(m.entities[0].attrs, [a('List<T>?', 'items', 'PK'), a('Map<K,V>', 'm'), a('string', 'x<T>'), a('<T>', 't'),
    a('string', 'c', '', 'a b<c>'), a('string', 'd', '', 'a ~b')])
  assert.deepEqual([m.relations[0].label, m.subgraphs[0].title], ['r~T~', 't~T~'])
  const shown = ['~A~B~~', 'a~b~c~', '~a~b~c', 'a~~b', 'a~b~,~c~', 'a~b,c~d', 'x~a&b~', '~~x~~', 'about ~5']
  assert.deepEqual(shown.map(l => P(`A["${l}"] {\n  s i\n}`).entities[0].label),
    ['<A<B>>', 'a<b~c>', '~a<b>c', 'a<>b', 'a<b>,<c>', 'a<b,c>d', 'x<a&b>', '<<x>>', 'about ~5'])
})
// Mermaid's lexer reads a word holding a ~ through the last ~ on its line as one attribute word, so a ~ in two columns, a
// lone ~ in the type, or a ~ in a comment's first word with another after it is a parse error there; a <br> it would
// show as written falls back.
test('An attribute line Mermaid misreads for its ~, or a generic forming <br>, falls back', () => {
  for (const [body, why] of [['A {\n  List~T~ x~U~\n}', 'syntax:3'], ['A {\n  List~T~ id "c~d"\n}', 'syntax:3'], ['A {\n  ~T~ t "a ~b"\n}', 'syntax:3'],
    ['A {\n  List~T~? items PK "a b~c~"\n}', 'syntax:3'],
    ['A {\n  string id "a~b c~"\n}', 'syntax:3'], ['A {\n  string id "a~b~c"\n}', 'syntax:3'], ['A {\n  List~ id\n}', 'syntax:3'],
    ['A["x~br~"] {\n  s i\n}', 'generic'],
    // erBox runs parseGenericTypes before marked: how a ~ pair and bold or italic mix there is unverified.
    ['A["**List~T~**"] {\n  s i\n}', 'generic'], ['A {\n  string id "a **b** ~c~"\n}', 'generic'], ['A ||--o{ B : "**r** ~T~"', 'generic']] as const)
    assert.deepEqual(P(body), { reason: why }, body)
})
// X3. Mermaid 12.2.0 gives every ER entity, relation and subgraph title labelType 'markdown' (sanitizeNodeLabelType's
// default), and erBox draws each attribute column through createText with markdown on: marked renders all of them, and
// createText swaps icons and KaTeX.
test('X3: Markdown the emphasis port cannot match, icons and math in an attribute column or any ER text fall back', () => {
  for (const [body, why] of [['A {\n  string id "**a **b** c**"\n}', 'markdown'], ['A {\n  string __id__ "c"\n}', 'markdown'], ['A {\n  string id "a\\\\*b"\n}', 'markdown'],
    ['A ||--o{ B : "a\\\\#b"', 'markdown'], ['A {\n  string id "fa:fa-book"\n}', 'icon'], ['A["fa:fa-book"]', 'icon'],
    ['A ||--o{ B : "$$x^2$$"', 'math']] as const) assert.deepEqual(P(body), { reason: why }, body)
  assert.equal(P('A {\n  string id "snake_case a\\nb"\n}').entities[0].attrs[0].comment, 'snake_case a\\nb')
})

// X3. Mermaid 12.2.0 (JSDOM): an alias p["**Person** _x_"], a relation label "**places** *x*" (or *owns* unquoted, or one a <br>
// splits), a subgraph title [**T**] and an attribute comment "**c** _d_" show <strong> and <em>. An entity's name is its
// id, so emphasis there still falls back.
test('X3.emphasis: bold and italic in an ER alias, relation label, subgraph title or attribute comment draw as Mermaid shows them', async () => {
  const { emphasize } = await import('../../core/emphasis.ts')
  const m = P('p["**Person** _x_"]\np ||--o{ ORDER : "a<br>**places** *x*"\nA ||--o{ B : *owns*\nsubgraph s [**T**]\nA\nend\nB {\n  string id "**c** _d_"\n}')
  assert.deepEqual([m.entities[0].label, m.relations.map((r: any) => r.label), m.subgraphs[0].title, m.entities.find((e: any) => e.id === 'B').attrs[0].comment],
    [emphasize('**Person** _x_'), [emphasize('a<br>**places** *x*'), emphasize('*owns*')], emphasize('**T**'), emphasize('**c** _d_')])
})

test('X3.emphasis: an ER relation label reads each <br> as a newline: a block start after one falls back, emphasis or not', async () => {
  const { emphasize } = await import('../../core/emphasis.ts')
  assert.deepEqual(P('A ||--o{ B : "a<br>- **b**"'), { reason: 'markdown:2' })
  assert.deepEqual(P('A ||--o{ B : "a<br>==="'), { reason: 'markdown' })
  assert.equal(P('A ||--o{ B : "**a<br>b**"').relations[0].label, emphasize('**a<br>b**', true))
})
