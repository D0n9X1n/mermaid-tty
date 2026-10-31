// tests/golden/c-golden_test.ts — the golden harness for the gated types: each fixture renders, validates and matches
// its golden, and takes its expected fit-ladder steps; then the harness's self-tests.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { explain } from '../../core/render.ts'
import { createCanvas } from '../../core/canvas.ts'
import { TIER1, TIER2_PASSED } from '../../core/registry.ts'
import { goldenOf, goldenGlyphs, widest, roleCode } from './golden-lib.ts'
import {
  GATED_DIRS,
  LADDER,
  expectLines,
  fx,
  borderRows,
  unlistedFrames,
  drawingFaults,
  spanOf,
  hrun,
  vrun,
} from './c-lib.ts'
const W = [60, 80, 120]
const X = (s: string, w: number) => explain(s, { columns: w, theme: 'mono' }) as any
for (const type of GATED_DIRS.filter((t) => existsSync(`fixtures/${t}`))) {
  const ids = readdirSync(`fixtures/${type}`)
    .filter((f) => f.endsWith('.mmd'))
    .map((f) => f.slice(0, -4))
    .sort()
  test(`A5: each ${type} ladder fixture's expect lines cover exactly its LADDER widths`, () => {
    for (const [id, widths] of Object.entries(LADDER).filter(([k]) => k.startsWith(`${type}-`))) {
      assert.ok(ids.includes(id), id)
      assert.deepEqual(
        [...new Set(expectLines(fx(id)).map((e) => e.cols))].sort((a, b) => a - b),
        widths,
        id,
      )
    }
  })
  for (const id of ids) {
    const src = fx(id)
    const lines = expectLines(src)
    if (id.includes('-reject-')) {
      test(`A5.errors: ${id} falls back`, () => {
        for (const e of lines.length ? lines : W.map((cols) => ({ cols, step: 'fallback' as const }))) {
          const r = X(src, e.cols)
          if (e.step === 'fallback') {
            assert.ok('reason' in r, `${id}@${e.cols}`)
          } else {
            assert.equal(r.step, e.step, `${id}@${e.cols}`)
          }
        }
      })
      continue
    }

    test(`A4: ${id} renders, validates and matches its golden at 60/80/120, with no border-only rows, every frame listed and every drawn glyph allow-listed`, () => {
      const g = goldenOf(
        W.map((w) => {
          const r = X(src, w)
          assert.ok(!('reason' in r), `${id}@${w} ${r.reason}`)
          assert.deepEqual(drawingFaults(r.drawing), [], `${id}@${w}`)
          return [w, r.drawing] as const
        }),
      )
      const p = join('goldens', type, `${id}.golden`)
      if (process.env.UPDATE_GOLDEN === '1') {
        mkdirSync(join('goldens', type), { recursive: true })
        writeFileSync(p, g)
      }

      assert.equal(g, readFileSync(p, 'utf8'))
    })
    if (lines.length) {
      test(`A4.fit-ladder: ${id} takes its expected step at each width`, () => {
        for (const e of lines) {
          const r = X(src, e.cols)
          if (e.step === 'fallback') {
            assert.ok('reason' in r, `${id}@${e.cols}`)
            continue
          }

          assert.equal(r.step, e.step, `${id}@${e.cols}`)
          if (e.widest !== undefined) {
            assert.equal(widest(r.drawing), e.widest, `${id}@${e.cols}`)
          }
        }
      })
    }
  }
}

test('A4.fit-ladder: expect lines parse', () =>
  assert.deepEqual(
    expectLines('pie\n%% expect 60 natural widest 60\n%% expect 59 wrap\n%% expect 58 fallback\n"a" : 1'),
    [
      { cols: 60, step: 'natural', widest: 60 },
      { cols: 59, step: 'wrap' },
      { cols: 58, step: 'fallback' },
    ],
  ))
// The expected ladder widths, written out entry by entry, so a changed, dropped or added width fails without fixtures.
test("A4.fit-ladder: LADDER is the plan's 44 ladder fixtures, each with exactly its widths", () =>
  assert.deepEqual(LADDER, {
    'state-ok-18': [59, 60, 61],
    'class-ok-24': [59, 60, 61],
    'er-ok-18': [59, 60, 61],
    'gantt-ok-12': [59, 60, 61],
    'pie-ok-08': [59, 60, 61],
    'journey-ok-05': [59, 60, 61],
    'xychart-ok-09': [59, 60, 61],
    'mindmap-ok-09': [59, 60, 61],
    'gitGraph-ok-10': [59, 60, 61],
    'timeline-ok-10': [59, 60, 61],
    'quadrant-ok-08': [58, 59, 60],
    'state-ok-19': [60],
    'state-ok-20': [60],
    'state-ok-21': [60],
    'state-ok-22': [60],
    'class-ok-25': [60],
    'class-ok-26': [60],
    'class-ok-27': [60],
    'class-ok-28': [60],
    'er-ok-19': [60],
    'er-ok-20': [60],
    'er-ok-21': [60],
    'er-ok-22': [60],
    'gantt-ok-13': [60],
    'pie-ok-09': [60],
    'journey-ok-06': [60],
    'xychart-ok-10': [60],
    'quadrant-ok-09': [60],
    'mindmap-ok-10': [60],
    'mindmap-ok-11': [60],
    'mindmap-ok-12': [60],
    'timeline-ok-11': [60],
    'timeline-ok-12': [60],
    'gantt-ok-05': [60, 80, 120],
    'gantt-ok-15': [60, 80, 120],
    'gantt-ok-16': [42],
    'quadrant-reject-09': [18],
    'gantt-reject-14': [60, 120],
    'pie-reject-06': [60, 120],
    'journey-reject-08': [60, 120],
    'xychart-reject-12': [60, 120],
    'mindmap-reject-06': [60, 80],
    'gitGraph-reject-07': [60, 80],
    'timeline-reject-07': [60, 80],
  }))
test('A3: borderRows flags an item row with caps and no text; glyph-only owners pass', () => {
  const c = createCanvas(2, 6, 6)
  c.cap(0, 0, '[', 'node', 'A')
  c.text(0, 2, 'x', 'node', 'A')
  c.cap(1, 0, '[', 'node', 'A')
  c.cap(1, 3, '●', 'node', 'S')
  assert.deepEqual(
    borderRows(c.toDrawing({ labels: [{ owner: 'A', text: 'x' }], edges: [], edgeLabels: [], frames: [] })),
    ['A@1'],
  )
})
test('A3: unlistedFrames names a frame owner that expect.frames does not list', () => {
  const c = createCanvas(3, 4, 4)
  const e = { labels: [], edges: [], edgeLabels: [], frames: [] as string[] }
  c.frame(0, 0, 2, 3, 'frame', 'S')
  assert.deepEqual(unlistedFrames(c.toDrawing(e)), ['S'])
  assert.deepEqual(unlistedFrames(c.toDrawing({ ...e, frames: ['S'] })), [])
})
test("VR.reviewers: vr-A covers only A's goldens and the themes", () =>
  assert.deepEqual(JSON.parse(readFileSync('ci/reviews/required.json', 'utf8'))['vr-A'], [
    'goldens/flowchart/**',
    'goldens/sequence/**',
    'core/themes.ts',
  ]))
// goldenGlyphs on one golden holding content, each flag as 'line ch'. Its temp dir is removed after.
function scanGolden(content: string): string[] {
  const dir = mkdtempSync(join(tmpdir(), 'cg-'))
  const p = join(dir, 'x.golden')
  try {
    writeFileSync(p, content)
    return goldenGlyphs(dir).map((s) => s.slice(p.length + 1))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('A8.platforms: series source text codes as !@#$%^&*, a drawn series cell as 1–8, and the glyph scan skips source text', () => {
  const cell = (role: any, kind: any) => ({ ch: 'x', role, kind, owners: ['x'], dirs: 0 })
  assert.deepEqual(
    [
      cell('value', 'text'),
      cell('value', 'cap'),
      cell('s1', 'text'),
      cell('s8', 'text'),
      cell('s2', 'cap'),
      cell('note', 'key'),
    ].map(roleCode),
    ['V', 'v', '!', '*', '2', 'o'],
  )
  assert.deepEqual(scanGolden('@80\n中文 █\n@80 roles\n!~!~ 1\n'), [])
})
// A combining mark joins the series text cell before it, so it is source text too; ß on a drawn series cell is still
// flagged.
test('A8.platforms: the glyph scan skips a combining mark in series source text', () =>
  assert.deepEqual(scanGolden('@80\néx ß\n@80 roles\n!! 3\n'), ['2 ß']))
// A drawn cell whose whole ch is a combining mark reads in a golden as a mark joined to the series text before it, so
// the glyph scan skips it; drawingFaults, which A4 runs on every drawing, checks each drawn cell on the drawing itself.
test('A8.platforms: drawingFaults flags a drawn combining mark after series text, which the golden scan reads as source text', () => {
  const c = createCanvas(1, 2, 60)
  c.text(0, 0, 'e', 's1', 'label')
  c.cap(0, 1, String.fromCodePoint(0x301), 's1', 'mark')
  const d = c.toDrawing({ labels: [{ owner: 'label', text: 'e' }], edges: [], edgeLabels: [], frames: [] })
  assert.deepEqual(scanGolden(goldenOf([[60, d]])), [])
  assert.deepEqual(drawingFaults(d), ['row 0 col 1 U+0301'])
})
// The rest of c-lib: a fill row, an escaped | in a feature, the gated types, the fixture path, spans and bar runs.
const E = { labels: [], edges: [], edgeLabels: [], frames: [] }
test('A3: borderRows flags a fill row with no text too', () => {
  const c = createCanvas(2, 4, 4)
  c.text(0, 0, 'x', 'node', 'A')
  c.fill(1, 0, 3, 'node', 'A')
  assert.deepEqual(borderRows(c.toDrawing(E)), ['A@1'])
})
test('A5: GATED_DIRS is Tier 1 then the passed Tier 2 types, each with a fixture folder', () => {
  assert.deepEqual(GATED_DIRS, [...TIER1, ...TIER2_PASSED])
  for (const t of GATED_DIRS) {
    assert.ok(existsSync(`fixtures/${t}`), t)
  }
})
test('A5: fx reads a fixture from its type folder', () =>
  assert.equal(fx('flowchart-reject-04'), readFileSync('fixtures/flowchart/flowchart-reject-04.mmd', 'utf8')))
test('A7: spanOf finds the first span whose text matches, in reading order', () => {
  const rows = [[{ text: 'a' }, { text: 'Total 3' }], [{ text: 'Total 4' }]] as any
  assert.equal(spanOf(rows, /Total/), rows[0][1])
  assert.equal(spanOf(rows, /4/), rows[1][0])
  assert.equal(spanOf(rows, /z/), undefined)
})
test('A3: hrun sums the eighths of consecutive ▏…█ caps rightward; vrun those of ▁…█ caps upward from base − 1', () => {
  const c = createCanvas(3, 5, 5)
  c.cap(0, 0, '██▌▁', 'value', 'b')
  c.text(0, 4, '█', 'value', 'T')
  c.cap(1, 0, '▏', 'value', 'b')
  c.cap(1, 4, '▃', 'value', 'v')
  c.cap(2, 4, '█', 'value', 'v')
  const d = c.toDrawing(E) // a text █ and a cap of the other axis end a run
  assert.deepEqual(
    [hrun(d, 0, 0), hrun(d, 0, 2), hrun(d, 1, 0), hrun(d, 0, 3), hrun(d, 0, 4), hrun(d, 2, 0)],
    [20, 4, 1, 0, 0, 0],
  )
  assert.deepEqual([vrun(d, 4, 3), vrun(d, 4, 2), vrun(d, 0, 1), vrun(d, 2, 1)], [11, 3, 8, 0])
})
