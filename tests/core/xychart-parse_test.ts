import test from 'node:test'
import assert from 'node:assert/strict'
import { parseXy } from '../../core/diagrams/xychart/parse.ts'
import { readSource } from '../../core/source.ts'
const P = (src: string) => {
  const s = readSource(src)
  return ('reason' in s ? s : parseXy(s)) as any
}
test('A5: headers, orientation, quoted and one-word texts, categories, a range and named series', () => {
  const m = P(
    [
      'xychart-beta horizontal',
      'title "Sales Revenue"',
      'x-axis Month [jan, feb, "mar 1"]',
      'y-axis "Revenue (in $)" 4000 --> 11000',
      'bar [5000, 6000, 7500]',
      'line Trend [5000, 6000, 7500]',
    ].join('\n'),
  )
  assert.deepEqual(
    [m.orientation, m.title, m.xTitle, m.categories, m.yTitle, m.range.lo.raw, m.range.hi.raw],
    ['horizontal', 'Sales Revenue', 'Month', ['jan', 'feb', 'mar 1'], 'Revenue (in $)', '4000', '11000'],
  )
  assert.deepEqual(
    m.series.map((s: any) => [s.kind, s.name, s.values.map((v: any) => v.raw)]),
    [
      ['bar', null, ['5000', '6000', '7500']],
      ['line', 'Trend', ['5000', '6000', '7500']],
    ],
  )
  const s = P('xychart\nline [+1.3, .6, 2.4, -.34]')
  assert.deepEqual([s.orientation, s.categories, s.range], ['vertical', null, null])
})
test('A5.errors: point labels, a numeric x range, unquoted-text limits, repeats, lengths, domains and series counts fall back', () => {
  for (const [body, why] of [
    ['line [540 "PaLM", 600]', 'syntax:2'],
    ['x-axis 0 --> 100', 'syntax:2'],
    ['title Sales Revenue', 'syntax:2'],
    ['x-axis Q1 [a, b]\nbar [1, 2]', 'syntax:2'],
    ['x-axis [barley, wheat]\nbar [1, 2]', 'syntax:2'],
    ['bar [1, 2', 'syntax:2'],
    ['x-axis [a, a]\nbar [1, 2]', 'repeat:2'],
    ['x-axis [a]\nx-axis [b]\nbar [1]', 'repeat:3'],
    ['x-axis [a, b, c]\nbar [1, 2]', 'length'],
    ['y-axis 0 --> 100\nbar [120]', 'domain'],
    ['bar [2.3, 45, .98, -3.4]', 'domain'],
    ['y-axis 5 --> 5\nline [5]', 'domain'],
    ['bar [0, 0]', 'domain'],
    [Array.from({ length: 9 }, () => 'line [1]').join('\n'), 'series'],
  ] as const) {
    assert.deepEqual(P(`xychart-beta\n${body}`), { reason: why }, body)
  }
})

// Beyond the plan's two: the rest of the matrix's xychart rules. Q: the result for a body under an xychart-beta header.
const Q = (body: string) => P(`xychart-beta\n${body}`)
test('A5: a title alone on either axis; every field set, none undefined; values exact as written', () =>
  assert.deepEqual(P('xychart vertical\nx-axis "Month of year"\ny-axis Units\nbar [0, 2.50]'), {
    orientation: 'vertical',
    title: null,
    xTitle: 'Month of year',
    categories: null,
    yTitle: 'Units',
    range: null,
    series: [
      {
        kind: 'bar',
        name: null,
        values: [
          { raw: '0', value: { n: 0n, d: 1n } },
          { raw: '2.50', value: { n: 5n, d: 2n } },
        ],
      },
    ],
  }))
test('A5: a frontmatter title, accTitle, accDescr and the xychart config are read; only the title draws', () => {
  const m = P(
    [
      '---',
      'title: Sales',
      'config:',
      '  xyChart:',
      '    showDataLabel: true',
      '---',
      'xychart-beta',
      'accTitle: Revenue',
      'accDescr : about',
      'accDescr {',
      'bar [9]',
      '}',
      'accDescr { one line }',
      'line [1, 2]',
    ].join('\n'),
  )
  assert.deepEqual([m.title, m.series.map((s: any) => s.kind)], ['Sales', ['line']])
})
test('A5.errors: a bad header, a second title or axis, and an unclosed or run-on accDescr fall back', () => {
  for (const [src, why] of [
    ['xychart-beta diagonal\nbar [1]', 'header'],
    ['xychart Horizontal\nbar [1]', 'header'],
    ['xyChart\nbar [1]', 'header'],
    ['---\ntitle: A\n---\nxychart-beta\ntitle B\nbar [1]', 'repeat:5'],
    ['xychart-beta\ntitle A\ntitle B\nbar [1]', 'repeat:3'],
    ['xychart-beta\ny-axis A\ny-axis 0 --> 5\nbar [1]', 'repeat:3'],
    ['xychart-beta\nx-axis A\nx-axis [a]\nbar [1]', 'repeat:3'],
    ['xychart-beta\nbar [1]\naccDescr {\ntext', 'syntax:3'],
    ['xychart-beta\naccDescr { a } bar [1]', 'syntax:2'],
    ['xychart-beta\nAccTitle: a\nbar [1]', 'syntax:2'],
  ] as const) {
    assert.deepEqual(P(src), { reason: why }, src)
  }
})
// k copies of the statement s, one per line.
const times = (k: number, s: string) => Array.from({ length: k }, () => s).join('\n')
test('A5: quoted texts are trimmed and may hold keywords, digits and commas; 8 lines, 26 bars and a line on a negative bound draw', () => {
  const m = Q('title " Q1, bar "\nx-axis "x-axis 1" [" line ", 2024]\nline "Linear" [1, 2]')
  assert.deepEqual(
    [m.title, m.xTitle, m.categories, m.series[0].name],
    ['Q1, bar', 'x-axis 1', ['line', '2024'], 'Linear'],
  )
  assert.deepEqual(
    [
      Q(times(8, 'line [1]')).series.length,
      Q(times(26, 'bar [1]')).series.length,
      Q('y-axis -5 --> 5\nline [-5, 5]').range.lo.raw,
    ],
    [8, 26, '-5'],
  )
})
test('A5.errors: markdown, blank and undrawable texts, keywords in any case or longer words, y-axis title digits, unequal series, bars below 0 and 27 bars fall back', () => {
  for (const [body, why] of [
    ['title "`**Sales**`"\nbar [1]', 'syntax:2'],
    ['title " "\nbar [1]', 'syntax:2'],
    ['title ""\nbar [1]', 'syntax:2'],
    ['line "a‍b" [1]', 'unsupported-char U+200D'],
    ['x-axis [Barley]\nbar [1]', 'syntax:2'],
    ['line LINEAR [1]', 'syntax:2'],
    ['line a1Bar [1]', 'syntax:2'],
    ['y-axis Rev2 0 --> 5\nbar [1]', 'syntax:2'],
    ['Title A\nbar [1]', 'syntax:2'],
    ['BAR [1]', 'syntax:2'],
    ['lines [1]', 'syntax:2'],
    ['bar [1, 2]\nline [1]', 'length'],
    ['y-axis -5 --> 5\nbar [1]', 'domain'],
    ['bar [1]\nline [-1]', 'domain'],
    [times(27, 'bar [1]'), 'series'],
  ] as const) {
    assert.deepEqual(Q(body), { reason: why }, body)
  }
})
// Mermaid's Diagram.fromText encodes every #…; in the body and its SVG decodes it, so "#9829;" shows ♥: such text would
// draw differently here, so it falls back, as flowchart's labels do. A # with no ; is text.
test('A5.errors: a #…; entity in any drawn text falls back; a lone # is text', () => {
  for (const body of [
    'title "Love #9829;"',
    'x-axis ["a#quot;b", c]\nbar [1, 2]',
    'line "#lt;3" [1]',
    'y-axis "#9829;" 0 --> 5\nbar [1]',
  ]) {
    assert.deepEqual(P(`xychart-beta\n${body}`), { reason: 'entity' }, body)
  }

  assert.equal(P('xychart-beta\ntitle "C# 1.0"\nbar [1]').title, 'C# 1.0')
})
// From QA: numbers keep their spelling exactly, sign and leading dot included, and their exact values.
test('A5: each value keeps its raw spelling and its exact value', () => {
  const v = P('xychart\nline [+1.3, .6, 2.4, -.34]').series[0].values
  assert.deepEqual(
    v.map((x: any) => x.raw),
    ['+1.3', '.6', '2.4', '-.34'],
  )
  assert.deepEqual(
    v.map((x: any) => [x.value.n, x.value.d]),
    [
      [13n, 10n],
      [3n, 5n],
      [12n, 5n],
      [-17n, 50n],
    ],
  )
})
