import { test, expect } from 'claude-code/testing'

test('A8.no-build: hooks import core with .ts suffixes; the hyphenated $.state key round-trips', async $ => {
  const mount = () => $.ui.mount({ plugin: 'mermaid-tty', surface: 'terminal', component: 'AssistantMessage',
    props: { text: '```mermaid\nflowchart TD\nA-->B\n```', isFirstOfReply: true }, viewport: { columns: 80, rows: 24 } })
  expect((await (await mount()).find({ key: 'mermaid-0' }))?.text).toBe('probe:false:false')
  await $.command.run({ command: 'mermaid-tty', args: 'source' })
  expect((await (await mount()).find({ key: 'mermaid-0' }))?.text).toBe('probe:false:true')
})
