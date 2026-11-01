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

// session.start mirrors the stored picture setting into this session, so a drawing reads it without touching the store;
// a store that fails leaves the setting auto and the command still registered.
const start = async ($: any, on: any, kept: () => Promise<unknown>) => {
  const set: unknown[] = []
  on('session.start', async (_$: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', async (_$: any, e: any) => ({ value: { command: e.name } }))
  on('store.get', async () => ({ value: await kept() }))
  on('state.set', async (_$: any, e: any, next: any) => {
    set.push(e.value)
    return next(e)
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  return set
}
test('A6.command: session.start loads the stored images setting', async ($, on) => {
  expect(await start($, on, async () => 'off')).toEqual(['off'])
  expect((await $.command.run({ command: 'mermaid-tty', args: 'images' })).text).toBe('mermaid-tty images: off')
})
test('A5.errors: session.start with a failing store leaves images auto', async ($, on) => {
  const failing = async () => {
    throw new Error('no store')
  }
  expect(await start($, on, failing)).toEqual(['auto'])
  expect((await $.command.run({ command: 'mermaid-tty', args: 'images' })).text).toBe('mermaid-tty images: auto')
})
