import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { explain, renderMermaid, toRows } from '../../core/render.ts'
import { palette } from '../../core/themes.ts'
import { validate } from '../../core/validate.ts'
import { width } from '../../core/width.ts'
import { isFail } from '../../core/fail.ts'
import { readSource } from '../../core/source.ts'
import { lookup } from '../../core/registry.ts'
import { createCanvas } from '../../core/canvas.ts'
import type { Drawing } from '../../core/canvas.ts'

// Each row of d as toRows emits it, as plain text.
const plain = (d: Drawing) => toRows(d, palette('default')).map((r) => r.map((s) => s.text).join(''))
// A one-row drawing of a title, as draw.ts writes one, on a grid 3 cells wide, at the given columns.
function titleRow(text: string, columns: number): Drawing {
  const c = createCanvas(1, 3, columns)
  c.text(0, 0, text, 'title', 'title')
  return c.toDrawing({ labels: [{ owner: 'title', text }], edges: [], edgeLabels: [], frames: [] })
}
// A title of x then pad spaces, kept by its quotes and drawn, so the title row is pad + 1 wide.
const TITLED = (pad: number) => `---\ntitle: "x${' '.repeat(pad)}"\n---\nflowchart TD\nA`

test("A5.mutation-tests: a drawn trailing space counts toward a row's width; a trailing empty cell does not", () => {
  assert.equal(validate(titleRow('ab ', 2))?.reason, 'row-too-wide')
  assert.equal(validate(titleRow('ab', 2)), null)
  assert.deepEqual(plain(titleRow('ab ', 3)), ['ab '])
})

// The ok fixtures, and test sources that each draw at some width: every drawing each ladder step makes at each width.
const FIXTURES = readdirSync(new URL('../../fixtures', import.meta.url), { recursive: true, encoding: 'utf8' })
  .filter((f) => /-ok-\d+\.mmd$/.test(f))
  .map((f) => readFileSync(new URL(`../../fixtures/${f}`, import.meta.url), 'utf8'))
const SOURCES = [
  ...FIXTURES,
  TITLED(80),
  TITLED(30),
  'flowchart TD\nA[读取配置文件] --> B{完成?}',
  'flowchart LR\nA[alpha one] --> B[beta two] --> C[gamma three] --> D[delta four]',
  'flowchart TD\nA[the quick brown fox jumps over the lazy dog] --> B[ok]\nA --> C[fine]',
  'flowchart RL\nA[the quick brown fox jumps over the lazy dog] --> B[ok]',
  'flowchart TD\nA[alpha] --> B[beta]\nA --> C[gamma]\nB -->|yes| D([done])',
]
const WIDTHS = [10, 16, 20, 24, 30, 31, 40, 60, 80, 81, 100, 120]
// The module and model s parses to; a source that does not parse throws, so none drops out unseen.
function parsed(s: string) {
  const src = readSource(s)
  if (isFail(src)) {
    throw new Error(src.reason)
  }

  const mod = lookup(src.header)
  if (isFail(mod)) {
    throw new Error(mod.reason)
  }

  const model = mod.parse(src)
  if (isFail(model)) {
    throw new Error(model.reason)
  }

  return { mod, model }
}

test('A5.mutation-tests: no row of a drawing validate accepts is wider than its columns, as toRows emits it', () => {
  assert.ok(FIXTURES.length > 0)
  for (const s of SOURCES) {
    const { mod, model } = parsed(s)
    const name = JSON.stringify(s.slice(0, 32))
    let validated = 0
    for (const columns of WIDTHS) {
      for (const step of mod.steps(model)) {
        const d = mod.layout(model, step, columns)
        if (isFail(d) || validate(d) !== null) {
          continue
        }

        validated++
        for (const row of plain(d)) {
          assert.ok(width(row) <= d.columns, `${name} ${step} at ${d.columns}: ${width(row)} wide`)
        }
      }
    }

    assert.ok(validated > 0, `${name} never validates`)
  }
})
test('A5.errors: a title padded with drawn spaces to 81 columns falls back at 80, and draws 81 wide at 81', () => {
  assert.deepEqual(explain(TITLED(80), { columns: 80 }), { reason: 'row-too-wide' })
  assert.equal(renderMermaid(TITLED(80), { columns: 80 }), null)
  const rows = renderMermaid(TITLED(80), { columns: 81 })!.map((r) => r.map((s) => s.text).join(''))
  assert.equal(Math.max(...rows.map((r) => width(r))), 81)
})
