// node scripts/fresh-clone.ts: shows the repo needs no install and no build step. It clones the committed
// HEAD of the repo in the current directory into a temp dir and there runs, in turn: bare node --test;
// node --test over the walked *_test.ts list, since Node 24 rejects a directory; claude plugin test .;
// and node scripts/smoke.ts. Uncommitted changes are not in the clone, so commit first. It prints each
// step's exit code, and whether bare node --test ran more than 0 tests, and exits 1 when any step fails.
// The clone is removed, on a failure too.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { claude } from './lib/claude.ts'
import { isMain } from './lib/is-main.ts'

// The *_test.ts files under dir's tests/, nested ones too: sorted, /-separated and relative to dir.
export function testFiles(dir: string): string[] {
  return readdirSync(join(dir, 'tests'), { recursive: true, encoding: 'utf8' })
    .map(f => `tests/${f.replaceAll('\\', '/')}`).filter(f => f.endsWith('_test.ts')).sort()
}

// The N of the last 'ℹ tests N' line node --test's spec reporter printed, its colors stripped; null when none.
export function testCount(output: string): number | null {
  const counts = [...output.replace(/\x1b\[[0-9;]*m/g, '').matchAll(/^ℹ tests (\d+)$/gm)]
  return counts.length ? Number(counts.at(-1)![1]) : null
}

// Runs this Node with args in cwd, its stdout captured and then shown, its stderr shown as it comes: its
// exit code and stdout. Every script's main() is synchronous, so the stdout shows when the run ends.
function capture(args: string[], cwd: string): { status: number; stdout: string } {
  const r = spawnSync(process.execPath, args, { cwd, encoding: 'utf8', maxBuffer: Infinity, stdio: ['inherit', 'pipe', 'inherit'] })
  if (r.error) console.error(r.error)
  process.stdout.write(r.stdout ?? '')
  return { status: r.status ?? 1, stdout: r.stdout ?? '' }
}

// Runs this Node with args in cwd, its output shown: its exit code.
function node(args: string[], cwd: string): number {
  const r = spawnSync(process.execPath, args, { cwd, stdio: 'inherit' })
  if (r.error) console.error(r.error)
  return r.status ?? 1
}

// Runs git with args, its stderr shown: its exit code, and its stdout, trimmed.
function git(args: string[]): { status: number; stdout: string } {
  const r = spawnSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
  if (r.error) console.error(r.error)
  return { status: r.status ?? 1, stdout: (r.stdout ?? '').trim() }
}

function main(): number {
  const head = git(['rev-parse', 'HEAD'])
  if (head.status !== 0) { console.log(`fresh-clone: FAIL git rev-parse HEAD: exit ${head.status}`); return 1 }
  const dir = mkdtempSync(join(tmpdir(), 'mtty-clone-'))
  try {
    for (const args of [['clone', '--quiet', process.cwd(), dir], ['-C', dir, 'checkout', '--quiet', head.stdout]]) {
      const { status } = git(args)
      if (status !== 0) { console.log(`fresh-clone: FAIL git ${args.join(' ')}: exit ${status}`); return 1 }
    }
    console.log(`fresh-clone: cloned ${head.stdout} into ${dir}`)
    console.error('> node --test')
    const bare = capture(['--test'], dir)
    const results: [string, number][] = [['node --test', bare.status]]
    const steps: [string, () => number][] = [
      ['node --test <the walked *_test.ts list>', () => node(['--test', ...testFiles(dir)], dir)],
      ['claude plugin test .', () => claude(['plugin', 'test', '.'], dir)],
      ['node scripts/smoke.ts', () => node(['scripts/smoke.ts'], dir)],
    ]
    for (const [name, run] of steps) { console.error(`> ${name}`); results.push([name, run()]) }
    const n = testCount(bare.stdout)
    console.log(`fresh-clone: bare node --test ran more than 0 tests: ${n === null ? "unknown (no 'ℹ tests' line)" : `${n > 0 ? 'yes' : 'no'} (${n})`}`)
    for (const [name, status] of results) console.log(`fresh-clone: ${status === 0 ? 'ok' : 'FAIL'} ${name}: exit ${status}`)
    return results.every(([, status]) => status === 0) ? 0 : 1
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

// main() runs only when node runs this file, not when a test imports it.
if (isMain(import.meta)) process.exitCode = main()
