import { test, expect, mock } from 'claude-code/testing'
const FC = '```mermaid\nflowchart LR\nA[读取] --> B[完成]\n```\n'
const ANSWER = `Here is the flow:\n\n${FC}\nThat is all.`
const BTW = ($: any, args: string) => $.command.run({ command: 'btw', args })
const usage = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const answered = (text: string) => ({ isAnswered: true, text, usage })

// The kit answers neither the fork nor the pane's open, so hooks beneath the plugin stand for them: each fork answers
// the next reply in turn, and each prompt and open is recorded. A reply may be a promise, held to order the forks.
const engine = (on: any, ...replies: unknown[]) => {
  const prompts: string[] = []
  const opens: any[] = []
  const closes: string[] = []
  const builtin: string[] = []
  const placed = { value: { isPlaced: true } as object }
  // Each open answers the next of these in turn, a promise held to order it, then placed; one that rejects throws.
  const openings: unknown[] = []
  on('model.fork', async (_$: any, e: any) => {
    prompts.push(e.prompt)
    return { value: await replies.shift() }
  })
  on('ui.open', async (_$: any, e: any) => {
    opens.push(e)
    return openings.length ? { value: await openings.shift() } : placed
  })
  on('ui.close', async (_$: any, e: any) => {
    closes.push(e.id)
    return { value: undefined }
  })
  on('command.run', { command: 'btw' }, async (_$: any, e: any) => {
    builtin.push(e.args)
    return { text: 'the built-in /btw' }
  })
  on('session.start', async (_$: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', async (_$: any, e: any) => ({ value: { command: e.name } }))
  return { prompts, opens, closes, builtin, placed, openings }
}
const pane = ($: any, surface = 'terminal') =>
  $.ui.mount({
    plugin: 'mermaid-tty',
    surface,
    component: 'Pane',
    requestId: 'btw',
    props: { title: 'btw', isFocused: true, bodyColumns: 80, placement: 'inline' },
    viewport: { columns: 82, rows: 40 },
  })
// A promise and the function that settles it, to hold a fork or an open until a test lets it go.
const held = () => {
  let settle: (v: unknown) => void = () => {}
  let fail: (e: unknown) => void = () => {}
  const promise = new Promise((resolve, reject) => {
    settle = resolve
    fail = reject
  })
  return { promise, settle, fail }
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 20))
const start = ($: any, surface: string | null = 'terminal') =>
  $.session.start({ cwd: '/', surface, isInteractive: surface === 'terminal' })

test('A6.command: /btw answers from a fork in a pane that draws its fences, adding nothing to the session', async ($, on) => {
  const e = engine(on, answered(ANSWER))
  const session = mock.session(on)
  await start($)

  const r = await BTW($, 'how does it flow?')
  const ui = await pane($)

  expect(r).toEqual({})
  expect(e.builtin).toEqual([])
  expect(session.appended()).toEqual([])
  expect(e.prompts).toHaveLength(1)
  expect(e.prompts[0]).toContain('how does it flow?')
  expect(e.prompts[0]).toContain('side question')
  expect(e.opens).toEqual([expect.objectContaining({ id: 'btw', title: 'btw', focus: true, closeOnEscape: true })])
  expect((await ui.find({ key: 'btw-question' }))?.text).toContain('/btw how does it flow?')
  expect((await ui.find({ key: 'mermaid-0' }))?.text).toContain('读取')
  expect(JSON.stringify(await ui.find({ type: 'Markdown', text: 'Here is the flow:\n\n' }))).toContain('Here is')
  expect(await ui.find({ type: 'Markdown', text: '\nThat is all.' })).toBeDefined()
})

test('A6.command: a fork with no answer hands /btw to Claude Code, and a cancelled one shows nothing', async ($, on) => {
  const e = engine(
    on,
    { isAnswered: false, reason: 'nothing-to-fork' },
    { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage },
    { isAnswered: false, reason: 'empty-reply', usage },
    { isAnswered: false, reason: 'aborted', usage },
  )
  await start($)

  const said = [await BTW($, 'one'), await BTW($, 'two'), await BTW($, 'three')]
  const cancelled = await BTW($, 'four')

  expect(said.map((r: any) => r.text)).toEqual(['the built-in /btw', 'the built-in /btw', 'the built-in /btw'])
  expect(e.builtin).toEqual(['one', 'two', 'three'])
  expect(cancelled).toEqual({})
  expect(e.opens).toEqual([])
})

test('A6.command: /btw with no question, in source mode, or with no session start goes to Claude Code', async ($, on) => {
  const e = engine(on, answered(ANSWER))

  await BTW($, 'before any session start')
  await start($)
  await BTW($, '   ')
  await $.command.run({ command: 'mermaid-tty', args: 'source' })
  await BTW($, 'in source mode')

  expect(e.builtin).toEqual(['before any session start', '   ', 'in source mode'])
  expect(e.prompts).toEqual([])
  expect(e.opens).toEqual([])
})

test('A6.command: outside the terminal /btw is Claude Code own', async ($, on) => {
  const e = engine(on, answered(ANSWER))
  await start($, null)

  await BTW($, 'from the SDK')

  expect(e.builtin).toEqual(['from the SDK'])
  expect(e.prompts).toEqual([])
})

test('A6.command: an answer that arrives after a newer /btw is dropped', async ($, on) => {
  let first: (v: unknown) => void = () => {}
  const held = new Promise((resolve) => (first = resolve))
  const e = engine(on, held, answered('the newer answer'))
  await start($)

  const older = BTW($, 'older')
  await new Promise((resolve) => setTimeout(resolve, 20))
  const newer = await BTW($, 'newer')
  first(answered('the older answer'))
  const late = await older
  const ui = await pane($)

  expect([newer, late]).toEqual([{}, {}])
  expect(e.opens).toHaveLength(1)
  expect((await ui.find({ key: 'btw-question' }))?.text).toContain('/btw newer')
  expect(await ui.find({ type: 'Markdown', text: 'the newer answer' })).toBeDefined()
  expect(await ui.find({ type: 'Markdown', text: 'the older answer' })).toBeUndefined()
})

test('A6.hook-tests: the pane shows a fence it cannot draw as source, redraws, and in source mode shows all as is', async ($, on) => {
  const bad = '```mermaid\nflowchart TD\nA[👨‍👩]\n```\n'
  engine(on, answered(`Look:\n${bad}`), answered(ANSWER))
  on('ui.log', async () => ({ value: undefined }))
  await start($)

  await BTW($, 'bad')
  const ui = await pane($)
  const unchanged = await ui.find({ type: 'Markdown', text: `Look:\n${bad}` })
  await BTW($, 'good')
  const drawn = await ui.find({ key: 'mermaid-0' })
  await $.command.run({ command: 'mermaid-tty', args: 'source' })

  expect(unchanged).toBeDefined()
  expect(drawn).toBeDefined()
  expect(await ui.find({ key: 'mermaid-0' })).toBeUndefined()
  expect(await ui.find({ type: 'Markdown', text: ANSWER })).toBeDefined()
})

test('A6.hook-tests: a btw pane on another surface goes to next(e)', async ($, on) => {
  engine(on, answered(ANSWER))
  on('ui.render', { component: 'Pane' }, async ($: any, e: any) => {
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box key="beneath">
        <Text>beneath</Text>
      </Box>
    )
  })
  await start($)
  await BTW($, 'q')

  const ui = await pane($, 'desktop')

  expect(await ui.find({ key: 'beneath' })).toBeDefined()
  expect(await ui.find({ key: 'mermaid-0' })).toBeUndefined()
})

test('A6.command: an answer whose pane is not placed closes it and hands /btw to Claude Code', async ($, on) => {
  const e = engine(on, answered(ANSWER))
  e.placed.value = { isPlaced: false, reason: 'no surface places panes' }
  await start($)

  const r = await BTW($, 'unseen')

  expect(r).toEqual({ text: 'the built-in /btw' })
  expect(e.builtin).toEqual(['unseen'])
  expect(e.closes).toEqual(['btw'])
})

const LATE = {
  'fails with an API error': { isAnswered: false, reason: 'api-error', status: 500, error: 'server_error', usage },
  'comes back empty': { isAnswered: false, reason: 'empty-reply', usage },
  throws: 'throws',
}
for (const [what, late] of Object.entries(LATE)) {
  test(`A6.command: a /btw overtaken by a newer one ends with nothing when its fork ${what}`, async ($, on) => {
    const older = held()
    const e = engine(on, older.promise, answered('the newer answer'))
    await start($)

    const running = BTW($, 'older')
    await tick()
    await BTW($, 'newer')
    if (late === 'throws') {
      older.fail(new Error('fork failed'))
    } else {
      older.settle(late)
    }

    expect(await running).toEqual({})
    expect(e.builtin).toEqual([])
    expect(e.closes).toEqual([])
  })
}

test('A6.command: an overtaken /btw whose pane is not placed leaves the newer pane open', async ($, on) => {
  const opening = held()
  const e = engine(on, answered('the older answer'), answered('the newer answer'))
  e.openings.push(opening.promise)
  await start($)

  const running = BTW($, 'older')
  await tick()
  const newer = await BTW($, 'newer')
  opening.settle({ isPlaced: false, reason: 'narrow' })
  const late = await running

  expect([newer, late]).toEqual([{}, {}])
  expect(e.closes).toEqual([])
  expect(e.builtin).toEqual([])
})

test('A6.command: a fork that throws, as where the engine cannot fork, hands /btw to Claude Code', async ($, on) => {
  const failing = held()
  const e = engine(on, failing.promise)
  await start($)
  failing.fail(new Error('no implementation for model.fork'))

  const r = await BTW($, 'can you fork?')

  expect(r).toEqual({ text: 'the built-in /btw' })
  expect(e.builtin).toEqual(['can you fork?'])
  expect(e.opens).toEqual([])
})

test('A6.command: an open that throws closes the pane and hands /btw to Claude Code', async ($, on) => {
  const e = engine(on, answered(ANSWER))
  const refused = held()
  e.openings.push(refused.promise)
  await start($)
  refused.fail(new Error('no surface'))

  const r = await BTW($, 'where?')

  expect(r).toEqual({ text: 'the built-in /btw' })
  expect(e.builtin).toEqual(['where?'])
  expect(e.closes).toEqual(['btw'])
})

test('A6.command: an answer that cannot be stored opens no pane and hands /btw to Claude Code', async ($, on) => {
  const e = engine(on, answered(ANSWER))
  on('state.set', async (_$: any, ev: any, next: any) => {
    if (ev.ref?.key === 'btw' || ev.key === 'btw') {
      return { deny: 'full' }
    }

    return next(ev)
  })
  await start($)

  const r = await BTW($, 'kept?')

  expect(r).toEqual({ text: 'the built-in /btw' })
  expect(e.opens).toEqual([])
  expect(e.closes).toEqual(['btw'])
})

test('A6.hook-tests: the pane draws at its body width, every row fitting it', async ($, on) => {
  const fan =
    '```mermaid\nflowchart TD\nA[start] --> B[one]\nA --> C[two]\nA --> D[three]\nA --> E[four]\nA --> F[five]\n```\n'
  engine(on, answered(fan))
  on('ui.log', async () => ({ value: undefined }))
  await start($)
  await BTW($, 'fan')

  const mountAt = (bodyColumns: number) =>
    $.ui.mount({
      plugin: 'mermaid-tty',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'btw',
      props: { title: 'btw', isFocused: true, bodyColumns, placement: 'dock' },
      viewport: { columns: 200, rows: 40 },
    })
  const wide = await mountAt(80)
  const drawnWide = await wide.find({ key: 'mermaid-0' })
  await wide.unmount()
  const narrow = await mountAt(40)

  expect(drawnWide).toBeDefined()
  expect(await narrow.find({ key: 'mermaid-0' })).toBeUndefined()
  expect(await narrow.find({ type: 'Markdown', text: fan })).toBeDefined()
})

test('A6.hook-tests: a terminal btw pane with no answer stored goes to next(e)', async ($, on) => {
  engine(on)
  on('ui.render', { component: 'Pane' }, async ($: any, e: any) => {
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box key="beneath">
        <Text>beneath</Text>
      </Box>
    )
  })
  await start($)

  const ui = await pane($)

  expect(await ui.find({ key: 'beneath' })).toBeDefined()
  expect(await ui.find({ key: 'btw-question' })).toBeUndefined()
})
