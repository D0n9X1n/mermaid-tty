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
  expect(
    (await ui.findAll({ type: 'Text' })).some((t: any) => t.text === '/btw how does it flow?' && t.props.dimColor),
  ).toBe(true)
  expect(
    (await ui.findAll({ type: 'Box' })).some(
      (b: any) => b.props.borderStyle === 'round' && b.props.borderDimColor && b.props.width === '100%',
    ),
  ).toBe(true)
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
  // The same answer 61 columns wide leaves the 57 a dock gives it: too narrow, so it shows as source.
  const narrow = await row($, e.places[0]!, 61)

  expect(drawn?.text).toContain('register.tsx')
  expect(drawn?.text).toContain('core renderer')
  expect(await narrow.find({ key: 'mermaid-0' })).toBeUndefined()
  expect(await narrow.find({ type: 'Markdown', text: WIDE })).toBeDefined()
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
    if (ev.ref?.key === 'btwRow' || ev.key === 'btwRow') {
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

// A hook's $.state reads are as of its dispatch, so a /btw queued behind one whose row is refused reads the state from
// before that one's write: each answer is kept on its own, so nothing it writes takes another answer's place.
test('A6.row: a /btw queued behind a refused row keeps every earlier answer, and its own', async ($, on) => {
  const placing = held()
  const e = engine(on, answered('the first answer'), answered('the second answer'), answered('the third answer'))
  let n = 0
  e.placing.value = (id: string) => {
    n++
    return n === 2 ? placing.promise : { isPlaced: true, requestId: `req-${id}` }
  }
  await start($)
  await BTW($, 'first')

  const second = BTW($, 'second')
  await tick()
  const third = BTW($, 'third')
  await tick()
  placing.settle({ isPlaced: false, reason: 'no conversation' })
  await Promise.all([second, third])
  const first = await row($, e.places[0]!)
  const firstText = await first.find({ type: 'Markdown', text: 'the first answer' })
  await first.unmount()
  const refused = await row($, e.places[1]!)
  const refusedText = await refused.find({ type: 'Markdown', text: 'the second answer' })
  await refused.unmount()
  const last = await row($, e.places[2]!)

  expect(e.places).toHaveLength(3)
  expect(firstText).toBeDefined()
  expect(refusedText).toBeUndefined()
  expect(await last.find({ type: 'Markdown', text: 'the third answer' })).toBeDefined()
})

// What the engine keeps is what a row draws, whatever was asked: a hook beneath that rewrites an answer, as one that
// redacts it may, is drawn so, and a later /btw leaves it so.
test('A6.row: a row draws its answer as the engine kept it, and a later /btw leaves it so', async ($, on) => {
  const e = engine(on, answered('a secret answer'), answered('another answer'))
  placesRows(e)
  on('state.set', async (_$: any, ev: any, next: any) =>
    JSON.stringify(ev).includes('a secret answer')
      ? next({ ...ev, value: { question: 'q', text: 'redacted' } })
      : next(ev),
  )
  await start($)

  await BTW($, 'first')
  await BTW($, 'second')
  const ui = await row($, e.places[0]!)

  expect(await ui.find({ type: 'Markdown', text: 'redacted' })).toBeDefined()
  expect(await ui.find({ type: 'Markdown', text: 'a secret answer' })).toBeUndefined()
})

test('A6.row: a first row that is refused leaves no answer kept under its id', async ($, on) => {
  const e = engine(on, answered('in the pane'))
  e.placing.value = { isPlaced: false, reason: 'no conversation' }
  await start($)

  await BTW($, 'q')
  const ui = await row($, e.places[0]!)

  expect(e.opens).toHaveLength(1)
  expect(await ui.find({ type: 'Markdown', text: 'in the pane' })).toBeUndefined()
})

test('A6.row: a store the engine answers as not set falls back to the pane', async ($, on) => {
  const e = engine(on, answered('in the pane'))
  placesRows(e)
  on('state.set', async (_$: any, ev: any, next: any) => {
    if (ev.ref?.key === 'btwRow' || ev.key === 'btwRow') {
      return { value: { isSet: false, version: 0 } }
    }

    return next(ev)
  })
  await start($)

  const r = await BTW($, 'q')

  expect(r).toEqual({})
  expect(e.places).toEqual([])
  expect(e.opens).toHaveLength(1)
})

test('A6.row: a pane whose store the engine answers as not set hands /btw to Claude Code', async ($, on) => {
  const e = engine(on, answered('nowhere to keep it'))
  on('state.set', async (_$: any, ev: any, next: any) => {
    if (ev.ref?.key === 'btw' || ev.key === 'btw') {
      return { value: { isSet: false, version: 0 } }
    }

    return next(ev)
  })
  await start($)

  const r = await BTW($, 'q')

  expect(r).toEqual({ text: 'the built-in /btw' })
  expect(e.builtin).toEqual(['q'])
})

// A reload numbers its /btw from 1 again, and a clock may read the same millisecond, so a row's id can name one that
// already stands; placing it would redraw that row with the new answer. An id already kept is never written again: the
// engine answers its write, made only while the id was never written, as missed.
test('A6.row: a row id that is already kept, as after a reload, is passed over and never written', async ($, on) => {
  const e = engine(on, answered('the new answer'))
  placesRows(e)
  e.clock.isStopped = true
  const taken = `btw-${e.clock.now}-1`
  const writes: { id: string; ifVersion: unknown }[] = []
  on('state.set', async (_$: any, ev: any, next: any) => {
    const id = ev.ref?.id ?? ev.id
    if ((ev.ref?.key ?? ev.key) !== 'btwRow') {
      return next(ev)
    }

    writes.push({ id, ifVersion: ev.ifVersion })
    return id === taken && ev.ifVersion === 0 ? { value: { isSet: false, version: 1 } } : next(ev)
  })
  await start($)

  await BTW($, 'new')
  const fresh = await row($, e.places[0]!)

  expect(writes[0]).toEqual({ id: taken, ifVersion: 0 })
  expect(e.places).toEqual([`${taken}-1`])
  expect(writes.filter((w) => w.id === taken)).toHaveLength(1)
  expect(await fresh.find({ type: 'Markdown', text: 'the new answer' })).toBeDefined()
})

// A write made only while an id was never written misses at a version past 0 when the id is kept; at version 0 nothing
// is there, so the engine did not make the write, and the answer goes to the pane rather than to another id.
test('A6.row: a write the engine does not make, at an id never written, falls back to the pane', async ($, on) => {
  const e = engine(on, answered('in the pane'))
  placesRows(e)
  let first = true
  on('state.set', async (_$: any, ev: any, next: any) => {
    if ((ev.ref?.key ?? ev.key) === 'btwRow' && first) {
      first = false
      return { value: { isSet: false, version: 0 } }
    }

    return next(ev)
  })
  await start($)

  const r = await BTW($, 'q')

  expect(r).toEqual({})
  expect(e.places).toEqual([])
  expect(e.opens).toHaveLength(1)
})

// A row id is tried a few times at most: an engine that answers every write as already kept gets the answer in the
// pane, never an endless search for a free id.
test('A6.row: a row whose every id is already kept goes to the pane after a few tries', async ($, on) => {
  const e = engine(on, answered('in the pane'))
  placesRows(e)
  const tried: string[] = []
  on('state.set', async (_$: any, ev: any, next: any) => {
    if ((ev.ref?.key ?? ev.key) === 'btwRow' && ev.ifVersion === 0) {
      tried.push(ev.ref?.id ?? ev.id)
      return { value: { isSet: false, version: 1 } }
    }

    return next(ev)
  })
  await start($)

  const r = await BTW($, 'q')

  expect(r).toEqual({})
  expect(tried).toHaveLength(3)
  expect(new Set(tried).size).toBe(3)
  expect(e.places).toEqual([])
  expect(e.opens).toHaveLength(1)
})

// The question is drawn above the answer in the same row, so its length counts against what Claude Code draws. The
// flowchart draws in more characters than its source, so a question can leave room for the answer as source, which the
// row then shows, but not for its drawing.
test('A6.row: a question long enough to tip the drawing past what Claude Code draws shows the answer as source', async ($, on) => {
  const answer = `${'p'.repeat(70_000)}\n${WIDE}`
  const e = engine(on, answered(answer), answered(answer))
  placesRows(e)
  on('ui.log', async () => ({ value: undefined }))
  await start($)

  await BTW($, 'q')
  await BTW($, 'q'.repeat(19_000))
  const short = await row($, e.places[0]!, 130)
  const drawn = await short.find({ key: 'mermaid-0' })
  await short.unmount()
  const long = await row($, e.places[1]!, 130)

  expect(e.places).toHaveLength(2)
  expect(drawn).toBeDefined()
  expect(await long.find({ key: 'mermaid-0' })).toBeUndefined()
  expect(await long.find({ type: 'Markdown', text: answer })).toBeDefined()
})

test('A6.row: an answer too long for any drawing goes to Claude Code, whole', async ($, on) => {
  const e = engine(on, answered(`${'prose '.repeat(16_500)}\nSide done.`))
  placesRows(e)
  await start($)

  const r = await BTW($, 'q'.repeat(2_000))

  expect(r).toEqual({ text: 'the built-in /btw' })
  expect(e.places).toEqual([])
  expect(e.opens).toEqual([])
})

// What does not fit as a drawing may still fit as its source: Claude Code draws up to 100,000 characters, and the row
// shows the answer it was given, asked once, rather than asking again.
test('A6.row: an answer too large to draw but small enough to show is shown as its source, asked once', async ($, on) => {
  const answer = `${'p'.repeat(91_000)}\n${WIDE}\nSide done.`
  const e = engine(on, answered(answer))
  placesRows(e)
  on('ui.log', async () => ({ value: undefined }))
  await start($)

  const r = await BTW($, 'q')
  const ui = await row($, e.places[0]!, 130)

  expect(r).toEqual({})
  expect(e.prompts).toHaveLength(1)
  expect(e.builtin).toEqual([])
  expect(await ui.find({ key: 'mermaid-0' })).toBeUndefined()
  expect(await ui.find({ type: 'Markdown', text: answer })).toBeDefined()
})
