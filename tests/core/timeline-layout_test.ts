import test from 'node:test'; import assert from 'node:assert/strict'
import { explain } from '../../core/render.ts'; import { text } from './graph-fixture.ts'
const X = (src: string, columns = 80) => explain(src, { columns, theme: 'mono' }) as any
const SOCIAL = 'timeline\n2002 : LinkedIn\n2004 : Facebook : Google'
test('A3: LR: one column per period: its pill, an axis with ● at each column, then its events in source order', () => {
  const r = X(SOCIAL); assert.equal(r.step, 'natural')
  assert.deepEqual(text(r.drawing), [' 2002' + ' '.repeat(8) + '2004', '●' + '─'.repeat(11) + '●' + '─'.repeat(9), ' LinkedIn    Facebook', ' '.repeat(13) + 'Google'])
})
test('A3: TD: a left axis: ● and the period on one row, then │ and its indented events', () =>
  assert.deepEqual(text(X(SOCIAL.replace('timeline', 'timeline TD')).drawing), ['● 2002', '│   LinkedIn', '● 2004', '│   Facebook', '│   Google']))
test('A4.fit-ladder: gap 2, then gap 1; a word wider than every capped column skips wrap, so TD; then fallback', () =>
  assert.deepEqual([22, 21, 20, 12, 11].map(c => X(SOCIAL, c).step ?? 'fallback'), ['natural', 'tight', 'lrToTd', 'lrToTd', 'fallback']))

// Beyond the plan's tests. A cell's kind, ink and owners, per row.
import { timeline } from '../../core/diagrams/timeline/layout.ts'; import { readSource } from '../../core/source.ts'
const kinds = (row: any[]) => [...new Set(row.flatMap(c => (c ? [`${c.kind} ${c.role} ${c.owners.join()}`] : [])))]
const SEC = 'timeline\ntitle History\nsection Industrial Revolution\n1760 : Steam\n1800 : Rail : Telegraph\nsection Now\n2000 : Web'
test('A3: LR sections: each name spans its periods and widens its last column; its ink colors its pills, dots and events', () => {
  const d = X(SEC).drawing
  assert.deepEqual(text(d), ['History', ' Industrial Revolution    Now', ' 1760     1800            2000', '●' + '─'.repeat(8) + '●' + '─'.repeat(15) + '●─────',
    ' Steam    Rail            Web', '          Telegraph'])
  assert.deepEqual(d.cells.map(kinds), [['text title title'], ['text s1 sec0', 'text s2 sec1'], ['text s1 p0', 'text s1 p1', 'text s2 p2'],
    ['cap s1 p0:mark', 'cap edge axis', 'cap s1 p1:mark', 'cap s2 p2:mark'], ['text s1 p0.e0', 'text s1 p1.e0', 'text s2 p2.e0'], ['text s1 p1.e1']])
  assert.deepEqual([d.expect.edges, d.expect.edgeLabels, d.expect.frames], [[], [], []])
})
test('A3: TD sections: a name takes its own rows before its first period, wrapped at the wrap step', () => {
  const d = X(SEC.replace('timeline', 'timeline TD'), 14).drawing
  assert.deepEqual(text(d), ['History', 'Industrial', 'Revolution', '● 1760', '│   Steam', '● 1800', '│   Rail', '│   Telegraph', 'Now', '● 2000', '│   Web'])
  assert.deepEqual(d.cells.slice(1).map(kinds), [['text s1 sec0'], ['text s1 sec0'], ['cap s1 p0:mark', 'text s1 p0'], ['cap edge axis', 'text s1 p0.e0'],
    ['cap s1 p1:mark', 'text s1 p1'], ['cap edge axis', 'text s1 p1.e0'], ['cap edge axis', 'text s1 p1.e1'], ['text s2 sec1'], ['cap s2 p2:mark', 'text s2 p2'], ['cap edge axis', 'text s2 p2.e0']])
})
test('A4.fit-ladder: wrap caps both columns at 9 and wraps pills to 7; <br> breaks a pill', () => {
  const S = 'timeline\n2002 : a b c d e f\n2004 : x<br>y'
  assert.deepEqual([21, 20, 19].map(c => X(S, c).step), ['natural', 'tight', 'wrap'])
  assert.deepEqual(text(X(S, 19).drawing), [' 2002      2004', '●' + '─'.repeat(9) + '●─────', ' a b c d   x', ' e f       y'])
})
test('A7: without sections each period takes the next series ink, or s1 under disableMulticolor', () => {
  const inks = (s: string) => X(s).drawing.cells[1].filter((c: any) => c?.ch === '●').map((c: any) => c.role)
  assert.deepEqual(inks(SOCIAL), ['s1', 's2'])
  assert.deepEqual(inks(`---\nconfig:\n  timeline:\n    disableMulticolor: true\n---\n${SOCIAL}`), ['s1', 's1'])
})
test('A4.fit-ladder: LR and a bare header climb four steps, TD two; any other step fails step', () => {
  const m = (s: string) => timeline.parse(readSource(s) as any) as any
  assert.deepEqual([SOCIAL, SOCIAL.replace('timeline', 'timeline LR'), SOCIAL.replace('timeline', 'timeline TD')].map(s => timeline.steps(m(s))),
    [['natural', 'tight', 'wrap', 'lrToTd'], ['natural', 'tight', 'wrap', 'lrToTd'], ['natural', 'wrap']])
  assert.deepEqual([timeline.layout(m(SOCIAL), 'keyed', 80), timeline.layout(m(SOCIAL.replace('timeline', 'timeline TD')), 'tight', 80)], [{ reason: 'step' }, { reason: 'step' }])
})
