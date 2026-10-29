import test from 'node:test'; import assert from 'node:assert/strict'; import { readSource, type Source } from '../../core/source.ts'
const src = (fm: string) => readSource(`---\n${fm}\n---\ngitGraph\ncommit`)
const cfg = (fm: string) => (src(fm) as Source).config
test('A5: frontmatter config scalars become dotted keys; other top-level keys are ignored', () => {
  assert.deepEqual(cfg('title: Log\nconfig:\n  theme: dark\n  gitGraph:\n    mainBranchName: "trunk"\n    mainBranchOrder: 2\ndisplayMode: compact'),
    { theme: 'dark', 'gitGraph.mainBranchName': 'trunk', 'gitGraph.mainBranchOrder': 2 })
  assert.deepEqual(cfg('config:\n  mindmap:\n    colorBy: depth # a comment\n\n  timeline:\n    disableMulticolor: true'),
    { 'mindmap.colorBy': 'depth', 'timeline.disableMulticolor': true })
  assert.deepEqual(cfg("config:\n  gitGraph:\n    mainBranchName: 'it''s # main'\n    x: \"a \\\" b\""), { 'gitGraph.mainBranchName': "it's # main", 'gitGraph.x': 'a " b' })
  assert.deepEqual((readSource('pie\n"a" : 1') as Source).config, {})
  assert.deepEqual(cfg('config:\n  gitGraph:\n    mainBranchName: trunk\t# note\n    x: a#b'), { 'gitGraph.mainBranchName': 'trunk', 'gitGraph.x': 'a#b' })   // a tab-# comment; a # inside a word
  for (const q of ['"trunk" # note', '"trunk"\t# note', "'trunk' # note"]) assert.deepEqual(cfg(`config:\n  gitGraph:\n    mainBranchName: ${q}`), { 'gitGraph.mainBranchName': 'trunk' }, q)
  assert.deepEqual(cfg('config:\n  gitGraph:\n    mainBranchName: "a # b" # note'), { 'gitGraph.mainBranchName': 'a # b' })   // a # inside the quotes is kept
})
test('A5.errors: a config block outside the strict YAML subset falls back', () => {
  const bad = ['config:\n  pie: { textPosition: 0.5 }', 'config:\n  themeVariables:\n    - a', 'config:\n  pie:\n    k: [1, 2]',
    'config:\n  a: &x 1', 'config:\n  a: *x', 'config:\n  a: !!str 1', 'config:\n  a: |\n    text', 'config:\n  a: >\n    text',
    'config:\n  a: one\n    two', 'config:\n  a: 1\n  a: 2', 'config:\n\tmindmap:', 'config:\n  a: "open', 'config:\n    a: 1\n  b: 2',
    'config:\n  a:', 'config:\n  a: b: c', 'config:\n  a: "x\\q"', 'config:\n  gitGraph.mainBranchName: fake']
  for (const fm of bad) assert.deepEqual(src(fm), { reason: 'frontmatter' }, fm)
})

// A frontmatter block written one YAML line per argument.
const yaml = (...ls: string[]) => ls.join('\n')
test('A5: quoted and plain scalars, comment and blank lines, keys and nesting read exactly', () => {
  assert.deepEqual(cfg(yaml('config:', '  q:', '    a: "x\\\\y"', '    b: "\\\\"', '    c: ""', "    d: ''", `    e: "it's"`, `    f: 'say "hi"'`, "    g: 'a'''")),
    { 'q.a': 'x\\y', 'q.b': '\\', 'q.c': '', 'q.d': '', 'q.e': "it's", 'q.f': 'say "hi"', 'q.g': "a'" })
  // Indicators after the first character, inner spaces and quotes; a tab after the separating space.
  assert.deepEqual(cfg(yaml('config:', '  p:', '    a: x-y, [z] {w}', '    b: -1', '    c: x:y', '    d: :x', '    e: ?x', '    f: x  y', '    g: 50%', `    h: it's`, '    i: a "b"', '    j: \tx')),
    { 'p.a': 'x-y, [z] {w}', 'p.b': -1, 'p.c': 'x:y', 'p.d': ':x', 'p.e': '?x', 'p.f': 'x  y', 'p.g': '50%', 'p.h': "it's", 'p.i': 'a "b"', 'p.j': 'x' })
  // A comment or blank line at any indent is skipped and never ends a mapping, nor does a whitespace-only line with a tab.
  assert.deepEqual(cfg(yaml('config:', '  gitGraph:', '# top', '    mainBranchName: trunk', '      # deep', '  ', ' \t ', '    mainBranchOrder: 2')),
    { 'gitGraph.mainBranchName': 'trunk', 'gitGraph.mainBranchOrder': 2 })
  // Keys with _, - and digits; uneven but consistent indents; one line closing two mappings.
  assert.deepEqual(cfg(yaml('config:', '    _k-2:', '       A9: x', '       b:', '         c: 1', '    e: 3', 'other: y')),
    { '_k-2.A9': 'x', '_k-2.b.c': 1, e: 3 })
  // Trailing spaces and tabs are dropped, on the config: line too.
  assert.deepEqual(cfg('config:  \n  gitGraph:\t\n    mainBranchName: trunk  \n    x: "q"\t '), { 'gitGraph.mainBranchName': 'trunk', 'gitGraph.x': 'q' })
  assert.deepEqual(readSource('---\ntitle: Log\nconfig:\n  title: nested\n  a: 1\n---\ngitGraph\ncommit'),
    { header: 'gitGraph', title: 'Log', config: { title: 'nested', a: 1 }, lines: [{ n: 8, text: 'commit' }] })
  assert.deepEqual(['configX:\n  a: 1', 'config_y:\n  a: 1', 'x:\n  config:\n    a: 1'].map(cfg), [{}, {}, {}])
})
test('A5.errors: every other scalar, key, indentation or tab form falls back', () => {
  const plain = [']x', '}x', ',x', '%x', '@x', '`x', '#x', '- x', '-', '? x', '?', ': x', ':', "'x", '"x', 'x:', 'x:\ty', 'x: # c']
  const quoted = ['"x" y', "'x'y", '"x"#c', "'it's'", "'a''", '"a\\"', '"one\n    two"']
  const keys = ['"a": 1', "'a': 1", 'a : 1', '1a: 1', 'é: 1', 'a b: 1', '? a\n  : 1', 'a:b', 'a:\tb', 'gitGraph.x:\n    y: 1']
  const shape = ['a:\n  b: 1', 'a:\ntitle: T', 'a:\n    b:', 'a: 1\n    b: 2', 'a: 1\n\t# c', 'a: 1\n \tb: 2']
  const bad = [...[...plain, ...quoted].map(v => `config:\n  a: ${v}`), ...[...keys, ...shape].map(l => `config:\n  ${l}`),
    'title: T\n\tx: 1', 'config:', 'config:\ntitle: T']
  for (const fm of bad) assert.deepEqual(src(fm), { reason: 'frontmatter' }, fm)
})
test('A5.errors: config in any other top-level form, a second config: block, or an indented first line falls back', () => {
  const bad = ['config: {}', 'config: { gitGraph: { mainBranchName: trunk } }', 'config: x', 'config: # c\n  a: 1', 'config :\n  a: 1',
    'config\t:\n  a: 1', '"config":\n  a: 1', "'config':\n  a: 1", '? config\n:\n  a: 1', '{ config: { a: 1 } }', '&c config:\n  a: 1',
    '!!str config:\n  a: 1', '- config:\n    a: 1', '  config:\n    a: 1', 'config:\n  a: 1\nconfig:\n  b: 2']
  for (const fm of bad) assert.deepEqual(src(fm), { reason: 'frontmatter' }, fm)
  // Other plain top-level keys, indicators after their first character included, are still ignored.
  assert.deepEqual(cfg('displayMode: compact\ntitleTopMargin: 5\n.x: 1\nx-y: z\n-x: 1\n?x: 1\nconfig:\n  a: 1'), { a: 1 })
})
