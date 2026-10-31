import test from 'node:test'; import assert from 'node:assert/strict'
import { parseClass } from '../../core/diagrams/class/parse.ts'; import { readSource } from '../../core/source.ts'
const P = (body: string) => { const s = readSource(`classDiagram\n${body}`); return ('reason' in s ? s : parseClass(s)) as any }
test('A5: classes, labels, generics, annotations and members, as Mermaid shows them', () => {
  const m = P(['class Animal', 'class Square~Shape~', '<<interface>> Shape', 'class Duck["Mallard"] {', '  <<service>>', '  +String beakColor', '  +quack(int x) bool$', '}',
    'Duck : -List~List~int~~ eggs', 'Duck : +swim()*', 'class `A b`'].join('\n'))
  assert.deepEqual(m.classes.map((c: any) => [c.id, c.label, c.annot]), [['Animal', 'Animal', null], ['Square', 'Square<Shape>', null],
    ['Shape', 'Shape', 'interface'], ['Duck', 'Mallard', 'service'], ['A b', 'A b', null]])
  assert.deepEqual(m.classes[3].members, [{ text: '+String beakColor', method: false }, { text: '+quack(int x) : bool$', method: true },
    { text: '-List<List<int>> eggs', method: false }, { text: '+swim()*', method: true }])
})
test('A5: relations, cardinality, notes, a namespace and direction', () => {
  const m = P(['Animal <|-- Duck', 'Duck *-- Egg', 'Lake o-- Duck', 'Duck --> Food : eats', 'Duck ..|> Swimmer', 'A "1" --> "*" B : has', 'A <|--|> B', 'A .. B',
    'note "General"', 'note for Duck "can fly<br>and swim"', 'namespace Pond["Water"] {', '  class Frog', '  note for Frog "ribbit"', '}', 'direction RL'].join('\n'))
  assert.deepEqual(m.relations.map((r: any) => [r.from, r.to, r.tail, r.head, r.line, r.label, r.tailLabel, r.headLabel]), [
    ['Animal', 'Duck', 'triangle', 'none', 'solid', null, null, null], ['Duck', 'Egg', 'diamond', 'none', 'solid', null, null, null],
    ['Lake', 'Duck', 'odiamond', 'none', 'solid', null, null, null], ['Duck', 'Food', 'none', 'arrow', 'solid', 'eats', null, null],
    ['Duck', 'Swimmer', 'none', 'triangle', 'dotted', null, null, null], ['A', 'B', 'none', 'arrow', 'solid', 'has', '1', '*'],
    ['A', 'B', 'triangle', 'triangle', 'solid', null, null, null], ['A', 'B', 'none', 'none', 'dotted', null, null, null]])
  assert.deepEqual(m.notes.map((n: any) => [n.id, n.for, n.text]), [['note0', null, 'General'], ['note1', 'Duck', 'can fly<br>and swim'], ['note2', 'Frog', 'ribbit']])
  assert.deepEqual(m.namespaces, [{ id: 'Pond', label: 'Water', classes: ['Frog'], notes: ['note2'] }]); assert.equal(m.dir, 'RL')
})
test('A5: style, classDef, cssClass, :::name, click, link and callback are parsed and ignored', () =>
  assert.deepEqual(P('class A\nstyle A fill:#f9f\nclassDef hot fill:#f00\ncssClass "A" hot\nclass A:::hot\nclick A href "x"\nlink A "x"\ncallback A "cb"')
    .classes.map((c: any) => c.id), ['A']))
test('A5.errors: unsupported, malformed and repeated statements fall back with their line', () => {
  for (const [body, why] of [['class A\nA --() bar', 'syntax:3'], ['class X\nnamespace A.B {\nclass C\n}', 'syntax:3'], ['class A\nA', 'syntax:3'],
    ['class A {\n+x', 'syntax:2'], ['<<interface>> A\n<<service>> A', 'repeat:3'], ['class A["x"]\nclass A["y"]', 'repeat:3'],
    ['class Box~int~\nclass Box~str~', 'repeat:3']] as const) assert.deepEqual(P(body), { reason: why }, body)
})

// Beyond the plan's four: the Common rules, each drawn text checked, and the rest of the matrix's class rules.
const R = (src: string) => { const s = readSource(src); return ('reason' in s ? s : parseClass(s)) as any }
test('A5: a frontmatter title, classDiagram-v2, and every field set, none undefined', () => assert.deepEqual(
  R('---\ntitle: Zoo\n---\nclassDiagram-v2\nA <|-- B\nnote for A "n"'), { dir: 'TB', title: 'Zoo',
    classes: [{ id: 'A', label: 'A', annot: null, members: [], order: 0 }, { id: 'B', label: 'B', annot: null, members: [], order: 1 }],
    relations: [{ id: 'rel0', from: 'A', to: 'B', tail: 'triangle', head: 'none', line: 'solid', label: null, tailLabel: null, headLabel: null,
      order: 0 }], notes: [{ id: 'note0', for: 'A', text: 'n', order: 1 }], namespaces: [] }))
test('A5: reversed ends, an inline annotation, Mermaid member spacing, accTitle and accDescr', () => {
  const m = P(['A --|> B', 'A --* C', 'A --o D', 'class E <<enum>> {', '  + x', '  + getX()$ int', '  -f(List~T~ a) Map~K~', '}', 'accTitle: t',
    'accDescr {', 'class Z', '}', 'accDescr : d'].join('\n'))
  assert.deepEqual(m.relations.map((r: any) => [r.tail, r.head]), [['none', 'triangle'], ['none', 'diamond'], ['none', 'odiamond']])
  assert.deepEqual([m.classes.map((c: any) => c.id), m.classes[4].annot, m.classes[4].members.map((x: any) => x.text)],
    [['A', 'B', 'C', 'D', 'E'], 'enum', ['+ x', '+ getX() : int$', '-f(List<T> a) : Map<K>']])
})
// Mermaid's Diagram.fromText encodes every #…; in the body and its SVG decodes it, so "#9829;" shows ♥: such text falls back.
test('A5.errors: a #…; entity in any drawn text falls back; a lone # is text, and an ignored directive is not checked', () => {
  for (const body of ['class A["#9829;"]', 'class A {\n  +x #lt;\n}', 'A : #count;', 'A --> B : #9829;', 'A "#9829;" --> B', 'A --> "#9829;" B',
    'note "#9829;"', 'namespace N["#9829;"] {\n}', 'class A {\n<<#9829;>>\n}', 'class `#9829;`']) assert.deepEqual(P(body), { reason: 'entity' }, body)
  const m = P('class A["C# 1"]\nA : #count\nclassDef hot fill:#f00;\nstyle A fill:#f9f;')
  assert.deepEqual([m.classes[0].label, m.classes[0].members[0].text], ['C# 1', '#count'])
})
test('A5.errors: headers are case-sensitive and alone; a keyword in another case or starting a longer word falls back', () => {
  for (const [src, why] of [['classdiagram\nclass A', 'header'], ['classDiagram LR\nclass A', 'header'], ['classDiagram-v3\nclass A', 'header'],
    ...['Class A', 'classes A', 'Note "x"', 'notebook --> A', 'Direction RL', 'direction rl', 'Style A fill:#f9f', 'namespaced A {', 'cssclass A x']
      .map(b => [`classDiagram\n${b}`, 'syntax:2'])]) assert.deepEqual(R(src!), { reason: why }, src)
})
test('A5.errors: blank texts and blank label lines fall back, and so does an undrawable character', () => {
  for (const [body, why] of [['note "a<br><br>b"', 'label-blank-line'], ['note "a<br/>"', 'label-blank-line'], ['class A["x<br/>"]', 'label-blank-line'],
    ['class A[" "]', 'syntax:2'], ['A "" --> B', 'syntax:2'], ['A --> B :', 'syntax:2'], ['note ""', 'syntax:2'], ['namespace N[""] {\n}', 'syntax:2'],
    ['class A["a‍b"]', 'unsupported-char U+200D']]) assert.deepEqual(P(body!), { reason: why }, body)
})
test('A5.errors: comma generics, nested namespaces, conflicting declarations and dangling notes fall back; agreeing repeats draw', () => {
  for (const [body, why] of [['class A\nclass Box~K,V~', 'syntax:3'], ['A : +Map~K,V~ m', 'syntax:2'], ['namespace A {\nnamespace B {\nclass C\n}\n}', 'syntax:3'],
    ['namespace P {\nclass A', 'syntax:2'], ['accDescr {\nx', 'syntax:2'], ['note for Ghost "x"', 'syntax:2'], ['A : <<x>>', 'syntax:2'],
    ['class A~T~\nclass A["l"]', 'syntax:3'], ['class A\nclass A~T~', 'repeat:3'], ['namespace P {\nclass A\n}\nnamespace Q {\nclass A\n}', 'repeat:6'],
    ['namespace P["x"] {\nclass A\n}\nnamespace P["y"] {\nclass B\n}', 'repeat:5'], ['class note0\nnote "x"', 'id-collision']]) assert.deepEqual(P(body!), { reason: why }, body)
  assert.deepEqual(P('class A["x"]\nclass A["x"]\nclass B~T~\nclass B~T~\nnamespace P {\nclass A\n}\nnamespace P {\nclass C\n}').namespaces,
    [{ id: 'P', label: 'P', classes: ['A', 'C'], notes: [] }])
})

// Fix cycle 1: each input Mermaid 12.2.0's grammar reads otherwise is matched or falls back. S: the reason, under `class A`.
const S = (body: string) => P(`class A\n${body}`)
test('A5 (1): click, link and callback in each form the grammar accepts are parsed and ignored', () => {
  for (const body of ['click A href "u"', 'click A href "u" "tip"', 'click A href "u" _blank', 'click A href "u" "tip" _self', 'click A call fn()',
    'click A call fn(x, y)', 'click A call fn() "tip"', 'click A call fn(x) "tip"', 'link A "u"', 'link A "u" _top', 'link A "u" "tip"',
    'link A "u" "tip" _parent', 'callback A "fn"', 'callback A "fn" "tip"']) assert.deepEqual(S(body).classes.map((c: any) => c.id), ['A'], body)
})
test('A5.errors (1): a click, link or callback in any other form falls back', () => {
  for (const body of ['click A garbage', 'click A', 'click A href u', 'click A href "u" _new', 'click A call fn', 'click A call ()', 'click A href "u" more',
    'link A', 'link A "u" "t" "x"', 'callback A', 'callback A fn', 'callback A "fn" _blank']) assert.deepEqual(S(body), { reason: 'syntax:3' }, body)
})
// Mermaid's lexer reads `.*direction\s+(TB|BT|RL|LR)[^\n]*` as a direction statement wherever a top-level line holds it, and its
// \s+ crosses a line end; only `direction XX` alone is drawn as one.
test('A5.errors (2): a top-level line Mermaid reads as a direction, but for direction XX alone, falls back; inside a block it is text', () => {
  for (const body of ['A --> B : go direction LR', 'class B["direction TB"]', 'note "misdirection RL"', 'accTitle: direction BT',
    'accDescr { direction LR }', 'A --> B : direction']) assert.deepEqual(S(body), { reason: 'syntax:3' }, body)
  const m = P('namespace N {\nclass A["direction LR"]\n}\nclass B {\n+direction TB\n}\ndirection BT')
  assert.deepEqual([m.classes[0].label, m.classes[1].members[0].text, m.dir], ['direction LR', '+direction TB', 'BT'])
})
test('A5.errors (3): an annotation is one word and :::name one word, neither a keyword, and not both on one class', () => {
  for (const body of ['class B <<two words>>', 'class B:::bad-name', 'class B:::hot <<x>>', 'class B <<note>>',
    '<<two words>> B', '<<a-b>> B', '<<link>> B', 'class B:::']) assert.deepEqual(S(body), { reason: 'syntax:3' }, body)
  const m = P('class A ::: hot\nclass B << iface >> {\n+x\n}\n<<I_1>> C\nclass D {\n<<two words>>\n}')
  assert.deepEqual(m.classes.map((c: any) => c.annot), [null, 'iface', 'I_1', 'two words'])
})
test('A5.errors (4, 5): an empty namespace, and a ~ in a backtick name, fall back', () => {
  for (const [body, why] of [['namespace N {\n}', 'syntax:4'], ['namespace N {\nnote "x"\n}\nnamespace M {\n}', 'syntax:7'],
    ['class `B~T~`', 'syntax:3'], ['`B~T~` --> C', 'syntax:3'], ['`B~T~` : +x', 'syntax:3']]) assert.deepEqual(S(body), { reason: why }, body)
  assert.deepEqual(S('class `B T`').classes.map((c: any) => c.id), ['A', 'B T'])
})
test('A5 (6): a "none" cardinality, trimmed, is hidden as Mermaid hides it; another case is text', () =>
  assert.deepEqual(S('A "none" --> " none " B\nA "None" --> B').relations.map((r: any) => [r.tailLabel, r.headLabel]), [[null, null], ['None', null]]))
// The matrix (class, supported subset): `A [e]--[e] B`, e is <| |> * o < > or nothing, on either side.
test('A5 (7, 8): either end takes each of <| |> * o < >, each mapped as Mermaid maps it', () => {
  const ends = [['<|', 'triangle'], ['|>', 'triangle'], ['*', 'diamond'], ['o', 'odiamond'], ['<', 'arrow'], ['>', 'arrow']]
  const m = P([...ends.flatMap(([e]) => [`A ${e}-- B`, `A --${e} B`, `A ${e}..${e} B`]), 'A -- B'].join('\n'))
  assert.deepEqual(m.relations.map((r: any) => [r.tail, r.head, r.line]), [...ends.flatMap(([, k]) => [[k, 'none', 'solid'], ['none', k, 'solid'],
    [k, k, 'dotted']]), ['none', 'none', 'solid']])
})

// Fix cycle 2: Mermaid's lexer reads `\s*o` as aggregation only before a word boundary (jison's /^(?:\s*o\b)/), ahead of \w+.
const rels = (body: string) => P(body).relations.map((r: any) => [r.from, r.to, r.tail, r.head, r.line])
test('A5 (9): an o that starts a longer word is the class name, not an aggregation end', () => {
  assert.deepEqual(rels('Fruit --orange\nFruit ..orange\nFruit --o B\nAo-- B\nC --oé'), [['Fruit', 'orange', 'none', 'none', 'solid'],
    ['Fruit', 'orange', 'none', 'none', 'dotted'], ['Fruit', 'B', 'none', 'odiamond', 'solid'], ['Ao', 'B', 'none', 'none', 'solid'],
    ['C', 'é', 'none', 'odiamond', 'solid']])
})
test('A5.errors (10): an unquoted id with a standalone o, which Mermaid lexes as aggregation, falls back; o inside a word is a name', () => {
  for (const body of ['class o', 'class o-X', 'class X-o-Y', 'click o href "u"', 'link X-o "u"', 'note for o "x"', 'o : +x', '<<I>> o', 'o --> B',
    'B --> é-o', 'namespace o {\nclass C\n}', 'class B <<o>>', 'class B:::o']) assert.deepEqual(S(body), { reason: 'syntax:3' }, body)
  const m = S('class oX\nclass Xo-o1\nclass o_1\nclass `o`\nclass B <<observable>>\nclass C:::orange\nclick oX href "u"')
  assert.deepEqual(m.classes.map((c: any) => [c.id, c.annot]), [['A', null], ['oX', null], ['Xo-o1', null], ['o_1', null], ['o', null],
    ['B', 'observable'], ['C', null]])
})
// The grammar: STYLE ALPHA stylesOpt, CLASSDEF classList stylesOpt, CSSCLASS STR ALPHA; a style is ALPHA, :label, :, # or % pieces.
test('A5.errors (11): style, classDef and cssClass lines outside their grammar fall back; their valid forms draw nothing', () => {
  for (const body of ['style A', 'classDef hot', 'cssClass junk', 'style A-B fill:red', 'style A fill:red; color:blue', 'style A fill-x',
    'classDef hot,', 'classDef a-b fill:red', 'cssClass "" hot', 'cssClass "A" hot cold', 'style A fill,', 'style A fill :::x', 'style A class',
    'style o fill:red']) assert.deepEqual(S(body), { reason: 'syntax:3' }, body)
  const m = S('style A fill:#f9f,stroke:#333,stroke-width:4px\nclassDef hot,cold fill:#f00\nclassDef x font:12pt , color : red\nstyle A fill:red,\nclassDef hot, fill:red\n' +
    'cssClass "A" hot\ncssClass "A,B" cold\nstyle A fill:#f9f;\nstyle A #f00 50%')
  assert.deepEqual(m.classes.map((c: any) => c.id), ['A'])
})
// Each drawn field in the mode Mermaid 12.2.0 shows it in. Label, note and relation
// label: html, any <br> splits; namespace title, annotation, cardinality and a backtick name: html, no <br>; a member: member.
test('A5.errors (X2): text Mermaid shows otherwise in a class field falls back', () => {
  for (const [body, why] of [['class B["a<!--c-->b"]', 'html'], ['namespace N["First<br>Second"] {\nclass B\n}', 'html'], ['note "a<i>x</i>"', 'html'],
    ['A --> B : a<b>', 'html'], ['A "a<br>b" --> B', 'html'], ['A --> "x<b>y" B', 'html'], ['class B {\n<<a<b>>\n}', 'html'], ['class B {\n+a<b\n}', 'html'],
    ['B : +x<br>y', 'html'], ['B : +Q&am x', 'entity'], ['class B {\n+é&éé\n}', 'entity'], ['class `a<b>`', 'html'], ['class `a<br>b`', 'html'], ['note "&lt;"', 'entity'],
    ['class B["&amp;"]', 'entity'], ['class Box~a<b>~', 'html']]) assert.deepEqual(S(body), { reason: why }, body)
  const m = S('class B["x<br>Q&A"]\nnote "a < b"\nA "Q&A" --> "a < b" B : Q&A\nclass C {\n<<Q&A>>\n+a > b\n}\nC : +Q&A\nnamespace N["a < b"] {\nclass D\n}')
  assert.deepEqual([m.classes[1].label, m.notes[0].text, m.relations[0].label, m.relations[0].tailLabel, m.relations[0].headLabel, m.classes[2].annot,
    m.classes[2].members.map((x: any) => x.text), m.namespaces[0].label], ['x<br>Q&A', 'a < b', 'Q&A', 'Q&A', 'a < b', 'Q&A', ['+a > b', '+Q&A'], 'a < b'])
})
// X3. Mermaid 12.2.0 renders a class's name, label and annotation, a relation label and a note as markdown labels (marked);
// a cardinality and a namespace title through createLabel, a plain HTML label that splits a literal \n; every one through
// icon and KaTeX substitution. A note's text reaches the label as written: only a <br> Mermaid splits breaks it.
test('X3: Markdown the emphasis port cannot match, emphasis in a name, annotation or member, icons and math in class texts fall back; a note keeps a literal \\n and an odd <br> as Mermaid does', () => {
  for (const [body, why] of [['class A["**a **b** c**"]', 'markdown'], ['A --> B : a \\* b', 'markdown'], ['note "*a *b* c*"', 'markdown'],
    ['class A {\n<<__x__>>\n}', 'markdown'], ['class __init__', 'markdown'], ['class A {\n+__init__()\n}', 'markdown'],
    ['class A["fa:fa-book"]', 'icon'], ['note "$$x^2$$"', 'math'], ['A "a\\nb" --> B', 'newline'], ['namespace N["a\\nb"] {\n}', 'newline'],
    ['note "a<br\u00a0/>b"', 'html']]) assert.deepEqual(P(body), { reason: why }, body)
  assert.deepEqual(P('note "First\\nSecond"\nnote "a<br/>b<BR >c"').notes.map((n: any) => n.text), ['First\\nSecond', 'a<br/>b<BR >c'])
  const m = P('class A["snake_case"]\nA "**" --> B : a*b\nnamespace N["**x**"] {\nclass C\n}')
  assert.deepEqual([m.classes[0].label, m.relations[0].tailLabel, m.relations[0].label, m.namespaces[0].label], ['snake_case', '**', 'a*b', '**x**'])
})

// X3. Mermaid 12.2.0 (JSDOM): class B["**lbl** x"], a relation label **r** _s_ and a note "**n** _o_" show <strong> and
// <em>. A member's text Mermaid parses first (+foo() **x** shows "+foo() : <strong>x</strong>"), so members keep falling back.
test('X3.emphasis: bold and italic in a class label, a relation label or a note draw as Mermaid shows them', async () => {
  const { emphasize } = await import('../../core/emphasis.ts')
  const m = P('class B["**lbl** x"]\nB --> C : **r** _s_\nnote for B "**n**<br>_o_"')
  assert.deepEqual([m.classes[0].label, m.relations[0].label, m.notes[0].text], [emphasize('**lbl** x'), emphasize('**r** _s_'), emphasize('**n**<br>_o_')])
})

test('X3.emphasis: a class relation label reads each <br> as a newline: a block start after one falls back; a note draws it', async () => {
  const { emphasize } = await import('../../core/emphasis.ts')
  assert.deepEqual(P('A --> B : a<br>- **b**'), { reason: 'markdown' })
  assert.equal(P('A --> B : **a<br>b**').relations[0].label, emphasize('**a<br>b**', true))
  assert.equal(P('class A\nnote for A "a<br>- **b**"').notes[0].text, emphasize('a<br>- **b**'))
})
