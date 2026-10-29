// tests/golden/golden-lib_test.ts — the golden format, the golden glyph scan and widest, on hand-built canvases and files.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCanvas } from '../../core/canvas.ts'
import type { Ink } from '../../core/themes.ts'
import type { Expect } from '../../core/validate.ts'
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
