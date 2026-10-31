// The e2e runner's sandbox removal: it retries, and a removal that still fails is a warning, never a throw, so that one
// run's leftovers (on Windows, a file a dying process still holds) end no later run.
import test from 'node:test'; import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path'
import { removeSandbox } from '../../scripts/e2e/cleanup.ts'

test('A9.harness: removeSandbox removes the sandbox, and returns no warning', () => {
  const base = mkdtempSync(join(tmpdir(), 'mtty-clean-'))
  mkdirSync(join(base, 'cwd')); writeFileSync(join(base, 'cwd', 'f'), 'x')
  assert.equal(removeSandbox(base), undefined)
  assert.equal(existsSync(base), false)
})

// A directory that cannot be written to keeps its entries: a real removal failure, without Windows.
test('A9.harness: removeSandbox returns a warning naming the sandbox when it cannot remove it, and does not throw', { skip: process.platform === 'win32' || process.getuid?.() === 0 }, () => {
  const parent = mkdtempSync(join(tmpdir(), 'mtty-clean-'))
const  base = join(parent, 'mtty-x')
  mkdirSync(join(base, 'cwd'), { recursive: true }); writeFileSync(join(base, 'cwd', 'f'), 'x')
  chmodSync(join(base, 'cwd'), 0o555)
  try {
    assert.match(removeSandbox(base) ?? '', /mtty-x/)
  } finally { chmodSync(join(base, 'cwd'), 0o755); rmSync(parent, { recursive: true, force: true }) }
})
