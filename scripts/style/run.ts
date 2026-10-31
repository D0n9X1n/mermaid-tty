// node scripts/style/run.ts [--write]: the code style gate. Checks that Prettier has formatted every file it owns and
// that check-style finds nothing, then runs the checker's own tests. With --write it formats first: Prettier, then
// layout.ts for what Prettier leaves alone, then Prettier again, and checks the result. Needs `npm ci --prefix
// scripts/style` once.
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMain } from '../lib/is-main.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
// Prettier's own entry point, run by node: the .bin shim is a shell script that Windows can't run.
const PRETTIER = join(ROOT, 'scripts', 'style', 'node_modules', 'prettier', 'bin', 'prettier.cjs')

function step(name: string, args: string[]): boolean {
  const run = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' })
  if (run.status !== 0) {
    console.error(`style: ${name} failed`)
    return false
  }

  return true
}

function main(args: string[]): number {
  const write = args.includes('--write')
  if (write) {
    const formatted =
      step('prettier --write', [PRETTIER, '--log-level', 'warn', '--write', '.']) &&
      step('layout', ['scripts/style/layout.ts']) &&
      step('prettier --write', [PRETTIER, '--log-level', 'warn', '--write', '.'])
    if (!formatted) {
      return 1
    }
  }

  const checked =
    step('prettier --check', [PRETTIER, '--log-level', 'warn', '--check', '.']) &&
    step('check-style', ['scripts/style/check-style.ts']) &&
    step('style tests', ['--test', 'scripts/style/check-style.style-spec.ts', 'scripts/style/rewrite.style-spec.ts'])
  return checked ? 0 : 1
}

if (isMain(import.meta)) {
  process.exitCode = main(process.argv.slice(2))
}
