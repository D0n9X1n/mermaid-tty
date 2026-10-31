// tests/golden/golden-lib_test.ts — the golden format, the golden glyph scan and widest, on hand-built canvases and files.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCanvas } from '../../core/canvas.ts'
import { isFail } from '../../core/fail.ts'
import { GLYPHS } from '../../core/glyphs.ts'
import { explain } from '../../core/render.ts'
import type { Ink } from '../../core/themes.ts'
import type { Expect } from '../../core/validate.ts'
import { width } from '../../core/width.ts'
import { drawnGlyphs, goldenGlyphs, goldenOf, widest } from './golden-lib.ts'

const EXPECT = {} as Expect // goldenOf and widest read only the cells

test('goldenOf writes each width as text rows then role rows, cont as ~, right-trimmed, ending in one LF', () => {
  const c = createCanvas(2, 3, 80)
  c.text(0, 0, '中', 'node', 'A') // a wide character and its cont cell
  c.line(0, 2, 10, 'light', 's2', 'e1') // ─ in series ink 2
  c.arrow(1, 1, '►', 'e1') // an empty cell on each side
  const d = c.toDrawing(EXPECT)
  assert.equal(
    goldenOf([
      [60, d],
      [80, d],
    ]),
    '@60\n中─\n ►\n@60 roles\nN~2\n a\n@80\n中─\n ►\n@80 roles\nN~2\n a\n',
  )
})

// Plan C T48: series source text codes as !@#$%^&*, so the glyph scan never reads it as a drawn series glyph 1–8.
test('goldenOf codes every ink, uppercase on a text cell (series text !@#$%^&*) and lowercase on a drawn one', () => {
  const inks: Ink[] = [
    'node',
    'decision',
    'edge',
    'arrow',
    'label',
    'frame',
    'note',
    'title',
    'value',
    's1',
    's2',
    's3',
    's4',
    's5',
    's6',
    's7',
    's8',
  ]
  const c = createCanvas(2, inks.length, 80)
  inks.forEach((ink, i) => {
    c.text(0, i, 'x', ink, 'T')
    c.cap(1, i, '|', ink, 'C')
  })
  assert.equal(
    goldenOf([[60, c.toDrawing(EXPECT)]]),
    `@60\n${'x'.repeat(17)}\n${'|'.repeat(17)}\n@60 roles\nNDEALFOTV!@#$%^&*\nndealfotv12345678\n`,
  )
})

test('goldenGlyphs flags drawn and series glyphs that are not allow-listed, by file and line, and skips source text', () => {
  const dir = mkdtempSync(join(tmpdir(), 'golden-lib-'))
  try {
    mkdirSync(join(dir, 'sub'))
    // Line 2: 中 takes two columns, so é sits on n (flagged), ü on L (source text), ─ on e (allowed) and ß on 3 (flagged).
    writeFileSync(join(dir, 'sub', 'x.golden'), '@60\n中éü─ß\n─\n@60 roles\nN~nLe3\ne\n@80\né\n@80 roles\no\n')
    writeFileSync(join(dir, 'a.golden'), '@60\n┌é┐\n@60 roles\nnNn\n')
    writeFileSync(join(dir, 'notes.txt'), '@60\né\n@60 roles\nn\n') // not a golden
    const x = join(dir, 'sub', 'x.golden')
    assert.deepEqual(goldenGlyphs(dir), [`${x}:2 é`, `${x}:2 ß`, `${x}:8 é`])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('widest is the widest right-trimmed row in display columns', () => {
  const c = createCanvas(2, 8, 80)
  c.text(0, 0, 'abc', 'node', 'A')
  c.fill(0, 3, 4, 'node', 'A') // a trailing fill and an empty cell are blank: row 0 is 3 wide
  c.text(1, 0, '中中', 'node', 'B') // two characters, four columns
  assert.equal(widest(c.toDrawing(EXPECT)), 4)
})

// goldenGlyphs on one golden with the given content: each flag as 'line ch'.
function scanGolden(content: string): string[] {
  const dir = mkdtempSync(join(tmpdir(), 'golden-lib-'))
  const p = join(dir, 'x.golden')
  try {
    writeFileSync(p, content)
    return goldenGlyphs(dir).map((s) => s.slice(p.length + 1))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
// goldenGlyphs on one golden holding a single text row and its role row.
const scanRow = (text: string, roles: string): string[] => scanGolden(`@60\n${text}\n@60 roles\n${roles}\n`)

const ACUTE = String.fromCodePoint(0x301)
const ZWSP = String.fromCodePoint(0x200b) // a combining mark and a zero-width space: both take no column

test('goldenGlyphs flags a zero-width code point joined to a drawn cell, an empty one or none', () => {
  assert.deepEqual(scanRow(`─${ACUTE}A`, 'eL'), [`2 ${ACUTE}`]) // ─ plus U+0301 is no allow-listed glyph
  assert.deepEqual(scanRow(`中─${ACUTE}`, 'N~e'), [`2 ${ACUTE}`]) // on the ─ after 中's cont cell
  assert.deepEqual(scanRow(` ${ACUTE}A`, ' L'), [`2 ${ACUTE}`]) // an empty cell takes no mark
  assert.deepEqual(scanRow(`${ACUTE}A`, 'L'), [`2 ${ACUTE}`]) // no cell before it to join
})

test('goldenGlyphs skips a zero-width code point that joins source text, CJK cont cells included', () => {
  // canvas.text() joins it to the cell before it, so it is part of that cell even when a drawn cell follows. A drawn cell
  // whose whole ch is zero-width reads the same in a golden; drawnGlyphs catches that one on the drawing.
  assert.deepEqual(scanRow(`[ cafe${ACUTE} ]`, 'nnNNNNnn'), []) // a label's last character, then drawn padding
  assert.deepEqual(scanRow(`[ e${ACUTE}x ]`, 'nnNNnn'), []) // mid-label
  assert.deepEqual(scanRow(`中x${ACUTE}─`, 'N~Ne'), []) // after 中's cont cell, then a drawn cell
  assert.deepEqual(scanRow(`A${ZWSP}─`, 'Le'), [])
})

test('goldenGlyphs passes the golden of a label that ends in a combining mark, as in café', () => {
  const r = explain(`flowchart LR\nA[cafe${ACUTE}] --> B[end]`, { columns: 80, theme: 'mono' })
  if (isFail(r)) {
    return assert.fail(r.reason)
  }
  const g = goldenOf([[80, r.drawing]])
  assert.ok(g.includes(`[ cafe${ACUTE} ]`), g) // the mark joins the e cell; drawn padding follows
  assert.deepEqual(scanGolden(g), [])
  assert.deepEqual(drawnGlyphs(r.drawing), []) // and no drawn cell of its drawing is flagged
})

test('drawnGlyphs names each drawn cell that is not one allow-listed glyph, by row and col, and skips source text', () => {
  const c = createCanvas(2, 5, 80)
  c.text(0, 0, 'A', 'node', 'A')
  c.cap(0, 1, ACUTE, 'node', 'A') // the old repro: source A, then a drawn cell whose whole ch is U+0301
  c.line(0, 2, 10, 'light', 'edge', 'e1') // ─, allow-listed
  c.cap(0, 3, ACUTE, 'edge', 'e1') // a drawn ─, then U+0301 in a cell of its own
  c.fill(0, 4, 1, 'node', 'A') // a blank fill, allow-listed
  c.arrow(1, 0, `─${ACUTE}`, 'e2') // a drawn ─ with U+0301 joined to it
  c.text(1, 1, `e${ACUTE}中`, 'node', 'B') // source text with a mark, then a wide character and its cont cell: skipped
  assert.deepEqual(drawnGlyphs(c.toDrawing(EXPECT)), [
    'row 0 col 1 U+0301',
    'row 0 col 3 U+0301',
    'row 1 col 0 U+2500 U+0301',
  ])
})

test('no allow-listed glyph is zero-width or a combining mark, so a drawn glyph always takes its own column', () => {
  for (const g of GLYPHS) {
    assert.ok(width(g) === 1 && !/\p{M}/u.test(g), `U+${g.codePointAt(0)!.toString(16)}`)
  }
})

// X3. A drawing with emphasis adds a styles section after its roles: one row per canvas row, a text cell's em as b (bold),
// i (italic) or x (both), any other cell a space, right-trimmed. A drawing without emphasis has none, so its golden is as before.
test('X3.emphasis: goldenOf adds an @w styles section only when a cell has emphasis, and goldenGlyphs skips it', async () => {
  const { emphasize } = await import('../../core/emphasis.ts')
  const c = createCanvas(2, 6, 80)
  c.text(0, 0, emphasize('**中**a _b_')!, 'node', 'A')
  c.text(1, 0, emphasize('***x***')!, 'label', 'B')
  const plain = createCanvas(1, 2, 80)
  plain.text(0, 0, 'ab', 'node', 'A')
  const g = goldenOf([
    [60, c.toDrawing(EXPECT)],
    [80, plain.toDrawing(EXPECT)],
  ])
  assert.equal(g, '@60\n中a b\nx\n@60 roles\nN~NNN\nL\n@60 styles\nb   i\nx\n@80\nab\n@80 roles\nNN\n')
  const dir = mkdtempSync(join(tmpdir(), 'golden-lib-'))
  try {
    writeFileSync(join(dir, 'x.golden'), g)
    assert.deepEqual(goldenGlyphs(dir), [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
