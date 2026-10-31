import test from 'node:test'
import assert from 'node:assert/strict'
import { record, recorded, untested, verdict } from '../lib/cc-versions.ts'
const P = ['2.1.306', '2.1.307', '2.2.0-beta.1', '2.1.308', '2.1.309', '2.1.310']
test('unrecorded stable versions after the first recorded one, oldest first; prereleases skipped; capped', () => {
  assert.deepEqual(untested(P, ['2.1.306', '2.1.308']), ['2.1.307', '2.1.309', '2.1.310'])
  assert.deepEqual(untested(P, []), ['2.1.310'])
  assert.deepEqual(untested(P, ['2.1.306'], 2), ['2.1.307', '2.1.308'])
})
test('a failing version is recorded and never stalls later ones (tested 2.1.0; 2.1.0–2.1.21 published; 2.1.1 fails)', () => {
  const pub = Array.from({ length: 22 }, (_, i) => `2.1.${i}`)
  const ok = { 'ubuntu-latest': 'success', 'macos-latest': 'success', 'windows-latest': 'success' }
  let tested = '2.1.0 pass\n'
  const run1 = untested(pub, recorded(tested))
  assert.deepEqual([run1.length, run1[0], run1.at(-1)], [20, '2.1.1', '2.1.20'])
  tested = record(
    tested,
    Object.fromEntries(run1.map((v) => [v, verdict(v === '2.1.1' ? { ...ok, 'macos-latest': 'failure' } : ok)])),
  )
  assert.match(tested, /^2\.1\.1 fail$/m)
  assert.deepEqual(untested(pub, recorded(tested)), ['2.1.21'])
})
test('a missing leg fails the version; a retried result replaces its line', () => {
  assert.equal(verdict({ 'ubuntu-latest': 'success', 'macos-latest': 'success' }), 'fail')
  assert.equal(record('2.1.1 fail\n2.1.2 pass\n', { '2.1.1': 'pass' }), '2.1.2 pass\n2.1.1 pass\n')
})
test('the CLI lists untested versions, retries one, and records every selected version with a missing leg as fail', async () => {
  const { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } = await import('node:fs')
  const { spawnSync } = await import('node:child_process')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const cli = fileURLToPath(new URL('../cc-versions.ts', import.meta.url))
  const dir = mkdtempSync(join(tmpdir(), 'mtty-cc-'))
  const run = (...a: string[]) => spawnSync(process.execPath, [cli, ...a], { encoding: 'utf8' })
  try {
    const pub = join(dir, 'p.json')
    const tested = join(dir, 't.txt')
    const legs = join(dir, 'legs')
    writeFileSync(pub, JSON.stringify(P))
    writeFileSync(tested, '2.1.306 pass\n')
    assert.equal(run('list', pub, tested).stdout.trim(), '["2.1.307","2.1.308","2.1.309","2.1.310"]')
    assert.equal(run('list', pub, tested, '2.1.306').stdout.trim(), '["2.1.306"]')
    for (const os of ['ubuntu-latest', 'macos-latest', 'windows-latest']) {
      for (const v of ['2.1.307', '2.1.308']) {
        if (!(v === '2.1.308' && os === 'windows-latest')) {
          mkdirSync(join(legs, `leg-${v}-${os}`), { recursive: true })
          writeFileSync(join(legs, `leg-${v}-${os}`, 'leg.txt'), `${v} ${os} success\n`)
        }
      }
    }

    assert.equal(run('record', legs, tested, '["2.1.307","2.1.308","2.1.309"]').status, 0)
    assert.equal(readFileSync(tested, 'utf8'), '2.1.306 pass\n2.1.307 pass\n2.1.308 fail\n2.1.309 fail\n')
    assert.equal(run('bogus').status, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
