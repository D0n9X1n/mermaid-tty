import { test, expect } from 'claude-code/testing'
const FC = '```mermaid\nflowchart TD\nA --> B\n```\n'
const RUN = ($: any, args: string) => $.command.run({ command: 'mermaid-tty', args })
test('A6.command: source passes replies through; diagram draws again; bare reports', async ($, on) => {
  const logs: string[] = []
  on('ui.log', async (_$: any, e: any) => {
    logs.push(e.text)
    return { value: undefined }
  })
  on('ui.render', { component: 'AssistantMessage' }, async ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.text}</Text>
  })
  const ui = await $.ui.mount({
    plugin: 'mermaid-tty',
    surface: 'terminal',
    component: 'AssistantMessage',
    props: { text: FC, isFirstOfReply: true },
    viewport: { columns: 80, rows: 24 },
  })
  expect(await ui.find({ key: 'mermaid-0' })).toBeDefined()
  await RUN($, 'source')
  expect(await ui.find({ key: 'mermaid-0' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'flowchart TD' })).toBeDefined()
  expect(JSON.stringify([await RUN($, ''), logs])).toContain('mode: source')
  await RUN($, 'diagram')
  expect(await ui.find({ key: 'mermaid-0' })).toBeDefined()
})

// A hook beneath the plugin answers next() with the text it gets; reply() is the command's output line.
const USAGE = 'usage: /mermaid-tty [source|diagram|text]'
const echo = (on: any) =>
  on('ui.render', { component: 'AssistantMessage' }, async ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.text}</Text>
  })
const mount = ($: any, text = FC) =>
  $.ui.mount({
    plugin: 'mermaid-tty',
    surface: 'terminal',
    component: 'AssistantMessage',
    props: { text, isFirstOfReply: true },
    viewport: { columns: 80, rows: 24 },
  })
const reply = async ($: any, args: string) => (await RUN($, args)).text

// Checked from both modes, so an error path that writes either value is caught.
test('A6.command: a bad argument replies with the usage and keeps the mode', async ($, on) => {
  echo(on)
  const ui = await mount($)
  expect(await reply($, 'svg')).toBe(USAGE)
  expect(await reply($, '')).toBe('mermaid-tty mode: diagram')
  expect(await ui.find({ key: 'mermaid-0' })).toBeDefined()
  await RUN($, 'source')
  expect(await reply($, 'source extra')).toBe(USAGE)
  expect(await reply($, '')).toBe('mermaid-tty mode: source')
  expect(await ui.find({ key: 'mermaid-0' })).toBeUndefined()
})

test('A6.command: setting the mode in force replies with the mode, not a change', async ($, on) => {
  echo(on)
  const ui = await mount($)
  expect(await reply($, 'diagram')).toBe('mermaid-tty mode: diagram')
  expect(await ui.find({ key: 'mermaid-0' })).toBeDefined()
  expect(await reply($, 'SOURCE')).toBe('mermaid-tty: showing diagrams as source')
  expect(await reply($, 'source')).toBe('mermaid-tty mode: source')
  expect(await reply($, 'diagram')).toBe('mermaid-tty: drawing diagrams')
})

// The test's own $ has no state noun; a hook beneath the plugins sees each state.get and
// what the host answers, so the remount must read source back: a closure-held mode fails.
test('A6.command: the mode is kept in $.state, so a remounted reply still shows source', async ($, on) => {
  const read: unknown[] = []
  echo(on)
  on('state.get', async (_$: any, e: any, next: any) => {
    const r = await next(e)
    read.push(r.value?.value)
    return r
  }) // r: { value: StateRead }
  const ui = await mount($)
  await RUN($, 'source')
  await ui.unmount()
  read.length = 0
  const again = await mount($)
  expect(await again.find({ key: 'mermaid-0' })).toBeUndefined()
  expect(await again.find({ type: 'Text', text: 'flowchart TD' })).toBeDefined()
  expect(read).toContain(true)
})

// CommandRunArgs may leave args out. CommandRunInput types args as a string, yet the hook sees undefined.
test('A6.command: a bare run with args left out reports the mode', async ($: any) => {
  expect((await $.command.run({ command: 'mermaid-tty' })).text).toBe('mermaid-tty mode: diagram')
})

// $.command.run passes args as given. Each non-string gets the usage and leaves the mode as it
// was, checked from both modes; a run that rejects is recorded as its message.
test('A6.command: an argument that is not a string replies with the usage and keeps the mode', async ($, on) => {
  echo(on)
  const ui = await mount($)
  const got: unknown[] = []
  const want: unknown[] = []
  for (const m of ['diagram', 'source']) {
    await RUN($, m)
    for (const args of [['source'], { toString: null }, 42, null]) {
      got.push(
        await RUN($, args as any).then(
          (r: any) => r.text,
          (x: any) => String(x?.message ?? x),
        ),
        await reply($, ''),
        (await ui.find({ key: 'mermaid-0' })) !== undefined,
      )
      want.push(USAGE, `mermaid-tty mode: ${m}`, m === 'diagram')
    }
  }
  expect(got).toEqual(want)
})

// In source mode next() gets the reply's text byte for byte: fences, CRLF and spacing kept.
const RAW =
  'Intro  \r\n```mermaid\r\nflowchart TD\r\nA --> B\r\n```\r\n\n```mermaid\nflowchart TD\nC --> D\n```\nOutro\t'
test('A6.command: in source mode next() gets the reply text byte for byte', async ($, on) => {
  const seen: string[] = []
  on('ui.render', { component: 'AssistantMessage' }, async ($: any, e: any) => {
    seen.push(e.props.text)
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.text}</Text>
  })
  const ui = await mount($, RAW)
  expect(await ui.find({ key: 'mermaid-1' })).toBeDefined()
  seen.length = 0
  await RUN($, 'source')
  expect(await ui.find({ key: 'mermaid-0' })).toBeUndefined()
  expect([...new Set(seen)]).toEqual([RAW])
  seen.length = 0
  await ui.unmount()
  await mount($, RAW)
  expect(seen).toEqual([RAW])
})

// The kit answers $.ui.invalidate beneath the plugins; a hook there sees each call.
test('A6.command: setting the mode asks for ui.render again', async ($, on) => {
  const asked: string[] = []
  on('ui.invalidate', async (_$: any, e: any, next: any) => {
    asked.push(e.event)
    return next(e)
  })
  await RUN($, 'source')
  expect(asked).toEqual(['ui.render'])
})
