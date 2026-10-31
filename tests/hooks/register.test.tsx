import { test, expect } from 'claude-code/testing'

// The kit raises no session.start and answers no command.register, so the test answers both beneath the plugins and
// raises session.start itself.
test('A6.command: session.start registers the mermaid-tty command', async ($, on) => {
  const registered: { name: string; description: string }[] = []
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('command.register', async (_$, e) => {
    registered.push({ name: e.name, description: e.description })
    return { value: { command: e.name } }
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const mermaidTty = registered.filter((r) => r.name === 'mermaid-tty')
  expect(mermaidTty).toHaveLength(1)
  expect(mermaidTty[0]?.description.trim()).not.toBe('')
})
