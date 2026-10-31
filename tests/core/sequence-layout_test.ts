import test from 'node:test'
import assert from 'node:assert/strict'
import { sequence } from '../../core/diagrams/sequence/layout.ts'
import { parseSequence } from '../../core/diagrams/sequence/parse.ts'
import { readSource, type Source } from '../../core/source.ts'
import { validate } from '../../core/validate.ts'
import { lookup } from '../../core/registry.ts'
import { text } from './graph-fixture.ts'
import { fitLadder } from '../../core/fit.ts'
import { explain } from '../../core/render.ts'
import { readdirSync, readFileSync } from 'node:fs'
const L = (t: string) =>
  sequence.layout(parseSequence(readSource(`sequenceDiagram\n${t}`) as Source) as any, 'natural', 80) as any
test('A2: base design: caps, lifelines, solid and dotted, self-message, activation, note', () => {
  const d = L('actor U as User\nparticipant S as Server\nU->>+S: req\nS-->>-U: res\nS->>S: self\nNote over U,S: both')
  assert.equal(validate(d), null)
  const t = text(d).join('\n')
  for (const s of ['([ User ])', '[ Server ]', '─►', '◄┄', '─┐', '◄┘', '┃', 'both']) {
    assert.ok(t.includes(s), s)
  }
})
test('A2: frames and autonumber', () => {
  const d = L('autonumber 10 5\nalt ok\nA->>B: a\nelse no\nA->>B: b\nend')
  assert.equal(validate(d), null)
  const t = text(d).join('\n')
  for (const s of ['alt [ok]', '[no]', '10. a', '15. b']) {
    assert.ok(t.includes(s), s)
  }
})
test('A2: the registry resolves sequenceDiagram', () =>
  assert.equal((lookup('sequenceDiagram') as any).type, 'sequence'))
test('A2: a title statement draws a bold title row', () => {
  const d = L('title Checkout\nA->>B: x')
  assert.equal(validate(d), null)
  assert.match(text(d)[0]!, /Checkout/)
})
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
  assert.deepEqual(text(d).slice(1), [
    '  │  c  │',
    '  │────x│',
    '  │  d  │',
    '  │────)│',
    '  │  e  │',
    '  │─────│',
    '  │  f  │',
    '  │◄───►│',
  ])
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
  for (const s of ['10. a', '15. b', '20. c', '◄┄']) {
    assert.ok(t.includes(s), s)
  }
})
test('A2: autonumber off draws a message unnumbered, and a restart draws from its own start', () => {
  const d = L('autonumber 10 5\nA->>B: a\nautonumber off\nA->>B: b\nautonumber\nA->>B: c\nautonumber 3\nA->>B: d')
  assert.equal(validate(d), null)
  const t = text(d).join('\n')
  for (const s of ['10. a', '20. c', '3. d']) {
    assert.ok(t.includes(s), s)
  }
  assert.ok(!/\d\. b/.test(t), 'b is unnumbered')
})
test('A2: a note left of and right of a participant sits one column off its lifeline', () => {
  const d = L('participant A\nparticipant B\nNote left of A: L\nNote right of B: R')
  assert.equal(validate(d), null)
  assert.deepEqual(text(d), ['    [ A ] [ B ]', '┆ L ┆ │     │', '      │     │ ┆ R ┆'])
})
test('A2: +/- activation draws ┃ from the activating line through the deactivating one', () => {
  const d = L('A->>+B: go\nB-->>-A: done')
  assert.equal(validate(d), null)
  assert.deepEqual(text(d), ['[ A ]   [ B ]', '  │  go   │', '  │──────►┃', '  │ done  ┃', '  │◄┄┄┄┄┄┄┃'])
})
test('A2: activate and deactivate statements draw ┃ over the messages between them', () => {
  const d = L('A->>B: go\nactivate B\nB->>A: r\ndeactivate B\nA->>B: z')
  assert.equal(validate(d), null)
  assert.deepEqual(text(d), [
    '[ A ] [ B ]',
    '  │ go  │',
    '  │────►┃',
    '  │  r  ┃',
    '  │◄────┃',
    '  │  z  │',
    '  │────►│',
  ])
})
test('A2: create draws the pill on its creating message row and the lifeline below it', () => {
  const d = L('participant A\ncreate participant B\nA->>B: hi\nB->>A: ok')
  assert.equal(validate(d), null)
  assert.deepEqual(text(d), ['[ A ]', '  │ hi', '  │────►[ B ]', '  │  ok   │', '  │◄──────│'])
})
test('A2: destroy ends the lifeline at its destroying message', () => {
  const d = L('participant A\nparticipant B\nA->>B: x\ndestroy B\nA->>B: bye\nA->>A: after')
  assert.equal(validate(d), null)
  assert.deepEqual(text(d), [
    '[ A ]    [ B ]',
    '  │   x    │',
    '  │───────►│',
    '  │  bye   │',
    '  │───────►│',
    '  │ after',
    '  │─┐',
    '  │◄┘',
  ])
})
test('A2: alt draws a titled frame two columns beyond its lifelines, and else a ┄ divider row carrying [cond]', () => {
  const d = L('autonumber 10 5\nalt ok\nA->>B: a\nelse no\nA->>B: b\nend')
  assert.equal(validate(d), null)
  assert.deepEqual(text(d), [
    '[ A ]    [ B ]',
    '┌─alt [ok]───┐',
    '│ │ 10. a  │ │',
    '│ │───────►│ │',
    '├┄[no]┄┄┄┄┄┄┄┤',
    '│ │ 15. b  │ │',
    '│ │───────►│ │',
    '└────────────┘',
  ])
})
test('A2: every frame type is titled type [cond]; each and/option/else section adds a divider; no cond, no brackets', () => {
  const d = L(
    'opt maybe\nA->>B: o\nend\nloop every 5s\nA->>B: l\nend\npar one\nA->>B: p\nand two\nA->>B: q\nend\n' +
      'critical lock\nA->>B: c\noption fail\nA->>B: f\nend\nbreak stop\nA->>B: s\nend\nalt\nA->>B: a\nelse\nA->>B: b\nend',
  )
  assert.equal(validate(d), null)
  const t = text(d).join('\n')
  for (const s of [
    'opt [maybe]',
    'loop [every 5s]',
    'par [one]',
    '[two]',
    'critical [lock]',
    '[fail]',
    'break [stop]',
    '┌─alt─',
    '├┄┄┄',
  ]) {
    assert.ok(t.includes(s), s)
  }
})
test('A2: rect draws an untitled note frame, and box a titled frame around its pills from above the header', () => {
  const d = L('box Back\nparticipant A\nparticipant B\nend\nrect rgb(1,2,3)\nA->>B: x\nend')
  assert.equal(validate(d), null)
  assert.deepEqual(text(d), [
    '┌─Back────────┐',
    '│ [ A ] [ B ] │',
    '│ ┌─────────┐ │',
    '│ │ │  x  │ │ │',
    '│ │ │────►│ │ │',
    '│ └─────────┘ │',
    '└─────────────┘',
  ])
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
  const m = parseSequence(
    readSource('sequenceDiagram\nA->>B: a long label that will need wrapping here') as Source,
  ) as any
  assert.deepEqual(validate(sequence.layout(m, 'tight', 30) as any), { reason: 'row-too-wide' })
  const r = fitLadder(sequence, m, 30) as any
  assert.equal(r.step, 'wrap')
  assert.deepEqual(text(r.drawing), [
    '[ A ]                   [ B ]',
    '  │a long label that will │',
    '  │  need wrapping here   │',
    '  │──────────────────────►│',
  ])
})
test('A2: a message line and its label replace the lifelines they cross', () => {
  const d = L('participant A\nparticipant B\nparticipant C\nA->>C: far')
  assert.equal(validate(d), null)
  assert.deepEqual(text(d), ['[ A ] [ B ] [ C ]', '  │    far    │', '  │──────────►│'])
})
const X = (t: string, w = 60) => explain(`sequenceDiagram\n${t}`, { columns: w, theme: 'mono' }) as any
test("A2: a participant a self-message creates has its pill on that message's row and its lifeline below it", () => {
  const r = X('A->>A: before\ncreate participant B\nB->>B: init')
  assert.equal(validate(r.drawing), null)
  assert.deepEqual(text(r.drawing), [
    '[ A ]',
    '  │ before',
    '  │─┐',
    '  │◄┘',
    '  │             init',
    '  │       [ B ]─┐',
    '  │         │◄──┘',
  ])
})
test('A2: create falls back unless the next message is sent to the created participant', () => {
  for (const t of ['create participant B\nA->>C: x\nA->>B: y', 'create participant B\nB->>A: x']) {
    assert.deepEqual(X(t), { reason: 'create' }, t)
  }
})
test('A2: autonumber falls back when a number, its start or its step is not a safe integer', () => {
  assert.equal(X('autonumber 9007199254740989\nA->>B: a\nA->>B: b\nA->>B: c').step, 'natural')
  for (const t of [
    'autonumber 9007199254740991\nA->>B: a\nA->>B: b\nA->>B: c',
    'autonumber 1 9007199254740992\nA->>B: a',
    'autonumber 9007199254740993\nA->>B: a',
  ]) {
    assert.deepEqual(X(t), { reason: 'autonumber' }, t)
  }
})
test('A2: a box with no participants falls back', () =>
  assert.deepEqual(X('box Lost\nend\nA->>B: hi'), { reason: 'empty-box' }))
test('A2: a leftward cross, dotted or solid, puts its x beside the recipient on the left', () => {
  const d = L('participant A\nparticipant B\nB--xA: d\nB-xA: s')
  assert.equal(validate(d), null)
  assert.deepEqual(text(d).slice(1), ['  │  d  │', '  │x┄┄┄┄│', '  │  s  │', '  │x────│'])
})
test('A2: a message label crossing a box border sits between two borders, never on one', () => {
  const d = L('box G\nparticipant A\nend\nA->>B: a longer label')
  assert.equal(validate(d), null)
  assert.deepEqual(text(d), [
    '┌─G─────┐',
    '│ [ A ] │               [ B ]',
    '│   │   │ a longer label  │',
    '│   │────────────────────►│',
    '└───────┘',
  ])
})
// Each label cell (text, cont, fill or cap) on another owner's frame border, or beside one of its sides.
function touching(d: any): string[] {
  const rects = new Map<string, number[]>()
  const out: string[] = []
  d.cells.forEach((row: any[], y: number) =>
    row.forEach((c: any, x: number) => {
      if (c?.kind !== 'frame') {
        return
      }
      const b = rects.get(c.owners[0]) ?? [y, y, x, x]
      rects.set(c.owners[0], [Math.min(b[0]!, y), Math.max(b[1]!, y), Math.min(b[2]!, x), Math.max(b[3]!, x)])
    }),
  )
  d.cells.forEach((row: any[], y: number) =>
    row.forEach((c: any, x: number) => {
      if (!['text', 'cont', 'fill', 'cap'].includes(c?.kind)) {
        return
      }
      for (const [o, [t, b, l, r]] of rects) {
        const on =
          y === t || y === b ? x >= l! && x <= r! : y > t! && y < b! && [l!, r!].some((k) => Math.abs(x - k) <= 1)
        if (on && o !== c.owners[0]) {
          out.push(`${c.owners[0]} r${y} c${x} on ${o}`)
        }
      }
    }),
  )
  return out
}
test('A2: no sequence golden draws a label on a frame border or beside one of its sides', () => {
  for (const f of readdirSync('fixtures/sequence').filter((f) => f.includes('-ok-'))) {
    for (const w of [60, 80, 120]) {
      const r = explain(readFileSync(`fixtures/sequence/${f}`, 'utf8'), { columns: w, theme: 'mono' }) as any
      assert.deepEqual(touching(r.drawing), [], `${f}@${w}`)
    }
  }
})
// vr-A: mono has no fill, so a note must show itself by glyphs: ┆ caps either side of each line, the note's own.
const mono = (t: string) => (explain(`sequenceDiagram\n${t}`, { columns: 60, theme: 'mono' }) as any).drawing
test('A2: in mono a note reads apart from a message label: Note right of A then A->>B differs from A->>B: n<br/>x', () => {
  const a = mono('Note right of A: n\nA->>B: x')
  const b = mono('A->>B: n<br/>x')
  assert.equal(validate(a), null)
  assert.equal(validate(b), null)
  assert.notDeepEqual(text(a), text(b))
})
test('A2: each note line is framed by ┆ caps in the note role, owned by the note', () => {
  const d = L('participant A\nparticipant B\nNote over A,B: hi<br/>there')
  assert.equal(validate(d), null)
  const rows = d.cells.filter((row: any[]) => row.some((c) => c?.kind === 'text' && c.owners[0] === 'n0'))
  assert.equal(rows.length, 2)
  for (const row of rows) {
    const caps = row.filter((c: any) => c?.kind === 'cap' && c.owners[0] === 'n0')
    assert.deepEqual(
      caps.map((c: any) => [c.ch, c.role]),
      [
        ['┆', 'note'],
        ['┆', 'note'],
      ],
    )
  }
})
test('A2: validate rejects a note ┆ cap removed, given to another owner, or redrawn', () => {
  for (const src of [
    'Note right of A: n\nA->>B: x',
    'A->>B: hi\nNote over A,B: n<br/>m',
    'A->>B: hi\nNote left of A: n',
  ]) {
    const d = mono(src)
    const caps = d.cells.flatMap((row: any[], r: number) =>
      row.flatMap((c: any, k: number) => (c?.kind === 'cap' && /^n\d/.test(c.owners[0]) ? [[r, k]] : [])),
    )
    assert.ok(caps.length >= 2, src)
    for (const [r, k] of caps) {
      const old = d.cells[r][k]
      for (const x of [null, { ...old, owners: ['A'] }, { ...old, ch: '│' }, { ...old, kind: 'fill', ch: ' ' }]) {
        d.cells[r][k] = x
        assert.notEqual(validate(d), null, `${src} (${r},${k}) ${JSON.stringify(x)}`)
        d.cells[r][k] = old
      }
    }
  }
})
// A box and the frames inside or beside it. A box's border stands a blank column clear of every frame it holds and
// every frame beside it, however deep they nest; a rect that would cross a box's border still falls back.
test('A2: nested rects inside a box draw, the box border a blank column beyond the outer rect', () => {
  for (const t of [
    'box Team\nparticipant A\nparticipant B\nend\nparticipant C\nrect\nA->>B: hi\nrect\nB->>A: back\nend\nend\nB->>C: yo',
    'box Team\nparticipant A\nparticipant B\nend\nrect\nrect\nrect\nA->>B: deep\nend\nend\nend',
  ]) {
    const r = X(t, 80)
    assert.ok(!('reason' in r), `${t}: ${r.reason}`)
    assert.equal(validate(r.drawing), null, t)
  }
})
test('A2: nested rects beside a box draw, clear of its border', () => {
  const r = X('box L\nparticipant A\nend\nparticipant B\nparticipant C\nrect\nrect\nB->>C: hi\nend\nend', 80)
  assert.ok(!('reason' in r), r.reason)
  assert.equal(validate(r.drawing), null)
})
test('A2: a rect from one box into another, which would cross both borders, falls back', () => {
  assert.deepEqual(X('box L\nparticipant A\nend\nbox R\nparticipant B\nend\nrect\nA->>B: hi\nend', 80), {
    reason: 'box-frame',
  })
})
// A frame in a boxed diagram draws only where Mermaid 12.2.0's own geometry keeps it inside a box, or clear of
// it, whatever the text widths; a self-message, a note on one lifeline, a deactivation outside the frame's run, or nesting
// that reaches the box's border falls back. Each repro was checked against Mermaid 12.2.0.
const TEAM = 'box Team\nparticipant A\nparticipant B\nend\n'
const nest = (n: number, body: string) => `${'rect\n'.repeat(n)}${body}\n${'end\n'.repeat(n)}`
test('A2: in a boxed diagram, a frame Mermaid draws other than we would falls back with box-frame', () => {
  for (const t of [
    `${TEAM}rect\nrect\nA->>A: self\nend\nend`,
    `${TEAM}participant C\nrect\nrect\nactivate C\nA->>B: hi\ndeactivate C\nend\nend`,
    `${TEAM}rect\nrect\nrect\nA->>A: self\nA->>B: next\nend\nend\nend`,
    `${TEAM}${nest(10, 'A->>B: hi')}`,
    'box L\nparticipant A\nend\nbox R\nparticipant B\nend\nrect\nA->>B: hi\nend',
  ]) {
    for (const w of [60, 80, 120]) {
      assert.deepEqual(X(t, w), { reason: 'box-frame' }, `${t}@${w}`)
    }
  }
})
test('A2: nine nested rects inside a box draw: Mermaid keeps the outer one 9 px inside the box', () => {
  const r = X(`${TEAM}${nest(9, 'A->>B: hi')}`, 120)
  assert.ok(!('reason' in r), r.reason)
  assert.equal(validate(r.drawing), null)
})
test('A2: in a boxed diagram, a frame a wide note widens over a lifeline beyond its run falls back with box-frame', () => {
  // Mermaid's rect covers C and D only (its note spans their centers ± 25 px); ours would reach over E's lifeline.
  const t = `participant C\nparticipant D\nparticipant E\nparticipant F\nparticipant G\nparticipant H\nbox Team\nparticipant A\nend\nrect\nNote over C,D: ${'x'.repeat(20)}\nend\nE->>F: x`
  assert.deepEqual(L(t), { reason: 'box-frame' })
  // The ladder reports its last step's reason: wrap cannot fit the 20-letter word.
  for (const w of [60, 80, 120]) {
    assert.ok('reason' in X(t, w), `@${w}`)
  }
})
// Without a box, a frame covers exactly the lifelines Mermaid 12.2.0's frame covers, or the diagram falls back. Mermaid
// sizes a frame to its contents' bounds, 10 px beyond them per frame open inside it; a self-message reaches max(text / 2,
// 75) px from its lifeline and a note on one lifeline its own width, each widening only the gap on one side.
test('A2: without a box, a frame that a self-message or a wide note widens over a lifeline Mermaid leaves out falls back', () => {
  // Repro 1: Mermaid's outer rect ends at x=171, B at 275; ours enclosed B.
  assert.deepEqual(L('participant A\nparticipant B\nrect\nrect\nA->>A: self\nend\nend'), { reason: 'frame-extent' })
  // Repro 2: Mermaid's rect covers B only, x=175 to 375; ours enclosed A to D.
  const two =
    'participant A\nparticipant B\nparticipant C\nparticipant D\nrect\nNote over B: xxxxxxxxxxxxxxxxxxxx\nend\nC->>D: x'
  assert.deepEqual(L(two), { reason: 'frame-extent' })
  for (const t of ['participant A\nparticipant B\nrect\nrect\nA->>A: self\nend\nend', two]) {
    for (const w of [60, 80, 120]) {
      assert.ok('reason' in X(t, w), `${t}@${w}`)
    }
  }
})
test('A2: without a box, a frame whose Mermaid edge turns on text width beside a lifeline falls back', () => {
  for (const t of [
    // A self-message's text widens no gap on its left: a long one reaches over A.
    'participant A\nparticipant B\nA->>B: go\nrect\nB->>B: self\nend',
    // A note right of A is as wide as A's pill or its text, so it may reach B.
    'participant A\nparticipant B\nparticipant C\nrect\nNote right of A: n\nA->>B: x\nend\nB->>C: y',
    // A note over one lifeline, 5 frames deep: 50 px beyond it, as far as its gap is sure to reach.
    `participant A\nparticipant B\nparticipant C\nA->>C: x\n${'rect\n'.repeat(5)}Note over B: n\n${'end\n'.repeat(5)}`,
  ]) {
    assert.deepEqual(L(t), { reason: 'frame-extent' }, t)
  }
})
test("A2: without a box, a self-message or a one-lifeline note draws where Mermaid's gaps keep its frame off the next lifeline", () => {
  for (const t of [
    'participant A\nparticipant B\nrect\nA->>A: self\nA->>B: x\nend',
    'participant A\nparticipant B\nrect\nNote right of A: n\nA->>B: x\nend',
    'participant A\nparticipant B\nparticipant C\nA->>C: x\nrect\nNote over B: n\nend',
  ]) {
    const d = L(t)
    assert.ok(!('reason' in d), `${t}: ${d.reason}`)
    assert.equal(validate(d), null, t)
  }
})
test('A2: without a box, nested frames around a note over one lifeline fall back where our gaps cannot keep them off its neighbours', () => {
  // Mermaid's two rects cover B only; ours would need wider gaps than measure gives a note over one lifeline.
  assert.deepEqual(
    L(
      `participant A\nparticipant B\nparticipant C\nA->>C: x\n${'rect\n'.repeat(2)}Note over B: n\n${'end\n'.repeat(2)}`,
    ),
    { reason: 'frame-extent' },
  )
})
