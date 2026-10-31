import test from 'node:test'; import assert from 'node:assert/strict'; import { spawnSync } from 'node:child_process'; import { readFileSync } from 'node:fs'
import { parseIds, diffIds, slug } from '../../scripts/lib/check-ids.ts'
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'; import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'; import { pathToFileURL } from 'node:url'
import { CHECKS, allSteps, run } from '../../scripts/check.ts'; import { claude } from '../../scripts/lib/claude.ts'
const DOC = '## Spec A\n| A4 | Width | **Width table:** x. **Fit ladder:** y. **not a label** z |\n| A9 | E | **Stored / copied:** z |\n## Visual review (*review*)\n**Gallery:** g\n## Spec B\n| B7 | CI | **Check IDs:** c |\n'
test('A8.validation: only bold text with the colon inside is a label; slugs collapse non-[a-z0-9] runs (B7)', () => {
  assert.deepEqual(parseIds(DOC), ['A4', 'A4.width-table', 'A4.fit-ladder', 'A9', 'A9.stored-copied', 'VR.gallery', 'B7', 'B7.check-ids'])
  assert.equal(slug('Stored / copied'), 'stored-copied'); assert.equal(slug('No build'), 'no-build')
})
test('A8.validation: ci/coverage.json lists exactly the 48 check IDs, in order', () => assert.deepEqual(
  Object.keys(JSON.parse(readFileSync('ci/coverage.json', 'utf8'))), ('A1 A2 A3 A4 A4.width-table A4.fit-ladder A5 A5.mutation-tests A5.errors A6 ' +
  'A6.hook-tests A6.command A6.in-claude-code A7 A8 A8.portability A8.benchmark A8.cache A8.no-build A8.validation A8.platforms A9 A9.harness A9.stored A9.release ' +
  'A10 VR.gallery VR.in-ci VR.reviewers VR.tangled VR.passes B1 B1.docs-check B1.beauty-review B2 B2.per-paragraph B2.translation-review B3 B3.publish-test ' +
  'B3.workflow-check B3.release B4 B5 B5.every-pr B5.release B6 B7 B7.check-ids').split(' ')))
test('A8.validation: diff reports missing and extra IDs', () =>
  assert.deepEqual(diffIds(['A4', 'A4.width-table'], ['A4', 'A9.harness']), { missing: ['A4.width-table'], extra: ['A9.harness'] }))
test('A8.validation: an unknown ID fails', () => {
  const r = spawnSync(process.execPath, ['scripts/check.ts', 'A99'], { encoding: 'utf8' })
  assert.equal(r.status, 1); assert.equal(r.stdout, ''); assert.match(r.stderr, /^unknown check A99$/m)
})

// Beyond the plan's four: every branch and boundary of the parser, the runner and both CLIs.

// Writes files into a fresh mtty- temp dir, calls body with it, then removes it.
function scratch(files: Record<string, string>, body: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'mtty-'))
  try {
    for (const [file, text] of Object.entries(files)) { mkdirSync(dirname(join(dir, file)), { recursive: true }); writeFileSync(join(dir, file), text) }
    body(dir)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
// Runs this repo's check.ts in dir. NODE_TEST_CONTEXT is dropped, because a node --test
// that inherits it from this run skips its files (node:test's recursion guard).
function check(dir: string, id: string, env: Record<string, string> = {}) {
  const { NODE_TEST_CONTEXT: _, ...base } = process.env
  const r = spawnSync(process.execPath, [resolve('scripts/check.ts'), id], { cwd: dir, encoding: 'utf8', env: { ...base, ...env } })
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, steps: r.stderr.split(/\r?\n/).filter(l => l.startsWith('> ')) }
}
function emptyPath<T>(body: () => T): T {
  const saved = process.env.PATH; process.env.PATH = ''
  try { return body() } finally { process.env.PATH = saved }
}
const nodeTest = (...tests: string[]) => `import test, { describe, it } from 'node:test'\nimport assert from 'node:assert/strict'\n${tests.join('\n')}\n`
// Files @nt must not run: a kit test, and a .ts file not named *_test.ts.
const DECOYS = { 'tests/hooks/k.test.tsx': "throw new Error('a kit test ran under node --test')\n", 'tests/helper.ts': "throw new Error('a non-test file ran')\n" }

test('A8.validation: parseIds skips rows before a section, C rows and rows after a non-ID ## heading; takes A10, two labels on a line, a ### sub-section and a last line without \\n', () =>
  assert.deepEqual(parseIds('| A1 | before any section **X:** |\n# Title\n## Spec A\n**Loose:** not in a row\n| C1 | not A or B **Y:** |\n' +
    '| A10 | two digits **Z:** |\n## Notes\n| A2 | after a non-ID heading **N:** |\n## Visual review\n**One:** **Two:** both\n' +
    '| A3 | a row adds no VR ID |\n### Sub\n**Three:** still the section\n## Spec B\n| B1 | **Docs check:** |'),
  ['A10', 'A10.z', 'VR.one', 'VR.two', 'VR.three', 'B1', 'B1.docs-check']))
test('A8.validation: slug keeps a-z and 0-9, lowercases, and trims dashes at both ends', () =>
  assert.equal(slug('  -A–z 0/9 (Beta)!- '), 'a-z-0-9-beta'))
test('A8.validation: diff compares as sets, and lists every missing and extra ID', () => {
  assert.deepEqual(diffIds(['A1', 'A2'], ['A2', 'A1']), { missing: [], extra: [] })
  assert.deepEqual(diffIds(['A1', 'A2', 'A3'], ['A2', 'B1', 'B2']), { missing: ['A1', 'A3'], extra: ['B1', 'B2'] })
})
test('A8.validation: all runs the Node tests first and once, then each distinct in-all step in table order, minus the kit and validate', () =>
  assert.deepEqual(allSteps([
    { id: 'R1', steps: [['node', 'x.ts'], ['@nt'], ['@kit']] },
    { id: 'R2', steps: [['claude', 'plugin', 'validate', '.'], ['node', 'y.ts', '@tmp'], ['node', 'x.ts']] },
    { id: 'R3', steps: [['node', 'z.ts']], inAll: false },
    { id: 'R4', steps: [['@nt'], ['node', 'w.ts'], ['node', 'y.ts', '@tmp']] },
  ]), [['@nt'], ['node', 'x.ts'], ['node', 'y.ts', '@tmp'], ['node', 'w.ts']]))
test("A8.validation: check.sh's all runs exactly these steps, in this order", () =>
  assert.deepEqual(allSteps(CHECKS), [['@nt'], ['node', 'scripts/check-portable.ts'], ['node', 'scripts/bench.ts', 'fixtures'],
    ['node', 'scripts/fresh-clone.ts'], ['node', 'scripts/corpus-gate.ts', 'fixtures/corpus'], ['node', 'scripts/render-gallery.ts', '@tmp'],
    ['node', 'scripts/check-tangle.ts'], ['node', 'scripts/check-review-hashes.ts', '--require-pass'], ['node', 'scripts/check-palettes.ts']]))
// check-ids compares as sets, so only this pin catches a duplicated or reordered row.
test("A8.validation: CHECKS has plan A §9's 31 rows, in its order, each ID once", () => {
  const ids = CHECKS.map(r => r.id)
  assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [], 'duplicated IDs')
  assert.deepEqual(ids, ('A1 A2 A3 A4 A4.width-table A4.fit-ladder A5 A5.mutation-tests A5.errors A6 A6.hook-tests A6.command A6.in-claude-code A7 ' +
    'A8.portability A8.benchmark A8.cache A8.no-build A8.validation A8.platforms A8 A9 A9.harness A9.stored A9.release A10 ' +
    'VR.gallery VR.tangled VR.reviewers VR.passes VR.in-ci').split(' '))
})
test("A8.validation: check-ids passes when CHECKS has a row for exactly the 31 A and VR IDs in ci/coverage.json", () => {
  const r = spawnSync(process.execPath, ['scripts/check-ids.ts'], { encoding: 'utf8' })
  assert.equal(r.status, 0); assert.equal(r.stdout, 'check-ids: CHECKS matches the 31 A and VR IDs\n')
})
test('A8.validation: check-ids fails, naming the ID, when ci/coverage.json has an ID CHECKS lacks', () => {
  const map = 'ci/coverage.json'
  scratch({ [map]: readFileSync(map, 'utf8').replace('"A8.cache": ', '"A8.warm-cache": "check",\n  "A8.cache": ') }, dir => {
    const r = spawnSync(process.execPath, [resolve('scripts/check-ids.ts')], { cwd: dir, encoding: 'utf8' })
    assert.equal(r.status, 1); assert.match(r.stderr, /^check-ids: \{"missing":\["A8\.warm-cache"\],"extra":\[\]\}$/m)
  })
})
test('A8.validation: check.ts and check-ids.ts run main() when argv[1] reaches them through a symlink, as macOS temp paths do', () =>
  scratch({}, dir => {
    const link = join(dir, 'scripts')
    symlinkSync(resolve('scripts'), link, 'junction')
    try {
      const r = spawnSync(process.execPath, [join(link, 'check.ts'), 'A99'], { encoding: 'utf8' })
      assert.equal(r.status, 1); assert.match(r.stderr, /^unknown check A99$/m)
      const ids = spawnSync(process.execPath, [join(link, 'check-ids.ts')], { encoding: 'utf8' })
      assert.equal(ids.status, 0); assert.equal(ids.stdout, 'check-ids: CHECKS matches the 31 A and VR IDs\n')
    } finally { unlinkSync(link) }
  }))
test('A8.validation: importing check.ts or check-ids.ts runs nothing, whether argv[1] is absent or names no file', () => {
  for (const file of ['scripts/check.ts', 'scripts/check-ids.ts']) { for (const argv of [[], ['no-such-file']]) {
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(resolve(file)).href)})`, ...argv], { encoding: 'utf8' })
    const what = `${file} ${argv.join(' ')}`
    assert.equal(r.status, 0, what); assert.equal(r.stdout, '', what); assert.doesNotMatch(r.stderr, /unknown check|Error/, what)
  } }
})
test("A8.validation: a node step runs this Node, not PATH's, and returns its exit code", () =>
  assert.equal(emptyPath(() => run(['node', '-e', 'process.exit(3)'])), 3))
test('A8.validation: an unsupported step fails with its reason and runs nothing', t => {
  const error = t.mock.method(console, 'error', () => {})
  assert.equal(run(['sh', '-c', 'exit 0']), 1); assert.deepEqual(error.mock.calls.map(c => c.arguments), [['unsupported step sh']])
})
test('A8.validation: a claude step goes through lib/claude.ts, and a claude that cannot start fails', t => {
  assert.equal(run(['claude', '--version']), 0)
  const error = t.mock.method(console, 'error', () => {})
  assert.equal(emptyPath(() => claude(['--version'])), 1)
  if (process.platform !== 'win32') { assert.equal((error.mock.calls[0]?.arguments[0] as { code?: string }).code, 'ENOENT') }
})
test('A8.validation: @nt runs the *_test.ts files under tests/, nested ones too, filtered to titles that start with the ID', () =>
  scratch({ ...DECOYS, 'tests/a_test.ts': nodeTest("test('B1: top level', () => { assert.ok(true) })"),
    'tests/deep/b_test.ts': nodeTest("test('A3: nested', () => { assert.ok(true) })", "test('B2: other row', () => { throw new Error('ran without the A3 filter') })") }, dir => {
    const r = check(dir, 'A3')
    assert.equal(r.status, 0); assert.deepEqual(r.steps, ['> @nt']); assert.match(r.stdout, /^ok \d+ - A3: nested$/m)
  }))
// A @nt that ran no real test: it fails, stops its row and says why.
function assertNoRun(r: ReturnType<typeof check>, id: string): void {
  assert.equal(r.status, 1, id); assert.deepEqual(r.steps, ['> @nt'], id)
  assert.match(r.stderr, new RegExp(`^no tests ran for ${id.replaceAll('.', '\\.')}$`, 'm'), id)
}
// Tests node:test passes that execute no assertion: the forms the static scan must catch, and each placeholder form. Under
// check.ts's preload each fails, so @nt fails. [what, the tests in tests/a_test.ts]
const UNASSERTING: [string, string][] = [
  ['an assert only in a regex after a for (…) header', "test('A1: x', () => {\n  for (const word of ['assert', 'assertion'])\n    /assert(ion)?/.test(word)\n})"],
  ['an assert only in a regex after continue', "test('A1: x', () => {\n  for (const word of ['', 'assert']) {\n    if (!word) continue\n    /assert(ion)?/.test(word)\n  }\n})"],
  ['an assert only in a regex after let word', "test('A1: x', () => {\n  let word\n  /assert(ion)?/g.test(String(word))\n})"],
  ['an assert only in a string', "test('A1: x', () => { void 'assert.ok(1)' })"],
  ['an assert only in a comment', "test('A1: x', () => { /* assert.ok(1) */ })"],
  ['an assert only in a template', "test('A1: x', () => { void `assert.ok(${1})` })"],
  ['an assert only in a dead branch', "test('A1: x', () => { if (false) assert.ok(1) })"],
  ['no function', "test('A1: x')"],
  ['an empty function', "test('A1: x', () => {})"],
  ['{ skip: false } and no function', "test('A1: x', { skip: false })"],
  ['a name in a variable and no function', "const name = 'A1: x'; test(name)"],
  ["a t.test('x') placeholder child", "test('A1: x', async t => { assert.ok(1); await t.test('x') })"],
  ['an it placeholder in describe', "describe('A1: x', () => { it('placeholder') })"],
]
for (const [what, tests] of UNASSERTING)
  { test(`A8.validation: @nt fails on a test that executes no assertion: ${what}`, () =>
    scratch({ 'tests/a_test.ts': nodeTest(tests) }, dir => {
      const r = check(dir, 'A1')
      assert.equal(r.status, 1); assert.deepEqual(r.steps, ['> @nt']); assert.match(r.stdout, /error: 'no assertion executed'/)
    })) }
// Accepted: an EventEmitterAsyncResource runs its listeners in the async context it was made in, so a node:assert call in
// a listener of one made outside the test counts for no test (count.ts). Such a test must assert in its own flow too.
test('A8.validation: @nt fails on a test whose only assertion is in a listener of an EventEmitterAsyncResource made outside it', () =>
  scratch({ 'tests/a_test.ts': nodeTest("import { EventEmitterAsyncResource } from 'node:events'", "const events = new EventEmitterAsyncResource({ name: 'A1' })",
    "test('A1: x', () => { events.on('go', () => { assert.ok(1) }); events.emit('go') })") }, dir => {
    const r = check(dir, 'A1')
    assert.equal(r.status, 1); assert.match(r.stdout, /^not ok \d+ - A1: x$/m); assert.match(r.stdout, /error: 'no assertion executed'/)
  }))
// Tests that execute an assertion where a static scan sees none, in a child only, under t.plan, or after the function
// returns a thenable or another realm's promise. Each passes. [what, other files, the tests]
const ASSERTING: [string, Record<string, string>, string][] = [
  ['an assert in a helper module', { 'tests/helpers.ts': "import assert from 'node:assert/strict'\nexport const same = (a: unknown, b: unknown) => assert.deepEqual(a, b)\n" },
    "import { same } from './helpers.ts'\ntest('A1: x', () => { same([1], [1]) })"],
  ['an assert after await', {}, "test('A1: x', async () => { await new Promise(r => setTimeout(r, 1)); assert.ok(1) })"],
  ['an assert in a loop', {}, "test('A1: x', () => { for (const n of [1, 2]) assert.ok(n) })"],
  ['an assert in a done-callback test', {}, "test('A1: x', (t, done) => { setTimeout(() => { assert.ok(1); done() }, 1) })"],
  ['t.assert.ok', {}, "test('A1: x', t => { t.assert.ok(1) })"],
  ['describe and it', {}, "describe('A1: x', () => { it('works', () => { assert.ok(1) }) })"],
  ['a parent whose only asserts are in its children', {}, "test('A1: x', async t => { await t.test('child', () => { assert.ok(1) }) })"],
  ['the tests a loop registers', {}, "for (const n of [1, 2]) test(`A1: loop ${n}`, () => { assert.ok(n) })"],
  ['t.plan, then t.assert', {}, "test('A1: plan', t => { t.plan(1); t.assert.equal('hello'.length, 5) })"],
  ['a t.plan met by one t.assert call and one subtest', {}, "test('A1: x', async t => { t.plan(2); t.assert.ok(1); await t.test('child', () => { assert.ok(1) }) })"],
  ['a returned thenable', {}, "test('A1: x', () => ({ then(resolve) { setTimeout(() => { assert.ok(1); resolve() }, 1) } }))"],
  ["another realm's promise", {}, "import { runInNewContext } from 'node:vm'\n" +
    "test('A1: x', () => runInNewContext('new Promise(r => setTimeout(r, 1))', { setTimeout }).then(() => { assert.ok(1) }))"],
]
for (const [what, files, tests] of ASSERTING)
  { test(`A8.validation: @nt passes a test that executes an assertion: ${what}`, () =>
    scratch({ ...files, 'tests/a_test.ts': nodeTest(tests) }, dir => {
      const r = check(dir, 'A1')
      assert.equal(r.status, 0, r.stdout); assert.doesNotMatch(r.stdout, /^not ok/m)
    })) }
// node:assert's Assert, from Node 24.6: an instance's assertion counts whether the instance has it, as a strict one has
// equal, or inherits it, as each inherits deepStrictEqual; and the options reach node's Assert.
test("A8.validation: @nt passes a test that executes an assertion: an Assert instance's own or inherited method, configured or not",
  { skip: typeof assert.Assert !== 'function' && 'no Assert in this Node' }, () =>
    scratch({ 'tests/a_test.ts': nodeTest("import { Assert } from 'node:assert'",
      "test('A1: inherited', () => { new Assert({ skipPrototype: true }).deepStrictEqual({ a: 1 }, { a: 1 }) })",
      "test('A1: own', () => { new Assert().equal(1, 1) })", "test('A1: configured', () => { new Assert({ strict: false }).equal(1, '1') })") }, dir => {
      const r = check(dir, 'A1')
      assert.equal(r.status, 0, r.stdout); assert.doesNotMatch(r.stdout, /^not ok/m)
    }))
// test.expectFailure passes a test whose function throws, though it asserts nothing, so such a test proves no ID.
test('A8.validation: @nt fails when the only matching test is an expected failure', { skip: typeof test.expectFailure !== 'function' && 'no test.expectFailure in this Node' }, () =>
  scratch({ 'tests/a_test.ts': nodeTest("test.expectFailure('A1: x', () => { throw new Error('x') })") }, dir =>
    assertNoRun(check(dir, 'A1'), 'A1')))
// A suite is no test, though its function calls an assertion.
test('A8.validation: @nt fails and stops the row when only an empty suite matches', () =>
  scratch({ 'tests/a_test.ts': nodeTest("describe('A1: empty suite', () => { assert.ok(true) })", "describe('A1: outer', () => { describe('inner', () => { assert.ok(true) }) })") }, dir =>
    assertNoRun(check(dir, 'A1'), 'A1')))
// Each skipped or todo test with a function calls an assertion, so only the reporter's exclusion keeps it from counting.
test('A8.validation: @nt fails when every matching test is skipped, at the top level or in a suite, by option, .skip or t.skip', () =>
  scratch({ 'tests/a_test.ts': nodeTest("test('A4: skipped', { skip: true }, () => { assert.ok(1) })",
    "describe('A4: suite', () => { it('a', { skip: 'why' }, () => { assert.ok(1) }); it.skip('b', () => { assert.ok(1) }); it('c', t => { t.skip(''); assert.ok(1) }) })") }, dir =>
    assertNoRun(check(dir, 'A4'), 'A4')))
test('A8.validation: @nt fails and stops the row when every matching test is a todo, at the top level or in a suite, a failing todo too', () =>
  scratch({ 'tests/a_test.ts': nodeTest("test('A5: a todo', { todo: true }, () => { assert.ok(1) })",
    "describe('A5: suite', () => { it.todo('a'); it('b', t => { t.todo(); assert.ok(1) }); it('c', { todo: true }, () => { assert.fail('known bug') }) })") }, dir =>
    assertNoRun(check(dir, 'A5'), 'A5')))
test('A8.validation: @nt does not take A10 for A1, as a test or as a suite', () =>
  scratch({ 'tests/a_test.ts': nodeTest("test('A10: not A1', () => { assert.ok(true) })", "describe('A10: suite', () => { it('not A1 either', () => { assert.ok(true) }) })") }, dir =>
    assertNoRun(check(dir, 'A1'), 'A1')))
test('A8.validation: @nt matches a dotted ID only to itself: the dot is literal, and a longer slug is another ID', () => {
  const decoys = ['A4.width-table-v2', 'A4.width-tables', 'A4xwidth-table', 'A4'].map(id => `test('${id}: decoy', () => { assert.ok(true) })`)
  scratch({ 'tests/a_test.ts': nodeTest(...decoys) }, dir => assertNoRun(check(dir, 'A4.width-table'), 'A4.width-table'))
  scratch({ 'tests/a_test.ts': nodeTest(...decoys, "test('A4.width-table: real', () => { assert.ok(true) })") }, dir => {
    const r = check(dir, 'A4.width-table')
    assert.equal(r.status, 0); assert.match(r.stdout, /^ok \d+ - A4\.width-table: real$/m); assert.doesNotMatch(r.stdout, /decoy/)
  })
})
test('A8.validation: @nt counts a passing test in a suite, matched by its own name or by its suite', () =>
  scratch({ 'tests/a_test.ts': nodeTest("describe('helpers', () => { it('A1: own name', () => { assert.ok(true) }) })",
    "describe('A3: suite', () => { describe('deeper', () => { it('by ancestry', () => { assert.ok(true) }) }) })") }, dir => {
    for (const id of ['A1', 'A3']) { assert.equal(check(dir, id).status, 0, id) }
  }))
// The rows whose steps run the Node tests, in table order: all proves each one's ID from its one unfiltered run.
const NT_IDS = ('A1 A2 A3 A4 A4.width-table A4.fit-ladder A5 A5.mutation-tests A5.errors A6 A6.hook-tests A6.command A7 A8.cache ' +
  'A8.validation A8.platforms A8').split(' ')
test('A8.validation: all fails, naming each @nt row, when no real test ran: a file without tests and an empty suite are not runs', () =>
  scratch({ 'tests/a_test.ts': '// no tests yet\n', 'tests/b_test.ts': nodeTest("describe('B1: empty', () => {})") }, dir => {
    const r = check(dir, 'all')
    assert.equal(r.status, 1); assert.deepEqual(r.steps, ['> @nt'])
    assert.deepEqual(r.stderr.split(/\r?\n/).filter(l => l.startsWith('no tests ran')), NT_IDS.map(id => `no tests ran for ${id}`))
  }))
test('A8.validation: all fails before any later step on an @nt row its run does not prove, and on a test that executes no assertion', () => {
  const asserting = NT_IDS.filter(id => id !== 'A2').map(id => `test('${id}: asserts', () => { assert.ok(1) })`)
  const portable = { 'scripts/check-portable.ts': "console.log('portable ran')\n" }
  scratch({ ...portable, 'tests/a_test.ts': nodeTest(...asserting) }, dir => {
    const r = check(dir, 'all')
    assert.equal(r.status, 1); assert.deepEqual(r.steps, ['> @nt']); assert.doesNotMatch(r.stdout, /portable ran/)
    assert.deepEqual(r.stderr.split(/\r?\n/).filter(l => l.startsWith('no tests ran')), ['no tests ran for A2'])
  })
  scratch({ ...portable, 'tests/a_test.ts': nodeTest(...asserting, "test('A2: asserts nothing', () => {})") }, dir => {
    const r = check(dir, 'all')
    assert.equal(r.status, 1); assert.deepEqual(r.steps, ['> @nt']); assert.doesNotMatch(r.stdout, /portable ran/)
    assert.match(r.stdout, /^not ok \d+ - A2: asserts nothing$/m)
  })
})
test('A8.validation: @nt fails when a matching test fails, though another passed', () =>
  scratch({ 'tests/a_test.ts': nodeTest("test('A2: passes', () => { assert.ok(true) })", "test('A2: fails', () => { throw new Error('boom') })") }, dir => {
    const r = check(dir, 'A2')
    assert.equal(r.status, 1); assert.match(r.stdout, /^not ok \d+ - A2: fails$/m); assert.doesNotMatch(r.stderr, /no tests ran/)
  }))
test('A8.validation: a row runs its steps in order; @tmp is a fresh mtty- dir, removed after; a failing step stops the row with its code', () =>
  scratch({ 'scripts/render-gallery.ts': "import { statSync } from 'node:fs'\nconsole.log(`gallery ${process.argv[2]} ${statSync(process.argv[2]).isDirectory()}`)\n",
    'scripts/check-tangle.ts': 'process.exit(Number(process.env.TANGLE_EXIT ?? 0))\n', 'scripts/check-palettes.ts': "console.log('palettes ran')\n" }, dir => {
    const ok = check(dir, 'VR.in-ci')
    assert.equal(ok.status, 0); assert.match(ok.stdout, /^palettes ran$/m)
    assert.deepEqual(ok.steps, ['> node scripts/render-gallery.ts @tmp', '> node scripts/check-tangle.ts', '> node scripts/check-palettes.ts'])
    const out = /^gallery (.+) true$/m.exec(ok.stdout)?.[1] ?? ''
    assert.equal(dirname(out), tmpdir()); assert.match(basename(out), /^mtty-\w{6}$/); assert.equal(existsSync(out), false)
    const bad = check(dir, 'VR.in-ci', { TANGLE_EXIT: '5' })
    assert.equal(bad.status, 5); assert.deepEqual(bad.steps, ok.steps.slice(0, 2)); assert.doesNotMatch(bad.stdout, /palettes ran/)
  }))
// B2 has no row: its test proves no ID, though like every test it must assert to pass.
test('A8.validation: all runs every Node test once, unfiltered, proves each @nt row, then runs the in-all steps in table order, and stops at the first failure', () =>
  scratch({ ...DECOYS, 'tests/a_test.ts': nodeTest(...NT_IDS.map(id => `test('${id}: one row', () => { assert.ok(1) })`)),
    'tests/deep/b_test.ts': nodeTest("test('B2: another', () => { assert.ok(1) })"),
    'scripts/check-portable.ts': "console.log('portable ran')\n", 'scripts/bench.ts': 'process.exit(4)\n' }, dir => {
    const r = check(dir, 'all')
    assert.equal(r.status, 4); assert.deepEqual(r.steps, ['> @nt', '> node scripts/check-portable.ts', '> node scripts/bench.ts fixtures'])
    assert.match(r.stdout, /^ok \d+ - A3: one row$/m); assert.match(r.stdout, /^ok \d+ - B2: another$/m); assert.match(r.stdout, /^portable ran$/m)
  }))
test("A8.validation: @kit runs claude plugin test . after the row's Node tests", () =>
  scratch({ '.claude-plugin/plugin.json': '{"name":"mtty-scratch","version":"0.0.0"}', 'hooks/hooks.json': '{"modules":["./register.tsx"]}',
    'hooks/register.tsx': "import type { Register } from 'claude-code'\nexport const register: Register = () => {}\n",
    'tests/hooks/k.test.tsx': "import { test, expect } from 'claude-code/testing'\ntest('K: kit runs', async () => { expect(1).toBe(1) })\n",
    'tests/a_test.ts': nodeTest("test('A5: node side', () => { assert.ok(true) })") }, dir => {
    const r = check(dir, 'A5')
    assert.equal(r.status, 0); assert.deepEqual(r.steps, ['> @nt', '> @kit']); assert.match(r.stdout, /^\(pass\) K: kit runs/m)
  }))
