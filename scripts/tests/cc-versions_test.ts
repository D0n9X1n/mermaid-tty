import test from 'node:test'
import assert from 'node:assert/strict'
import { tested, untested } from '../lib/cc-versions.ts'
const P = ['2.1.306', '2.1.307', '2.2.0-beta.1', '2.1.308', '2.1.309', '2.1.310']
test('untested stable versions after the newest tested one, oldest first; prereleases skipped; capped', () => {
  assert.deepEqual(untested(P, ['2.1.306', '2.1.308']), ['2.1.309', '2.1.310'])
  assert.deepEqual(untested(P, []), ['2.1.310'])
  assert.deepEqual(untested(P, ['2.1.306'], 2), ['2.1.307', '2.1.308'])
})
test('the tested versions are the leg-<version>-<os> artifacts, each once, pass or fail; other artifacts are not', () => {
  const names = 'leg-2.1.306-ubuntu-latest\nleg-2.1.306-macos-latest\nleg-2.1.308-windows-latest\ngallery\nleg-x-y\n'
  assert.deepEqual(tested(names), ['2.1.306', '2.1.308'])
  // A retry's legs are retry-<version>-<os>: they are not the record, so a retry never moves the selection.
  assert.deepEqual(tested('retry-2.1.0-ubuntu-latest\nleg-2.1.20-ubuntu-latest\n'), ['2.1.20'])
  assert.deepEqual(tested('retry-2.1.0-ubuntu-latest\n'), [])
  assert.deepEqual(tested(''), [])
})
test('a failing version is tested once and never stalls the rest; expired records move the start up', () => {
  const pub = Array.from({ length: 22 }, (_, i) => `2.1.${i}`)
  const run1 = untested(pub, ['2.1.0'])
  assert.deepEqual([run1.length, run1[0], run1.at(-1)], [20, '2.1.1', '2.1.20'])
  assert.deepEqual(untested(pub, ['2.1.0', ...run1]), ['2.1.21'])
  // The first runs' artifacts expired: what is left still ends at the newest record, so nothing is retested.
  assert.deepEqual(untested(pub, run1.slice(10)), ['2.1.21'])
  // A retry of an old version, its record long expired, adds an old artifact: the newest record still decides.
  assert.deepEqual(untested(pub, ['2.1.0', '2.1.19', '2.1.20']), ['2.1.21'])
  // And a retry's legs aren't the record at all: with the scheduled legs of 2.1.19 and 2.1.20 expired after a retry of
  // 2.1.0, only the latest is selected, never 2.1.1 to 2.1.20 again.
  assert.deepEqual(untested(pub, tested('retry-2.1.0-ubuntu-latest\nretry-2.1.0-macos-latest\n')), ['2.1.21'])
})
test('the CLI lists untested versions from artifact names, retries one, and refuses anything else', async () => {
  const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs')
  const { spawnSync } = await import('node:child_process')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const cli = fileURLToPath(new URL('../cc-versions.ts', import.meta.url))
  const dir = mkdtempSync(join(tmpdir(), 'mtty-cc-'))
  const run = (...a: string[]) => spawnSync(process.execPath, [cli, ...a], { encoding: 'utf8' })
  try {
    const pub = join(dir, 'p.json')
    const names = join(dir, 'names.txt')
    writeFileSync(pub, JSON.stringify(P))
    writeFileSync(names, 'leg-2.1.306-ubuntu-latest\nleg-2.1.306-windows-latest\n')
    assert.equal(run('list', pub, names).stdout.trim(), '["2.1.307","2.1.308","2.1.309","2.1.310"]')
    assert.equal(run('list', pub, names, '2.1.306').stdout.trim(), '["2.1.306"]')
    assert.equal(run('list', pub, join(dir, 'none.txt')).stdout.trim(), '["2.1.310"]')
    assert.equal(run('record').status, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
