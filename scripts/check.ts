// node scripts/check.ts <ID|all>: runs the steps of one acceptance check ID, or, for `all`, every step check.sh needs
// beyond validate and the kit.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { claude } from './lib/claude.ts'
import { isMain } from './lib/is-main.ts'

// A step is an argv. ['@nt'] runs the Node tests, filtered to the row's ID; ['@kit'] runs `claude plugin test .`; an
// '@tmp' argument becomes a fresh temp dir. argv[0] `node` runs this Node; `claude` goes through lib/claude.ts.
export type Check = { id: string; steps: string[][]; inAll?: false }

const NT = ['@nt']
const KIT = ['@kit']
const VALIDATE = ['claude', 'plugin', 'validate', '.']
const node = (...args: string[]) => ['node', ...args]
const PORTABLE = node('scripts/check-portable.ts')
const BENCH = node('scripts/bench.ts', 'fixtures')
const FRESH = node('scripts/fresh-clone.ts')
const E2E = node('scripts/e2e/run.ts')
const GALLERY = node('scripts/render-gallery.ts', '@tmp')
const TANGLE = node('scripts/check-tangle.ts')
const REVIEWS = node('scripts/check-review-hashes.ts', '--require-pass')

// One row per check ID. Sub-projects B and C add their rows here.
export const CHECKS: Check[] = [
  { id: 'A1', steps: [NT] },
  { id: 'A2', steps: [NT] },
  { id: 'A3', steps: [NT] },
  { id: 'A4', steps: [NT] },
  { id: 'A4.width-table', steps: [NT] },
  { id: 'A4.fit-ladder', steps: [NT] },
  { id: 'A5', steps: [NT, KIT] },
  { id: 'A5.mutation-tests', steps: [NT] },
  { id: 'A5.errors', steps: [NT, KIT] },
  { id: 'A6', steps: [NT, KIT] },
  { id: 'A6.hook-tests', steps: [NT, KIT] },
  { id: 'A6.command', steps: [NT, KIT] },
  { id: 'A6.in-claude-code', steps: [node('scripts/e2e/run.ts', '--scenario', 'source-view')], inAll: false },
  { id: 'A7', steps: [NT, KIT] },
  { id: 'A8.portability', steps: [PORTABLE] },
  { id: 'A8.benchmark', steps: [BENCH] },
  { id: 'A8.cache', steps: [NT] },
  { id: 'A8.no-build', steps: [FRESH] },
  { id: 'A8.validation', steps: [VALIDATE, NT] },
  { id: 'A8.platforms', steps: [NT] },
  // A8 is the union of the six rows above.
  { id: 'A8', steps: [PORTABLE, BENCH, NT, FRESH, VALIDATE] },
  { id: 'A9', steps: [E2E], inAll: false },
  { id: 'A9.harness', steps: [E2E], inAll: false },
  { id: 'A9.stored', steps: [node('scripts/e2e/run.ts', '--scenario', 'stored')], inAll: false },
  {
    id: 'A9.release',
    steps: [node('scripts/e2e/run.ts', '--installed', process.env.CLAUDE_CONFIG_DIR ?? '')],
    inAll: false,
  },
  { id: 'A10', steps: [node('scripts/corpus-gate.ts', 'fixtures/corpus')] },
  { id: 'VR.gallery', steps: [GALLERY] },
  { id: 'VR.tangled', steps: [TANGLE] },
  { id: 'VR.reviewers', steps: [REVIEWS] },
  { id: 'VR.passes', steps: [REVIEWS] },
  { id: 'VR.in-ci', steps: [GALLERY, TANGLE, node('scripts/check-palettes.ts')] },
]

// The steps of `all`: the Node tests once, unfiltered, proving every @nt row's ID, then every other distinct step of
// the in-all rows, in table order. check.sh runs the kit and validate itself.
export function allSteps(checks: Check[]): string[][] {
  const seen = new Set([NT, KIT, VALIDATE].map((s) => JSON.stringify(s)))
  const rest = checks
    .filter((c) => c.inAll !== false)
    .flatMap((c) => c.steps)
    .filter((s) => {
      const key = JSON.stringify(s)
      if (seen.has(key)) {
        return false
      }

      seen.add(key)
      return true
    })
  return [NT, ...rest]
}

// Runs one step and returns its exit code. id filters @nt and is the ID it proves; `all` passes none, and @nt proves
// every row's.
export function run(step: string[], id?: string): number {
  const [cmd = '', ...args] = step
  if (cmd === '@nt') {
    return nodeTests(id)
  }

  if (cmd === '@kit') {
    return claude(['plugin', 'test', '.'])
  }

  if (cmd !== 'node' && cmd !== 'claude') {
    console.error(`unsupported step ${cmd}`)
    return 1
  }

  const tmp = args.includes('@tmp') ? mkdtempSync(join(tmpdir(), 'mtty-')) : ''
  try {
    const argv = args.map((a) => (a === '@tmp' ? tmp : a))
    if (cmd === 'claude') {
      return claude(argv)
    }

    return spawnSync(process.execPath, argv, { stdio: 'inherit' }).status ?? 1
  } finally {
    if (tmp) {
      rmSync(tmp, { recursive: true, force: true })
    }
  }
}

// node --test over every tests/**/*_test.ts (a readdirSync walk, never a shell glob), filtered to titles that start
// with id, with lib/assert-count/hooks.ts preloaded into each file's process:
// a test whose function executes no assertion fails. It fails unless none failed and a real test passed for id or,
// given no id, for each @nt row's ID: one whose own name, or a suite's or parent test's, matches it. TAP's `ok` lines
// cannot tell: they count suites, and a file whose tests the filter all skipped as one passing test.
// lib/passed-tests-reporter.ts lists each real test that passed.
function nodeTests(id?: string): number {
  const files = readdirSync('tests', { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('_test.ts'))
    .map((f) => join('tests', f))
    .sort()
  const tmp = mkdtempSync(join(tmpdir(), 'mtty-'))
  try {
    const passed = join(tmp, 'passed.jsonl')
    const reporter = new URL('./lib/passed-tests-reporter.ts', import.meta.url).href
    const hooks = new URL('./lib/assert-count/hooks.ts', import.meta.url).href
    const r = spawnSync(
      process.execPath,
      [
        `--import=${hooks}`,
        '--test',
        '--test-reporter=tap',
        '--test-reporter-destination=stdout',
        `--test-reporter=${reporter}`,
        `--test-reporter-destination=${passed}`,
        ...(id ? [`--test-name-pattern=${idPattern(id)}`] : []),
        ...files,
      ],
      { stdio: 'inherit' },
    )
    if (r.status !== 0) {
      return r.status ?? 1
    }

    const tests = readFileSync(passed, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as string[])
    const ids = id ? [id] : CHECKS.filter((c) => c.steps.some((s) => s[0] === '@nt')).map((c) => c.id)
    const unproven = ids.filter((i) => {
      const match = new RegExp(idPattern(i))
      return !tests.some((names) => names.some((n) => match.test(n)))
    })
    for (const i of unproven) {
      console.error(`no tests ran for ${i}`)
    }

    return unproven.length > 0 ? 1 : 0
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
// The ID, then no word character and no '-': A1 does not match A10, nor A8.no-build A8.no-build-x.
const idPattern = (id: string) => `^${id.replaceAll('.', '\\.')}(?![\\w-])`

function main(): number {
  const id = process.argv[2]
  const steps = id === 'all' ? allSteps(CHECKS) : CHECKS.find((c) => c.id === id)?.steps
  if (!steps) {
    console.error(`unknown check ${id}`)
    return 1
  }

  for (const step of steps) {
    console.error(`> ${step.join(' ')}`)
    const code = run(step, id === 'all' ? undefined : id)
    if (code !== 0) {
      return code
    }
  }

  return 0
}

// main() runs only when node runs this file, not when a test imports CHECKS or run.
if (isMain(import.meta)) {
  process.exitCode = main()
}
