// node scripts/bench.ts DIR... [--private DIR]: the cold-render benchmark (A8.benchmark). Times each diagram under the
// DIRs, and in the .md files under --private, as the mean of 20 cold explain calls at 80 columns, then prints n (the
// number of diagrams), p50, p90 and the machine. Exits 1, naming each, when a diagram falls back or its timing is not a
// finite number >= 0; 1 when p90 is over ceiling(process.env); and 2, after its usage, when there is no diagram to
// time.
import { readdirSync, readFileSync } from 'node:fs'
import { cpus } from 'node:os'
import { basename, join } from 'node:path'
import { parseArgs } from 'node:util'
import { isFail } from '../core/fail.ts'
import { explain } from '../core/render.ts'
import { splitFences } from '../hooks/fences.ts'
import { isMain } from './lib/is-main.ts'

// The nearest-rank p-th percentile of xs, for p in [0, 100]: the ceil(p/100 · n)-th smallest sample, or the smallest
// when p is 0. It sorts a copy, so xs is left as it was. No samples have no percentile, so an empty xs throws a
// RangeError: NaN or undefined would compare as under any ceiling, and a run that timed nothing would pass. p · n is
// multiplied before the division by 100, so a whole rank stays whole: 7 / 100 · 100 is 7.000000000000001.
export function percentile(xs: readonly number[], p: number): number {
  if (xs.length === 0) {
    throw new RangeError('percentile: no samples')
  }

  const s = xs.toSorted((a, b) => a - b)
  return s[Math.max(0, Math.ceil((p * s.length) / 100) - 1)]!
}

// The p90 ceiling in ms: BENCH_P90_MS when it is set; otherwise 200 in CI and 50 on the reference Mac. A BENCH_P90_MS
// that is not a positive finite number throws a RangeError: NaN would compare as over no p90, and the benchmark would
// always pass.
export function ceiling(env: Record<string, string | undefined>): number {
  const v = Number(env.BENCH_P90_MS ?? (env.CI ? 200 : 50))
  if (!Number.isFinite(v) || v <= 0) {
    throw new RangeError(`BENCH_P90_MS must be a positive number of ms, not ${JSON.stringify(env.BENCH_P90_MS)}`)
  }

  return v
}

// The paths of the files under dir, at any depth, whose names end in ext.
const files = (dir: string, ext: string): string[] =>
  readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith(ext))
    .map((f) => join(dir, f))

// A diagram to time: its source, and the name a failure reports it by.
export type Diagram = { name: string; src: string }

// The diagrams to time: each .mmd under the dirs whose file name lacks -reject-, named by its path; then the body of
// each closed mermaid fence in the .md files under privateDir, the K-th fence of FILE named FILE#K. A reject fixture
// falls back by design, so it is no render to time.
export function diagrams(dirs: readonly string[], privateDir?: string): Diagram[] {
  const mmd = dirs.flatMap((d) => files(d, '.mmd')).filter((f) => !basename(f).includes('-reject-'))
  const md = privateDir === undefined ? [] : files(privateDir, '.md')
  return [
    ...mmd.map((f) => ({ name: f, src: readFileSync(f, 'utf8') })),
    ...md.flatMap((f) =>
      splitFences(readFileSync(f, 'utf8'))
        .flatMap((s) => (s.kind === 'mermaid' ? [s.body] : []))
        .map((src, i) => ({ name: `${f}#${i + 1}`, src })),
    ),
  ]
}

// Each diagram's time: the mean ms of 20 cold render calls at 80 columns. render is explain, which caches nothing, so
// each call parses, lays out and draws the source anew; a test injects render, and the clock now. performance.now
// throws when called unbound, so the default clock calls it on performance. A diagram that falls back drew nothing, and
// a timing that is not a finite number >= 0 measured nothing: either is an error, named, and gets no timing. So every
// timing is finite and >= 0, and so are p50 and p90, which are timings.
export function timeAll(
  ds: readonly Diagram[],
  render: typeof explain = explain,
  now: () => number = () => performance.now(),
): { ms: number[]; errors: string[] } {
  const ms: number[] = []
  const errors: string[] = []
  for (const d of ds) {
    let r: unknown
    const t0 = now()
    for (let i = 0; i < 20; i++) {
      r = render(d.src, { columns: 80, theme: 'default' })
    }

    const mean = (now() - t0) / 20
    if (isFail(r)) {
      errors.push(`${d.name}: falls back (${r.reason})`)
    } else if (!Number.isFinite(mean) || mean < 0) {
      errors.push(`${d.name}: timing ${mean} ms is not a finite number >= 0`)
    } else {
      ms.push(mean)
    }
  }

  return { ms, errors }
}

function main(argv: string[] = process.argv.slice(2)): number {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { private: { type: 'string' } },
    allowPositionals: true,
  })
  const ds = diagrams(positionals, values.private)
  if (ds.length === 0) {
    console.error('usage: node scripts/bench.ts DIR... [--private DIR] (no diagram to time)')
    return 2
  }

  const { ms, errors } = timeAll(ds)
  for (const e of errors) {
    console.error(`bench: ${e}`)
  }

  if (errors.length > 0) {
    return 1
  }

  const p50 = percentile(ms, 50)
  const p90 = percentile(ms, 90)
  const max = ceiling(process.env)
  console.log(`bench: n=${ms.length} p50=${p50.toFixed(2)} ms p90=${p90.toFixed(2)} ms`)
  console.log(`bench: cpu ${cpus()[0]?.model ?? 'unknown'}, node ${process.version}, ${process.platform}`)
  if (p90 > max) {
    console.error(`bench: p90 ${p90.toFixed(2)} ms is over the ${max} ms ceiling`)
    return 1
  }

  return 0
}

// main() runs only when node runs this file, not when a test imports it.
if (isMain(import.meta)) {
  process.exitCode = main()
}
