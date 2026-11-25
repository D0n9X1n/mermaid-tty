// The cue mermaid-tty shows while it answers a /btw: its status row, or the marker a custom status line reads.
import { test, expect, mock } from 'claude-code/testing'
import { ANSWER, answered, BTW, engine, forks, held, start, tick, usage } from './btw-kit.tsx'

// The cue beneath the plugin: each status row text and each marker write, in order, the session id it is named by, and
// which markers are on disk.
const SESSION = '69712be4-0d07-4be9-af9e-2498d779f9fc'
const MARKER = `/Users/x/.cache/mermaid-tty/btw-${SESSION}`
const cueSink = (on: any, onDisk: string[] = []) => {
  const rows: (string | undefined)[] = []
  const marks: { path: string; text: string }[] = []
  const checked: string[] = []
  let refuseMarks = false
  let failClears = 0
  let holdNextMark: Promise<unknown> | null = null
  // A status call held beneath the plugin, as a slow hook of another plugin's may hold one: the next show, or the next
  // clear, waits on it before it is applied.
  const holdRow: { show: Promise<unknown> | null; clear: Promise<unknown> | null } = { show: null, clear: null }
  on('ui.status', async (_$: any, e: any) => {
    const which = e.text === undefined ? 'clear' : 'show'
    const hold = holdRow[which]
    if (hold) {
      holdRow[which] = null
      await hold
    }

    if (e.text === undefined && failClears > 0) {
      failClears--
      return { deny: 'not now' }
    }

    rows.push(e.text)
    return { value: undefined }
  })
  on('fs.write', async (_$: any, e: any, next: any) => {
    if (!e.path.includes('mermaid-tty/btw-')) {
      return next(e)
    }

    if (holdNextMark) {
      const hold = holdNextMark
      holdNextMark = null
      await hold
    }

    if (refuseMarks) {
      return { deny: 'read-only' }
    }

    marks.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  on('fs.exists', async (_$: any, e: any) => {
    checked.push(e.path)
    return { value: onDisk.includes(e.path) }
  })
  on('session.id', async () => ({ value: SESSION }))
  return {
    rows,
    marks,
    checked,
    refuse: (on = true) => (refuseMarks = on),
    // Refuses the next n clears of the row, as another plugin's hook may; the engine drops each without a word.
    failClears: (n: number) => (failClears = n),
    holdNextMark: (p: Promise<unknown>) => (holdNextMark = p),
    holdNextShow: (p: Promise<unknown>) => (holdRow.show = p),
    holdNextClear: (p: Promise<unknown>) => (holdRow.clear = p),
    // Whether a cue is shown now: the last row text, or the last marker written.
    rowOn: () => rows.at(-1) !== undefined,
    markOn: () => marks.at(-1)?.text === '1',
  }
}
// Records, as each fork starts, whether the cue is on: the row or the marker. Call it after engine().
const atFork = (cue: ReturnType<typeof cueSink>) => {
  const seen: boolean[] = []
  forks.onFork = () => seen.push(cue.rowOn() || cue.markOn())
  return seen
}
const FILE_MODE = { MERMAID_TTY_BTW_STATUS: 'file', HOME: '/Users/x' }

test('A6.status: a status row says /btw is being answered while its fork runs, and goes once it shows', async ($, on) => {
  const fork = held()
  const cue = cueSink(on)
  engine(on, fork.promise)
  await start($)

  const running = BTW($, 'slow?')
  await tick()
  const whileAnswering = cue.rows.at(-1)
  fork.settle(answered(ANSWER))
  await running

  expect(whileAnswering).toBe('answering /btw…')
  expect(cue.rowOn()).toBe(false)
  expect(cue.marks).toEqual([])
})

test('A6.status: with the switch on file, a marker named by the session is the cue instead of the row', async ($, on) => {
  mock.env(on, FILE_MODE)
  const fork = held()
  const cue = cueSink(on)
  engine(on, fork.promise)
  await start($)

  const running = BTW($, 'slow?')
  await tick()
  const whileAnswering = cue.marks.at(-1)
  fork.settle(answered(ANSWER))
  await running

  expect(whileAnswering).toEqual({ path: MARKER, text: '1' })
  expect(cue.marks.at(-1)).toEqual({ path: MARKER, text: '' })
  expect(cue.rows).not.toContain('answering /btw…')
})

for (const [name, windows] of Object.entries({ OS: 'Windows_NT', SystemRoot: 'C:\\Windows', windir: 'C:\\Windows' })) {
  test(`A6.status: where ${name} shows Windows the switch is ignored and the row is the cue`, async ($, on) => {
    mock.env(on, { ...FILE_MODE, [name]: windows })
    const fork = held()
    const cue = cueSink(on)
    engine(on, fork.promise)
    await start($)

    const running = BTW($, 'slow?')
    await tick()
    const whileAnswering = cue.rows.at(-1)
    fork.settle(answered(ANSWER))
    await running

    expect(whileAnswering).toBe('answering /btw…')
    expect(cue.marks).toEqual([])
  })
}

test('A6.status: a marker that cannot be written leaves the row as the cue', async ($, on) => {
  mock.env(on, FILE_MODE)
  const fork = held()
  const cue = cueSink(on)
  engine(on, fork.promise)
  await start($)
  cue.refuse()

  const running = BTW($, 'slow?')
  await tick()
  const whileAnswering = cue.rows.at(-1)
  fork.settle(answered(ANSWER))
  await running

  expect(whileAnswering).toBe('answering /btw…')
  expect(cue.rowOn()).toBe(false)
})

test('A6.status: an overtaken /btw leaves the cue to the newer one until that one is answered', async ($, on) => {
  const older = held()
  const newer = held()
  const cue = cueSink(on)
  engine(on, older.promise, newer.promise)
  await start($)

  const first = BTW($, 'older')
  await tick()
  const second = BTW($, 'newer')
  await tick()
  const bothRunning = cue.rowOn()
  older.settle(answered('the older answer'))
  await first
  const newerRunning = cue.rowOn()
  newer.settle(answered('the newer answer'))
  await second

  expect(bothRunning).toBe(true)
  expect(newerRunning).toBe(true)
  expect(cue.rowOn()).toBe(false)
})

test('A6.status: a newer /btw Claude Code answers clears the cue an older fork left', async ($, on) => {
  const older = held()
  const cue = cueSink(on)
  engine(on, older.promise)
  await start($)

  const running = BTW($, 'older')
  await tick()
  const before = cue.rowOn()
  await BTW($, '   ')
  const afterHandback = cue.rowOn()
  older.settle(answered('the older answer'))
  await running

  expect(before).toBe(true)
  expect(afterHandback).toBe(false)
  expect(cue.rowOn()).toBe(false)
})

test('A6.status: a /btw Claude Code answers shows no cue, and the cue is gone before it runs', async ($, on) => {
  const failing = held()
  const cue = cueSink(on)
  // Hooks beneath the plugin run in the order added, the first one answering; this one stands for Claude Code's own
  // /btw, and reads the cue as it runs.
  const onAtHandback: boolean[] = []
  on('command.run', { command: 'btw' }, async () => {
    onAtHandback.push(cue.rowOn())
    return { text: 'the built-in /btw' }
  })
  engine(on, failing.promise)
  await start($)
  failing.settle({ isAnswered: false, reason: 'empty-reply', usage })

  await BTW($, 'empty?')
  await $.command.run({ command: 'mermaid-tty', args: 'source' })
  await BTW($, 'in source mode')

  expect(onAtHandback).toEqual([false, false])
  expect(cue.rows.filter((r) => r !== undefined)).toEqual(['answering /btw…'])
})

test('A6.status: a cancelled /btw clears its cue', async ($, on) => {
  const fork = held()
  const cue = cueSink(on)
  engine(on, fork.promise)
  await start($)

  const running = BTW($, 'cancel me')
  await tick()
  const whileAnswering = cue.rowOn()
  fork.settle({ isAnswered: false, reason: 'aborted', usage })

  expect(await running).toEqual({})
  expect(whileAnswering).toBe(true)
  expect(cue.rowOn()).toBe(false)
})

// /clear ends the conversation and goes on under a new session id with no session.start, so the end takes the cue down,
// at the marker it was written to.
test('A6.status: a session that ends, as /clear ends one, takes its cue down', async ($, on) => {
  mock.env(on, FILE_MODE)
  const fork = held()
  const cue = cueSink(on)
  engine(on, fork.promise)
  on('session.end', async (_$: any, e: any) => ({ sessionId: e.sessionId }))
  await start($)

  const running = BTW($, 'cleared?')
  await tick()
  const whileAnswering = cue.markOn()
  await $.session.end({ reason: 'clear', sessionId: SESSION, resume: { id: SESSION } } as any)
  const afterEnd = cue.marks.at(-1)
  fork.settle(answered(ANSWER))
  await running

  expect(whileAnswering).toBe(true)
  expect(afterEnd).toEqual({ path: MARKER, text: '' })
  expect(cue.markOn()).toBe(false)
})

test('A6.status: a session starts with no cue, emptying a marker left on disk whatever the switch says', async ($, on) => {
  mock.env(on, { HOME: '/Users/x' })
  const cue = cueSink(on, [MARKER])
  engine(on)

  await start($)

  expect(cue.rows).toEqual([undefined])
  expect(cue.marks).toEqual([{ path: MARKER, text: '' }])
})

test('A6.status: a session with no marker on disk writes none, the switch on or off', async ($, on) => {
  mock.env(on, FILE_MODE)
  const cue = cueSink(on)
  engine(on)

  await start($)

  expect(cue.rows).toEqual([undefined])
  expect(cue.marks).toEqual([])
})

test('A6.status: the cue is on as each fork starts', async ($, on) => {
  mock.env(on, FILE_MODE)
  const cue = cueSink(on)
  engine(on, answered(ANSWER), answered(ANSWER))
  const seen = atFork(cue)
  await start($)

  await BTW($, 'one')
  await BTW($, 'two')

  expect(seen).toEqual([true, true])
})

// A marker write held while a /btw Claude Code answers and a newer taken one arrive: the oldest must neither fork nor
// hand on, the middle one must not run Claude Code's /btw once overtaken, and the newest's marker must be on as it
// forks.
test('A6.status: a /btw overtaken while its cue is written neither forks nor hands on, and the newest gets its cue', async ($, on) => {
  mock.env(on, FILE_MODE)
  const writing = held()
  const cue = cueSink(on)
  const e = engine(on, answered('the newest answer'))
  const seen = atFork(cue)
  await start($)
  cue.holdNextMark(writing.promise)

  const a = BTW($, 'oldest')
  await tick()
  const b = BTW($, '   ')
  await tick()
  const c = BTW($, 'newest')
  await tick()
  writing.settle(undefined)
  const results = await Promise.all([a, b, c])

  expect(results).toEqual([{}, {}, {}])
  expect(e.prompts).toHaveLength(1)
  expect(e.prompts[0]).toContain('newest')
  expect(e.builtin).toEqual([])
  expect(seen).toEqual([true])
  expect(cue.markOn()).toBe(false)
})

// /clear ends the conversation; a /btw still on its way then must not mark, fork or open a pane in the next one.
test('A6.status: a /btw still starting when its session ends does nothing in the next one', async ($, on) => {
  mock.env(on, FILE_MODE)
  const reading = held()
  const cue = cueSink(on)
  const e = engine(on, answered(ANSWER))
  on('session.end', async (_$: any, ev: any) => ({ sessionId: ev.sessionId }))
  let holdRead = false
  on('state.get', async (_$: any, ev: any, next: any) => {
    if (holdRead && JSON.stringify(ev).includes('"source"')) {
      holdRead = false
      await reading.promise
    }

    return next(ev)
  })
  await start($)
  holdRead = true

  const running = BTW($, 'before the clear')
  await tick()
  await $.session.end({ reason: 'clear', sessionId: SESSION, resume: { id: SESSION } } as any)
  reading.settle(undefined)
  const r = await running

  expect(r).toEqual({})
  expect(e.prompts).toEqual([])
  expect(e.opens).toEqual([])
  expect(e.builtin).toEqual([])
  expect(cue.marks.filter((m) => m.text === '1')).toEqual([])
})

test('A6.status: a newer /btw writes its own marker, so its age is its own', async ($, on) => {
  mock.env(on, FILE_MODE)
  const older = held()
  const newer = held()
  const cue = cueSink(on)
  engine(on, older.promise, newer.promise)
  await start($)

  const a = BTW($, 'older')
  await tick()
  const before = cue.marks.filter((m) => m.text === '1').length
  const b = BTW($, 'newer')
  await tick()
  const after = cue.marks.filter((m) => m.text === '1').length
  older.settle(answered('older'))
  newer.settle(answered('newer'))
  await Promise.all([a, b])

  expect(before).toBe(1)
  expect(after).toBe(2)
  expect(cue.markOn()).toBe(false)
})

test('A6.status: a newer /btw tries its own marker after an older one fell back to the row', async ($, on) => {
  mock.env(on, FILE_MODE)
  const older = held()
  const newer = held()
  const cue = cueSink(on)
  engine(on, older.promise, newer.promise)
  await start($)
  cue.refuse()

  const a = BTW($, 'older')
  await tick()
  const olderOnRow = cue.rowOn()
  cue.refuse(false)
  const b = BTW($, 'newer')
  await tick()
  const newerOnMarker = cue.markOn() && !cue.rowOn()
  older.settle(answered('older'))
  newer.settle(answered('newer'))
  await Promise.all([a, b])

  expect(olderOnRow).toBe(true)
  expect(newerOnMarker).toBe(true)
  expect(cue.markOn() || cue.rowOn()).toBe(false)
})

test('A6.status: a row whose clears were dropped is cleared by the next /btw before Claude Code runs it', async ($, on) => {
  const cue = cueSink(on)
  const onAtHandback: boolean[] = []
  on('command.run', { command: 'btw' }, async () => {
    onAtHandback.push(cue.rowOn())
    return { text: 'the built-in /btw' }
  })
  engine(on, answered(ANSWER))
  await start($)
  cue.failClears(2)

  await BTW($, 'answered')
  const stuck = cue.rowOn()
  await BTW($, '   ')

  expect(stuck).toBe(true)
  expect(onAtHandback).toEqual([false])
  expect(cue.rowOn()).toBe(false)
})

test('A6.status: a session that ends takes the row down', async ($, on) => {
  const fork = held()
  const cue = cueSink(on)
  engine(on, fork.promise)
  on('session.end', async (_$: any, e: any) => ({ sessionId: e.sessionId }))
  await start($)

  const running = BTW($, 'ending?')
  await tick()
  const whileAnswering = cue.rowOn()
  await $.session.end({ reason: 'other', sessionId: SESSION, resume: { id: SESSION } } as any)
  const afterEnd = cue.rowOn()
  fork.settle(answered(ANSWER))
  await running

  expect(whileAnswering).toBe(true)
  expect(afterEnd).toBe(false)
})

test('A6.status: env reads and a status row that throw leave /btw working', async ($, on) => {
  on('env.get', async () => {
    throw new Error('no env')
  })
  const e = engine(on, answered(ANSWER))
  on('ui.status', async () => {
    throw new Error('no status')
  })
  await start($)

  const r = await BTW($, 'still?')

  expect(r).toEqual({})
  expect(e.opens).toHaveLength(1)
})

for (const [switchedOn, present] of [
  [true, true],
  [true, false],
  [false, true],
  [false, false],
] as const) {
  test(`A6.status: a session start with the switch ${switchedOn ? 'on' : 'off'} and ${present ? 'a' : 'no'} marker on disk`, async ($, on) => {
    mock.env(on, switchedOn ? FILE_MODE : { HOME: '/Users/x' })
    const cue = cueSink(on, present ? [MARKER] : [])
    engine(on)

    await start($)

    expect(cue.checked).toEqual([MARKER])
    expect(cue.marks).toEqual(present ? [{ path: MARKER, text: '' }] : [])
    expect(cue.rows).toEqual([undefined])
  })
}

// A clear a slow hook beneath holds is followed by the sweep's own clear, so the row is down when Claude Code runs a
// newer /btw.
test('A6.status: a held clear leaves no row when Claude Code runs a newer /btw', async ($, on) => {
  const older = held()
  const clearing = held()
  const cue = cueSink(on)
  const onAtHandback: boolean[] = []
  on('command.run', { command: 'btw' }, async () => {
    onAtHandback.push(cue.rowOn())
    return { text: 'the built-in /btw' }
  })
  engine(on, older.promise)
  await start($)

  const a = BTW($, 'older')
  await tick()
  cue.holdNextClear(clearing.promise)
  const b = BTW($, '   ')
  await tick()
  clearing.settle(undefined)
  await b
  older.settle(answered('older'))
  await a

  expect(onAtHandback).toEqual([false])
  expect(cue.rowOn()).toBe(false)
})

test('A6.status: a show held while it is still wanted ends with the row up, then down once answered', async ($, on) => {
  const showing = held()
  const fork = held()
  const cue = cueSink(on)
  engine(on, fork.promise)
  await start($)
  cue.holdNextShow(showing.promise)

  const running = BTW($, 'held show')
  await tick()
  showing.settle(undefined)
  await tick()
  const whileAnswering = cue.rowOn()
  fork.settle(answered(ANSWER))
  await running
  await tick()

  expect(whileAnswering).toBe(true)
  expect(cue.rowOn()).toBe(false)
})

// A status call no hook ever lets through holds nothing up: the fork starts and the answer shows.
test('A6.status: a status call held indefinitely holds no /btw up', async ($, on) => {
  const showing = held()
  const cue = cueSink(on)
  const e = engine(on, answered(ANSWER))
  await start($)
  cue.holdNextShow(showing.promise)

  const r = await BTW($, 'never let through')
  const opened = e.opens.length
  showing.settle(undefined)
  await tick()

  expect(r).toEqual({})
  expect(opened).toBe(1)
})

// An ending session gives its hooks little time; a marker write that is slow to finish must not keep the picture sweep
// from starting.
test('A6.status: a slow marker write at session end does not hold the picture sweep back', async ($, on) => {
  mock.env(on, FILE_MODE)
  const writing = held()
  const fork = held()
  const cue = cueSink(on)
  const sweeps: string[] = []
  on('process.run', async (_$: any, e: any) => {
    if (e.argv[0] === 'node' && String(e.argv[2]).includes('mermaid-tty.')) {
      sweeps.push('sweep')
    }

    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  engine(on, fork.promise)
  on('session.end', async (_$: any, e: any) => ({ sessionId: e.sessionId }))
  await start($)
  const running = BTW($, 'ending')
  await tick()
  const before = sweeps.length
  cue.holdNextMark(writing.promise)

  const ending = $.session.end({ reason: 'other', sessionId: SESSION, resume: { id: SESSION } } as any)
  await tick()
  const swept = sweeps.length > before
  writing.settle(undefined)
  await ending
  fork.settle(answered(ANSWER))
  await running

  expect(swept).toBe(true)
})

// The marker is a status line's cue, so its writes are strict: a /btw handed to Claude Code waits until the marker has
// been emptied, and Claude Code's own /btw then never runs beside a marker that still says one is answered.
for (const [what, reply] of [
  ['comes back empty', { isAnswered: false, reason: 'empty-reply', usage }],
  ['is cancelled', { isAnswered: false, reason: 'aborted', usage }],
] as const) {
  test(`A6.status: a /btw whose fork ${what} ends only once its marker is emptied`, async ($, on) => {
    mock.env(on, FILE_MODE)
    const fork = held()
    const emptying = held()
    const cue = cueSink(on)
    const markAtHandback: boolean[] = []
    on('command.run', { command: 'btw' }, async () => {
      markAtHandback.push(cue.markOn())
      return { text: 'the built-in /btw' }
    })
    engine(on, fork.promise)
    await start($)

    let ended = false
    const running = BTW($, 'strict').then((r: unknown) => ((ended = true), r))
    await tick()
    cue.holdNextMark(emptying.promise)
    fork.settle(reply)
    await tick()
    const endedWhileHeld = ended
    emptying.settle(undefined)
    await running

    expect(endedWhileHeld).toBe(false)
    expect(markAtHandback.every((on) => on === false)).toBe(true)
    expect(cue.markOn()).toBe(false)
  })
}

test('A6.status: a /btw Claude Code answers runs only once an older marker is emptied', async ($, on) => {
  mock.env(on, FILE_MODE)
  const older = held()
  const emptying = held()
  const cue = cueSink(on)
  const markAtHandback: boolean[] = []
  on('command.run', { command: 'btw' }, async () => {
    markAtHandback.push(cue.markOn())
    return { text: 'the built-in /btw' }
  })
  engine(on, older.promise)
  await start($)

  const a = BTW($, 'older')
  await tick()
  cue.holdNextMark(emptying.promise)
  let handed = false
  const b = BTW($, '   ').then((r: unknown) => ((handed = true), r))
  await tick()
  const handedWhileHeld = handed
  emptying.settle(undefined)
  await b
  older.settle(answered('older'))
  await a

  expect(handedWhileHeld).toBe(false)
  expect(markAtHandback).toEqual([false])
})
