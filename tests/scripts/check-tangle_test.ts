// check-tangle.ts: report(label, blocks, show) runs the tangle check on each block at 60, 80 and 120 columns, then
// lists each
// hit, each id that hit, or only the counts. The CLI reports the goldens, adds --corpus and --private DIR, and exits 1
// on any hit.
import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isFail } from '../../core/fail.ts'
import { explain } from '../../core/render.ts'
import { corpus, fences, fixtures, main, report } from '../../scripts/check-tangle.ts'
import { TIER1 } from '../../core/registry.ts'

const SCRIPT = fileURLToPath(new URL('../../scripts/check-tangle.ts', import.meta.url))
const run = (...args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' })
const CLEAN = 'flowchart TD\nA -->|yes| B\n'
// A private note whose one block names SECRET.
const NOTE = ['```mermaid', 'flowchart TD', 'SECRET --> B', '```'].join('\n')

// A fresh temp dir, removed after the test.
function tmp(t: TestContext): string {
  const d = mkdtempSync(join(tmpdir(), 'mermaid-tty-tangle-'))
  t.after(() => rmSync(d, { recursive: true, force: true }))
  return d
}
// explain with every arrow cell wiped: each edge keeps its end marks in expect but loses its head, so ambiguous-head
// fires.
const headless: typeof explain = (s, o) => {
  const r = explain(s, o)
  if (!isFail(r)) {
    for (const row of r.drawing.cells) {
      row.forEach((x, i) => {
        if (x?.kind === 'arrow') {
          row[i] = null
        }
      })
    }
  }

  return r
}
const blocks = [
  { id: 'one', source: CLEAN },
  { id: 'prose', source: 'not a diagram' },
  { id: 'two', source: CLEAN },
]

test('VR.tangled: report lists each hit as <id>@<cols> <rule> at 60, 80 and 120 columns, skipping a width that does not draw', () => {
  assert.deepEqual(report('check-tangle', blocks, 'hits'), {
    lines: ['check-tangle: 3 blocks, 0 hits at 60, 80 and 120 columns'],
    hits: 0,
  })
  assert.deepEqual(report('check-tangle', blocks.slice(0, 2), 'hits', headless), {
    hits: 3,
    lines: [
      'check-tangle: 2 blocks, 3 hits at 60, 80 and 120 columns',
      '  one@60 ambiguous-head',
      '  one@80 ambiguous-head',
      '  one@120 ambiguous-head',
    ],
  })
})

test('VR.tangled: report lists each id that hit, once, for --corpus, and only the counts for --private', () => {
  assert.deepEqual(report('check-tangle --corpus', blocks, 'ids', headless), {
    hits: 6,
    lines: ['check-tangle --corpus: 3 blocks, 6 hits at 60, 80 and 120 columns', '  one', '  two'],
  })
  assert.deepEqual(report('check-tangle --private', blocks, 'counts', headless), {
    hits: 6,
    lines: ['check-tangle --private: 3 blocks, 6 hits at 60, 80 and 120 columns'],
  })
})

test('VR.tangled: report with types adds <type>: <n> ok after the counts, n the blocks of that type with no hit, then each hit', () => {
  const typed = [
    { id: 'pie-ok-01', source: CLEAN },
    { id: 'pie-ok-02', source: 'not a diagram' },
    { id: 'flowchart-ok-01', source: CLEAN },
  ]
  assert.deepEqual(report('check-tangle', typed, 'types', headless), {
    hits: 6,
    lines: [
      'check-tangle: 3 blocks, 6 hits at 60, 80 and 120 columns',
      'pie: 1 ok',
      'flowchart: 0 ok',
      '  pie-ok-01@60 ambiguous-head',
      '  pie-ok-01@80 ambiguous-head',
      '  pie-ok-01@120 ambiguous-head',
      '  flowchart-ok-01@60 ambiguous-head',
      '  flowchart-ok-01@80 ambiguous-head',
      '  flowchart-ok-01@120 ambiguous-head',
    ],
  })
})

test('VR.tangled: the goldens are the -ok- fixtures of every fixtures/ folder but corpus; --corpus reads fixtures/corpus/*.mmd', () => {
  const ids = fixtures().map((b) => b.id)
  for (const t of ['flowchart', 'sequence', ...TIER1]) {
    assert.ok(ids.includes(`${t}-ok-01`), t)
  }

  assert.deepEqual(
    ids.filter((id) => !/^[A-Za-z]+-ok-\d+$/.test(id) || id.startsWith('corpus-')),
    [],
  )
  assert.ok(corpus().length > 0 && corpus().every((b) => /^corpus-\d+$/.test(b.id)))
})

test('VR.tangled: --private reads every closed mermaid fence of the .md files under DIR, at any depth', (t) => {
  const d = tmp(t)
  mkdirSync(join(d, 'sub'))
  const fence = (info: string, body: string) => ['```' + info, body, '```'].join('\n')
  writeFileSync(
    join(d, 'a.md'),
    ['# A', fence('mermaid', 'flowchart TD\nA --> B'), fence('js', 'x()'), '```mermaid', 'open'].join('\n'),
  )
  writeFileSync(join(d, 'sub', 'b.md'), fence('mermaid', 'flowchart LR\nC --> D'))
  writeFileSync(join(d, 'c.mmd'), CLEAN)
  assert.deepEqual(
    fences(d).map((b) => b.source),
    ['flowchart TD\nA --> B', 'flowchart LR\nC --> D'],
  )
})

test("VR.tangled: no golden is tangled: the CLI prints the goldens' counts, then <type>: <n> ok per type, and exits 0", () => {
  const r = run()
  const types = [...new Set(fixtures().map((b) => b.id.slice(0, b.id.indexOf('-'))))]
  assert.equal(
    r.stdout,
    [
      `check-tangle: ${fixtures().length} blocks, 0 hits at 60, 80 and 120 columns`,
      ...types.map((t) => `${t}: ${fixtures().filter((b) => b.id.startsWith(`${t}-`)).length} ok`),
    ]
      .map((l) => `${l}\n`)
      .join(''),
  )
  assert.equal(r.stderr, '')
  assert.equal(r.status, 0)
})

test("VR.tangled: --corpus adds the corpus's counts and the ids that hit; --private DIR adds only its counts", (t) => {
  const d = tmp(t)
  writeFileSync(join(d, 'n.md'), NOTE)
  const r = run('--private', d, '--corpus')
  const want = [
    report('check-tangle', fixtures(), 'types'),
    report('check-tangle --corpus', corpus(), 'ids'),
    report('check-tangle --private', fences(d), 'counts'),
  ]
  assert.equal(
    r.stdout,
    want
      .flatMap((w) => w.lines)
      .map((l) => `${l}\n`)
      .join(''),
  )
  assert.ok(!r.stdout.includes('SECRET') && !r.stdout.includes(d))
  assert.equal(r.stderr, '')
  assert.equal(r.status, want.some((w) => w.hits > 0) ? 1 : 0)
})

test('VR.tangled: main exits 1 on any hit, and --private DIR still names no file and quotes no block', (t) => {
  const d = tmp(t)
  const out: string[] = []
  writeFileSync(join(d, 'n.md'), NOTE)
  t.mock.method(console, 'log', (s: string) => void out.push(s))
  assert.equal(main(['--private', d], headless), 1)
  assert.equal(out.at(-1), 'check-tangle --private: 1 block, 3 hits at 60, 80 and 120 columns')
  assert.ok(!out.some((l) => l.includes('SECRET') || l.includes(d)))
})

test('VR.tangled: the CLI refuses an unknown argument, or --private with no DIR, with its usage and exit 2', () => {
  for (const args of [['--nope'], ['--private'], ['--private', '--corpus'], ['--corpus', 'extra']]) {
    const r = run(...args)
    assert.equal(r.status, 2, args.join(' '))
    assert.equal(r.stdout, '')
    assert.match(r.stderr, /^usage: node scripts\/check-tangle\.ts \[--corpus\] \[--private DIR\]\n$/)
  }
})
