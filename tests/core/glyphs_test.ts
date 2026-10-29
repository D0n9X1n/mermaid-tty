import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs'
import { GLYPHS, boxGlyph, isAllowed, junction } from '../../core/glyphs.ts'; import { BOX } from '../../core/box-table.ts'
const MATRIX = readFileSync('docs/specs/2026-10-27-mermaid-tty-v1-diagram-matrix.md', 'utf8')
const inBox = (g: string) => g.codePointAt(0)! >= 0x2500 && g.codePointAt(0)! <= 0x257f
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => String.fromCodePoint(from + i))
// Rule 12: printable ASCII U+0020–U+007E (95), the whole Box Drawing block U+2500–U+257F (128), and the 39 glyphs sections name:
// A's 7, then C's 32 (bars, gantt, xychart, class, gitGraph, quadrant).
const RULE_12: ReadonlySet<string> = new Set([...range(0x20, 0x7e), ...range(0x2500, 0x257f), ...'►◄▲▼◇●◉',
  ...'▏▎▍▌▋▊▉█▁▂▃▄▅▆▇', ...'✓▸◆·', ...'■○△□', ...'▷◁▽«»', ...'⊗◎', ...'↑↓'])
test('A8.platforms: GLYPHS is rule 12: ASCII, Box Drawing, section-named glyphs; no non-ASCII Emoji', () => {
  assert.deepEqual(GLYPHS, RULE_12); assert.equal(GLYPHS.size, 262)
  for (const g of GLYPHS) if (g > '~' && !inBox(g)) assert.ok(MATRIX.includes(g), `not named: ${g}`)
  for (const g of GLYPHS) if (g > '~') assert.ok(!/\p{Emoji}/u.test(g), `emoji: ${g}`)
  assert.ok([...RULE_12].every(isAllowed))
  for (const g of ['\u0001', '\u007f', '▶', '◀', '中']) {   // a control, DEL, two Emoji triangles, CJK
    assert.ok(!GLYPHS.has(g) && !isAllowed(g), `allowed: U+${g.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`)
  }
})
// The 80 light/heavy Box Drawing glyphs by arms 'urdl' (0 none, 1 light, 2 heavy), in code point order.
// The block's dashed, double, arc and diagonal glyphs have no key.
const PINNED: Readonly<Record<string, string>> = {
  '0101': '─', '0202': '━', '1010': '│', '2020': '┃', '0110': '┌', '0210': '┍', '0120': '┎', '0220': '┏', // U+2500–2503, U+250C–250F
  '0011': '┐', '0012': '┑', '0021': '┒', '0022': '┓', '1100': '└', '1200': '┕', '2100': '┖', '2200': '┗', // U+2510–2517
  '1001': '┘', '1002': '┙', '2001': '┚', '2002': '┛', '1110': '├', '1210': '┝', '2110': '┞', '1120': '┟', // U+2518–251F
  '2120': '┠', '2210': '┡', '1220': '┢', '2220': '┣', '1011': '┤', '1012': '┥', '2011': '┦', '1021': '┧', // U+2520–2527
  '2021': '┨', '2012': '┩', '1022': '┪', '2022': '┫', '0111': '┬', '0112': '┭', '0211': '┮', '0212': '┯', // U+2528–252F
  '0121': '┰', '0122': '┱', '0221': '┲', '0222': '┳', '1101': '┴', '1102': '┵', '1201': '┶', '1202': '┷', // U+2530–2537
  '2101': '┸', '2102': '┹', '2201': '┺', '2202': '┻', '1111': '┼', '1112': '┽', '1211': '┾', '1212': '┿', // U+2538–253F
  '2111': '╀', '1121': '╁', '2121': '╂', '2112': '╃', '2211': '╄', '1122': '╅', '1221': '╆', '2212': '╇', // U+2540–2547
  '1222': '╈', '2122': '╉', '2221': '╊', '2222': '╋', '0001': '╴', '1000': '╵', '0100': '╶', '0010': '╷', // U+2548–254B, U+2574–2577
  '0002': '╸', '2000': '╹', '0200': '╺', '0020': '╻', '0201': '╼', '1020': '╽', '0102': '╾', '2010': '╿', // U+2578–257F
}
test('A8.platforms: box glyphs by arm weight (up right down left; 0 none, 1 light, 2 heavy)', () => {
  assert.equal(Object.keys(PINNED).length, 80); assert.deepEqual(BOX, PINNED); assert.ok(!Object.hasOwn(BOX, '0000'), 'BOX has 0000')
  for (const [arms, g] of Object.entries(PINNED)) assert.equal(boxGlyph(arms), g, arms)
})
// dirs bits 1 up, 2 right, 4 down, 8 left → arms 'urdl', each present arm at weight k.
const armsOf = (dirs: number, k: string) => [1, 2, 4, 8].map(b => (dirs & b ? k : '0')).join('')
test('A8.platforms: junction() for every dirs 1–15, light, heavy and dotted', () => {
  const wrong: string[] = []
  for (let dirs = 1; dirs <= 15; dirs++) {
    const light = PINNED[armsOf(dirs, '1')], heavy = PINNED[armsOf(dirs, '2')]
    const dotted = [1, 4, 5].includes(dirs) ? '┆' : [2, 8, 10].includes(dirs) ? '┄' : light   // no dashed corners: bend light
    for (const [w, want] of [['light', light], ['heavy', heavy], ['dotted', dotted]] as const) {
      const got = junction(dirs, w); if (got !== want) wrong.push(`junction(${dirs}, '${w}') = ${got}, want ${want}`)
    }
  }
  assert.deepEqual(wrong, [])
})
