import test from 'node:test'
import assert from 'node:assert/strict'
import { DRAWN_CHARS, safePlan } from '../../hooks/plan.ts'

// Fail closed at the hook: an error in the plugin's own work gives null, and the hook then sends the reply through
// next(e) unchanged. The debug log is best-effort: a failing log never stops a drawing.
const FC = '```mermaid\nflowchart TD\nP[一] --> Q[二]\n```\n'
const BAD = '```mermaid\nflowchart TD\nA[👩‍👧]\n```\n'
const ev = (text: string) => ({
  surface: 'terminal',
  props: { text, isFirstOfReply: true },
  viewport: { columns: 80, rows: 40 },
})
const ui = { log: () => {}, resolve: () => ({ Box: 'Box', Text: 'Text' }) }
const diagram = async () => 'diagram' as const
const boom = () => {
  throw new Error('down')
}

test('A5.errors: a throwing mode read, UI resolve or renderer callback gives null, so the reply goes through untouched', async () => {
  assert.equal(await safePlan({ ui }, ev(`a\n${FC}b`), 'default', async () => boom()), null)
  assert.equal(await safePlan({ ui: { ...ui, resolve: boom } }, ev(`a\n${FC}b`), 'default', diagram), null)
})
// The crossings setting only colors lines: a read that fails, by throwing or by rejecting, keeps the default, on, and
// never drops the drawing.
test('A5.errors: a crossings read that throws or rejects still draws the diagram, its crossing lines colored', async () => {
  const cross = '```mermaid\nflowchart TD\nA --> C\nA --> D\nB --> C\nB --> D\n```\n'
  const at = (crossings: () => Promise<'on' | 'off'>) =>
    safePlan({ ui }, ev(`a\n${cross}b`), 'nord', diagram, undefined, async () => 'off', crossings)

  const thrown = await at(() => boom())
  const rejected = await at(async () => boom())
  const on = await at(async () => 'on')

  assert.ok(thrown && rejected && on)
  assert.deepEqual(thrown.parts, on.parts)
  assert.deepEqual(rejected.parts, on.parts)
})
test('A5.errors: a throwing or rejecting debug log still draws the diagram; the failed fence joins the prose', async () => {
  // Each run uses its own failing fence, so no cache hit skips the logger.
  for (const [k, thrower] of [
    [0, boom],
    [1, async () => boom()],
  ] as const) {
    const bad = BAD.replace('A[', `A${k}[`)
    let calls = 0
    const p = await safePlan(
      {
        ui: {
          ...ui,
          log: () => {
            calls++
            return thrower()
          },
        },
      },
      ev(`a\n${bad}m\n${FC}b`),
      'default',
      diagram,
    )
    assert.deepEqual(
      p?.parts.map((x) => ('prose' in x ? x.prose : 'rows')),
      [`a\n${bad}m\n`, 'rows', 'b'],
    )
    assert.equal(calls, 1)
  }
})

// Pictures: a fake $ in kitty with a dark Claude Code theme, whose mmdc writes a 320 x 640 PNG.
import { createPictures, MAKE_TEMP } from '../../hooks/image.ts'
const PNG = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]),
  Buffer.from('IHDR'),
  Buffer.from([0, 0, 1, 64, 0, 0, 2, 128, 8, 6, 0, 0, 0]),
]).toString('base64')
// What a run was: the version probe, the temp dir's Node runs, or the command itself.
const name = (argv: string[]) => {
  if (argv[1] === '--version') {
    return 'probe'
  }

  if (argv[0] === 'node') {
    return argv[2] === MAKE_TEMP ? 'make temp' : 'remove temp'
  }

  return argv[0]!
}
const pix = (vars: Record<string, string> = { TERM: 'xterm-kitty' }) => {
  const runs: string[] = []
  const $ = {
    ui,
    env: { get: async (n: string) => vars[n] },
    config: { list: async () => [{ key: 'theme', value: 'dark' }] },
    process: {
      run: async (argv: string[]) => {
        runs.push(name(argv))
        let stdout = ''
        if (argv[1] === '--version') {
          stdout = '11.17.1\n'
        } else if (argv[0] === 'node' && argv[2] === MAKE_TEMP) {
          stdout = JSON.stringify({ tmp: '/tmp', dir: '/tmp/mermaid-tty.X1y2Z3' })
        }

        return { exitCode: 0, stdout, stderr: '' }
      },
    },
    fs: {
      write: async () => {},
      stat: async () => ({ size: 100 }),
      read: async (p: string) => (p.endsWith('.svg') ? '<svg><path marker-end="url(#a)"/></svg>' : { base64: PNG }),
    },
  }
  return { $, runs }
}
// A plan part's kind: prose, rows or picture.
const partKind = (x: any) => {
  if ('prose' in x) {
    return 'prose'
  }

  return 'rows' in x ? 'rows' : 'picture'
}
const shape = (p: any) => p?.parts.map(partKind)

// Only a fence core parses becomes a picture: BAD (a character core rejects) stays prose. FAN parses but is too wide
// for text at 40 columns, so its picture stands in for its source.
const FAN =
  '```mermaid\nflowchart TD\nA[start] --> B[one]\nA --> C[two]\nA --> D[three]\nA --> E[four]\nA --> F[five]\n```\n'
const at = (text: string, columns: number) => ({ ...ev(text), viewport: { columns, rows: 40 } })
test('A6.hook-tests: where pixels show, a fence draws as text first, then as its picture; one core does not parse never does', async () => {
  const { $, runs } = pix()
  const s = createPictures()
  const reply = `a\n${FC}m\n${BAD}b`
  assert.deepEqual(shape(await safePlan($, ev(reply), 'default', diagram, s)), ['prose', 'rows', 'prose'])
  await s.idle()
  assert.deepEqual(runs, ['probe', 'make temp', 'mmdc', 'mmdc', 'remove temp'])
  const p = await safePlan($, ev(reply), 'default', diagram, s)
  assert.deepEqual(shape(p), ['prose', 'picture', 'prose'])
  assert.deepEqual((p!.parts[1] as any).picture, { png: PNG, columns: 20, rows: 20 })
  assert.equal((p!.parts[2] as any).prose, `m\n${BAD}b`)
})
// The size only sets the box a picture is shown in: the same cached picture, once rendered, shows smaller in compact,
// with no render of its own. A size read that fails, by throwing or by rejecting, keeps compact.
test('A6.hook-tests: a picture shows in fewer cells in compact, from the one picture rendered', async () => {
  const { $, runs } = pix()
  const s = createPictures()
  const reply = `a\n${FC}b`
  const plan = (size: () => Promise<'full' | 'compact'>) =>
    safePlan($, ev(reply), 'default', diagram, s, undefined, undefined, size)
  await plan(async () => 'full')
  await s.idle()
  const rendered = runs.length

  const full = await plan(async () => 'full')
  const compact = await plan(async () => 'compact')
  const thrown = await plan(() => {
    throw new Error('down')
  })
  const rejected = await plan(async () => {
    throw new Error('down')
  })

  assert.deepEqual((full!.parts[1] as any).picture, { png: PNG, columns: 20, rows: 20 })
  assert.deepEqual((compact!.parts[1] as any).picture, { png: PNG, columns: 15, rows: 15 })
  assert.deepEqual((thrown!.parts[1] as any).picture, { png: PNG, columns: 15, rows: 15 })
  assert.deepEqual((rejected!.parts[1] as any).picture, { png: PNG, columns: 15, rows: 15 })
  assert.equal(runs.length, rendered)
})
test('A6.hook-tests: a fence too wide for text, which core parses, gets a picture in place of its source', async () => {
  const { $ } = pix()
  const s = createPictures()
  const reply = `a\n${FAN}b`
  assert.equal(await safePlan($, at(reply, 40), 'default', diagram, s), null)
  await s.idle()
  assert.deepEqual(shape(await safePlan($, at(reply, 40), 'default', diagram, s)), ['prose', 'picture', 'prose'])
})

test('A6.command: text mode, mono, tmux and source never run mmdc', async () => {
  for (const [vars, theme, mode] of [
    [undefined, 'default', 'text'],
    [undefined, 'mono', 'diagram'],
    [{ TERM: 'xterm-kitty', TMUX: '1' }, 'default', 'diagram'],
  ] as const) {
    const { $, runs } = pix(vars as any)
    const s = createPictures()
    assert.deepEqual(shape(await safePlan($, ev(`a\n${FC}b`), theme, async () => mode, s)), ['prose', 'rows', 'prose'])
    await s.idle()
    assert.deepEqual(runs, [])
  }

  const { $, runs } = pix()
  const s = createPictures()
  assert.equal(await safePlan($, ev(`a\n${FC}b`), 'default', async () => 'source' as const, s), null)
  await s.idle()
  assert.deepEqual(runs, [])
})

// The images setting reaches the plan: off keeps a kitty terminal on text and runs no mmdc; on draws the picture in a
// terminal detection does not know. A throwing setting read is auto.
test('A6.command: images off never runs mmdc; images on pictures an undetected terminal', async () => {
  const off = pix()
  const s = createPictures()
  const reply = `a\n${FC}b`
  assert.deepEqual(shape(await safePlan(off.$, ev(reply), 'default', diagram, s, async () => 'off' as const)), [
    'prose',
    'rows',
    'prose',
  ])
  await s.idle()
  assert.deepEqual(off.runs, [])
  const on = pix({ TERM: 'xterm-256color' })
  const t = createPictures()
  const images = async () => 'on' as const
  await safePlan(on.$, ev(reply), 'default', diagram, t, images)
  await t.idle()
  assert.deepEqual(shape(await safePlan(on.$, ev(reply), 'default', diagram, t, images)), ['prose', 'picture', 'prose'])
  const thrown = pix({ TERM: 'xterm-256color' })
  const u = createPictures()
  const broken = async (): Promise<'on'> => {
    throw new Error('no')
  }
  assert.deepEqual(shape(await safePlan(thrown.$, ev(reply), 'default', diagram, u, broken)), [
    'prose',
    'rows',
    'prose',
  ])
  await u.idle()
  assert.deepEqual(thrown.runs, [])
  // A reader that throws before returning a promise is auto too, not a failed plan.
  const sync = (): Promise<'on'> => {
    throw new Error('no')
  }
  assert.deepEqual(shape(await safePlan(thrown.$, ev(reply), 'default', diagram, u, sync)), ['prose', 'rows', 'prose'])
})

test('A5.errors: a throwing picture lookup still draws the text', async () => {
  const { $ } = pix()
  ;($ as any).config.list = () => {
    throw new Error('x')
  }
  ;($ as any).env.get = () => {
    throw new Error('y')
  }
  assert.deepEqual(shape(await safePlan($, ev(`a\n${FC}b`), 'default', diagram, createPictures())), [
    'prose',
    'rows',
    'prose',
  ])
})

// Claude Code draws at most 100,000 characters of a drawing and drops the rest, so a reply drawn past that would show
// only in part. Such a reply goes through as its source, whole, and one under it draws as before.
test('A5.errors: a reply whose drawing would pass the characters Claude Code draws goes through as its source', async () => {
  const seq = (n: number) =>
    [
      '```mermaid',
      'sequenceDiagram',
      'participant A as First',
      `participant B as ${'B'.repeat(45)}`,
      `participant C as ${'C'.repeat(45)}`,
      'participant D as Last',
      ...Array(n).fill('A->>D: OK'),
      'D-->>A: FINAL STEP',
      '```',
      '',
    ].join('\n')
  const wide = (text: string) => ({ ...ev(text), viewport: { columns: 126, rows: 40 } })

  const big = await safePlan({ ui }, wide(`a\n${seq(460)}b`), 'nord', diagram)
  const small = await safePlan({ ui }, wide(`a\n${seq(20)}b`), 'nord', diagram)

  assert.equal(big, null)
  assert.ok(small)
  assert.ok(DRAWN_CHARS <= 100_000)
})
