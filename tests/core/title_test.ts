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

test('a node, subgraph or edge named title is not the diagram title: only the title role moves', () => {
  for (const src of [
    'flowchart TD\ntitle["X"] --> A\nA --> N0 & N1',
    'flowchart TD\nsubgraph title [Group]\nA --> B\nend\nB --> C & D',
    'flowchart LR\nA -- title --> B',
  ]) {
    const d = explain(src, { columns: 80, theme: 'mono' })
    assert.ok('drawing' in d, `${src}: ${(d as { reason?: string }).reason}`)
  }
})

// A synthetic drawing: two title rows of different widths over a five-cell body, and a title row shared with a node.
function sheet(rows: (string | null)[][]): Drawing {
  const cell = (s: string | null) => {
    if (s === null) {
      return null
    }

    const [ch, owner, role] = s.split(':') as [string, string, string]
    return { ch, kind: 'text', owners: [owner], role } as unknown as Drawing['cells'][number][number]
  }

  return {
    columns: 20,
    cells: rows.map((r) => r.map(cell)),
    conflicts: [],
    expect: { labels: [], edges: [], edgeLabels: [], frames: [] },
  } as unknown as Drawing
}

test('each title row centers on its own width; a row the title shares with another cell stays put', () => {
  const t = (ch: string) => `${ch}:title:title`
  const n = (ch: string) => `${ch}:A:node`
  const wrapped = centerTitle(
    sheet([[t('L'), t('o'), t('n'), t('g')], [t('X')], [n('a'), n('b'), n('c'), n('d'), n('e'), n('f'), n('g')]]),
  )
  const first = (r: number) => wrapped.cells[r]!.findIndex((x) => x !== null)
  assert.deepEqual([first(0), first(1)], [1, 3], 'a 4-wide row and a 1-wide row over 7 cells')
  const shared = sheet([
    [t('T'), null, n('a')],
    [n('b'), n('c'), n('d'), n('e'), n('f'), n('g'), n('h')],
  ])
  assert.equal(centerTitle(shared), shared)
})
