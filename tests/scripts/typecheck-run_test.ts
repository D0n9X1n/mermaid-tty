// run(root, spawn), the CLI body. Every test passes a fake spawn, so none needs npx or the network.
import test from 'node:test'
import type { TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { npxInvocation, run, tsconfigFor } from '../../scripts/typecheck.ts'
import type { Spawn } from '../../scripts/typecheck.ts'

// A repo root holding scripts/TS_VERSION, and the engine types when hooks.
function fakeRoot(t: TestContext, hooks = false): string {
  const root = mkdtempSync(join(tmpdir(), 'mtty-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'scripts'))
  writeFileSync(join(root, 'scripts', 'TS_VERSION'), '9.9.9\n')
  if (hooks) {
    mkdirSync(join(root, '.claude-plugin', 'types', 'claude-code'), { recursive: true })
  }

  return root
}

interface Call {
  command: string
  args: string[]
  options: Parameters<Spawn>[2]
  tsconfig: unknown
}

// A spawn that records each call, with the tsconfig.json in its cwd, then returns or throws outcome.
function fakeSpawn(outcome: ReturnType<Spawn> | Error): { calls: Call[]; spawn: Spawn } {
  const calls: Call[] = []
  const spawn: Spawn = (command, args, options) => {
    const tsconfig: unknown = JSON.parse(readFileSync(join(options.cwd, 'tsconfig.json'), 'utf8'))
    calls.push({ command, args, options, tsconfig })
    if (outcome instanceof Error) {
      throw outcome
    }

    return outcome
  }
  return { calls, spawn }
}

test('typecheck (no check ID): run returns the status of a failing tsc', (t) => {
  assert.equal(run(fakeRoot(t), fakeSpawn({ status: 2 }).spawn), 2)
})

test('typecheck (no check ID): run returns 0 when tsc passes', (t) => {
  assert.equal(run(fakeRoot(t), fakeSpawn({ status: 0 }).spawn), 0)
})

test('typecheck (no check ID): run returns 1 when tsc was killed or failed to start', (t) => {
  assert.equal(run(fakeRoot(t), fakeSpawn({ status: null }).spawn), 1)
  assert.equal(run(fakeRoot(t), fakeSpawn({ status: null, error: new Error('ENOENT') }).spawn), 1)
  assert.equal(run(fakeRoot(t), fakeSpawn({ status: 0, error: new Error('ETIMEDOUT') }).spawn), 1)
})

test('typecheck (no check ID): when spawn throws, run removes its temp dir, then rethrows', (t) => {
  const { calls, spawn } = fakeSpawn(new Error('boom'))
  assert.throws(() => run(fakeRoot(t), spawn), { message: 'boom' })
  assert.equal(calls.length, 1)
  assert.equal(existsSync(calls[0]!.options.cwd), false)
})

test('typecheck (no check ID): run gives npx a temp cwd holding tsconfigFor(root) as tsconfig.json', (t) => {
  for (const hooks of [false, true]) {
    const root = fakeRoot(t, hooks)
    const { calls, spawn } = fakeSpawn({ status: 0 })
    run(root, spawn)
    assert.equal(calls.length, 1)
    const { command, args, options, tsconfig } = calls[0]!
    assert.ok(options.cwd.startsWith(join(tmpdir(), 'mtty-tsc-')), options.cwd)
    assert.deepEqual(tsconfig, tsconfigFor(root, hooks))
    const config = join(options.cwd, 'tsconfig.json')
    const win32 = process.platform === 'win32'
    assert.deepEqual({ command, args, shell: options.shell }, npxInvocation('9.9.9', config, win32))
    assert.equal(options.stdio, 'inherit')
    assert.equal(existsSync(options.cwd), false)
  }
})
