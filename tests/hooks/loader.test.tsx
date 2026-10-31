import { test, expect } from 'claude-code/testing'

// The hook imports core with .ts suffixes, so it draws only if the loader resolves them. A reply that opens on a
// diagram sends next() an empty block first, which a hook beneath answers. The $.state round-trip through the
// mermaid-tty command is tested in command.test.tsx.
test('A8.no-build: hooks import core with .ts suffixes', async ($, on) => {
  on('ui.render', { component: 'AssistantMessage' }, async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.text}</Text>
  })
  const ui = await $.ui.mount({
    plugin: 'mermaid-tty',
    surface: 'terminal',
    component: 'AssistantMessage',
    props: { text: '```mermaid\nflowchart TD\nA-->B\n```', isFirstOfReply: true },
    viewport: { columns: 80, rows: 24 },
  })
  expect((await ui.find({ key: 'mermaid-0' }))?.text).toContain('A')
})
