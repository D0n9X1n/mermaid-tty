import test from 'node:test'; import assert from 'node:assert/strict'
import { sequence } from '../../core/diagrams/sequence/layout.ts'; import { parseSequence } from '../../core/diagrams/sequence/parse.ts'
import { readSource, type Source } from '../../core/source.ts'; import { validate } from '../../core/validate.ts'
import { lookup } from '../../core/registry.ts'; import { text } from './graph-fixture.ts'; import { fitLadder } from '../../core/fit.ts'
const L = (t: string) => sequence.layout(parseSequence(readSource(`sequenceDiagram\n${t}`) as Source) as any, 'natural', 80) as any
test('A2: base design: caps, lifelines, solid and dotted, self-message, activation, note', () => {
  const d = L('actor U as User\nparticipant S as Server\nU->>+S: req\nS-->>-U: res\nS->>S: self\nNote over U,S: both')
  assert.equal(validate(d), null); const t = text(d).join('\n')
  for (const s of ['([ User ])', '[ Server ]', '─►', '◄┄', '─┐', '◄┘', '┃', 'both']) assert.ok(t.includes(s), s)
})
test('A2: frames and autonumber', () => {
  const d = L('autonumber 10 5\nalt ok\nA->>B: a\nelse no\nA->>B: b\nend'); assert.equal(validate(d), null)
  const t = text(d).join('\n'); for (const s of ['alt [ok]', '[no]', '10. a', '15. b']) assert.ok(t.includes(s), s)
})
test('A2: the registry resolves sequenceDiagram', () => assert.equal((lookup('sequenceDiagram') as any).type, 'sequence'))
test('A2: a title statement draws a bold title row', () => { const d = L('title Checkout\nA->>B: x'); assert.equal(validate(d), null); assert.match(text(d)[0]!, /Checkout/) })
test('A2: header pills: stadium caps for an actor, rect caps for a participant, in declaration order', () => {
  const d = L('actor U as User\nparticipant S as Server')
  assert.equal(validate(d), null)
  assert.deepEqual(text(d), ['([ User ]) [ Server ]'])
})
test('A2: two participants and one message draw exactly these rows', () => {
  const d = L('A->>B: hi')
  assert.equal(validate(d), null)
  assert.deepEqual(text(d), ['[ A ] [ B ]', '  │ hi  │', '  │────►│'])
})
test('A2: each end sits beside the target lifeline: x cross, ) async, none open, and a ◄ tail', () => {
  const d = L('A-xB: c\nA-)B: d\nA->B: e\nA<<->>B: f')
  assert.equal(validate(d), null)
  assert.deepEqual(text(d).slice(1), ['  │  c  │', '  │────x│', '  │  d  │', '  │────)│', '  │  e  │', '  │─────│', '  │  f  │', '  │◄───►│'])
})
test('A2: a self-message draws its label, then ─┐, then ◄┘ beside its lifeline', () => {
  const d = L('A->>A: me')
  assert.equal(validate(d), null)
  assert.deepEqual(text(d), ['[ A ]', '  │ me', '  │─┐', '  │◄┘'])
})
test('A2: autonumber numbers each message start + i × step, and a dotted reply draws ◄┄', () => {
  const d = L('autonumber 10 5\nA->>B: a\nA->>A: b\nB-->>A: c')
  assert.equal(validate(d), null)
  const t = text(d).join('\n')
  for (const s of ['10. a', '15. b', '20. c', '◄┄']) assert.ok(t.includes(s), s)
})
test('A2: a note left of and right of a participant sits one column off its lifeline', () => {
  const d = L('participant A\nparticipant B\nNote left of A: L\nNote right of B: R')
  assert.equal(validate(d), null)
  assert.deepEqual(text(d), ['  [ A ] [ B ]', ' L  │     │', '    │     │  R'])
})
test('A2: +/- activation draws ┃ from the activating line through the deactivating one', () => {
  const d = L('A->>+B: go\nB-->>-A: done')
  assert.equal(validate(d), null)
  assert.deepEqual(text(d), ['[ A ]   [ B ]', '  │  go   │', '  │──────►┃', '  │ done  ┃', '  │◄┄┄┄┄┄┄┃'])
})
test('A2: activate and deactivate statements draw ┃ over the messages between them', () => {
  const d = L('A->>B: go\nactivate B\nB->>A: r\ndeactivate B\nA->>B: z')
  assert.equal(validate(d), null)
  assert.deepEqual(text(d), ['[ A ] [ B ]', '  │ go  │', '  │────►┃', '  │  r  ┃', '  │◄────┃', '  │  z  │', '  │────►│'])
})
test('A2: create draws the pill on its creating message row and the lifeline below it', () => {
  const d = L('participant A\ncreate participant B\nA->>B: hi\nB->>A: ok')
  assert.equal(validate(d), null)
  assert.deepEqual(text(d), ['[ A ]', '  │ hi', '  │────►[ B ]', '  │  ok   │', '  │◄──────│'])
})
test('A2: destroy ends the lifeline at its destroying message', () => {
  const d = L('participant A\nparticipant B\nA->>B: x\ndestroy B\nA->>B: bye\nA->>A: after')
  assert.equal(validate(d), null)
  assert.deepEqual(text(d), ['[ A ]    [ B ]', '  │   x    │', '  │───────►│', '  │  bye   │', '  │───────►│', '  │ after', '  │─┐', '  │◄┘'])
})
test('A2: alt draws a titled frame two columns beyond its lifelines, and else a ┄ divider row carrying [cond]', () => {
  const d = L('autonumber 10 5\nalt ok\nA->>B: a\nelse no\nA->>B: b\nend')
  assert.equal(validate(d), null)
  assert.deepEqual(text(d), ['[ A ]    [ B ]', '┌─alt [ok]───┐', '│ │ 10. a  │ │', '│ │───────►│ │', '├┄[no]┄┄┄┄┄┄┄┤',
    '│ │ 15. b  │ │', '│ │───────►│ │', '└────────────┘'])
})
test('A2: every frame type is titled type [cond]; each and/option/else section adds a divider; no cond, no brackets', () => {
  const d = L('opt maybe\nA->>B: o\nend\nloop every 5s\nA->>B: l\nend\npar one\nA->>B: p\nand two\nA->>B: q\nend\n' +
    'critical lock\nA->>B: c\noption fail\nA->>B: f\nend\nbreak stop\nA->>B: s\nend\nalt\nA->>B: a\nelse\nA->>B: b\nend')
  assert.equal(validate(d), null)
  const t = text(d).join('\n')
  for (const s of ['opt [maybe]', 'loop [every 5s]', 'par [one]', '[two]', 'critical [lock]', '[fail]', 'break [stop]', '┌─alt─', '├┄┄┄']) assert.ok(t.includes(s), s)
})
test('A2: rect draws an untitled note frame, and box a titled frame around its pills from above the header', () => {
  const d = L('box Back\nparticipant A\nparticipant B\nend\nrect rgb(1,2,3)\nA->>B: x\nend')
  assert.equal(validate(d), null)
  assert.deepEqual(text(d), ['┌─Back────────┐', '│ [ A ] [ B ] │', '│ ┌─────────┐ │', '│ │ │  x  │ │ │', '│ │ │────►│ │ │', '│ └─────────┘ │', '└─────────────┘'])
  assert.equal(d.cells[2][2].role, 'note')
  assert.equal(d.cells[0][0].role, 'frame')
})
test('A2: the title row comes first, bold, then the box tops, then the header', () => {
  const d = L('title Hello\nbox G\nparticipant A\nend')
  assert.equal(validate(d), null)
  assert.deepEqual(text(d), ['Hello', '┌─G─────┐', '│ [ A ] │', '└───────┘'])
  assert.equal(d.cells[0][0].role, 'title')
})
test('A2: a CJK label counts 2 columns a character, so the lifelines stay aligned under the pills', () => {
  const d = L('participant 用户\nparticipant 服务\n用户->>服务: 你好')
  assert.equal(validate(d), null)
  assert.deepEqual(text(d), ['[ 用户 ] [ 服务 ]', '   │  你好  │', '   │───────►│'])
})
test('A2: at 30 columns natural and tight are too wide, and the wrap step wraps the label to fit', () => {
  const m = parseSequence(readSource('sequenceDiagram\nA->>B: a long label that will need wrapping here') as Source) as any
  assert.deepEqual(validate(sequence.layout(m, 'tight', 30) as any), { reason: 'row-too-wide' })
  const r = fitLadder(sequence, m, 30) as any
  assert.equal(r.step, 'wrap')
  assert.deepEqual(text(r.drawing), ['[ A ]                   [ B ]', '  │a long label that will │', '  │  need wrapping here   │', '  │──────────────────────►│'])
})
test('A2: a message line and its label replace the lifelines they cross', () => {
  const d = L('participant A\nparticipant B\nparticipant C\nA->>C: far')
  assert.equal(validate(d), null)
  assert.deepEqual(text(d), ['[ A ] [ B ] [ C ]', '  │    far    │', '  │──────────►│'])
})
