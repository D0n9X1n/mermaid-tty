import test from 'node:test'
import assert from 'node:assert/strict'
import { width, unsupported, isWide } from '../../core/width.ts'

// 'e\u0301' is e + a combining acute; '\u200B' is a zero-width space.
test('A4.width-table: widths', () => {
  for (const [s, w] of [['a', 1], ['中', 2], ['ア', 2], ['한', 2], ['─', 1], ['│', 1], ['┌', 1], ['◇', 1], ['▶', 1],
    ['e\u0301', 1], ['\u200B', 0], ['读取配置文件', 12]] as const) assert.equal(width(s), w, JSON.stringify(s))
  assert.equal(isWide(0x1F680), true)
})

test('A4.width-table: unsupported text falls back', () => {
  for (const s of ['👨\u{200D}👩', '✔\u{FE0F}', '✔\u{FE0E}', 'a\u{FE00}', 'a\u{E0100}', '🇨🇳', '👍🏽', 'a\u0007b', 'a\u{200F}b']) assert.notEqual(unsupported(s), null, s)
  for (const s of ['plain', '中文', 'e\u0301', 'a\u200Bb']) assert.equal(unsupported(s), null, s)
})
