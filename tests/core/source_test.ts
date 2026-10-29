import test from 'node:test'
import assert from 'node:assert/strict'
import { readSource, type Source } from '../../core/source.ts'

test('A1: CRLF normalized once; frontmatter title; %% comments skipped', () => {
  const s = readSource('---\r\ntitle: "Flow"\r\n---\r\nflowchart TD\r\n%% note\r\n\r\nA-->B\r\n') as Source
  assert.deepEqual([s.header, s.title, s.lines.map(l => l.text)], ['flowchart TD', 'Flow', ['A-->B']])
})

test('A5.errors: init directive and trailing %% fall back', () => {
  assert.deepEqual(readSource('%%{init: {}}%%\nflowchart TD\nA'), { reason: 'directive' })
  assert.deepEqual(readSource('flowchart TD\nA-->B %% x'), { reason: 'directive' })
})

test('A5.errors: every %%{ line is a directive, not only init; %% { is a comment', () => {
  assert.deepEqual(readSource('%%{wrap}%%\nsequenceDiagram\nA->>B: hi'), { reason: 'directive' })
  assert.deepEqual(readSource('flowchart TD\n%% {not a directive}\nA'), { header: 'flowchart TD', title: null, config: {}, lines: [{ n: 3, text: 'A' }] })
})

test('A1: lines keep 1-based source numbers past frontmatter and skipped lines; a lone CR ends a line', () => {
  const s = readSource('---\ntitle: T\n---\nflowchart TD\rA-->B\r\n\r\n%% c\nB-->C') as Source
  assert.deepEqual(s.lines, [{ n: 5, text: 'A-->B' }, { n: 8, text: 'B-->C' }])
})

test('A1: the header is the first kept line, trimmed, with only a trailing ; removed', () => {
  assert.deepEqual(readSource('\n%% c\n  graph LR;  \nA-->B'), { header: 'graph LR', title: null, config: {}, lines: [{ n: 4, text: 'A-->B' }] })
  assert.deepEqual(readSource('graph LR; A-->B\nC'), { header: 'graph LR; A-->B', title: null, config: {}, lines: [{ n: 2, text: 'C' }] })
})

test('A1: indented %% comments and whitespace-only lines are skipped; kept lines keep their indentation', () => {
  assert.deepEqual(readSource('flowchart TD\n    %% note\n \t \n    A --> B'), { header: 'flowchart TD', title: null, config: {}, lines: [{ n: 4, text: '    A --> B' }] })
  assert.deepEqual(readSource('flowchart TD\n  %%{init: {}}%%\nA'), { reason: 'directive' })
})

test('A1: frontmatter title loses one matched quote pair; other keys, nested ones included, are ignored', () => {
  const titleOf = (fm: string) => (readSource(`---\n${fm}\n---\nflowchart TD\nA`) as Source).title
  assert.deepEqual(
    [`title: 'Flow'`, 'title:   Flow  ', 'title: ""', `title: "Flow'`, `title: It's "fine"`, 'title: 50%% off', 'config:\n  title: nested\ndisplayMode: compact\ntitleTopMargin: 5'].map(titleOf),
    ['Flow', 'Flow', '', `"Flow'`, `It's "fine"`, '50%% off', null])
  assert.deepEqual(readSource('---\n---\nflowchart TD\nA'), { header: 'flowchart TD', title: null, config: {}, lines: [{ n: 4, text: 'A' }] })
})

test('A5.errors: frontmatter with no closing --- falls back; only an exact --- on line 1 opens it', () => {
  assert.deepEqual(['---\ntitle: T\nflowchart TD\nA-->B', '---'].map(t => readSource(t)), [{ reason: 'frontmatter' }, { reason: 'frontmatter' }])
  assert.deepEqual(readSource('----\ntitle: T\n---\nG'), { header: '----', title: null, config: {}, lines: [{ n: 2, text: 'title: T' }, { n: 3, text: '---' }, { n: 4, text: 'G' }] })
  assert.deepEqual(readSource('\n---\ntitle: T\n---\nG'), { header: '---', title: null, config: {}, lines: [{ n: 3, text: 'title: T' }, { n: 4, text: '---' }, { n: 5, text: 'G' }] })
})

test('A5.errors: a second frontmatter title falls back, even after an empty one', () => {
  assert.deepEqual(['---\ntitle: A\ntitle: B\n---\nflowchart TD\nA', '---\ntitle: ""\ntitle: B\n---\nflowchart TD\nA'].map(t => readSource(t)), [{ reason: 'title' }, { reason: 'title' }])
})

test('A5.errors: no header, or a header with no body, falls back as empty', () => {
  const inputs = ['', '%% c\n\n  %% d', 'flowchart TD', 'flowchart TD\n%% c\n', '---\ntitle: T\n---\n']
  assert.deepEqual(inputs.map(t => [t, readSource(t)]), inputs.map(t => [t, { reason: 'empty' }]))
})

test('A1: %% inside double quotes is label text, not a comment', () => {
  assert.deepEqual(readSource('flowchart TD\nA["50%% off"] --> B["%%"]'), { header: 'flowchart TD', title: null, config: {}, lines: [{ n: 2, text: 'A["50%% off"] --> B["%%"]' }] })
})

test('A5.errors: %% outside double quotes falls back on any line, the header included', () => {
  const inputs = ['flowchart TD\nA["x"]%%', 'flowchart TD\nA[""] --> B %% see "notes"', `flowchart TD\nA['50%% off']`, 'flowchart TD %% x\nA']
  assert.deepEqual(inputs.map(t => [t, readSource(t)]), inputs.map(t => [t, { reason: 'directive' }]))
})

test('A5.errors: a frontmatter title with an unsupported character fails unsupported-char, whatever the diagram type', () => {
  assert.deepEqual(readSource('---\ntitle: "x‍y"\n---\nflowchart TD\nA'), { reason: 'unsupported-char U+200D' })
  assert.deepEqual(readSource('---\ntitle: a‍b\n---\nsequenceDiagram\nA->>B: hi'), { reason: 'unsupported-char U+200D' })
  assert.equal((readSource('---\ntitle: 读取配置\n---\nflowchart TD\nA') as Source).title, '读取配置')
})
