import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseDateFormat,
  parseDate,
  parseAxisFormat,
  formatAxis,
  parseDuration,
  tickStep,
} from '../../core/diagrams/gantt/time.ts'
const F = (f: string) => parseDateFormat(f) as any
const A = (f: string, dated = true) => parseAxisFormat(f, dated) as any
const D = 86_400_000
const MIN = 60_000
test('A4: dates are naive UTC and match dateFormat exactly; one-letter tokens take no leading zero', () => {
  assert.equal(parseDate('2024-01-01', F('YYYY-MM-DD')), Date.UTC(2024, 0, 1))
  assert.equal(parseDate('2014-1-1', F('YYYY-MM-DD')), null)
  assert.equal(parseDate('20/7/2017 9:5:3', F('D/M/YYYY H:m:s')), Date.UTC(2017, 6, 20, 9, 5, 3))
  assert.equal(parseDate('2024-02-30', F('YYYY-MM-DD')), null)
  assert.equal(parseDate('17:49', F('HH:mm')), Date.UTC(1970, 0, 1, 17, 49))
  assert.equal(parseDate('2024-03-01T08:00:00.500', F('YYYY-MM-DDTHH:mm:ss.SSS')), Date.UTC(2024, 2, 1, 8, 0, 0, 500))
  assert.deepEqual([F('X'), F('YYYY-MM')], [{ reason: 'format-token' }, { reason: 'format-ymd' }])
})
test('A4: axis tokens print fixed widths and English names; a date-free dateFormat allows only %H %M %S %L', () => {
  const t = Date.UTC(2024, 0, 1, 8, 5, 9, 7)
  assert.deepEqual(
    [formatAxis(t, A('%Y-%m-%d')), formatAxis(t, A('%y/%j %H:%M:%S.%L')), formatAxis(t, A('%a %e %b'))],
    ['2024-01-01', '24/001 08:05:09.007', 'Mon  1 Jan'],
  )
  assert.deepEqual([A('%s'), A('%Y-%m-%d', false)], [{ reason: 'axis-format' }, { reason: 'axis-format' }])
})
test('A4: durations are whole ms; M, y, junk, a fractional d or w, and fractions of a ms are null; tick steps follow the matrix', () => {
  assert.deepEqual(['500ms', '30s', '1.5s', '2m', '1.5m', '1.5h', '2d', '1w', '0d'].map(parseDuration), [
    500,
    30_000,
    1_500,
    2 * MIN,
    90_000,
    5_400_000,
    2 * D,
    7 * D,
    0,
  ])
  for (const s of ['1M', '1y', '3dX', '1.0001ms', 'd', '1.5', '1.5d', '0.5w']) {
    assert.equal(parseDuration(s), null, s)
  }
  assert.deepEqual(
    [
      tickStep(30 * D, 60, 10),
      tickStep(30 * D, 35, 10),
      tickStep(23 * MIN, 60, 5),
      tickStep(510 * MIN, 43, 5),
      tickStep(1e6 * D, 10, 10),
    ],
    [7 * D, 14 * D, 5 * MIN, 3 * 3_600_000, null],
  )
})

// The task's rules, on cases the tests above leave out.
const H = 3_600_000
test('A4: a one-letter token with a leading zero, a field out of range, and a year below 100 are null', () => {
  const dmy = F('D/M/YYYY H:m:s')
  const ymd = F('YYYY-MM-DD')
  for (const s of ['05/7/2017 9:5:3', '20/07/2017 9:5:3', '20/7/2017 09:5:3', '20/7/2017 9:05:3', '20/7/2017 9:5:03']) {
    assert.equal(parseDate(s, dmy), null, s)
  }
  assert.equal(parseDate('1/1/2017 0:0:0', dmy), Date.UTC(2017, 0, 1))
  // Date.UTC reads years 0–99 as 1900–1999, so they never round-trip; Mermaid's strict Day.js parse rejects them too.
  for (const s of ['2024-13-01', '2024-00-10', '2024-01-00', '2024-01-32', '2023-02-29', '0024-01-01', '0000-01-01']) {
    assert.equal(parseDate(s, ymd), null, s)
  }
  for (const s of ['24:00', '12:60', '1:00', '12:5']) {
    assert.equal(parseDate(s, F('HH:mm')), null, s)
  }
  assert.deepEqual(
    [parseDate('2024-02-29', ymd), parseDate('0100-01-01', ymd)],
    [Date.UTC(2024, 1, 29), Date.UTC(100, 0, 1)],
  )
})
test('A4: a dateFormat token is a listed one, and a literal one of - / . : T and space', () => {
  for (const f of ['yyyy-MM-DD', 'YY-MM-DD', 'YYYY-MM-DD,', 'YYYY-MM-Do', 'YYYY-MM-DD hh:mm']) {
    assert.deepEqual(F(f), { reason: 'format-token' }, f)
  }
  assert.deepEqual([F('MM-DD'), F('YYYY-DD HH')], [{ reason: 'format-ymd' }, { reason: 'format-ymd' }])
  assert.equal(parseDate('2024/3/1 8.05', F('YYYY/M/D H.mm')), Date.UTC(2024, 2, 1, 8, 5))
})
test('A4: any other % fails an axisFormat; a date-free one takes no date token; %Y %y %j %a %b keep their widths', () => {
  for (const f of ['%', '%%', '%-d', '%_H', 'a%', '%Q']) {
    assert.deepEqual(A(f), { reason: 'axis-format' }, f)
  }
  for (const f of ['%Y', '%y', '%m', '%d', '%e', '%j', '%b', '%a']) {
    assert.deepEqual(A(f, false), { reason: 'axis-format' }, f)
  }
  assert.equal(formatAxis(Date.UTC(1970, 0, 1, 17, 49, 5, 30), A('at %H:%M:%S.%L', false)), 'at 17:49:05.030')
  // d3-time-format prints %Y as the year mod 10000 and %y as the year mod 100, so a year past 9999 keeps four digits.
  assert.deepEqual(
    [
      formatAxis(Date.UTC(10024, 0, 1), A('%Y %y')),
      formatAxis(Date.UTC(2024, 11, 28), A('%j %a %b %d')),
      formatAxis(Date.UTC(2023, 11, 31), A('%j %a')),
    ],
    ['0024 24', '363 Sat Dec 28', '365 Sun'],
  )
})
test('A4: d and w take no decimal point; a decimal ms, s, m or h is exact; ticks take each matrix step in turn', () => {
  for (const s of ['2.0d', '1.0w', '0.5ms', ' 2d', '2 d', '-1d', '.5h', '1e3ms']) {
    assert.equal(parseDuration(s), null, s)
  }
  assert.deepEqual(['1.50s', '0.001s', '0.25m', '007ms'].map(parseDuration), [1_500, 1, 15_000, 7])
  const steps = [
    1,
    5,
    10,
    50,
    100,
    500,
    ...[1, 5, 15, 30].map((n) => n * 1000),
    ...[1, 5, 15, 30].map((n) => n * MIN),
    ...[1, 3, 6, 12].map((n) => n * H),
    ...[1, 2, 7, 14, 30, 90, 180, 365, 730, 1825, 3650, 7300, 18250, 36500].map((n) => n * D),
  ]
  assert.deepEqual(
    steps.map((s) => tickStep(s, 2, 1)),
    steps,
  )
  assert.deepEqual(
    steps.map((s) => tickStep(s + 1, 2, 1)),
    [...steps.slice(1), null],
  )
})
// Mermaid's Day.js reads MMM as a month name and a repeated field twice, and a one-letter token's 1–2 digits greedily, never
// backtracking: under Hmm it reads 930 as hour 93 and fails, where a backtracking pattern reads 9:30. So these fail.
test('A4: a dateFormat that repeats a field, or puts a one-letter token right before another token, fails format-token', () => {
  for (const f of [
    'YYYY-MMM-DD',
    'YYYY-MM-DD HH:mm HH',
    'YYYY-MM-DD:SSSSSS',
    'YYYY-MM-DD Hmm',
    'DMYYYY',
    'YYYYMDD',
    'YYYY-MM-DD HH:ms',
  ]) {
    assert.deepEqual(F(f), { reason: 'format-token' }, f)
  }
  assert.deepEqual(
    [parseDate('20240105', F('YYYYMMDD')), parseDate('2024-01-05 9:30', F('YYYY-MM-DD H:mm'))],
    [Date.UTC(2024, 0, 5), Date.UTC(2024, 0, 5, 9, 30)],
  )
})
test('A4: a duration too large to be exact as a number is null; a span or width that is not an integer gives no tick step', () => {
  for (const s of [`${'9'.repeat(400)}ms`, '9007199254740993ms']) {
    assert.equal(parseDuration(s), null, s)
  }
  for (const [m, w] of [
    [1.5, 60],
    [NaN, 60],
    [D, 60.5],
    [D, Infinity],
  ] as const) {
    assert.equal(tickStep(m, w, 5), null, `${m} ${w}`)
  }
})
