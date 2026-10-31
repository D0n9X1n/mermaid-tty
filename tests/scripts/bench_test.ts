import test from 'node:test'; import assert from 'node:assert/strict'; import { percentile, ceiling, diagrams, timeAll } from '../../scripts/bench.ts'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { cpus, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { explain } from '../../core/render.ts'

const BENCH = fileURLToPath(new URL('../../scripts/bench.ts', import.meta.url))
const OK = readFileSync(new URL('../../fixtures/flowchart/flowchart-ok-01.mmd', import.meta.url), 'utf8')

// A temp dir holding files (path → text), removed after the test.
function tree(t: { after(fn: () => void): void }, files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'mtty-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  for (const [p, text] of Object.entries(files)) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), text) }
  return dir
}

test('A8.benchmark: nearest-rank percentiles; ceiling 50 ms on the Mac and 200 ms in CI', () => {
  const xs = [5, 1, 4, 2, 3, 10, 9, 8, 7, 6]; assert.equal(percentile(xs, 50), 5); assert.equal(percentile(xs, 90), 9)
  assert.equal(ceiling({}), 50); assert.equal(ceiling({ CI: 'true' }), 200); assert.equal(ceiling({ BENCH_P90_MS: '80' }), 80)
})
test('A8.benchmark: a BENCH_P90_MS that is not a positive number throws rather than passing every run', () => {
  for (const v of ['fast', '', '0', '-5', 'Infinity']) { assert.throws(() => ceiling({ BENCH_P90_MS: v }), RangeError, JSON.stringify(v)) }
})
test('A8.benchmark: p = 100 is the largest sample and p = 0 the smallest; xs is not mutated', () => {
  const xs = [5, 1, 4, 2, 3, 10, 9, 8, 7, 6]
const  before = [...xs]
  assert.equal(percentile(xs, 100), 10); assert.equal(percentile(xs, 0), 1)
  assert.deepEqual(xs, before)
})
test('A8.benchmark: no samples have no percentile, so percentile([]) throws a RangeError', () => {
  assert.throws(() => percentile([], 50), RangeError)
})
test('A8.benchmark: a whole rank is exact: the 7th percentile of 1…100 is 7, though 7 / 100 · 100 is 7.000000000000001', () => {
  assert.equal(percentile(Array.from({ length: 100 }, (_, i) => i + 1), 7), 7)
})
test('A8.benchmark: diagrams reads each .mmd at any depth under the DIRs whose file name lacks -reject-, named by its path', (t) => {
  const dir = tree(t, { 'a-ok-01.mmd': 'A', 'a-reject-01.mmd': 'R', 'notes.txt': 'T', 'sub/b-ok-02.mmd': 'B', 'sub/b-reject-02.mmd': 'R',
    'x-reject-dir/c-ok-03.mmd': 'C' })
  assert.deepEqual(diagrams([dir]).toSorted((a, b) => a.src.localeCompare(b.src)), [{ name: join(dir, 'a-ok-01.mmd'), src: 'A' },
    { name: join(dir, 'sub', 'b-ok-02.mmd'), src: 'B' }, { name: join(dir, 'x-reject-dir', 'c-ok-03.mmd'), src: 'C' }])
})
test('A8.benchmark: --private adds each closed mermaid fence of the .md files under it, at any depth, named FILE#K', (t) => {
  const dir = tree(t, { 'x/reply.md': 'Prose\n```mermaid\nP\n```\n```js\nJ\n```\n```mermaid\nQ\n```\n```mermaid\nopen\n', 'x/a.mmd': 'M' })
  const md = join(dir, 'x', 'reply.md')
  assert.deepEqual(diagrams([], dir), [{ name: `${md}#1`, src: 'P' }, { name: `${md}#2`, src: 'Q' }])
})
test('A8.benchmark: timeAll times each diagram as the mean of exactly 20 render calls at 80 columns, with no cache between', () => {
  const calls: unknown[] = []
const  count: typeof explain = (s, o) => { calls.push(o); return explain(s, o) }
  // The clock reads the number of render calls so far: a diagram's mean is 1 only when all 20 of its calls fall in its
  // timed window, and the same source twice is rendered twice.
  assert.deepEqual(timeAll([{ name: 'a', src: OK }, { name: 'b', src: OK }], count, () => calls.length), { ms: [1, 1], errors: [] })
  assert.deepEqual(calls, Array(40).fill({ columns: 80, theme: 'default' }))
})
test('A8.benchmark: timeAll reports a diagram that falls back as an error, by name, and gives it no timing', () => {
  assert.deepEqual(timeAll([{ name: 'ok', src: OK }, { name: 'empty.mmd', src: '' }], explain, () => 0),
    { ms: [0], errors: ['empty.mmd: falls back (empty)'] })
})
test('A8.benchmark: timeAll reports a timing that is not a finite number >= 0 as an error, by name, and gives it no timing', () => {
  const at = (t0: number, t1: number) => { const ts = [t0, t1]; return () => ts.shift()! }
  for (const [t0, t1, mean] of [[0, NaN, 'NaN'], [0, Infinity, 'Infinity'], [20, 0, '-1']] as const)
    { assert.deepEqual(timeAll([{ name: 'a', src: OK }], explain, at(t0, t1)), { ms: [], errors: [`a: timing ${mean} ms is not a finite number >= 0`] }) }
})

// scripts/bench.ts run with args, its env extended by env.
const bench = (args: string[], env: Record<string, string> = {}) =>
  spawnSync(process.execPath, [BENCH, ...args], { encoding: 'utf8', env: { ...process.env, ...env } })
// A run's stdout with each timing replaced by T.
const untimed = (s: string) => s.replace(/\d+\.\d{2} ms/g, 'T ms')

test('A8.benchmark: the CLI prints n, p50, p90 and the machine, and exits 1 only when p90 is over BENCH_P90_MS', (t) => {
  const dir = tree(t, { 'flowchart-ok-01.mmd': OK, 'flowchart-reject-01.mmd': 'flowchart TD\nA[open --> B' })
  const machine = `cpu ${cpus()[0]?.model ?? 'unknown'}, node ${process.version}, ${process.platform}`
  const over = bench([dir], { BENCH_P90_MS: '0.001' })
const  under = bench([dir], { BENCH_P90_MS: '1e9' })
  assert.equal(over.status, 1, over.stderr)
  assert.match(over.stderr, /^bench: p90 \d+\.\d{2} ms is over the 0\.001 ms ceiling\n$/)
  assert.equal(under.status, 0, under.stderr)
  assert.equal(under.stderr, '')
  for (const r of [over, under]) { assert.equal(untimed(r.stdout), `bench: n=1 p50=T ms p90=T ms\nbench: ${machine}\n`) }
})
test('A8.benchmark: with no diagram to time, the CLI prints its usage and exits 2', (t) => {
  for (const r of [bench([]), bench([tree(t, { 'notes.txt': 'T', 'x-reject-01.mmd': 'R' })])]) {
    assert.equal(r.status, 2, r.stderr)
    assert.match(r.stderr, /usage: node scripts\/bench\.ts DIR\.\.\. \[--private DIR\]/)
  }
})
test('A8.benchmark: the CLI names each diagram that falls back, prints no timings, and exits 1', (t) => {
  const dir = tree(t, { 'flowchart-ok-01.mmd': OK, 'empty.mmd': '' })
  const r = bench([dir], { BENCH_P90_MS: '1e9' })
  assert.equal(r.status, 1, r.stderr)
  assert.equal(r.stdout, '')
  assert.equal(r.stderr, `bench: ${join(dir, 'empty.mmd')}: falls back (empty)\n`)
})
test('A8.benchmark: under a clock that reads NaN, the CLI names each diagram, prints no p90, and exits 1', (t) => {
  const dir = tree(t, { 'flowchart-ok-01.mmd': OK })
  const r = spawnSync(process.execPath, ['--import=data:text/javascript,performance.now=()=>NaN', BENCH, dir], { encoding: 'utf8' })
  assert.equal(r.status, 1, r.stderr)
  assert.equal(r.stdout, '')
  assert.equal(r.stderr, `bench: ${join(dir, 'flowchart-ok-01.mmd')}: timing NaN ms is not a finite number >= 0\n`)
})
