import test from 'node:test'; import assert from 'node:assert/strict'
import { explain } from '../../core/render.ts'; import { text } from './graph-fixture.ts'
import { er } from '../../core/diagrams/er/layout.ts'; import { readSource, type Source } from '../../core/source.ts'
const X = (body: string, columns = 80) => explain(`erDiagram\n${body}`, { columns, theme: 'mono' }) as any
const ends = (d: any) => { const L = new Map(d.expect.labels.map((l: any) => [l.owner, l.text])); return ['r0:tail', 'r0:head', 'r1:tail', 'r1:head'].map(o => L.get(o)) }
test('A3: an entity pill with aligned attribute rows; cardinality at each end; a dashed non-identifying line', () => {
  const r = X(['CAR ||--o{ DRIVER : "is driven by"', 'CAR {', '  string registrationNumber PK "the plate"', '  int seats', '}', 'DRIVER |o..|| LICENSE : may'].join('\n'))
  const t = text(r.drawing)
const  reg = t.find(l => l.includes('registrationNumber'))!
const  seats = t.find(l => l.includes('seats'))!
  assert.match(reg, /string registrationNumber PK the plate/); assert.equal(reg.indexOf('registrationNumber'), seats.indexOf('seats'))
  assert.deepEqual(r.drawing.expect.members.filter((m: any) => m.id.startsWith('CAR.a1.')).map((m: any) => m.id), ['CAR.a1.type', 'CAR.a1.name'])   // seats has no key or comment cell, so none is listed (B2)
  assert.deepEqual(ends(r.drawing), ['1', '0..*', '0..1', '1']); assert.match(t.join('\n'), /┆/); assert.match(t.join('\n'), /is driven by/)
})
test('A4.fit-ladder: at keyed, comments and relation labels share one key sequence; cardinality is never keyed', () => {
  const W = 'Supercalifragilisticexpialidocious'
const  r = X(`direction LR\nCAR {\n  string id PK "${W}"\n}\nCAR ||--o{ DRIVER : owns`, 40)
  assert.equal(r.step, 'keyed'); assert.deepEqual(text(r.drawing).slice(-2), [`a ${W}`, 'b owns']); assert.deepEqual(ends(r.drawing).slice(0, 2), ['1', '0..*'])
})
test('A5.errors: an entity or subgraph id equal to an owner id the drawing mints falls back as id-clash', () => {
  for (const body of ['r0 ||--o{ B : x', 'subgraph r0\nA\nend\nA ||--o{ B : x', 'A ||--o{ B : x\n"r0:label"', 'A ||--o{ B : x\n"r0:tail"',
    'A ||--o{ B : x\n"r0#1"', 'A {\n int x\n}\n"A.a0.type"', '---\ntitle: T\n---\nerDiagram\ntitle ||--o{ B : x'])
    { assert.deepEqual(body.startsWith('---') ? explain(body, { columns: 80, theme: 'mono' }) : X(body), { reason: 'id-clash' }, body) }
  assert.equal(X('r5 ||--o{ B : x').step, 'natural')   // r5 names no relation here
})
test('A3: an identifying relation is solid, a non-identifying one dashed', () => {
  const solid = text(X('A ||--|| B : x').drawing).join('\n')
const  dashed = text(X('A ||..|| B : x').drawing).join('\n')
  assert.match(solid, /│/); assert.doesNotMatch(solid, /┆/); assert.match(dashed, /┆/); assert.doesNotMatch(dashed, /│/)
})
test('A4.fit-ladder: keys follow source order, a label before a comment; each end keeps its own cardinality', () => {
  const W = 'Supercalifragilisticexpialidocious'
const  r = X(`direction LR\nCAR ||--o{ DRIVER : owns\nCAR {\n  string id PK "${W}"\n}`, 40)
  assert.equal(r.step, 'keyed'); assert.deepEqual(text(r.drawing).slice(-2), ['a owns', `b ${W}`]); assert.deepEqual(ends(r.drawing).slice(0, 2), ['1', '0..*'])
  assert.deepEqual(r.drawing.expect.keys.map((k: any) => [k.key, k.item, k.cls]), [['a', 'r0:label', 'label'], ['b', 'CAR.a0.comment', 'comment']])
})
