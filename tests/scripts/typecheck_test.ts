import test from 'node:test'; import assert from 'node:assert/strict'; import { tsconfigFor } from '../../scripts/typecheck.ts'
import { npxInvocation } from '../../scripts/typecheck.ts'
test('typecheck (no check ID): core alone; hooks only when the engine types exist', () => {
  const c = tsconfigFor('/r', false), h = tsconfigFor('/r', true)
  assert.deepEqual(c.include, ['/r/core/**/*.ts']); assert.equal(c.compilerOptions.erasableSyntaxOnly, true)
  assert.deepEqual(h.include, ['/r/core/**/*.ts', '/r/hooks/**/*.ts', '/r/hooks/**/*.tsx', '/r/types/**/*.d.ts'])
  assert.deepEqual(h.compilerOptions.typeRoots, ['/r/.claude-plugin/types'])
})

const coreOptions = {
  target: 'es2023', lib: ['es2023'], module: 'esnext', moduleResolution: 'bundler', strict: true,
  noUncheckedIndexedAccess: true, noEmit: true, skipLibCheck: true, allowImportingTsExtensions: true,
  verbatimModuleSyntax: true, erasableSyntaxOnly: true, types: [],
}

test('typecheck (no check ID): the full compilerOptions for core alone', () => {
  assert.deepEqual(tsconfigFor('/r', false).compilerOptions, coreOptions)
})

test('typecheck (no check ID): the full compilerOptions with hooks', () => {
  assert.deepEqual(tsconfigFor('/r', true).compilerOptions, {
    ...coreOptions, jsx: 'react', jsxFactory: 'h', jsxFragmentFactory: 'Fragment',
    typeRoots: ['/r/.claude-plugin/types'], types: ['claude-code'],
  })
})

test('typecheck (no check ID): a root with backslashes gives /-separated globs', () => {
  const c = tsconfigFor('C:\\r', false), h = tsconfigFor('C:\\r', true)
  assert.deepEqual(c.include, ['C:/r/core/**/*.ts'])
  assert.deepEqual(h.include, ['C:/r/core/**/*.ts', 'C:/r/hooks/**/*.ts', 'C:/r/hooks/**/*.tsx', 'C:/r/types/**/*.d.ts'])
  assert.deepEqual(h.compilerOptions.typeRoots, ['C:/r/.claude-plugin/types'])
})

test('typecheck (no check ID): npx runs directly, or on win32 as one shell line with a spaced path quoted', () => {
  const args = ['--yes', '-p', 'typescript@7.0.2', 'tsc', '-p']
  assert.deepEqual(npxInvocation('7.0.2', '/a b/tsconfig.json', false), { command: 'npx', args: [...args, '/a b/tsconfig.json'], shell: false })
  assert.deepEqual(npxInvocation('7.0.2', 'C:\\a b\\tsconfig.json', true), { command: `npx ${args.join(' ')} "C:\\a b\\tsconfig.json"`, args: [], shell: true })
  assert.equal(npxInvocation('7.0.2', 'C:\\t\\tsconfig.json', true).command, `npx ${args.join(' ')} C:\\t\\tsconfig.json`)
})

test('typecheck (no check ID): types is claude-code only with hooks', () => {
  assert.deepEqual(tsconfigFor('/r', false).compilerOptions.types, [])
  assert.equal('typeRoots' in tsconfigFor('/r', false).compilerOptions, false)
  assert.deepEqual(tsconfigFor('/r', true).compilerOptions.types, ['claude-code'])
})
