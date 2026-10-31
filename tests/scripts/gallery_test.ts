import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rowsToSvg, glyphXs } from '../../scripts/render-svg.ts'
import { gallery } from '../../scripts/render-gallery.ts'
test('VR.gallery: each glyph sits at col × cell width; a W/F char takes two cells', () =>
  assert.deepEqual(
    glyphXs(rowsToSvg([[{ text: '中a' }], [{ text: '─►', color: '#88C0D0' }]], { cellW: 10, cellH: 20 })),
    [
      ['中', 0],
      ['a', 20],
      ['─', 0],
      ['►', 10],
    ],
  ))
test('VR.gallery: every golden at 80 and 60, the CJK sheet, the palette sheet and an index', () => {
  const out = mkdtempSync(join(tmpdir(), 'mtty-gal-'))
  try {
    assert.deepEqual(gallery(out).problems, [])
    const files = readdirSync(out)
    for (const id of ['flowchart-ok-01', 'sequence-ok-38']) {
      for (const w of [80, 60]) {
        assert.ok(files.includes(`${id}@${w}.svg`), `${id}@${w}`)
      }
    }
    for (const f of ['cjk.svg', 'palettes.svg', 'index.html']) {
      assert.ok(files.includes(f), f)
    }
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
})
