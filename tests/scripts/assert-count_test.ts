// check.ts preloads scripts/lib/assert-count/hooks.ts into each test file's process: it routes node:test and
// node:assert,
// imported or required, to shims under which a test whose function executes no assertion fails. This runs a fixture
// under
// the preload: a test for each way to reach node:assert, node:test or t.assert, and for each way to execute no
// assertion.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const HOOKS = new URL('../../scripts/lib/assert-count/hooks.ts', import.meta.url).href
// Each row registers one top-level test: [how, its name, the rest of its arguments].
type Row = [string, string, string]
const PASS: Row[] = [
  ['test', 'default', '() => { assert(1) }'],
  ['test', 'default ok', '() => { assert.ok(1) }'],
  ['test', 'named ok', '() => { ok(1) }'],
  ['test', 'named equal, loose', "() => { equal(1, '1') }"],
  ['test', 'named strict', '() => { strict.equal(1, 1) }'],
  ['test', 'assert.strict', '() => { assert.strict.ok(1) }'],
  ['test', 'namespace', '() => { assertNs.deepEqual({ a: 1 }, { a: 1 }) }'],
  ['test', 'namespace default', '() => { assertNs.default.ok(1) }'],
  ['test', 'strict default', '() => { strictDefault.equal(1, 1) }'],
  ['test', 'strict named', '() => { strictDeepEqual([1], [1]) }'],
  ['test', 'strict namespace', '() => { strictNs.strictEqual(1, 1) }'],
  ['test', 'strict is strict', "() => { assert.throws(() => strictDefault.equal(1, '1')) }"],
  ['test', 'bare assert', '() => { bare.ok(1) }'],
  ['test', 'bare assert/strict', '() => { bareStrict.ok(1) }'],
  ['test', 'require node:assert', "() => { require('node:assert')(1) }"],
  ['test', 'require assert', "() => { require('assert').ok(1) }"],
  ['test', 'require node:assert/strict', "() => { require('node:assert/strict').equal(1, 1) }"],
  ['test', 'require assert/strict', "() => { require('assert/strict').equal(1, 1) }"],
  ['test', 'dynamic import', "async () => { (await import('node:assert')).default.ok(1) }"],
  ['test', 'getBuiltinModule', "() => { process.getBuiltinModule('node:assert').ok(1) }"],
  ['test', 't.assert', 't => { t.assert.ok(1) }'],
  ['test', 'rejects', "async () => { await assert.rejects(Promise.reject(new Error('x'))) }"],
  [
    'test',
    'one object however reached',
    "() => { assert.deepEqual([assert.strict, require('assert'), process.getBuiltinModule('node:assert'), " +
      "require('node:test'), testNs.default], [strictDefault, assert, assert, test, test]) }",
  ],
  ['test', 'callback', '(t, done) => { setTimeout(() => { assert.ok(1); done() }, 1) }'],
  ['test', 'a parent of an asserting child', "async t => { await t.test('child', () => { assert.ok(1) }) }"],
  ['it', 'it', '() => { assert.ok(1) }'],
  ['describe', 'a suite', "() => { it('in a suite', () => { assert.ok(1) }) }"],
  ['testNs.test', 'namespace test', '() => { assert.ok(1) }'],
  ["require('node:test')", 'required test', '() => { assert.ok(1) }'],
  ["process.getBuiltinModule('node:test')", 'getBuiltinModule test', '() => { assert.ok(1) }'],
  // node:assert's Assert, from Node 24.6, however reached: its instances' assertions count.
  ...(typeof assert.Assert === 'function'
    ? ([
        ['test', 'Assert', '() => { new Assert().ok(1) }'],
        ['test', 'assert.Assert', '() => { new assert.Assert().ok(1) }'],
        ['test', 'assert.strict.Assert', '() => { new assert.strict.Assert().ok(1) }'],
        ['test', 'strict Assert', '() => { new strictNs.Assert().ok(1) }'],
      ] as Row[])
    : []),
]
const FAIL: Row[] = [
  ['test', 'none', '() => {}'],
  ['test', 'referenced, not called', '() => { void assert.ok }'],
  ['test', 'an AssertionError, not thrown', "() => { void new assert.AssertionError({ message: 'x' }) }"],
  ['test', 't.assert referenced', 't => { void t.assert.ok }'],
  ['test', 'no function', ''],
  ['test', 'options, no function', '{ skip: false }'],
  ['test', 'callback, none', '(t, done) => { done() }'],
  ['test', 'a parent of a placeholder child', "async t => { assert.ok(1); await t.test('placeholder') }"],
  ['it', 'it, none', '() => {}'],
  ['describe', 'a suite of a placeholder', "() => { it('placeholder') }"],
  ["require('node:test')", 'required, none', '() => {}'],
  ["process.getBuiltinModule('node:test')", 'getBuiltinModule, none', '() => {}'],
]
const call = ([how, name, rest]: Row) => `${how}('${name}'${rest ? `, ${rest}` : ''})`
const FIXTURE = [
  "import test, { describe, it } from 'node:test'",
  "import * as testNs from 'node:test'",
  "import assert, { ok, equal, strict, Assert } from 'node:assert'",
  "import * as assertNs from 'node:assert'",
  "import strictDefault, { deepEqual as strictDeepEqual } from 'node:assert/strict'",
  "import * as strictNs from 'node:assert/strict'",
  "import bare from 'assert'",
  "import bareStrict from 'assert/strict'",
  "import { createRequire } from 'node:module'",
  'const require = createRequire(import.meta.url)',
  ...PASS.map(call),
  ...FAIL.map(call),
  '',
].join('\n')

test('A8.validation: under the preload a test passes iff its function executes an assertion, however it reaches node:assert, node:test or t.assert', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'mtty-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  writeFileSync(join(dir, 'fixture_test.ts'), FIXTURE)
  // A node --test that inherits NODE_TEST_CONTEXT from this run skips its files.
  const { NODE_TEST_CONTEXT: _, ...env } = process.env
  const r = spawnSync(process.execPath, [`--import=${HOOKS}`, '--test', '--test-reporter=tap', 'fixture_test.ts'], {
    cwd: dir,
    encoding: 'utf8',
    env,
  })
  const results = Object.fromEntries([...r.stdout.matchAll(/^(not ok|ok) \d+ - (.+)$/gm)].map((m) => [m[2], m[1]]))
  assert.deepEqual(
    results,
    Object.fromEntries([...PASS.map(([, name]) => [name, 'ok']), ...FAIL.map(([, name]) => [name, 'not ok'])]),
    r.stderr,
  )
  assert.equal(r.stdout.match(/error: 'no assertion executed'/g)?.length, FAIL.length)
})
