// check.ts counts a passing test only at a checked site: at the line and column node:test reports for it, a test or it
// call whose own inline function calls an assertion. checkedSite judges one site; check-ids_test.ts runs check.ts on real trees.
import test from 'node:test'
import assert from 'node:assert/strict'
import { checkedSite } from '../../scripts/lib/checked-sites.ts'

// Each source, and the line and column node:test reports for its test: those of its callee's last name, test, it or only.
const CHECKED: [string, number, number][] = [
  ["test('A1: bare', () => { assert.ok(x) })", 1, 1],
  ["test.only('A1: only', () => { assert.ok(x) })", 1, 6],
  ["test\n  .only('A1: only on the next line', () => { assert.ok(x) })", 2, 4],
  ["test('A1: parent', async t => { await t.test('child', () => { assert.ok(x) }) })", 1, 41],
  ["describe('A1: suite', () => { it('works', () => { assert.ok(x) }) })", 1, 31],
  ["test('A1: an expression body', () => assert.ok(x))", 1, 1],
  ["test('A1: a function', function () { assert(x) })", 1, 1],
  ["test('A1: async', async t => { await assert.rejects(p) })", 1, 1],
  ["test('A1: the context', t => { t.assert.ok(x) })", 1, 1],
  ["test('A1: a helper', () => { assertRows(rows) })", 1, 1],
  ["test(\n  'A1: multi-line',\n  { timeout: 5 },\n  () => {\n    assert.equal(1, 1)\n  },\n)", 1, 1],
  ["test('A1: nested', () => { [1, 2].forEach(n => { assert.ok(n) }) })", 1, 1],
  ["test('A1: a ) in a name', () => { assert.ok(x) })", 1, 1],
  // node:test counts columns in UTF-16 code units, as JS strings index.
  ["const s = '\u{1F600}'; test('A1: after an astral character', () => { assert.ok(s) })", 1, 17],
]
// Each source, the line and column of a test, and why the site is unchecked.
const UNCHECKED: [string, number, number, string][] = [
  ["const name = 'A2: placeholder'; test(name)", 1, 33, 'no inline function'],
  ["test('A1: x', body)", 1, 1, 'no inline function'],
  ["test('A1: x')", 1, 1, 'no inline function'],
  ["test('A1: x', { skip: false })", 1, 1, 'no inline function'],
  ["test('A2: parent', async t => { await t.test('placeholder') })", 1, 41, 'no inline function'],
  ["test('A2: parent', async t => { await t.test('placeholder') })", 1, 1, 'its function calls no assert'],
  ["test('A1: x', () => {})", 1, 1, 'its function calls no assert'],
  ["test('A1: x', async function () {})", 1, 1, 'its function calls no assert'],
  ["test('A1: x', () => { compute() })", 1, 1, 'its function calls no assert'],
  ["test('A1: x', () => {\n  // assert.ok(x)\n  /* assert(x) */\n})", 1, 1, 'its function calls no assert'],
  ["test('A1: x', () => { log('assert.ok(x)', `assert(x)`, /assert(x)/) })", 1, 1, 'its function calls no assert'],
  ["test('A1: x', () => { const a = assert; a.ok(x) })", 1, 1, 'its function calls no assert'],
  ["test('A1: x', () => { [x].forEach(assert.ok) })", 1, 1, 'its function calls no assert'],
  ["test('A1: x', () => { function assertRows() {} })", 1, 1, 'its function calls no assert'],
  ["describe('A1: x', () => { assert.ok(x) })", 1, 1, 'no test or it call here'],
  ["test.skip('A1: x', () => { assert.ok(x) })", 1, 6, 'no test or it call here'],
  ["x.only('A1: x', () => { assert.ok(x) })", 1, 3, 'no test or it call here'],
  ['assert.ok(test)', 1, 11, 'no test or it call here'],
  ["// test('A1: x', () => { assert.ok(x) })", 1, 4, 'no test or it call here'],
  ["test('A1: x', () => { assert.ok(x) })", 1, 2, 'no test or it call here'],
  ["test('A1: x', () => { assert.ok(x) })", 2, 1, 'no test or it call here'],
]

test('A8.validation: checkedSite is true where a test or it call, bare, with .only or as a method, has an inline function that calls an assertion', () =>
  assert.deepEqual(CHECKED.map(([src, line, column]) => [src, checkedSite(src, line, column)]), CHECKED.map(([src]) => [src, true])))
test('A8.validation: checkedSite names why a site is unchecked: no test or it call there, no inline function, or one that calls no assert', () =>
  assert.deepEqual(UNCHECKED.map(([src, line, column]) => [src, line, column, checkedSite(src, line, column)]), UNCHECKED))
test('A8.validation: checkedSite judges the call at the exact line and column, not the first on its line or in its source', () => {
  const line = "test('A1: x', () => { assert.ok(x) }); test('A1: y', () => {})"
  assert.deepEqual([checkedSite(line, 1, 1), checkedSite(line, 1, 40)], [true, 'its function calls no assert'])
  const lines = "test('A1: x', () => { assert.ok(x) })\ntest('A1: y', () => {})"
  assert.deepEqual([checkedSite(lines, 1, 1), checkedSite(lines, 2, 1)], [true, 'its function calls no assert'])
})
// node:test reports V8's lines: CRLF, CR, LF, U+2028 and U+2029 each end one, in a template or a string too.
test('A8.validation: checkedSite counts lines as V8 does', () => {
  const src = "const s = `a\r\nb\rc\nd\u2028e\u2029f`; test('A1: x', () => {})\ntest('A1: y', () => { assert.ok(s) })"
  assert.deepEqual([checkedSite(src, 6, 5), checkedSite(src, 7, 1)], ['its function calls no assert', true])
})

// GPT-6's repros, which node:test passes: an assert in a regex after a for header's ), and in one after continue at a line
// end. node:test reports each test at line 2, column 1.
const REPROS = [
  "import test from 'node:test'\ntest('A1: assertion keywords', () => {\n  for (const word of ['assert', 'assertion'])\n    /assert(ion)?/.test(word)\n})\n",
  "import test from 'node:test'\ntest('A1: assertion keywords', () => {\n  for (const word of ['', 'assert', 'assertion']) {\n    if (!word) continue\n    /assert(ion)?/.test(word)\n  }\n})\n",
]
test("A8.validation: checkedSite finds no assert call in GPT-6's repros, whose only assert( is in a regex", () =>
  assert.deepEqual(REPROS.map(src => checkedSite(src, 2, 1)), REPROS.map(() => 'its function calls no assert')))
// A test at line 1, column 1 whose function holds stmts.
const holding = (stmts: string) => `test('A1: x', () => {\n  ${stmts}\n})`
// What a / starts depends on the token before it. After each of these, as ECMAScript reads it, /assert(y)/g is a regex, so its
// assert( is no call: each keyword in checked-sites.ts's list, at a line end where ASI applies too; a break or continue label;
// each punctuator, a dividing / too; prefix ++ and --; =>; a control header's ); and a block's }. A \n is a line end.
const BEFORE_REGEX = [
  ...'return typeof instanceof in of new delete void throw case do else yield await default extends'.split(' ').map(k => `${k} `),
  'return\n', 'break\n', 'continue\n', 'debugger\n', 'break outer\n', 'continue outer\n',
  'f(', '[', '{', 'a, ', 'a; ', 'a ? ', 'a ? b : ', 'a = ', 'a + ', 'a - ', 'a * ', 'a % ', 'a / ', 'a & ', 'a | ', 'a ^ ',
  'a < ', 'a > ', '!', '~', '...', '++', '--', 'x\n++', 'a => ',
  'if (x) ', 'for (;;) ', 'for await (const w of ws) ', 'while (i--) ', 'with (o) ', '{ f() } ', '{ f() }\n',
]
for (const before of BEFORE_REGEX)
  test(`A8.validation: after ${JSON.stringify(before)}, checkedSite reads /assert(y)/g as a regex, so no assert is called`, () =>
    assert.equal(checkedSite(holding(`${before}/assert(y)/g.test(s)`), 1, 1), 'its function calls no assert'))
// After an operand the same text divides, and JS calls assert(y): an identifier, number, string, template or regex; a call's
// ); a ]; and a postfix ++ or -- at a line end, which ASI does not end.
const BEFORE_DIVISION = ['x ', '2 ', "'s' ", '`t` ', '/r/ ', 'f(a) ', 'arr[0] ', 'x++\n', 'x--\n']
for (const before of BEFORE_DIVISION)
  test(`A8.validation: after ${JSON.stringify(before)}, checkedSite reads / as a division, so assert(y) is called`, () =>
    assert.equal(checkedSite(holding(`${before}/assert(y)/g.test(s)`), 1, 1), true))
test('A8.validation: checkedSite reads a / after any other ) or a ] as a division, so the assert calls beside it count', () => {
  for (const stmt of ['const m = (a + b) / 2; assert.equal(m, 1)', 'assert.equal(arr[0] / 2, 1)', 'assert.ok(f(a) / g(b) > 1)'])
    assert.equal(checkedSite(holding(stmt), 1, 1), true, stmt)
})
