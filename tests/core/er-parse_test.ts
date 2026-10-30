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
    ['CAR {\n  string pk\n}', 'syntax:3'], ['CAR {\n  List~string~ tags\n}', 'syntax:3'], ['CAR {\n  string `id`\n}', 'syntax:3'], ['CAR {\n  string id pk\n}', 'syntax:3'],
    ['`CAR`', 'markdown:2'], ['*CAR*', 'markdown:2'], ['p[_Person_]', 'markdown:2'], ['p["**Person**"]', 'markdown:2'], ['A ||--o{ B : "_owns_"', 'markdown:2'],
    ['A ||--o{ B : *owns*', 'markdown:2'], ['subgraph s [**T**]\nA\nend', 'markdown:2'], ['subgraph s\nA', 'syntax:2'], ['end', 'syntax:2']] as const)
    assert.deepEqual(P(body), { reason: why }, body)
  assert.deepEqual(P('12 ||--|| B : x\nTOTAL').entities.map((e: any) => e.id), ['12', 'B', 'TOTAL'])
})
test('X2: a ~…~ pair in an alias or comment falls back, since erBox shows it as <…>; one ~ draws', () => {
  assert.deepEqual(P('A["List~T~"]'), { reason: 'generic' }); assert.deepEqual(P('A {\n  string id "a~b~c"\n}'), { reason: 'generic' })
  assert.ok(!('reason' in P('A["about ~5"]')))
})
// X3. Mermaid 12.2.0 gives every ER entity, relation and subgraph title labelType 'markdown' (sanitizeNodeLabelType's
// default), and erBox draws each attribute column through createText with markdown on: marked renders all of them, and
// createText swaps icons and KaTeX.
test('X3: Markdown, icons and math in an attribute column or any ER text fall back', () => {
  for (const [body, why] of [['A {\n  string id "**bold**"\n}', 'markdown'], ['A {\n  string id "a\\\\*b"\n}', 'markdown'],
    ['A ||--o{ B : "a\\\\#b"', 'markdown'], ['A {\n  string id "fa:fa-book"\n}', 'icon'], ['A["fa:fa-book"]', 'icon'],
    ['A ||--o{ B : "$$x^2$$"', 'math']] as const) assert.deepEqual(P(body), { reason: why }, body)
  assert.equal(P('A {\n  string id "snake_case a\\nb"\n}').entities[0].attrs[0].comment, 'snake_case a\\nb')
})
