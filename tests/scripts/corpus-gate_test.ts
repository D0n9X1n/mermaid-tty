// corpus-gate.ts: gate(dir) draws each block of dir at 80 and 120 columns; the CLI prints counts, and exits 1 on a failure.
import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gate } from '../../scripts/corpus-gate.ts'

const SCRIPT = fileURLToPath(new URL('../../scripts/corpus-gate.ts', import.meta.url))
const GOOD = 'flowchart TD\nA[Start] --> B[End]\n'
// flowchart-reject-01's source: a label left open, which falls back as syntax:2.
const BAD = 'flowchart TD\nA[open --> B\n'

// A fresh temp dir holding files, removed after the test.
function dir(t: TestContext, files: Record<string, string>): string {
  const d = mkdtempSync(join(tmpdir(), 'mermaid-tty-corpus-'))
  t.after(() => rmSync(d, { recursive: true, force: true }))
  for (const [name, text] of Object.entries(files)) writeFileSync(join(d, name), text)
  return d
}
const run = (...args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' })

test('A10: gate names a failing block <index>@<cols> <reason>, counting blocks from 1 in file-name order', t => {
  assert.deepEqual(gate(dir(t, { 'b.mmd': BAD, 'a.mmd': GOOD })), { total: 2, failed: ['2@80 syntax:2', '2@120 syntax:2'] })
})

test('A10: a .md file adds its closed mermaid fences in order; other fences, an unclosed one and other files add none', t => {
  const fence = (info: string, body: string) => ['```' + info, body.trimEnd(), '```'].join('\n')
  const md = ['# Notes', fence('mermaid', BAD), fence('js', 'x()'), fence('mermaid', GOOD), '```mermaid', BAD].join('\n')
  const d = dir(t, { 'a.mmd': GOOD, 'b.md': md, 'c.txt': BAD })
  assert.deepEqual(gate(d), { total: 3, failed: ['2@80 syntax:2', '2@120 syntax:2'] })
})

test('A10: the CLI prints the counts and each failure, never a block or a path, and exits 1', t => {
  const r = run(dir(t, { 'a.mmd': GOOD, 'b.mmd': BAD }))
  assert.equal(r.stdout, 'corpus-gate: 2 blocks, 2 failures at 80 and 120 columns\n  2@80 syntax:2\n  2@120 syntax:2\n')
  assert.equal(r.stderr, ''); assert.equal(r.status, 1)
})

test('A10: --private gates a second directory and prints only its counts; with no failure the CLI exits 0', t => {
  const pub = dir(t, { 'a.mmd': GOOD }), priv = dir(t, { 'x.mmd': BAD, 'y.mmd': GOOD })
  const r = run(pub, '--private', priv)
  assert.equal(r.stdout, 'corpus-gate: 1 block, 0 failures at 80 and 120 columns\n' +
    'corpus-gate --private: 2 blocks, 2 failures at 80 and 120 columns\n')
  assert.equal(r.stderr, ''); assert.equal(r.status, 1)
  assert.equal(run(pub).status, 0)
})

test('A10: the CLI prints its usage and exits 2 unless given DIR or DIR --private DIR2', () => {
  for (const argv of [[], ['d', '--private'], ['d', 'e', 'f'], ['d', '--private', 'e', 'f']]) {
    const r = run(...argv)
    assert.equal(r.status, 2, argv.join(' ')); assert.match(r.stderr, /^usage: node scripts\/corpus-gate\.ts DIR \[--private DIR2\]\n/)
  }
})
