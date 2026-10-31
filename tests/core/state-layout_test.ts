import test from 'node:test'
import assert from 'node:assert/strict'
import { explain } from '../../core/render.ts'
import { state } from '../../core/diagrams/state/layout.ts'
import { parseState } from '../../core/diagrams/state/parse.ts'
import { readSource, type Source } from '../../core/source.ts'
import { text } from './graph-fixture.ts'
const X = (body: string, columns = 80) => explain(`stateDiagram-v2\n${body}`, { columns, theme: 'mono' }) as any
const count = (t: string, g: string) => [...t].filter((c) => c === g).length
test('A3: states are round pills; each scope draws one ● and one ◉; a composite is a titled frame', () => {
  const r = X(
    [
      '[*] --> Still',
      'Still --> Moving',
      'Moving --> [*]',
      'state Moving {',
      '  [*] --> Fast',
      '  Fast --> [*]',
      '}',
    ].join('\n'),
  )
  const t = text(r.drawing).join('\n')
  assert.equal(r.step, 'natural')
  assert.match(t, /\( Still \)/)
  assert.match(t, /┌─Moving─*┐/)
  assert.deepEqual([count(t, '●'), count(t, '◉')], [2, 2])
})
test('A3: a choice is ◇; fork and join bars are ━ in TB and ┃ in LR', () => {
  const fj = (dir: string) =>
    text(
      X(
        [
          `direction ${dir}`,
          'state f <<fork>>',
          'state j <<join>>',
          '[*] --> f',
          'f --> a',
          'f --> b',
          'a --> j',
          'b --> j',
          'j --> [*]',
        ].join('\n'),
      ).drawing,
    ).join('\n')
  assert.match(fj('TB'), /━━━/)
  assert.match(fj('LR'), /┃/)
  assert.doesNotMatch(fj('LR'), /━/)
  assert.match(text(X('state c <<choice>>\n[*] --> c\nc --> a : yes\nc --> b : no').drawing).join('\n'), /◇/)
})
test('A4.fit-ladder: the state ladder; notes too wide for their slot become keys a, b with a legend', () => {
  assert.deepEqual(state.steps(parseState(readSource('stateDiagram-v2\ndirection LR\nA --> B') as Source) as never), [
    'natural',
    'tight',
    'wrap',
    'lrToTd',
    'keyed',
  ])
  const W = 'Supercalifragilisticexpialidocious'
  const r = X(`A --> B\nnote left of A : ${W}\nnote right of B : ${W}`, 40)
  assert.equal(r.step, 'keyed')
  assert.deepEqual(text(r.drawing).slice(-2), [`a ${W}`, `b ${W}`])
})

// The role of each glyph or text in the drawing: the first cell whose ch starts s, or whose row holds s as text.
const roleOf = (d: any, s: string): string | undefined => {
  for (const row of d.cells) {
    const line = row.map((c: any) => (c === null ? ' ' : c.kind === 'cont' ? '' : c.ch)).join('')
    const at = line.indexOf(s)
    if (at < 0) {
      continue
    }

    let col = 0
    let i = 0
    for (; i < row.length && col < at; i++) {
      col += row[i] === null ? 1 : row[i].kind === 'cont' ? 0 : row[i].ch.length
    }

    return row[i]?.role
  }

  return undefined
}
test('A3: roles: states, ● ◉ and bars node; ◇ decision; composites frame; transition labels label; notes note', () => {
  const d = X(
    [
      '[*] --> Idle',
      'Idle --> C : go',
      'state C {',
      '  [*] --> In',
      '}',
      'state ch <<choice>>',
      'Idle --> ch',
      'ch --> [*]',
      'state f <<fork>>',
      'Idle --> f',
      'f --> P',
      'f --> Q',
      'note right of Idle : memo',
    ].join('\n'),
  ).drawing
  assert.deepEqual(
    ['Idle', '●', '◉', '━', '◇', '┌─C', 'go', 'memo'].map((s) => roleOf(d, s)),
    ['node', 'node', 'node', 'node', 'decision', 'frame', 'label', 'note'],
  )
})
test('A4.fit-ladder: keyed notes list every note as keyable and key each in place', () => {
  const W = 'Supercalifragilisticexpialidocious'
  const r = X(`A --> B\nnote left of A : ${W}\nnote right of B : ${W}`, 40)
  assert.deepEqual(r.drawing.expect.keyable, [
    { item: 'A:note', cls: 'note' },
    { item: 'B:note', cls: 'note' },
  ])
  assert.deepEqual(
    r.drawing.expect.keys.map((k: any) => [k.key, k.item, k.cls]),
    [
      ['a', 'A:note', 'note'],
      ['b', 'B:note', 'note'],
    ],
  )
  assert.equal(roleOf(r.drawing, 'a ┄┄'), 'note')
  const last = r.drawing.cells.at(-1).filter((c: any) => c !== null && c.ch !== ' ')
  assert.deepEqual([...new Set(last.map((c: any) => c.role))], ['note'])
})
test('A4.fit-ladder: a keyed multi-line note joins its lines with spaces in the legend', () => {
  const W = 'Supercalifragilisticexpialidocious'
  const r = X(`A --> B\nnote left of A\n  ${W}\n  ${W}\nend note\nnote right of B : ${W}`, 40)
  assert.equal(r.step, 'keyed')
  assert.deepEqual(text(r.drawing).slice(-3), [`a ${W}`, `  ${W}`, `b ${W}`])
})
test('A4.fit-ladder: keyed with no notes fails step; the frontmatter title draws above', () => {
  const m = parseState(readSource('stateDiagram-v2\nA --> B') as Source) as never
  assert.deepEqual(state.layout(m, 'keyed', 80), { reason: 'step' })
  const r = explain('---\ntitle: Lights\n---\nstateDiagram-v2\nA --> B', { columns: 80, theme: 'mono' }) as any
  assert.equal(text(r.drawing)[0], 'Lights')
})
test('A4.fit-ladder: keyed, notes take keys in source order, not node order', () => {
  const W = 'Supercalifragilisticexpialidocious'
  const r = X(`s1\ns2\nnote right of s2 : ${W}\ns2 --> s1\nnote left of s1 : ${W}`, 40)
  assert.equal(r.step, 'keyed')
  assert.deepEqual(
    r.drawing.expect.keys.map((k: any) => [k.key, k.item]),
    [
      ['a', 's2:note'],
      ['b', 's1:note'],
    ],
  )
  assert.deepEqual(
    r.drawing.expect.keyable.map((k: any) => k.item),
    ['s2:note', 's1:note'],
  )
})
