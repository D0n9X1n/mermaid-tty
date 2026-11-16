import { test, expect } from 'claude-code/testing'
import { THEMES } from '../../core/themes.ts'
// A drawing whose edges cross, A→D over B→C, so each crossing line takes a color of its own while crossings is on.
const FC = '```mermaid\nflowchart TD\nA --> C\nA --> D\nB --> C\nB --> D\n```\n'
const RUN = ($: any, args: string) => $.command.run({ command: 'mermaid-tty', args })
const nord = THEMES.nord
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

// The line colors the drawing shows: the colors of its box-drawing Texts other than the theme's edge color.
const lineColors = async (ui: any) =>
  new Set(
    (await ui.findAll({ type: 'Text' }))
      .filter((x: any) => /^[─│┌┐└┘├┤┬┴]+$/.test(x.text) && x.props.color && x.props.color !== nord.roles.edge)
      .map((x: any) => x.props.color),
  )

// The kit answers no config call, so a hook beneath the plugin stands for the /config menu: it lists the plugin's
// crossings row and records each write, or refuses it while refusals is above zero.
const config = (on: any, refusals = 0) => {
  const writes: unknown[] = []
  let left = refusals
  on('config.list', async () => ({
    value: [{ key: 'mermaid-tty@mermaid-tty.crossings', value: 'on', provider: { plugin: 'mermaid-tty@mermaid-tty' } }],
  }))
  on('config.set', async (_$: any, e: any) => {
    writes.push([e.key, e.value])
    if (left > 0) {
      left--
      return { deny: 'locked' }
    }

    return { value: e.value }
  })
  return writes
}

test('A3: with crossings unset, crossing lines are colored apart', async ($, on) => {
  echo(on)

  const ui = await mount($)

  expect((await lineColors(ui)).size).toBe(2)
  expect((await RUN($, 'crossings')).text).toBe('mermaid-tty crossings: on')
})

test('A3: a configured crossings off draws every line as before', { options: { crossings: 'off' } }, async ($, on) => {
  echo(on)

  const ui = await mount($)

  expect((await lineColors(ui)).size).toBe(0)
  expect((await RUN($, 'crossings')).text).toBe('mermaid-tty crossings: off')
})

test(
  'A3: a configured crossings outside on and off colors them',
  { options: { crossings: 'maybe' } },
  async ($, on) => {
    echo(on)

    const ui = await mount($)

    expect((await lineColors(ui)).size).toBe(2)
  },
)

test('A6.command: /mermaid-tty crossings off redraws at once and saves the setting', async ($, on) => {
  echo(on)
  const writes = config(on)
  const ui = await mount($)

  const off = (await RUN($, 'crossings off')).text
  const drawnOff = (await lineColors(ui)).size
  const back = (await RUN($, 'crossings on')).text

  expect(off).toBe('mermaid-tty: drawing crossing lines in the edge color')
  expect(drawnOff).toBe(0)
  expect(back).toBe('mermaid-tty: coloring crossing lines apart')
  expect((await lineColors(ui)).size).toBe(2)
  expect(writes).toEqual([
    ['mermaid-tty@mermaid-tty.crossings', 'off'],
    ['mermaid-tty@mermaid-tty.crossings', 'on'],
  ])
})

test('A5.errors: a refused crossings save holds for this session, says so, and is retried when asked again', async ($, on) => {
  echo(on)
  const writes = config(on, 1)
  const ui = await mount($)

  const first = (await RUN($, 'crossings off')).text
  const drawn = (await lineColors(ui)).size
  const again = (await RUN($, 'crossings off')).text

  expect(first).toBe(
    'mermaid-tty: drawing crossing lines in the edge color (this session only: the setting was not saved)',
  )
  expect(drawn).toBe(0)
  expect(again).toBe('mermaid-tty crossings: off')
  expect(writes).toEqual([
    ['mermaid-tty@mermaid-tty.crossings', 'off'],
    ['mermaid-tty@mermaid-tty.crossings', 'off'],
  ])
})

test('A6.command: session.start resets crossings to the configured setting', async ($, on) => {
  echo(on)
  config(on)
  on('session.start', async (_$: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', async (_$: any, e: any) => ({ value: { command: e.name } }))
  await RUN($, 'crossings off')

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  expect((await RUN($, 'crossings')).text).toBe('mermaid-tty crossings: on')
})
