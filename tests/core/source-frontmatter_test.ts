import test from 'node:test'
import assert from 'node:assert/strict'
import { readSource, scanSource, type Source } from '../../core/source.ts'
// Source-reader fix cycle 1: frontmatter that Mermaid 12.2.0 reads otherwise is read as it reads it, or falls back.
// The Source or Fail for frontmatter written one YAML line per argument, before `pie` / `"A" : 1`.
// Read by the scanner, before readSource checks each setting against its allowlist, so that any key tests the YAML
// subset.
const fm = (...ls: string[]) => scanSource(`---\n${ls.join('\n')}\n---\npie\n"A" : 1`)
const titleOf = (...ls: string[]) => {
  const s = fm(...ls)
  return 'reason' in s ? s : s.title
}
const FM = { reason: 'frontmatter' }

test('A1: (2) a BOM that starts the block is stripped, as js-yaml strips it; one before the opening --- falls back', () => {
  assert.deepEqual([titleOf('﻿title: A'), titleOf('', '﻿title: A'), titleOf('﻿﻿title: A')], ['A', 'A', null])
  assert.deepEqual(
    ['﻿---', '  ---'].map((o) => readSource(`${o}\ntitle: A\n---\npie\n"A" : 1`)),
    [FM, FM],
  )
})

test("A1: (3) Mermaid's cleanupText first rewrites each tag's double-quoted attributes to single quotes, over the whole text", () => {
  assert.deepEqual(titleOf(`'<a x="y">'`), FM)
  const s = readSource('pie\n"<b class="x">A</b>" : 1\n"<b\nclass="y">B</b>" : 2') as Source
  assert.deepEqual(
    s.lines.map((l) => l.text),
    [`"<b class='x'>A</b>" : 1`, '"<b', `class='y'>B</b>" : 2`],
  )
})

test("A5.errors: (7) only a block Mermaid's frontMatterRegex matches is frontmatter; any other block falls back", () => {
  const bad = ['---\n---\npie\n"A" : 1', '---\n\n---\npie\n---\n"A" : 1', '---\n...\ntitle: A\n---\npie\n"A" : 1']
  assert.deepEqual(
    bad.map((t) => [t, readSource(t)]),
    bad.map((t) => [t, FM]),
  )
  const ok = [
    '---\ntitle: A\n--- \npie\n"A" : 1',
    '--- \t\ntitle: A\n---\npie\n"A" : 1',
    '---\n\ntitle: A\n---\n\npie\n"A" : 1',
  ]
  assert.deepEqual(
    ok.map((t) => (readSource(t) as Source).title),
    ['A', 'A', 'A'],
  )
  assert.deepEqual(readSource('---\n\n---\npie\n"A" : 1'), {
    header: 'pie',
    title: null,
    config: {},
    lines: [{ n: 5, text: '"A" : 1' }],
  })
})

test('A5.errors: (1) a quoted scalar or flow collection still open at its line end, under any key, falls back', () => {
  const bad = [
    ['other: "a', 'title: Fake', 'b"'],
    ["other: 'a", 'title: Fake', "b'"],
    ["other: 'it''", 'title: Fake', "b'"],
    ['other: "a\\', 'title: Fake', 'b"'],
    ['other: !!str "a', 'title: Fake', 'b"'],
    ['other: [a,', 'title: Fake]'],
    ['other: {a: b,', 'title: Fake}'],
  ]
  assert.deepEqual(
    bad.map((ls) => [ls, fm(...ls)]),
    bad.map((ls) => [ls, FM]),
  )
  // Closed on their own line, or not a node's start: a quote or bracket inside a plain scalar or a comment.
  const ok = [
    ['other: "a" # "b'],
    ["other: 'a''b'"],
    ['other: [a, "b"]'],
    ["other: it's"],
    ['other: a "b'],
    ['other: x [y'],
    ['other: x # "open'],
  ]
  assert.deepEqual(
    ok.map((ls) => titleOf(...ls, 'title: T')),
    ok.map(() => 'T'),
  )
})

test('A5.errors: (6) a character js-yaml rejects as non-printable, or a lone surrogate, anywhere in the frontmatter falls back', () => {
  const chars = ['\x00', '\x08', '\x0B', '\x0C', '\x1F', '\x7F', '\x84', '\x86', '\x9F', '￾', '￿', '\uD800', '\uDC00']
  const bad = chars.flatMap((c) => [
    ['config:', `  a: x${c}y`],
    [`# note ${c}`, 'title: T'],
  ])
  assert.deepEqual(
    bad.map((ls) => [ls, fm(...ls)]),
    bad.map((ls) => [ls, FM]),
  )
  // A tab, NEL, NBSP and a surrogate pair are printable to js-yaml, and kept.
  const ok = ['x\ty', 'x\x85y', 'x y', 'x\u{1F600}y']
  assert.deepEqual(
    ok.map((v) => (fm('config:', `  a: ${v}`) as Source).config),
    ok.map((v) => ({ a: v })),
  )
})

test('A5.errors: (4) a key js-yaml JSON_SCHEMA reads as null, a bool or a number falls back, since it could repeat another', () => {
  const bad = [
    ['config:', '  True: a', '  true: b'],
    ['config:', '  true: a'],
    ['config:', '  a:', '    NULL: x'],
    ['True: a', 'true: b'],
    ['1: a'],
    ['~: a'],
  ]
  assert.deepEqual(
    bad.map((ls) => [ls, fm(...ls)]),
    bad.map((ls) => [ls, FM]),
  )
  assert.deepEqual((fm('trueish: a', 'config:', '  nulls: x', '  Truth: y') as Source).config, {
    nulls: 'x',
    Truth: 'y',
  })
})

test('A5.errors: (5) a __proto__ key falls back; config keeps every other key as its own property', () => {
  const bad = [['config:', '  __proto__: x'], ['config:', '  a:', '    __proto__: x'], ['__proto__: x']]
  assert.deepEqual(
    bad.map((ls) => [ls, fm(...ls)]),
    bad.map((ls) => [ls, FM]),
  )
  const c = (fm('config:', '  constructor: x', '  toString: y', '  hasOwnProperty: z') as Source).config
  assert.deepEqual(
    [c, Object.keys(c)],
    [{ constructor: 'x', toString: 'y', hasOwnProperty: 'z' }, ['constructor', 'toString', 'hasOwnProperty']],
  )
})
