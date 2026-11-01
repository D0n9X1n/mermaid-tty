import test from 'node:test'
import assert from 'node:assert/strict'
import { safePlan } from '../../hooks/plan.ts'

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
import { createPictures } from '../../hooks/image.ts'
const PNG = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]),
  Buffer.from('IHDR'),
  Buffer.from([0, 0, 1, 64, 0, 0, 2, 128, 8, 6, 0, 0, 0]),
]).toString('base64')
const pix = (vars: Record<string, string> = { TERM: 'xterm-kitty' }) => {
  const runs: string[] = []
  const $ = {
    ui,
    env: { get: async (n: string) => vars[n] },
    config: { list: async () => [{ key: 'theme', value: 'dark' }] },
    process: {
      run: async (argv: string[]) => {
        runs.push(argv[1] === '--version' ? 'probe' : argv[0]!)
        let stdout = ''
        if (argv[1] === '--version') {
          stdout = '11.17.1\n'
        } else if (argv[0] === 'mktemp') {
          stdout = '/tmp/mermaid-tty.X1\n'
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
  assert.deepEqual(runs, ['probe', 'mktemp', 'mmdc', 'mmdc', 'rm'])
  const p = await safePlan($, ev(reply), 'default', diagram, s)
  assert.deepEqual(shape(p), ['prose', 'picture', 'prose'])
  assert.deepEqual((p!.parts[1] as any).picture, { png: PNG, columns: 20, rows: 20 })
  assert.equal((p!.parts[2] as any).prose, `m\n${BAD}b`)
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
