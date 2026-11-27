import { test, expect, mock } from 'claude-code/testing'
import { width } from '../../core/width.ts'
import { ANSWER, answered, BTW, engine, held, pane, placesRows, row, start, tick } from './btw-kit.tsx'

// A flowchart that needs 112 columns: a reply draws it at 130, and the btw pane, docked at 45% of a 130-column
// fullscreen terminal (57 columns), can't, so there it shows as source.
const WIDE = [
  '```mermaid',
  'flowchart LR',
  '  subgraph core[core renderer]',
  '    R[render.ts] --> G[graph layout] --> V[validate cells]',
  '  end',
  '  subgraph hooks[plugin hooks]',
  '    REG[register.tsx] --> PL[plan.ts safePlan] --> F[fences.ts splitFences]',
  '  end',
  '  REG --> BTW[btw.ts takesBtw] --> HIST[btw-history.ts]',
  '  PL --> R',
  '  PL --> IMG[image.ts pictures] --> SVG[svg.ts]',
  '  REG --> MODE[mode.ts]',
  '  REG --> SAFE[safe.ts]',
  '  IMG --> PIX[pixels.ts]',
  '  REG --> PT[picture-theme.ts]',
  '```',
  '',
].join('\n')

test('A6.row: /btw answers in a transcript row of its own that draws its fences, opening no pane, adding nothing', async ($, on) => {
  const e = engine(on, answered(ANSWER))
  placesRows(e)
  const session = mock.session(on)
  await start($)

  const r = await BTW($, 'how does it flow?')
  const ui = await row($, e.places[0]!)

  expect(r).toEqual({})
  expect(e.builtin).toEqual([])
  expect(e.opens).toEqual([])
  expect(session.appended()).toEqual([])
  expect(e.places).toHaveLength(1)
  expect(e.places[0]).toMatch(/^btw-\d+-\d+$/)
  expect((await ui.find({ key: 'btw-question' }))?.text).toContain('/btw how does it flow?')
  expect((await ui.find({ key: 'mermaid-0' }))?.text).toContain('读取')
  expect(await ui.find({ type: 'Markdown', text: 'Here is the flow:\n\n' })).toBeDefined()
  expect(await ui.find({ type: 'Markdown', text: '\nThat is all.' })).toBeDefined()
})

test('A6.row: a row draws at the full width a flowchart the 45% dock is too narrow for', async ($, on) => {
  const e = engine(on, answered(WIDE))
  placesRows(e)
  on('ui.log', async () => ({ value: undefined }))
  await start($)
  await BTW($, 'how is it built?')

  const full = await row($, e.places[0]!, 130)
  const drawn = await full.find({ key: 'mermaid-0' })
  await full.unmount()
  const dock = await $.ui.mount({
    plugin: 'mermaid-tty',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'btw',
    props: { title: 'btw', isFocused: true, bodyColumns: 57, placement: 'dock' },
    viewport: { columns: 130, rows: 40 },
  })

  expect(drawn?.text).toContain('register.tsx')
  expect(drawn?.text).toContain('core renderer')
  expect(await dock.find({ key: 'mermaid-0' })).toBeUndefined()
})

test('A6.row: every drawn line fits inside the row, its border and padding', async ($, on) => {
  const e = engine(on, answered(WIDE))
  placesRows(e)
  on('ui.log', async () => ({ value: undefined }))
  await start($)
  await BTW($, 'how is it built?')

  const ui = await row($, e.places[0]!, 118)
  // Only the drawn rows are Texts that truncate: 118 columns leave 114 inside the border and padding, and the
  // flowchart's 112 fit.
  const rows = (await ui.findAll({ type: 'Text' }))
    .filter((x: any) => x.props.wrap === 'truncate-end')
    .map((x: any) => width(x.text))

  expect(await ui.find({ key: 'mermaid-0' })).toBeDefined()
  expect(rows.length).toBeGreaterThan(0)
  expect(rows.filter((w: number) => w > 114)).toEqual([])
})

test('A6.row: each /btw keeps its own row and answer', async ($, on) => {
  const e = engine(on, answered('the first answer'), answered('the second answer'))
  placesRows(e)
  await start($)

  await BTW($, 'first')
  await BTW($, 'second')
  const first = await row($, e.places[0]!)
  const firstText = await first.find({ type: 'Markdown', text: 'the first answer' })
  await first.unmount()
  const second = await row($, e.places[1]!)

  expect(e.places).toHaveLength(2)
  expect(e.places[0]).not.toEqual(e.places[1])
  expect(firstText).toBeDefined()
  expect(await second.find({ type: 'Markdown', text: 'the second answer' })).toBeDefined()
  expect((await second.find({ key: 'btw-question' }))?.text).toContain('/btw second')
})

test('A6.row: a row not placed with no request id falls back to the pane; with one, the row stands', async ($, on) => {
  const e = engine(on, answered('in the pane'), answered('in a row'))
  e.placing.value = { isPlaced: false, reason: 'no conversation' }
  await start($)

  const paned = await BTW($, 'pane')
  const ui = await pane($)
  const inPane = await ui.find({ type: 'Markdown', text: 'in the pane' })
  e.placing.value = (id: string) => ({ isPlaced: false, requestId: `req-${id}`, reason: 'no surface attached yet' })
  const rowed = await BTW($, 'row')

  expect(paned).toEqual({})
  expect(inPane).toBeDefined()
  expect(rowed).toEqual({})
  expect(e.opens).toHaveLength(1)
  expect(e.builtin).toEqual([])
  expect(e.places).toHaveLength(2)
})

test('A6.row: a Claude Code with no rows answers in the pane, as before', async ($, on) => {
  const e = engine(on, answered(ANSWER))
  await start($)

  const r = await BTW($, 'how does it flow?')
  const ui = await pane($)

  expect(r).toEqual({})
  expect(e.places).toHaveLength(1)
  expect(e.opens).toHaveLength(1)
  expect((await ui.find({ key: 'mermaid-0' }))?.text).toContain('读取')
})

test('A6.row: a row with no answer kept, or on another surface, draws as it may there', async ($, on) => {
  const e = engine(on, answered(ANSWER))
  placesRows(e)
  on('ui.render', { component: 'Placed' }, async ($: any, ev: any) => {
    const { Box, Text } = $.ui.resolve(ev)
    return (
      <Box key="beneath">
        <Text>beneath</Text>
      </Box>
    )
  })
  await start($)
  await BTW($, 'q')

  const unknown = await row($, 'btw-0-0')
  const beneath = await unknown.find({ key: 'beneath' })
  await unknown.unmount()
  const desktop = await row($, e.places[0]!, 100, 'desktop')

  expect(beneath).toBeDefined()
  expect((await desktop.find({ key: 'btw-question' }))?.text).toContain('/btw q')
  expect(await desktop.find({ key: 'mermaid-0' })).toBeUndefined()
  expect(await desktop.find({ type: 'Markdown', text: ANSWER })).toBeDefined()
})

test('A6.row: in source mode a row shows its whole answer as is', async ($, on) => {
  const e = engine(on, answered(ANSWER))
  placesRows(e)
  await start($)
  await BTW($, 'q')

  const ui = await row($, e.places[0]!)
  const drawn = await ui.find({ key: 'mermaid-0' })
  await $.command.run({ command: 'mermaid-tty', args: 'source' })

  expect(drawn).toBeDefined()
  expect(await ui.find({ key: 'mermaid-0' })).toBeUndefined()
  expect(await ui.find({ type: 'Markdown', text: ANSWER })).toBeDefined()
})

// The newer /btw waits for the older one's place to settle; the older one, overtaken by then, places nothing more and
// hands nothing on.
test('A6.row: a /btw overtaken before its row is placed places none', async ($, on) => {
  const older = held()
  const e = engine(on, older.promise, answered('the newer answer'))
  placesRows(e)
  await start($)

  const running = BTW($, 'older')
  await tick()
  await BTW($, 'newer')
  older.settle(answered('the older answer'))

  expect(await running).toEqual({})
  expect(e.places).toHaveLength(1)
  expect(e.builtin).toEqual([])
  const ui = await row($, e.places[0]!)
  expect(await ui.find({ type: 'Markdown', text: 'the newer answer' })).toBeDefined()
})

// Whether a /btw is still the newest is asked as its row is placed: one overtaken while the engine places it keeps the
// row it got, beside the newer one's, and neither opens the pane nor hands its question on.
test('A6.row: a /btw overtaken while its row is placed keeps that row, and the newer one gets its own', async ($, on) => {
  const placing = held()
  const e = engine(on, answered('the older answer'), answered('the newer answer'))
  let first = true
  e.placing.value = (id: string) => {
    if (first) {
      first = false
      return placing.promise
    }

    return { isPlaced: true, requestId: `req-${id}` }
  }
  await start($)

  const older = BTW($, 'older')
  await tick()
  const newer = BTW($, 'newer')
  await tick()
  placing.settle({ isPlaced: true, requestId: `req-${e.places[0]}` })
  const results = await Promise.all([older, newer])
  const olderRow = await row($, e.places[0]!)
  const olderText = await olderRow.find({ type: 'Markdown', text: 'the older answer' })
  await olderRow.unmount()
  const newerRow = await row($, e.places[1]!)

  expect(results).toEqual([{}, {}])
  expect(e.places).toHaveLength(2)
  expect(e.opens).toEqual([])
  expect(e.builtin).toEqual([])
  expect(olderText).toBeDefined()
  expect(await newerRow.find({ type: 'Markdown', text: 'the newer answer' })).toBeDefined()
})

test('A6.row: another plugin row under the same id draws what is beneath, never the answer', async ($, on) => {
  const e = engine(on, answered('a private answer'))
  placesRows(e)
  on('ui.render', { component: 'Placed', plugin: '*' }, async ($: any, ev: any) => {
    const { Box, Text } = $.ui.resolve(ev)
    return (
      <Box key="beneath">
        <Text>beneath</Text>
      </Box>
    )
  })
  await start($)
  await BTW($, 'q')

  const foreign = await row($, e.places[0]!, 100, 'terminal', 'another-plugin')

  expect(await foreign.find({ key: 'beneath' })).toBeDefined()
  expect(await foreign.find({ type: 'Markdown', text: 'a private answer' })).toBeUndefined()
})

test('A6.row: a row that falls back to the pane takes no kept answer away', async ($, on) => {
  const e = engine(on, answered('kept'), answered('in the pane'))
  placesRows(e)
  await start($)
  await BTW($, 'first')
  e.placing.value = { isPlaced: false, reason: 'no conversation' }

  await BTW($, 'second')
  const ui = await row($, e.places[0]!)

  expect(e.opens).toHaveLength(1)
  expect(await ui.find({ type: 'Markdown', text: 'kept' })).toBeDefined()
})

test('A6.row: a row that stands closes the pane an earlier answer fell back to', async ($, on) => {
  const e = engine(on, answered('in the pane'), answered('in a row'))
  await start($)
  await BTW($, 'first')

  placesRows(e)
  await BTW($, 'second')

  expect(e.opens).toHaveLength(1)
  expect(e.closes).toEqual(['btw'])
})

test('A6.row: a row whose state cannot be written falls back to the pane', async ($, on) => {
  const e = engine(on, answered('too large to keep'))
  placesRows(e)
  // Only the rows' store is refused, as a value over 4 MiB is: the pane's value stays writable.
  on('state.set', async (_$: any, ev: any, next: any) => {
    if (ev.ref?.key === 'btwRows' || ev.key === 'btwRows') {
      return { deny: 'over 4 MiB' }
    }

    return next(ev)
  })
  await start($)

  const r = await BTW($, 'q')

  expect(r).toEqual({})
  expect(e.places).toEqual([])
  expect(e.opens).toHaveLength(1)
})

test('A6.row: a row drawn where no width was measured shows its whole answer as markdown', async ($, on) => {
  const e = engine(on, answered(ANSWER))
  placesRows(e)
  await start($)
  await BTW($, 'q')

  const ui = await row($, e.places[0]!, null)

  expect((await ui.find({ key: 'btw-question' }))?.text).toContain('/btw q')
  expect(await ui.find({ key: 'mermaid-0' })).toBeUndefined()
  expect(await ui.find({ type: 'Markdown', text: ANSWER })).toBeDefined()
})
