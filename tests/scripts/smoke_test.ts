import test from 'node:test'; import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderMermaid } from '../../core/render.ts'
import { main } from '../../scripts/smoke.ts'

const SMOKE = fileURLToPath(new URL('../../scripts/smoke.ts', import.meta.url))
const FIXTURE = new URL('../../fixtures/flowchart/flowchart-ok-01.mmd', import.meta.url)
const plain = (rows: readonly { text: string }[][]) => rows.map(r => r.map(s => s.text).join('')).join('\n') + '\n'

test('smoke: prints the flowchart-ok-01 fixture drawn at 80 columns under nord, as plain text, and exits 0', () => {
  const r = spawnSync(process.execPath, [SMOKE], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout, plain(renderMermaid(readFileSync(FIXTURE, 'utf8'), { columns: 80, theme: 'nord' })!))
  for (const label of ['Start', 'Next', 'End']) { assert.ok(r.stdout.includes(label), label) }
})
test('smoke: a source that falls back prints no rows, says so on stderr, and exits 1', (t) => {
  const log = t.mock.method(console, 'log', () => {})
const  err = t.mock.method(console, 'error', () => {})
  assert.equal(main('flowchart TD\nA[open --> B'), 1)
  assert.equal(log.mock.callCount(), 0)
  assert.equal(err.mock.callCount(), 1)
})
