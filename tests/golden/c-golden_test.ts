// tests/golden/c-golden_test.ts — C's golden harness (plan C T48): each gated type's fixtures render, validate and match
// their goldens, take their expected ladder steps and are cited by the matrix's Coverage rows; then the harness's self-tests.
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'; import { tmpdir } from 'node:os'; import { explain } from '../../core/render.ts'; import { createCanvas } from '../../core/canvas.ts'
import { TIER1, TIER2_PASSED } from '../../core/registry.ts'; import { goldenOf, goldenGlyphs, widest, roleCode } from './golden-lib.ts'
import { GATED_DIRS, LADDER, expectLines, fx, borderRows, unlistedFrames, coverageOf, spanOf, hrun, vrun } from './c-lib.ts'
const W = [60, 80, 120], X = (s: string, w: number) => explain(s, { columns: w, theme: 'mono' }) as any
const MATRIX = readFileSync('docs/specs/2026-10-27-mermaid-tty-v1-diagram-matrix.md', 'utf8')
for (const type of GATED_DIRS.filter(t => existsSync(`fixtures/${t}`))) {
  const ids = readdirSync(`fixtures/${type}`).filter(f => f.endsWith('.mmd')).map(f => f.slice(0, -4)).sort()
  test(`A5: ${type} coverage rows cite exactly its fixtures, and each ladder fixture's expect lines cover exactly its LADDER widths`, () => {
    assert.deepEqual(coverageOf(MATRIX, type, ids), [])
    for (const [id, widths] of Object.entries(LADDER).filter(([k]) => k.startsWith(`${type}-`))) { assert.ok(ids.includes(id), id)
      assert.deepEqual([...new Set(expectLines(fx(id)).map(e => e.cols))].sort((a, b) => a - b), widths, id) }
  })
  for (const id of ids) {
    const src = fx(id), lines = expectLines(src)
    if (id.includes('-reject-')) { test(`A5.errors: ${id} falls back`, () => {
      for (const e of lines.length ? lines : W.map(cols => ({ cols, step: 'fallback' as const }))) {
        const r = X(src, e.cols); if (e.step === 'fallback') assert.ok('reason' in r, `${id}@${e.cols}`); else assert.equal(r.step, e.step, `${id}@${e.cols}`) }
    }); continue }
    test(`A4: ${id} renders, validates and matches its golden at 60/80/120, with no border-only rows and every frame listed`, () => {
      const g = goldenOf(W.map(w => { const r = X(src, w); assert.ok(!('reason' in r), `${id}@${w} ${r.reason}`)
        assert.deepEqual([...borderRows(r.drawing), ...unlistedFrames(r.drawing)], [], `${id}@${w}`); return [w, r.drawing] as const }))
      const p = join('goldens', type, `${id}.golden`)
      if (process.env.UPDATE_GOLDEN === '1') { mkdirSync(join('goldens', type), { recursive: true }); writeFileSync(p, g) }
      assert.equal(g, readFileSync(p, 'utf8'))
    })
    if (lines.length) test(`A4.fit-ladder: ${id} takes its expected step at each width`, () => {
      for (const e of lines) { const r = X(src, e.cols)
        if (e.step === 'fallback') { assert.ok('reason' in r, `${id}@${e.cols}`); continue }
        assert.equal(r.step, e.step, `${id}@${e.cols}`); if (e.widest !== undefined) assert.equal(widest(r.drawing), e.widest, `${id}@${e.cols}`) }
    })
  }
}
test('A4.fit-ladder: expect lines parse', () => assert.deepEqual(expectLines('pie\n%% expect 60 natural widest 60\n%% expect 59 wrap\n%% expect 58 fallback\n"a" : 1'),
  [{ cols: 60, step: 'natural', widest: 60 }, { cols: 59, step: 'wrap' }, { cols: 58, step: 'fallback' }]))
test('A3: borderRows flags an item row with caps and no text; glyph-only owners pass', () => {
  const c = createCanvas(2, 6, 6); c.cap(0, 0, '[', 'node', 'A'); c.text(0, 2, 'x', 'node', 'A'); c.cap(1, 0, '[', 'node', 'A'); c.cap(1, 3, '●', 'node', 'S')
  assert.deepEqual(borderRows(c.toDrawing({ labels: [{ owner: 'A', text: 'x' }], edges: [], edgeLabels: [], frames: [] })), ['A@1'])
})
test('A3: unlistedFrames names a frame owner that expect.frames does not list', () => {
  const c = createCanvas(3, 4, 4), e = { labels: [], edges: [], edgeLabels: [], frames: [] as string[] }; c.frame(0, 0, 2, 3, 'frame', 'S')
  assert.deepEqual(unlistedFrames(c.toDrawing(e)), ['S']); assert.deepEqual(unlistedFrames(c.toDrawing({ ...e, frames: ['S'] })), [])
})
test('A5: coverageOf finds missing, uncited and empty rows, and a type with no rows', () => {
  assert.deepEqual(coverageOf('## Coverage\n| pie | x | pie-ok-01, pie-reject-09 |\n| pie | y |  |', 'pie', ['pie-ok-01', 'pie-ok-02', 'pie-reject-01']),
    ['empty: y', 'missing pie-reject-09', 'uncited pie-ok-02'])
  assert.deepEqual(coverageOf('## Coverage\n| pie | x | pie-ok-01 |', 'gantt', ['gantt-ok-01']), ['no rows: gantt'])
})
test("VR.reviewers: vr-A covers only A's goldens and the themes", () => assert.deepEqual(JSON.parse(readFileSync('docs/reviews/required.json', 'utf8'))['vr-A'],
  ['goldens/flowchart/**', 'goldens/sequence/**', 'core/themes.ts']))
// goldenGlyphs on one golden holding content, each flag as 'line ch'. Its temp dir is removed after.
function scanGolden(content: string): string[] {
  const dir = mkdtempSync(join(tmpdir(), 'cg-')), p = join(dir, 'x.golden')
  try { writeFileSync(p, content); return goldenGlyphs(dir).map(s => s.slice(p.length + 1)) } finally { rmSync(dir, { recursive: true, force: true }) }
}
test('A8.platforms: series source text codes as !@#$%^&*, a drawn series cell as 1–8, and the glyph scan skips source text', () => {
  const cell = (role: any, kind: any) => ({ ch: 'x', role, kind, owners: ['x'], dirs: 0 })
  assert.deepEqual([cell('value', 'text'), cell('value', 'cap'), cell('s1', 'text'), cell('s8', 'text'), cell('s2', 'cap'), cell('note', 'key')].map(roleCode),
    ['V', 'v', '!', '*', '2', 'o'])
  assert.deepEqual(scanGolden('@80\n中文 █\n@80 roles\n!~!~ 1\n'), [])
})
// A combining mark joins the series text cell before it, so it is source text too; ß on a drawn series cell is still flagged.
test('A8.platforms: the glyph scan skips a combining mark in series source text', () =>
  assert.deepEqual(scanGolden('@80\néx ß\n@80 roles\n!! 3\n'), ['2 ß']))
// The rest of c-lib: a fill row, an escaped | in a feature, the gated types, the fixture path, spans and bar runs.
const E = { labels: [], edges: [], edgeLabels: [], frames: [] }
test('A3: borderRows flags a fill row with no text too', () => {
  const c = createCanvas(2, 4, 4); c.text(0, 0, 'x', 'node', 'A'); c.fill(1, 0, 3, 'node', 'A')
  assert.deepEqual(borderRows(c.toDrawing(E)), ['A@1'])
})
test('A5: coverageOf splits cells at unescaped pipes only', () => assert.deepEqual(
  coverageOf('## Coverage\n| class | relation `<\\|--` |  |\n| class | b | class-ok-01 |', 'class', ['class-ok-01']), ['empty: relation `<\\|--`']))
test('A5: GATED_DIRS is Tier 1 then the passed Tier 2 types, each with Coverage rows under its folder name', () => {
  assert.deepEqual(GATED_DIRS, [...TIER1, ...TIER2_PASSED])
  for (const t of GATED_DIRS) assert.ok(!coverageOf(MATRIX, t, []).includes(`no rows: ${t}`), t)
})
test('A5: fx reads a fixture from its type folder', () =>
  assert.equal(fx('flowchart-reject-04'), readFileSync('fixtures/flowchart/flowchart-reject-04.mmd', 'utf8')))
test('A7: spanOf finds the first span whose text matches, in reading order', () => {
  const rows = [[{ text: 'a' }, { text: 'Total 3' }], [{ text: 'Total 4' }]] as any
  assert.equal(spanOf(rows, /Total/), rows[0][1]); assert.equal(spanOf(rows, /4/), rows[1][0]); assert.equal(spanOf(rows, /z/), undefined)
})
test('A3: hrun sums the eighths of consecutive ▏…█ caps rightward; vrun those of ▁…█ caps upward from base − 1', () => {
  const c = createCanvas(3, 5, 5); c.cap(0, 0, '██▌▁', 'value', 'b'); c.text(0, 4, '█', 'value', 'T')
  c.cap(1, 0, '▏', 'value', 'b'); c.cap(1, 4, '▃', 'value', 'v'); c.cap(2, 4, '█', 'value', 'v')
  const d = c.toDrawing(E)   // a text █ and a cap of the other axis end a run
  assert.deepEqual([hrun(d, 0, 0), hrun(d, 0, 2), hrun(d, 1, 0), hrun(d, 0, 3), hrun(d, 0, 4), hrun(d, 2, 0)], [20, 4, 1, 0, 0, 0])
  assert.deepEqual([vrun(d, 4, 3), vrun(d, 4, 2), vrun(d, 0, 1), vrun(d, 2, 1)], [11, 3, 8, 0])
})
