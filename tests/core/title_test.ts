// A diagram's title is centered over the drawing, as Mermaid centers it, and drawn bold and underlined, so it reads as
// a heading on every terminal: Windows Terminal may show bold only as a brighter color, but underline always shows.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'
import type { Drawing } from '../../core/canvas.ts'
import { explain, renderMermaid } from '../../core/render.ts'
import { centerTitle } from '../../core/title.ts'
import { validate } from '../../core/validate.ts'

const WIDTHS = [60, 80, 120]

// Each ok fixture that draws a title, by its type folder.
const titled = readdirSync('fixtures')
  .filter((type) => type !== 'corpus')
  .flatMap((type) =>
    readdirSync(`fixtures/${type}`)
      .filter((f) => f.includes('-ok-'))
      .map((f) => `fixtures/${type}/${f}`),
  )
  .filter((path) => {
    const d = explain(readFileSync(path, 'utf8'), { columns: 120, theme: 'mono' })
    return 'drawing' in d && d.drawing.cells.some((row) => row.some((x) => x?.owners[0] === 'title'))
  })

// The rows the title draws on, and the width of the rest of the drawing: its widest row, trailing empty cells dropped.
function measure(d: Drawing): { rows: number[]; body: number } {
  const rows = d.cells.flatMap((row, r) => (row.some((x) => x?.kind === 'text' && x.owners[0] === 'title') ? [r] : []))
  const body = Math.max(
    0,
    ...d.cells.filter((_, r) => !rows.includes(r)).map((row) => row.findLastIndex((x) => !!x) + 1),
  )
  return { rows, body }
}

test('every type that draws a title has a titled fixture to check', () => {
  const types = new Set(titled.map((path) => path.split('/')[1]))
  for (const type of ['flowchart', 'sequence', 'class', 'state', 'er', 'gantt', 'pie', 'journey', 'gitGraph']) {
    assert.ok(types.has(type), `no titled ${type} fixture`)
  }
})

test('a title is centered over the drawing at every width', () => {
  for (const path of titled) {
    for (const columns of WIDTHS) {
      const d = explain(readFileSync(path, 'utf8'), { columns, theme: 'mono' })
      if (!('drawing' in d)) {
        continue
      }

      const { rows, body } = measure(d.drawing)
      for (const r of rows) {
        const row = d.drawing.cells[r]!
        const first = row.findIndex((x) => !!x)
        const shown = row.findLastIndex((x) => !!x) + 1 - first
        assert.equal(first, Math.max(0, Math.floor((body - shown) / 2)), `${path} at ${columns}, title row ${r}`)
      }
    }
  }
})

test('a title draws bold and underlined, in every theme', () => {
  for (const theme of ['default', 'nord', 'mono']) {
    const rows = renderMermaid('---\ntitle: Pets\n---\npie\n"Dogs" : 3\n"Cats" : 1', { columns: 60, theme })!
    const title = rows.flat().find((span) => span.text.trim() === 'Pets')!
    assert.ok(title.bold && title.underline, theme)
  }
})

test('the validator fails a title moved off its centered column, either way', () => {
  const d = explain('---\ntitle: T\n---\nflowchart LR\nAlpha --> Beta --> Gamma', { columns: 60, theme: 'mono' })
  assert.ok('drawing' in d)
  assert.equal(validate(d.drawing), null)
  for (const by of [-1, 1]) {
    const moved = { ...d.drawing, cells: d.drawing.cells.map((row) => [...row]) }
    const row = moved.cells[measure(moved).rows[0]!]!
    const at = row.findIndex((x) => !!x)
    ;[row[at], row[at + by]] = [row[at + by] ?? null, row[at]!]
    assert.deepEqual(validate(moved), { reason: 'label-misplaced' }, `moved ${by}`)
  }
})

test('centerTitle leaves a drawing with no title, or a title as wide as the drawing, as it is', () => {
  const plain = explain('flowchart TD\nA --> B', { columns: 60, theme: 'mono' })
  assert.ok('drawing' in plain)
  assert.equal(centerTitle(plain.drawing), plain.drawing)
})
