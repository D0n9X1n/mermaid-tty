import test from 'node:test'; import assert from 'node:assert/strict'
import { parseGitGraph } from '../../core/diagrams/gitGraph/parse.ts'; import { readSource } from '../../core/source.ts'
const P = (src: string) => { const s = readSource(src); return ('reason' in s ? s : parseGitGraph(s)) as any }
test('A5: commits, tags, types, branch order, checkout and switch, merge and cherry-pick; attributes in any order', () => {
  const g = P(['gitGraph', 'commit id: "a" tag: "v1" tag: "v1.1"', 'branch dev order: 2', 'commit type: HIGHLIGHT', 'commit "b" id: "b" type: REVERSE', 'checkout main',
    'merge dev tag: "rel" id: "m"', 'branch "feature/x.y"', 'switch feature/x.y', 'commit msg: "bare"', 'cherry-pick id: "b"'].join('\n'))
  assert.deepEqual(g.branches, [{ name: 'main', order: 0 }, { name: 'dev', order: 2 }, { name: 'feature/x.y', order: 0 }])
  assert.deepEqual(g.events.map((e: any) => [e.kind, e.branch, e.id, e.msg, e.tags, e.type]), [['start', 'main', null, null, [], null],
    ['commit', 'main', 'a', null, ['v1', 'v1.1'], 'NORMAL'], ['start', 'dev', null, null, [], null], ['commit', 'dev', null, null, [], 'HIGHLIGHT'],
    ['commit', 'dev', 'b', 'b', [], 'REVERSE'], ['merge', 'main', 'm', null, ['rel'], null], ['start', 'feature/x.y', null, null, [], null],
    ['commit', 'feature/x.y', null, 'bare', [], 'NORMAL'], ['pick', 'feature/x.y', 'b', null, ['cherry-pick:b'], null]])
  assert.equal(P('gitGraph\ncommit\nbranch d\ncommit\ncheckout main\nmerge d type: NORMAL').events.at(-1).type, 'NORMAL')   // explicit, unlike the untyped merge's null
})
test('A5: headers gitGraph, gitGraph:, LR:, TB:, BT:; mainBranchName and mainBranchOrder from frontmatter config', () => {
  assert.deepEqual(['gitGraph', 'gitGraph:', 'gitGraph LR:', 'gitGraph TB:', 'gitGraph BT:'].map(h => P(`${h}\ncommit`).dir), ['LR', 'LR', 'LR', 'TB', 'BT'])
  const g = P('---\nconfig:\n  gitGraph:\n    mainBranchName: trunk\n    mainBranchOrder: 2\n---\ngitGraph\ncommit')
  assert.deepEqual([g.branches, g.events[1].branch], [[{ name: 'trunk', order: 2 }], 'trunk'])
})
test('A5.errors: what Mermaid throws on falls back, and so do repeated ids and attributes and an unknown type', () => {
  for (const [body, why] of [['commit\ncheckout nope', 'checkout:3'], ['commit\nbranch develop\ncheckout main\nmerge develop', 'merge:5'],
    ['branch develop\nbranch develop', 'branch:3'], ['commit id: "Boston"\ncommit id: "Boston"', 'repeat:3'], ['commit id: "a" id: "b"', 'repeat:2'],
    ['commit type: BOLD', 'syntax:2'], ['commit\nbranch b\ncommit\ncheckout main\nmerge b id: "m"\nbranch c\ncommit\ncherry-pick id: "m"', 'pick:9']] as const)
    assert.deepEqual(P(`gitGraph\n${body}`), { reason: why }, body)
})
const E = (body: string) => P(`gitGraph\n${body}`).reason
test('A5.errors: every merge gitGraphAst throws on', () => {
  for (const [body, why] of [['commit\nmerge main', 'merge:3'], ['commit\nmerge nope', 'merge:3'], ['branch b\ncommit\ncheckout main\nmerge b', 'merge:5'],
    ['branch b\ncheckout main\ncommit\nmerge b', 'merge:5'], ['commit\nbranch b\ncheckout main\nmerge b', 'merge:5'],
    ['commit\nbranch dev\ncommit\nbranch feat\ncheckout dev\ncommit\ncheckout feat\nmerge dev', 'merge:9'],   // feat's head sits on dev
    ['commit id: "a"\nbranch b\ncommit\ncheckout main\nmerge b id: "a"', 'repeat:6'], ['commit\nbranch main', 'branch:3'], ['checkout "nope"', 'checkout:2']] as const)
    assert.equal(E(body), why, body)
})
test('A5.errors: every cherry-pick gitGraphAst throws on', () => {
  const M = 'commit id: "Z"\nbranch dev\ncommit id: "A"\ncheckout main\ncommit id: "B"\nmerge dev id: "M"\nbranch rel\ncommit id: "R"\n'
  for (const [body, why] of [['cherry-pick', 'pick:2'], ['commit\nbranch b\ncommit\ncherry-pick id: "zz"', 'pick:5'],
    ['commit id: "a"\nbranch b\ncommit id: "x"\ncherry-pick id: "x"', 'pick:5'], ['branch e\ncheckout main\ncommit id: "a"\ncheckout e\ncherry-pick id: "a"', 'pick:6'],
    ['commit id: "x"\ncommit id: "a"\nbranch b\ncommit\ncherry-pick id: "a" parent: "a"', 'pick:6'], [M + 'cherry-pick id: "M" parent: "Z"', 'pick:10'],
    [M + 'cherry-pick id: "M"', 'pick:10']] as const)
    assert.equal(E(body), why, body)
  const tags = (b: string) => P(`gitGraph\n${b}`).events.at(-1).tags
  assert.deepEqual([tags(M + 'cherry-pick id: "M" parent: "B"'), tags(M + 'cherry-pick id: "M" parent: "A"')], [['cherry-pick:M|parent:B'], ['cherry-pick:M|parent:A']])
  assert.deepEqual(tags('commit id: "x"\ncommit id: "a"\nbranch b\ncommit\ncherry-pick id: "a" parent: "x"'), ['cherry-pick:a'])
  assert.deepEqual([tags(M + 'cherry-pick id: "A" tag: "mine"'), tags(M + 'cherry-pick id: "A" tag: "" tag: "t"')], [['mine'], ['t']])
})
test('A5: from is the branch holding the commit a start forks from, a merged head or a pick source', () => {
  const g = P('gitGraph\nbranch early\ncheckout main\ncommit id: "a"\nbranch dev\nbranch x\ncommit id: "b"\ncheckout main\nmerge x\ncheckout dev\ncherry-pick id: "b"')
  assert.deepEqual(g.events.map((e: any) => [e.kind, e.branch, e.from, e.line]), [['start', 'main', undefined, 0], ['start', 'early', undefined, 2],
    ['commit', 'main', undefined, 4], ['start', 'dev', 'main', 5], ['start', 'x', 'main', 6], ['commit', 'x', undefined, 7], ['merge', 'main', 'x', 9],
    ['pick', 'dev', 'x', 11]])
  // x has no commit of its own: its head is dev's, so the merge comes from dev's lane.
  assert.equal(P('gitGraph\ncommit\nbranch dev\ncommit\nbranch x\ncheckout main\nmerge x').events.at(-1).from, 'dev')
})
test('A5.errors: config is typed: a non-string or empty mainBranchName and a non-number mainBranchOrder fall back', () => {
  const C = (k: string, v: string) => P(`---\nconfig:\n  gitGraph:\n    ${k}: ${v}\n---\ngitGraph\ncommit`)
  assert.deepEqual(['5', 'true', '""', '"a<b"', 'null'].map(v => C('mainBranchName', v)), Array(5).fill({ reason: 'config:gitGraph.mainBranchName' }))
  assert.deepEqual(['"2"', 'x', 'null'].map(v => C('mainBranchOrder', v)), Array(3).fill({ reason: 'config:gitGraph.mainBranchOrder' }))
  assert.deepEqual(C('mainBranchName', '"trunk"').branches, [{ name: 'trunk', order: 0 }])
})
test('A5.errors: ids, tags, parents and branch names are escaped; a #…; entity anywhere fails with its line', () => {
  for (const [body, why] of [['commit id: "a<b"', 'html:2'], ['commit\ncommit tag: "x>y"', 'html:3'], ['branch "a<b"', 'html:2'],
    ['commit msg: "#9829;"', 'entity:2'], ['commit tag: "ﬂ°x"', 'entity:2'], ['title #9829;', 'entity:2'], ['title a<b', 'html:2'],
    ['commit id: "a‍b"', 'unsupported-char U+200D'], ['commit id: "a  b"', 'syntax:2'], ['commit tag: " t"', 'syntax:2'], ['branch "x "', 'syntax:2']] as const)
    assert.equal(E(body), why, body)
  const g = P('gitGraph\ncommit id: "Q&A" msg: "a<br>b" tag: "x y"\nbranch "分支"\ncommit id: "提交"')
  assert.deepEqual(g.events.slice(1).map((e: any) => [e.branch, e.id, e.msg, e.tags]), [['main', 'Q&A', 'a<br>b', ['x y']], ['分支', null, null, []], ['分支', '提交', null, []]])
})
test('A5.errors: what Mermaid\'s lexer reads another way, or its grammar rejects, falls back', () => {
  for (const body of ['Commit', 'commit;', 'commit id: "a";', 'commit msg: x', "commit id: 'a'", 'commit id: "a\\"b"', 'commit id:', 'commit type: normal',
    'commit parent: "a"', 'branch', 'branch ""', 'branch commit', 'branch LR', 'branch 1x', 'branch titled', 'branch a/', 'branch 分支', 'branch a order: 01',
    'branch a order: -1', 'branch a tag: "t"', 'checkout', 'checkout main main', 'merge', 'commit\nmerge main msg: "x"', 'cherry-pick id: "a" type: NORMAL',
    'gitGraph', 'title', 'title "a %% b"', 'commit id: "a\\nb"', 'commit msg: "a\\\\"'])
    assert.match(E(body), /^syntax:\d+$/, body)
  for (const body of ['commit "a" "b"', 'commit "a" msg: "b"', 'branch a order: 1 order: 2', 'commit\nbranch b\ncommit\ncheckout main\nmerge b type: NORMAL type: REVERSE'])
    assert.match(E(body), /^repeat:\d+$/, body)
  const g = P('gitGraph\ncommit id:"a" tag:"t"\nbranch a-b_c.d/e order:3\ncheckout "main"\ncommit "m" type:REVERSE tag: "u" id: "b"')
  assert.deepEqual([g.branches[1], g.events.at(-1)], [{ name: 'a-b_c.d/e', order: 3 }, { kind: 'commit', branch: 'main', id: 'b', msg: 'm', tags: ['u'], type: 'REVERSE', line: 5 }])
})
test('A5: title trimmed with runs of spaces joined; a second title, or one after a frontmatter title, falls back', () => {
  assert.equal(P('gitGraph\ntitle   My   log \ncommit').title, 'My log')
  assert.equal(E('title A\ntitle B'), 'repeat:3')
  assert.deepEqual(P('---\ntitle: F\n---\ngitGraph\ntitle B\ncommit'), { reason: 'repeat:5' })
})
test('A5: accTitle and accDescr are ignored; an unclosed accDescr block falls back; other headers fall back', () => {
  const g = P('gitGraph\naccTitle: Log <b>\naccDescr: x #1;\naccDescr {\n  a\n}\ncommit\naccDescr { b }')
  assert.deepEqual([g.title, g.events.length], [null, 2])
  assert.equal(E('commit\naccDescr {\nopen'), 'syntax:3')
  assert.equal(E('commit\naccDescr { a } x'), 'syntax:3')
  for (const h of ['gitGraph RL:', 'gitGraph LR', 'gitgraph', 'gitGraph :', 'gitGraph  TB:', 'gitGraph:LR'])
    assert.deepEqual(P(`${h}\ncommit`), { reason: 'header' }, h)
})
// X3. Mermaid 12.2.0's gitGraph grammar hides only WS /[ \t]+/ and ends a line at NEWLINE /\r?\n/: any other whitespace
// (U+00A0, U+2028, a form feed) is a lexer error, between tokens or at either end of a line.
test('X3: whitespace other than space and tab fails, where Mermaid throws a lexer error; spaces and tabs still separate', () => {
  for (const b of ['commit\u00a0id: "a"', 'commit id:\u00a0"a"', '\u00a0commit', 'commit\u00a0', 'commit\u2028id: "a"', 'commit id: "a"\u2028',
    'commit\fid: "a"']) assert.deepEqual(P(`gitGraph\n${b}`), { reason: 'syntax:2' }, JSON.stringify(b))
  assert.ok(!('reason' in P('gitGraph\n \tcommit\tid: "a" \t\n')))
})
