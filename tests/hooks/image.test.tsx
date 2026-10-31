import { test, expect, mock } from 'claude-code/testing'

// Beneath the plugins: kitty outside tmux, a dark Claude Code theme, and an mmdc that writes a
// 320 x 640 PNG (20 columns, 20 rows): a whole one, 1-bit grey, since the engine checks what an Image
// gets. Each test uses its own fence, so no cached picture leaks in.
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAUAAAAKAAQAAAADF65wuAAAAMElEQVR42u3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB4NGaAAAE2fUvuAAAAAElFTkSuQmCC'
const world = (on: any, vars: Record<string, string>) => {
  const runs: string[][] = []
  mock.env(on, vars)
  on('config.list', async () => ({
    value: [
      { key: 'theme', label: 'Theme', kind: 'choice', value: 'dark', provider: { kind: 'engine' }, isLocked: false },
    ],
  }))
  on('process.run', async (_$: any, e: any) => {
    runs.push(e.argv)
    const stdout = e.argv[1] === '--version' ? '11.17.1\n' : e.argv[0] === 'mktemp' ? '/tmp/mermaid-tty.Kt1\n' : ''
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
const mount = ($: any, body: string) =>
  $.ui.mount({
    plugin: 'mermaid-tty',
    surface: 'terminal',
    component: 'AssistantMessage',
    props: { text: '```mermaid\n' + body + '\n```\n', isFirstOfReply: true },
    viewport: { columns: 80, rows: 40 },
  })

test("A6.hook-tests: in kitty a fence draws as text, then as an Image of mmdc's PNG", async ($, on) => {
  const runs = world(on, { TERM: 'xterm-kitty' })
  const ui = await mount($, 'flowchart TD\nK1 --> K2')
  const img = await ui.find({ key: 'mermaid-0' })
  expect(img?.type).toBe('Image')
  expect(img?.props).toMatchObject({ source: { png: PNG }, columns: 20, rows: 20 })
  expect(runs.map((r) => r.slice(0, 2).join(' '))).toEqual([
    'mmdc --version',
    'mktemp -d',
    'mmdc -i',
    'mmdc -i',
    'rm -rf',
  ])
})

// The themeCSS repro now falls back in core too (config:themeCSS), so it shows as source; a source core still draws,
// with a click href the gate rejects, stays text. Neither runs anything.
test('A5.errors: in kitty, the themeCSS repro and a click href never become an Image and run nothing', async ($, on) => {
  const runs = world(on, { TERM: 'xterm-kitty' })
  const css = await mount(
    $,
    "---\nconfig:\n  themeCSS: '.nodeLabel::before {content: url(file:///tmp/private.svg)}'\n---\nflowchart TD\nR1 --> R2",
  )
  expect((await css.find({ key: 'mermaid-0' }))?.type).not.toBe('Image')
  const click = await mount($, 'flowchart TD\nR3 --> R4\nclick R3 href "/asset.svg"')
  expect((await click.find({ key: 'mermaid-0' }))?.type).toBe('Box')
  expect(runs).toEqual([])
})

test('A6.hook-tests: under tmux, and in text mode, a fence stays text and mmdc never runs', async ($, on) => {
  const runs = world(on, { TERM: 'xterm-kitty', TMUX: '/tmp/t,1,0' })
  const ui = await mount($, 'flowchart TD\nT1 --> T2')
  expect((await ui.find({ key: 'mermaid-0' }))?.type).toBe('Box')
  expect(runs).toEqual([])
})

test('A6.command: /mermaid-tty text draws diagrams as text in kitty; diagram brings the Image back', async ($, on) => {
  const runs = world(on, { TERM: 'xterm-kitty' })
  expect((await $.command.run({ command: 'mermaid-tty', args: 'text' })).text).toBe(
    'mermaid-tty: drawing diagrams as text',
  )
  const ui = await mount($, 'flowchart TD\nX1 --> X2')
  expect((await ui.find({ key: 'mermaid-0' }))?.type).toBe('Box')
  expect(runs).toEqual([])
  expect((await $.command.run({ command: 'mermaid-tty', args: '' })).text).toBe('mermaid-tty mode: text')
  await $.command.run({ command: 'mermaid-tty', args: 'diagram' })
  expect((await ui.find({ key: 'mermaid-0' }))?.type).toBe('Image')
})
