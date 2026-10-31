import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isFail } from '../../core/fail.ts'
import { explain, toRows } from '../../core/render.ts'
import { palette } from '../../core/themes.ts'
import { width } from '../../core/width.ts'

const EXPLAIN = fileURLToPath(new URL('../../scripts/explain.ts', import.meta.url))
const LR = 'flowchart LR\nA[alpha one] --> B[beta two] --> C[gamma three] --> D[delta four]\n'

// scripts/explain.ts run on a temp file holding src, with COLS = cols; the file is removed after the test.
function run(t: { after(fn: () => void): void }, src: string, cols: string) {
  const dir = mkdtempSync(join(tmpdir(), 'mtty-'))
  const file = join(dir, 'diagram.mmd')
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  writeFileSync(file, src)
  return spawnSync(process.execPath, [EXPLAIN, file, cols], { encoding: 'utf8' })
}

test("explain: prints the step taken, the widest row's width and the rows, and exits 0", (t) => {
  const r = run(t, LR, '40')
  const d = explain(LR, { columns: 40 })
  if (isFail(d)) {
    throw new Error(d.reason)
  }

  const rows = toRows(d.drawing, palette('default')).map((row) => row.map((s) => s.text).join(''))
  assert.equal(r.status, 0, r.stderr)
  assert.equal(
    r.stdout,
    ['step: lrToTd', `width: ${Math.max(...rows.map((row) => width(row)))}`, ...rows].join('\n') + '\n',
  )
})
test('explain: prints the reason a source falls back, and exits 1', (t) => {
  const r = run(t, LR, '8')
  const d = explain(LR, { columns: 8 })
  assert.ok(isFail(d))
  assert.equal(r.status, 1)
  assert.equal(r.stdout, `reason: ${d.reason}\n`)
})
test('explain: without a file and a whole column count it prints its usage and exits 2', () => {
  const r = spawnSync(process.execPath, [EXPLAIN, 'x.mmd', 'wide'], { encoding: 'utf8' })
  assert.equal(r.status, 2)
  assert.match(r.stderr, /usage: node scripts\/explain\.ts FILE COLS/)
})
