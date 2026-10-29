import test from 'node:test'; import assert from 'node:assert/strict'
import { parseSequence } from '../../core/diagrams/sequence/parse.ts'; import { readSource, type Source } from '../../core/source.ts'
const P = (t: string) => parseSequence(readSource(`sequenceDiagram\n${t}`) as Source) as any
test('A2: participants, actors and aliases keep declaration order', () => assert.deepEqual(
  P('participant B\nactor A as Alice\nB->>C: hi').participants.map((p: any) => [p.id, p.kind, p.label]),
  [['B', 'participant', 'B'], ['A', 'actor', 'Alice'], ['C', 'participant', 'C']]))
test('A2: ten arrows; activations, notes, frames, autonumber, create, destroy', () => {
  const A = ['->>', '-->>', '->', '-->', '-x', '--x', '-)', '--)', '<<->>', '<<-->>']
  assert.deepEqual(A.map(a => { const m = P(`A${a}B: t`).items[0]; return `${m.line} ${m.tail} ${m.head}` }), ['solid none arrow', 'dotted none arrow',
    'solid none open', 'dotted none open', 'solid none cross', 'dotted none cross', 'solid none async', 'dotted none async', 'solid arrow arrow', 'dotted arrow arrow'])
  const s = P('autonumber 10 5\nA->>+B: x\nB-->>-A: y\nNote over A,B: n\nalt ok\nA->>B: a\nelse no\nA->>B: b\nend\ncreate participant C\nA->>C: c\ndestroy C\nA-xC: bye')
  assert.deepEqual([s.autonumber, s.items.map((i: any) => i.kind)], [{ start: 10, step: 5 }, ['msg', 'msg', 'note', 'frame', 'create', 'msg', 'destroy', 'msg']])
  assert.deepEqual([s.items[0].activate, s.items[1].deactivate, s.items[3].sections.map((x: any) => x.cond)], [true, true, ['ok', 'no']]); assert.equal(P('title Checkout\nA->>B: x').title, 'Checkout')
})
test('A5.errors: malformed, order, box and ZWJ rejections', () => {
  assert.match((parseSequence(readSource('---\ntitle: A\n---\nsequenceDiagram\ntitle B\nA->>B: x') as Source) as any).reason, /^title/)  // frontmatter title + statement
  for (const [t, r] of [['A->>: hi', /^syntax:2/], ['loop x\nA->>B: y', /^unclosed-frame/], ['create participant C\nA->>B: x', /^create/],
    ['destroy B\nA-xB: bye\nA->>B: again', /^destroyed/], ['A->>C: hi\nbox G\nparticipant A\nparticipant B\nend', /^box-split/],
    ['title A\ntitle B\nA->>B: x', /^title/],
    ['A->>B: 👨‍👩', /^unsupported-char/]] as const) assert.match(P(t).reason, r, t)
})

// Beyond the plan's three: each matrix row this task covers, checked whole, then each rule's edges.

// Model builders; they do not assert. A message takes ->>'s line and ends unless o overrides them.
const part = (id: string, kind = 'participant', label = id) => ({ id, kind, label })
const msg = (from: string, to: string, text: string, o: object = {}) =>
  ({ kind: 'msg', from, to, line: 'solid', tail: 'none', head: 'arrow', text, activate: false, deactivate: false, ...o })
const note = (side: string, ids: string[], text: string) => ({ kind: 'note', side, ids, text })
const frame = (type: string, ...sections: [string | null, object[]][]) => ({ kind: 'frame', type, sections: sections.map(([cond, items]) => ({ cond, items })) })
const mark = (kind: string, id: string) => ({ kind, id })
const seq = (participants: object[], items: object[], o: object = {}) => ({ title: null, participants, boxes: [], autonumber: null, items, ...o })
const AB = [part('A'), part('B')]

// [matrix row, fence body after the header, the exact model].
const OK: [string, string, object][] = [
  ['sequence-ok-01', 'participant B\nparticipant A\nA->>B: hi', seq([part('B'), part('A')], [msg('A', 'B', 'hi')])],
  ['sequence-ok-02', 'actor B\nactor A\nA->>B: hi', seq([part('B', 'actor'), part('A', 'actor')], [msg('A', 'B', 'hi')])],
  ['sequence-ok-03', 'participant A as Alice\nactor B as Bob\nA->>B: hi', seq([part('A', 'participant', 'Alice'), part('B', 'actor', 'Bob')], [msg('A', 'B', 'hi')])],
  ['sequence-ok-04', 'A->>B: t', seq(AB, [msg('A', 'B', 't')])],
  ['sequence-ok-05', 'A-->>B: t', seq(AB, [msg('A', 'B', 't', { line: 'dotted' })])],
  ['sequence-ok-06', 'A->B: t', seq(AB, [msg('A', 'B', 't', { head: 'open' })])],
  ['sequence-ok-07', 'A-->B: t', seq(AB, [msg('A', 'B', 't', { line: 'dotted', head: 'open' })])],
  ['sequence-ok-08', 'A-xB: t', seq(AB, [msg('A', 'B', 't', { head: 'cross' })])],
  ['sequence-ok-09', 'A--xB: t', seq(AB, [msg('A', 'B', 't', { line: 'dotted', head: 'cross' })])],
  ['sequence-ok-10', 'A-)B: t', seq(AB, [msg('A', 'B', 't', { head: 'async' })])],
  ['sequence-ok-11', 'A--)B: t', seq(AB, [msg('A', 'B', 't', { line: 'dotted', head: 'async' })])],
  ['sequence-ok-12', 'A->>A: x', seq([part('A')], [msg('A', 'A', 'x')])],
  ['sequence-ok-13', 'A->>+B: a\nA->>+B: b\nB-->>-A: c\nB-->>-A: d', seq(AB, [msg('A', 'B', 'a', { activate: true }), msg('A', 'B', 'b', { activate: true }),
    msg('B', 'A', 'c', { line: 'dotted', deactivate: true }), msg('B', 'A', 'd', { line: 'dotted', deactivate: true })])],
  ['sequence-ok-14', 'A->>B: hi\nNote left of A: n', seq(AB, [msg('A', 'B', 'hi'), note('left of', ['A'], 'n')])],
  ['sequence-ok-15', 'A->>B: hi\nNote right of B: n', seq(AB, [msg('A', 'B', 'hi'), note('right of', ['B'], 'n')])],
  ['sequence-ok-16', 'A->>B: hi\nNote over A: n', seq(AB, [msg('A', 'B', 'hi'), note('over', ['A'], 'n')])],
  ['sequence-ok-17', 'A->>B: hi\nNote over A,B: n', seq(AB, [msg('A', 'B', 'hi'), note('over', ['A', 'B'], 'n')])],
  ['sequence-ok-18', 'alt ok\nA->>B: a\nelse no\nA->>B: b\nend', seq(AB, [frame('alt', ['ok', [msg('A', 'B', 'a')]], ['no', [msg('A', 'B', 'b')]])])],
  ['sequence-ok-19', 'opt maybe\nA->>B: a\nend', seq(AB, [frame('opt', ['maybe', [msg('A', 'B', 'a')]])])],
  ['sequence-ok-20', 'loop every s\nA->>B: a\nend', seq(AB, [frame('loop', ['every s', [msg('A', 'B', 'a')]])])],
  ['sequence-ok-21', 'par one\nA->>B: a\nand two\nA->>B: b\nend', seq(AB, [frame('par', ['one', [msg('A', 'B', 'a')]], ['two', [msg('A', 'B', 'b')]])])],
  ['sequence-ok-22', 'critical lock\nA->>B: a\noption fail\nA->>B: b\nend', seq(AB, [frame('critical', ['lock', [msg('A', 'B', 'a')]], ['fail', [msg('A', 'B', 'b')]])])],
  ['sequence-ok-23', 'break stop\nA->>B: a\nend', seq(AB, [frame('break', ['stop', [msg('A', 'B', 'a')]])])],
  ['sequence-ok-24', 'alt ok\nloop retry\nA->>B: a\nend\nelse no\nA->>B: b\nend',
    seq(AB, [frame('alt', ['ok', [frame('loop', ['retry', [msg('A', 'B', 'a')]])]], ['no', [msg('A', 'B', 'b')]])])],
  ['sequence-ok-25', 'autonumber\nA->>B: a\nB-->>A: b', seq(AB, [msg('A', 'B', 'a'), msg('B', 'A', 'b', { line: 'dotted' })], { autonumber: { start: 1, step: 1 } })],
  ['sequence-ok-30', 'participant A as Same\nparticipant B as Same\nA->>B: hi', seq([part('A', 'participant', 'Same'), part('B', 'participant', 'Same')], [msg('A', 'B', 'hi')])],
  ['sequence-ok-31', 'A->>B: a\nactivate B\nactivate B\nB-->>A: b\ndeactivate B\ndeactivate B',
    seq(AB, [msg('A', 'B', 'a'), mark('activate', 'B'), mark('activate', 'B'), msg('B', 'A', 'b', { line: 'dotted' }), mark('deactivate', 'B'), mark('deactivate', 'B')])],
  ['sequence-ok-32', 'autonumber 10 5\nA->>B: a\nB->>A: b\nA->>B: c', seq(AB, [msg('A', 'B', 'a'), msg('B', 'A', 'b'), msg('A', 'B', 'c')], { autonumber: { start: 10, step: 5 } })],
  ['sequence-ok-33', 'rect rgb(191, 223, 255)\nA->>B: a\nrect rgb(200, 150, 255)\nNote over A: n\nend\nB-->>A: b\nend',
    seq(AB, [frame('rect', [null, [msg('A', 'B', 'a'), frame('rect', [null, [note('over', ['A'], 'n')]]), msg('B', 'A', 'b', { line: 'dotted' })]])])],
  ['sequence-ok-34', 'box Purple Alice & John\nparticipant A\nparticipant J\nend\nbox Another Group\nparticipant B\nparticipant C\nend\n' +
    'A->>J: Hello John, how are you?\nJ->>A: Great!\nA->>B: Hello Bob, how is Charley?\nB->>C: Hello Charley, how are you?',
    seq([part('A'), part('J'), part('B'), part('C')], [msg('A', 'J', 'Hello John, how are you?'), msg('J', 'A', 'Great!'), msg('A', 'B', 'Hello Bob, how is Charley?'),
      msg('B', 'C', 'Hello Charley, how are you?')], { boxes: [{ label: 'Alice & John', ids: ['A', 'J'] }, { label: 'Another Group', ids: ['B', 'C'] }] })],
  ['sequence-ok-35', 'Alice->>Bob: Hello Bob, how are you ?\nBob->>Alice: Fine, thank you. And you?\ncreate participant Carl\nAlice->>Carl: Hi Carl!\n' +
    'create actor D as Donald\nCarl->>D: Hi!\ndestroy Carl\nAlice-xCarl: We are too many\ndestroy Bob\nBob->>Alice: I agree',
    seq([part('Alice'), part('Bob'), part('Carl'), part('D', 'actor', 'Donald')], [msg('Alice', 'Bob', 'Hello Bob, how are you ?'), msg('Bob', 'Alice', 'Fine, thank you. And you?'),
      mark('create', 'Carl'), msg('Alice', 'Carl', 'Hi Carl!'), mark('create', 'D'), msg('Carl', 'D', 'Hi!'), mark('destroy', 'Carl'),
      msg('Alice', 'Carl', 'We are too many', { head: 'cross' }), mark('destroy', 'Bob'), msg('Bob', 'Alice', 'I agree')])],
  ['sequence-ok-36', 'A<<->>B: hi', seq(AB, [msg('A', 'B', 'hi', { tail: 'arrow' })])],
  ['sequence-ok-37', 'A<<-->>B: hi', seq(AB, [msg('A', 'B', 'hi', { line: 'dotted', tail: 'arrow' })])],
  ['sequence-ok-39', 'title Checkout\nA->>B: x', seq(AB, [msg('A', 'B', 'x')], { title: 'Checkout' })],
]
// [matrix row, whole fence body, the exact reason].
const REJECT: [string, string, string][] = [
  ['sequence-reject-01', 'sequenceDiagram\nA->>: hi', 'syntax:2'],
  ['sequence-reject-02', 'sequenceDiagram\nloop every s\nA->>B: hi', 'unclosed-frame'],
  ['sequence-reject-03', 'sequenceDiagram\nA->>B: \u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}', 'unsupported-char U+200D'],
  ['sequence-reject-05', 'sequenceDiagram\ncreate participant C\nA->>B: hi', 'create'],
  ['sequence-reject-06', 'sequenceDiagram\ndestroy B\nA-xB: bye\nA->>B: again', 'destroyed'],
  ['sequence-reject-07', 'sequenceDiagram\nA->>C: hi\nbox G\nparticipant A\nparticipant B\nend', 'box-split'],
  ['sequence-reject-08', '---\ntitle: Checkout\n---\nsequenceDiagram\ntitle Payment\nA->>B: hi', 'title'],
]

test('A2: every covered sequence-ok row, 01-25, 30-37 and 39, parses to its exact model', () => {
  assert.deepEqual(OK.map(([id]) => id), '01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 30 31 32 33 34 35 36 37 39'.split(' ').map(n => `sequence-ok-${n}`))
  for (const [id, body, want] of OK) assert.deepEqual([id, P(body)], [id, want])
})
test('A5.errors: every covered sequence-reject row, 01-03 and 05-08, fails with its exact reason', () => {
  assert.deepEqual(REJECT.map(([id]) => id), '01 02 03 05 06 07 08'.split(' ').map(n => `sequence-reject-${n}`))
  for (const [id, text, reason] of REJECT) assert.deepEqual([id, parseSequence(readSource(text) as Source)], [id, { reason }])
})

// The 148 CSS named colors of CSS Color 4: the test's own copy, checked against the W3C list, not read from the parser.
const CSS_NAMED = `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral
  cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange
  darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey
  dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo
  ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink
  lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine
  mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose
  moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff
  peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue
  slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen`.split(/\s+/)
// The label of a box whose line is `box ${rest}`; it does not assert.
const boxLabelOf = (rest: string) => P(`box ${rest}\nparticipant A\nend\nA->>A: x`).boxes[0].label

test('A2: a box label drops a leading CSS color: any of the 148 named colors in any case, transparent, #hex, rgb(), rgba(), hsl() or hsla()', () => {
  assert.deepEqual([CSS_NAMED.length, new Set(CSS_NAMED).size], [148, 148])
  assert.deepEqual(CSS_NAMED.flatMap(c => [boxLabelOf(`${c} Team`), boxLabelOf(`${c.toUpperCase()} Team`)]), CSS_NAMED.flatMap(() => ['Team', 'Team']))
  assert.deepEqual(['Purple Alice & John', 'Aqua Group Description', 'transparent Team', 'Transparent Team', '#abc Team', '#ABCD Team', '#a1b2c3 Team', '#A1B2C3D4 Team',
    'rgb(1,2,3) Team', 'rgba(33,66,99,0.5) Team', 'hsl(10, 40%, 90%) Team', 'hsla(10, 40%, 90%, 0.5)   Team'].map(boxLabelOf),
  ['Alice & John', 'Group Description', 'Team', 'Team', 'Team', 'Team', 'Team', 'Team', 'Team', 'Team', 'Team', 'Team'])
  // A color alone leaves no label, as does a bare box.
  assert.deepEqual(['Aqua', 'TRANSPARENT', '#abc', 'rgb(33,66,99)', 'hsla(10, 40%, 90%, 0.5)', ''].map(boxLabelOf), [null, null, null, null, null, null])
})
test('A2: a box label keeps a leading word that is not a whole CSS color: a color ends at a space or the line end, and rgb() and hsl() are lowercase', () => {
  const kept = ['Another Group', 'Group without description', 'Redwood Team', 'Red-team', 'currentColor Team', '#ab Team', '#abcde Team', '#ggg Team', '#abcTeam',
    'RGB(1,2,3) Team', 'rgb (1,2,3) Team', 'rgb(1,2,3)Team', 'rgb(calc(1),2,3) Team']
  assert.deepEqual(kept.map(boxLabelOf), kept)
})

test('A2: par takes any number of and sections, critical of option sections, alt of else sections; a missing condition is null', () => {
  assert.deepEqual(P('par a\nA->>B: 1\nand b\nA->>B: 2\nand c\nA->>B: 3\nend').items,
    [frame('par', ['a', [msg('A', 'B', '1')]], ['b', [msg('A', 'B', '2')]], ['c', [msg('A', 'B', '3')]])])
  assert.deepEqual(P('critical lock\nA->>B: 1\noption x\nA->>B: 2\noption y\nA->>B: 3\nend').items,
    [frame('critical', ['lock', [msg('A', 'B', '1')]], ['x', [msg('A', 'B', '2')]], ['y', [msg('A', 'B', '3')]])])
  assert.deepEqual(P('alt\nA->>B: 1\nelse\nA->>B: 2\nend').items, [frame('alt', [null, [msg('A', 'B', '1')]], [null, [msg('A', 'B', '2')]])])
})
test('A5.errors: else, and and option divide only an innermost alt, par and critical; end needs an open frame', () => {
  const bad: [string, string][] = [['else x\nA->>B: y', 'syntax:2'], ['alt a\nA->>B: x\nand b\nend', 'syntax:4'], ['par a\nA->>B: x\noption b\nend', 'syntax:4'],
    ['critical a\nA->>B: x\nelse b\nend', 'syntax:4'], ['alt a\nloop l\nA->>B: x\nelse b\nend\nend', 'syntax:5'], ['A->>B: x\nend', 'syntax:3'],
    ['loop l\nA->>B: x\nend\nend', 'syntax:5']]
  assert.deepEqual(bad.map(([t]) => [t, P(t)]), bad.map(([t, r]) => [t, { reason: r }]))
})
test('A2: rect takes any color text, which is not drawn, holds any statement but box, and nests; a box may sit in another frame', () => {
  assert.deepEqual(P('rect rgba(0, 0, 255, .1)\nA->>B: a\nrect Aqua\nalt x\nA->>B: b\nend\nend\nend').items,
    [frame('rect', [null, [msg('A', 'B', 'a'), frame('rect', [null, [frame('alt', ['x', [msg('A', 'B', 'b')]])]])]])])
  assert.deepEqual(P('alt x\nbox G\nparticipant A\nend\nA->>B: y\nend'), seq(AB, [frame('alt', ['x', [msg('A', 'B', 'y')]])], { boxes: [{ label: 'G', ids: ['A'] }] }))
})
test('A5.errors: rect needs a color; a box holds only participant and actor lines, sits in no rect, and must end', () => {
  const bad: [string, string][] = [['rect\nA->>B: x\nend', 'syntax:2'], ['rect red\nbox G\nparticipant A\nend\nend', 'syntax:3'],
    ['rect red\nalt x\nbox G\nparticipant A\nend\nend\nend', 'syntax:4'], ['box G\nparticipant A\nA->>B: x\nend', 'syntax:4'],
    ['box G\ncreate participant A\nend', 'syntax:3'], ['box G\nbox H\nend\nend', 'syntax:3'], ['box G\nNote over A: n\nend', 'syntax:3'],
    ['box G\ndestroy A\nend', 'syntax:3'], ['box G\nparticipant A', 'unclosed-frame']]
  assert.deepEqual(bad.map(([t]) => [t, P(t)]), bad.map(([t, r]) => [t, { reason: r }]))
})

test('A2: a note sits left of or right of one participant, or over one or two; spaces around , and : are free', () => {
  assert.deepEqual(P('A->>B: x\nNote left of A: a\nNote right of B :b\nNote over A , B: c: d<br/>e').items.slice(1),
    [note('left of', ['A'], 'a'), note('right of', ['B'], 'b'), note('over', ['A', 'B'], 'c: d<br/>e')])
})
test('A5.errors: only over takes two participants; Note is case-sensitive and needs its colon and one space in left of', () => {
  const bad = ['Note left of A,B: n', 'Note right of A, B: n', 'Note over A,B,C: n', 'note over A: n', 'NOTE over A: n', 'Note over A', 'Note left  of A: n']
  assert.deepEqual(bad.map(t => [t, P(t)]), bad.map(t => [t, { reason: 'syntax:2' }]))
})
test('A2: the message after destroy X may have X at either end', () => {
  assert.deepEqual(P('A->>B: x\ndestroy A\nA-xB: bye').items, [msg('A', 'B', 'x'), mark('destroy', 'A'), msg('A', 'B', 'bye', { head: 'cross' })])
  assert.deepEqual(P('A->>B: x\ndestroy A\nB-xA: bye').items, [msg('A', 'B', 'x'), mark('destroy', 'A'), msg('B', 'A', 'bye', { head: 'cross' })])
})
test('A5.errors: destroy fails unless the next message has X at one end; create, on a known id or unless the next message targets X; destroyed, on any later mention', () => {
  const bad: [string, string][] = [['A->>B: x\ndestroy B\nA->>C: y', 'destroy'], ['A->>B: x\ndestroy B', 'destroy'], ['A->>B: x\ndestroy B\nNote over B: n', 'destroy'],
    ['A->>B: x\ncreate participant C', 'create'], ['A->>B: x\ncreate participant B\nA->>B: y', 'create'], ['create participant C\nC->>A: hi', 'create'],
    ['create participant C\ncreate participant D\nA->>C: x\nA->>D: y', 'create'], ['destroy B\nA-xB: bye\nNote over B: n', 'destroyed'],
    ['destroy B\nA-xB: bye\ncreate participant B\nA->>B: hi', 'destroyed'], ['destroy B\nA-xB: bye\nactivate B', 'destroyed']]
  assert.deepEqual(bad.map(([t]) => [t, P(t)]), bad.map(([t, r]) => [t, { reason: r }]))
})
test('A2: autonumber takes no number (1 1), a start (step 1), or a start and a step', () => {
  assert.deepEqual(['autonumber', 'autonumber 7', 'autonumber  10   5'].map(a => P(`${a}\nA->>B: x`).autonumber), [{ start: 1, step: 1 }, { start: 7, step: 1 }, { start: 10, step: 5 }])
})
test('A5.errors: autonumber off, a fraction, a sign or a third number falls back', () => {
  const bad = ['autonumber off', 'autonumber 1.5', 'autonumber -1', 'autonumber 1 2 3', 'autonumber 1 x'].map(a => `${a}\nA->>B: x`)
  assert.deepEqual(bad.map(t => [t, P(t)]), bad.map(t => [t, { reason: 'syntax:2' }]))
})

test('A2: message text runs from the first colon after the target and keeps later colons and <br/>; spaces between ids, arrow, +/- and : are free', () => {
  const ok = ['A->>B: a: b<br/>c', 'A->>B:', 'A->>B:x', 'A ->> B : y ', 'A->> +B: z', 'B -->>  - A :w']
  assert.deepEqual(ok.map(t => P(t).items[0]), [msg('A', 'B', 'a: b<br/>c'), msg('A', 'B', ''), msg('A', 'B', 'x'), msg('A', 'B', 'y'),
    msg('A', 'B', 'z', { activate: true }), msg('B', 'A', 'w', { line: 'dotted', deactivate: true })])
})
test('A5.errors: a message needs one id at each end of an unbroken arrow, at most one of + and -, and its colon', () => {
  const bad = ['A - >> B: x', 'A->>B x', 'A->>+-B: x', 'A->>B C: x', 'A B->>C: x', '->>B: x']
  assert.deepEqual(bad.map(t => [t, P(t)]), bad.map(t => [t, { reason: 'syntax:2' }]))
})
test('A2: activate and deactivate are items of their own, apart from any message', () => {
  assert.deepEqual(P('activate A\nA->>B: x\ndeactivate A').items, [mark('activate', 'A'), msg('A', 'B', 'x'), mark('deactivate', 'A')])
})
test('A2: CJK ids and labels are letters like any other', () => {
  assert.deepEqual(P('participant 用户 as 终端用户\nactor 서버 as サーバー\n用户->>서버: 读取配置\nNote over 用户,서버: 完成'),
    seq([part('用户', 'participant', '终端用户'), part('서버', 'actor', 'サーバー')], [msg('用户', '서버', '读取配置'), note('over', ['用户', '서버'], '完成')]))
})
test('A5.errors: every drawn label is checked: alias, message, note, condition, divider, box label, title statement and frontmatter title', () => {
  const zwj = '\u{1F468}\u{200D}\u{1F469}', vs16 = '\u{2764}\u{FE0F}'
  const bad: [string, string][] = [[`participant A as ${zwj}`, 'U+200D'], [`A->>B: ${vs16}`, 'U+FE0F'], [`Note over A: ${zwj}`, 'U+200D'],
    [`alt ${zwj}\nA->>B: x\nend`, 'U+200D'], [`alt ok\nA->>B: x\nelse ${vs16}\nA->>B: y\nend`, 'U+FE0F'], [`box ${zwj}\nparticipant A\nend`, 'U+200D'],
    [`box Aqua ${vs16}\nparticipant A\nend`, 'U+FE0F'], [`title ${zwj}\nA->>B: x`, 'U+200D']]
  assert.deepEqual(bad.map(([t]) => [t, P(t)]), bad.map(([t, u]) => [t, { reason: `unsupported-char ${u}` }]))
  assert.deepEqual(parseSequence(readSource(`---\ntitle: ${zwj}\n---\nsequenceDiagram\nA->>B: x`) as Source), { reason: 'unsupported-char U+200D' })
  // A rect color is not drawn, so it is not checked.
  assert.deepEqual(P(`rect ${zwj}\nA->>B: x\nend`).items, [frame('rect', [null, [msg('A', 'B', 'x')]])])
})
test('A2: accTitle and accDescr, on one line or as an accDescr {…} block over several lines, are parsed and ignored', () => {
  assert.deepEqual(P('accTitle: The title\naccDescr: One line\naccDescr {\n  first\n  A->>B: not a message\n}\nA->>B: x\naccDescr { inline }\naccDescr{ a\nb }'),
    seq(AB, [msg('A', 'B', 'x')]))
})
test('A5.errors: an accDescr block must close with a } that ends its line; accTitle needs its colon; neither sits in a box', () => {
  const bad: [string, string][] = [['A->>B: x\naccDescr {\nA->>B: y', 'syntax:3'], ['accDescr {\nx\n} A->>B: y', 'syntax:4'], ['accDescr { x } y\nA->>B: z', 'syntax:2'],
    ['accTitle The title\nA->>B: x', 'syntax:2'], ['box G\naccTitle: t\nend', 'syntax:3']]
  assert.deepEqual(bad.map(([t]) => [t, P(t)]), bad.map(([t, r]) => [t, { reason: r }]))
})
test('A5.errors: forms outside the subset fall back as syntax at their source line: half arrows, (), link, links, properties, details, par_over, keywords in another case, multi-word ids', () => {
  const bad = ['A-|\\B: half', 'A--|/B: half', 'A-\\\\B: stick', 'A/|-B: reverse', 'A()->>B: x', 'A->>()B: x', 'link A: Dash @ https://x', 'links A: {"a": "b"}',
    'properties A: {"k": "v"}', 'details A: x', 'par_over x\nA->>B: y\nend', 'Loop x\nA->>B: y\nend', 'ALT x\nA->>B: y\nend', 'Participant A', 'Actor A',
    'Title X', 'titled X', 'Alice Smith->>Bob: hi', 'participant A;']
  assert.deepEqual(bad.map(t => [t, P(t)]), bad.map(t => [t, { reason: 'syntax:2' }]))
  assert.deepEqual(parseSequence(readSource('---\ntitle: T\n---\nsequenceDiagram\n%% a comment\n\nA->>B: x\n  A->>: y') as Source), { reason: 'syntax:8' })
})
test('A2: a participant declared again keeps its column; as in Mermaid, only an as alias changes its kind and label', () => {
  assert.deepEqual(P('A->>B: x\nactor A\nactor B as Bob\nparticipant B').participants, [part('A'), part('B', 'actor', 'Bob')])
})
test('A2: a box takes a participant declared before it, once, and may be empty', () => {
  assert.deepEqual(P('A->>B: x\nbox G\nparticipant A\nparticipant A\nend\nbox H\nend').boxes, [{ label: 'G', ids: ['A'] }, { label: 'H', ids: [] }])
})
test('A5.errors: a participant in two boxes is a box-split', () => {
  const bad = ['box G\nparticipant A\nend\nbox H\nparticipant A\nend\nA->>A: x', 'box G\nparticipant A\nparticipant B\nend\nbox H\nparticipant B\nparticipant C\nend']
  assert.deepEqual(bad.map(t => [t, P(t)]), bad.map(t => [t, { reason: 'box-split' }]))
})
