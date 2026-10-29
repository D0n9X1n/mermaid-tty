// The e2e scenarios' screen check: each diagram label drawn in its role's color, and the prose intact. Node built-ins
// only, so the main suite runs this with nothing installed.
import test from 'node:test'; import assert from 'node:assert/strict'; import { checkDiagramScreen, drawnRows } from '../../scripts/e2e/assert.ts'
const D = { mode: 'default', value: 0 }, rgb = (v: number) => ({ mode: 'rgb', value: v }), p256 = (v: number) => ({ mode: 'p256', value: v })
const row = (s: string, fg: object = D, bg: object = D) => [...s].map(ch => ({ ch, width: 1, fg, bg }))
const screen = (pill: object, msg: object) => [row('Here is the config flow:'), row(' 读取配置文件 ', D, pill), row(' ping ', msg)]
const E = { labels: { '读取配置文件': 'node', ping: 'label' }, prose: ['Here is the config flow:'] } as const, HEX = { node: 0x88c0d0, label: 0xa3be8c }
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
