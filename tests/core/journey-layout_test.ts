import test from 'node:test'
import assert from 'node:assert/strict'
import { explain } from '../../core/render.ts'
import { text } from './graph-fixture.ts'
import { journey } from '../../core/diagrams/journey/layout.ts'
import { readSource } from '../../core/source.ts'
const X = (src: string, columns: number) => explain(src, { columns, theme: 'mono' }) as any
const DAY =
  'journey\ntitle My working day\nsection Go to work\nMake tea: 5: Me\nGo upstairs: 3: Me\nDo work: 1: Me, Cat'
test('A4: the matrix sketch: a 10-cell bar of round(16·s) eighths, the score, two spaces, the actors', () => {
  const r = X(DAY, 80)
  assert.equal(r.step, 'natural')
  assert.deepEqual(text(r.drawing), [
    'My working day',
    'Go to work',
    '  Make tea    ██████████ 5  Me',
    '  Go upstairs ██████     3  Me',
    '  Do work     ██         1  Me, Cat',
  ])
  const t = text(X('journey\nsection S\nA: 2.5: Me\nB: 4.75: Me', 80).drawing)
  assert.deepEqual(t.slice(1), [
    '  A ' + '█████'.padEnd(10) + ' ' + ' 2.5  Me',
    '  B ' + '█████████▌' + ' ' + '4.75  Me',
  ])
})
test('A4.fit-ladder: natural; actor lists wrap after commas; one actor per row with wrapped names; then fallback', () => {
  assert.deepEqual(
    [35, 34, 31, 30, 28, 27].map((c) => X(DAY, c).step ?? 'fallback'),
    ['natural', 'wrap', 'wrap', 'oneActor', 'oneActor', 'fallback'],
  )
  assert.equal(text(X(DAY, 31).drawing).at(-1), ' '.repeat(28) + 'Cat')
})
test('A5.errors: a bad score, a missing or repeated actor, # or ;, and : in a section fall back', () => {
  for (const [body, why] of [
    ['Make tea: 6: Me', 'domain:3'],
    ['Make tea: high: Me', 'domain:3'],
    ['Make tea: 5', 'syntax:3'],
    ['Do work: 1: Me, Me', 'repeat:3'],
    ['Fix #12: 3: Me', 'syntax:3'],
    ['Plan; review: 3: Me', 'syntax:3'],
  ] as const) {
    assert.deepEqual(X(`journey\nsection S\n${body}`, 80), { reason: why }, body)
  }

  assert.deepEqual(X('journey\nsection Morning: early\nA: 1: Me', 80), { reason: 'syntax:2' })
})

// Beyond the plan's tests. A bar of e eighths, padded to the 10-cell field; a cell's kind, ink and owners.
const bar = (e: number) => ('█'.repeat(Math.floor(e / 8)) + (e % 8 ? '▏▎▍▌▋▊▉'[(e % 8) - 1] : '')).padEnd(10)
const kinds = (row: any[]) => [...new Set(row.flatMap((c) => (c ? [`${c.kind} ${c.role} ${c.owners.join()}`] : [])))]
// Tasks before the first section form a group with no header row, which takes s1, so the sections take s2, s3, … With
// no such tasks, the first section takes s1. Owners follow the task's index, and a section's its own.
test('A4: tasks before the first section take s1 and shift each section ink by one; owners and bars follow the task index', () => {
  const d = X('journey\nA: 5: Me\nsection S\nB: 3: Me, Cat\nsection T\nC: 1: Cat', 80).drawing
  assert.deepEqual(text(d), [
    '  A ' + bar(80) + ' 5  Me',
    'S',
    '  B ' + bar(48) + ' 3  Me, Cat',
    'T',
    '  C ' + bar(16) + ' 1  Cat',
  ])
  assert.deepEqual(d.cells.map(kinds), [
    ['text label t0', 'cap s1 t0', 'text value t0.v', 'text label t0.a0'],
    ['text s2 sec0'],
    ['text label t1', 'cap s2 t1', 'text value t1.v', 'text label t1.a0', 'cap label t1.a0', 'text label t1.a1'],
    ['text s3 sec1'],
    ['text label t2', 'cap s3 t2', 'text value t2.v', 'text label t2.a0'],
  ])
  assert.deepEqual(
    d.expect.bars.map(({ at: _, ...b }: any) => b),
    [
      { owner: 't0', eighths: 80, axis: 'h' },
      { owner: 't1', eighths: 48, axis: 'h' },
      { owner: 't2', eighths: 16, axis: 'h' },
    ],
  )
  assert.deepEqual([d.expect.edges, d.expect.edgeLabels, d.expect.frames], [[], [], []])
  assert.deepEqual(X('journey\nsection S\nA: 5: Me', 80).drawing.cells.map(kinds), [
    ['text s1 sec0'],
    ['text label t0', 'cap s1 t0', 'text value t0.v', 'text label t0.a0'],
  ])
})
// The ladder's drawings: wrap keeps names whole and breaks an actor list after a comma, which stays on its row;
// oneActor draws one actor a row and wraps the names. The bar and score sit on the task's first row.
test('A4.fit-ladder: wrap breaks actor lists after a comma; oneActor draws one actor a row and wraps names', () => {
  const head = ['My working day', 'Go to work']
  assert.deepEqual(text(X(DAY, 34).drawing), [
    ...head,
    '  Make tea    ' + bar(80) + ' 5  Me',
    '  Go upstairs ' + bar(48) + ' 3  Me',
    '  Do work     ' + bar(16) + ' 1  Me,',
    ' '.repeat(28) + 'Cat',
  ])
  assert.deepEqual(text(X(DAY, 30).drawing), [
    ...head,
    '  Make tea ' + bar(80) + ' 5  Me',
    '  Go       ' + bar(48) + ' 3  Me',
    '  upstairs',
    '  Do work  ' + bar(16) + ' 1  Me,',
    ' '.repeat(25) + 'Cat',
  ])
})
// A section header row wraps when it is wider than columns; a word wider than columns falls back.
test('A4.fit-ladder: a section header wraps at columns; a word wider than columns falls back', () => {
  assert.deepEqual(text(X('journey\nsection Getting to the office early\nA: 3: Me', 20).drawing), [
    'Getting to the',
    'office early',
    '  A ' + bar(48) + ' 3  Me',
  ])
  assert.deepEqual(X('journey\nsection Supercalifragilistically\nA: 3: Me', 20), { reason: 'too-wide' })
})
// Matrix journey-ok-04: a CJK character takes two columns, and oneActor wraps a name between two of them.
test('A4.fit-ladder: CJK task, section and actor names take two columns a character; oneActor wraps a name between them', () => {
  const S = 'journey\nsection 通勤\n泡茶喝水: 5: 我, 猫'
  assert.deepEqual(
    [31, 30, 28, 27, 22, 21].map((c) => X(S, c).step ?? 'fallback'),
    ['natural', 'wrap', 'wrap', 'oneActor', 'oneActor', 'fallback'],
  )
  assert.deepEqual(text(X(S, 27).drawing), ['通勤', '  泡茶喝 ' + bar(80) + ' 5  我,', '  水' + ' '.repeat(19) + '猫'])
})
test('A4.fit-ladder: the ladder is natural, wrap, oneActor; any other step fails step', () => {
  const m = journey.parse(readSource(DAY) as any) as any
  assert.deepEqual(journey.steps(m), ['natural', 'wrap', 'oneActor'])
  assert.deepEqual(journey.layout(m, 'tight', 80), { reason: 'step' })
})
// Matrix journey-reject-09, -10 and -11; a keyword in another case or starting a longer word, journey's own included,
// which Mermaid's case-insensitive lexer reads as that keyword; a score outside 1–5 or no plain decimal; a %%, which
// Mermaid's lexer reads as a comment though it is quoted, since journey has no strings; and text that cannot be drawn.
test('A5.errors: actor lists, colons, keywords, scores, %% and characters outside the subset fall back', () => {
  for (const [body, why] of [
    ['A: 3:', 'syntax:3'],
    ['A: 3: Me: Cat', 'syntax:3'],
    ['A: 3: Me,,Cat', 'syntax:3'],
    ['A: 3: Me,', 'syntax:3'],
    [': 3: Me', 'syntax:3'],
    ['Section A', 'syntax:3'],
    ['titled A', 'syntax:3'],
    ['Title A: 3: Me', 'syntax:3'],
    ['Sections: 3: Me', 'syntax:3'],
    ['Journey home: 3: Me', 'syntax:3'],
    ['acctitle: A', 'syntax:3'],
    ['section', 'syntax:3'],
    ['"%%x": 3: Me', 'syntax:3'],
    ['A: 0.5: Me', 'domain:3'],
    ['A: 5.01: Me', 'domain:3'],
    ['A: 1e0: Me', 'domain:3'],
    ['A: : Me', 'domain:3'],
    ['A\u0007: 3: Me', 'unsupported-char U+0007'],
    ['A: 3: Me\u0007', 'unsupported-char U+0007'],
  ] as const) {
    assert.deepEqual(X(`journey\nsection S\n${body}`, 80), { reason: why }, body)
  }
})
test('A5.errors: another header, a second title, no task, an accDescr block left open or not ending its line, and undrawable text fall back', () => {
  for (const [src, why] of [
    ['journey extra\nA: 3: Me', 'header'],
    ['journey\ntitle A\ntitle B\nA: 3: Me', 'repeat:3'],
    ['---\ntitle: A\n---\njourney\ntitle B\nA: 3: Me', 'repeat:5'],
    ['journey\ntitle A\nsection S', 'empty'],
    ['journey\naccDescr {\nA: 3: Me', 'syntax:2'],
    ['journey\naccDescr { a } b\nA: 3: Me', 'syntax:2'],
    ['journey\ntitle A\u0007\nA: 3: Me', 'unsupported-char U+0007'],
    ['journey\nsection S\u0007\nA: 3: Me', 'unsupported-char U+0007'],
  ] as const) {
    assert.deepEqual(X(src, 80), { reason: why }, src)
  }
})
// accTitle and accDescr, in each form, are parsed and not drawn, so a # or ; in one is no comment (matrix
// journey-ok-08). Task names and actors may repeat across tasks (journey-ok-07).
test('A5: accTitle and accDescr are ignored, # and ; in them too; %% lines are skipped; a frontmatter title draws', () => {
  const rows = ['My day', 'Go', '  A ' + bar(48) + ' 3  Me']
  for (const src of [
    'journey\ntitle My day\naccTitle: Day #1; a\naccDescr: My day\naccDescr {\n  #2;\n}\nsection Go\n%% a note\nA: 3: Me',
    '---\ntitle: My day\n---\njourney\nsection Go\nA: 3: Me\naccDescr { one }',
  ]) {
    assert.deepEqual(text(X(src, 80).drawing), rows, src)
  }

  assert.deepEqual(text(X('journey\nA: 3: Me\nA: 5: Me', 80).drawing), [
    '  A ' + bar(48) + ' 3  Me',
    '  A ' + bar(80) + ' 5  Me',
  ])
})
// From QA: the bar rounds half up at its boundary: 16 × 1.03125 is 16.5, so 17 eighths, not a truncated 16.
test('A4: a score on a half-eighth boundary rounds half up: 1.03125 draws 17 eighths', () => {
  const d = X('journey\nsection S\nA: 1.03125: Me', 80).drawing
  assert.deepEqual(
    d.expect.bars.map(({ at: _, ...b }: any) => b),
    [{ owner: 't0', eighths: 17, axis: 'h' }],
  )
})
