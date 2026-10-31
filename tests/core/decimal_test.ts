import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseDec,
  dec,
  add,
  sub,
  mul,
  div,
  cmp,
  floor,
  ceil,
  roundHalfUp,
  toExact,
  toFixed,
  type Dec,
} from '../../core/charts/decimal.ts'
const D = (s: string) => parseDec(s) as Dec
test('A4: decimals parse exactly; malformed numbers are null', () => {
  for (const s of ['1', '-0.34', '+1.3', '.6', '2.4', '0']) {
    assert.notEqual(parseDec(s), null, s)
  }

  for (const s of ['1.', '1e3', 'NaN', '0x10', '', '-', '1.2.3']) {
    assert.equal(parseDec(s), null, s)
  }

  assert.equal(cmp(add(D('0.1'), D('0.2')), D('0.3')), 0)
  assert.equal(div(D('1'), dec(0)), null)
})
test('A4: rounding is half up; exact and fixed printing', () => {
  assert.deepEqual(
    [roundHalfUp(D('367.5')), roundHalfUp(D('24.5')), roundHalfUp(D('-2.5')), floor(D('-0.5')), ceil(D('2.4'))],
    [368, 25, -2, -1, 3],
  )
  assert.equal(toExact(D('-.34')), '-0.34')
  assert.equal(toExact(div(add(D('-.34'), D('2.4')), dec(2))!), '1.03')
  assert.equal(toExact(sub(D('11000'), D('4000'))), '7000')
  assert.equal(toExact(div(dec(1), dec(3))!), null)
  assert.equal(toFixed(mul(div(D('386'), D('486'))!, dec(100)), 1), '79.4')
  assert.deepEqual([toFixed(D('93.75'), 1), toFixed(D('6.25'), 1), toFixed(dec(100), 1)], ['93.8', '6.3', '100.0'])
})
// A Dec is { n, d } with d > 0n, reduced by its gcd, so the sign is on n and each value has one form.
test('A4: a Dec is reduced with its sign on n; whitespace, doubled signs, a lone point, Infinity and non-ASCII digits are null', () => {
  assert.deepEqual(['-0.34', '+1.3', '.6', '2.50', '-0.0', '007', '-12.5'].map(D), [
    { n: -17n, d: 50n },
    { n: 13n, d: 10n },
    { n: 3n, d: 5n },
    { n: 5n, d: 2n },
    { n: 0n, d: 1n },
    { n: 7n, d: 1n },
    { n: -25n, d: 2n },
  ])
  assert.deepEqual(
    [dec(-4), div(dec(3), dec(-6)), div(dec(0), D('-2'))],
    [
      { n: -4n, d: 1n },
      { n: -1n, d: 2n },
      { n: 0n, d: 1n },
    ],
  )
  assert.equal(div(dec(5), D('-0.00')), null)
  for (const s of [' 1', '1 ', '1\n', '+-1', '--1', '.', '-.', '1,5', 'Infinity', '١']) {
    assert.equal(parseDec(s), null, JSON.stringify(s))
  }
})
// Each case drifts as a Number: 0.1 + 0.2 is 0.30000000000000004, and (1.005).toFixed(2) is '1.00'.
test('A4: arithmetic, comparison and rounding stay exact where a Number drifts', () => {
  assert.deepEqual(
    [
      toExact(add(D('0.1'), D('0.2'))),
      toExact(sub(D('0.3'), D('0.1'))),
      toExact(mul(D('1.1'), D('1.1'))),
      toExact(div(D('0.3'), D('0.1'))!),
    ],
    ['0.3', '0.2', '1.21', '3'],
  )
  assert.deepEqual(
    [cmp(D('2.39999999999999999999'), D('2.4')), cmp(D('9007199254740993'), D('9007199254740992'))],
    [-1, 1],
  )
  assert.deepEqual(
    [floor(D('2.99999999999999999999')), ceil(D('2.00000000000000000001')), roundHalfUp(D('0.49999999999999999999'))],
    [2, 3, 0],
  )
  assert.deepEqual([toFixed(D('1.005'), 2), toFixed(D('1.45'), 1)], ['1.01', '1.5'])
})
const TINY = '0.' + '0'.repeat(20) + '1' // 1e-21
test('A4: large and small magnitudes stay exact', () => {
  assert.equal(toExact(add(D('99999999999999999999.99'), D('0.02'))), '100000000000000000000.01')
  assert.equal(toExact(add(D('9007199254740993'), D('0.1'))), '9007199254740993.1')
  assert.equal(toExact(mul(D('12345678901234567890'), D('-0.5'))), '-6172839450617283945')
  assert.equal(toFixed(D('12345678901234567890.25'), 1), '12345678901234567890.3')
  assert.deepEqual(
    [toExact(sub(D(TINY), mul(D(TINY), dec(2)))), toExact(mul(D('0.0001'), D('0.0003')))],
    ['-' + TINY, '0.00000003'],
  )
  assert.deepEqual(
    [toExact(div(dec(1), dec(1024))!), toExact(div(dec(-3), dec(40))!), toExact(div(dec(1), dec(6))!)],
    ['0.0009765625', '-0.075', null],
  )
})
// Half up is ⌊x + ½⌋, toward +∞ (resolved ambiguity 6). No result is -0, which deepEqual tells from 0.
test('A4: negatives round toward +∞, print their sign, and never print -0', () => {
  assert.deepEqual(
    [
      floor(D('-2')),
      floor(D('-2.000001')),
      ceil(D('-2.9')),
      ceil(D('-0.5')),
      roundHalfUp(D('-2.51')),
      roundHalfUp(D('-0.5')),
      roundHalfUp(D('-2.49')),
    ],
    [-2, -3, -2, 0, -3, 0, -2],
  )
  assert.deepEqual(
    [
      toFixed(D('-0.04'), 1),
      toFixed(D('-0.05'), 1),
      toFixed(D('-0.06'), 1),
      toFixed(D('-2.25'), 1),
      toFixed(D('-2.5'), 0),
      toFixed(D('2.5'), 0),
    ],
    ['0.0', '0.0', '-0.1', '-2.2', '-2', '3'],
  )
  assert.deepEqual(
    [cmp(D('-1'), D('0.5')), cmp(D('-0.34'), D('-0.3')), cmp(D('1.50'), D('1.5')), cmp(D('0.5'), D('-1'))],
    [-1, -1, 0, 1],
  )
  assert.deepEqual(
    [
      toExact(sub(D('-1.5'), D('2.25'))),
      toExact(mul(D('-1.5'), D('-2'))),
      toExact(add(D('-0.1'), D('0.1'))),
      toExact(D('-0.0')),
    ],
    ['-3.75', '3', '0', '0'],
  )
})
