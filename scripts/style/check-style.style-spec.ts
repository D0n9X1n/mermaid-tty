// Tests for check-style.ts. The .style-spec suffix keeps them out of a bare `node --test`, which runs with nothing
// installed; check.sh runs them after `npm ci --prefix scripts/style`.
import assert from 'node:assert/strict'
import test from 'node:test'
import { MAX_COLUMNS, MAX_LINES, check, citesIssue } from './check-style.ts'

const rules = async (source: string) => (await check('x.ts', source)).map((v) => `${v.line} ${v.rule}`)

test('curly: every if, else, for and while body is a block; else if is not', async () => {
  assert.deepEqual(await rules('if (a) b()\n'), ['1 curly'])
  assert.deepEqual(await rules('if (a) {\n  b()\n} else c()\n'), ['3 curly'])
  assert.deepEqual(await rules('for (const x of y) f(x)\nwhile (a) b()\n'), ['1 curly', '2 curly'])
  assert.deepEqual(await rules('if (a) {\n  b()\n} else if (c) {\n  d()\n}\n'), [])
})

test('eqeqeq: == and != fail, except against null', async () => {
  assert.deepEqual(await rules('const a = b == c\nconst d = e != f\n'), ['1 eqeqeq', '2 eqeqeq'])
  assert.deepEqual(await rules('const a = b == null\nconst c = null != d\nconst e = f === g\n'), [])
})

test('no-nested-ternary: a ternary in either branch fails', async () => {
  assert.deepEqual(await rules('const a = b ? (c ? 1 : 2) : 3\n'), ['1 no-nested-ternary'])
  assert.deepEqual(await rules('const a = b ? 1 : c ? 2 : 3\n'), ['1 no-nested-ternary'])
  assert.deepEqual(await rules('const a = (b ? 1 : 2) + (c ? 3 : 4)\n'), [])
})

test('one-var: one variable per declaration, except in a loop header', async () => {
  assert.deepEqual(await rules('const a = 1, b = 2\n'), ['1 one-var'])
  assert.deepEqual(await rules('for (let i = 0, n = 3; i < n; i++) {\n  f(i)\n}\n'), [])
})

test('blank-line-after-block: a multi-line block statement is followed by a blank line or a comment', async () => {
  assert.deepEqual(await rules('if (a) {\n  b()\n}\nc()\n'), ['4 blank-line-after-block'])
  assert.deepEqual(await rules('if (a) {\n  b()\n}\n\nc()\n'), [])
  assert.deepEqual(await rules('if (a) {\n  b()\n}\n// c runs after\nc()\n'), [])
  assert.deepEqual(await rules('if (a) {\n  b()\n}\n'), [], 'the last statement needs nothing after it')
})

test('max-len: a line over the limit fails unless a string, template, regex or URL crosses it', async () => {
  const long = 'x'.repeat(MAX_COLUMNS)
  assert.deepEqual(await rules(`const ${long} = 1\n`), ['1 max-len'])
  assert.deepEqual(await rules(`// ${long}\n`), ['1 max-len'], 'comments are wrapped by hand')
  assert.deepEqual(await rules(`const a = '${long}'\n`), [])
  assert.deepEqual(await rules(`const a = \`${long}\`\n`), [])
  assert.deepEqual(await rules(`const a = /${long}/\n`), [])
  assert.deepEqual(await rules(`// see https://example.com/${long}\n`), [])
})

test('max-lines: a file over the limit fails once', async () => {
  assert.deepEqual(await rules('f()\n'.repeat(MAX_LINES)), [])
  assert.deepEqual(await rules('f()\n'.repeat(MAX_LINES + 1)), [`${MAX_LINES + 1} max-lines`])
})

test('issue-number: comments and test names say why, never which issue', async () => {
  assert.deepEqual(await rules('// fixes #12\nf()\n'), ['1 issue-number'])
  assert.deepEqual(await rules("test('draws a box (#17)', () => {})\n"), ['1 issue-number'])
  assert.deepEqual(await rules('/* see https://github.com/o/r/issues/4 */\nf()\n'), ['1 issue-number'])
  assert.deepEqual(await rules("// fill:#f9f and #333333 are colors\nconst a = 'see #3'\n"), [])
})

test('citesIssue: what counts as a citation', () => {
  for (const text of ['#12', 'see #4.', 'issue 8', 'PR #33', 'pull request 2', '/pull/9'])
    { assert.ok(citesIssue(text), text) }
  for (const text of ['#fff', '#abc123', '&#35;', 'C#', 'e3#2', 'item#x', 'attempt 2'])
    { assert.ok(!citesIssue(text), text) }
})
