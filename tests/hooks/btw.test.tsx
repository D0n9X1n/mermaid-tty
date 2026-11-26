import { test, expect, mock } from 'claude-code/testing'
import { THEMES } from '../../core/themes.ts'
import { QUESTION_SYSTEM, SIDE_SYSTEM } from '../../hooks/btw-history.ts'
import {
  ANSWER,
  answered,
  BTW,
  CONVERSATION,
  engine,
  FC,
  held,
  NOTHING_TO_FORK,
  pane,
  start,
  tick,
  usage,
} from './btw-kit.tsx'

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
    NOTHING_TO_FORK,
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

// A resumed session, or one whose first turn has not finished, holds no request a fork may share: the answer then comes
// from the conversation itself, and shows in the pane as a fork's would.
test('A6.command: with nothing to fork, /btw is answered from the conversation in the pane, adding nothing', async ($, on) => {
  const e = engine(on, NOTHING_TO_FORK)
  e.conversation.value = CONVERSATION
  e.completed.push(answered(ANSWER))
  const session = mock.session(on)
  await start($)

  const r = await BTW($, 'what does it do?')
  const ui = await pane($)

  expect(r).toEqual({})
  expect(e.builtin).toEqual([])
  expect(session.appended()).toEqual([])
  expect(e.completions).toHaveLength(1)
  expect(e.completions[0].model).toBe('claude-opus-5-5')
  expect(e.completions[0].prompt).toContain('After the diagram.')
  expect(e.completions[0].prompt).toContain('what does it do?')
  expect(e.completions[0].system).toBe(SIDE_SYSTEM)
  expect(e.completions[0].maxTokens).toBe(8192)
  expect(e.opens).toEqual([expect.objectContaining({ id: 'btw', title: 'btw', focus: true, closeOnEscape: true })])
  expect((await ui.find({ key: 'mermaid-0' }))?.text).toContain('读取')
})

test('A6.command: an answer from the conversation cut at its length limit says so in the pane', async ($, on) => {
  const e = engine(on, NOTHING_TO_FORK)
  e.conversation.value = CONVERSATION
  e.completed.push({ isAnswered: true, text: 'The flow reads', usage: { ...usage, output_tokens: 8192 } })
  await start($)

  await BTW($, 'long?')
  const ui = await pane($)

  expect(JSON.stringify(await ui.drawn())).toContain('cut short at its length limit')
})

// A session that has said nothing yet still gets its /btw answered in the pane: the question goes to the model alone,
// with no conversation block, as Claude Code's own /btw answers it from what the model knows.
test('A6.command: with nothing to fork and no conversation, /btw is answered from the question alone', async ($, on) => {
  const e = engine(on, NOTHING_TO_FORK, NOTHING_TO_FORK)
  e.completed.push(answered(ANSWER), answered('Blank too.'))
  const session = mock.session(on)
  await start($)

  const none = await BTW($, 'first?')
  const drawn = await (await pane($)).find({ key: 'mermaid-0' })
  e.conversation.value = [{ role: 'user', text: '  ', toolUses: [] }]
  const blank = await BTW($, 'blank?')

  expect([none, blank]).toEqual([{}, {}])
  expect(e.builtin).toEqual([])
  expect(session.appended()).toEqual([])
  expect(e.completions).toHaveLength(2)
  expect(e.completions[0].model).toBe('claude-opus-5-5')
  expect(e.completions[0].maxTokens).toBe(8192)
  expect(e.completions[0].prompt).toContain('first?')
  expect(e.completions[0].prompt).not.toContain('conversation_history')
  expect(e.completions[0].system).toBe(QUESTION_SYSTEM)
  expect(e.completions[1].system).toBe(QUESTION_SYSTEM)
  expect(e.completions[1].prompt).toContain('blank?')
  expect(e.completions[1].prompt).not.toContain('conversation_history')
  expect(e.opens).toHaveLength(2)
  expect(drawn?.text).toContain('读取')
})

// A turn whose only content is a tool call is still conversation: what the tool was asked is background the side
// question may be about, so it goes in the history block, not the question alone.
test('A6.command: a turn holding only a tool call is answered over the conversation', async ($, on) => {
  const e = engine(on, NOTHING_TO_FORK)
  e.conversation.value = [{ role: 'assistant', text: '', toolUses: [{ tool: 'Read', input: { file: 'a.ts' } }] }]
  e.completed.push(answered(ANSWER))
  await start($)

  await BTW($, 'what was read?')

  expect(e.completions).toHaveLength(1)
  expect(e.completions[0].system).toBe(SIDE_SYSTEM)
  expect(e.completions[0].prompt).toContain('<conversation_history>')
  expect(e.completions[0].prompt).toContain('a.ts')
})

test('A6.command: an answer to the question alone that fails hands /btw on, and a cancelled one shows nothing', async ($, on) => {
  const e = engine(on, NOTHING_TO_FORK, NOTHING_TO_FORK, NOTHING_TO_FORK)
  e.completed.push(
    { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage },
    { isAnswered: false, reason: 'empty-reply', usage },
    { isAnswered: false, reason: 'aborted', usage },
  )
  await start($)

  const said = [await BTW($, 'one'), await BTW($, 'two')]
  const cancelled = await BTW($, 'three')

  expect(said.map((r: any) => r.text)).toEqual(['the built-in /btw', 'the built-in /btw'])
  expect(e.builtin).toEqual(['one', 'two'])
  expect(cancelled).toEqual({})
  expect(e.opens).toEqual([])
})

test('A6.command: an answer from the conversation that fails hands /btw on, and a cancelled one shows nothing', async ($, on) => {
  const e = engine(on, NOTHING_TO_FORK, NOTHING_TO_FORK, NOTHING_TO_FORK, NOTHING_TO_FORK)
  e.conversation.value = CONVERSATION
  const failing = held()
  e.completed.push(
    { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage },
    { isAnswered: false, reason: 'empty-reply', usage },
    failing.promise,
    { isAnswered: false, reason: 'aborted', usage },
  )
  await start($)
  failing.fail(new Error('no implementation for model.complete'))

  const said = [await BTW($, 'one'), await BTW($, 'two'), await BTW($, 'three')]
  const cancelled = await BTW($, 'four')

  expect(said.map((r: any) => r.text)).toEqual(['the built-in /btw', 'the built-in /btw', 'the built-in /btw'])
  expect(e.builtin).toEqual(['one', 'two', 'three'])
  expect(cancelled).toEqual({})
  expect(e.opens).toEqual([])
})

test('A6.command: a conversation that cannot be read hands /btw on without asking a model', async ($, on) => {
  const e = engine(on, NOTHING_TO_FORK)
  const unreadable = held()
  e.conversation.value = unreadable.promise
  await start($)
  unreadable.fail(new Error('no transcript'))

  const r = await BTW($, 'can you read it?')

  expect(r).toEqual({ text: 'the built-in /btw' })
  expect(e.completions).toEqual([])
})

test('A6.command: an answer from the conversation that arrives after a newer /btw is dropped', async ($, on) => {
  const slow = held()
  const e = engine(on, NOTHING_TO_FORK, answered('the newer answer'))
  e.conversation.value = CONVERSATION
  e.completed.push(slow.promise)
  await start($)

  const older = BTW($, 'older')
  await tick()
  const newer = await BTW($, 'newer')
  slow.settle(answered('the older answer'))
  const late = await older
  const ui = await pane($)

  expect([newer, late]).toEqual([{}, {}])
  expect(e.opens).toHaveLength(1)
  expect(await ui.find({ type: 'Markdown', text: 'the newer answer' })).toBeDefined()
  expect(await ui.find({ type: 'Markdown', text: 'the older answer' })).toBeUndefined()
})

test('A6.command: a /btw overtaken while its conversation is read asks no model', async ($, on) => {
  const reading = held()
  const e = engine(on, NOTHING_TO_FORK, answered('the newer answer'))
  e.conversation.value = reading.promise
  await start($)

  const older = BTW($, 'older')
  await tick()
  const newer = await BTW($, 'newer')
  reading.settle(CONVERSATION)
  const late = await older

  expect([newer, late]).toEqual([{}, {}])
  expect(e.completions).toEqual([])
  expect(e.opens).toHaveLength(1)
})

test('A6.command: a /btw overtaken while the session model is read asks no model', async ($, on) => {
  const reading = held()
  const e = engine(on, NOTHING_TO_FORK, answered('the newer answer'))
  e.model.value = reading.promise
  await start($)

  const older = BTW($, 'older')
  await tick()
  const newer = await BTW($, 'newer')
  reading.settle('claude-opus-5-5')
  const late = await older

  expect([newer, late]).toEqual([{}, {}])
  expect(e.completions).toEqual([])
  expect(e.opens).toHaveLength(1)
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

// The answers are shown one /btw at a time, so the newer one waits for the older one's open to settle; the older one,
// overtaken by then, neither closes the pane nor hands its question to Claude Code.
test('A6.command: an overtaken /btw whose pane is not placed leaves the newer answer shown', async ($, on) => {
  const opening = held()
  const e = engine(on, answered('the older answer'), answered('the newer answer'))
  e.openings.push(opening.promise)
  await start($)

  const older = BTW($, 'older')
  await tick()
  const newer = BTW($, 'newer')
  await tick()
  opening.settle({ isPlaced: false, reason: 'narrow' })
  const results = await Promise.all([older, newer])
  const ui = await pane($)

  expect(results).toEqual([{}, {}])
  expect(e.closes).toEqual([])
  expect(e.builtin).toEqual([])
  expect(await ui.find({ type: 'Markdown', text: 'the newer answer' })).toBeDefined()
})

// A store held until a newer /btw has arrived: the older answer never reaches the pane, nor reopens it.
test('A6.command: a /btw overtaken while its answer is stored never shows it', async ($, on) => {
  const storing = held()
  let holdNext = true
  const e = engine(on, answered('the older answer'), answered('the newer answer'))
  on('state.set', async (_$: any, ev: any, next: any) => {
    if (holdNext && JSON.stringify(ev).includes('the older answer')) {
      holdNext = false
      await storing.promise
    }

    return next(ev)
  })
  await start($)

  const older = BTW($, 'older')
  await tick()
  const newer = BTW($, 'newer')
  await tick()
  storing.settle(undefined)
  const results = await Promise.all([older, newer])
  const ui = await pane($)

  expect(results).toEqual([{}, {}])
  expect(e.opens).toHaveLength(1)
  expect(e.builtin).toEqual([])
  expect(await ui.find({ type: 'Markdown', text: 'the newer answer' })).toBeDefined()
})

// A newer /btw that Claude Code answers, as in source mode, overtakes an older fork too.
test('A6.command: a /btw overtaken by one Claude Code answers ends with nothing', async ($, on) => {
  const older = held()
  const e = engine(on, older.promise)
  await start($)

  const running = BTW($, 'older')
  await tick()
  await BTW($, '   ')
  older.settle(answered('the older answer'))

  expect(await running).toEqual({})
  expect(e.builtin).toEqual(['   '])
  expect(e.opens).toEqual([])
})

// The mode is read before the fork; a read that fails hands /btw to Claude Code without forking.
test('A6.command: a mode read that fails hands /btw to Claude Code without forking', async ($, on) => {
  const e = engine(on, answered(ANSWER))
  on('state.get', async (_$: any, ev: any, next: any) => {
    if (JSON.stringify(ev).includes('"source"')) {
      return { deny: 'state unavailable' }
    }

    return next(ev)
  })
  await start($)

  const r = await BTW($, 'mode?')

  expect(r).toEqual({ text: 'the built-in /btw' })
  expect(e.builtin).toEqual(['mode?'])
  expect(e.prompts).toEqual([])
  expect(e.opens).toEqual([])
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

// A mode read that fails while the pane draws fails the plan, so the whole answer shows as it came.
test('A6.hook-tests: a pane whose drawing fails shows the whole answer as markdown', async ($, on) => {
  engine(on, answered(ANSWER))
  let failReads = false
  on('state.get', async (_$: any, ev: any, next: any) => {
    if (failReads && JSON.stringify(ev).includes('"source"')) {
      return { deny: 'state unavailable' }
    }

    return next(ev)
  })
  await start($)
  await BTW($, 'flow?')
  failReads = true

  const ui = await pane($)

  expect(await ui.find({ key: 'mermaid-0' })).toBeUndefined()
  expect(await ui.find({ type: 'Markdown', text: ANSWER })).toBeDefined()
})

// Beneath the plugins: kitty outside tmux and an mmdc that writes a 320 x 640 PNG, as tests/hooks/image.test.tsx sets
// up, so the pane's fence is drawn as text first, then as the picture once it is rendered.
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAUAAAAKAAQAAAADF65wuAAAAMElEQVR42u3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB4NGaAAAE2fUvuAAAAAElFTkSuQmCC'
const kitty = (on: any) => {
  mock.env(on, { TERM: 'xterm-kitty' })
  on('config.list', async () => ({
    value: [
      { key: 'theme', label: 'Theme', kind: 'choice', value: 'dark', provider: { kind: 'engine' }, isLocked: false },
    ],
  }))
  on('process.run', async (_$: any, e: any) => {
    let stdout = ''
    if (e.argv[1] === '--version') {
      stdout = '11.17.1\n'
    } else if (e.argv[0] === 'node' && e.argv[2].includes('mkdtempSync')) {
      stdout = JSON.stringify({ tmp: '/tmp', dir: '/tmp/mermaid-tty.Bt1Bt1' })
    }

    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('fs.write', async () => ({ value: undefined }))
  on('fs.stat', async () => ({ value: { kind: 'file', size: 100, mtimeMs: 0, isLink: false } }))
  on('fs.read', async (_$: any, e: any) => ({
    value: e.path.endsWith('.svg') ? '<svg><path marker-end="url(#a)"/></svg>' : { base64: PNG },
  }))
}

test('A6.hook-tests: in kitty the pane draws a fence as a picture at its size, and as text in text mode', async ($, on) => {
  kitty(on)
  engine(on, answered('```mermaid\nflowchart TD\nP1 --> P2\n```\n'))
  await start($)
  await BTW($, 'picture?')

  const ui = await pane($)
  const picture = await ui.find({ key: 'mermaid-0' })
  // The pane shows the same picture again at once when the size changes, as a reply does.
  await $.command.run({ command: 'mermaid-tty', args: 'size full' })
  const full = await ui.find({ key: 'mermaid-0' })
  await $.command.run({ command: 'mermaid-tty', args: 'text' })

  expect(picture?.type).toBe('Image')
  expect(picture?.props).toMatchObject({ source: { png: PNG }, columns: 15, rows: 15 }) // compact, the default size
  expect(full?.props).toMatchObject({ source: { png: PNG }, columns: 20, rows: 20 })
  expect((await ui.find({ key: 'mermaid-0' }))?.type).toBe('Box')
})

test('A3: the btw pane colors crossing lines apart, and /mermaid-tty crossings off redraws it plain', async ($, on) => {
  const crossing = 'Here:\n```mermaid\nflowchart TD\nA --> C\nA --> D\nB --> C\nB --> D\n```\n'
  engine(on, answered(crossing))
  on('config.list', async () => ({ value: [] }))
  await start($)
  await BTW($, 'cross?')
  const ui = await pane($)
  const edge = THEMES.nord.roles.edge
  const colors = async () =>
    new Set(
      (await ui.findAll({ type: 'Text' }))
        .filter((x: any) => /^[─│┌┐└┘├┤┬┴]+$/.test(x.text) && x.props.color && x.props.color !== edge)
        .map((x: any) => x.props.color),
    )

  const before = (await colors()).size
  await $.command.run({ command: 'mermaid-tty', args: 'crossings off' })

  expect(before).toBe(2)
  expect((await colors()).size).toBe(0)
})
