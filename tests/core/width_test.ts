import test from 'node:test'
import assert from 'node:assert/strict'
import { width, unsupported, isWide } from '../../core/width.ts'
import { WIDE } from '../../core/width-table.ts'

const hex = (cp: number) => 'U+' + cp.toString(16).toUpperCase().padStart(4, '0')
// Assertion messages list code points, so invisible characters show.
const cps = (s: string) => [...s].map(c => hex(c.codePointAt(0)!)).join(' ')
// unsupported() of a lone code point.
const alone = (cp: number) => unsupported(String.fromCodePoint(cp))

// 'é' is e + a combining acute; '​' is a zero-width space. F: U+FF21
// FULLWIDTH LATIN CAPITAL LETTER A, U+3000 IDEOGRAPHIC SPACE, U+FFE5 FULLWIDTH YEN
// SIGN; U+FF61 HALFWIDTH IDEOGRAPHIC FULL STOP is H. U+20DD COMBINING ENCLOSING
// CIRCLE is Me.
test('A4.width-table: widths', () => {
  for (const [s, w] of [['a', 1], ['中', 2], ['ア', 2], ['한', 2], ['─', 1], ['│', 1], ['┌', 1], ['◇', 1], ['▶', 1],
    ['é', 1], ['​', 0], ['读取配置文件', 12],
    ['Ａ', 2], ['　', 2], ['￥', 2], ['｡', 1],
    ['́', 0], ['⃝', 0], ['a⃝', 1],
    ['‌', 0], ['⁠', 0], ['﻿', 0], ['a​b', 2], ['中‌文', 4], ['a⁠b', 2], ['a﻿b', 2]] as const) assert.equal(width(s), w, cps(s))
  assert.equal(isWide(0x1F680), true)
})

// Inclusive WIDE ranges in Unicode 16.0.0: the first, a single code point, two
// ranges one code point apart, the F block FF01..FF60, an astral range and the last.
const RANGES = [[0x1100, 0x115F], [0x23F0, 0x23F0], [0x26F2, 0x26F3], [0x26F5, 0x26F5], [0xFF01, 0xFF60], [0x1F680, 0x1F6C5], [0x30000, 0x3FFFD]] as const

test('A4.width-table: isWide is true at lo and hi, false at lo-1 and hi+1', () => {
  const bounds = (lo: number, hi: number) => assert.deepEqual([lo - 1, lo, hi, hi + 1].map(cp => isWide(cp)), [false, true, true, false], `${hex(lo)}..${hex(hi)}`)
  for (const [lo, hi] of RANGES) bounds(lo, hi)
  assert.deepEqual([WIDE[0], WIDE[1], WIDE.at(-2), WIDE.at(-1)], [0x1100, 0x115F, 0x30000, 0x3FFFD], 'the first and last ranges')
  for (let i = 0; i < WIDE.length; i += 2) bounds(WIDE[i]!, WIDE[i + 1]!)
})

// Each case names its first offending code point: uppercase hex, at least 4 digits.
test('A4.width-table: unsupported text falls back', () => {
  for (const [s, cp] of [['👨\u{200D}👩', 'U+200D'], ['✔\u{FE0F}', 'U+FE0F'], ['✔\u{FE0E}', 'U+FE0E'], ['a\u{FE00}', 'U+FE00'],
    ['a\u{E0100}', 'U+E0100'], ['🇨🇳', 'U+1F1E8'], ['👍🏽', 'U+1F3FD'], ['a\u0007b', 'U+0007'], ['a\u{200F}b', 'U+200F'],
    ['a\nb', 'U+000A'], ['a­b', 'U+00AD'], ['a⁡b', 'U+2061']] as const) assert.equal(unsupported(s), cp, cps(s))
  for (const s of ['plain', '中文', 'é', 'a​b']) assert.equal(unsupported(s), null, s)
})

test('A4.width-table: of two offenders, the first is named', () => {
  for (const [s, cp] of [['🇨🇳', 'U+1F1E8'], ['a‍\u0007b', 'U+200D'], ['a\u0007‍b', 'U+0007']] as const) assert.equal(unsupported(s), cp, cps(s))
})

test('A4.width-table: variation selectors U+FE00-FE0F and U+E0100-E01EF are unsupported', () => {
  for (const [cp, want] of [[0xFE00, 'U+FE00'], [0xFE0F, 'U+FE0F'], [0xE0100, 'U+E0100'], [0xE01EF, 'U+E01EF'],
    [0xFDFF, null], [0xFE10, null], [0xE01F0, null]] as const) assert.equal(alone(cp), want, hex(cp))
})

test('A4.width-table: regional indicators U+1F1E6-1F1FF are unsupported', () => {
  for (const [cp, want] of [[0x1F1E6, 'U+1F1E6'], [0x1F1FF, 'U+1F1FF'], [0x1F1E5, null], [0x1F200, null]] as const) assert.equal(alone(cp), want, hex(cp))
})

test('A4.width-table: emoji modifiers U+1F3FB-1F3FF are unsupported', () => {
  for (const [cp, want] of [[0x1F3FB, 'U+1F3FB'], [0x1F3FF, 'U+1F3FF'], [0x1F3FA, null], [0x1F400, null]] as const) assert.equal(alone(cp), want, hex(cp))
})

test('A4.width-table: plain pictographic emoji are wide, not unsupported', () => {
  for (const s of ['🚀', '😀', '⌚']) { assert.equal(unsupported(s), null, cps(s)); assert.equal(width(s), 2, cps(s)) }
})

test('A4.width-table: U+200B, U+200C, U+2060 and U+FEFF are allowed', () => {
  for (const s of ['​', '‌', '⁠', '﻿', 'a​b', 'a‌b', 'a⁠b', 'a﻿b']) assert.equal(unsupported(s), null, cps(s))
})

test('X3.emphasis: an emphasis marker takes no column', async () => {
  const { emphasize } = await import('../../core/emphasis.ts')
  assert.equal(width(emphasize('**中文** _ab_')!), 7)
})
