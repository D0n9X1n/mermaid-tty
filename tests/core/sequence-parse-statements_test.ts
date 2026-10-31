import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSequence } from '../../core/diagrams/sequence/parse.ts'
import { readSource, type Source } from '../../core/source.ts'
import { AB, P, boxLabelOf, frame, mark, msg, note, nums, part, seq } from './sequence-fixture.ts'

test('A2: par takes any number of and sections, critical of option sections, alt of else sections; a missing condition is null', () => {
  assert.deepEqual(P('par a\nA->>B: 1\nand b\nA->>B: 2\nand c\nA->>B: 3\nend').items, [
    frame('par', ['a', [msg('A', 'B', '1')]], ['b', [msg('A', 'B', '2')]], ['c', [msg('A', 'B', '3')]]),
  ])
  assert.deepEqual(P('critical lock\nA->>B: 1\noption x\nA->>B: 2\noption y\nA->>B: 3\nend').items, [
    frame('critical', ['lock', [msg('A', 'B', '1')]], ['x', [msg('A', 'B', '2')]], ['y', [msg('A', 'B', '3')]]),
  ])
  assert.deepEqual(P('alt\nA->>B: 1\nelse\nA->>B: 2\nend').items, [
    frame('alt', [null, [msg('A', 'B', '1')]], [null, [msg('A', 'B', '2')]]),
  ])
})
test('A5.errors: else, and and option divide only an innermost alt, par and critical; end needs an open frame', () => {
  const bad: [string, string][] = [
    ['else x\nA->>B: y', 'syntax:2'],
    ['alt a\nA->>B: x\nand b\nend', 'syntax:4'],
    ['par a\nA->>B: x\noption b\nend', 'syntax:4'],
    ['critical a\nA->>B: x\nelse b\nend', 'syntax:4'],
    ['alt a\nloop l\nA->>B: x\nelse b\nend\nend', 'syntax:5'],
    ['A->>B: x\nend', 'syntax:3'],
    ['loop l\nA->>B: x\nend\nend', 'syntax:5'],
  ]
  assert.deepEqual(
    bad.map(([t]) => [t, P(t)]),
    bad.map(([t, r]) => [t, { reason: r }]),
  )
})
test('A2: rect takes any color text, which is not drawn, holds any statement but box, and nests; a box may sit in another frame', () => {
  assert.deepEqual(P('rect rgba(0, 0, 255, .1)\nA->>B: a\nrect Aqua\nalt x\nA->>B: b\nend\nend\nend').items, [
    frame('rect', [null, [msg('A', 'B', 'a'), frame('rect', [null, [frame('alt', ['x', [msg('A', 'B', 'b')]])]])]]),
  ])
  assert.deepEqual(
    P('alt x\nbox G\nparticipant A\nend\nA->>B: y\nend'),
    seq(AB, [frame('alt', ['x', [msg('A', 'B', 'y')]])], { boxes: [{ label: 'G', ids: ['A'] }] }),
  )
})
test('A5.errors: a box holds only participant and actor lines, sits in no rect, and must end', () => {
  const bad: [string, string][] = [
    ['rect red\nbox G\nparticipant A\nend\nend', 'syntax:3'],
    ['rect red\nalt x\nbox G\nparticipant A\nend\nend\nend', 'syntax:4'],
    ['box G\nparticipant A\nA->>B: x\nend', 'syntax:4'],
    ['box G\ncreate participant A\nend', 'syntax:3'],
    ['box G\nbox H\nend\nend', 'syntax:3'],
    ['box G\nNote over A: n\nend', 'syntax:3'],
    ['box G\ndestroy A\nend', 'syntax:3'],
    ['box G\nparticipant A', 'unclosed-frame'],
  ]
  assert.deepEqual(
    bad.map(([t]) => [t, P(t)]),
    bad.map(([t, r]) => [t, { reason: r }]),
  )
})

test('A2: a note sits left of or right of one participant, or over one or two; spaces around , and : are free', () => {
  assert.deepEqual(P('A->>B: x\nNote left of A: a\nNote right of B :b\nNote over A , B: c: d<br/>e').items.slice(1), [
    note('left of', ['A'], 'a'),
    note('right of', ['B'], 'b'),
    note('over', ['A', 'B'], 'c: d<br/>e'),
  ])
})
test('A5.errors: only over takes two participants; Note is case-sensitive and needs its colon and one space in left of', () => {
  const bad = [
    'Note left of A,B: n',
    'Note right of A, B: n',
    'Note over A,B,C: n',
    'note over A: n',
    'NOTE over A: n',
    'Note over A',
    'Note left  of A: n',
  ]
  assert.deepEqual(
    bad.map((t) => [t, P(t)]),
    bad.map((t) => [t, { reason: 'syntax:2' }]),
  )
})
test('A2: the message after destroy X may have X at either end', () => {
  assert.deepEqual(P('A->>B: x\ndestroy A\nA-xB: bye').items, [
    msg('A', 'B', 'x'),
    mark('destroy', 'A'),
    msg('A', 'B', 'bye', { head: 'cross' }),
  ])
  assert.deepEqual(P('A->>B: x\ndestroy A\nB-xA: bye').items, [
    msg('A', 'B', 'x'),
    mark('destroy', 'A'),
    msg('B', 'A', 'bye', { head: 'cross' }),
  ])
})
test('A5.errors: destroy fails unless the next message has X at one end; create, on a known id or unless the next message targets X; destroyed, on any later mention', () => {
  const bad: [string, string][] = [
    ['A->>B: x\ndestroy B\nA->>C: y', 'destroy'],
    ['A->>B: x\ndestroy B', 'destroy'],
    ['A->>B: x\ndestroy B\nNote over B: n', 'destroy'],
    ['A->>B: x\ncreate participant C', 'create'],
    ['A->>B: x\ncreate participant B\nA->>B: y', 'create'],
    ['create participant C\nC->>A: hi', 'create'],
    ['create participant C\ncreate participant D\nA->>C: x\nA->>D: y', 'create'],
    ['destroy B\nA-xB: bye\nNote over B: n', 'destroyed'],
    ['destroy B\nA-xB: bye\ncreate participant B\nA->>B: hi', 'destroyed'],
    ['destroy B\nA-xB: bye\nactivate B', 'destroyed'],
  ]
  assert.deepEqual(
    bad.map(([t]) => [t, P(t)]),
    bad.map(([t, r]) => [t, { reason: r }]),
  )
})
test('A2: autonumber takes no number (1 1), a start (step 1), or a start and a step, after any statement', () => {
  assert.deepEqual(
    ['autonumber', 'autonumber 7', 'autonumber  10   5', 'autonumber;'].map((a) =>
      nums(P(`${a}\nA->>B: x\nA->>B: y`).items),
    ),
    [
      [1, 2],
      [7, 8],
      [10, 15],
      [1, 2],
    ],
  )
  assert.deepEqual(nums(P('participant A\nactivate A\nNote over A: n\nautonumber 3\nA->>B: x').items), [3])
})
test('A5.errors: a fraction, a sign, a third number or a word after autonumber falls back as syntax', () => {
  const bad = ['autonumber 1.5', 'autonumber -1', 'autonumber 1 2 3', 'autonumber 1 x', 'autonumber on'].map(
    (a) => `${a}\nA->>B: x`,
  )
  assert.deepEqual(
    bad.map((t) => [t, P(t)]),
    bad.map((t) => [t, { reason: 'syntax:2' }]),
  )
})
// Mermaid 12.2.0's renderer walks every message in source order with an index (from 1) and a step (1): autonumber shows
// the numbers, off hides them, a start or step sets them unless it is 0, and each message, shown or not, adds the step
// (Math.round((index + step) * 100) / 100, so 9007199254740989 stays put).
test('A2: autonumber restarts, steps, turns off and on again as Mermaid numbers messages', () => {
  const cases: [string, (number | null)[]][] = [
    [
      'autonumber 10 5\nA->>B: a\nautonumber off\nA->>B: b\nautonumber\nA->>B: c\nautonumber 3\nA->>B: d\nA->>B: e',
      [10, null, 20, 3, 4],
    ],
    ['A->>B: a\nautonumber\nA->>B: b\nalt x\nA->>B: c\nend\nautonumber 0 0\nA->>B: d', [null, 2, 3, 4]],
    ['autonumber 0\nA->>B: a\nA->>B: b', [1, 2]],
    ['autonumber 5 0\nA->>B: a\nA->>B: b', [5, 6]],
    ['autonumber off\nA->>B: a', [null]],
    ['autonumber 9007199254740989\nA->>B: a\nA->>B: b\nA->>B: c', Array(3).fill(9007199254740989)],
  ]
  assert.deepEqual(
    cases.map(([t]) => [t, nums(P(t).items)]),
    cases,
  )
})
// Not in the plan: a start, step or shown number that is not a safe integer falls back.
test('A5.errors: an unsafe autonumber start, step or shown number fails autonumber', () => {
  const bad = [
    'autonumber 9007199254740991\nA->>B: a\nA->>B: b',
    'autonumber 1 9007199254740992\nA->>B: a',
    'autonumber 9007199254740993\nA->>B: a',
  ]
  assert.deepEqual(
    bad.map((t) => [t, P(t)]),
    bad.map((t) => [t, { reason: 'autonumber' }]),
  )
})

test('A2: message text runs from the first colon after the target and keeps later colons and <br/>; spaces between ids, arrow, +/- and : are free', () => {
  const ok = ['A->>B: a: b<br/>c', 'A->>B:', 'A->>B:x', 'A ->> B : y ', 'A->> +B: z', 'A->>+B: v\nB -->>  - A :w']
  assert.deepEqual(
    ok.map((t) => P(t).items.at(-1)),
    [
      msg('A', 'B', 'a: b<br/>c'),
      msg('A', 'B', ''),
      msg('A', 'B', 'x'),
      msg('A', 'B', 'y'),
      msg('A', 'B', 'z', { activate: true }),
      msg('B', 'A', 'w', { line: 'dotted', deactivate: true }),
    ],
  )
})
test('A5.errors: a message needs one id at each end of an unbroken arrow, at most one of + and -, and its colon', () => {
  const bad = ['A - >> B: x', 'A->>B x', 'A->>+-B: x', 'A->>B C: x', 'A B->>C: x', '->>B: x']
  assert.deepEqual(
    bad.map((t) => [t, P(t)]),
    bad.map((t) => [t, { reason: 'syntax:2' }]),
  )
})
test('A2: activate and deactivate are items of their own, apart from any message', () => {
  assert.deepEqual(P('activate A\nA->>B: x\ndeactivate A').items, [
    mark('activate', 'A'),
    msg('A', 'B', 'x'),
    mark('deactivate', 'A'),
  ])
})
test('A2: CJK ids and labels are letters like any other', () => {
  assert.deepEqual(
    P('participant 用户 as 终端用户\nactor 서버 as サーバー\n用户->>서버: 读取配置\nNote over 用户,서버: 完成'),
    seq(
      [part('用户', 'participant', '终端用户'), part('서버', 'actor', 'サーバー')],
      [msg('用户', '서버', '读取配置'), note('over', ['用户', '서버'], '完成')],
    ),
  )
})
test('A5.errors: every drawn label is checked: alias, message, note, condition, divider, box label, title statement and frontmatter title', () => {
  const zwj = '\u{1F468}\u{200D}\u{1F469}'
  const vs16 = '\u{2764}\u{FE0F}'
  const bad: [string, string][] = [
    [`participant A as ${zwj}`, 'U+200D'],
    [`A->>B: ${vs16}`, 'U+FE0F'],
    [`Note over A: ${zwj}`, 'U+200D'],
    [`alt ${zwj}\nA->>B: x\nend`, 'U+200D'],
    [`alt ok\nA->>B: x\nelse ${vs16}\nA->>B: y\nend`, 'U+FE0F'],
    [`box ${zwj}\nparticipant A\nend`, 'U+200D'],
    [`box Aqua ${vs16}\nparticipant A\nend`, 'U+FE0F'],
    [`title ${zwj}\nA->>B: x`, 'U+200D'],
  ]
  assert.deepEqual(
    bad.map(([t]) => [t, P(t)]),
    bad.map(([t, u]) => [t, { reason: `unsupported-char ${u}` }]),
  )
  // readSource checks a frontmatter title for every diagram type, so the title fails there, before parseSequence.
  assert.deepEqual(readSource(`---\ntitle: ${zwj}\n---\nsequenceDiagram\nA->>B: x`), {
    reason: 'unsupported-char U+200D',
  })
  // A rect color is not drawn, so it is not checked.
  assert.deepEqual(P(`rect ${zwj}\nA->>B: x\nend`).items, [frame('rect', [null, [msg('A', 'B', 'x')]])])
})
test('A2: accTitle and accDescr, on one line or as an accDescr {…} block over several lines, are parsed and ignored', () => {
  assert.deepEqual(
    P(
      'accTitle: The title\naccDescr: One line\naccDescr {\n  first\n  A->>B: not a message\n}\nA->>B: x\naccDescr { inline }\naccDescr{ a\nb }',
    ),
    seq(AB, [msg('A', 'B', 'x')]),
  )
})
test('A5.errors: an accDescr block must close with a } that ends its line; accTitle needs its colon; neither sits in a box', () => {
  const bad: [string, string][] = [
    ['A->>B: x\naccDescr {\nA->>B: y', 'syntax:3'],
    ['accDescr {\nx\n} A->>B: y', 'syntax:4'],
    ['accDescr { x } y\nA->>B: z', 'syntax:2'],
    ['accTitle The title\nA->>B: x', 'syntax:2'],
    ['box G\naccTitle: t\nend', 'syntax:3'],
  ]
  assert.deepEqual(
    bad.map(([t]) => [t, P(t)]),
    bad.map(([t, r]) => [t, { reason: r }]),
  )
})
test('A5.errors: forms outside the subset fall back as syntax at their source line: half arrows, (), link, links, properties, details, par_over, keywords in another case, multi-word ids', () => {
  const bad = [
    'A-|\\B: half',
    'A--|/B: half',
    'A-\\\\B: stick',
    'A/|-B: reverse',
    'A()->>B: x',
    'A->>()B: x',
    'link A: Dash @ https://x',
    'links A: {"a": "b"}',
    'properties A: {"k": "v"}',
    'details A: x',
    'par_over x\nA->>B: y\nend',
    'Loop x\nA->>B: y\nend',
    'ALT x\nA->>B: y\nend',
    'Participant A',
    'Actor A',
    'Title X',
    'titled X',
    'Alice Smith->>Bob: hi',
  ]
  assert.deepEqual(
    bad.map((t) => [t, P(t)]),
    bad.map((t) => [t, { reason: 'syntax:2' }]),
  )
  assert.deepEqual(
    parseSequence(readSource('---\ntitle: T\n---\nsequenceDiagram\n%% a comment\n\nA->>B: x\n  A->>: y') as Source),
    { reason: 'syntax:8' },
  )
})
test('A2: a participant declared again keeps its column; as in Mermaid, only an as alias changes its kind and label', () => {
  assert.deepEqual(P('A->>B: x\nactor A\nactor B as Bob\nparticipant B').participants, [
    part('A'),
    part('B', 'actor', 'Bob'),
  ])
})
test('A2: a box takes a participant declared before it, once, and may be empty', () => {
  assert.deepEqual(P('A->>B: x\nbox G\nparticipant A\nparticipant A\nend\nbox H\nend').boxes, [
    { label: 'G', ids: ['A'] },
    { label: 'H', ids: [] },
  ])
})
test('A5.errors: a participant in two boxes is a box-split', () => {
  const bad = [
    'box G\nparticipant A\nend\nbox H\nparticipant A\nend\nA->>A: x',
    'box G\nparticipant A\nparticipant B\nend\nbox H\nparticipant B\nparticipant C\nend',
  ]
  assert.deepEqual(
    bad.map((t) => [t, P(t)]),
    bad.map((t) => [t, { reason: 'box-split' }]),
  )
})

// Beyond the plan: where Mermaid would fail, or draw other text, the diagram falls back.

// Mermaid 12.2.0's TXT and LINE tokens stop at a #, and the rest of the line is a comment, ; and all: a message whose
// text is item, then a # and a number, draws as "item"; alt case, then a # and a number, as [case]; and else, then a #
// and a number, or loop#x, with no condition.
test('A2: a # ends a message, note or condition, and comments out the rest of its line', () => {
  assert.deepEqual(
    P(
      'A->>B: item #3\nNote over A: see #2 now\nalt case #1\nA->>B: x #; B->>A: y\nelse #2\nA->>B: z\nend #c\nloop#x\nA->>B: w\nend',
    ),
    seq(AB, [
      msg('A', 'B', 'item'),
      note('over', ['A'], 'see'),
      frame('alt', ['case', [msg('A', 'B', 'x')]], [null, [msg('A', 'B', 'z')]]),
      frame('loop', [null, [msg('A', 'B', 'w')]]),
    ]),
  )
})
// Elsewhere Mermaid keeps the # (an id A#b or participant A #c), draws an alias, title or box label cut at it, or
// decodes an entity such as #9829; to ♥. Not in the plan: those fall back.
test('A5.errors: a # in an id, alias, title, box label or entity fails hash', () => {
  const bad = [
    'participant A as #1',
    'participant A as Alice #1',
    'participant A #c',
    'activate A #c\nA->>B: x',
    'A#b->>B: x',
    'A->>B: I #9829; you',
    'Note over A: #35; x',
    'title Q #1\nA->>B: x',
  ]
  assert.deepEqual(
    bad.map((t) => [t, P(t)]),
    bad.map((t) => [t, { reason: 'hash' }]),
  )
  assert.deepEqual(parseSequence(readSource('---\ntitle: "Q #1"\n---\nsequenceDiagram\nA->>B: x') as Source), {
    reason: 'hash',
  })
})
// Mermaid 12.2.0's LINE state reads a # in a box or rect line as a comment to the line end: box #abc G is untitled.
test('A2: a # in a box or rect line comments out the rest of it; accessibility text keeps it', () => {
  assert.deepEqual(
    P('box #abc G\nparticipant A\nend\nrect #abc\nA->>B: x\nend\naccTitle: a #b\naccDescr {\n#c\n}'),
    seq(AB, [frame('rect', [null, [msg('A', 'B', 'x')]])], { boxes: [{ label: null, ids: ['A'] }] }),
  )
  const labels = ['Team #1', 'Aqua #team', '#abcTeam', '#ab Team', '#abcde Team', '#ggg Team', '#a b; participant B']
  assert.deepEqual(labels.map(boxLabelOf), ['Team', null, null, null, null, null, null])
  assert.deepEqual(P('rect\nA->>B: x\nend').items, [frame('rect', [null, [msg('A', 'B', 'x')]])])
})
// Mermaid 12.2.0 ends a statement at a ;, as at a line break, outside accessibility text.
test('A2: a ; ends a statement, and the rest of its line holds more', () => {
  assert.deepEqual(
    P(
      'box G; participant B; end\nparticipant A;\nA->>B: hi; B->>A: yo;\nNote over A: n;\nalt x; A->>B: y; else z; A->>B: w; end;\n' +
        'rect rgb(0, 0, 0); A->>B: v; end\ntitle T;\naccTitle: a; b\naccDescr {\na; b #c\n}',
    ),
    seq(
      [part('B'), part('A')],
      [
        msg('A', 'B', 'hi'),
        msg('B', 'A', 'yo'),
        note('over', ['A'], 'n'),
        frame('alt', ['x', [msg('A', 'B', 'y')]], ['z', [msg('A', 'B', 'w')]]),
        frame('rect', [null, [msg('A', 'B', 'v')]]),
      ],
      { boxes: [{ label: 'G', ids: ['B'] }], title: 'T' },
    ),
  )
})
// Mermaid's NUM token needs a space or line break after it: it fails on autonumber 10; and autonumber 7#c. Mermaid
// 12.2.0's accTitle/accDescr tokens end in \s*, so an empty one eats the line break and takes the next line as its
// text: A->>B: hi; accTitle: then B->>C: yo draws only A->>B.
test('A5.errors: an empty accTitle or accDescr falls back as syntax', () => {
  const bad = [
    'A->>B: hi; accTitle:\nB->>C: yo',
    'accTitle:\nB->>C: yo',
    'accTitle: \nB->>C: yo',
    'accDescr:\nB->>C: yo',
    'accDescr : \nB->>C: yo',
    'accTitle:',
  ]
  assert.deepEqual(
    bad.map((t) => [t, P(t)]),
    bad.map((t) => [t, { reason: 'syntax:2' }]),
  )
  // A non-empty one takes the rest of its line, ; and all, as Mermaid does.
  assert.deepEqual(P('accTitle: t\naccDescr: d; A->>B: x\nC->>D: y').items, [msg('C', 'D', 'y')])
})
// Mermaid's \s+ after autonumber, off or its number eats the line break the statement needs, so trailing whitespace at
// the line end fails there ("Expecting 'NEWLINE', got 'ACTOR'"). Every other statement Mermaid reads keeps its line
// break.
test('A5.errors: autonumber with trailing whitespace at the line end falls back as syntax', () => {
  const bad = [
    'autonumber off \nB->>A: after',
    'autonumber \nB->>A: x',
    'autonumber 10 \nB->>A: x',
    'autonumber 10 5 \nB->>A: x',
    'autonumber\t\nB->>A: x',
    'autonumber \n%% c\nB->>A: x',
    'B->>A: x\nautonumber ',
  ]
  assert.deepEqual(
    bad.map((t) => [t, P(t)]),
    bad.map((t) => [t, { reason: t.startsWith('B') ? 'syntax:3' : 'syntax:2' }]),
  )
  assert.deepEqual(
    ['autonumber  #c', 'autonumber ; '].map((a) => nums(P(`${a}\nB->>A: x`).items)),
    [[1], [1]],
  )
  assert.deepEqual(P('alt x \nA->>B: y \nelse \nA->>B: w\nend \nB->>A: z').items.length, 2)
})
test('A5.errors: an autonumber number before a ;, # or tab falls back as syntax', () => {
  const bad = [
    'autonumber 10;\nA->>B: x',
    'autonumber 10 5;\nA->>B: x',
    'autonumber 7#c\nA->>B: x',
    'autonumber 10\t5\nA->>B: x',
  ]
  assert.deepEqual(
    bad.map((t) => [t, P(t)]),
    bad.map((t) => [t, { reason: 'syntax:2' }]),
  )
  assert.deepEqual(
    ['autonumber 10 ;', 'autonumber 7 #c'].map((a) => nums(P(`${a}\nA->>B: x`).items)),
    [[10], [7]],
  )
})
// Where a message or note names a participant, Mermaid 12.2.0's lexer reads these words as keywords in any case, before
// any character but a-z, 0-9 and _ (jison's \b), and fails: the test's own copy of the list. title, accTitle and
// accDescr fail there only before the text their own rules take (title: x, title x, accTitle: x).
const MERMAID_KEYWORDS =
  `participant actor note over end loop alt else opt par and rect critical break option activate deactivate autonumber
  box create destroy par_over off sequenceDiagram`.split(/\s+/)
test('A5.errors: a message or note naming a keyword fails keyword', () => {
  const bad = [
    ...MERMAID_KEYWORDS.flatMap((k) => [`${k}->>B: x`, `A->>${k}: x`, `${k.toUpperCase()}->>B: x`, `${k}.x->>B: x`]),
    'Note over A,loop: n',
    'activate box',
    'deactivate opt',
    'destroy title',
    'A->>end中: x',
    'participant end\nA->>end: x',
    'A->>title: x',
    'A->>title :x',
    'A->>accTitle: x',
    'A->>accDescr: x',
    'Note over title: n',
    'Note over A,title: n',
  ]
  assert.deepEqual(
    [MERMAID_KEYWORDS.length, bad.map((t) => [t, P(t)])],
    [24, bad.map((t) => [t, { reason: 'keyword' }])],
  )
})
// Mermaid reads any id, keyword or number, after participant, actor, create, activate, deactivate or destroy; and in a
// message or note, link, links, properties, details, title, accTitle and accDescr before an arrow or a bare colon, and
// a number not followed by a space.
test('A2: keyword and number ids draw where Mermaid reads them as ids', () => {
  assert.deepEqual(
    P(
      'participant end\nactor loop as L\nbox G\nparticipant else\nend\nparticipant 42 as Answer\nparticipant 3\nactivate 3\nA->>3: x\ndeactivate 3',
    ).participants,
    [part('end'), part('loop', 'actor', 'L'), part('else'), part('42', 'participant', 'Answer'), part('3'), part('A')],
  )
  const ok = [
    'link->>B: x',
    'links->>B: x',
    'A->>properties: x',
    'A->>details : x',
    'TITLE->>B: x',
    'ACCDESCR->>B: x',
    'title->>B: x',
    'accTitle->>B: x',
    'A->>title:x',
    'link ->> B: x',
    '1->>B: x',
    'A->>1: x',
    'A->>1.5: x',
    'A->>.5: x',
    'A->>+1: x',
    'A->>1\t: x',
    'Note over link,details: n',
    'Note over 1: n',
    'Note over A,1: n',
  ]
  assert.deepEqual(
    ok.map((t) => [t, P(t).participants.map((q: any) => q.id)]),
    ok.map((t) => [
      t,
      [
        ['link', 'B'],
        ['links', 'B'],
        ['A', 'properties'],
        ['A', 'details'],
        ['TITLE', 'B'],
        ['ACCDESCR', 'B'],
        ['title', 'B'],
        ['accTitle', 'B'],
        ['A', 'title'],
        ['link', 'B'],
        ['1', 'B'],
        ['A', '1'],
        ['A', '1.5'],
        ['A', '.5'],
        ['A', '1'],
        ['A', '1'],
        ['link', 'details'],
        ['1'],
        ['A', '1'],
      ][ok.indexOf(t)],
    ]),
  )
})
test('A2: an id that only starts with a keyword is an ordinary id', () => {
  const ok = [
    'endpoint',
    'end_x',
    'end2',
    'Notes',
    'box1',
    'Parent',
    'Optional',
    'Titles',
    'offer',
    'actors',
    'participants',
    'Linked',
    'constructor',
    'toString',
    '__proto__',
  ]
  assert.deepEqual(
    ok.map((id) => P(`${id}->>B: x`).items[0]),
    ok.map((id) => msg(id, 'B', 'x')),
  )
  assert.deepEqual(
    P('activate constructor\nA->>constructor: x\ndeactivate constructor').items.map((i: any) => i.kind),
    ['activate', 'msg', 'deactivate'],
  )
})
// Mermaid 12.2.0 orders participants as declarations, messages (sender, then target) and notes first name them;
// activate, deactivate and destroy name one without declaring it, and it fails on one nothing else declares.
test('A2: activate, deactivate and destroy do not order participants; messages and notes do', () => {
  const cases: [string, string[]][] = [
    ['activate B\nA->>B: x\ndeactivate B', ['A', 'B']],
    ['activate B\nNote over C: n\nA->>B: x\ndeactivate B', ['C', 'A', 'B']],
    ['destroy B\nA-xB: y', ['A', 'B']],
    ['activate B\ndeactivate B\nA->>B: x', ['A', 'B']],
    ['participant A\nactivate B\nB->>A: x\ndeactivate B', ['A', 'B']],
    ['Note over B,A: n\nA->>C: x', ['B', 'A', 'C']],
  ]
  assert.deepEqual(
    cases.map(([t]) => [t, P(t).participants.map((q: any) => q.id)]),
    cases,
  )
})
test('A5.errors: an id only activate, deactivate or destroy names fails undeclared; created after one, create', () => {
  const bad: [string, string][] = [
    ['activate C\nA->>B: x\ndeactivate C', 'undeclared'],
    ['activate B\ndeactivate B', 'undeclared'],
    ['activate C\ncreate participant C\nA->>C: x\ndeactivate C', 'create'],
  ]
  assert.deepEqual(
    bad.map(([t]) => [t, P(t)]),
    bad.map(([t, r]) => [t, { reason: r }]),
  )
})
// Mermaid fails on deactivating a participant that is not active: - deactivates a message's sender.
test('A5.errors: deactivating an inactive participant fails inactive', () => {
  const bad = [
    'A->>B: x\nB-->>-A: y',
    'A->>-B: x',
    'A->>+B: x\nA-->>-B: y',
    'A->>+B: x\nB-->>-A: y\nB-->>-A: z',
    'deactivate A\nA->>B: x',
    'activate B\ndeactivate B\ndeactivate B',
    'A->>+B: x\ndeactivate A',
  ]
  assert.deepEqual(
    bad.map((t) => [t, P(t)]),
    bad.map((t) => [t, { reason: 'inactive' }]),
  )
})
test('A2: + and activate each start an activation, and - and deactivate each end one, counted per participant', () => {
  assert.deepEqual(P('A->>+B: a\nactivate B\nB-->>-A: b\ndeactivate B\nA->>+C: c\nC-->>-A: d').items, [
    msg('A', 'B', 'a', { activate: true }),
    mark('activate', 'B'),
    msg('B', 'A', 'b', { line: 'dotted', deactivate: true }),
    mark('deactivate', 'B'),
    msg('A', 'C', 'c', { activate: true }),
    msg('C', 'A', 'd', { line: 'dotted', deactivate: true }),
  ])
})

// Mermaid reads a wrap: or nowrap: at the start of a message, note, condition, alias or box label as a directive, not
// text; a title keeps it.
test('A2: a leading wrap: or nowrap: is dropped', () => {
  const texts = [
    'A->>B: wrap: long',
    'Note over A: nowrap: x',
    'A->>B:wrap:y',
    'A->>B: :nowrap: z',
    'A->>B: x wrap: y',
    'A->>B: WRAP: x',
    'A->>B: wrapped: x',
  ]
  assert.deepEqual(
    texts.map((t) => P(t).items[0].text),
    ['long', 'x', 'y', 'z', 'x wrap: y', 'WRAP: x', 'wrapped: x'],
  )
  assert.deepEqual(
    P(
      'participant A as wrap: Alice\nbox Aqua nowrap: Team\nparticipant B\nend\nalt wrap: ok\nA->>B: x\nelse nowrap: no\nA->>B: y\nend\nalt wrap:\nA->>B: z\nend\ntitle wrap: T',
    ),
    seq(
      [part('A', 'participant', 'Alice'), part('B')],
      [
        frame('alt', ['ok', [msg('A', 'B', 'x')]], ['no', [msg('A', 'B', 'y')]]),
        frame('alt', [null, [msg('A', 'B', 'z')]]),
      ],
      { boxes: [{ label: 'Team', ids: ['B'] }], title: 'wrap: T' },
    ),
  )
})
// Where a message or note names a participant, Mermaid's lexer reads an id such as 42 or 1.5 as a number when a space
// follows it, and fails. Not in the plan: activate, deactivate or destroy of an undeclared number fails too.
test('A5.errors: a message or note id that is a number before a space fails id', () => {
  const bad = ['A ->> 1 : x', 'A->>1 : x', '1 ->> A: x', 'Note over 1 ,A: n', 'Note over A,1 : n', 'activate 3']
  assert.deepEqual(
    bad.map((t) => [t, P(t)]),
    bad.map((t) => [t, { reason: 'id' }]),
  )
  assert.deepEqual(
    ['1a', 'A1', 'v1.2'].map((id) => P(`${id}->>B: x`).items[0]),
    ['1a', 'A1', 'v1.2'].map((id) => msg(id, 'B', 'x')),
  )
})
