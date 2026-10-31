import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  accessSync,
  constants,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHECK_SH = fileURLToPath(new URL('../../scripts/check.sh', import.meta.url))

// Plan A §9's text, line by line. Sub-projects add rows to CHECKS in scripts/check.ts, not lines here.
const PLAN_TEXT = [
  '#!/usr/bin/env bash',
  '# scripts/check.sh: the single must-pass entry (CI: shell: bash; Git Bash on Windows).',
  '# Sub-projects B and C add rows to CHECKS in scripts/check.ts, not lines here.',
  'set -euo pipefail',
  'cd "$(dirname "$0")/.."',
  'claude plugin validate .',
  'claude plugin test .',
  'node scripts/check.ts all',
  '',
].join('\n')

test("A8.validation: check.sh is plan A §9's text, byte for byte with LF line endings, and executable", () => {
  assert.equal(readFileSync(CHECK_SH, 'utf8'), PLAN_TEXT)
  // Windows has no execute bit to check; git keeps check.sh's 100755 mode on the other platforms.
  if (process.platform !== 'win32') {
    assert.doesNotThrow(() => accessSync(CHECK_SH, constants.X_OK), 'check.sh is not executable')
  }
})

// Runs a copy of check.sh with bash, from outside its repo, so only its cd finds scripts/check.ts.
// A fake claude and a stub scripts/check.ts print their argv; the fake fails `plugin validate .`
// with VALIDATE_EXIT. PATH has no directory that could hold the real claude: only the fake's,
// with a link to this Node, then the system's for bash and dirname.
function runCheckSh(env: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'mtty-'))
  try {
    const repo = join(dir, 'repo')
    const bin = join(dir, 'bin')
    mkdirSync(join(repo, 'scripts'), { recursive: true })
    mkdirSync(bin)
    writeFileSync(join(repo, 'scripts/check.sh'), readFileSync(CHECK_SH))
    writeFileSync(join(repo, 'scripts/check.ts'), "console.log(['check.ts', ...process.argv.slice(2)].join(' '))\n")
    writeFileSync(
      join(bin, 'claude'),
      '#!/bin/sh\necho "claude $*"\nif [ "$*" = "plugin validate ." ]; then exit "${VALIDATE_EXIT:-0}"; fi\n',
      { mode: 0o755 },
    )
    symlinkSync(process.execPath, join(bin, 'node'))
    const r = spawnSync('bash', [join(repo, 'scripts/check.sh')], {
      cwd: dir,
      encoding: 'utf8',
      env: { PATH: [bin, '/usr/bin', '/bin'].join(':'), ...env },
    })
    return { status: r.status, calls: r.stdout.split('\n').filter(Boolean), stderr: r.stderr }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
const POSIX_ONLY =
  process.platform === 'win32' && 'needs a POSIX bash and PATH; on Windows, CI runs check.sh itself under Git Bash'

test(
  'A8.validation: check.sh runs claude plugin validate ., then claude plugin test ., then node scripts/check.ts all, from the repo root',
  { skip: POSIX_ONLY },
  () => {
    const r = runCheckSh()
    assert.equal(r.status, 0, r.stderr)
    assert.deepEqual(r.calls, ['claude plugin validate .', 'claude plugin test .', 'check.ts all'])
  },
)
test(
  'A8.validation: check.sh stops at a failing claude plugin validate ., with its exit code, and runs nothing after it',
  { skip: POSIX_ONLY },
  () => {
    const r = runCheckSh({ VALIDATE_EXIT: '3' })
    assert.equal(r.status, 3, r.stderr)
    assert.deepEqual(r.calls, ['claude plugin validate .'])
  },
)
