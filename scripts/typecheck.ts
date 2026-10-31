// Type-checks core/, and hooks/ when the engine types are in .claude-plugin/types/claude-code,
// with the TypeScript pinned in scripts/TS_VERSION. npx fetches it into its own cache and the
// tsconfig lives in a temporary directory, so nothing is installed or written in the repo.
// Usage: node scripts/typecheck.ts  (exits with tsc's status)
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMain } from './lib/is-main.ts'

export interface Tsconfig {
  compilerOptions: Record<string, string | boolean | string[]>
  include: string[]
}

// The tsconfig for the repo at root. Its paths are absolute and /-separated, as tsc's globs need.
export function tsconfigFor(root: string, hooks: boolean): Tsconfig {
  const r = root.replaceAll('\\', '/')
  const compilerOptions = {
    target: 'es2023',
    lib: ['es2023'],
    module: 'esnext',
    moduleResolution: 'bundler',
    strict: true,
    noUncheckedIndexedAccess: true,
    noEmit: true,
    skipLibCheck: true,
    allowImportingTsExtensions: true,
    verbatimModuleSyntax: true,
    erasableSyntaxOnly: true,
    types: [] as string[],
  }
  if (!hooks) {
    return { compilerOptions, include: [`${r}/core/**/*.ts`] }
  }

  return {
    compilerOptions: {
      ...compilerOptions,
      jsx: 'react',
      jsxFactory: 'h',
      jsxFragmentFactory: 'Fragment',
      typeRoots: [`${r}/.claude-plugin/types`],
      types: ['claude-code'],
    },
    include: [`${r}/core/**/*.ts`, `${r}/hooks/**/*.ts`, `${r}/hooks/**/*.tsx`, `${r}/types/**/*.d.ts`],
  }
}

export interface Invocation {
  command: string
  args: string[]
  shell: boolean
}

// How npx runs tsc from typescript@version on config. On win32 npx is npx.cmd, which only a shell
// runs. The shell splits its line at spaces, so a spaced path is quoted; and the line goes as one
// string, since Node deprecates passing args with shell: true (DEP0190).
export function npxInvocation(version: string, config: string, win32: boolean): Invocation {
  const args = ['--yes', '-p', `typescript@${version}`, 'tsc', '-p']
  if (!win32) {
    return { command: 'npx', args: [...args, config], shell: false }
  }

  const file = config.includes(' ') ? `"${config}"` : config
  return { command: ['npx', ...args, file].join(' '), args: [], shell: true }
}

// The part of spawnSync that run uses, so that a test can pass a fake.
export type Spawn = (
  command: string,
  args: string[],
  options: { cwd: string; stdio: 'inherit'; shell: boolean },
) => { status: number | null; error?: Error }

// Type-checks the repo at root: writes its tsconfig to a temp dir and runs tsc there with spawn.
// Returns tsc's status, or 1 when tsc was killed or never started (status null, or an error set).
// The dir is removed in every case; an error that spawn throws propagates, after the removal.
export function run(root: string, spawn: Spawn = spawnSync): number {
  const hooks = existsSync(join(root, '.claude-plugin', 'types', 'claude-code'))
  const version = readFileSync(join(root, 'scripts', 'TS_VERSION'), 'utf8').trim()
  const dir = mkdtempSync(join(tmpdir(), 'mtty-tsc-'))
  try {
    const config = join(dir, 'tsconfig.json')
    writeFileSync(config, JSON.stringify(tsconfigFor(root, hooks), null, 2))
    const { command, args, shell } = npxInvocation(version, config, process.platform === 'win32')
    const r = spawn(command, args, { cwd: dir, stdio: 'inherit', shell })
    return r.error || r.status === null ? 1 : r.status
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

// The CLI: type-checks this repo with spawn, the real spawnSync unless a test passes a fake.
export function main(spawn: Spawn = spawnSync): number {
  return run(ROOT, spawn)
}

if (isMain(import.meta)) {
  process.exitCode = main()
}
