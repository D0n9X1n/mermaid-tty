import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import {
  createPictures,
  fit,
  madeTempDir,
  MAKE_TEMP,
  pictureFor,
  pictureLook,
  pngSize,
  puppeteerConfig,
  REMOVE_TEMP,
  STALE_S,
  SWEEP_TEMP,
  sweepTemp,
} from '../../hooks/image.ts'
import { pictureTheme } from '../../hooks/picture-theme.ts'

// The temp dir's two Node runs, named for what they do: make (MAKE_TEMP) and remove (REMOVE_TEMP).
const D = '/tmp/mermaid-tty.Ab12Cd'
const MADE = JSON.stringify({ tmp: '/tmp', dir: D })
const isMake = (argv: string[]) => argv[0] === 'node' && argv[2] === MAKE_TEMP
const isRemove = (argv: string[]) => argv[0] === 'node' && argv[2] === REMOVE_TEMP
const label = (argv: string[]) => {
  if (isMake(argv)) {
    return 'make temp'
  }

  return isRemove(argv) ? 'remove temp' : argv.slice(0, 2).join(' ')
}

// A PNG's first 33 bytes: signature, then the IHDR chunk with the width and height.
const png = (w: number, h: number) => {
  const b = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0)
  b.writeUInt32BE(13, 8)
  b.write('IHDR', 12, 'latin1')
  b.writeUInt32BE(w, 16)
  b.writeUInt32BE(h, 20)
  return b.toString('base64')
}
// A diagram core parses, one per id; an SVG shaped like Mermaid's, referring only to its own markers.
const fc = (id: string) => `flowchart TD\n${id} --> ${id}x`
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><marker id="arrowhead"/><path marker-end="url(#arrowhead)"/></svg>'

// A fake $: kitty outside tmux, a dark CC theme, and an mmdc (version 11.17.1 unless `version` says otherwise; an Error
// makes `mmdc --version` reject) that writes `svg` (SVG unless given) on its SVG pass and a w x h PNG on its PNG pass.
// run(argv, init) answers each pass; every call is recorded.
type Run = (argv: string[], init: any) => Promise<any>
const fake = (
  o: {
    vars?: Record<string, string>
    theme?: unknown
    run?: Run
    w?: number
    h?: number
    size?: number
    svgSize?: number
    svg?: string
    version?: string | Error
  } = {},
) => {
  const runs: { argv: string[]; init: any }[] = []
  const writes: [string, string][] = []
  const logs: string[] = []
  const asked: string[] = []
  const vars = o.vars ?? { TERM: 'xterm-kitty', TMPDIR: '/tmp/' }
  const mmdc: Run = o.run ?? (async () => ({ exitCode: 0, stdout: '', stderr: '' }))
  const $ = {
    env: {
      get: async (n: string) => {
        asked.push(n)
        return vars[n]
      },
    },
    config: {
      list: async () => [
        { key: 'verbose', value: false },
        { key: 'theme', value: 'theme' in o ? o.theme : 'dark' },
      ],
    },
    process: {
      run: async (argv: string[], init: any) => {
        runs.push({ argv, init })
        if (argv[0] === 'mmdc' && argv[1] === '--version') {
          if (o.version instanceof Error) {
            throw o.version
          }

          return { exitCode: 0, stdout: `${o.version ?? '11.17.1'}\n`, stderr: '' }
        }

        if (isMake(argv)) {
          return { exitCode: 0, stdout: MADE, stderr: '' }
        }

        if (isRemove(argv)) {
          return { exitCode: 0, stdout: '', stderr: '' }
        }

        return mmdc(argv, init)
      },
    },
    fs: {
      write: async (p: string, t: string) => {
        writes.push([p, t])
      },
      stat: async (p: string) => ({ kind: 'file', size: p.endsWith('.svg') ? (o.svgSize ?? 500) : (o.size ?? 2000) }),
      read: async (p: string) => (p.endsWith('.svg') ? (o.svg ?? SVG) : { base64: png(o.w ?? 320, o.h ?? 640) }),
    },
    ui: {
      invalidate: (e: string) => {
        asked.push(`invalidate:${e}`)
      },
    },
  }
  return {
    $,
    runs,
    writes,
    logs,
    asked,
    log: (r: string) => {
      logs.push(r)
    },
  }
}
const argvOf = (f: ReturnType<typeof fake>, cmd: string) =>
  f.runs.filter((r) => r.argv[0] === cmd && r.argv[1] !== '--version')
const renders = (f: ReturnType<typeof fake>) =>
  argvOf(f, 'mmdc').filter((r) => r.argv[r.argv.indexOf('-e') + 1] === 'png').length
const probes = (f: ReturnType<typeof fake>) => f.runs.filter((r) => r.argv[1] === '--version').length
const redraws = (f: ReturnType<typeof fake>) => f.asked.filter((a) => a.startsWith('invalidate')).length

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
  assert.deepEqual(fit(3200, 400, 80), { columns: 80, rows: 5 }) // wider than the columns: scaled into them
  assert.deepEqual(fit(1600, 10, 300), { columns: 100, rows: 1 }) // at least one row
  assert.deepEqual(fit(8000, 400, 300), { columns: 255, rows: 6 }) // at most 255 columns
})
test('A6.hook-tests: a picture taller than 255 rows is no picture', () => {
  assert.deepEqual(fit(160, 5000, 80), { columns: 10, rows: 156 })
  assert.equal(fit(160, 9000, 80), null)
})

test('A6.hook-tests: the look: default follows the Claude Code theme; none for mono, no pixels, or an unknown theme', async () => {
  for (const [theme, want] of [
    ['dark', 'default-dark'],
    ['dark-daltonized', 'default-dark'],
    ['dark-ansi', 'default-dark'],
    ['light', 'default-light'],
    ['light-ansi', 'default-light'],
    ['auto', null],
    [undefined, null],
    [3, null],
  ] as const) {
    const f = fake({ theme: theme ?? null })
    assert.equal(await pictureLook(f.$, createPictures(), 'default'), want, String(theme))
  }

  assert.equal(await pictureLook(fake().$, createPictures(), 'mono'), null)
  assert.equal(
    await pictureLook(fake({ vars: { TERM: 'xterm-kitty', TMUX: '1' } }).$, createPictures(), 'default'),
    null,
  )
  const f = fake()
  f.$.config.list = async () => {
    throw new Error('no')
  }
  assert.equal(await pictureLook(f.$, createPictures(), 'default'), null)
})

// The images setting: off is never a picture; on skips terminal detection, asking no env var, but mono and an unknown
// Claude Code theme still mean none; auto is the detection above.
test('A6.hook-tests: images off is no look; images on needs no detected terminal, yet keeps the other rules', async () => {
  const bare = { vars: { TERM: 'xterm-256color' } }
  assert.equal(await pictureLook(fake().$, createPictures(), 'default', 'off'), null)
  assert.equal(await pictureLook(fake(bare).$, createPictures(), 'default', 'auto'), null)
  const f = fake(bare)
  assert.equal(await pictureLook(f.$, createPictures(), 'default', 'on'), 'default-dark')
  assert.deepEqual(f.asked, [])
  assert.equal(await pictureLook(fake(bare).$, createPictures(), 'mono', 'on'), null)
  assert.equal(await pictureLook(fake({ ...bare, theme: 'auto' }).$, createPictures(), 'default', 'on'), null)
})

// A curated palette paints its own background, so its look is the palette whatever Claude Code's theme, unknown too.
test('a curated palette is its own look, light or dark Claude Code theme alike', async () => {
  for (const palette of ['nord', 'dracula', 'gruvbox', 'solarized']) {
    for (const theme of ['dark', 'light', 'auto', null]) {
      assert.equal(await pictureLook(fake({ theme }).$, createPictures(), palette), palette, `${palette} ${theme}`)
    }
  }

  const f = fake()
  f.$.config.list = async () => {
    throw new Error('no')
  }
  assert.equal(await pictureLook(f.$, createPictures(), 'nord'), 'nord')
  assert.equal(await pictureLook(fake().$, createPictures(), 'nord', 'off'), null)
  assert.equal(await pictureLook(fake({ vars: { TERM: 'xterm-256color' } }).$, createPictures(), 'nord'), null)
})

test('A6.hook-tests: the terminal is told once per store', async () => {
  const f = fake()
  const s = createPictures()
  await pictureLook(f.$, s, 'default')
  const n = f.asked.length
  await pictureLook(f.$, s, 'default')
  assert.equal(f.asked.length, n)
})

// Chromium under mmdc must reach no network, loopback included: every request goes to a proxy at the discard port,
// which loopback does not bypass, and no host name resolves. The page is 12 CSS px a column (defaultViewport, which
// mmdc 12 sizes by; mmdc 11 takes -w).
test('A6.hook-tests: the puppeteer config cuts Chromium off the network and sets the page width', () => {
  assert.deepEqual(puppeteerConfig(80), {
    args: [
      '--proxy-server=127.0.0.1:9',
      '--proxy-bypass-list=<-loopback>',
      '--host-resolver-rules=MAP * ~NOTFOUND',
      '--dns-prefetch-disable',
      '--disable-background-networking',
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
    ],
    defaultViewport: { width: 960, height: 600 },
  })
})

// Two passes: an SVG, checked by hooks/svg.ts, then (only if it is clean) the PNG.
test('A6.hook-tests: a miss draws nothing now, runs mmdc (11) in the background, SVG then PNG with -p and -w, cleans up, and redraws with the picture', async () => {
  const f = fake()
  const s = createPictures()
  const body = fc('A')
  assert.equal(pictureFor(f.$, s, body, 'default-dark', 80, f.log), undefined)
  await s.idle()
  assert.deepEqual(
    f.runs.map((r) => label(r.argv)),
    ['mmdc --version', 'make temp', 'mmdc -i', 'mmdc -i', 'remove temp'],
  )
  const [sv, m] = argvOf(f, 'mmdc')
  assert.deepEqual(sv!.argv, [
    'mmdc',
    '-i',
    '-',
    '-o',
    `${D}/out.svg`,
    '-e',
    'svg',
    '-b',
    'transparent',
    '-t',
    'dark',
    '-c',
    `${D}/config.json`,
    '-p',
    `${D}/puppeteer.json`,
    '-q',
    '-w',
    '960',
  ])
  assert.deepEqual(m!.argv, [
    'mmdc',
    '-i',
    '-',
    '-o',
    `${D}/out.png`,
    '-e',
    'png',
    '-b',
    'transparent',
    '-t',
    'dark',
    '-c',
    `${D}/config.json`,
    '-p',
    `${D}/puppeteer.json`,
    '-s',
    '2',
    '-q',
    '-w',
    '960',
  ])
  assert.equal(sv!.init.stdin, body)
  assert.equal(m!.init.stdin, body)
  assert.ok(m!.init.timeoutMs > 0)
  assert.deepEqual(
    f.writes.map(([p, t]) => [p, JSON.parse(t)]),
    [
      [`${D}/config.json`, pictureTheme('default-dark').config],
      [`${D}/puppeteer.json`, puppeteerConfig(80)],
    ],
  )
  assert.deepEqual(f.runs.filter((r) => isRemove(r.argv))[0]!.argv, ['node', '-e', REMOVE_TEMP, D])
  assert.equal(redraws(f), 1)
  assert.deepEqual(f.logs, [])
  assert.deepEqual(pictureFor(f.$, s, body, 'default-dark', 80, f.log), { png: png(320, 640), columns: 20, rows: 20 })
  assert.equal(f.runs.length, 5) // the hit runs nothing
})

// mermaid-cli 12 removed -w: the page width comes from the puppeteer config alone. 12 embeds its fonts in an SVG as
// data: URLs unless told --no-font-embed; the SVG check allows no data: at all.
test('A6.hook-tests: mmdc 12 gets no -w, and its SVG pass gets --no-font-embed', async () => {
  const f = fake({ version: '12.0.0' })
  const s = createPictures()
  pictureFor(f.$, s, fc('A'), 'default-dark', 80, f.log)
  await s.idle()
  const [sv, m] = argvOf(f, 'mmdc')
  for (const r of [sv!, m!]) {
    assert.equal(r.argv.includes('-w'), false)
    assert.ok(r.argv.includes('-p'))
  }

  assert.ok(sv!.argv.includes('--no-font-embed'))
  assert.equal(m!.argv.includes('--no-font-embed'), false)
  assert.ok(pictureFor(f.$, s, fc('A'), 'default-dark', 80, f.log))
  assert.deepEqual(f.logs, [])
})

test('A5.errors: mmdc missing, or a version that is not one, logs once and renders nothing in that store', async () => {
  for (const version of [new Error('spawn mmdc ENOENT'), 'hello']) {
    const f = fake({ version })
    const s = createPictures()
    pictureFor(f.$, s, fc('A'), 'default-dark', 80, f.log)
    await s.idle()
    pictureFor(f.$, s, fc('B'), 'default-dark', 80, f.log)
    await s.idle()
    assert.equal(probes(f), 1)
    assert.equal(renders(f), 0)
    assert.equal(f.runs.filter((r) => isMake(r.argv)).length, 0)
    assert.equal(f.logs.length, 1, String(version))
    assert.match(f.logs[0]!, /^image: no usable mmdc/)
    assert.equal(redraws(f), 0)
  }
})

// Only what core parses goes to mmdc: core rejects HTML, icons and image nodes, which Chromium would fetch. A source
// over Mermaid's 50000-character limit would come back as its error picture, so it is not rendered either.
test('A5.errors: a source core does not parse, or one over 50000 characters, never reaches mmdc', async () => {
  const f = fake()
  const s = createPictures()
  for (const body of ['flowchart TD\nA[fa:fa-car x]', 'flowchart TD\nA[open --> B', 'radar-beta\naxis A']) {
    assert.equal(pictureFor(f.$, s, body, 'default-dark', 80, f.log), undefined, body)
  }

  await s.idle()
  assert.deepEqual(f.runs, [])
  assert.deepEqual(f.logs, [])
  const big = `flowchart TD\nA["${'x'.repeat(50000)}"] --> B`
  pictureFor(f.$, s, big, 'default-dark', 80, f.log)
  pictureFor(f.$, s, big, 'default-dark', 80, f.log)
  await s.idle()
  assert.deepEqual(f.runs, [])
  assert.deepEqual(f.logs, ['image: source over 50000 characters'])
})

// The gate in hooks/safe.ts, apart from core's parser: the reviewer's repro (a frontmatter themeCSS that drew a local
// file into the PNG, with every isolation flag on) and one source per rule, each one core parses, run nothing and log
// why once. An mmdc that is run fails the test.
const REPRO =
  "---\nconfig:\n  themeCSS: '.nodeLabel::before {content: url(file:///tmp/private.svg)}'\n---\nflowchart TD\nA --> B"
test('A5.errors: an unsafe source never reaches mmdc: the themeCSS repro, and one per rule', async () => {
  for (const [body, reason] of [
    [REPRO, 'frontmatter'],
    ['---\ndisplayMode: compact\n---\nflowchart TD\nA --> B', 'frontmatter'],
    ['flowchart TD\nA --> B\nstyle A fill:#f00', 'statement style'],
    ['flowchart TD\nA:::c --> B\nclassDef c fill:#f00', 'statement classdef'],
    ['flowchart TD\nA --> B\nlinkStyle 0 stroke:#f00', 'statement linkstyle'],
    ['flowchart TD\nA --> B\nclass A c', 'statement class'],
    ['flowchart TD\nA --> B\nclick A call f()', 'statement click'],
    ['flowchart TD\nA[see http:x] --> B', 'token http:'],
    ['flowchart TD\nA[a//b] --> B', 'token //'],
    ['flowchart TD\nA[a\\b] --> B', 'token \\'],
    ['flowchart TD\nA[@import x] --> B', 'token @import'],
    ['flowchart TD\nA[data:x] --> B', 'token data:'],
  ] as const) {
    const f = fake({
      run: async () => {
        throw new Error('mmdc must not run')
      },
    })
    const s = createPictures()
    f.$.process.run = async (argv: string[]) => {
      assert.fail(`ran ${argv.join(' ')} for ${JSON.stringify(body)}`)
    }
    assert.equal(pictureFor(f.$, s, body, 'default-dark', 80, f.log), undefined)
    pictureFor(f.$, s, body, 'default-dark', 80, f.log)
    await s.idle()
    assert.deepEqual(f.logs, [`image: unsafe source (${reason})`], body)
  }
})

// Layer A through the hook: an SVG pass whose output refers outside itself, or holds anything that loads or runs, means
// no PNG pass and no picture; one with only url(#arrowhead) markers makes the picture.
test('A5.errors: an SVG with a forbidden pattern gets no PNG pass and no picture; the temp dir goes', async () => {
  for (const [svg, reason] of [
    ['<svg><rect fill="url(/asset.svg#paint)"/></svg>', 'url'],
    ['<svg><a xlink:href="/asset.svg">x</a></svg>', 'element a'],
    ['<svg><image href="#x"/></svg>', 'element image'],
    ["<svg><style>.a{background:url('file:///tmp/x.svg')}</style></svg>", 'url'],
    ['<svg><foreignObject><img src="x.png"/></foreignObject></svg>', 'element img'],
    ['<svg><style>@import "a.css";</style></svg>', 'css @import'],
    ['<svg><script>1</script></svg>', 'element script'],
    ['<svg><!-- x --></svg>', 'markup'],
  ] as const) {
    const f = fake({ svg })
    const s = createPictures()
    pictureFor(f.$, s, fc('A'), 'default-dark', 80, f.log)
    await s.idle()
    assert.equal(renders(f), 0, svg)
    assert.equal(pictureFor(f.$, s, fc('A'), 'default-dark', 80, f.log), undefined)
    assert.deepEqual(f.logs, [`image: unsafe svg (${reason})`], svg)
    assert.equal(f.runs.filter((r) => isRemove(r.argv)).length, 1)
    assert.equal(redraws(f), 0)
  }

  const f = fake({ svg: SVG })
  const s = createPictures()
  pictureFor(f.$, s, fc('A'), 'default-dark', 80, f.log)
  await s.idle()
  assert.equal(renders(f), 1)
  assert.ok(pictureFor(f.$, s, fc('A'), 'default-dark', 80, f.log))
})

test('A6.hook-tests: requests for one diagram, theme and width share one render; another theme or width is its own', async () => {
  const f = fake()
  const s = createPictures()
  const body = fc('A')
  for (let i = 0; i < 3; i++) {
    pictureFor(f.$, s, body, 'default-dark', 80, f.log)
  }

  pictureFor(f.$, s, body, 'default-light', 80, f.log)
  pictureFor(f.$, s, body, 'default-dark', 60, f.log)
  await s.idle()
  assert.equal(renders(f), 3)
  assert.equal(probes(f), 1)
})

test('A6.hook-tests: renders run one at a time, and a batch redraws once', async () => {
  let live = 0
  let most = 0
  const f = fake({
    run: async () => {
      live++
      most = Math.max(most, live)
      await new Promise((r) => setTimeout(r, 5))
      live--
      return { exitCode: 0, stdout: '', stderr: '' }
    },
  })
  const s = createPictures()
  for (const b of ['A', 'B', 'C']) {
    pictureFor(f.$, s, fc(b), 'default-dark', 80, f.log)
  }

  await s.idle()
  assert.equal(most, 1)
  assert.equal(renders(f), 3)
  assert.equal(redraws(f), 1)
})

// mmdc draws on a page 12 CSS px a column wide, and the picture shows at 8: one well inside the page was drawn at its
// own size and is scaled by at least 2/3; one over 90% of it (mmdc's margins take the rest) was shrunk by mmdc to fit,
// perhaps past reading.
test('A6.hook-tests: a picture inside 90% of the page is scaled into the columns', async () => {
  const f = fake({ w: 1700, h: 100 })
  const s = createPictures()
  pictureFor(f.$, s, fc('A'), 'default-dark', 80, f.log)
  await s.idle()
  assert.deepEqual(pictureFor(f.$, s, fc('A'), 'default-dark', 80, f.log), {
    png: png(1700, 100),
    columns: 80,
    rows: 2,
  })
  assert.deepEqual(f.logs, [])
})

// Each failure logs a reason, removes the temp dir, redraws nothing, and is not tried again.
for (const [name, o, reason] of [
  [
    'mmdc vanishing after its version',
    {
      run: async () => {
        throw new Error('spawn mmdc ENOENT')
      },
    },
    /^image: .*ENOENT/,
  ],
  [
    'mmdc timing out',
    {
      run: async () => {
        throw new Error('timed out after 30000 ms')
      },
    },
    /^image: .*timed out/,
  ],
  [
    'mmdc failing',
    { run: async () => ({ exitCode: 1, stdout: '', stderr: 'Parse error on line 2' }) },
    /^image: mmdc exited 1: Parse error on line 2$/,
  ],
  ['a PNG over 2 MiB', { size: 2 * 1024 * 1024 + 1 }, /^image: png over 2 MiB$/],
  ['an SVG over 4 MiB', { svgSize: 4 * 1024 * 1024 + 1 }, /^image: svg over 4 MiB$/],
  ['a picture over 255 rows', { w: 160, h: 9000 }, /^image: over 255 rows$/],
  ['a picture as wide as the page (mmdc shrank it to fit)', { w: 1920, h: 100 }, /^image: too wide to read$/],
] as [string, object, RegExp][]) {
  test(`A5.errors: ${name} keeps the text drawing, logs why, and cleans up`, async () => {
    const f = fake(o)
    const s = createPictures()
    pictureFor(f.$, s, fc('A'), 'default-dark', 80, f.log)
    await s.idle()
    assert.equal(f.logs.length, 1)
    assert.match(f.logs[0]!, reason)
    assert.deepEqual(
      f.runs.filter((r) => isRemove(r.argv)).map((r) => r.argv),
      [['node', '-e', REMOVE_TEMP, D]],
    )
    assert.equal(redraws(f), 0)
    assert.equal(pictureFor(f.$, s, fc('A'), 'default-dark', 80, f.log), undefined)
    await s.idle()
    assert.equal(f.runs.filter((r) => isMake(r.argv)).length, 1)
  })
}

test('A5.errors: no temp dir, or a path the temp run should not have made, runs no mmdc and removes nothing', async () => {
  for (const made of [
    { exitCode: 1, stdout: MADE, stderr: 'no' },
    { exitCode: 0, stdout: '/\n', stderr: '' },
    { exitCode: 0, stdout: JSON.stringify({ tmp: '/tmp', dir: '/etc/mermaid-tty.Ab12Cd' }), stderr: '' },
  ]) {
    const f = fake()
    const s = createPictures()
    const run = f.$.process.run
    f.$.process.run = async (argv: string[], init: any) =>
      isMake(argv) ? (f.runs.push({ argv, init }), made) : run(argv, init)
    pictureFor(f.$, s, fc('A'), 'default-dark', 80, f.log)
    await s.idle()
    assert.deepEqual(
      f.runs.map((r) => label(r.argv)),
      ['mmdc --version', 'make temp'],
      JSON.stringify(made),
    )
    assert.deepEqual(f.logs, ['image: no temp dir'])
  }
})

test('A5.errors: a failing log or redraw never escapes the background render', async () => {
  const f = fake()
  const s = createPictures()
  f.$.ui.invalidate = () => {
    throw new Error('gone')
  }
  pictureFor(f.$, s, fc('A'), 'default-dark', 80, () => {
    throw new Error('log down')
  })
  await s.idle()
  assert.ok(pictureFor(f.$, s, fc('A'), 'default-dark', 80, f.log))
  const g = fake({
    run: async () => {
      throw new Error('x')
    },
  })
  const t = createPictures()
  pictureFor(g.$, t, fc('A'), 'default-dark', 80, () => {
    throw new Error('log down')
  })
  await t.idle()
  assert.equal(argvOf(g, 'mmdc').length, 1)
})

// A key is rendered at most once per store: a picture the cache drops is not rendered again, so a reply with more
// diagrams than the cache holds cannot evict, render and redraw for ever.
test('A8.cache: the picture cache is bounded by entries; a dropped picture is not rendered again', async () => {
  const f = fake()
  const s = createPictures({ entries: 2 })
  for (const b of ['A', 'B', 'C']) {
    pictureFor(f.$, s, fc(b), 'default-dark', 80, f.log)
    await s.idle()
  }

  assert.ok(pictureFor(f.$, s, fc('C'), 'default-dark', 80, f.log))
  assert.equal(pictureFor(f.$, s, fc('A'), 'default-dark', 80, f.log), undefined)
  await s.idle()
  assert.equal(renders(f), 3)
})

test('A8.cache: the picture cache is bounded by bytes of PNG', async () => {
  const f = fake()
  const s = createPictures({ bytes: 100 }) // each PNG here is 44 base64 characters
  for (const b of ['A', 'B', 'C']) {
    pictureFor(f.$, s, fc(b), 'default-dark', 80, f.log)
    await s.idle()
  }

  assert.ok(pictureFor(f.$, s, fc('B'), 'default-dark', 80, f.log))
  assert.ok(pictureFor(f.$, s, fc('C'), 'default-dark', 80, f.log))
  assert.equal(pictureFor(f.$, s, fc('A'), 'default-dark', 80, f.log), undefined)
  await s.idle()
  assert.equal(renders(f), 3)
})

test('A8.cache: at most 8 renders wait; a request past that is dropped, and asked again on a later draw', async () => {
  const f = fake()
  const s = createPictures()
  for (let i = 0; i < 10; i++) {
    pictureFor(f.$, s, fc(`D${i}`), 'default-dark', 80, f.log)
  }

  await s.idle()
  assert.equal(renders(f), 8)
  pictureFor(f.$, s, fc('D9'), 'default-dark', 80, f.log)
  await s.idle()
  assert.equal(renders(f), 9)
})

test('A8.cache: the keys tried are bounded; past that, a new diagram stays text', async () => {
  const f = fake()
  const s = createPictures({ tried: 2 })
  for (const b of ['A', 'B', 'C']) {
    pictureFor(f.$, s, fc(b), 'default-dark', 80, f.log)
    await s.idle()
  }

  assert.equal(renders(f), 2)
  assert.equal(pictureFor(f.$, s, fc('C'), 'default-dark', 80, f.log), undefined)
})

// The review's repro: 17 diagrams in one reply, a cache of 16, and every redraw asking for all 17 again. Each renders
// once, redraws come one per batch (8 + 8 + 1), and the loop ends.
test('A8.cache: 17 diagrams over a 16-picture cache render 17 times and stop', async () => {
  const f = fake()
  const s = createPictures({ entries: 16 })
  const bodies = Array.from({ length: 17 }, (_, i) => fc(`N${i}`))
  let shown = 0
  const draw = () => {
    shown = bodies.filter((b) => pictureFor(f.$, s, b, 'default-dark', 80, f.log)).length
  }
  f.$.ui.invalidate = () => {
    f.asked.push('invalidate')
    if (redraws(f) < 50) {
      draw()
    }
  }
  draw()
  await s.idle()
  assert.equal(renders(f), 17)
  assert.equal(redraws(f), 3)
  assert.equal(shown, 16)
})

// MAKE_TEMP's output is trusted only as a mermaid-tty.XXXXXX dir directly inside the temp dir it names; on Windows both
// arrive with / separators.
test('A5.errors: only a fresh mermaid-tty dir directly in the named temp dir is accepted', () => {
  const made = (tmp: unknown, dir: unknown) => madeTempDir(JSON.stringify({ tmp, dir }))
  assert.equal(made('/tmp', D), D)
  assert.equal(made('/tmp/', D), D)
  assert.equal(
    made('C:/Users/me/AppData/Local/Temp', 'C:/Users/me/AppData/Local/Temp/mermaid-tty.x9Y8z7'),
    'C:/Users/me/AppData/Local/Temp/mermaid-tty.x9Y8z7',
  )
  assert.equal(made('/tmp', '/etc/mermaid-tty.Ab12Cd'), null)
  assert.equal(made('/tmp', '/tmp/a/mermaid-tty.Ab12Cd'), null)
  assert.equal(made('/tmp', '/tmp/mermaid-tty.'), null)
  assert.equal(made('/tmp', '/tmp/mermaid-tty.Ab12C/'), null)
  assert.equal(made('/tmp', '/tmp/mermaid-tty.Ab12Cd/..'), null)
  assert.equal(made('', '/mermaid-tty.Ab12Cd'), null)
  assert.equal(made(3, D), null)
  assert.equal(madeTempDir('/tmp/mermaid-tty.Ab12Cd\n'), null)
  assert.equal(madeTempDir(''), null)
})

// A curated look paints its palette's background behind both runs, and names a theme mmdc 11 accepts; the config's own
// theme, base, is the one Mermaid draws with.
test('a curated look renders on its background, with its own config', async () => {
  const s = createPictures()
  const f = fake({ run: async () => ({ exitCode: 0, stdout: '', stderr: '' }) })
  pictureFor(f.$, s, fc('A'), 'nord', 80, f.log)
  await s.idle()
  const runs = argvOf(f, 'mmdc')
  for (const r of runs) {
    const argv = r!.argv
    assert.equal(argv[argv.indexOf('-b') + 1], '#2E3440')
    assert.equal(argv[argv.indexOf('-t') + 1], 'dark')
  }

  assert.deepEqual(JSON.parse(f.writes.find(([p]) => p.endsWith('config.json'))![1]), pictureTheme('nord').config)
})

// SWEEP_TEMP, run as the hook runs it, against a stand-in temp dir: TMPDIR on macOS and Linux, TMP and TEMP on Windows.
function sweep(tmp: string, args: string[]) {
  const env = { ...process.env, TMPDIR: tmp, TMP: tmp, TEMP: tmp }
  return spawnSync(process.execPath, ['-e', SWEEP_TEMP, ...args], { env, encoding: 'utf8' })
}

test('SWEEP_TEMP removes stale picture dirs and the ones it names, and nothing else', (t) => {
  const tmp = mkdtempSync(join(tmpdir(), 'sweep-'))
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const dir = (name: string, ageS: number) => {
    const p = join(tmp, name)
    mkdirSync(p)
    writeFileSync(join(p, 'out.png'), 'x')
    const at = new Date(Date.now() - ageS * 1000)
    utimesSync(p, at, at)
    return p
  }

  dir('mermaid-tty.Stale1', 3600)
  dir('mermaid-tty.Fresh1', 5)
  const named = dir('mermaid-tty.Named1', 5)
  dir('other.Stale2', 3600)
  dir('mermaid-tty-not.Stale3', 3600)
  const r = sweep(tmp, ['600', named.split(sep).join('/'), join(tmpdir(), 'mermaid-tty.Elsewh')])
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(readdirSync(tmp).sort(), ['mermaid-tty-not.Stale3', 'mermaid-tty.Fresh1', 'other.Stale2'])
})

// The session ends: every dir a render of this store made and has not removed yet goes, with any stale one; at the
// start, only the stale ones a past session left.
test('sweepTemp names the dirs a render still holds, and asks for the stale ones', async () => {
  const s = createPictures()
  s.dirs.add('/tmp/mermaid-tty.Live01')
  const f = fake()
  await sweepTemp(f.$, s)
  const run = f.runs.find((r) => r.argv[2] === SWEEP_TEMP)!
  assert.deepEqual(run.argv.slice(3), [String(STALE_S), '/tmp/mermaid-tty.Live01'])
  const g = fake()
  await sweepTemp(g.$)
  assert.deepEqual(g.runs.find((r) => r.argv[2] === SWEEP_TEMP)!.argv.slice(3), [String(STALE_S)])
})

test('a render holds its temp dir in the store while it runs and lets it go once removed', async () => {
  const s = createPictures()
  let held: string[] = []
  const f = fake({
    run: async (argv: string[]) => {
      held = [...s.dirs]
      return { exitCode: 1, stdout: '', stderr: 'boom' }
    },
  })
  pictureFor(f.$, s, fc('A'), 'default-dark', 80, f.log)
  await s.idle()
  assert.deepEqual(held, [D])
  assert.deepEqual([...s.dirs], [])
})

test('a failing sweep is quiet: it never throws', async () => {
  const f = fake()
  f.$.process.run = async () => {
    throw new Error('no node')
  }
  await sweepTemp(f.$, createPictures())
})
