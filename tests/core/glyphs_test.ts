import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs'
import { GLYPHS, boxGlyph, isAllowed, junction } from '../../core/glyphs.ts'; import { BOX } from '../../core/box-table.ts'
const MATRIX = readFileSync('docs/specs/2026-10-27-mermaid-tty-v1-diagram-matrix.md', 'utf8')
const inBox = (g: string) => g.codePointAt(0)! >= 0x2500 && g.codePointAt(0)! <= 0x257f
test('A8.platforms: GLYPHS is rule 12: ASCII, Box Drawing, section-named glyphs; no non-ASCII Emoji', () => {
  for (const g of GLYPHS) if (g > '~' && !inBox(g)) assert.ok(MATRIX.includes(g), `not named: ${g}`)
  for (const g of GLYPHS) if (g > '~') assert.ok(!/\p{Emoji}/u.test(g), `emoji: ${g}`)
  assert.ok(GLYPHS.has('►') && GLYPHS.has('╂') && !GLYPHS.has('▶'))
  assert.ok(isAllowed('►') && isAllowed('╂') && !isAllowed('▶'))
})
test('A8.platforms: box glyphs by arm weight (up right down left; 0 none, 1 light, 2 heavy)', () => {
  assert.equal(Object.keys(BOX).length, 80)
  for (const [arms, g] of [['1010', '│'], ['1111', '┼'], ['0110', '┌'], ['0220', '┏'], ['0120', '┎'], ['2121', '╂'], ['1212', '┿'],
    ['2120', '┠'], ['1210', '┝'], ['0222', '┳'], ['2222', '╋']] as const) assert.equal(boxGlyph(arms), g, arms)
  assert.equal(junction(10, 'dotted'), '┄'); assert.equal(junction(5, 'dotted'), '┆'); assert.equal(junction(6, 'dotted'), '┌')
  assert.equal(junction(6, 'heavy'), '┏'); assert.equal(junction(14, 'heavy'), '┳')
})
