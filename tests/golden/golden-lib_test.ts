// tests/golden/golden-lib_test.ts — the golden format, the golden glyph scan and widest, on hand-built canvases and files.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCanvas } from '../../core/canvas.ts'
import { GLYPHS } from '../../core/glyphs.ts'
import type { Ink } from '../../core/themes.ts'
import type { Expect } from '../../core/validate.ts'
import { width } from '../../core/width.ts'
import { goldenGlyphs, goldenOf, widest } from './golden-lib.ts'

const EXPECT = {} as Expect   // goldenOf and widest read only the cells

test('goldenOf writes each width as text rows then role rows, cont as ~, right-trimmed, ending in one LF', () => {
  const c = createCanvas(2, 3, 80)
  c.text(0, 0, '中', 'node', 'A')         // a wide character and its cont cell
  c.line(0, 2, 10, 'light', 's2', 'e1')   // ─ in series ink 2
  c.arrow(1, 1, '►', 'e1')                // an empty cell on each side
  const d = c.toDrawing(EXPECT)
  assert.equal(goldenOf([[60, d], [80, d]]), '@60\n中─\n ►\n@60 roles\nN~2\n a\n@80\n中─\n ►\n@80 roles\nN~2\n a\n')
})

test('goldenOf codes every ink, uppercase on a text cell and lowercase on a drawn one', () => {
  const inks: Ink[] = ['node', 'decision', 'edge', 'arrow', 'label', 'frame', 'note', 'title', 'value', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']
  const c = createCanvas(2, inks.length, 80)
  inks.forEach((ink, i) => { c.text(0, i, 'x', ink, 'T'); c.cap(1, i, '|', ink, 'C') })
  assert.equal(goldenOf([[60, c.toDrawing(EXPECT)]]), `@60\n${'x'.repeat(17)}\n${'|'.repeat(17)}\n@60 roles\nNDEALFOTV12345678\nndealfotv12345678\n`)
})

test('goldenGlyphs flags drawn and series glyphs that are not allow-listed, by file and line, and skips source text', () => {
  const dir = mkdtempSync(join(tmpdir(), 'golden-lib-'))
  try {
    mkdirSync(join(dir, 'sub'))
    // Line 2: 中 takes two columns, so é sits on n (flagged), ü on L (source text), ─ on e (allowed) and ß on 3 (flagged).
    writeFileSync(join(dir, 'sub', 'x.golden'), '@60\n中éü─ß\n─\n@60 roles\nN~nLe3\ne\n@80\né\n@80 roles\no\n')
    writeFileSync(join(dir, 'a.golden'), '@60\n┌é┐\n@60 roles\nnNn\n')
    writeFileSync(join(dir, 'notes.txt'), '@60\né\n@60 roles\nn\n')   // not a golden
    const x = join(dir, 'sub', 'x.golden')
    assert.deepEqual(goldenGlyphs(dir), [`${x}:2 é`, `${x}:2 ß`, `${x}:8 é`])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('widest is the widest right-trimmed row in display columns', () => {
  const c = createCanvas(2, 8, 80)
  c.text(0, 0, 'abc', 'node', 'A')
  c.fill(0, 3, 4, 'node', 'A')       // a trailing fill and an empty cell are blank: row 0 is 3 wide
  c.text(1, 0, '中中', 'node', 'B')   // two characters, four columns
  assert.equal(widest(c.toDrawing(EXPECT)), 4)
})

// goldenGlyphs on one golden holding a single text row and its role row: each flag as 'line ch'.
function scanRow(text: string, roles: string): string[] {
  const dir = mkdtempSync(join(tmpdir(), 'golden-lib-')), p = join(dir, 'x.golden')
  try {
    writeFileSync(p, `@60\n${text}\n@60 roles\n${roles}\n`)
    return goldenGlyphs(dir).map(s => s.slice(p.length + 1))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const ACUTE = '́', ZWSP = '​'   // a combining mark and a zero-width space: both take no column

test('goldenGlyphs flags a zero-width code point whose own cell is drawn, even after source text', () => {
  assert.deepEqual(scanRow(`A${ACUTE}`, 'Ln'), [`2 ${ACUTE}`])      // the repro: source text, then a drawn U+0301
  assert.deepEqual(scanRow(`中${ACUTE}`, 'N~n'), [`2 ${ACUTE}`])    // its own cell comes after 中's cont cell
  assert.deepEqual(scanRow(`A${ZWSP}─`, 'Lee'), [`2 ${ZWSP}`])
})

test('goldenGlyphs flags a zero-width code point joined to a drawn cell or to none', () => {
  assert.deepEqual(scanRow(`─${ACUTE}A`, 'eL'), [`2 ${ACUTE}`])     // part of ─, or a cell before A: drawn either way
  assert.deepEqual(scanRow(`${ACUTE}A`, 'L'), [`2 ${ACUTE}`])       // no cell before it to join
})

test('goldenGlyphs skips a zero-width code point inside source text, CJK cont cells included', () => {
  assert.deepEqual(scanRow(`[ e${ACUTE}x ]`, 'nnNNnn'), [])          // mid-label
  assert.deepEqual(scanRow(`e${ACUTE}`, 'N'), [])                     // at the row's end, so no cell of its own
  assert.deepEqual(scanRow(`中${ACUTE}x`, 'N~N'), [])                 // after a wide character and its cont cell
  assert.deepEqual(scanRow(`A${ZWSP}B`, 'NN'), [])
})

test('no allow-listed glyph is zero-width or a combining mark, so a drawn glyph always takes its own column', () => {
  for (const g of GLYPHS) assert.ok(width(g) === 1 && !/\p{M}/u.test(g), `U+${g.codePointAt(0)!.toString(16)}`)
})
