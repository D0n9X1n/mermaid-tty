import test from 'node:test'; import assert from 'node:assert/strict'
import { explain } from '../../core/render.ts'; import { text } from './graph-fixture.ts'; import { validate } from '../../core/validate.ts'
const X = (body: string, columns = 80) => explain(`classDiagram\n${body}`, { columns, theme: 'mono' }) as any
test('A3: a class pill shows «annot», its name, then attributes before methods, with no divider row', () => {
  const t = text(X('class Duck {\n  <<service>>\n  +swim()\n  +String beakColor\n}').drawing)
const  at = (s: string) => t.findIndex(l => l.includes(s))
  assert.deepEqual([at('«service»') + 1, at(' Duck ') + 1, at('+String beakColor') + 1], [at(' Duck '), at('+String beakColor'), at('+swim()')])
  assert.ok(t.slice(at('«service»'), at('+swim()') + 1).every(l => /\[.*\]/.test(l)))
  const duck = X('class Duck {\n  <<service>>\n  +String beakColor\n  +swim()\n}').drawing   // an annotated class with members validates
  assert.equal(validate(duck), null); assert.deepEqual(duck.expect.members.map((m: any) => m.id), ['Duck.annot', 'Duck.m0', 'Duck.m1'])
})
test('A3: ends face their class: △ inheritance, ◆ composition, ◇ aggregation, ▽ a dashed realization', () => {
  const t = text(X('Animal <|-- Duck\nDuck *-- Egg\nLake o-- Duck\nDuck ..|> Swimmer').drawing).join('\n')
  for (const g of ['△', '◆', '◇', '▽', '┆']) { assert.ok(t.includes(g), g) }
})
test('A4.fit-ladder: at keyed, relation labels and notes share one key sequence, in source order', () => {
  const W = 'Supercalifragilisticexpialidocious'
const  r = X(`direction LR\nA --> B : uses\nnote for B "${W}"`, 40)
  assert.equal(r.step, 'keyed'); assert.deepEqual(text(r.drawing).slice(-2), ['a uses', `b ${W}`])
  assert.ok(r.drawing.cells.flat().some((c: any) => c?.kind === 'key' && c.ch === 'b' && c.owners[0] === 'note0' && !c.legend))   // the class note node draws its key (B4)
})

// Beyond the plan's tests: each end sits at its own class with its own glyph; keys count only labelled relations, then notes;
// a class or namespace named as a relation or note would make owners ambiguous, so it falls back.
test('A3: each end is drawn at the class it faces, with the glyph its relation names', () => {
  const d = X('Animal <|-- Duck\nDuck *-- Egg\nLake o-- Duck\nDuck ..|> Swimmer\nDuck --> Pond').drawing
  assert.deepEqual(d.expect.edges.map((e: any) => [e.id, e.ends.map((x: any) => `${x.node}${x.glyph}`).join()]),
    [['r0', 'Animal△'], ['r1', 'Duck◆'], ['r2', 'Lake◇'], ['r3', 'Swimmer▽'], ['r4', 'Pond▼']])
  assert.equal(validate(d), null)
})
test('A4.fit-ladder: keyed, an unlabelled relation takes no key; labels, then notes, take a, b, c', () => {
  const r = X('direction LR\nA --> B : one\nB --> C\nC --> D : two\nnote for D "Supercalifragilisticexpialidocious"', 40)
  assert.equal(r.step, 'keyed'); assert.equal(validate(r.drawing), null)
  assert.deepEqual(r.drawing.expect.keys, [{ key: 'a', item: 'r0:label', cls: 'label' }, { key: 'b', item: 'r2:label', cls: 'label' },
    { key: 'c', item: 'note0', cls: 'note' }])
})
test('A5.errors: a class or namespace named as a relation or a note fails id-clash', () => {
  for (const body of ['class r0\nA --> r0', 'class note0', 'A --> B\nnamespace r0 {\n  class C\n}', 'class note3\nnote "x"'])
    { assert.deepEqual(X(body), { reason: 'id-clash' }, body) }
  assert.ok(X('class r\nclass notes\nclass r0a').drawing)
})
test('A4.fit-ladder: keyed, a note written above a labelled relation takes its key first, in source order', () => {
  const r = X('direction LR\nnote for B "Supercalifragilisticexpialidocious"\nA --> B : uses\nB --> C : Antidisestablishmentarianism', 40)
  assert.equal(r.step, 'keyed'); assert.equal(validate(r.drawing), null)
  assert.deepEqual(r.drawing.expect.keys.map((k: any) => [k.key, k.item]), [['a', 'note0'], ['b', 'r0:label'], ['c', 'r1:label']])
})
