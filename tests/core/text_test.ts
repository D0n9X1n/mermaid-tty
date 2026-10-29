import test from 'node:test'; import assert from 'node:assert/strict'; import { labelLines, wrap } from '../../core/text.ts'
test('A3: <br> variants split label lines', () => assert.deepEqual(labelLines('a<br>b<br/>c<br />d'), ['a', 'b', 'c', 'd']))
test('A4.fit-ladder: wrap at spaces and between W/F chars; a word wider than max fails', () => {
  assert.deepEqual(wrap('alpha beta gamma', 10), [{ text: 'alpha beta', join: '' }, { text: 'gamma', join: ' ' }])
  assert.deepEqual(wrap('读取配置文件', 8), [{ text: '读取配置', join: '' }, { text: '文件', join: '' }])
  assert.equal(wrap('supercalifragilistic', 8), null)
})

test('A3: <br> matches in any case and with any spaces before the slash; a label without one is one line', () => {
  assert.deepEqual(labelLines('a<BR>b<Br />c<bR/>d<br  />e'), ['a', 'b', 'c', 'd', 'e'])
  assert.deepEqual(labelLines('plain'), ['plain'])
})

test('A3: two breaks in a row, or a break at the end, keep a blank line', () => {
  assert.deepEqual(labelLines('a<br><br>b'), ['a', '', 'b'])
  assert.deepEqual(labelLines('a<br>'), ['a', ''])
})

test('A4.fit-ladder: a line exactly max wide is one piece; one column narrower splits it or fails', () => {
  assert.deepEqual(wrap('ab cd', 5), [{ text: 'ab cd', join: '' }])
  assert.deepEqual(wrap('ab cd', 4), [{ text: 'ab', join: '' }, { text: 'cd', join: ' ' }])
  assert.deepEqual(wrap('supercalifragilistic', 20), [{ text: 'supercalifragilistic', join: '' }])
  assert.equal(wrap('supercalifragilistic', 19), null)
})

test('A4.fit-ladder: a W/F character counts 2 columns', () => {
  assert.deepEqual(wrap('中文', 4), [{ text: '中文', join: '' }])
  assert.deepEqual(wrap('中文', 3), [{ text: '中', join: '' }, { text: '文', join: '' }])
  assert.equal(wrap('中', 1), null)
})

// U+20000 and U+20001 (CJK Extension B) are East Asian Width W and 2 code units each: the code point, not its high surrogate, is W.
test('A4.fit-ladder: an astral W/F character counts 2 columns and splits from a W/F neighbor, BMP or astral', () => {
  assert.deepEqual(wrap('\u{20000}\u{20001}', 2), [{ text: '\u{20000}', join: '' }, { text: '\u{20001}', join: '' }])
  assert.deepEqual(wrap('\u{20000}\u{20001}', 4), [{ text: '\u{20000}\u{20001}', join: '' }])
  assert.deepEqual(wrap('读\u{20000} \u{20001}取', 2), [{ text: '读', join: '' }, { text: '\u{20000}', join: '' }, { text: '\u{20001}', join: ' ' }, { text: '取', join: '' }])
})

// 读取a is the tokens 读 and 取a: no split falls between 取 and a, so the 3-column 取a cannot fit in 2.
test('A4.fit-ladder: a narrow character stays in the token of the W/F character next to it', () => {
  assert.deepEqual(wrap('读取a', 3), [{ text: '读', join: '' }, { text: '取a', join: '' }])
  assert.equal(wrap('读取a', 2), null)
  assert.equal(wrap('a读', 2), null)
})

// e + U+0301 COMBINING ACUTE ACCENT is 2 code units and 1 column.
test('A4.fit-ladder: a combining mark counts 0 columns', () => {
  assert.deepEqual(wrap('éé x', 2), [{ text: 'éé', join: '' }, { text: 'x', join: ' ' }])
  assert.deepEqual(wrap('éé x', 4), [{ text: 'éé x', join: '' }])
})

test('A4.fit-ladder: leading and trailing spaces drop, and a run of spaces is one space', () => {
  assert.deepEqual(wrap('  a   b  ', 3), [{ text: 'a b', join: '' }])
  assert.deepEqual(wrap('  a   b  ', 2), [{ text: 'a', join: '' }, { text: 'b', join: ' ' }])
})

// wrap never returns []: a blank label line still takes a row.
test('A3: a blank line, empty or only spaces, wraps to one empty piece', () => {
  assert.deepEqual(wrap('', 5), [{ text: '', join: '' }])
  assert.deepEqual(wrap('   ', 5), [{ text: '', join: '' }])
})

test('A4.fit-ladder: a piece split off between W/F characters joins with nothing, one split at a space with a space', () => {
  assert.deepEqual(wrap('读取 配置文件', 4), [{ text: '读取', join: '' }, { text: '配置', join: ' ' }, { text: '文件', join: '' }])
})
