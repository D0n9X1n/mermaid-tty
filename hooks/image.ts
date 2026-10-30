// Pictures of Mermaid's own rendering, for a terminal that shows pixels: mermaid-cli (mmdc, if it is on PATH) draws a
// fence to a PNG in the background, and the next draw of the reply uses it. A draw never waits on mmdc: a miss answers
// undefined (the text drawing stands) and queues one render, at most one running at a time.
// Safety, in layers: a source goes to mmdc only when hooks/safe.ts (layer B) finds no way in it to style, configure,
// fetch or load anything and core parses it; Chromium under mmdc runs with no network, loopback included
// (puppeteerConfig); mmdc's Mermaid config holds only securityLevel strict and the theme; and the authority, layer A
// (hooks/svg.ts), checks the SVG mmdc draws for the source before a second run makes the PNG.
// Termination: each source, look and width is rendered at most once per store, so a picture the bounded cache drops
// stays text rather than rendering again, and a batch of renders redraws once. No JSX and no Node, so node --test can import it and the engine can load it.
import { parseFail } from '../core/render.ts'
import { showsPixels } from './pixels.ts'
import { unsafeReason } from './safe.ts'
import { svgUnsafe } from './svg.ts'

export type Picture = { png: string; columns: number; rows: number }
export type Look = 'dark' | 'default'                // Mermaid's theme: dark, or its light default
export type Limits = { entries: number; bytes: number; tried: number }
export type Pictures = {
  limits: Limits; cache: Map<string, Picture>; bytes: number; tried: Set<string>; inflight: Set<string>
  tail: Promise<void>; fresh: boolean; pixels?: Promise<boolean>; mmdc?: Promise<number | string>; noMmdc?: boolean
  idle(): Promise<void>
}

const QUEUE = 8                                      // renders waiting or running; a request past that is asked again later
const CSS = 8, SCALE = 2, PX = CSS * SCALE           // CSS px per column, drawn at 2x: 16 PNG px a column
// mmdc's page is 12 CSS px a column, wider than the 8 shown, and Mermaid shrinks a diagram wider than its page to fit:
// so a picture inside 90% of the page (its margins take the rest) is drawn at its own size and scaled down by at most
// 2/3; a wider one was shrunk, perhaps past reading, and the text drawing stands.
const PAGE = 12, FULL = 0.9
const MAX_PNG = 2 * 1024 * 1024                      // what an Image's { png } takes, decoded
const MAX_SVG = 4 * 1024 * 1024                      // what $.fs.read reads
const MAX_SOURCE = 50000                             // Mermaid's maxTextSize: past it, mmdc draws an error picture and exits 0
const MMDC_MS = 30000, SHORT_MS = 5000, PROBE_MS = 10000

// Chromium's launch flags under mmdc: every request goes to a proxy at the discard port, loopback included (Chromium
// bypasses the proxy for loopback unless told <-loopback>), no host name resolves, and nothing is prefetched or sent
// in the background; WebRTC sends no UDP outside the proxy. The page is 12 CSS px a column: mmdc 12 sizes its page by
// defaultViewport, mmdc 11 by -w.
export const puppeteerConfig = (columns: number) => ({
  args: ['--proxy-server=127.0.0.1:9', '--proxy-bypass-list=<-loopback>', '--host-resolver-rules=MAP * ~NOTFOUND',
    '--dns-prefetch-disable', '--disable-background-networking', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'],
  defaultViewport: { width: columns * PAGE, height: 600 },
})

// A store of pictures: at most `entries` kept and `bytes` of base64 PNG, and at most `tried` keys ever rendered.
// idle() resolves once no render is queued.
export function createPictures(limits: Partial<Limits> = {}): Pictures {
  const s: Pictures = {
    limits: { entries: 256, bytes: 32 * 1024 * 1024, tried: 4096, ...limits },
    cache: new Map(), bytes: 0, tried: new Set(), inflight: new Set(), tail: Promise.resolve(), fresh: false,
    idle: async () => { let t: Promise<void>; do { t = s.tail; await t } while (t !== s.tail) },
  }
  return s
}

// The look a picture is drawn in, or null for none: mono means no colour; the terminal must show pixels (told once per
// store); and Claude Code's theme must say dark or light, since the background is transparent and a guess could draw
// dark lines on a dark terminal.
export async function pictureLook($: any, s: Pictures, theme: string): Promise<Look | null> {
  if (theme === 'mono') return null
  s.pixels ??= showsPixels($)
  if (!await s.pixels) return null
  try {
    const v = (await $.config.list()).find((r: any) => r.key === 'theme')?.value
    return typeof v !== 'string' ? null : v.startsWith('dark') ? 'dark' : v.startsWith('light') ? 'default' : null
  } catch { return null }
}

// The cached picture of body in look at columns, or undefined. On a miss, a key not yet tried is queued for one render
// unless the queue is full (then a later draw asks again): only a source within Mermaid's size limit that the safety
// gate passes (`image: unsafe source (<rule>)` is logged once when it does not) and core parses, while mmdc answers. A failure logs `image: <why>`; a finished batch redraws ui.render once.
export function pictureFor($: any, s: Pictures, body: string, look: Look, columns: number, log: (reason: string) => void): Picture | undefined {
  const key = JSON.stringify([body, look, columns]), hit = s.cache.get(key)
  if (hit) { s.cache.delete(key); s.cache.set(key, hit); return hit }
  const id = hash(key)
  if (s.noMmdc || s.tried.has(id) || s.inflight.has(key) || s.inflight.size >= QUEUE || s.tried.size >= s.limits.tried) return undefined
  s.tried.add(id)
  if (body.length > MAX_SOURCE) { say(log, `source over ${MAX_SOURCE} characters`); return undefined }
  const unsafe = unsafeReason(body)
  if (unsafe) { say(log, `unsafe source (${unsafe})`); return undefined }
  if (parseFail(body)) return undefined              // the text renderer logs why it falls back
  s.inflight.add(key)
  s.tail = s.tail.then(() => job($, s, key, body, look, columns, log)).catch(() => {})
  return undefined
}

// One queued render: the version probe first (once per store), then the picture or why not; the last of a batch redraws.
async function job($: any, s: Pictures, key: string, body: string, look: Look, columns: number, log: (reason: string) => void) {
  s.mmdc ??= mmdcMajor($)
  const major = await s.mmdc
  let r: Picture | string | null
  if (typeof major === 'string') { r = s.noMmdc ? null : `no usable mmdc (${major})`; s.noMmdc = true }
  else r = await draw($, body, look, columns, major).catch((e: unknown) => oneLine(e instanceof Error ? e.message : String(e)))
  s.inflight.delete(key)
  if (typeof r === 'string') say(log, r)
  else if (r) { keep(s, key, r); s.fresh = true }
  if (s.inflight.size === 0 && s.fresh) { s.fresh = false; try { $.ui.invalidate('ui.render') } catch {} }
}

// mmdc's major version from `mmdc --version`, or why there is no usable mmdc.
async function mmdcMajor($: any): Promise<number | string> {
  try {
    const r = await $.process.run(['mmdc', '--version'], { timeoutMs: PROBE_MS })
    const m = /^(\d+)\.\d+/.exec(r.stdout.trim())
    return r.exitCode === 0 && m ? Number(m[1]) : `version: ${oneLine(r.stdout) || `exit ${r.exitCode}`}`
  } catch (e) { return oneLine(e instanceof Error ? e.message : String(e)) }
}

// Caches a picture, most recent last, dropping the least recent past the entry or byte limit.
function keep(s: Pictures, key: string, p: Picture) {
  s.cache.set(key, p); s.bytes += p.png.length
  for (const [k, v] of s.cache) {
    if (s.cache.size <= s.limits.entries && s.bytes <= s.limits.bytes) break
    s.cache.delete(k); s.bytes -= v.png.length
  }
}

// One render in a fresh temp dir, removed after: the picture, or why there is none. Two runs of mmdc on the same source,
// config and page: an SVG, checked by svgUnsafe (layer A), then only if it is clean the PNG. mmdc before 12 takes -w; 12
// removed it and sizes its page by the puppeteer config's defaultViewport, and embeds fonts in an SVG as data: URLs
// unless told --no-font-embed (layer A allows no data: at all).
async function draw($: any, body: string, look: Look, columns: number, major: number): Promise<Picture | string> {
  const base = ((await $.env.get('TMPDIR')) || '/tmp').replace(/\/+$/, '') + '/mermaid-tty.'
  const made = await $.process.run(['mktemp', '-d', `${base}XXXXXX`], { timeoutMs: SHORT_MS })
  const dir = made.stdout.trim()
  if (made.exitCode !== 0 || !dir.startsWith(base) || !/^[A-Za-z0-9]+$/.test(dir.slice(base.length))) return 'no temp dir'
  try {
    const config = `${dir}/config.json`, puppeteer = `${dir}/puppeteer.json`, svg = `${dir}/out.svg`, out = `${dir}/out.png`
    await $.fs.write(config, JSON.stringify({ securityLevel: 'strict', theme: look }))
    await $.fs.write(puppeteer, JSON.stringify(puppeteerConfig(columns)))
    const mmdc = (o: string, e: 'svg' | 'png') => $.process.run(['mmdc', '-i', '-', '-o', o, '-e', e, '-b', 'transparent', '-t', look,
      '-c', config, '-p', puppeteer, ...(e === 'png' ? ['-s', String(SCALE)] : []), '-q',
      ...(major < 12 ? ['-w', String(columns * PAGE)] : e === 'svg' ? ['--no-font-embed'] : [])], { stdin: body, timeoutMs: MMDC_MS })
    const v = await mmdc(svg, 'svg')
    if (v.exitCode !== 0) return `mmdc exited ${v.exitCode}: ${oneLine(v.stderr)}`
    if ((await $.fs.stat(svg)).size > MAX_SVG) return 'svg over 4 MiB'
    const text = await $.fs.read(svg)
    const unsafe = typeof text === 'string' ? svgUnsafe(text) : 'unreadable'
    if (unsafe) return `unsafe svg (${unsafe})`
    const r = await mmdc(out, 'png')
    if (r.exitCode !== 0) return `mmdc exited ${r.exitCode}: ${oneLine(r.stderr)}`
    if ((await $.fs.stat(out)).size > MAX_PNG) return 'png over 2 MiB'
    const { base64 } = await $.fs.read(out, { as: 'bytes' })
    const size = pngSize(base64)
    if (!size) return 'not a png'
    if (size.width > columns * PAGE * SCALE * FULL) return 'too wide to read'
    const box = fit(size.width, size.height, columns)
    return box ? { png: base64, ...box } : 'over 255 rows'
  } finally {
    try { await $.process.run(['rm', '-rf', dir], { timeoutMs: SHORT_MS }) } catch {}
  }
}

// The cells a w x h PNG takes in at most `columns`: its natural width (16 px a column) or less, 1 to 255 columns, and
// rows = round(columns * h / w / 2), cells being about 1:2. Null past 255 rows.
export function fit(w: number, h: number, columns: number): { columns: number; rows: number } | null {
  const c = Math.max(1, Math.min(255, columns, Math.round(w / PX)))
  const rows = Math.max(1, Math.round(c * h / w / 2))
  return rows > 255 ? null : { columns: c, rows }
}

// A base64 PNG's width and height, read from its IHDR chunk; null when it is not a PNG.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]
export function pngSize(base64: string): { width: number; height: number } | null {
  const b: number[] = []; let acc = 0, bits = 0
  for (const ch of base64.slice(0, 32)) {
    const v = B64.indexOf(ch); if (v < 0) return null
    acc = (acc << 6) | v; bits += 6
    if (bits >= 8) { bits -= 8; b.push((acc >> bits) & 255); acc &= (1 << bits) - 1 }
  }
  if (b.length < 24 || SIGNATURE.some((x, i) => b[i] !== x) || String.fromCharCode(...b.slice(12, 16)) !== 'IHDR') return null
  const u32 = (i: number) => b[i]! * 16777216 + b[i + 1]! * 65536 + b[i + 2]! * 256 + b[i + 3]!
  const width = u32(16), height = u32(20)
  return width > 0 && height > 0 ? { width, height } : null
}

// A short id for a key (cyrb53), so the tried set holds no sources. A collision only leaves a diagram as text.
function hash(s: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677) }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36)
}

// A best-effort debug log line: a failing log never stops a drawing.
const say = (log: (reason: string) => void, reason: string) => { try { log(`image: ${reason}`) } catch {} }

// The first non-blank line of s, at most 200 characters.
const oneLine = (s: string) => (s.split(/\r\n|\r|\n/).find(l => l.trim()) ?? '').trim().slice(0, 200)
