import { test, expect, mock } from 'claude-code/testing'
const RUN = ($: any, args: string) => $.command.run({ command: 'mermaid-tty', args })
const SECTION = 'mermaid-tty:flowchart-direction'

// The kit composes no prompt, so a hook beneath the plugin stands for the engine's own sections.
const engine = (on: any) =>
  on('prompt.compose', async () => ({ sections: [{ id: 'intro', text: 'engine intro', scope: 'shared' }] }))
const INPUT = { model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', tools: [], outputStyle: null, traits: [] }
const compose = async ($: any, surfaces: string[] = ['terminal']) =>
  (await $.prompt.compose({ ...INPUT, surfaces })).sections
const ours = async ($: any, surfaces?: string[]) => (await compose($, surfaces)).find((s: any) => s.id === SECTION)

// The kit answers no config call, so a hook beneath the plugin stands for the /config menu: it lists the plugin's
// direction row and records each write, or refuses the first `refusals` of them.
const config = (on: any, refusals = 0) => {
  const writes: unknown[] = []
  let left = refusals
  on('config.list', async () => ({
    value: [{ key: 'mermaid-tty.direction', value: 'LR', provider: { plugin: 'mermaid-tty' } }],
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

// The text of each user row the plugin appended for the model.
const notes = (session: any) =>
  session
    .appended()
    .filter((r: any) => r.message.type === 'user')
    .map((r: any) => r.message.content.map((b: any) => b.text).join(''))

test('A6.direction: by default the prompt asks for left-to-right flowcharts, after the engine sections', async ($, on) => {
  engine(on)
  const sections = await compose($)
  expect(sections.map((s: any) => s.id)).toEqual(['intro', SECTION])
  expect(sections[1]).toMatchObject({ scope: 'session' })
  expect(sections[1].text).toContain('`flowchart LR`')
})

test(
  'A6.direction: a TB setting asks for top-to-bottom flowcharts',
  { options: { direction: 'TB' } },
  async ($, on) => {
    engine(on)
    expect((await ours($))?.text).toContain('`flowchart TB`')
  },
)

test('A6.direction: off adds no section', { options: { direction: 'off' } }, async ($, on) => {
  engine(on)
  expect(await ours($)).toBeUndefined()
})

test('A6.direction: a session that draws in no terminal gets no section', async ($, on) => {
  engine(on)
  expect(await ours($, ['desktop'])).toBeUndefined()
  expect(await ours($, [])).toBeUndefined()
})

test('A6.direction: an unknown setting asks for LR', { options: { direction: 'diagonal' } }, async ($, on) => {
  engine(on)
  expect((await ours($))?.text).toContain('`flowchart LR`')
  expect((await RUN($, 'direction')).text).toBe('mermaid-tty direction: LR')
})

// A thread's system prompt is fixed once sent, so a switch also tells the model in a row of its own, and saves the
// setting so new threads get the new section.
test('A6.command: /mermaid-tty direction saves the setting, notes it for the model and changes the section', async ($, on) => {
  engine(on)
  const writes = config(on)
  const session = mock.session(on)
  expect((await RUN($, 'direction TB')).text).toBe('mermaid-tty: asking Claude for top-to-bottom flowcharts')
  expect(writes).toEqual([['mermaid-tty.direction', 'TB']])
  expect(notes(session)).toHaveLength(1)
  expect(notes(session)[0]).toContain('`flowchart TB`')
  expect((await ours($))?.text).toContain('`flowchart TB`')
  expect((await RUN($, 'direction tb')).text).toBe('mermaid-tty direction: TB')
  expect(writes).toHaveLength(1)
  expect(notes(session)).toHaveLength(1)
})

test('A6.command: direction off drops the section and tells the model', async ($, on) => {
  engine(on)
  config(on)
  const session = mock.session(on)
  expect((await RUN($, 'direction off')).text).toBe('mermaid-tty: leaving flowchart direction to Claude')
  expect(await ours($)).toBeUndefined()
  expect(notes(session)[0]).toContain('no longer')
})

test('A5.errors: a refused save keeps the direction for this session and says so', async ($, on) => {
  engine(on)
  config(on, Infinity)
  expect((await RUN($, 'direction TB')).text).toBe(
    'mermaid-tty: asking Claude for top-to-bottom flowcharts (this session only: the setting was not saved)',
  )
  expect((await ours($))?.text).toContain('`flowchart TB`')
})

// The direction in force, asked for again after a refused save, tries the save again; the model was told once.
test('A5.errors: asking again for a direction whose save was refused retries the save', async ($, on) => {
  engine(on)
  const writes = config(on, 1)
  const session = mock.session(on)
  await RUN($, 'direction TB')
  expect((await RUN($, 'direction')).text).toBe(
    'mermaid-tty direction: TB (this session only: the setting was not saved)',
  )
  expect((await RUN($, 'direction TB')).text).toBe('mermaid-tty direction: TB')
  expect(writes).toEqual([
    ['mermaid-tty.direction', 'TB'],
    ['mermaid-tty.direction', 'TB'],
  ])
  expect(notes(session)).toHaveLength(1)
})

test('A5.errors: a refused note still switches the direction', async ($, on) => {
  engine(on)
  config(on)
  on('session.append', async () => ({ deny: 'no notes' }))
  expect((await RUN($, 'direction TB')).text).toBe('mermaid-tty: asking Claude for top-to-bottom flowcharts')
  expect((await ours($))?.text).toContain('`flowchart TB`')
})

// A /config change reloads the module and runs session.start again within the session: the thread's prompt still holds
// the old section, so the model is told; a first start, or a reload with nothing changed, says nothing.
test(
  'A6.direction: a reload with a changed setting tells the model; an unchanged one does not',
  { options: { direction: 'TB' } },
  async ($, on) => {
    const session = mock.session(on)
    on('session.start', async (_$: any, e: any) => ({ cwd: e.cwd }))
    on('command.register', async (_$: any, e: any) => ({ value: { command: e.name } }))
    config(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    expect(notes(session)).toEqual([])
    await RUN($, 'direction LR')
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    expect(notes(session)).toHaveLength(2)
    expect(notes(session)[1]).toContain('`flowchart TB`')
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    expect(notes(session)).toHaveLength(2)
  },
)
