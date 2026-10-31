import test from 'node:test'
import assert from 'node:assert/strict'
import { parseGantt } from '../../core/diagrams/gantt/parse.ts'
import { readSource } from '../../core/source.ts'
const P = (body: string) => {
  const s = readSource(`gantt\n${body}`)
  return ('reason' in s ? s : parseGantt(s)) as any
}
const U = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d)
test('A5: starts and ends resolve from the previous end, after, a date or a duration; milestones; timings as written', () => {
  const g = P(
    [
      'title Release',
      'section Build',
      'Spec :crit, done, s, 2024-01-01, 10d',
      'Code :active, after s, 20d',
      'Ship :milestone, 2024-01-31, 0d',
      'Wrap :2d',
    ].join('\n'),
  )
  assert.deepEqual(
    g.tasks.map((t: any) => [t.name, t.start, t.end, t.timing, t.tags]),
    [
      ['Spec', U(2024, 1, 1), U(2024, 1, 11), '2024-01-01 · 10d', ['crit', 'done']],
      ['Code', U(2024, 1, 11), U(2024, 1, 31), 'after s · 20d', ['active']],
      ['Ship', U(2024, 1, 31), U(2024, 1, 31), '2024-01-31 · 0d', ['milestone']],
      ['Wrap', U(2024, 1, 31), U(2024, 2, 2), '2d', []],
    ],
  )
  assert.deepEqual([g.title, g.sections, g.tasks[0].section], ['Release', ['Build'], 0])
})
test('A5: after takes the latest end; until the earliest start; an id may be defined later', () => {
  const g = P(
    [
      'apple :a, 2017-07-20, 1w',
      'banana :b, 2017-07-23, 1d',
      'cherry :c, after b a, 1d',
      'kiwi :d, 2017-07-20, until b c',
      'x :2017-08-01, until y',
      'y :y, 2017-08-05, 1d',
    ].join('\n'),
  )
  const T = (n: string) => g.tasks.find((t: any) => t.name === n)
  assert.deepEqual(
    [T('cherry').start, T('cherry').end, T('kiwi').end, T('x').end],
    [U(2017, 7, 27), U(2017, 7, 28), U(2017, 7, 23), U(2017, 8, 5)],
  )
})
test('A5.errors: unsupported statements and bad dates, durations, ids, references and names fall back', () => {
  for (const [body, why] of [
    ['A :2024-01-01, 1d\nexcludes weekends', 'syntax:3'],
    ['A :2024-01-01, 3dX', 'syntax:2'],
    ['A :2014-1-1, 1d', 'date:2'],
    ['A :a1, 2024-01-01, 1d\nB :a1, 2024-01-02, 1d', 'repeat:3'],
    ['A :a1, after zz, 1d', 'ref:2'],
    ['A :a, after b, 1d\nB :b, after a, 1d', 'cycle'],
    ['A :2024-01-05, 2024-01-01', 'order:2'],
    ['A :5d', 'start:2'],
    ['A :2024-01-01, 1M', 'syntax:2'],
    ['A :vert, 2024-01-02, 0d', 'syntax:2'],
    ['A :2024-01-01, 1d\nCall vendor :2d', 'syntax:3'],
    ['A :2024-01-01, 1d\n5% bonus :2d', 'syntax:3'],
    ['A :2024-01-01, 1d\n2024-01-01 kickoff :1d', 'syntax:3'],
  ] as const) {
    assert.deepEqual(P(body), { reason: why }, body)
  }

  assert.deepEqual(P('dateFormat HH:mm\nA :17:49, 2m'), { reason: 'axis-format' })
})

// Beyond the plan's three: the rest of the task's rules and the matrix's gantt subset.
test('A5: every field is set, none undefined; a task before any section is in section -1; the formats and todayMarker off are read', () => {
  const t = Date.UTC(2024, 1, 1, 9, 5)
  const MIN = 60_000
  assert.deepEqual(
    P(
      [
        'dateFormat D/M/YYYY H:m',
        'axisFormat %e %b %H:%M',
        'todayMarker off',
        'A :a1, 1/2/2024 9:5, 90m',
        'section S',
        'B :2h',
      ].join('\n'),
    ),
    {
      title: null,
      dated: true,
      axis: ['%e', ' ', '%b', ' ', '%H', ':', '%M'],
      sections: ['S'],
      tasks: [
        { name: 'A', section: -1, tags: [], start: t, end: t + 90 * MIN, timing: '1/2/2024 9:5 · 90m', line: 5 },
        { name: 'B', section: 0, tags: [], start: t + 90 * MIN, end: t + 210 * MIN, timing: '2h', line: 7 },
      ],
    },
  )
})
test('A5: click, accTitle and accDescr draw nothing; a dateFormat applies to tasks before it; a repeated tag counts once', () => {
  const g = P(
    [
      'accTitle: Plan',
      'accDescr: the plan',
      'accDescr {',
      'X :1d',
      '}',
      'A :crit, active, crit, a1, 17:49, 2m',
      'click a1 href "https://example.com"',
      'accDescr { one line }',
      'dateFormat HH:mm',
      'axisFormat %H:%M',
    ].join('\n'),
  )
  assert.deepEqual(
    [g.dated, g.tasks.map((t: any) => [t.name, t.tags, t.start, t.end])],
    [false, [['A', ['crit', 'active'], Date.UTC(1970, 0, 1, 17, 49), Date.UTC(1970, 0, 1, 17, 51)]]],
  )
})
test('A5.errors: a header with more, no name or colon, only tags, four items, a bad id, another todayMarker, 1.5d and an open accDescr fall back', () => {
  assert.deepEqual(parseGantt(readSource('gantt x\nA :2024-01-01, 1d') as any), { reason: 'header' })
  for (const [body, why] of [
    [':2024-01-01, 1d', 'syntax:2'],
    ['A', 'syntax:2'],
    ['A :done, crit', 'syntax:2'],
    ['B :crit, b1, 2024-01-04, 3d, 4d', 'syntax:2'],
    ['A :a.b, 2024-01-01, 1d', 'syntax:2'],
    ['A :2024-01-01, 1d\ntodayMarker on', 'syntax:3'],
    ['A :2024-01-01, 1.5d', 'syntax:2'],
    ['A :2024-01-01, 1d\naccDescr {\nB :1d', 'syntax:3'],
  ] as const) {
    assert.deepEqual(P(body), { reason: why }, body)
  }
})

// The PM's additions: the Date range, entities, the keyword rule (common rule 5), a second title, and undrawable text.
test('A5.errors: an end past the Date range falls back with its line; one at the edge resolves', () => {
  assert.deepEqual(P('A :2024-01-01, 100000000d'), { reason: 'date:2' })
  assert.equal(P('A :1970-01-01, 100000000d').tasks[0].end, 8.64e15)
})
// Mermaid's Diagram.fromText encodes every #…; in the body and its SVG decodes it, so #9829; shows ♥: such text would
// draw
// differently here, so it falls back. A # with no ; is text.
test('A5.errors: a #…; entity in a body title, a section or a task name falls back; a lone # is text', () => {
  for (const body of ['title Love #9829;', 'section #lt;3', 'A #9829; :2024-01-01, 1d']) {
    assert.deepEqual(P(`${body}\nX :2024-01-01, 1d`), { reason: 'entity' }, body)
  }

  const g = P('title C# plan\nsection C#\nF# port :2024-01-01, 1d')
  assert.deepEqual([g.title, g.sections, g.tasks[0].name], ['C# plan', ['C#'], 'F# port'])
})
test('A5.errors: a keyword in another case, or one that starts a longer word, falls back', () => {
  for (const line of [
    'Section A :2024-01-01, 1d',
    'sections :2024-01-01, 1d',
    'titled :2024-01-01, 1d',
    'Title page :2024-01-01, 1d',
    'DateFormat review :2024-01-01, 1d',
    'Click here :2024-01-01, 1d',
    'Gantt review :2024-01-01, 1d',
    'accDescription :2024-01-01, 1d',
    'todayMarkers :2024-01-01, 1d',
    'Excludes :2024-01-01, 1d',
    'AccTitle: Plan',
  ]) {
    assert.deepEqual(P(line), { reason: 'syntax:2' }, line)
  }
})
test('A5.errors: a second title, from frontmatter or a statement, and an undrawable character in drawn text fall back', () => {
  assert.deepEqual(P('title A\ntitle B\nX :2024-01-01, 1d'), { reason: 'repeat:3' })
  assert.deepEqual(parseGantt(readSource('---\ntitle: A\n---\ngantt\ntitle B\nX :2024-01-01, 1d') as any), {
    reason: 'repeat:5',
  })
  for (const body of ['title a‍b', 'section a‍b', 'a‍b :2024-01-01, 1d']) {
    assert.deepEqual(P(`${body}\nX :2024-01-01, 1d`), { reason: 'unsupported-char U+200D' }, body)
  }
})

// Mermaid 12.2.0's ganttDb resolves times in up to 11 passes in source order. A pass reads a task not yet resolved as
// no
// time: `after a b` with b later takes a's end alone, and the first task of a chain of 11 forward references never
// resolves.
// Such charts would draw differently here, so they fall back.
const chain = (k: number) =>
  [...Array.from({ length: k }, (_, i) => `T${i} :t${i}, after t${i + 1}, 1d`), `T${k} :t${k}, 2024-01-01, 1d`].join(
    '\n',
  )
test('A5.errors: a reference Mermaid reads before its task resolves falls back; one it reads in time resolves', () => {
  assert.deepEqual(P('A :a, 2024-01-01, 1d\nX :after a b, 1d\nB :b, 2024-01-05, 1d'), { reason: 'ref-order:3' })
  assert.equal(P('A :a, 2024-01-01, 1d\nX :after b a, 1d\nB :b, 2024-01-05, 1d').tasks[1].start, U(2024, 1, 6))
  assert.deepEqual(P(chain(11)), { reason: 'ref-order:2' })
  assert.equal(P(chain(10)).tasks[0].start, U(2024, 1, 11))
})
// As in Mermaid, a task with no id is task<n>, n counting such tasks; __proto__ is no key of its plain-object store.
test('A5.errors: a task with no id is task<n>, which another task may not repeat; __proto__ is no id', () => {
  assert.equal(P('A :2024-01-01, 1d\nB :after task1, 1d').tasks[1].start, U(2024, 1, 2))
  for (const [body, why] of [
    ['A :2024-01-01, 1d\nB :task1, 2024-01-02, 1d', 'repeat:3'],
    ['A :task1, 2024-01-01, 1d\nB :2024-01-02, 1d', 'repeat:3'],
    ['A :__proto__, 2024-01-01, 1d', 'syntax:2'],
  ] as const) {
    assert.deepEqual(P(body), { reason: why }, body)
  }
})
test('A5.errors: a click Mermaid would not read on its line, an axisFormat with # or ;, and a name lexed as href fall back', () => {
  for (const line of [
    'click a1',
    'click a1 call cb',
    'click a1 href ""',
    'click a1 href "u" x',
    'axisFormat %Y #x',
    'axisFormat %Y;',
    'href "x" :1d',
  ]) {
    assert.deepEqual(P(`A :a1, 2024-01-01, 1d\n${line}`), { reason: 'syntax:3' }, line)
  }

  for (const line of [
    'click a1 call cb()',
    'click a1 call cb(x, "y") href "u"',
    'click a1 href "u" call cb()',
    'click a1,b1 href "https://e.com/?q=1"',
  ]) {
    assert.equal(P(`A :a1, 2024-01-01, 1d\n${line}`).tasks.length, 1, line)
  }
})
