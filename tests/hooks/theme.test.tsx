import { test, expect } from 'claude-code/testing'
import { THEMES } from '../../core/themes.ts'
const FC = '```mermaid\nflowchart TD\nA[start] --> B[end]\n```\n'
const RUN = ($: any, args: string) => $.command.run({ command: 'mermaid-tty', args })
const echo = (on: any) =>
  on('ui.render', { component: 'AssistantMessage' }, async ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.text}</Text>
  })
const mount = ($: any) =>
  $.ui.mount({
    plugin: 'mermaid-tty',
    surface: 'terminal',
    component: 'AssistantMessage',
    props: { text: FC, isFirstOfReply: true },
    viewport: { columns: 80, rows: 24 },
  })

// The node pill's fill: the theme a drawing is in, read off the drawing itself.
const nodeFill = async (ui: any) =>
  (await ui.findAll({ type: 'Text' })).find((x: any) => /start/.test(x.text) && x.props.backgroundColor)?.props
    .backgroundColor

// The kit answers no config call, so a hook beneath the plugin stands for the /config menu: it lists the plugin's
// theme row and records each write, or refuses it.
const config = (on: any, refuse = false) => {
  const writes: unknown[] = []
  on('config.list', async () => ({
    value: [{ key: 'mermaid-tty.theme', value: 'nord', provider: { plugin: 'mermaid-tty' } }],
  }))
  on('config.set', async (_$: any, e: any) => {
    writes.push([e.key, e.value])
    return refuse ? { deny: 'locked' } : { value: e.value }
  })
  return writes
}

test('A7: with no theme configured, diagrams draw in nord', async ($, on) => {
  echo(on)
  const ui = await mount($)
  expect(await nodeFill(ui)).toBe(THEMES.nord.roles.node)
  expect((await RUN($, 'theme')).text).toBe('mermaid-tty theme: nord')
})

test('A7: a configured theme outside the list draws in nord', { options: { theme: 'neon' } }, async ($, on) => {
  echo(on)
  const ui = await mount($)
  expect(await nodeFill(ui)).toBe(THEMES.nord.roles.node)
})

test('A7: a configured theme draws in that theme', { options: { theme: 'gruvbox' } }, async ($, on) => {
  echo(on)
  const ui = await mount($)
  expect(await nodeFill(ui)).toBe(THEMES.gruvbox.roles.node)
  expect((await RUN($, 'theme')).text).toBe('mermaid-tty theme: gruvbox')
})

test('A6.command: /mermaid-tty theme redraws at once and saves the setting', async ($, on) => {
  echo(on)
  const writes = config(on)
  const ui = await mount($)
  expect((await RUN($, 'theme dracula')).text).toBe('mermaid-tty: drawing in dracula')
  expect(await nodeFill(ui)).toBe(THEMES.dracula.roles.node)
  expect(writes).toEqual([['mermaid-tty.theme', 'dracula']])
  expect((await RUN($, 'theme')).text).toBe('mermaid-tty theme: dracula')
  expect((await RUN($, 'theme dracula')).text).toBe('mermaid-tty theme: dracula')
  expect(writes).toHaveLength(1)
})

test('A5.errors: a refused save keeps the theme for this session and says so', async ($, on) => {
  echo(on)
  config(on, true)
  const ui = await mount($)
  expect((await RUN($, 'theme solarized')).text).toBe(
    'mermaid-tty: drawing in solarized (this session only: the setting was not saved)',
  )
  expect(await nodeFill(ui)).toBe(THEMES.solarized.roles.node)
})

test('A5.errors: with no theme row to write, the switch holds for this session', async ($, on) => {
  echo(on)
  on('config.list', async () => ({ value: [] }))
  const ui = await mount($)
  expect((await RUN($, 'theme dracula')).text).toBe(
    'mermaid-tty: drawing in dracula (this session only: the setting was not saved)',
  )
  expect(await nodeFill(ui)).toBe(THEMES.dracula.roles.node)
})

// A change in /config reloads the module with the new options, and session.start starts from them, so a theme the
// command set earlier never outlives the configured one.
test(
  'A6.command: session.start resets the theme to the configured one',
  { options: { theme: 'gruvbox' } },
  async ($, on) => {
    echo(on)
    config(on)
    on('session.start', async (_$: any, e: any) => ({ cwd: e.cwd }))
    on('command.register', async (_$: any, e: any) => ({ value: { command: e.name } }))
    const ui = await mount($)
    await RUN($, 'theme dracula')
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    expect(await nodeFill(ui)).toBe(THEMES.gruvbox.roles.node)
  },
)
