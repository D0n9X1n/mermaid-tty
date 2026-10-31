import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSequence } from '../../core/diagrams/sequence/parse.ts'
import { readSource, type Source } from '../../core/source.ts'
import { AB, P, boxLabelOf, frame, mark, msg, note, nums, part, seq } from './sequence-fixture.ts'
test('A2: participants, actors and aliases keep declaration order', () =>
  assert.deepEqual(
    P('participant B\nactor A as Alice\nB->>C: hi').participants.map((p: any) => [p.id, p.kind, p.label]),
    [
      ['B', 'participant', 'B'],
      ['A', 'actor', 'Alice'],
      ['C', 'participant', 'C'],
    ],
  ))
test('A2: ten arrows; activations, notes, frames, autonumber, create, destroy', () => {
  const A = ['->>', '-->>', '->', '-->', '-x', '--x', '-)', '--)', '<<->>', '<<-->>']
  assert.deepEqual(
    A.map((a) => {
      const m = P(`A${a}B: t`).items[0]
      return `${m.line} ${m.tail} ${m.head}`
    }),
    [
      'solid none arrow',
      'dotted none arrow',
      'solid none open',
      'dotted none open',
      'solid none cross',
      'dotted none cross',
      'solid none async',
      'dotted none async',
      'solid arrow arrow',
      'dotted arrow arrow',
    ],
  )
  const s = P(
    'autonumber 10 5\nA->>+B: x\nB-->>-A: y\nNote over A,B: n\nalt ok\nA->>B: a\nelse no\nA->>B: b\nend\ncreate participant C\nA->>C: c\ndestroy C\nA-xC: bye',
  )
  assert.deepEqual(
    [nums(s.items), s.items.map((i: any) => i.kind)],
    [
      [10, 15, 20, 25, 30, 35],
      ['msg', 'msg', 'note', 'frame', 'create', 'msg', 'destroy', 'msg'],
    ],
  )
  assert.deepEqual(
    [s.items[0].activate, s.items[1].deactivate, s.items[3].sections.map((x: any) => x.cond)],
    [true, true, ['ok', 'no']],
  )
  assert.equal(P('title Checkout\nA->>B: x').title, 'Checkout')
})
test('A5.errors: malformed, order, box and ZWJ rejections', () => {
  assert.match(
    (parseSequence(readSource('---\ntitle: A\n---\nsequenceDiagram\ntitle B\nA->>B: x') as Source) as any).reason,
    /^title/,
  ) // frontmatter title + statement
  for (const [t, r] of [
    ['A->>: hi', /^syntax:2/],
    ['loop x\nA->>B: y', /^unclosed-frame/],
    ['create participant C\nA->>B: x', /^create/],
    ['destroy B\nA-xB: bye\nA->>B: again', /^destroyed/],
    ['A->>C: hi\nbox G\nparticipant A\nparticipant B\nend', /^box-split/],
    ['title A\ntitle B\nA->>B: x', /^title/],
    ['A->>B: 👨‍👩', /^unsupported-char/],
  ] as const) {
    assert.match(P(t).reason, r, t)
  }
})

// Beyond the plan's three: each matrix row this task covers, checked whole, then each rule's edges.

// [matrix row, fence body after the header, the exact model].
const OK: [string, string, object][] = [
  ['sequence-ok-01', 'participant B\nparticipant A\nA->>B: hi', seq([part('B'), part('A')], [msg('A', 'B', 'hi')])],
  [
    'sequence-ok-02',
    'actor B\nactor A\nA->>B: hi',
    seq([part('B', 'actor'), part('A', 'actor')], [msg('A', 'B', 'hi')]),
  ],
  [
    'sequence-ok-03',
    'participant A as Alice\nactor B as Bob\nA->>B: hi',
    seq([part('A', 'participant', 'Alice'), part('B', 'actor', 'Bob')], [msg('A', 'B', 'hi')]),
  ],
  ['sequence-ok-04', 'A->>B: t', seq(AB, [msg('A', 'B', 't')])],
  ['sequence-ok-05', 'A-->>B: t', seq(AB, [msg('A', 'B', 't', { line: 'dotted' })])],
  ['sequence-ok-06', 'A->B: t', seq(AB, [msg('A', 'B', 't', { head: 'open' })])],
  ['sequence-ok-07', 'A-->B: t', seq(AB, [msg('A', 'B', 't', { line: 'dotted', head: 'open' })])],
  ['sequence-ok-08', 'A-xB: t', seq(AB, [msg('A', 'B', 't', { head: 'cross' })])],
  ['sequence-ok-09', 'A--xB: t', seq(AB, [msg('A', 'B', 't', { line: 'dotted', head: 'cross' })])],
  ['sequence-ok-10', 'A-)B: t', seq(AB, [msg('A', 'B', 't', { head: 'async' })])],
  ['sequence-ok-11', 'A--)B: t', seq(AB, [msg('A', 'B', 't', { line: 'dotted', head: 'async' })])],
  ['sequence-ok-12', 'A->>A: x', seq([part('A')], [msg('A', 'A', 'x')])],
  [
    'sequence-ok-13',
    'A->>+B: a\nA->>+B: b\nB-->>-A: c\nB-->>-A: d',
    seq(AB, [
      msg('A', 'B', 'a', { activate: true }),
      msg('A', 'B', 'b', { activate: true }),
      msg('B', 'A', 'c', { line: 'dotted', deactivate: true }),
      msg('B', 'A', 'd', { line: 'dotted', deactivate: true }),
    ]),
  ],
  ['sequence-ok-14', 'A->>B: hi\nNote left of A: n', seq(AB, [msg('A', 'B', 'hi'), note('left of', ['A'], 'n')])],
  ['sequence-ok-15', 'A->>B: hi\nNote right of B: n', seq(AB, [msg('A', 'B', 'hi'), note('right of', ['B'], 'n')])],
  ['sequence-ok-16', 'A->>B: hi\nNote over A: n', seq(AB, [msg('A', 'B', 'hi'), note('over', ['A'], 'n')])],
  ['sequence-ok-17', 'A->>B: hi\nNote over A,B: n', seq(AB, [msg('A', 'B', 'hi'), note('over', ['A', 'B'], 'n')])],
  [
    'sequence-ok-18',
    'alt ok\nA->>B: a\nelse no\nA->>B: b\nend',
    seq(AB, [frame('alt', ['ok', [msg('A', 'B', 'a')]], ['no', [msg('A', 'B', 'b')]])]),
  ],
  ['sequence-ok-19', 'opt maybe\nA->>B: a\nend', seq(AB, [frame('opt', ['maybe', [msg('A', 'B', 'a')]])])],
  ['sequence-ok-20', 'loop every s\nA->>B: a\nend', seq(AB, [frame('loop', ['every s', [msg('A', 'B', 'a')]])])],
  [
    'sequence-ok-21',
    'par one\nA->>B: a\nand two\nA->>B: b\nend',
    seq(AB, [frame('par', ['one', [msg('A', 'B', 'a')]], ['two', [msg('A', 'B', 'b')]])]),
  ],
  [
    'sequence-ok-22',
    'critical lock\nA->>B: a\noption fail\nA->>B: b\nend',
    seq(AB, [frame('critical', ['lock', [msg('A', 'B', 'a')]], ['fail', [msg('A', 'B', 'b')]])]),
  ],
  ['sequence-ok-23', 'break stop\nA->>B: a\nend', seq(AB, [frame('break', ['stop', [msg('A', 'B', 'a')]])])],
  [
    'sequence-ok-24',
    'alt ok\nloop retry\nA->>B: a\nend\nelse no\nA->>B: b\nend',
    seq(AB, [frame('alt', ['ok', [frame('loop', ['retry', [msg('A', 'B', 'a')]])]], ['no', [msg('A', 'B', 'b')]])]),
  ],
  [
    'sequence-ok-25',
    'autonumber\nA->>B: a\nB-->>A: b',
    seq(AB, [msg('A', 'B', 'a', { num: 1 }), msg('B', 'A', 'b', { line: 'dotted', num: 2 })]),
  ],
  [
    'sequence-ok-30',
    'participant A as Same\nparticipant B as Same\nA->>B: hi',
    seq([part('A', 'participant', 'Same'), part('B', 'participant', 'Same')], [msg('A', 'B', 'hi')]),
  ],
  [
    'sequence-ok-31',
    'A->>B: a\nactivate B\nactivate B\nB-->>A: b\ndeactivate B\ndeactivate B',
    seq(AB, [
      msg('A', 'B', 'a'),
      mark('activate', 'B'),
      mark('activate', 'B'),
      msg('B', 'A', 'b', { line: 'dotted' }),
      mark('deactivate', 'B'),
      mark('deactivate', 'B'),
    ]),
  ],
  [
    'sequence-ok-32',
    'autonumber 10 5\nA->>B: a\nB->>A: b\nA->>B: c',
    seq(AB, [msg('A', 'B', 'a', { num: 10 }), msg('B', 'A', 'b', { num: 15 }), msg('A', 'B', 'c', { num: 20 })]),
  ],
  [
    'sequence-ok-33',
    'rect rgb(191, 223, 255)\nA->>B: a\nrect rgb(200, 150, 255)\nNote over A: n\nend\nB-->>A: b\nend',
    seq(AB, [
      frame('rect', [
        null,
        [msg('A', 'B', 'a'), frame('rect', [null, [note('over', ['A'], 'n')]]), msg('B', 'A', 'b', { line: 'dotted' })],
      ]),
    ]),
  ],
  [
    'sequence-ok-34',
    'box Purple Alice & John\nparticipant A\nparticipant J\nend\nbox Another Group\nparticipant B\n' +
      'participant C\nend\nA->>J: Hello John, how are you?\nJ->>A: Great!\nA->>B: Hello Bob, how is Charley?\nB->>C: Hello Charley, how are you?',
    seq(
      [part('A'), part('J'), part('B'), part('C')],
      [
        msg('A', 'J', 'Hello John, how are you?'),
        msg('J', 'A', 'Great!'),
        msg('A', 'B', 'Hello Bob, how is Charley?'),
        msg('B', 'C', 'Hello Charley, how are you?'),
      ],
      {
        boxes: [
          { label: 'Alice & John', ids: ['A', 'J'] },
          { label: 'Another Group', ids: ['B', 'C'] },
        ],
      },
    ),
  ],
  [
    'sequence-ok-35',
    'Alice->>Bob: Hello Bob, how are you ?\nBob->>Alice: Fine, thank you. And you?\ncreate participant Carl\nAlice->>Carl: Hi Carl!\n' +
      'create actor D as Donald\nCarl->>D: Hi!\ndestroy Carl\nAlice-xCarl: We are too many\ndestroy Bob\nBob->>Alice: I agree',
    seq(
      [part('Alice'), part('Bob'), part('Carl'), part('D', 'actor', 'Donald')],
      [
        msg('Alice', 'Bob', 'Hello Bob, how are you ?'),
        msg('Bob', 'Alice', 'Fine, thank you. And you?'),
        mark('create', 'Carl'),
        msg('Alice', 'Carl', 'Hi Carl!'),
        mark('create', 'D'),
        msg('Carl', 'D', 'Hi!'),
        mark('destroy', 'Carl'),
        msg('Alice', 'Carl', 'We are too many', { head: 'cross' }),
        mark('destroy', 'Bob'),
        msg('Bob', 'Alice', 'I agree'),
      ],
    ),
  ],
  ['sequence-ok-36', 'A<<->>B: hi', seq(AB, [msg('A', 'B', 'hi', { tail: 'arrow' })])],
  ['sequence-ok-37', 'A<<-->>B: hi', seq(AB, [msg('A', 'B', 'hi', { line: 'dotted', tail: 'arrow' })])],
  ['sequence-ok-39', 'title Checkout\nA->>B: x', seq(AB, [msg('A', 'B', 'x')], { title: 'Checkout' })],
  [
    'sequence-ok-40',
    'participant A; participant B\nA->>B: hi; B->>A: yo\nalt ok; A->>B: a; else no; B->>A: b; end',
    seq(AB, [
      msg('A', 'B', 'hi'),
      msg('B', 'A', 'yo'),
      frame('alt', ['ok', [msg('A', 'B', 'a')]], ['no', [msg('B', 'A', 'b')]]),
    ]),
  ],
  [
    'sequence-ok-41',
    'A->>B: item #3\nNote over A: see #2 now\nalt case #1\nA->>B: x\nelse #2\nB->>A: y\nend',
    seq(AB, [
      msg('A', 'B', 'item'),
      note('over', ['A'], 'see'),
      frame('alt', ['case', [msg('A', 'B', 'x')]], [null, [msg('B', 'A', 'y')]]),
    ]),
  ],
  [
    'sequence-ok-42',
    'autonumber 10 5\nA->>B: a\nautonumber off\nB->>A: b\nautonumber\nA->>B: c\nautonumber 3\nB->>A: d',
    seq(AB, [
      msg('A', 'B', 'a', { num: 10 }),
      msg('B', 'A', 'b'),
      msg('A', 'B', 'c', { num: 20 }),
      msg('B', 'A', 'd', { num: 3 }),
    ]),
  ],
  [
    'sequence-ok-43',
    'participant end\nparticipant 42 as Answer\nlink->>42: ask\n42-->>link: done',
    seq(
      [part('end'), part('42', 'participant', 'Answer'), part('link')],
      [msg('link', '42', 'ask'), msg('42', 'link', 'done', { line: 'dotted' })],
    ),
  ],
  [
    'sequence-ok-44',
    'box #abc G\nparticipant A\nend\nbox Aqua Team #1\nparticipant B\nend\nA->>B: hi',
    seq(AB, [msg('A', 'B', 'hi')], {
      boxes: [
        { label: null, ids: ['A'] },
        { label: 'Team', ids: ['B'] },
      ],
    }),
  ],
  [
    'sequence-ok-45',
    'activate B\nNote over C: wait\nA->>B: go\ndeactivate B\ndestroy D\nB-xD: stop',
    seq(
      [part('C'), part('A'), part('B'), part('D')],
      [
        mark('activate', 'B'),
        note('over', ['C'], 'wait'),
        msg('A', 'B', 'go'),
        mark('deactivate', 'B'),
        mark('destroy', 'D'),
        msg('B', 'D', 'stop', { head: 'cross' }),
      ],
    ),
  ],
  ['sequence-ok-46', 'rect\nA->>B: hi\nend', seq(AB, [frame('rect', [null, [msg('A', 'B', 'hi')]])])],
]
// [matrix row, whole fence body, the exact reason].
const REJECT: [string, string, string][] = [
  ['sequence-reject-01', 'sequenceDiagram\nA->>: hi', 'syntax:2'],
  ['sequence-reject-02', 'sequenceDiagram\nloop every s\nA->>B: hi', 'unclosed-frame'],
  [
    'sequence-reject-03',
    'sequenceDiagram\nA->>B: \u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}',
    'unsupported-char U+200D',
  ],
  ['sequence-reject-05', 'sequenceDiagram\ncreate participant C\nA->>B: hi', 'create'],
  ['sequence-reject-06', 'sequenceDiagram\ndestroy B\nA-xB: bye\nA->>B: again', 'destroyed'],
  ['sequence-reject-07', 'sequenceDiagram\nA->>C: hi\nbox G\nparticipant A\nparticipant B\nend', 'box-split'],
  ['sequence-reject-08', '---\ntitle: Checkout\n---\nsequenceDiagram\ntitle Payment\nA->>B: hi', 'title'],
]

test('A2: every covered sequence-ok row, 01-25, 30-37 and 39-46, parses to its exact model', () => {
  assert.deepEqual(
    OK.map(([id]) => id),
    '01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 30 31 32 33 34 35 36 37 39 40 41 42 43 44 45 46'
      .split(' ')
      .map((n) => `sequence-ok-${n}`),
  )
  for (const [id, body, want] of OK) {
    assert.deepEqual([id, P(body)], [id, want])
  }
})
test('A5.errors: every covered sequence-reject row, 01-03 and 05-08, fails with its exact reason', () => {
  assert.deepEqual(
    REJECT.map(([id]) => id),
    '01 02 03 05 06 07 08'.split(' ').map((n) => `sequence-reject-${n}`),
  )
  for (const [id, text, reason] of REJECT) {
    assert.deepEqual([id, parseSequence(readSource(text) as Source)], [id, { reason }])
  }
})

// The 148 CSS named colors of CSS Color 4: the test's own copy, checked against the W3C list, not read from the parser.
const CSS_NAMED =
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral
  cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange
  darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey
  dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo
  ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink
  lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine
  mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose
  moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff
  peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue
  slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen`.split(
    /\s+/,
  )

test('A2: a box label drops a leading CSS color: any of the 148 named colors in any case, transparent, #hex, rgb(), rgba(), hsl() or hsla()', () => {
  assert.deepEqual([CSS_NAMED.length, new Set(CSS_NAMED).size], [148, 148])
  assert.deepEqual(
    CSS_NAMED.flatMap((c) => [boxLabelOf(`${c} Team`), boxLabelOf(`${c.toUpperCase()} Team`)]),
    CSS_NAMED.flatMap(() => ['Team', 'Team']),
  )
  assert.deepEqual(
    [
      'Purple Alice & John',
      'Aqua Group Description',
      'transparent Team',
      'Transparent Team',
      'rgb(1,2,3) Team',
      'rgba(33,66,99,0.5) Team',
      'hsl(10, 40%, 90%) Team',
      'hsla(10, 40%, 90%, 0.5)   Team',
    ].map(boxLabelOf),
    ['Alice & John', 'Group Description', 'Team', 'Team', 'Team', 'Team', 'Team', 'Team'],
  )
  // A color alone leaves no label, as does a bare box.
  assert.deepEqual(['Aqua', 'TRANSPARENT', '#abc', 'rgb(33,66,99)', 'hsla(10, 40%, 90%, 0.5)', ''].map(boxLabelOf), [
    null,
    null,
    null,
    null,
    null,
    null,
  ])
})
// Mermaid 12.2.0's parseBoxData takes the color from the label's first run of word characters (\w*), wherever it ends,
// and keeps the whole label as the title unless the browser reads that run as a color.
test('A2: a box label keeps a leading word that is not a CSS color, and drops one that is wherever the word ends', () => {
  const kept = [
    'Another Group',
    'Group without description',
    'Redwood Team',
    'RGB(1,2,3) Team',
    'rgb (1,2,3) Team',
    'Team Blue',
    'Aqua2 x',
    'red_team x',
  ]
  assert.deepEqual(kept.map(boxLabelOf), kept)
  assert.deepEqual(['Red-team', 'red,team', 'Aqua: x'].map(boxLabelOf), ['-team', ',team', ': x'])
})
// Beyond the named colors, a browser reads currentColor, the CSS-wide keywords and the system colors (Canvas,
// Highlight, Menu, …) as colors, each to its own support. Not in the plan: a box label led by one falls back.
test('A5.errors: a box label led by currentColor, a CSS-wide keyword or a system color fails box-color', () => {
  const bad = [
    'currentColor Team',
    'inherit Team',
    'initial X',
    'unset X',
    'revert X',
    'Canvas Team',
    'Highlight x',
    'Menu x',
    'buttontext x',
    'Background x',
  ]
  assert.deepEqual(
    bad.map((t) => [t, P(`box ${t}\nparticipant A\nend\nA->>A: hi`)]),
    bad.map((t) => [t, { reason: 'box-color' }]),
  )
})
// Mermaid takes a box's color from a lowercase rgb(, rgba(, hsl( or hsla( to the label's last ), and drops it only if
// the browser reads it as a color; else the whole label is the title. Beyond the plan: one in a strict subset is
// dropped; any other falls back.
test('A2: a box label drops a leading rgb(), rgba(), hsl() or hsla() color in the strict subset, up to its ), with or without a space after', () => {
  const ok: [string, string][] = [
    ['rgb(1,2,3) Team', 'Team'],
    ['rgb(1,2,3)Team', 'Team'],
    ['rgb(1 2 3 / 50%) Team', 'Team'],
    ['rgba(255,0,0,0.5) T', 'T'],
    ['rgb(10%,20%,30%) T', 'T'],
    ['rgb( 0 , 255 , 0 ,.5 ) T', 'T'],
    ['rgb(100% 0% 12.5%/0.25) T', 'T'],
    ['hsl(120deg 50% 50%) T', 'T'],
    ['hsl(120, 50%, 50%) T', 'T'],
    ['hsla(1turn,1%,1%,1) T', 'T'],
    ['hsl(.5turn 0% 100% / 50%) T', 'T'],
    ['hsl(3.14rad,1%,1%,0%) T', 'T'],
    ['hsl(400grad 1% 1%) T', 'T'],
    ['red T', 'T'],
  ]
  assert.deepEqual(
    ok.map(([t]) => [t, boxLabelOf(t)]),
    ok,
  )
})
// The first is the QA repro: Mermaid titles that box rgb(nope) Team.
test('A5.errors: a box label whose leading rgb(, rgba(, hsl( or hsla( does not open a color, up to the last ), fails box-color', () => {
  const bad = [
    'rgb(nope) Team',
    'hsl(red) T',
    'rgb() T',
    'rgb(calc(1),2,3) Team',
    'rgb(1,2,3) Team (lead)',
    'rgb(1,2,3 T',
  ]
  assert.deepEqual(
    bad.map((t) => [t, P(`box ${t}\nparticipant A\nend\nA->>A: hi`)]),
    bad.map((t) => [t, { reason: 'box-color' }]),
  )
})
test('A5.errors: a box label whose rgb(), rgba(), hsl() or hsla() color is outside the strict subset fails box-color: out of range, too few or many, mixed forms', () => {
  const bad = [
    'rgb(256,0,0) T',
    'rgb(101%,0%,0%) T',
    'rgba(1,2,3,1.5) T',
    'rgb(1,2) T',
    'rgba(1,2,3,1,1) T',
    'rgb(1,2,3%) T',
    'rgb(1,2 3) T',
    'rgb(1 2 3, 0.5) T',
    'rgb(1.5,2,3) T',
    'hsl(120px, 50%, 50%) T',
    'hsl(120, 50, 50) T',
  ]
  assert.deepEqual(
    bad.map((t) => [t, P(`box ${t}\nparticipant A\nend\nA->>A: hi`)]),
    bad.map((t) => [t, { reason: 'box-color' }]),
  )
})
