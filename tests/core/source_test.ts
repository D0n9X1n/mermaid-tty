import test from 'node:test'
import assert from 'node:assert/strict'
import { readSource, type Source } from '../../core/source.ts'

test('A1: CRLF normalized once; frontmatter title; %% comments skipped', () => {
  const s = readSource('---\r\ntitle: "Flow"\r\n---\r\nflowchart TD\r\n%% note\r\n\r\nA-->B\r\n') as Source
  assert.deepEqual([s.header, s.title, s.lines.map(l => l.text)], ['flowchart TD', 'Flow', ['A-->B']])
})

test('A5.errors: a trailing %% falls back; %% { is a comment', () => {
  assert.deepEqual(readSource('flowchart TD\nA-->B %% x'), { reason: 'directive' })
  assert.deepEqual(readSource('flowchart TD\n%% {not a directive}\nA'), { header: 'flowchart TD', title: null, config: {}, lines: [{ n: 3, text: 'A' }] })
})

// #16. Mermaid 12.2.0's detectInit reads every %%{init: …}%% or %%{initialize: …}%% in the text, ' made ", by JSON.parse,
// merging them in order; a %%{wrap}%% sets wrap true after them; then cleanAndMerge lays the lot over the frontmatter
// config, and both reach addDirective. Each case below was checked with mermaid.parse under JSDOM.
const D = (t: string) => readSource(t) as Source
test('#16: a whole-line init, initialize or wrap directive sets config as frontmatter config does, and is dropped', () => {
  assert.deepEqual(D("%%{init: {'theme':'dark'}}%%\nflowchart TD\nA"), { header: 'flowchart TD', title: null, config: { theme: 'dark' }, lines: [{ n: 3, text: 'A' }] })
  assert.deepEqual(D('%%{ initialize : { "theme" : "forest", "htmlLabels": true } }%%\nflowchart TD\nA').config, { theme: 'forest', htmlLabels: true })
  assert.deepEqual(D('flowchart TD\nA\n  %%{init: {"themeVariables": {"primaryColor": "#f00"}}}%%  \nB').lines, [{ n: 2, text: 'A' }, { n: 4, text: 'B' }])
  assert.deepEqual(D('%%{init: {}}%%\nflowchart TD\nA').config, {})
  assert.deepEqual(D('%%{wrap}%%\nsequenceDiagram\nA->>B: hi').config, { wrap: true })
  assert.deepEqual(D('%%{wrap}%%\n%%{init: {"wrap": false}}%%\nsequenceDiagram\nA->>B: hi').config, { wrap: true })
  assert.deepEqual(D('%%{init: {"gitGraph": {"mainBranchName": "a", "showBranches": false}}}%%\n%%{init: {"gitGraph": {"mainBranchName": "b"}}}%%\ngitGraph\ncommit').config,
    { 'gitGraph.mainBranchName': 'b', 'gitGraph.showBranches': false })
  assert.deepEqual(D('---\nconfig:\n  gitGraph:\n    mainBranchName: x\n    showBranches: true\n---\n%%{init: {"gitGraph": {"mainBranchName": "y", "mainBranchOrder": 1e1}}}%%\ngitGraph\ncommit').config,
    { 'gitGraph.mainBranchName': 'y', 'gitGraph.showBranches': true, 'gitGraph.mainBranchOrder': 10 })
})
test('#16: a directive Mermaid reads otherwise, or one that sets what changes the drawing, falls back', () => {
  const bad = ['%%{init: {"htmlLabels": false}}%%', '%%{init: {"flowchart": {"htmlLabels": 1}}}%%', '%%{init: {theme: dark}}%%', `%%{init: {"theme": "it's"}}%%`,
    '%%{INIT: {"theme": "dark"}}%%', '%%{init: {"theme": "dark"}}%% A', '%%{init: {"theme": "dark"}', '%%{init: {"config": {"x": 1}}}%%',
    '%%{init: {"mindmap": {"colorBy": null}}}%%', '%%{init: {"a": [1]}}%%', '%%{init: {"a": {}}}%%', '%%{init: {"a": 1e400}}%%', '%%{init: ["x"]}%%',
    '%%{init: "x"}%%', '%%{init: {"__proto__": {"x": 1}}}%%', '%%{init: {"a.b": 1}}%%', '%%{init: {"a": "%%"}}%%', '%%{init: dark}%%', '%%{nowrap}%%',
    '%%{wrap: true}%%', '%%{theme: {"a": 1}}%%', '%%{init: {"gitGraph": 1}}%%\n%%{init: {"gitGraph": {"x": 1}}}%%',
    '%%{init: {"htmlLabels": false}}%%\n%%{init: {"htmlLabels": true}}%%']
  assert.deepEqual(bad.map(d => [d, readSource(`${d}\nflowchart TD\nA`)]), bad.map(d => [d, { reason: 'directive' }]))
  assert.deepEqual(readSource('---\nconfig:\n  htmlLabels: false\n---\n%%{init: {"htmlLabels": true}}%%\nflowchart TD\nA'), { reason: 'config:htmlLabels' })
  assert.deepEqual(readSource('---\nconfig:\n  gitGraph: 1\n---\n%%{init: {"gitGraph": {"x": 1}}}%%\ngitGraph\ncommit'), { reason: 'directive' })
})

test('A1: lines keep 1-based source numbers past frontmatter and skipped lines; a lone CR ends a line', () => {
  const s = readSource('---\ntitle: T\n---\nflowchart TD\rA-->B\r\n\r\n%% c\nB-->C') as Source
  assert.deepEqual(s.lines, [{ n: 5, text: 'A-->B' }, { n: 8, text: 'B-->C' }])
})

test('A1: the header is the first kept line, trimmed, with only a trailing ; removed', () => {
  assert.deepEqual(readSource('\n%% c\n  graph LR;  \nA-->B'), { header: 'graph LR', title: null, config: {}, lines: [{ n: 4, text: 'A-->B' }] })
  assert.deepEqual(readSource('graph LR; A-->B\nC'), { header: 'graph LR; A-->B', title: null, config: {}, lines: [{ n: 2, text: 'C' }] })
})
// F1 (pie QA): Mermaid's TITLE terminal keeps a trailing ;, so `pie title Fruit;` is titled "Fruit;". Only A's headers, whose
// grammars take a ; as a statement end, lose it; every other header keeps it, so its own parser reads or rejects it.
test('A1: a trailing ; is removed only from a flowchart, graph or sequenceDiagram header', () => {
  for (const [h, want] of [['flowchart TD;', 'flowchart TD'], ['graph LR;', 'graph LR'], ['sequenceDiagram;', 'sequenceDiagram'],
    ['pie title Fruit;', 'pie title Fruit;'], ['xychart-beta;', 'xychart-beta;'], ['stateDiagram-v2;', 'stateDiagram-v2;']] as const)
    assert.equal((readSource(`${h}\nA`) as { header: string }).header, want, h)
})

test('A1: indented %% comments and whitespace-only lines are skipped; kept lines keep their indentation', () => {
  assert.deepEqual(readSource('flowchart TD\n    %% note\n \t \n    A --> B'), { header: 'flowchart TD', title: null, config: {}, lines: [{ n: 4, text: '    A --> B' }] })
})

test('A1: frontmatter title is one quoted or plain scalar; other keys, nested ones included, are ignored', () => {
  const titleOf = (fm: string) => (readSource(`---\n${fm}\n---\nflowchart TD\nA`) as Source).title
  assert.deepEqual(
    [`title: 'Flow'`, 'title:   Flow  ', 'title: ""', `title: It's "fine"`, 'title: 50%% off', 'config:\n  title: nested\ndisplayMode: compact\ntitleTopMargin: 5'].map(titleOf),
    ['Flow', 'Flow', null, `It's "fine"`, '50%% off', null])
  assert.deepEqual(readSource('---\n---\nflowchart TD\nA'), { reason: 'frontmatter' })   // adjacent fences: Mermaid finds no block (fix cycle 1)
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

// T41b: config scalars are typed as Mermaid's frontmatter.ts reads them, with js-yaml's JSON_SCHEMA.
// The value read for `config:` / `  a: <v>`, or the Fail.
const one = (v: string) => { const s = readSource(`---\nconfig:\n  a: ${v}\n---\ngitGraph\ncommit`); return 'reason' in s ? s : s.config['a'] }

test('A5: a plain config scalar is typed as js-yaml JSON_SCHEMA types it: null, bool, safe int, else string', () => {
  const rows: [string, unknown][] = [['~', null], ['null', null], ['Null', null], ['NULL', null],
    ['true', true], ['True', true], ['TRUE', true], ['false', false], ['False', false], ['FALSE', false],
    ['0', 0], ['-0', 0], ['7', 7], ['-1', -1], ['2024', 2024], ['9007199254740991', 9007199254740991], ['-9007199254740991', -9007199254740991],
    ['false # off', false], ['2 # two', 2], ['nULL', 'nULL'], ['tRUE', 'tRUE'], ['yes', 'yes'], ['on', 'on'], ['depth', 'depth'],
    ['2024 Roadmap', '2024 Roadmap'], ['50%', '50%'], ['x1', 'x1']]
  assert.deepEqual(rows.map(([v]) => [v, one(v)]), rows)
})

// js-yaml 4.3.0 (bundled by Mermaid 12.2.0) resolves int before float; its float type reads these as parseFloat does.
test('A5: a plain finite decimal config scalar is a number, as js-yaml JSON_SCHEMA reads it', () => {
  const rows: [string, unknown][] = [['0.5', 0.5], ['1.5', 1.5], ['-0.5', -0.5], ['0.0', 0], ['-0.0', -0], ['10.25', 10.25],
    ['2.5e3', 2500], ['2.5E3', 2500], ['1.5e-2', 0.015], ['1.5e+2', 150], ['0.5 # half', 0.5]]
  assert.deepEqual(rows.map(([v]) => [v, one(v)]), rows)
  // Pie ignores pie.textPosition; Mermaid's pie docs example now draws instead of falling back.
  assert.ok(!('reason' in readSource('---\nconfig:\n  pie:\n    textPosition: 0.5\n---\npie\n"a" : 1')))
})

test('A5: a quoted config scalar stays a string, whatever it spells', () => {
  const spellings = ['~', 'null', 'NULL', 'true', 'False', '0', '-1', '2024', '0x10', '1e3', '.inf', '9007199254740993', '']
  const rows = spellings.flatMap(v => [`"${v}"`, `'${v}'`].map(q => [q, v] as const))
  assert.deepEqual(rows.map(([q]) => [q, one(q)]), rows)
})

test('A5.errors: any other numeric-looking plain config scalar fails config:<dotted key>', () => {
  const bad = ['0x10', '0o7', '0b1', '1e3', '.5', '.inf', '-.inf', '.nan', '+1', '1_000', '01', '007', '-.5', '-x',
    '9007199254740992', '9007199254740993', '-9007199254740992',
    '1.', '+1.5', '01.5', '00.5', '1.5_0', '1_0.5', '1.2.3', '1.5e', '1.5e3.0', '1e+3', '1.5e400', '-1.5e400', '1.5f']
  assert.deepEqual(bad.map(v => [v, one(v)]), bad.map(v => [v, { reason: 'config:a' }]))
  // The block's form is checked first: in a block T41 rejects, a numeric-looking scalar still falls back as frontmatter.
  for (const fm of ['config:\n  a: 1.5\n  a: 2', 'config:\n  a: 1.5\n  b: [1]', 'config:\n  a: 1.5\n  b:'])
    assert.deepEqual(readSource(`---\n${fm}\n---\ngitGraph\ncommit`), { reason: 'frontmatter' }, fm)
})

// T41b: the top-level title is one scalar, read by the same rules, and printed as Mermaid's
// frontmatter.ts prints it: `if (parsed.title) metadata.title = parsed.title.toString()`.
// The title read from `title: <v>`, or the Fail.
const titled = (v: string) => { const s = readSource(`---\ntitle: ${v}\n---\nflowchart TD\nA`); return 'reason' in s ? s : s.title }

test('A1: a frontmatter title drops its comment and decodes its escapes', () => {
  const rows: [string, unknown][] = [['Ideas # draft', 'Ideas'], ['Ideas\t# draft', 'Ideas'], ['Ideas # x‍y', 'Ideas'], ['a#b', 'a#b'],
    ['"He said \\"hi\\"" # note', 'He said "hi"'], ["'it''s' # note", "it's"], ['"Q #1"', 'Q #1'], ['"2024"', '2024'], ['"false"', 'false'],
    ['2024 Roadmap', '2024 Roadmap'], ['\tFlow', 'Flow']]
  assert.deepEqual(rows.map(([v]) => [v, titled(v)]), rows)
  assert.equal((readSource('---\ntitle:\tFlow\n---\nflowchart TD\nA') as Source).title, 'Flow')   // a tab may separate, as in js-yaml
})

test('A1: a null, false or empty frontmatter title means no title, as in Mermaid', () => {
  const none = ['', '~', 'null', 'Null', 'NULL', 'false', 'False', 'FALSE', '""', "''", 'false # off', '"" # none']
  assert.deepEqual(none.map(v => [v, titled(v)]), none.map(v => [v, null]))
})

test('A5.errors: a true, numeric or numeric-looking frontmatter title falls back as title', () => {
  const bad = ['true', 'True', 'TRUE', '0', '-1', '2024', '2024 # year', '0x10', '1e3', '.5', '007', '9007199254740993']
  assert.deepEqual(bad.map(v => [v, titled(v)]), bad.map(v => [v, { reason: 'title' }]))
  // A second title still falls back as title, after a null, false or malformed first one.
  for (const fm of ['title: false\ntitle: B', 'title: ~\ntitle: B', 'title: "a" b\ntitle: B'])
    assert.deepEqual(readSource(`---\n${fm}\n---\nflowchart TD\nA`), { reason: 'title' }, fm)
})

test('A5.errors: a frontmatter title outside the strict YAML subset falls back as frontmatter', () => {
  const bad = [`"Flow'`, '"open', "'open", '"a" b', '"a\\q"', '[a, b]', '{ a: 1 }', '&t x', '*t', '!!str x', '|', '>', '- x', 'a: b', '# draft']
  assert.deepEqual(bad.map(v => [v, titled(v)]), bad.map(v => [v, { reason: 'frontmatter' }]))
  assert.deepEqual(readSource('---\ntitle:x\n---\nflowchart TD\nA'), { reason: 'frontmatter' })
})

// T41b: a title that js-yaml would read as another title falls back. The Source or
// Fail read from frontmatter written one YAML line per argument.
const front = (...ls: string[]) => readSource(`---\n${ls.join('\n')}\n---\nflowchart TD\nA`)

test('A5.errors: a top-level title key with spaces or a tab before its colon falls back as title', () => {
  const bad = [['title : X'], ['title\t: X'], ['title: A', 'title : B'], ['config:', '  a: 1', 'title : X']]
  assert.deepEqual(bad.map(ls => [ls, front(...ls)]), bad.map(ls => [ls, { reason: 'title' }]))
})

test('A5.errors: an indented line after the title line continues it in js-yaml, so it falls back as title', () => {
  const bad = [['title: Hello', '  World'], ['title:', '  World'], ['title: Hello', '', '  World'], ['title: Hello', '# note', '  World'],
    ['title: Hello', '  # note', '  World'], ['title: "Hello"', '  World'], ['title:', '  - a'], ['title:', '  a: 1']]
  assert.deepEqual(bad.map(ls => [ls, front(...ls)]), bad.map(ls => [ls, { reason: 'title' }]))
  // Blank and comment lines do not count, and an unindented line ends the title.
  const ok = [['title: Hello', 'config:', '  a: 1'], ['title: Hello', '', 'config:', '  a: 1'], ['title: Hello', '  # note', 'config:', '  a: 1']]
  assert.deepEqual(ok.map(ls => { const s = front(...ls) as Source; return [s.title, s.config] }), ok.map(() => ['Hello', { a: 1 }]))
})
// F2 (pie QA): before parsing, Mermaid's encodeEntities drops the last ; of any line that matches style…:…#…; or
// classDef…:…#…;, wherever it sits, so a body line is read as Mermaid's parser reads it.
test("A1: a line matching Mermaid's style or classDef colour rewrite loses its last ;, as Mermaid's parser sees it", () => {
  const lines = (readSource('pie\n"style x:#;" : 1\nclassDef hot fill:#f00;\n"a;b" : 2') as { lines: { text: string }[] }).lines.map(l => l.text)
  assert.deepEqual(lines, ['"style x:#" : 1', 'classDef hot fill:#f00', '"a;b" : 2'])
})
// Fix cycle 1: Mermaid's `#.*;` is greedy, so a second ; after the # tells it from a lazy `#.*?;`.
test("A1: (8) the colour rewrite drops a line's last ; after the #, as Mermaid's greedy #.*; does", () => {
  const lines = (readSource('pie\n"style x:#a; b;" : 1\nclassDef c fill:#f00;x;') as Source).lines.map(l => l.text)
  assert.deepEqual(lines, ['"style x:#a; b" : 1', 'classDef c fill:#f00;x'])
})

test('X4: a %%{ anywhere after the frontmatter is a directive Mermaid applies, inside a comment or quotes too', () => {
  const inputs = ['flowchart LR\nA-->B\n%% x %%{init: {"htmlLabels": false}}%%', `flowchart LR\nA["a %%{init: {'htmlLabels': false}}%% b"]-->B`,
    '%% c %%{init: {}}%%\nflowchart LR\nA-->B']
  assert.deepEqual(inputs.map(t => [t, readSource(t)]), inputs.map(t => [t, { reason: 'directive' }]))
})

test('X4: non-ASCII whitespace falls back where Mermaid 12.2.0\'s lexer for the header\'s type rejects it', () => {
  const ws = ['pie\n \n"a" : 1', 'pie \n"a" : 1', 'pie\n "a" : 1', 'pie title A B\n"a" : 1', 'mindmap\n \nroot', 'mindmap　\nroot',
    'quadrantChart\n \nA: [0.1, 0.2]', 'quadrantChart \nA: [0.1, 0.2]']
  assert.deepEqual(ws.map(t => [t, readSource(t)]), ws.map(t => [t, { reason: 'whitespace' }]))
  // Jison's \s skips them in flowchart's header line and blank lines, so these read as their ASCII twins; mindmap indents too.
  for (const [odd, plain] of [['flowchart LR\n \nA-->B', 'flowchart LR\n\nA-->B'], ['flowchart LR \nA-->B', 'flowchart LR\nA-->B'],
    ['mindmap\nroot\n  a', 'mindmap\nroot\n  a'], ['pie\n"a b" : 1', 'pie\n"a b" : 1']]) {
    const a = readSource(odd), b = readSource(plain)
    assert.ok(!('reason' in a), JSON.stringify(odd))
    assert.equal(JSON.stringify(a).length, JSON.stringify(b).length, JSON.stringify(odd))
  }
})
