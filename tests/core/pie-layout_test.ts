import test from 'node:test'
import assert from 'node:assert/strict'
import { explain } from '../../core/render.ts'
import { text } from './graph-fixture.ts'
const X = (src: string, columns: number) => explain(src, { columns, theme: 'mono' }) as any
const bar = (e: number, w: number) => ('█'.repeat(Math.floor(e / 8)) + (e % 8 ? '▏▎▍▌▋▊▉'[(e % 8) - 1] : '')).padEnd(w)
test('A4: label, bar, value, percentage; sorted by value, largest first; bars are round(8·v/Σv·W) eighths', () => {
  const r = X('pie title Pets adopted by volunteers\n"Rats" : 15\n"Dogs" : 386\n"Cats" : 85', 80)
  assert.equal(r.step, 'natural')
  assert.deepEqual(text(r.drawing), [
    'Pets adopted by volunteers',
    `Dogs ${bar(381, 60)} 386 79.4%`,
    `Cats ${bar(84, 60)}  85 17.5%`,
    `Rats ${bar(15, 60)}  15  3.1%`,
  ])
  assert.deepEqual(text(X('pie\n"A" : 15\n"B" : 1', 60).drawing), [
    `A ${bar(368, 49)} 15 93.8%`,
    `B ${bar(25, 49)}  1  6.3%`,
  ])
})
test('A4.fit-ladder: natural while W ≥ 10; then W = 10 with wrapped labels; then fallback', () => {
  const S = 'pie\n"Dogs and cats" : 3\n"Rats" : 1'
  assert.deepEqual(
    [32, 31, 23, 22].map((c) => X(S, c).step ?? 'fallback'),
    ['natural', 'wrap', 'wrap', 'fallback'],
  )
  assert.deepEqual(text(X(S, 31).drawing), [
    `Dogs and ${bar(60, 10)} 3 75.0%`,
    'cats',
    `Rats     ${bar(20, 10)} 1 25.0%`,
  ])
})
test('A5: showData and a title on the header line; single-quoted labels; decimal values', () => {
  const t = text(X('pie showData title Fruit\n\'Apples\' : 2.5\n"Pears" : 1.25', 80).drawing)
  assert.equal(t[0], 'Fruit')
  assert.match(t[1]!, /^Apples .* 2\.5 66\.7%$/)
  assert.match(t[2]!, /^Pears  .* 1\.25 33\.3%$/)
})
test('A5.errors: zero, negative, repeated, unquoted, backslash and empty pies fall back', () => {
  for (const [src, why] of [
    ['pie\n"Dogs" : 0', 'domain:2'],
    ['pie\n"Dogs" : -5', 'domain:2'],
    ['pie\n"Dogs" : 1\n"Dogs" : 2', 'repeat:3'],
    ['pie\nDogs : 386', 'syntax:2'],
    ['pie\n"a\\b" : 1', 'syntax:2'],
    ['pie title Empty', 'empty'],
  ] as const) {
    assert.deepEqual(X(src, 80), { reason: why }, src)
  }
})

// Beyond the plan's tests. Nine slices, so ink cycles: ties keep source order, and ink and owners follow the source
// index k, not the rank. A bar's ink is s<(k mod 8) + 1>, so i (k = 8) wraps to s1.
test('A4: ties keep source order; ink and owners follow the source index; expect lists every bar and text owner once', () => {
  const vs = [1, 2, 2, 1, 1, 1, 1, 1, 3]
  const E = [0, 37, 74, 111]
  const P = ['', ' 7.7%', '15.4%', '23.1%']
  const rank = [8, 1, 2, 0, 3, 4, 5, 6, 7]
  const r = X(['pie', ...vs.map((v, k) => `"${'abcdefghi'[k]}" : ${v}`)].join('\n'), 80)
  const d = r.drawing
  assert.equal(r.step, 'natural')
  assert.deepEqual(
    text(d),
    rank.map((k) => `${'abcdefghi'[k]} ${bar(E[vs[k]!]!, 60)} ${vs[k]} ${P[vs[k]!]}`),
  )
  assert.deepEqual(
    d.cells.map((row: any[]) => [
      ...new Set(row.flatMap((c) => (c ? [`${c.kind} ${c.role} ${c.owners.join()}`] : []))),
    ]),
    rank.map((k) => [`text label s${k}`, `cap s${(k % 8) + 1} s${k}`, `text value s${k}.v`, `text value s${k}.p`]),
  )
  const byOwner = (x: any, y: any) => x.owner.localeCompare(y.owner)
  assert.deepEqual(
    d.expect.bars.toSorted(byOwner).map(({ at: _, ...b }: any) => b),
    vs.map((v, k) => ({ owner: `s${k}`, eighths: E[v], axis: 'h' })),
  )
  assert.deepEqual(
    d.expect.labels.map((l: any) => l.owner).sort(),
    vs.flatMap((_, k) => [`s${k}`, `s${k}.p`, `s${k}.v`]).sort(),
  )
  assert.deepEqual([d.expect.edges, d.expect.edgeLabels, d.expect.frames], [[], [], []])
})
// Both steps draw a label as wrap's pieces, each run of spaces one space and the ends trimmed, as validate reads it: a
// blank label draws no cell, so it does not push the pie past natural.
test('A4.fit-ladder: a label draws as its wrapped pieces at natural too, so a blank label draws nothing and stays natural', () => {
  const r = X('pie\n"a  b" : 1\n"  " : 1', 80)
  assert.equal(r.step, 'natural')
  assert.deepEqual(text(r.drawing), [`a b ${bar(240, 60)} 1 50.0%`, `    ${bar(240, 60)} 1 50.0%`])
})
test('A5.errors: other header forms and value tokens outside the subset fall back, as do unsupported characters', () => {
  for (const [src, why] of [
    ['pie showData showData\n"a" : 1', 'header'],
    ['pie ShowData\n"a" : 1', 'header'],
    ['pie title\n"a" : 1', 'header'],
    ['pie\n"a" : +5', 'domain:2'],
    ['pie\n"a" : 007', 'domain:2'],
    ['pie\n"a" : 0.0', 'domain:2'],
    ['pie\n"a" : 1e3', 'syntax:2'],
    ['pie\n"a" : .5', 'syntax:2'],
    ['pie\n"a" : 5.', 'syntax:2'],
    ['pie\n"a" : 1;', 'syntax:2'],
    ['pie\n"a" : 1 : 2', 'syntax:2'],
    ['pie\n"a\u0007" : 1', 'unsupported-char U+0007'],
    ['pie title A\u0007\n"a" : 1', 'unsupported-char U+0007'],
  ] as const) {
    assert.deepEqual(X(src, 80), { reason: why }, src)
  }
})
// Mermaid 12.2.0 encodes each #…; of the diagram body as an entity and decodes it in the SVG, so it would draw other
// text.
test('A5.errors: a #…; entity in a slice label or a header title falls back; a # that starts no entity is text', () => {
  for (const src of ['pie\n"#9829;" : 1', 'pie title I #9829; pets\n"a" : 1']) {
    assert.deepEqual(X(src, 80), { reason: 'entity' }, src)
  }

  assert.deepEqual(text(X('pie title C# and F#\n"F#" : 1', 80).drawing), ['C# and F#', `F# ${bar(480, 60)} 1 100.0%`])
})
// accTitle and accDescr, in each form, are parsed and not drawn (matrix common rule 4).
test('A5: a title statement or a frontmatter title draws as the heading; accTitle and accDescr are ignored', () => {
  for (const [src, title] of [
    ['pie\ntitle Pets\n"Dogs" : 3', 'Pets'],
    ['---\ntitle: "I ♥ pets"\n---\npie\n"Dogs" : 3', 'I ♥ pets'],
    [
      'pie title Pets\naccTitle: Pets\naccDescr: Two\naccDescr {\n  dogs\n  cats }\naccDescr { one }\n"Dogs" : 3',
      'Pets',
    ],
  ] as const) {
    assert.deepEqual(text(X(src, 80).drawing), [title, `Dogs ${bar(480, 60)} 3 100.0%`], src)
  }
})
test('A5.errors: a second title, an undrawable title statement or an unclosed accDescr block falls back; acc lines alone are empty', () => {
  for (const [src, why] of [
    ['pie title A\ntitle B\n"a" : 1', 'repeat:2'],
    ['pie\ntitle A\n"a" : 1\ntitle B', 'repeat:4'],
    ['---\ntitle: A\n---\npie\ntitle B\n"a" : 1', 'repeat:5'],
    ['---\ntitle: A\n---\npie title B\n"a" : 1', 'repeat:header'],
    ['pie\ntitle I #9829; pets\n"a" : 1', 'entity'],
    ['pie\ntitle A\u0007\n"a" : 1', 'unsupported-char U+0007'],
    // explain checks a frontmatter title as a sanitized title, so its #…; falls back too (text ground truth).
    ['---\ntitle: "I #9829; pets"\n---\npie\n"a" : 1', 'entity'],
    ['pie\naccTitle: Pets', 'empty'],
    ['pie\naccDescr {\n"a" : 1', 'syntax:2'],
    ['pie\naccDescr { a } b\n"a" : 1', 'syntax:2'],
    ['pie\nTitle A\n"a" : 1', 'syntax:2'],
    ['pie\ntitled A\n"a" : 1', 'syntax:2'],
  ] as const) {
    assert.deepEqual(X(src, 80), { reason: why }, src)
  }
})
