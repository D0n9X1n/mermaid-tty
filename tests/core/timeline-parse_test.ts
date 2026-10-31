import test from 'node:test'
import assert from 'node:assert/strict'
import { parseTimeline } from '../../core/diagrams/timeline/parse.ts'
import { readSource } from '../../core/source.ts'
const P = (src: string) => {
  const s = readSource(src)
  return ('reason' in s ? s : parseTimeline(s)) as any
}
const shape = (t: any) => t.sections.map((s: any) => [s.name, s.periods.map((p: any) => [p.text, p.events])])
test('A5: ": " splits a period from its events and "10:30" does not; continuation lines; sections; <br> kept', () => {
  const t = P(
    [
      'timeline',
      'title History',
      'section Early<br>days',
      '2002 : LinkedIn',
      '2004 : Facebook : Google',
      '     : Meeting at 10:30',
      'section Later',
      '2005',
      '2006 : YouTube',
    ].join('\n'),
  )
  assert.deepEqual([t.dir, t.title, t.multicolor], ['LR', 'History', true])
  assert.deepEqual(shape(t), [
    [
      'Early<br>days',
      [
        ['2002', ['LinkedIn']],
        ['2004', ['Facebook', 'Google', 'Meeting at 10:30']],
      ],
    ],
    [
      'Later',
      [
        ['2005', []],
        ['2006', ['YouTube']],
      ],
    ],
  ])
})
test('A5: no sections; TD; disableMulticolor from frontmatter config; repeated period text', () => {
  const t = P('---\nconfig:\n  timeline:\n    disableMulticolor: true\n---\ntimeline TD\n2002 : LinkedIn\n2002 : again')
  assert.deepEqual(
    [t.dir, t.multicolor, shape(t)],
    [
      'TD',
      false,
      [
        [
          null,
          [
            ['2002', ['LinkedIn']],
            ['2002', ['again']],
          ],
        ],
      ],
    ],
  )
})
test('A5: disableMulticolor is read by JS truthiness: a quoted "false" disables multicolor, and a plain false keeps it', () => {
  const m = (v: string) =>
    P(`---\nconfig:\n  timeline:\n    disableMulticolor: ${v}\n---\ntimeline\n2002 : LinkedIn`).multicolor
  assert.deepEqual(['"false"', 'false'].map(m), [false, true])
})
test('A5.errors: an event before any period, a period before the first section, a repeated section, ":" with no space, # and a second title fall back', () => {
  for (const [body, why] of [
    [': lonely', 'syntax:2'],
    ['2001 : a\nsection A\n2002 : b', 'section:2'],
    ['section A\n2001 : a\nsection A\n2002 : b', 'repeat:4'],
    ['2002 :LinkedIn', 'syntax:2'],
    ['C# 1.0 : released', 'syntax:2'],
    ['title A\ntitle B\n2002 : x', 'repeat:3'],
  ] as const) {
    assert.deepEqual(P(`timeline\n${body}`), { reason: why }, body)
  }
})
test('A5.errors: the header is timeline, alone or with LR or TD, case-sensitive', () => {
  assert.deepEqual(
    ['timeline LR', 'timeline TD'].map((h) => P(`${h}\n2002`).dir),
    ['LR', 'TD'],
  )
  for (const h of ['Timeline', 'timeline RL', 'timeline  TD', 'timelines', 'timeline td']) {
    assert.deepEqual(P(`${h}\n2002`), { reason: 'header' }, h)
  }
})
test('A5.errors: a keyword in another case, starting a longer word or with no text, a section with ":", and empty or ambiguous events fall back', () => {
  for (const body of [
    'Section A',
    'SECTION A',
    'Title A',
    'titled x',
    'title',
    'section',
    'sections A',
    'timeline',
    'ACCTITLE: x',
    'section A: b',
    '2002 : a :',
    '2002 :\tx',
    '2002 :  : x',
    '2002 : ',
    ':',
    'accDescr { a } x',
  ]) {
    assert.deepEqual(P(`timeline\n${body}`), { reason: 'syntax:2' }, body)
  }
  assert.deepEqual(P('timeline\n2002\naccDescr {\nopen'), { reason: 'syntax:3' })
})
test('A5: accTitle and accDescr are ignored, # and : included; no title is null', () => {
  const t = P('timeline\naccTitle: C# : notes\naccDescr: x #1\naccDescr {\n  a # b\n}\n2002 : a :b\naccDescr { c }')
  assert.deepEqual([t.title, shape(t)], [null, [[null, [['2002', ['a :b']]]]]])
})
test('A5: periods, events and section names show &, <, >, tags, comments and every <br> spelling as written', () => {
  const t = P('timeline\nsection Q&A <b>z</b>\na < b : x > 5 : a<!--c-->b\n&lt; : a<BR>b : a<br/>b : a<br />b')
  assert.deepEqual(shape(t), [
    [
      'Q&A <b>z</b>',
      [
        ['a < b', ['x > 5', 'a<!--c-->b']],
        ['&lt;', ['a<BR>b', 'a<br/>b', 'a<br />b']],
      ],
    ],
  ])
})
test('A5.errors: entity markers and unsupported characters fall back in every field; a title is sanitized with no <br>', () => {
  for (const [body, why] of [
    ['section ﬂ°x¶ß\n2002', 'entity'],
    ['2002 : ﬂ°x', 'entity'],
    ['¶ß', 'entity'],
    ['2002 : a‍b', 'unsupported-char U+200D'],
    ['section a‍b\n2002', 'unsupported-char U+200D'],
    ['title a < b\n2002', 'html'],
    ['title a<br>b\n2002', 'html'],
    ['title a‍b\n2002', 'unsupported-char U+200D'],
  ] as const) {
    assert.deepEqual(P(`timeline\n${body}`), { reason: why }, body)
  }
  assert.equal(P('timeline\ntitle Q&A > x\n2002').title, 'Q&A > x')
})
