import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseRecord, checkRecords, requirePass, expandGlobs, type ReviewRecord } from '../../scripts/check-review-hashes.ts'

const sha = (s: string | Uint8Array) => createHash('sha256').update(s).digest('hex')
const REC = `---\nscope: vr-A\nverdict: pass\ndate: 2026-11-02\nreviewers: [PM, cross-family:gpt-6]\n---\n## Files\n| path | sha256 |\n|---|---|\n| goldens/a.golden | ${sha('A')} |\n## Notes\n- ok\n`

test('VR.reviewers: records parse; hashes match; a changed or missing file fails', () => {
  const r = parseRecord('docs/reviews/x.md', REC) as any; assert.deepEqual(r.files, [{ path: 'goldens/a.golden', sha256: sha('A') }])
  assert.deepEqual(checkRecords([r], p => (p === 'goldens/a.golden' ? 'A' : null)), [])
  assert.match(checkRecords([r], () => 'B')[0]!, /goldens\/a\.golden: recorded \w+ actual \w+/)
  assert.match(checkRecords([r], () => null)[0]!, /missing/)
  assert.ok('error' in (parseRecord('y.md', REC.replace('verdict: pass', 'verdict: maybe')) as object))
})
test('VR.passes: every required scope needs a passing record for each of its paths', () =>
  assert.deepEqual(requirePass([parseRecord('x.md', REC) as any], { 'vr-A': ['goldens/a.golden', 'core/themes.ts'], beauty: ['README.md'] }), ['vr-A: core/themes.ts', 'beauty: README.md']))

// The record REC parses to, as found at path.
const parsed = (path: string): ReviewRecord =>
  ({ path, scope: 'vr-A', verdict: 'pass', date: '2026-11-02', reviewers: ['PM', 'cross-family:gpt-6'], files: [{ path: 'goldens/a.golden', sha256: sha('A') }] })

test('VR.reviewers: a CRLF record parses as its LF twin, but each reviewed file hashes by its raw bytes, CR included', () => {
  assert.deepEqual(parseRecord('docs/reviews/x.md', REC), parsed('docs/reviews/x.md'))
  assert.deepEqual(parseRecord('docs/reviews/x.md', REC.replaceAll('\n', '\r\n')), parsed('docs/reviews/x.md'))
  const crlf = parseRecord('c.md', REC.replace(sha('A'), sha('A\r\n'))) as ReviewRecord
  assert.deepEqual(checkRecords([crlf], () => Buffer.from('A\r\n')), [])
  assert.deepEqual(checkRecords([crlf], () => Buffer.from('A\n')), [`goldens/a.golden: recorded ${sha('A\r\n')} actual ${sha('A\n')}`])
})

// REC with its front matter lines replaced by lines.
const withFront = (...lines: string[]) => REC.replace(/^---\n[\s\S]*?\n---\n/, () => `---\n${lines.join('\n')}\n---\n`)
const FRONT = ['scope: vr-A', 'verdict: pass', 'date: 2026-11-02', 'reviewers: [PM, cross-family:gpt-6]']

test('VR.reviewers: front matter has exactly the keys scope, verdict, date and reviewers, once each, between --- lines', () => {
  assert.deepEqual(parseRecord('r.md', withFront(...FRONT)), parsed('r.md'))
  const keys = (got: string[]) => ({ error: `r.md: front matter keys must be exactly scope, verdict, date, reviewers; got ${JSON.stringify(got)}` })
  assert.deepEqual(parseRecord('r.md', withFront(...FRONT.filter(l => !l.startsWith('date:')))), keys(['scope', 'verdict', 'reviewers']))
  assert.deepEqual(parseRecord('r.md', withFront(...FRONT, 'notes: x')), keys(['scope', 'verdict', 'date', 'reviewers', 'notes']))
  assert.deepEqual(parseRecord('r.md', withFront(...FRONT, 'scope: vr-B')), keys(['scope', 'verdict', 'date', 'reviewers', 'scope']))
  assert.deepEqual(parseRecord('r.md', withFront(...FRONT.slice(0, 3), 'reviewer: [PM]')), keys(['scope', 'verdict', 'date', 'reviewer']))
  assert.deepEqual(parseRecord('r.md', withFront('scope vr-A', ...FRONT.slice(1))), { error: 'r.md: bad front matter line "scope vr-A"' })
  for (const text of [REC.slice('---\n'.length), REC.replace('\n---\n## Files', '\n## Files')])
    assert.deepEqual(parseRecord('r.md', text), { error: 'r.md: no front matter between --- lines' })
})

test('VR.reviewers: scope is a slug, verdict pass or fail, date a real YYYY-MM-DD, reviewers a [list] of names, none empty', () => {
  const at = (key: string, value: string) => parseRecord('r.md', withFront(...FRONT.map(l => (l.startsWith(`${key}:`) ? `${key}: ${value}` : l))))
  const bad = (key: string, value: string) => ({ error: `r.md: bad ${key} ${JSON.stringify(value)}` })
  for (const scope of ['vr-C-flowchart', 'beauty', 'translation']) assert.equal((at('scope', scope) as ReviewRecord).scope, scope)
  for (const scope of ['vr A', 'vr_A', '-vr', 'vr-A-', 'vr--A', '']) assert.deepEqual(at('scope', scope), bad('scope', scope))
  assert.equal((at('verdict', 'fail') as ReviewRecord).verdict, 'fail')
  for (const verdict of ['Pass', 'passed', 'FAIL', '']) assert.deepEqual(at('verdict', verdict), bad('verdict', verdict))
  assert.equal((at('date', '2028-02-29') as ReviewRecord).date, '2028-02-29')
  for (const date of ['2026-11-2', '26-11-02', '2026-02-30', '2027-02-29', '2026-13-01', '2026-00-10', '2026-11-02x', 'x2026-11-02'])
    assert.deepEqual(at('date', date), bad('date', date))
  assert.deepEqual((at('reviewers', '[PM, cross-family:gemini-3.5]') as ReviewRecord).reviewers, ['PM', 'cross-family:gemini-3.5'])
  for (const reviewers of ['[]', '[ ]', 'PM', '[PM', 'PM]', '[PM,]', '[PM, , gpt-6]', '[,PM]'])
    assert.deepEqual(at('reviewers', reviewers), bad('reviewers', reviewers))
})

// The acceptance doc: the PM inspects the PNGs; a cross-family reviewer, cross-family:<model id> with an id of
// word characters, dots and dashes, inspects the text and the role map.
test('VR.reviewers: vr-A reviewers include PM and a cross-family:<model id>', () => {
  const at = (reviewers: string) => parseRecord('r.md', withFront(...FRONT.slice(0, 3), `reviewers: ${reviewers}`))
  assert.deepEqual((at('[PM, cross-family:gpt-6-astra]') as ReviewRecord).reviewers, ['PM', 'cross-family:gpt-6-astra'])
  for (const reviewers of ['[PM]', '[cross-family:gpt-6]', '[PM, cross-family:]', '[pm, cross-family:gpt-6]', '[PM, xcross-family:gpt-6]', '[PM, cross-family:gpt 6]'])
    assert.deepEqual(at(reviewers), { error: `r.md: reviewers must include PM and a cross-family:<model id>; got ${JSON.stringify(reviewers)}` })
})

// Beauty is the PM's review of the rendered GitHub page, alone; translation and every vr-* scope need a cross-family reviewer too.
test('VR.reviewers: PM always; only beauty may omit a cross-family reviewer', () => {
  const at = (scope: string, reviewers: string) => parseRecord('r.md', withFront(`scope: ${scope}`, ...FRONT.slice(1, 3), `reviewers: ${reviewers}`))
  assert.deepEqual((at('beauty', '[PM]') as ReviewRecord).reviewers, ['PM'])
  assert.deepEqual(at('beauty', '[cross-family:gpt-6]'), { error: 'r.md: reviewers must include PM; got "[cross-family:gpt-6]"' })
  for (const scope of ['translation', 'vr-A'])
    assert.deepEqual(at(scope, '[PM]'), { error: 'r.md: reviewers must include PM and a cross-family:<model id>; got "[PM]"' })
})

// REC with its one Files row replaced by rows.
const ROW = `| goldens/a.golden | ${sha('A')} |`
const withRows = (...rows: string[]) => REC.replace(ROW, () => rows.join('\n'))

test('VR.reviewers: ## Files is a | path | sha256 | table whose rows each hold a path and 64 lowercase hex; any other line fails', () => {
  assert.deepEqual((parseRecord('r.md', withRows(ROW, `|  core/themes.ts  |  ${sha('T')}  |`)) as ReviewRecord).files,
    [{ path: 'goldens/a.golden', sha256: sha('A') }, { path: 'core/themes.ts', sha256: sha('T') }])
  for (const row of [`| goldens/a.golden | ${sha('A').toUpperCase()} |`, `| goldens/a.golden | ${sha('A').slice(1)} |`, `| goldens/a.golden | ${sha('A')}0 |`,
    `|  | ${sha('A')} |`, `| goldens/a.golden | ${sha('A')} | x |`, '| goldens/a.golden |', 'goldens/a.golden was reviewed too'])
    assert.deepEqual(parseRecord('r.md', withRows(ROW, row)), { error: `r.md: bad Files row ${JSON.stringify(row)}` })
  const table = { error: 'r.md: the Files table must start with | path | sha256 | and a |---|---| row' }
  for (const text of [REC.replace('| path | sha256 |\n', ''), REC.replace('|---|---|\n', ''), REC.replace('| path |', '| file |')])
    assert.deepEqual(parseRecord('r.md', text), table)
  assert.deepEqual(parseRecord('r.md', REC.replace('## Files', '## Reviewed')), { error: 'r.md: no ## Files table' })
})

test('VR.passes: a fail verdict, or a pass of another scope, never satisfies requirePass', () => {
  const pass = parseRecord('p.md', REC) as ReviewRecord
  const failed: ReviewRecord = { ...pass, verdict: 'fail' }, beauty: ReviewRecord = { ...pass, scope: 'beauty' }
  assert.deepEqual(requirePass([failed, beauty], { 'vr-A': ['goldens/a.golden'] }), ['vr-A: goldens/a.golden'])
  assert.deepEqual(requirePass([failed, pass], { 'vr-A': ['goldens/a.golden'] }), [])
})

// A fresh temp dir holding files, each a '/'-separated path and its bytes; removed after the test.
function tree(t: TestContext, files: Record<string, string | Uint8Array>): string {
  const dir = mkdtempSync(join(tmpdir(), 'mtty-reviews-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  for (const [path, bytes] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), bytes)
  }
  return dir
}

test('VR.passes: a required glob is a path, present or not, or <dir>/** for every file under dir, sorted; an absent dir has none', t => {
  const dir = tree(t, { 'goldens/b.golden': 'b', 'goldens/a.golden': 'a', 'goldens/flowchart/c.golden': 'c', 'goldensx/d.golden': 'd', 'core/themes.ts': 't' })
  assert.deepEqual(expandGlobs(['goldens/**', 'core/themes.ts', 'gone/**', 'README.md'], dir),
    ['goldens/a.golden', 'goldens/b.golden', 'goldens/flowchart/c.golden', 'core/themes.ts', 'README.md'])
  assert.throws(() => expandGlobs(['goldens/*.golden'], dir), { message: 'unsupported glob "goldens/*.golden": use a path or <dir>/**' })
})

// The seed: vr-A needs a passing record for every golden and for the palettes. Plan B adds its scopes here.
test('VR.passes: docs/reviews/required.json requires a vr-A pass for every golden and for core/themes.ts', () =>
  assert.deepEqual(JSON.parse(readFileSync(fileURLToPath(new URL('../../docs/reviews/required.json', import.meta.url)), 'utf8')),
    { 'vr-A': ['goldens/**', 'core/themes.ts'] }))

const SCRIPT = fileURLToPath(new URL('../../scripts/check-review-hashes.ts', import.meta.url))
// The CLI, run with args in cwd.
const cli = (cwd: string, ...args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' })
// A record of scope and verdict listing rows, each [path, sha256].
const record = (scope: string, verdict: string, rows: [string, string][]) =>
  `---\nscope: ${scope}\nverdict: ${verdict}\ndate: 2026-11-02\nreviewers: [PM, cross-family:gpt-6]\n---\n## Files\n| path | sha256 |\n|---|---|\n${rows.map(([p, h]) => `| ${p} | ${h} |\n`).join('')}`

test('VR.reviewers: the CLI exits 1 naming each changed or missing file and each record that does not parse; the others are still checked', t => {
  const dir = tree(t, {
    'goldens/a.golden': 'A\r\n', 'goldens/b.golden': 'B2', 'docs/reviews/notes.md': '# Notes\n',
    'docs/reviews/2026-11-02-vr-A.md': record('vr-A', 'pass', [['goldens/a.golden', sha('A\r\n')], ['goldens/b.golden', sha('B')], ['goldens/c.golden', sha('C')]]),
  })
  const r = cli(dir)
  assert.deepEqual([r.status, r.stdout, r.stderr], [1, '', ['docs/reviews/notes.md: no front matter between --- lines',
    `goldens/b.golden: recorded ${sha('B')} actual ${sha('B2')}`, 'goldens/c.golden: missing', ''].join('\n')])
})

test('VR.reviewers: with no docs/reviews folder, or no records in it, the CLI passes vacuously and exits 0', t => {
  for (const dir of [tree(t, {}), tree(t, { 'docs/reviews/required.json': '{}' })]) {
    const r = cli(dir)
    assert.deepEqual([r.status, r.stdout, r.stderr], [0, 'check-review-hashes: 0 record(s); every reviewed file matches its SHA-256\n', ''])
  }
})

test('VR.passes: --require-pass exits 1 naming each required path that no passing record lists, and 0 once one lists them all', t => {
  const dir = tree(t, {
    'docs/reviews/required.json': JSON.stringify({ 'vr-A': ['goldens/**', 'core/themes.ts'] }),
    'goldens/a.golden': 'A', 'goldens/flowchart/b.golden': 'B', 'core/themes.ts': 'T',
  })
  const none = cli(dir, '--require-pass')
  assert.deepEqual([none.status, none.stdout, none.stderr], [1, '', ['vr-A: goldens/a.golden: no passing verdict',
    'vr-A: goldens/flowchart/b.golden: no passing verdict', 'vr-A: core/themes.ts: no passing verdict', ''].join('\n')])
  writeFileSync(join(dir, 'docs/reviews/2026-11-02-vr-A.md'),
    record('vr-A', 'pass', [['goldens/a.golden', sha('A')], ['goldens/flowchart/b.golden', sha('B')], ['core/themes.ts', sha('T')]]))
  const all = cli(dir, '--require-pass')
  assert.deepEqual([all.status, all.stdout, all.stderr],
    [0, 'check-review-hashes: 1 record(s); every reviewed file matches its SHA-256; every required path has a passing verdict\n', ''])
})

test('VR.reviewers: --table prints a Files row for each file at or under each path, sorted, hashing raw bytes; a path with no files fails', t => {
  const crlf = Buffer.from('flow\r\nchart\r\n'), latin1 = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a])
  const dir = tree(t, { 'goldens/z.golden': latin1, 'goldens/flowchart/b.golden': crlf, 'core/themes.ts': 'T\n' })
  const r = cli(dir, '--table', 'goldens/', './core/themes.ts')
  assert.deepEqual([r.status, r.stdout, r.stderr], [0, [`| core/themes.ts | ${sha('T\n')} |`, `| goldens/flowchart/b.golden | ${sha(crlf)} |`,
    `| goldens/z.golden | ${sha(latin1)} |`, ''].join('\n'), ''])
  const gone = cli(dir, '--table', 'gone')
  assert.deepEqual([gone.status, gone.stdout, gone.stderr], [1, '', 'gone: no files\n'])
})

test('VR.passes: an unknown or extra argument exits 1 with usage, so a mistyped --require-pass cannot skip the pass check', t => {
  const dir = tree(t, {})
  for (const args of [['--require-passs'], ['--require-pass', 'x'], ['--table-x'], ['-r']]) {
    const r = cli(dir, ...args)
    assert.deepEqual([r.status, r.stdout, r.stderr], [1, '', 'usage: node scripts/check-review-hashes.ts [--require-pass | --table <path>...]\n'], args.join(' '))
  }
})
