// gen-corpus.ts writes the 100 synthetic blocks to fixtures/corpus under its working directory; --check writes nothing,
// and exits 1 when regenerating would change a file.
import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const SCRIPT = join(ROOT, 'scripts/gen-corpus.ts')
const NAMES = Array.from({ length: 100 }, (_, i) => `corpus-${String(i + 1).padStart(3, '0')}.mmd`)

// A fresh temp dir, removed after the test.
function tmp(t: TestContext): string {
  const d = mkdtempSync(join(tmpdir(), 'mermaid-tty-gen-'))
  t.after(() => rmSync(d, { recursive: true, force: true }))
  return d
}
// Runs the generator in cwd.
const run = (cwd: string, ...args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' })
// The files of fixtures/corpus under root, by name.
function corpus(root: string): Record<string, string> {
  const dir = join(root, 'fixtures/corpus')
  return Object.fromEntries(readdirSync(dir).sort().map(f => [f, readFileSync(join(dir, f), 'utf8')]))
}

test('A10: gen-corpus is byte-stable: two runs write the same 100 files, which are the committed corpus', t => {
  const a = tmp(t), b = tmp(t)
  assert.equal(run(a).status, 0); assert.equal(run(b).status, 0)
  assert.deepEqual(Object.keys(corpus(a)), NAMES)
  assert.deepEqual(corpus(a), corpus(b))
  assert.deepEqual(corpus(a), corpus(ROOT))
})

test('A10: gen-corpus --check exits 0 on a current corpus, and 1, naming the file and writing nothing, on a changed or missing one', t => {
  const d = tmp(t), f = join(d, 'fixtures/corpus/corpus-042.mmd')
  assert.equal(run(d).status, 0)
  assert.equal(run(d, '--check').status, 0)
  writeFileSync(f, 'flowchart TD\nA --> B\n')
  let r = run(d, '--check')
  assert.equal(r.status, 1); assert.match(r.stderr, /corpus-042\.mmd/)
  assert.equal(readFileSync(f, 'utf8'), 'flowchart TD\nA --> B\n')
  unlinkSync(f)
  r = run(d, '--check')
  assert.equal(r.status, 1); assert.match(r.stderr, /corpus-042\.mmd/); assert.equal(existsSync(f), false)
})

test('A10: gen-corpus prints its usage, exits 2 and writes nothing, given any argument but --check', t => {
  const d = tmp(t)
  for (const argv of [['--chek'], ['--check', 'x'], ['x']]) {
    const r = run(d, ...argv)
    assert.equal(r.status, 2, argv.join(' ')); assert.equal(r.stderr, 'usage: node scripts/gen-corpus.ts [--check]\n')
  }
  assert.equal(existsSync(join(d, 'fixtures')), false)
})
