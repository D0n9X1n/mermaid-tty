// Pictures of Mermaid's own rendering, for a terminal that shows pixels: mermaid-cli (mmdc, if it is on PATH) draws a
// fence to a PNG in the background, and the next draw of the reply uses it. A draw never waits on mmdc: a miss answers
// undefined (the text drawing stands) and queues one render, at most one running at a time. Safety, in layers: a source
// goes to mmdc only when hooks/safe.ts (layer B) finds no way in it to style, configure, fetch or load anything and
// core parses it; Chromium under mmdc runs with no network, loopback included (puppeteerConfig); mmdc's Mermaid config
// holds only securityLevel strict and the look's theme and #rrggbb colors; and the authority, layer A (hooks/svg.ts),
// checks the SVG mmdc draws for the source before a second run makes the PNG. Termination: each source, look and width
// is rendered at most once per store, so a picture the bounded cache drops stays text rather than rendering again, and
// a batch of renders redraws once. No JSX and no Node, so node --test can import it and the engine can load it.
import { parseFail } from '../core/render.ts'
import type { Images } from './mode.ts'
import { mmdcTheme, pictureTheme, type Look } from './picture-theme.ts'
import { showsPixels } from './pixels.ts'
import { unsafeReason } from './safe.ts'
import { svgUnsafe } from './svg.ts'

export type Picture = { png: string; columns: number; rows: number }
export type { Look }
export type Limits = { entries: number; bytes: number; tried: number }
export type Pictures = {
  limits: Limits
  cache: Map<string, Picture>
  bytes: number
  tried: Set<string>
  inflight: Set<string>
  tail: Promise<void>
  fresh: boolean
  pixels?: Promise<boolean>
  mmdc?: Promise<number | string>
  noMmdc?: boolean
  idle(): Promise<void>
}

const QUEUE = 8 // renders waiting or running; a request past that is asked again later
const CSS = 8
const SCALE = 2
const PX = CSS * SCALE // CSS px per column, drawn at 2x: 16 PNG px a column
// mmdc's page is 12 CSS px a column, wider than the 8 shown, and Mermaid shrinks a diagram wider than its page to fit:
// so a picture inside 90% of the page (its margins take the rest) is drawn at its own size and scaled down by at most
// 2/3; a wider one was shrunk, perhaps past reading, and the text drawing stands.
const PAGE = 12
const FULL = 0.9
const MAX_PNG = 2 * 1024 * 1024 // what an Image's { png } takes, decoded
const MAX_SVG = 4 * 1024 * 1024 // what $.fs.read reads
const MAX_SOURCE = 50000 // Mermaid's maxTextSize: past it, mmdc draws an error picture and exits 0
const MMDC_MS = 30000
const SHORT_MS = 5000
const PROBE_MS = 10000

// Chromium's launch flags under mmdc: every request goes to a proxy at the discard port, loopback included (Chromium
// bypasses the proxy for loopback unless told <-loopback>), no host name resolves, and nothing is prefetched or sent in
// the background; WebRTC sends no UDP outside the proxy. The page is 12 CSS px a column: mmdc 12 sizes its page by
// defaultViewport, mmdc 11 by -w.
export const puppeteerConfig = (columns: number) => ({
  args: [
    '--proxy-server=127.0.0.1:9',
    '--proxy-bypass-list=<-loopback>',
    '--host-resolver-rules=MAP * ~NOTFOUND',
    '--dns-prefetch-disable',
    '--disable-background-networking',
    '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
  ],
  defaultViewport: { width: columns * PAGE, height: 600 },
})

// The Mermaid config mmdc gets with -c: securityLevel strict, the look's theme and its colors, and the journey colors
// Mermaid takes from diagram config (hooks/picture-theme.ts); nothing else.
export const mermaidConfig = (look: Look) => pictureTheme(look).config

// The arguments that differ by mmdc's major version: before 12, -w sizes the page; from 12, an SVG gets
// --no-font-embed, and a PNG nothing more.
function versionArgs(o: { format: 'svg' | 'png'; columns: number; major: number }): string[] {
  if (o.major < 12) {
    return ['-w', String(o.columns * PAGE)]
  }

  return o.format === 'svg' ? ['--no-font-embed'] : []
}

// mmdc's argv for one run: an SVG or the PNG of the source on stdin, on the same page, config and look. mmdc before 12
// takes -w; 12 removed it and sizes its page by the puppeteer config's defaultViewport, and embeds fonts in an SVG as
// data: URLs unless told --no-font-embed.
export function mmdcArgs(o: {
  out: string
  format: 'svg' | 'png'
  look: Look
  config: string
  puppeteer: string
  columns: number
  major: number
}): string[] {
  return [
    'mmdc',
    '-i',
    '-',
    '-o',
    o.out,
    '-e',
    o.format,
    '-b',
    pictureTheme(o.look).background,
    '-t',
    mmdcTheme(o.look),
    '-c',
    o.config,
    '-p',
    o.puppeteer,
    ...(o.format === 'png' ? ['-s', String(SCALE)] : []),
    '-q',
    ...versionArgs(o),
  ]
}

// A store of pictures: at most `entries` kept and `bytes` of base64 PNG, and at most `tried` keys ever rendered. idle()
// resolves once no render is queued.
export function createPictures(limits: Partial<Limits> = {}): Pictures {
  const s: Pictures = {
    limits: { entries: 256, bytes: 32 * 1024 * 1024, tried: 4096, ...limits },
    cache: new Map(),
    bytes: 0,
    tried: new Set(),
    inflight: new Set(),
    tail: Promise.resolve(),
    fresh: false,
    idle: async () => {
      let t: Promise<void>
      do {
        t = s.tail
        await t
      } while (t !== s.tail)
    },
  }
  return s
}

// The look a picture is drawn in, or null for none: images off or mono means none; under images auto the terminal must
// show pixels (told once per store), while images on takes that on the person's word. A curated palette paints its own
// background, so it is its own look; default draws on a transparent background, so Claude Code's theme must say dark or
// light, since a guess could draw dark lines on a dark terminal.
export async function pictureLook($: any, s: Pictures, theme: string, images: Images = 'auto'): Promise<Look | null> {
  if (images === 'off' || theme === 'mono') {
    return null
  }

  if (images === 'auto') {
    s.pixels ??= showsPixels($)
    if (!(await s.pixels)) {
      return null
    }
  }

  if (theme === 'nord' || theme === 'dracula' || theme === 'gruvbox' || theme === 'solarized') {
    return theme
  }

  try {
    const v = (await $.config.list()).find((r: any) => r.key === 'theme')?.value
    if (typeof v !== 'string') {
      return null
    }

    if (v.startsWith('dark')) {
      return 'default-dark'
    }

    return v.startsWith('light') ? 'default-light' : null
  } catch {
    return null
  }
}

// The cached picture of body in look at columns, or undefined. On a miss, a key not yet tried is queued for one render
// unless the queue is full (then a later draw asks again): only a source within Mermaid's size limit that the safety
// gate passes (`image: unsafe source (<rule>)` is logged once when it does not) and core parses, while mmdc answers. A
// failure logs `image: <why>`; a finished batch redraws ui.render once.
export function pictureFor(
  $: any,
  s: Pictures,
  body: string,
  look: Look,
  columns: number,
  log: (reason: string) => void,
): Picture | undefined {
  const key = JSON.stringify([body, look, columns])
  const hit = s.cache.get(key)
  if (hit) {
    s.cache.delete(key)
    s.cache.set(key, hit)
    return hit
  }

  const id = hash(key)
  if (
    s.noMmdc ||
    s.tried.has(id) ||
    s.inflight.has(key) ||
    s.inflight.size >= QUEUE ||
    s.tried.size >= s.limits.tried
  ) {
    return undefined
  }

  s.tried.add(id)
  if (body.length > MAX_SOURCE) {
    say(log, `source over ${MAX_SOURCE} characters`)
    return undefined
  }

  const unsafe = unsafeReason(body)
  if (unsafe) {
    say(log, `unsafe source (${unsafe})`)
    return undefined
  }

  if (parseFail(body)) {
    return undefined
  } // the text renderer logs why it falls back

  s.inflight.add(key)
  s.tail = s.tail.then(() => job($, s, key, body, look, columns, log)).catch(() => {})
  return undefined
}

// One queued render: the version probe first (once per store), then the picture or why not; the last of a batch
// redraws.
async function job(
  $: any,
  s: Pictures,
  key: string,
  body: string,
  look: Look,
  columns: number,
  log: (reason: string) => void,
) {
  s.mmdc ??= mmdcMajor($)
  const major = await s.mmdc
  let r: Picture | string | null
  if (typeof major === 'string') {
    r = s.noMmdc ? null : `no usable mmdc (${major})`
    s.noMmdc = true
  } else {
    r = await draw($, body, look, columns, major).catch((e: unknown) =>
      oneLine(e instanceof Error ? e.message : String(e)),
    )
  }

  s.inflight.delete(key)
  if (typeof r === 'string') {
    say(log, r)
  } else if (r) {
    keep(s, key, r)
    s.fresh = true
  }

  if (s.inflight.size === 0 && s.fresh) {
    s.fresh = false
    try {
      $.ui.invalidate('ui.render')
    } catch {}
  }
}

// mmdc's major version from `mmdc --version`, or why there is no usable mmdc.
async function mmdcMajor($: any): Promise<number | string> {
  try {
    const r = await $.process.run(['mmdc', '--version'], { timeoutMs: PROBE_MS })
    const m = /^(\d+)\.\d+/.exec(r.stdout.trim())
    return r.exitCode === 0 && m ? Number(m[1]) : `version: ${oneLine(r.stdout) || `exit ${r.exitCode}`}`
  } catch (e) {
    return oneLine(e instanceof Error ? e.message : String(e))
  }
}

// Caches a picture, most recent last, dropping the least recent past the entry or byte limit.
function keep(s: Pictures, key: string, p: Picture) {
  s.cache.set(key, p)
  s.bytes += p.png.length
  for (const [k, v] of s.cache) {
    if (s.cache.size <= s.limits.entries && s.bytes <= s.limits.bytes) {
      break
    }

    s.cache.delete(k)
    s.bytes -= v.png.length
  }
}

// The temp dir is made and removed by Node, which mmdc itself runs on, so it works where there is no mktemp or rm
// (Windows). MAKE_TEMP prints the OS temp dir, resolved so it is spelled as the dir made in it is, and a fresh
// mermaid-tty.XXXXXX dir in it as JSON, with / separators; REMOVE_TEMP removes the dir named by its argument, and only
// a mermaid-tty.* one.
export const MAKE_TEMP =
  "const f=require('fs'),o=require('os'),p=require('path'),u=(s)=>s.split(p.sep).join('/');" +
  "const t=p.resolve(o.tmpdir());process.stdout.write(JSON.stringify({tmp:u(t),dir:u(f.mkdtempSync(p.join(t,'mermaid-tty.')))}))"
export const REMOVE_TEMP =
  "const f=require('fs'),p=require('path'),d=process.argv[1];" +
  "if(p.basename(d).startsWith('mermaid-tty.'))f.rmSync(d,{recursive:true,force:true})"

// The dir MAKE_TEMP printed, or null unless it is a mermaid-tty.XXXXXX dir directly inside the temp dir it named.
export function madeTempDir(stdout: string): string | null {
  try {
    const { tmp, dir } = JSON.parse(stdout)
    if (typeof tmp !== 'string' || typeof dir !== 'string' || tmp === '') {
      return null
    }

    const base = tmp.replace(/\/+$/, '') + '/mermaid-tty.'
    return dir.startsWith(base) && /^[A-Za-z0-9]{6}$/.test(dir.slice(base.length)) ? dir : null
  } catch {
    return null
  }
}

// One render in a fresh temp dir, removed after: the picture, or why there is none. Two runs of mmdc on the same
// source, config and page (mmdcArgs): an SVG, checked by svgUnsafe (layer A), then only if it is clean the PNG.
async function draw($: any, body: string, look: Look, columns: number, major: number): Promise<Picture | string> {
  const made = await $.process.run(['node', '-e', MAKE_TEMP], { timeoutMs: SHORT_MS })
  const dir = made.exitCode === 0 ? madeTempDir(made.stdout) : null
  if (!dir) {
    return 'no temp dir'
  }

  try {
    const config = `${dir}/config.json`
    const puppeteer = `${dir}/puppeteer.json`
    const svg = `${dir}/out.svg`
    const out = `${dir}/out.png`
    await $.fs.write(config, JSON.stringify(mermaidConfig(look)))
    await $.fs.write(puppeteer, JSON.stringify(puppeteerConfig(columns)))
    const mmdc = (o: string, format: 'svg' | 'png') =>
      $.process.run(mmdcArgs({ out: o, format, look, config, puppeteer, columns, major }), {
        stdin: body,
        timeoutMs: MMDC_MS,
      })
    const v = await mmdc(svg, 'svg')
    if (v.exitCode !== 0) {
      return `mmdc exited ${v.exitCode}: ${oneLine(v.stderr)}`
    }

    if ((await $.fs.stat(svg)).size > MAX_SVG) {
      return 'svg over 4 MiB'
    }

    const text = await $.fs.read(svg)
    const unsafe = typeof text === 'string' ? svgUnsafe(text) : 'unreadable'
    if (unsafe) {
      return `unsafe svg (${unsafe})`
    }

    const r = await mmdc(out, 'png')
    if (r.exitCode !== 0) {
      return `mmdc exited ${r.exitCode}: ${oneLine(r.stderr)}`
    }

    if ((await $.fs.stat(out)).size > MAX_PNG) {
      return 'png over 2 MiB'
    }

    const { base64 } = await $.fs.read(out, { as: 'bytes' })
    const size = pngSize(base64)
    if (!size) {
      return 'not a png'
    }

    if (size.width > columns * PAGE * SCALE * FULL) {
      return 'too wide to read'
    }

    const box = fit(size.width, size.height, columns)
    return box ? { png: base64, ...box } : 'over 255 rows'
  } finally {
    try {
      await $.process.run(['node', '-e', REMOVE_TEMP, dir], { timeoutMs: SHORT_MS })
    } catch {}
  }
}

// The cells a w x h PNG takes in at most `columns`: its natural width (16 px a column) or less, 1 to 255 columns, and
// rows = round(columns * h / w / 2), cells being about 1:2. Null past 255 rows.
export function fit(w: number, h: number, columns: number): { columns: number; rows: number } | null {
  const c = Math.max(1, Math.min(255, columns, Math.round(w / PX)))
  const rows = Math.max(1, Math.round((c * h) / w / 2))
  return rows > 255 ? null : { columns: c, rows }
}

// A base64 PNG's width and height, read from its IHDR chunk; null when it is not a PNG.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]
export function pngSize(base64: string): { width: number; height: number } | null {
  const b: number[] = []
  let acc = 0
  let bits = 0
  for (const ch of base64.slice(0, 32)) {
    const v = B64.indexOf(ch)
    if (v < 0) {
      return null
    }

    acc = (acc << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      b.push((acc >> bits) & 255)
      acc &= (1 << bits) - 1
    }
  }

  if (b.length < 24 || SIGNATURE.some((x, i) => b[i] !== x) || String.fromCharCode(...b.slice(12, 16)) !== 'IHDR') {
    return null
  }

  const u32 = (i: number) => b[i]! * 16777216 + b[i + 1]! * 65536 + b[i + 2]! * 256 + b[i + 3]!
  const width = u32(16)
  const height = u32(20)
  return width > 0 && height > 0 ? { width, height } : null
}

// A short id for a key (cyrb53), so the tried set holds no sources. A collision only leaves a diagram as text.
function hash(s: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36)
}

// A best-effort debug log line: a failing log never stops a drawing.
const say = (log: (reason: string) => void, reason: string) => {
  try {
    log(`image: ${reason}`)
  } catch {}
}

// The first non-blank line of s, at most 200 characters.
const oneLine = (s: string) => (s.split(/\r\n|\r|\n/).find((l) => l.trim()) ?? '').trim().slice(0, 200)
