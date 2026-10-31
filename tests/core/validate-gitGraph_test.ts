import test from 'node:test'
import assert from 'node:assert/strict'
import { explain } from '../../core/render.ts'
import { validate } from '../../core/validate.ts'
const X = (body: string, columns = 80) => (explain(`gitGraph\n${body}`, { columns, theme: 'mono' }) as any).drawing
// Rows: ╷ main, ● root, ├─╮ a, │ ● a1, ├─┼─╮ b, │ ╵ ● b1, ◉───┘ m. Lane a runs on past a1 with no link, under b's fork, and
// ends a row before the merge, which runs over its empty column.
const CROSS =
  'commit id: "root"\nbranch a\ncommit id: "a1"\ncheckout main\nbranch b\ncommit id: "b1"\ncheckout main\nmerge b id: "m"'

test('A3: a connector over a lane records both arms: the lane is an owner of the crossing cell; a lane that ends is not crossed', () => {
  const d = X(CROSS)
  assert.equal(validate(d), null)
  assert.deepEqual([d.cells[4][2].ch, d.cells[4][2].dirs, d.cells[6][2].ch, d.cells[6][2].dirs], ['┼', 15, '─', 10])
  assert.ok(d.cells[4][2].segs.some((x: any) => x.owner === 'lane:a'))
  assert.deepEqual([d.cells[5][2].ch, d.cells[6][2].segs], ['╵', [{ owner: 'm6', dirs: 10 }]])
})
test('A5.mutation-tests: a crossing glyph that is not what its arms draw fails line-glyph', () => {
  for (const [r, chs] of [
    [6, '┴┼┬'],
    [4, '─┴┬'],
  ] as const) {
    for (const ch of chs) {
      const d = structuredClone(X(CROSS))
      d.cells[r][2] = { ...d.cells[r][2], ch }
      assert.deepEqual(validate(d), { reason: 'line-glyph' }, `${r} ${ch}`)
    }
  }
})
test('A5.mutation-tests: removing the lane stretch a crossing continues leaves its arm dangling', () => {
  const d = structuredClone(X(CROSS))
  d.cells[5][2] = null
  assert.deepEqual(validate(d), { reason: 'line-dangling' })
})
// Rows: ╷ main, ● a, ⊗ b, ■ c, ◉─┘ m (with dev's lane), so every type's glyph is drawn once.
const TYPES =
  'commit id: "a"\ncommit id: "b" type: REVERSE\ncommit id: "c" type: HIGHLIGHT\nbranch dev\ncommit id: "d"\ncheckout main\nmerge dev id: "m"'
test('A3: each commit declares its glyph, and each unforked lane its opening cap, owned by its start s<i>', () => {
  const d = X(TYPES)
  assert.equal(validate(d), null)
  assert.deepEqual(d.expect.glyphs, [
    { owner: 's0', ch: '╷' },
    { owner: 'c1', ch: '●' },
    { owner: 'c2', ch: '⊗' },
    { owner: 'c3', ch: '■' },
    { owner: 'c5', ch: '●' },
    { owner: 'c6', ch: '◉' },
  ])
})
test("A5.mutation-tests: a commit drawn with another type's glyph fails glyph-wrong", () => {
  for (const [r, c] of [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
    [5, 2],
    [6, 0],
  ]) {
    for (const ch of '●⊗■◉◎╵') {
      const d = structuredClone(X(TYPES))
      if (d.cells[r][c].ch === ch) {
        continue
      }
      d.cells[r][c] = { ...d.cells[r][c], ch }
      assert.deepEqual(validate(d), { reason: 'glyph-wrong' }, `${r},${c} ${ch}`)
    }
  }
})
// Moves every text cell each owner draws (owners[0]) down by its dr, all lifted before any is placed, so labels can swap.
function relocate(d: any, moves: [string, number][]): any {
  const lifted: [number, number, any][] = []
  for (const [owner, dr] of moves) {
    d.cells.forEach((row: any[], r: number) =>
      row.forEach((x, c) => {
        if (x && (x.kind === 'text' || x.kind === 'cont') && x.owners[0] === owner) {
          lifted.push([r + dr, c, x])
          row[c] = null
        }
      }),
    )
  }
  for (const [r, c, x] of lifted) {
    d.cells[r][c] = x
  }
  return d
}
const LOG = 'commit id: "a"\nbranch dev\ncommit id: "b"\ncheckout main\nmerge dev id: "m"'
test("A3: each row lists its mark and the labels drawn beside it, a forked start's mark on its corner", () => {
  const d = X(LOG + ' tag: "t"')
  assert.equal(validate(d), null)
  assert.deepEqual(d.expect.rows, [
    { mark: 's0', owners: ['b:main'] },
    { mark: 'c1', owners: ['e1'] },
    { mark: 's2', owners: ['b:dev'] },
    { mark: 'c3', owners: ['e3'] },
    { mark: 'c4', owners: ['e4', 'e4.t0'] },
  ])
  assert.ok(d.cells[2][2].owners.includes('s2'))
})
test("A5.mutation-tests: a tag, commit id or branch name drawn on another commit's row fails label-unbound", () => {
  const TAG = 'commit id: "a" tag: "v1"\ncommit id: "b"'
  assert.equal(validate(X(TAG)), null)
  assert.deepEqual(validate(relocate(structuredClone(X(TAG)), [['e1.t0', 1]])), { reason: 'label-unbound' }) // ● b [v1]
  assert.deepEqual(
    validate(
      relocate(structuredClone(X(TAG)), [
        ['e1', 1],
        ['e2', -1],
      ]),
    ),
    { reason: 'label-unbound' },
  )
  assert.deepEqual(
    validate(
      relocate(structuredClone(X(LOG)), [
        ['b:main', 2],
        ['b:dev', -2],
      ]),
    ),
    { reason: 'label-unbound' },
  )
  // Rows: ╷   main, ●, ├─╮ dev, │ ●, ● │ aaa bbb, │ │ ccc, ╵ ●: ccc, a wrapped piece, moved under the next commit's row.
  const wrapped = structuredClone(
    X('commit\nbranch dev\ncommit\ncheckout main\ncommit msg: "aaa bbb ccc"\ncheckout dev\ncommit', 12),
  )
  assert.equal(validate(wrapped), null)
  for (let c = 4; c < 7; c++) {
    wrapped.cells[6][c] = wrapped.cells[5][c]
    wrapped.cells[5][c] = null
  }
  assert.deepEqual(validate(wrapped), { reason: 'label-unbound' })
})
