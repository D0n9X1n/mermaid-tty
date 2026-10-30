// Pictures of Mermaid's own rendering, for a terminal that shows pixels: mermaid-cli (mmdc, if it is
// on PATH) draws a fence to a PNG in the background, and the next draw of the reply uses it. A draw
// never waits on mmdc: a miss answers undefined (the text drawing stands) and queues one render, at
// most one running at a time; its picture, or why it failed, is cached by source, look and width.
// No JSX and no Node, so node --test can import it and the engine can load it.
import { createLru, type Lru } from '../core/lru.ts'
import { showsPixels } from './pixels.ts'

export type Picture = { png: string; columns: number; rows: number }
export type Look = 'dark' | 'default'                // Mermaid's theme: dark, or its light default
type Entry = Picture | { failed: string }
export type Pictures = { cache: Lru<string, Entry>; inflight: Set<string>; tail: Promise<void>; pixels?: Promise<boolean>; idle(): Promise<void> }

const QUEUE = 8                                      // renders waiting or running; a request past that is asked again later
const CSS = 8, SCALE = 2, PX = CSS * SCALE           // CSS px per column, drawn at 2x: 16 PNG px a column
// mmdc's page is 12 CSS px a column, wider than the 8 shown, and Mermaid shrinks a diagram wider than its
// page to fit: so a picture inside 90% of the page (its margins take the rest) is drawn at its own size and
// scaled down by at most 2/3; a wider one was shrunk, perhaps past reading, and the text drawing stands.
const PAGE = 12, FULL = 0.9
const MAX_PNG = 2 * 1024 * 1024                      // what an Image's { png } takes, decoded
const MMDC_MS = 30000, SHORT_MS = 5000

// A store of pictures, at most `capacity` kept (each up to 2 MiB). idle() resolves once no render is queued.
export function createPictures(capacity = 16): Pictures {
  const s: Pictures = {
    cache: createLru(capacity), inflight: new Set(), tail: Promise.resolve(),
    idle: async () => { let t: Promise<void>; do { t = s.tail; await t } while (t !== s.tail) },
  }
  return s
}

// The look a picture is drawn in, or null for none: mono means no colour; the terminal must show pixels
// (told once per store); and Claude Code's theme must say dark or light, since the background is
// transparent and a guess could draw dark lines on a dark terminal.
export async function pictureLook($: any, s: Pictures, theme: string): Promise<Look | null> {
  if (theme === 'mono') return null
  s.pixels ??= showsPixels($)
  if (!await s.pixels) return null
  try {
    const v = (await $.config.list()).find((r: any) => r.key === 'theme')?.value
    return typeof v !== 'string' ? null : v.startsWith('dark') ? 'dark' : v.startsWith('light') ? 'default' : null
  } catch { return null }
}

// The cached picture of body in look at columns, or undefined: then one render is queued unless one is,
// or the queue is full. A finished render redraws (ui.render); a failed one logs `image: <why>` and is
// not tried again while it is cached.
export function pictureFor($: any, s: Pictures, body: string, look: Look, columns: number, log: (reason: string) => void): Picture | undefined {
  const key = JSON.stringify([body, look, columns]), hit = s.cache.get(key)
  if (hit) return 'failed' in hit ? undefined : hit
  if (s.inflight.has(key) || s.inflight.size >= QUEUE) return undefined
  s.inflight.add(key)
  s.tail = s.tail.then(async () => {
    const r = await draw($, body, look, columns).catch((e: unknown) => oneLine(e instanceof Error ? e.message : String(e)))
    s.inflight.delete(key)
    if (typeof r === 'string') { s.cache.set(key, { failed: r }); try { log(`image: ${r}`) } catch {} }
    else { s.cache.set(key, r); try { $.ui.invalidate('ui.render') } catch {} }
  }).catch(() => {})
  return undefined
}

// One render in a fresh temp dir, removed after: the picture, or why there is none.
async function draw($: any, body: string, look: Look, columns: number): Promise<Picture | string> {
  const base = ((await $.env.get('TMPDIR')) || '/tmp').replace(/\/+$/, '') + '/mermaid-tty.'
  const made = await $.process.run(['mktemp', '-d', `${base}XXXXXX`], { timeoutMs: SHORT_MS })
  const dir = made.stdout.trim()
  if (made.exitCode !== 0 || !dir.startsWith(base) || !/^[A-Za-z0-9]+$/.test(dir.slice(base.length))) return 'no temp dir'
  try {
    const config = `${dir}/config.json`, out = `${dir}/out.png`
    await $.fs.write(config, JSON.stringify({ securityLevel: 'strict' }))
    const r = await $.process.run(['mmdc', '-i', '-', '-o', out, '-e', 'png', '-b', 'transparent', '-t', look, '-c', config,
      '-w', String(columns * PAGE), '-s', String(SCALE), '-q'], { stdin: body, timeoutMs: MMDC_MS })
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

// The cells a w x h PNG takes in at most `columns`: its natural width (16 px a column) or less, 1 to 255
// columns, and rows = round(columns * h / w / 2), cells being about 1:2. Null past 255 rows.
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

// The first non-blank line of s, at most 200 characters.
const oneLine = (s: string) => (s.split(/\r\n|\r|\n/).find(l => l.trim()) ?? '').trim().slice(0, 200)
