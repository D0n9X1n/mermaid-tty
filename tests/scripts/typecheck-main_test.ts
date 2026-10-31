// main(spawn), the entry point; and the real CLI, run in a subprocess that finds a fake npx first
// on its PATH. Neither needs npx or the network.
import test from 'node:test'
import type { TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { main } from '../../scripts/typecheck.ts'

const script = fileURLToPath(new URL('../../scripts/typecheck.ts', import.meta.url))

test('typecheck (no check ID): main returns the status of tsc, and 1 when it has none', () => {
  for (const [status, want] of [
    [0, 0],
    [2, 2],
    [null, 1],
  ] as const) {
    assert.equal(
      main(() => ({ status })),
      want,
    )
  }
})

// A temp dir: bin/ holds a fake npx, for POSIX and for Windows, that writes its cwd to bin/cwd and
// exits 3; tmp/ is the subprocess's temp dir.
function fakeNpx(t: TestContext): { bin: string; tmp: string } {
  const base = mkdtempSync(join(tmpdir(), 'mtty-'))
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const bin = join(base, 'bin')
  const tmp = join(base, 'tmp')
  const out = join(bin, 'cwd')
  mkdirSync(bin)
  mkdirSync(tmp)
  writeFileSync(join(bin, 'npx'), `#!/bin/sh\npwd -P > '${out}'\nexit 3\n`)
  chmodSync(join(bin, 'npx'), 0o755)
  writeFileSync(join(bin, 'npx.cmd'), `@cd > "${out}"\r\n@exit 3\r\n`)
  return { bin, tmp }
}

test('typecheck (no check ID): the CLI exits with the status of npx, and leaves no temp dir', (t) => {
  const { bin, tmp } = fakeNpx(t)
  const inherited = Object.entries(process.env).filter(([k]) => k.toUpperCase() !== 'PATH')
  const env = {
    ...Object.fromEntries(inherited),
    PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
    TMPDIR: tmp,
    TEMP: tmp,
    TMP: tmp,
  }
  const r = spawnSync(process.execPath, [script], { env, encoding: 'utf8' })
  assert.equal(r.status, 3, r.stderr)
  // npx ran in a mtty-tsc- dir inside tmp/, so the check that none is left is not vacuous.
  const cwd = readFileSync(join(bin, 'cwd'), 'utf8').trim()
  assert.equal(realpathSync.native(dirname(cwd)), realpathSync.native(tmp))
  assert.match(basename(cwd), /^mtty-tsc-/)
  assert.deepEqual(
    readdirSync(tmp).filter((f) => f.startsWith('mtty-tsc-')),
    [],
  )
})
