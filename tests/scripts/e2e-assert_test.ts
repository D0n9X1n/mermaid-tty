// The e2e scenarios' screen check: each drawn diagram's rows on screen, in order, each label in its role's color, and the
// prose intact. Node built-ins and the repo's own modules only, so the main suite runs this with nothing installed.
import test from 'node:test'; import assert from 'node:assert/strict'; import { checkDiagramScreen, drawnDiagrams, drawnRows, sourceShown } from '../../scripts/e2e/assert.ts'
import { REPLY } from '../../scripts/e2e/reply.ts'
const D = { mode: 'default', value: 0 }, rgb = (v: number) => ({ mode: 'rgb', value: v }), p256 = (v: number) => ({ mode: 'p256', value: v })
const row = (s: string, fg: object = D, bg: object = D) => [...s].map(ch => ({ ch, width: 1, fg, bg }))
const screen = (pill: object, msg: object) => [row('Here is the config flow:'), row(' 读取配置文件 ', D, pill), row(' ping ', msg)]
const E = { labels: { '读取配置文件': 'node', ping: 'label' }, prose: ['Here is the config flow:'], diagrams: [] } as const, HEX = { node: 0x88c0d0, label: 0xa3be8c }
test('A9.harness: labels are checked by role: node background on node labels, role foreground elsewhere, no color under mono', () => {
  assert.deepEqual(checkDiagramScreen(screen(rgb(0x88c0d0), rgb(0xa3be8c)) as never, { ...E, color: 'truecolor', hex: HEX }), [])
  assert.match(checkDiagramScreen(screen(rgb(0x88c0d0), D) as never, { ...E, color: 'truecolor', hex: HEX })[0]!, /ping: expected label foreground/)
  assert.deepEqual(checkDiagramScreen(screen(p256(110), p256(150)) as never, { ...E, color: '256' }), [])
  assert.deepEqual(checkDiagramScreen(screen(D, D) as never, { ...E, color: 'none' }), [])
  assert.match(checkDiagramScreen(screen(rgb(0x88c0d0), D) as never, { ...E, color: 'none' })[0]!, /读取配置文件: expected no color/)
})

test('A9.harness: a drawn row holds a label outside its source line; source rows are not drawn ones', () => {
  const src = ['A[读取配置文件] -->|成功| B{完成?}', 'U->>S: ping']
  const text = ['⏺ Here is the config flow:', '  A[读取配置文件] -->|成功| B{完成?}', '  U->>S: ping', '[ 读取配置文件 ]──成功──►{ 完成? }', '   │ ping  │'].join('\n')
  assert.deepEqual(drawnRows(text, ['读取配置文件', 'ping'], src), ['[ 读取配置文件 ]──成功──►{ 完成? }', '   │ ping  │'])
  assert.deepEqual(drawnRows(text.split('\n').slice(0, 3).join('\n'), ['读取配置文件', 'ping'], src), [])
})

// A screen row as the terminal holds it: a wide character's second cell is ''.
const cellsOf = (s: string) => [...s].flatMap(ch => (/[\u2e80-\uffef]/.test(ch) ? [{ ch, width: 2, fg: D, bg: D }, { ch: '', width: 0, fg: D, bg: D }] : [{ ch, width: 1, fg: D, bg: D }]))
const FLOW = drawnDiagrams(REPLY, 100, 'mono')
const MONO = { labels: { '读取配置文件': 'node', ping: 'label' }, prose: ['Here is the config flow:', 'And the handshake:'], color: 'none', diagrams: FLOW } as const
// REPLY's prose and diagrams as Claude Code lays them out: a two-column margin, the reply bullet in the first.
const lay = (flow: readonly string[], seq: readonly string[]) => ['⏺ Here is the config flow:', '', ...flow.map(r => `  ${r}`), '', '  And the handshake:', '', ...seq.map(r => `  ${r}`)].map(cellsOf)
test('A9.harness: the screen must hold each drawn diagram\'s rows, as the renderer draws them, in order', () => {
  assert.equal(FLOW.length, 2)
  assert.ok(FLOW.every(d => d.some(r => /[─│►◄▲▼]/.test(r))), 'the rows hold edge and arrow glyphs')
  assert.deepEqual(checkDiagramScreen(lay(FLOW[0]!, FLOW[1]!) as never, MONO), [])
  const labelsOnly = (d: readonly string[]) => d.map(r => r.replace(/[^\p{L}\p{N}?\s]/gu, ' '))
  assert.match(checkDiagramScreen(lay(labelsOnly(FLOW[0]!), labelsOnly(FLOW[1]!)) as never, MONO).join('\n'), /diagram 1: not drawn[\s\S]*diagram 2: not drawn/)
  const source = splitSource(REPLY)
  assert.match(checkDiagramScreen(lay(source[0]!, source[1]!) as never, MONO).join('\n'), /diagram 1: not drawn[\s\S]*diagram 2: not drawn/)
  assert.match(checkDiagramScreen(lay(FLOW[1]!, FLOW[0]!) as never, MONO).join('\n'), /diagram 2: not drawn/)
})
// The reply's first two mermaid fences, each as its lines, fence lines included.
const splitSource = (t: string) => t.split('\n\n').filter(b => b.startsWith('```mermaid')).map(b => b.split('\n'))

test('A9.lead: a drawn diagram\'s node or edge source lines on screen are problems', () => {
  const src = ['flowchart TD', 'S[开始] --> E[结束]']
  assert.deepEqual(sourceShown('⏺ flowchart TD\n  S[开始] --> E[结束]\n  After the diagram.', src), ['S[开始] --> E[结束]: drawn diagram shown as source'])
  assert.deepEqual(sourceShown('⏺ [ 开始 ]\n     │\n     ▼\n  [ 结束 ]\n  After the diagram.', src), [])
})

test('A9.harness: a label is checked where its diagram is drawn, not in other text that holds it, like a Windows cwd', () => {
  const cells = [row('  C:\\Users\\runneradmin\\AppData\\Local\\Temp\\mtty-x\\cwd'), row(''), row('  [ User ]', D, rgb(0x88c0d0))]
  const spec = { labels: { User: 'node' }, prose: [], diagrams: [['[ User ]']], color: 'truecolor', hex: { node: 0x88c0d0 } } as const
  assert.deepEqual(checkDiagramScreen(cells as never, spec), [])
})
