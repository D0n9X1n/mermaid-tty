// Tests for the two rewriters, codemod.ts and layout.ts: each must leave what a comment means, and what a compiler or
// formatter directive applies to, exactly as it was.
import assert from 'node:assert/strict'
import test from 'node:test'
import { rewrite } from './codemod.ts'
import { layout } from './layout.ts'

test('layout keeps a directive comment on its own line, never refilled into the prose above it', async () => {
  for (const directive of ['@ts-expect-error', '@ts-ignore', 'prettier-ignore', 'eslint-disable-next-line no-var']) {
    const source = `// Reason.\n// ${directive}\nconst n: number = 1\n`
    const { output, problem } = await layout(source)
    assert.equal(problem, null)
    assert.equal(output, source, directive)
  }
})

test('codemod splits a declaration at its own comma, never one inside a comment', async () => {
  const { output, problem } = await rewrite('let a = 1 /* first, second */, b = 2\n')
  assert.equal(problem, null)
  assert.equal(output, 'let a = 1 /* first, second */\nlet b = 2\n')
})

test('codemod leaves a declaration a directive covers whole, so the directive still covers all of it', async () => {
  const source = '// @ts-expect-error\nconst a: number = "x", b: number = "y"\n'
  assert.deepEqual(await rewrite(source), { output: source, problem: null })
})

test('the rewriters report a change to a comment instead of making it', async () => {
  const { problem } = await layout('// a b\n// c d\nf()\n')
  assert.equal(problem, null, 'refilling keeps every word')
})
