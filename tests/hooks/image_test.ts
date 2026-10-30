import test from 'node:test'
import assert from 'node:assert/strict'
import { createPictures, fit, pictureFor, pictureLook, pngSize, puppeteerConfig } from '../../hooks/image.ts'

// A PNG's first 33 bytes: signature, then the IHDR chunk with the width and height.
const png = (w: number, h: number) => {
  const b = Buffer.alloc(33); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0)
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20)
  return b.toString('base64')
}
// A diagram core parses, one per id.
const fc = (id: string) => `flowchart TD\n${id} --> ${id}x`

// A fake $: kitty outside tmux, a dark CC theme, and an mmdc (version 11.17.1 unless `version` says otherwise; an Error
// makes `mmdc --version` reject) that writes a w x h PNG. run(argv, init) answers a render; every call is recorded.
type Run = (argv: string[], init: any) => Promise<any>
const fake = (o: { vars?: Record<string, string>; theme?: unknown; run?: Run; w?: number; h?: number; size?: number; version?: string | Error } = {}) => {
  const runs: { argv: string[]; init: any }[] = [], writes: [string, string][] = [], logs: string[] = [], asked: string[] = []
  const vars = o.vars ?? { TERM: 'xterm-kitty', TMPDIR: '/tmp/' }
  const mmdc: Run = o.run ?? (async () => ({ exitCode: 0, stdout: '', stderr: '' }))
  const $ = {
    env: { get: async (n: string) => { asked.push(n); return vars[n] } },
    config: { list: async () => [{ key: 'verbose', value: false }, { key: 'theme', value: 'theme' in o ? o.theme : 'dark' }] },
    process: { run: async (argv: string[], init: any) => {
      runs.push({ argv, init })
      if (argv[0] === 'mmdc' && argv[1] === '--version') {
        if (o.version instanceof Error) throw o.version
        return { exitCode: 0, stdout: `${o.version ?? '11.17.1'}\n`, stderr: '' }
      }
      if (argv[0] === 'mktemp') return { exitCode: 0, stdout: '/tmp/mermaid-tty.Ab12Cd\n', stderr: '' }
      if (argv[0] === 'rm') return { exitCode: 0, stdout: '', stderr: '' }
      return mmdc(argv, init)
    } },
    fs: {
      write: async (p: string, t: string) => { writes.push([p, t]) },
      stat: async () => ({ kind: 'file', size: o.size ?? 2000 }),
      read: async () => ({ base64: png(o.w ?? 320, o.h ?? 640) }),
    },
    ui: { invalidate: (e: string) => { asked.push(`invalidate:${e}`) } },
  }
  return { $, runs, writes, logs, asked, log: (r: string) => { logs.push(r) } }
}
const argvOf = (f: ReturnType<typeof fake>, cmd: string) => f.runs.filter(r => r.argv[0] === cmd && r.argv[1] !== '--version')
const renders = (f: ReturnType<typeof fake>) => argvOf(f, 'mmdc').length
const probes = (f: ReturnType<typeof fake>) => f.runs.filter(r => r.argv[1] === '--version').length
const redraws = (f: ReturnType<typeof fake>) => f.asked.filter(a => a.startsWith('invalidate')).length

test('A6.hook-tests: pngSize reads the IHDR width and height; anything else is null', () => {
  assert.deepEqual(pngSize(png(222, 650)), { width: 222, height: 650 })
  assert.deepEqual(pngSize(png(70000, 3)), { width: 70000, height: 3 })
  assert.equal(pngSize(''), null)
  assert.equal(pngSize(Buffer.from('GIF89a................................').toString('base64')), null)
  assert.equal(pngSize(png(0, 10)), null)
})

// Pixels are drawn 2x (16 a column), cells are about 1:2, so rows = round(columns * h / w / 2).
test('A6.hook-tests: sizing fits the columns, keeps the aspect, clamps to 1..255, and gives up past 255 rows', () => {
  assert.deepEqual(fit(320, 640, 80), { columns: 20, rows: 20 })
  assert.deepEqual(fit(222, 650, 80), { columns: 14, rows: 20 })
  assert.deepEqual(fit(3200, 400, 80), { columns: 80, rows: 5 })   // wider than the columns: scaled into them
  assert.deepEqual(fit(1600, 10, 300), { columns: 100, rows: 1 })  // at least one row
  assert.deepEqual(fit(8000, 400, 300), { columns: 255, rows: 6 }) // at most 255 columns
})
test('A6.hook-tests: a picture taller than 255 rows is no picture', () => {
  assert.deepEqual(fit(160, 5000, 80), { columns: 10, rows: 156 })
  assert.equal(fit(160, 9000, 80), null)
})

test('A6.hook-tests: the look: dark or light from the Claude Code theme; none for mono, no pixels, or an unknown theme', async () => {
  for (const [theme, want] of [['dark', 'dark'], ['dark-daltonized', 'dark'], ['dark-ansi', 'dark'], ['light', 'default'], ['light-ansi', 'default'], ['auto', null], [undefined, null], [3, null]] as const) {
    const f = fake({ theme: theme ?? null }); assert.equal(await pictureLook(f.$, createPictures(), 'default'), want, String(theme))
  }
  assert.equal(await pictureLook(fake().$, createPictures(), 'nord'), 'dark')
  assert.equal(await pictureLook(fake().$, createPictures(), 'mono'), null)
  assert.equal(await pictureLook(fake({ vars: { TERM: 'xterm-kitty', TMUX: '1' } }).$, createPictures(), 'default'), null)
  const f = fake(); f.$.config.list = async () => { throw new Error('no') }; assert.equal(await pictureLook(f.$, createPictures(), 'default'), null)
})

test('A6.hook-tests: the terminal is told once per store', async () => {
  const f = fake(), s = createPictures(); await pictureLook(f.$, s, 'default'); const n = f.asked.length
  await pictureLook(f.$, s, 'default'); assert.equal(f.asked.length, n)
})

// Chromium under mmdc must reach no network, loopback included: every request goes to a proxy at the discard port, which
// loopback does not bypass, and no host name resolves. The page is 12 CSS px a column (defaultViewport, which mmdc 12
// sizes by; mmdc 11 takes -w).
test('A6.hook-tests: the puppeteer config cuts Chromium off the network and sets the page width', () => {
  assert.deepEqual(puppeteerConfig(80), {
    args: ['--proxy-server=127.0.0.1:9', '--proxy-bypass-list=<-loopback>', '--host-resolver-rules=MAP * ~NOTFOUND',
      '--dns-prefetch-disable', '--disable-background-networking', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'],
    defaultViewport: { width: 960, height: 600 },
  })
})

test('A6.hook-tests: a miss draws nothing now, runs mmdc (11) in the background with -p and -w, cleans up, and redraws with the picture', async () => {
  const f = fake(), s = createPictures(), body = fc('A')
  assert.equal(pictureFor(f.$, s, body, 'dark', 80, f.log), undefined)
  await s.idle()
  assert.deepEqual(f.runs.map(r => r.argv.slice(0, 2).join(' ')), ['mmdc --version', 'mktemp -d', 'mmdc -i', 'rm -rf'])
  assert.deepEqual(argvOf(f, 'mktemp')[0]!.argv, ['mktemp', '-d', '/tmp/mermaid-tty.XXXXXX'])
  const D = '/tmp/mermaid-tty.Ab12Cd', [m] = argvOf(f, 'mmdc')
  assert.deepEqual(m!.argv, ['mmdc', '-i', '-', '-o', `${D}/out.png`, '-e', 'png', '-b', 'transparent', '-t', 'dark',
    '-c', `${D}/config.json`, '-p', `${D}/puppeteer.json`, '-s', '2', '-q', '-w', '960'])
  assert.equal(m!.init.stdin, body); assert.ok(m!.init.timeoutMs > 0)
  assert.deepEqual(f.writes.map(([p, t]) => [p, JSON.parse(t)]), [[`${D}/config.json`, { securityLevel: 'strict' }], [`${D}/puppeteer.json`, puppeteerConfig(80)]])
  assert.deepEqual(argvOf(f, 'rm')[0]!.argv, ['rm', '-rf', D])
  assert.equal(redraws(f), 1); assert.deepEqual(f.logs, [])
  assert.deepEqual(pictureFor(f.$, s, body, 'dark', 80, f.log), { png: png(320, 640), columns: 20, rows: 20 })
  assert.equal(f.runs.length, 4) // the hit runs nothing
})

// mermaid-cli 12 removed -w: the page width comes from the puppeteer config alone.
test('A6.hook-tests: mmdc 12 gets no -w', async () => {
  const f = fake({ version: '12.0.0' }), s = createPictures()
  pictureFor(f.$, s, fc('A'), 'dark', 80, f.log); await s.idle()
  assert.equal(argvOf(f, 'mmdc')[0]!.argv.includes('-w'), false); assert.ok(argvOf(f, 'mmdc')[0]!.argv.includes('-p'))
  assert.ok(pictureFor(f.$, s, fc('A'), 'dark', 80, f.log)); assert.deepEqual(f.logs, [])
})

test('A5.errors: mmdc missing, or a version that is not one, logs once and renders nothing in that store', async () => {
  for (const version of [new Error('spawn mmdc ENOENT'), 'hello']) {
    const f = fake({ version }), s = createPictures()
    pictureFor(f.$, s, fc('A'), 'dark', 80, f.log); await s.idle()
    pictureFor(f.$, s, fc('B'), 'dark', 80, f.log); await s.idle()
    assert.equal(probes(f), 1); assert.equal(renders(f), 0); assert.equal(argvOf(f, 'mktemp').length, 0)
    assert.equal(f.logs.length, 1, String(version)); assert.match(f.logs[0]!, /^image: no usable mmdc/); assert.equal(redraws(f), 0)
  }
})

// Only what core parses goes to mmdc: core rejects HTML, icons and image nodes, which Chromium would fetch. A source
// over Mermaid's 50000-character limit would come back as its error picture, so it is not rendered either.
test('A5.errors: a source core does not parse, or one over 50000 characters, never reaches mmdc', async () => {
  const f = fake(), s = createPictures()
  for (const body of [`flowchart TD\nA["<img src='http://127.0.0.1:1/x'>"] --> B`, 'flowchart TD\nC@{ img: "http://127.0.0.1:1/y", label: "n" }',
    'flowchart TD\nA[fa:fa-car x]', 'flowchart TD\nA[open --> B', 'radar-beta\naxis A']) {
    assert.equal(pictureFor(f.$, s, body, 'dark', 80, f.log), undefined, body)
  }
  await s.idle(); assert.deepEqual(f.runs, []); assert.deepEqual(f.logs, [])
  const big = `flowchart TD\nA["${'x'.repeat(50000)}"] --> B`
  pictureFor(f.$, s, big, 'dark', 80, f.log); pictureFor(f.$, s, big, 'dark', 80, f.log); await s.idle()
  assert.deepEqual(f.runs, []); assert.deepEqual(f.logs, ['image: source over 50000 characters'])
})

test('A6.hook-tests: requests for one diagram, theme and width share one render; another theme or width is its own', async () => {
  const f = fake(), s = createPictures(), body = fc('A')
  for (let i = 0; i < 3; i++) pictureFor(f.$, s, body, 'dark', 80, f.log)
  pictureFor(f.$, s, body, 'default', 80, f.log); pictureFor(f.$, s, body, 'dark', 60, f.log)
  await s.idle(); assert.equal(renders(f), 3); assert.equal(probes(f), 1)
})

test('A6.hook-tests: renders run one at a time, and a batch redraws once', async () => {
  let live = 0, most = 0
  const f = fake({ run: async () => { live++; most = Math.max(most, live); await new Promise(r => setTimeout(r, 5)); live--; return { exitCode: 0, stdout: '', stderr: '' } } })
  const s = createPictures(); for (const b of ['A', 'B', 'C']) pictureFor(f.$, s, fc(b), 'dark', 80, f.log)
  await s.idle(); assert.equal(most, 1); assert.equal(renders(f), 3); assert.equal(redraws(f), 1)
})

// mmdc draws on a page 12 CSS px a column wide, and the picture shows at 8: one well inside the page was drawn at its
// own size and is scaled by at least 2/3; one over 90% of it (mmdc's margins take the rest) was shrunk by mmdc to fit,
// perhaps past reading.
test('A6.hook-tests: a picture inside 90% of the page is scaled into the columns', async () => {
  const f = fake({ w: 1700, h: 100 }), s = createPictures()
  pictureFor(f.$, s, fc('A'), 'dark', 80, f.log); await s.idle()
  assert.deepEqual(pictureFor(f.$, s, fc('A'), 'dark', 80, f.log), { png: png(1700, 100), columns: 80, rows: 2 }); assert.deepEqual(f.logs, [])
})

// Each failure logs a reason, removes the temp dir, redraws nothing, and is not tried again.
for (const [name, o, reason] of [
  ['mmdc vanishing after its version', { run: async () => { throw new Error('spawn mmdc ENOENT') } }, /^image: .*ENOENT/],
  ['mmdc timing out', { run: async () => { throw new Error('timed out after 30000 ms') } }, /^image: .*timed out/],
  ['mmdc failing', { run: async () => ({ exitCode: 1, stdout: '', stderr: 'Parse error on line 2' }) }, /^image: mmdc exited 1: Parse error on line 2$/],
  ['a PNG over 2 MiB', { size: 2 * 1024 * 1024 + 1 }, /^image: png over 2 MiB$/],
  ['a picture over 255 rows', { w: 160, h: 9000 }, /^image: over 255 rows$/],
  ['a picture as wide as the page (mmdc shrank it to fit)', { w: 1920, h: 100 }, /^image: too wide to read$/],
] as [string, object, RegExp][]) {
  test(`A5.errors: ${name} keeps the text drawing, logs why, and cleans up`, async () => {
    const f = fake(o), s = createPictures()
    pictureFor(f.$, s, fc('A'), 'dark', 80, f.log); await s.idle()
    assert.equal(f.logs.length, 1); assert.match(f.logs[0]!, reason)
    assert.deepEqual(argvOf(f, 'rm').map(r => r.argv), [['rm', '-rf', '/tmp/mermaid-tty.Ab12Cd']])
    assert.equal(redraws(f), 0)
    assert.equal(pictureFor(f.$, s, fc('A'), 'dark', 80, f.log), undefined); await s.idle()
    assert.equal(argvOf(f, 'mktemp').length, 1)
  })
}

test('A5.errors: no temp dir, or a path mktemp should not have made, runs no mmdc and removes nothing', async () => {
  for (const made of [{ exitCode: 1, stdout: '', stderr: 'no' }, { exitCode: 0, stdout: '/\n', stderr: '' }, { exitCode: 0, stdout: '/etc/mermaid-tty.Ab12Cd\n', stderr: '' }]) {
    const f = fake(), s = createPictures(), run = f.$.process.run
    f.$.process.run = async (argv: string[], init: any) => argv[0] === 'mktemp' ? (f.runs.push({ argv, init }), made) : run(argv, init)
    pictureFor(f.$, s, fc('A'), 'dark', 80, f.log); await s.idle()
    assert.deepEqual(f.runs.map(r => r.argv.slice(0, 2).join(' ')), ['mmdc --version', 'mktemp -d'], JSON.stringify(made)); assert.deepEqual(f.logs, ['image: no temp dir'])
  }
})

test('A5.errors: a failing log or redraw never escapes the background render', async () => {
  const f = fake(), s = createPictures(); f.$.ui.invalidate = () => { throw new Error('gone') }
  pictureFor(f.$, s, fc('A'), 'dark', 80, () => { throw new Error('log down') }); await s.idle()
  assert.ok(pictureFor(f.$, s, fc('A'), 'dark', 80, f.log))
  const g = fake({ run: async () => { throw new Error('x') } }), t = createPictures()
  pictureFor(g.$, t, fc('A'), 'dark', 80, () => { throw new Error('log down') }); await t.idle()
  assert.equal(renders(g), 1)
})

// A key is rendered at most once per store: a picture the cache drops is not rendered again, so a reply with more
// diagrams than the cache holds cannot evict, render and redraw for ever.
test('A8.cache: the picture cache is bounded by entries; a dropped picture is not rendered again', async () => {
  const f = fake(), s = createPictures({ entries: 2 })
  for (const b of ['A', 'B', 'C']) { pictureFor(f.$, s, fc(b), 'dark', 80, f.log); await s.idle() }
  assert.ok(pictureFor(f.$, s, fc('C'), 'dark', 80, f.log)); assert.equal(pictureFor(f.$, s, fc('A'), 'dark', 80, f.log), undefined)
  await s.idle(); assert.equal(renders(f), 3)
})

test('A8.cache: the picture cache is bounded by bytes of PNG', async () => {
  const f = fake(), s = createPictures({ bytes: 100 }) // each PNG here is 44 base64 characters
  for (const b of ['A', 'B', 'C']) { pictureFor(f.$, s, fc(b), 'dark', 80, f.log); await s.idle() }
  assert.ok(pictureFor(f.$, s, fc('B'), 'dark', 80, f.log)); assert.ok(pictureFor(f.$, s, fc('C'), 'dark', 80, f.log))
  assert.equal(pictureFor(f.$, s, fc('A'), 'dark', 80, f.log), undefined); await s.idle(); assert.equal(renders(f), 3)
})

test('A8.cache: at most 8 renders wait; a request past that is dropped, and asked again on a later draw', async () => {
  const f = fake(), s = createPictures()
  for (let i = 0; i < 10; i++) pictureFor(f.$, s, fc(`D${i}`), 'dark', 80, f.log)
  await s.idle(); assert.equal(renders(f), 8)
  pictureFor(f.$, s, fc('D9'), 'dark', 80, f.log); await s.idle(); assert.equal(renders(f), 9)
})

test('A8.cache: the keys tried are bounded; past that, a new diagram stays text', async () => {
  const f = fake(), s = createPictures({ tried: 2 })
  for (const b of ['A', 'B', 'C']) { pictureFor(f.$, s, fc(b), 'dark', 80, f.log); await s.idle() }
  assert.equal(renders(f), 2); assert.equal(pictureFor(f.$, s, fc('C'), 'dark', 80, f.log), undefined)
})

// The review's repro: 17 diagrams in one reply, a cache of 16, and every redraw asking for all 17 again. Each renders
// once, redraws come one per batch (8 + 8 + 1), and the loop ends.
test('A8.cache: 17 diagrams over a 16-picture cache render 17 times and stop', async () => {
  const f = fake(), s = createPictures({ entries: 16 }), bodies = Array.from({ length: 17 }, (_, i) => fc(`N${i}`))
  let shown = 0
  const draw = () => { shown = bodies.filter(b => pictureFor(f.$, s, b, 'dark', 80, f.log)).length }
  f.$.ui.invalidate = () => { f.asked.push('invalidate'); if (redraws(f) < 50) draw() }
  draw(); await s.idle()
  assert.equal(renders(f), 17); assert.equal(redraws(f), 3); assert.equal(shown, 16)
})
