import test from 'node:test'
import assert from 'node:assert/strict'
import { explain } from '../../core/render.ts'
import { text } from './graph-fixture.ts'
const X = (body: string, columns = 80, h = 'gitGraph') => explain(`${h}\n${body}`, { columns, theme: 'mono' }) as any
const LOG = 'commit id: "a"\nbranch dev\ncommit id: "b"\ncheckout main\nmerge dev id: "m"'
test('A3: one row per event; lanes 2 cells apart; main opens with ╷; a fork ├─╮; a merge ◉─┤; one label column; BT flips', () => {
  // PM: a lane that ends draws only its real arms (┘), not ┤
  assert.deepEqual(text(X(LOG).drawing), ['╷   main', '●   a', '├─╮ dev', '│ ● b', '◉─┘ m'])
  assert.equal(text(X(LOG + ' type: NORMAL').drawing).at(-1), '●─┘ m') // an explicit NORMAL merge is not the default ◉
  assert.deepEqual(text(X(LOG, 80, 'gitGraph BT:').drawing), ['◉─┐ m', '│ ● b', '├─╯ dev', '●   a', '╵   main'])
})
test('A3: a connector that crosses a lane draws ┼; a lane it would end on ends a row before, so it never looks joined', () => {
  const AB = 'commit\nbranch a\ncommit\ncheckout main\nbranch b\ncommit\ncheckout main\n'
  assert.deepEqual(T(AB + 'merge b').slice(-3), ['├─┼─╮ b', '│ ╵ ●', '◉───┘'])
  assert.deepEqual(T(AB + 'merge b', 80, 'gitGraph BT:').slice(0, 3), ['◉───┐', '│ ╷ ●', '├─┼─╯ b'])
  assert.deepEqual(T(AB + 'branch c\ncommit\ncheckout main\nmerge c').slice(-3), ['├─┼─┼─╮ c', '│ ╵ ╵ ●', '◉─────┘'])
  assert.deepEqual(T(AB + 'branch c').slice(-3), ['├─┼─╮   b', '│ ╵ ●', '└─────╮ c'])
})
test('A4.fit-ladder: labels wrap at the label column; too many lanes fall back', () => {
  const long = `commit msg: "${'word '.repeat(12).trim()}"`
  assert.deepEqual([X(long, 80).step, X(long, 40).step], ['natural', 'wrap'])
  assert.ok('reason' in X(Array.from({ length: 30 }, (_, i) => `branch b${i}\ncommit\ncheckout main`).join('\n'), 60))
})
const T = (body: string, columns = 80, h = 'gitGraph') => text(X(body, columns, h).drawing)
test('A3: lanes sort by order, main by mainBranchOrder; a fork to the left draws ╭─┤, ╰─┤ in BT', () => {
  const cfg = '---\nconfig:\n  gitGraph:\n    mainBranchOrder: 2\n---\ngitGraph'
  assert.deepEqual(T('commit id: "a"\nbranch dev\ncommit id: "b"', 80, cfg), ['  ╷ main', '  ● a', '╭─┤ dev', '● ╵ b'])
  assert.deepEqual(T('commit id: "a"\nbranch dev\ncommit id: "b"', 80, cfg.replace(/gitGraph$/, 'gitGraph BT:')), [
    '● ╷ b',
    '╰─┤ dev',
    '  ● a',
    '  ╵ main',
  ])
  assert.deepEqual(T('branch z order: 1\ncheckout main\ncommit id: "a"\nbranch y\ncommit id: "b"'), [
    '╷     main',
    '│   ╷ z',
    '●   │ a',
    '├─╮ │ y',
    '╵ ● ╵ b',
  ])
})
test('A3: types and picks draw their glyphs; labels are id: msg, then each tag [t]; a merge its id and tags, a pick its tags', () => {
  assert.deepEqual(
    T('commit id: "a" msg: "hi" tag: "v1" tag: "v2"\ncommit "m" type: REVERSE\ncommit id: "c" type: HIGHLIGHT'),
    ['╷ main', '● a: hi [v1] [v2]', '⊗ m', '■ c'],
  )
  assert.equal(T(LOG + ' tag: "rel" type: REVERSE').at(-1), '⊗─┘ m [rel]')
  assert.equal(
    T('commit id: "a"\nbranch dev\ncommit id: "b"\ncheckout main\ncherry-pick id: "b"').at(-1),
    '◎ ╵ [cherry-pick:b]',
  )
})
test('A7: a lane inks its glyphs, name, fork and merge connector with its series; ids take label, tags note', () => {
  const d = X(LOG + ' tag: "t"').drawing
  const role = (r: number, c: number) => d.cells[r][c].role
  assert.deepEqual([role(0, 0), role(0, 4), role(1, 0), role(2, 0)], ['s1', 's1', 's1', 's2']) // the fork's ├ is dev's
  assert.deepEqual(
    [role(2, 1), role(2, 2), role(2, 4), role(3, 2), role(4, 1), role(4, 2), role(4, 0)],
    ['s2', 's2', 's2', 's2', 's2', 's2', 's1'],
  )
  assert.deepEqual([role(1, 4), role(4, 4), role(4, 6)], ['label', 'label', 'note'])
  assert.deepEqual(
    d.expect.labels.map((l: any) => l.text),
    ['main', 'a', 'dev', 'b', 'm', '[t]'],
  )
})
test('A4.fit-ladder: a wrapped label keeps running lanes beside it; a word wider than the label column falls back; the title heads', () => {
  const body = 'commit\nbranch dev\ncommit\ncheckout main\ncommit msg: "aaa bbb ccc"\ncheckout dev\ncommit'
  assert.equal(X(body, 12).step, 'wrap')
  assert.deepEqual(T(body, 12), ['╷   main', '●', '├─╮ dev', '│ ●', '● │ aaa bbb', '│ │ ccc', '╵ ●'])
  assert.deepEqual(T(body, 12, 'gitGraph BT:').slice(0, 4), ['╷ ●', '● │ aaa bbb', '│ │ ccc', '│ ●'])
  assert.deepEqual(X('commit id: "abcdefghij"', 8), { reason: 'too-wide' })
  assert.deepEqual(T('title Log\ncommit id: "a"'), ['Log', '╷ main', '● a'])
})
test('A3: a crossing over a lane that runs on stays ┼; every link with cells is an edge; nodes keep their lane order', () => {
  const t = T(
    'commit\nbranch a\ncommit\ncheckout main\nbranch b\ncommit\ncheckout main\nmerge b\ncommit\ncheckout a\ncommit',
  )
  assert.deepEqual(t.slice(-3), ['◉─┼─┤', '● │ │', '╵ ● ╵'])
  const d = X(LOG).drawing
  assert.deepEqual(
    d.expect.edges.map((e: any) => `${e.id}:${e.from}>${e.to}`),
    ['r3:c1>c3', 'r4:c1>c4', 'm4:c3>c4'],
  )
  assert.deepEqual(d.expect.order, [
    { ids: ['c1', 'c4'], column: true },
    { ids: ['c3'], column: true },
    { ids: ['c1', 'c3', 'c4'], column: false },
  ])
})
test('A5.mutation-tests: the validator catches two commits swapped, and a merge link drawn from the wrong lane', async () => {
  const { validate } = await import('../../core/validate.ts')
  const d = structuredClone(
    X('commit id: "a"\nbranch dev\ncommit id: "b"\ncommit id: "c"\ncheckout main\nmerge dev').drawing,
  )
  ;[d.cells[3][2], d.cells[4][2]] = [d.cells[4][2], d.cells[3][2]]
  assert.ok(validate(d))
  // no cell joins them: only expect.order pins them
  const adj = structuredClone(X('commit id: "a"\ncommit id: "b"').drawing)
  ;[adj.cells[1][0], adj.cells[2][0]] = [adj.cells[2][0], adj.cells[1][0]]
  assert.deepEqual(validate(adj), { reason: 'order-broken' })
  const M = (b: string) =>
    X(`commit\nbranch a\ncommit\ncheckout main\nbranch b\ncommit\ncheckout main\nmerge ${b}`).drawing
  const good = M('b')
  const wrong = M('a')
  assert.equal(validate(good), null)
  assert.ok(validate({ ...good, cells: wrong.cells }))
})
test('A5.errors: a fork point or merged head that replay leaves unclear fails link-ambiguous', () => {
  for (const body of [
    'commit id: "a"\nbranch x\ncheckout main\ncommit id: "c"\ncheckout x\nbranch y',
    'commit id: "a"\nbranch x\ncheckout main\ncommit id: "c"\nmerge x',
    'commit\nbranch dev\ncommit id: "b"\nbranch x\ncheckout dev\ncommit id: "d"\ncheckout main\nmerge x',
  ]) {
    assert.deepEqual(X(body), { reason: 'link-ambiguous' }, body)
  }

  assert.deepEqual(T('commit id: "a"\nbranch x\ncheckout main\ncommit id: "c"\ncheckout x\ncommit id: "d"'), [
    '╷   main',
    '●   a',
    '├─╮ x',
    '● │ c',
    '╵ ● d',
  ])
})
