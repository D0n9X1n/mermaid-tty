import test from 'node:test'; import assert from 'node:assert/strict'
import { findReply, fenceBody, clipboardStubs } from '../../scripts/e2e/stored.ts'; import { REPLY } from '../../scripts/e2e/reply.ts'
const line = (text: string) => JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } })
test('A9.stored: the transcript holds the reply byte for byte; /copy gets the exact fence body', () => {
  assert.equal(findReply([line('hi'), line(REPLY)].join('\n'), REPLY), true); assert.equal(findReply(line(REPLY.replace('读取', '读')), REPLY), false)
  assert.equal(fenceBody(REPLY), 'flowchart LR\nA[读取配置文件] -->|成功| B{完成?}\nB --> C([结束])')
  assert.deepEqual(Object.keys(clipboardStubs('linux', '/t/c.txt')).sort(), ['wl-copy', 'xclip', 'xsel'])
  assert.deepEqual([Object.keys(clipboardStubs('darwin', '/t/c.txt')), Object.keys(clipboardStubs('win32', 'C:\\t\\c.txt'))], [['pbcopy'], ['clip.cmd']])
})
