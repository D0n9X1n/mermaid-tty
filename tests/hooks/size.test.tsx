import { test, expect, mock } from 'claude-code/testing'

// so no cached picture leaks in.
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAUAAAAKAAQAAAADF65wuAAAAMElEQVR42u3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB4NGaAAAE2fUvuAAAAAElFTkSuQmCC'
const world = (on: any, vars: Record<string, string>) => {
  const runs: string[][] = []
  mock.env(on, vars)
  on('config.list', async () => ({
    value: [
      { key: 'theme', label: 'Theme', kind: 'choice', value: 'dark', provider: { kind: 'engine' }, isLocked: false },
      { key: 'mermaid-tty@mermaid-tty.size', value: 'compact', provider: { plugin: 'mermaid-tty@mermaid-tty' } },
    ],
  }))
  on('process.run', async (_$: any, e: any) => {
    runs.push(e.argv)
    let stdout = ''
    if (e.argv[1] === '--version') {
      stdout = '11.17.1\n'
    } else if (e.argv[0] === 'node' && e.argv[2].includes('mkdtempSync')) {
      stdout = JSON.stringify({ tmp: '/tmp', dir: '/tmp/mermaid-tty.Kt1Kt1' })
    }

    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('fs.write', async () => ({ value: undefined }))
  on('fs.stat', async () => ({ value: { kind: 'file', size: 100, mtimeMs: 0, isLink: false } }))
  on('fs.read', async (_$: any, e: any) => ({
    value: e.path.endsWith('.svg') ? '<svg><path marker-end="url(#a)"/></svg>' : { base64: PNG },
  }))
  on('ui.render', { component: 'AssistantMessage' }, async ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.text}</Text>
  })
  return runs
}
// What a run was: the temp dir's Node runs by what they do, any other by its first two words.
const name = (argv: string[]) => {
  if (argv[0] !== 'node') {
    return argv.slice(0, 2).join(' ')
  }

  return argv[2]!.includes('mkdtempSync') ? 'make temp' : 'remove temp'
}
const mount = ($: any, body: string) =>
  $.ui.mount({
    plugin: 'mermaid-tty',
    surface: 'terminal',
    component: 'AssistantMessage',
    props: { text: '```mermaid\n' + body + '\n```\n', isFirstOfReply: true },
    viewport: { columns: 80, rows: 40 },
  })

// The kit answers no config call, so a hook beneath the plugin stands for the /config menu: world lists the plugin's
// size row with Claude Code's theme, and this records each write, or refuses it while refusals is above zero.
const config = (on: any, refusals = 0) => {
  const writes: unknown[] = []
  let left = refusals
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
const RUN = ($: any, args: string) => $.command.run({ command: 'mermaid-tty', args })
// The box the picture is drawn in, once mmdc's PNG is rendered.
const box = async (ui: any) => {
  const img = await ui.find({ key: 'mermaid-0' })
  return img?.type === 'Image' ? [img.props.columns, img.props.rows] : null
}

test('A6.hook-tests: by default a picture is shown compact: 15 by 15 cells for a 320 by 640 PNG', async ($, on) => {
  world(on, { TERM: 'xterm-kitty' })

  const ui = await mount($, 'flowchart TD\nZ1 --> Z2')

  expect(await box(ui)).toEqual([15, 15])
  expect((await RUN($, 'size')).text).toBe('mermaid-tty size: compact')
})

test(
  'A6.hook-tests: a configured size full shows it at its natural 20 by 20',
  { options: { size: 'full' } },
  async ($, on) => {
    world(on, { TERM: 'xterm-kitty' })

    const ui = await mount($, 'flowchart TD\nZ3 --> Z4')

    expect(await box(ui)).toEqual([20, 20])
  },
)

test(
  'A6.hook-tests: a configured size outside full and compact shows it compact',
  { options: { size: 'huge' } },
  async ($, on) => {
    world(on, { TERM: 'xterm-kitty' })

    const ui = await mount($, 'flowchart TD\nU1 --> U2')

    expect(await box(ui)).toEqual([15, 15])
  },
)

// The size is kept in $.state; a read of it that fails, by throwing or by rejecting, is the configured size, as a
// failing theme or crossings read is the configured one.
for (const how of ['throws', 'rejects'] as const) {
  test(`A5.errors: a size read that ${how} shows the configured size`, { options: { size: 'full' } }, async ($, on) => {
    world(on, { TERM: 'xterm-kitty' })
    on('state.get', async (_$: any, e: any, next: any) => {
      if (JSON.stringify(e).includes('"size"')) {
        if (how === 'throws') {
          throw new Error('down')
        }

        return { deny: 'down' }
      }

      return next(e)
    })

    const ui = await mount($, `flowchart TD\nR${how} --> R2`)

    expect(await box(ui)).toEqual([20, 20])
  })
}

test('A6.command: /mermaid-tty size full redraws the picture at once, renders nothing again, and saves', async ($, on) => {
  const runs = world(on, { TERM: 'xterm-kitty' })
  const writes = config(on)
  const ui = await mount($, 'flowchart TD\nZ5 --> Z6')
  const compact = await box(ui)
  const rendered = runs.length

  const said = (await RUN($, 'size full')).text
  const full = await box(ui)

  expect(compact).toEqual([15, 15])
  expect(said).toBe('mermaid-tty: showing pictures at full size')
  expect(full).toEqual([20, 20])
  expect(runs.length).toBe(rendered)
  expect(writes).toEqual([['mermaid-tty@mermaid-tty.size', 'full']])
})

test('A5.errors: a refused size save holds for this session, says so, and is retried when asked again', async ($, on) => {
  world(on, { TERM: 'xterm-kitty' })
  const writes = config(on, 1)
  const ui = await mount($, 'flowchart TD\nZ7 --> Z8')
  await box(ui)

  const first = (await RUN($, 'size full')).text
  const shown = await box(ui)
  const again = (await RUN($, 'size full')).text

  expect(first).toBe('mermaid-tty: showing pictures at full size (this session only: the setting was not saved)')
  expect(shown).toEqual([20, 20])
  expect(again).toBe('mermaid-tty size: full')
  expect(writes).toEqual([
    ['mermaid-tty@mermaid-tty.size', 'full'],
    ['mermaid-tty@mermaid-tty.size', 'full'],
  ])
})

test('A6.command: session.start resets size to the configured setting', async ($, on) => {
  world(on, { TERM: 'xterm-kitty' })
  config(on)
  on('session.start', async (_$: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', async (_$: any, e: any) => ({ value: { command: e.name } }))
  await RUN($, 'size full')

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  expect((await RUN($, 'size')).text).toBe('mermaid-tty size: compact')
})

test('A6.hook-tests: text drawings are never resized: in text mode the size changes nothing', async ($, on) => {
  world(on, { TERM: 'xterm-kitty' })
  await RUN($, 'text')
  const ui = await mount($, 'flowchart TD\nZ9 --> Y1')
  const compact = (await ui.find({ key: 'mermaid-0' }))?.text

  await RUN($, 'size full')

  expect((await ui.find({ key: 'mermaid-0' }))?.text).toBe(compact)
})
