// test('A1: x') with no function passes on Node 24 and 26, and so does a test whose function is empty: node:test's
// events do not say whether a test has a body, so scripts/lib/passed-tests-reporter.ts counts either as a real run.
// scripts/lib/placeholder-scan.ts names each such call. check.ts fails a filtered run on any; this guard fails `all`.
import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanPlaceholders } from '../../scripts/lib/placeholder-scan.ts'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
// Each file the runner can run, found by this test's own walk, as a '/'-separated path from the repo root.
const RUNNABLE = ['scripts/tests', 'tests'].flatMap(d => readdirSync(join(ROOT, d), { recursive: true, encoding: 'utf8' }).map(f => `${d}/${f.replaceAll('\\', '/')}`))
  .filter(f => /(_test|\.docs-spec)\.ts$/.test(f) && !f.includes('/node_modules/')).sort()

// Writes files into a fresh mtty- temp dir, removed when the test ends, and returns the dir.
function scratch(t: TestContext, files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'mtty-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  for (const [file, text] of Object.entries(files)) { mkdirSync(dirname(join(dir, file)), { recursive: true }); writeFileSync(join(dir, file), text) }
  return dir
}

test('A8.validation: no test file the runner can run has a test, it or describe call with no function or an empty one', () =>
  assert.deepEqual(scanPlaceholders(ROOT), []))
// So the check above is not vacuous: the scan finds every one of those files, and reads each to its end.
test('A8.validation: in a copy of each test file the runner can run, the scan finds a placeholder added after its last line', t => {
  assert.ok(RUNNABLE.includes('tests/scripts/no-placeholder-tests_test.ts'), RUNNABLE.join())
  const texts = Object.fromEntries(RUNNABLE.map(f => [f, `${readFileSync(join(ROOT, f), 'utf8')}\ntest('A1: placeholder')\n`]))
  assert.deepEqual(scanPlaceholders(scratch(t, texts)), RUNNABLE.map(f => `${f}:${texts[f]!.split('\n').length - 1}: test('A1: placeholder') has no function`))
})
test('A8.validation: in each file the runner runs, and no other, the scan names the file and line of each call with only a name, or a name and options, or an empty function', t => {
  const dir = scratch(t, {
    'tests/deep/a_test.ts': ["test('A1: x')", "it('A1: x', { timeout: 5 })", "test('A1: x', () => {})", "test('A1: x', async () => { /* c */ })",
      'test(', "  'A1: x',", '  { timeout: 5 },', ')', "describe('A1: x', function () {", '  // only a comment', '})'].join('\n'),
    'scripts/tests/b.docs-spec.ts': "it.only('A1: x')\ntest(`A1: ${id}`, { timeout: 5 })\n",
    // Files the runner never runs: not *_test.ts or *.docs-spec.ts, or under node_modules.
    'tests/helper.ts': "test('A1: x')\n", 'tests/hooks/k.test.tsx': "test('A1: x')\n", 'tests/node_modules/m/m_test.ts': "test('A1: x')\n",
  })
  assert.deepEqual(scanPlaceholders(dir), ["scripts/tests/b.docs-spec.ts:1: it.only('A1: x') has no function", "scripts/tests/b.docs-spec.ts:2: test(`A1: ${id}`) has no function",
    "tests/deep/a_test.ts:1: test('A1: x') has no function", "tests/deep/a_test.ts:2: it('A1: x') has no function",
    "tests/deep/a_test.ts:3: test('A1: x') has an empty function", "tests/deep/a_test.ts:4: test('A1: x') has an empty function",
    "tests/deep/a_test.ts:5: test('A1: x') has no function", "tests/deep/a_test.ts:9: describe('A1: x') has an empty function"])
})
test('A8.validation: a call inside a string, a template, a regex or a comment is no call, and a ) in a name or a {} in a template ends nothing', t => {
  const dir = scratch(t, { 'tests/a_test.ts': ["test('A1: a ) in a name', () => { assert.ok(true) })", "test('A1: a {} in a template', () => { assert.equal(`{}`.length, 2) })",
    "test('A1: a nested template', () => { assert.equal(`${`test('A1: y')`}`.length, 13) })", `test('A1: a regex', () => { assert.ok(/"/.test("it('A1: y')")) })`,
    "// test('A1: commented out')", "/* it('A1: y') */", "test('A1: the last line')"].join('\n') })
  assert.deepEqual(scanPlaceholders(dir), ["tests/a_test.ts:7: test('A1: the last line') has no function"])
})
test('A8.validation: only .skip, .todo, or a skip or todo option that is literally true or a non-empty string, excuses a missing or empty function', t => {
  const dir = scratch(t, { 'tests/a_test.ts': ["test('A1: skipped', { skip: 'why' })", "it('A1: a todo', { todo: true }, () => {})", "test.skip('A1: x')", "it.todo('A1: x')",
    "describe.skip('A1: x', () => {})", "test('A1: skip false', { skip: false })", "it('A1: todo false', { todo: false })",
    "test('A1: skip empty', { skip: '' }, () => {})", "test('A1: skip by name', { skip })"].join('\n') })
  assert.deepEqual(scanPlaceholders(dir), ["tests/a_test.ts:6: test('A1: skip false') has no function", "tests/a_test.ts:7: it('A1: todo false') has no function",
    "tests/a_test.ts:8: test('A1: skip empty') has an empty function", "tests/a_test.ts:9: test('A1: skip by name') has no function"])
})
test('A8.validation: a function given by name, or a named one, is a function; a declaration is no call', t => {
  const dir = scratch(t, { 'tests/a_test.ts': ["test('A1: by name', body)", "test(function A1() { assert.ok(true) })", 'function test() {}', "test('A1: the last line')"].join('\n') })
  assert.deepEqual(scanPlaceholders(dir), ["tests/a_test.ts:4: test('A1: the last line') has no function"])
})
