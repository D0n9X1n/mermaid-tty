// node scripts/render-picture-gallery.ts OUT_DIR [MMDC]: the picture gallery, for judging by eye how pictures look in
// every look. For each diagram type, the largest ok fixture that reaches mmdc (core parses it, hooks/safe.ts passes it,
// layer A passes its SVG) is drawn as the hook draws it, in each look, to OUT_DIR/<look>/<fixture>.png, and index.html
// lays them out with a contrast report per picture. MMDC names the mermaid-cli to run (default: mmdc on PATH).
//
// The report is a review aid, not a gate: it can't tell text from a line drawn in a text color, and an anti-aliased
// edge is neither. It renders the SVG in mermaid-cli's own Chromium four ways: as drawn, with text transparent, black
// and white. The pixels where the black and white text renders differ are the glyphs, visible or not; at each, it takes
// the contrast between what is drawn and what lies beneath (the transparent-text render), and reports the share under
// 3, the floor the theme's own colors meet (hooks/picture-theme.ts).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { parseFail } from '../core/render.ts'
import { mmdcArgs, puppeteerConfig } from '../hooks/image.ts'
import { LOOKS, pictureTheme, type Look } from '../hooks/picture-theme.ts'
import { unsafeReason } from '../hooks/safe.ts'
import { svgUnsafe } from '../hooks/svg.ts'
import { isMain } from './lib/is-main.ts'

const TYPES = [
  'flowchart',
  'sequence',
  'class',
  'state',
  'er',
  'gantt',
  'pie',
  'journey',
  'gitGraph',
  'timeline',
  'mindmap',
  'quadrant',
  'xychart',
]
// The fixtures mmdc 11 and 12 do not draw clean in any look (tests/hooks/svg-corpus_test.ts lists why).
const UNDRAWN = new Set([
  'mindmap/mindmap-ok-06.mmd',
  'flowchart/flowchart-ok-59.mmd',
  'state/state-ok-26.mmd',
  'er/er-ok-25.mmd',
  'mindmap/mindmap-ok-15.mmd',
])
const COLUMNS = 80
// The share of glyph pixels under contrast 3 that flags a picture for a closer look.
const FLAG = 0.1

type Shot = { look: Look; type: string; fixture: string; png: string; low: number | null; problem?: string }

// A sequence rect or box with its author's own color: the theme doesn't choose it, so it says nothing about the look.
const AUTHOR_COLOR = /^\s*(?:rect|box)\s+(?:rgb|#)/im

// How much of a type's look a source shows: its lines, and more for each edge label, subgraph, note and loop.
const richness = (body: string) =>
  body.split('\n').length + 5 * (body.match(/\|[^|\n]+\||\bsubgraph\b|\bnote\b|\bloop\b|\balt\b/gi)?.length ?? 0)

// The fixtures to draw: per type, the richest ok one that reaches mmdc, and colors only the theme chooses.
export function pickFixtures(types = TYPES): { type: string; fixture: string; body: string }[] {
  return types.flatMap((type) => {
    const ok = readdirSync(join('fixtures', type))
      .filter((f) => /-ok-\d+\.mmd$/.test(f))
      .map((f) => ({ type, fixture: f.slice(0, -4), body: readFileSync(join('fixtures', type, f), 'utf8').trimEnd() }))
      .filter(
        (f) =>
          !parseFail(f.body) &&
          !unsafeReason(f.body) &&
          !UNDRAWN.has(`${type}/${f.fixture}.mmd`) &&
          !AUTHOR_COLOR.test(f.body),
      )
      .sort((a, b) => richness(b.body) - richness(a.body))
    return ok.slice(0, 1)
  })
}

// mmdc's major version.
function major(mmdc: string): number {
  const v = spawnSync(mmdc, ['--version'], { encoding: 'utf8' }).stdout.trim()
  return Number(/^(\d+)\./.exec(v)?.[1] ?? 'NaN')
}

// One render as the hook makes it: svg or png, in look, into dir.
function draw(mmdc: string, m: number, body: string, look: Look, format: 'svg' | 'png', out: string, dir: string) {
  const config = join(dir, `config-${look}.json`)
  const puppeteer = join(dir, 'puppeteer.json')
  writeFileSync(config, JSON.stringify(pictureTheme(look).config))
  writeFileSync(puppeteer, JSON.stringify(puppeteerConfig(COLUMNS)))
  const argv = mmdcArgs({ out, format, look, config, puppeteer, columns: COLUMNS, major: m })
  return spawnSync(mmdc, argv.slice(1), { input: body, encoding: 'utf8' })
}

// The text-hiding rules for the four renders.
const TEXT = (color: string) =>
  `text, tspan, foreignObject * { fill: ${color} !important; color: ${color} !important; ` +
  `-webkit-text-fill-color: ${color} !important; stroke: none !important }`

// The share of glyph pixels under contrast 3, measured in the page from four screenshots of the SVG. The page behind a
// transparent picture: the terminal it stands for.
const canvas = (look: Look) => {
  if (look === 'default-light') {
    return '#ffffff'
  }

  return look === 'default-dark' ? '#1e1e1e' : pictureTheme(look).background
}

async function lowShare(page: any, svg: string, background: string): Promise<number> {
  const shots: string[] = []
  for (const css of ['', TEXT('transparent'), TEXT('#000000'), TEXT('#ffffff')]) {
    await page.setContent(
      `<html><body style="margin:0;background:${background}">` + `<style>${css}</style>${svg}</body></html>`,
    )
    const el = await page.$('svg')
    shots.push(await el.screenshot({ encoding: 'base64' }))
  }

  return page.evaluate(async (images: string[]) => {
    const data = await Promise.all(
      images.map(
        (b64) =>
          new Promise<ImageData>((done) => {
            const img = new Image()
            img.onload = () => {
              const c = document.createElement('canvas')
              c.width = img.width
              c.height = img.height
              const g = c.getContext('2d')!
              g.drawImage(img, 0, 0)
              done(g.getImageData(0, 0, img.width, img.height))
            }
            img.src = `data:image/png;base64,${b64}`
          }),
      ),
    )
    const [drawn, under, black, white] = data as [ImageData, ImageData, ImageData, ImageData]
    const lin = (c: number) => {
      const s = c / 255
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }
    const lum = (d: Uint8ClampedArray, i: number) =>
      0.2126 * lin(d[i]!) + 0.7152 * lin(d[i + 1]!) + 0.0722 * lin(d[i + 2]!)
    let glyphs = 0
    let low = 0
    for (let i = 0; i < drawn.data.length; i += 4) {
      // A glyph's core: where black and white text differ by most of the range, so anti-aliased edges are left out.
      if (Math.abs(black.data[i]! - white.data[i]!) < 200) {
        continue
      }

      glyphs++
      const [a, b] = [lum(drawn.data, i), lum(under.data, i)].sort((x, y) => y - x)
      if ((a! + 0.05) / (b! + 0.05) < 3) {
        low++
      }
    }

    return glyphs === 0 ? 0 : low / glyphs
  }, shots)
}

// Chromium as mermaid-cli launches it: its own puppeteer, resolved beside its own install (node_modules/.bin/mmdc sits
// in the node_modules that holds puppeteer).
function puppeteerOf(mmdc: string): any {
  return createRequire(join(dirname(mmdc), '..', 'mermaid-tty-gallery.cjs'))('puppeteer')
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

function index(shots: Shot[]): string {
  const looks = [...new Set(shots.map((s) => s.look))]
  const rows = [...new Set(shots.map((s) => s.fixture))].map((fixture) => {
    const cells = looks.map((look) => {
      const s = shots.find((x) => x.look === look && x.fixture === fixture)!
      const note =
        s.problem ?? (s.low === null ? '' : `${(s.low * 100).toFixed(1)}% of text under 3${s.low > FLAG ? ' ⚑' : ''}`)
      return `<td style="background:${canvas(look)}">${s.png ? `<img src="${esc(s.png)}">` : ''}<p>${esc(note)}</p></td>`
    })
    return `<tr><th>${esc(fixture)}</th>${cells.join('')}</tr>`
  })
  return (
    '<!doctype html><meta charset="utf-8"><title>Picture gallery</title><style>' +
    'body{font:14px system-ui;background:#888;margin:16px}td,th{padding:8px;vertical-align:top}' +
    'img{max-width:420px;display:block}p{margin:4px 0 0;font-size:12px;color:#000;background:#fffc}</style>' +
    `<table><tr><th></th>${looks.map((l) => `<th>${l}</th>`).join('')}</tr>${rows.join('')}</table>`
  )
}

// The mmdc to run: the path given, or the first mmdc on PATH.
function findMmdc(given: string | undefined): string {
  if (given) {
    return given
  }

  const dirs = (process.env.PATH ?? '').split(delimiter)
  return dirs.map((d) => join(d, 'mmdc')).find((p) => existsSync(p)) ?? 'mmdc'
}

async function main(args: string[]): Promise<number> {
  const out = args[0]
  const mmdc = findMmdc(args[1])
  if (!out) {
    console.error('usage: node scripts/render-picture-gallery.ts OUT_DIR [MMDC]')
    return 2
  }

  const m = major(mmdc)
  const tmp = mkdtempSync(join(tmpdir(), 'mtty-gallery-'))
  const browser = await puppeteerOf(mmdc).launch({ headless: true })
  const page = await browser.newPage()
  await page.setViewport({ width: COLUMNS * 12, height: 600, deviceScaleFactor: 2 })
  const shots: Shot[] = []
  try {
    for (const { type, fixture, body } of pickFixtures()) {
      for (const look of LOOKS) {
        const svg = join(tmp, `${look}-${fixture}.svg`)
        const png = join(look, `${fixture}.png`)
        mkdirSync(join(out, look), { recursive: true })
        const s = draw(mmdc, m, body, look, 'svg', svg, tmp)
        const text = s.status === 0 ? readFileSync(svg, 'utf8') : ''
        const unsafe = text ? svgUnsafe(text) : `mmdc exited ${s.status}`
        if (unsafe) {
          shots.push({ look, type, fixture, png: '', low: null, problem: unsafe })
          continue
        }

        draw(mmdc, m, body, look, 'png', join(out, png), tmp)
        const low = await lowShare(page, text, canvas(look))
        shots.push({ look, type, fixture, png, low })
        console.log(`${look} ${fixture}: ${(low * 100).toFixed(1)}% of text under 3${low > FLAG ? '  <- look' : ''}`)
      }
    }
  } finally {
    await browser.close()
    rmSync(tmp, { recursive: true, force: true })
  }

  writeFileSync(join(out, 'index.html'), index(shots))
  console.log(`picture gallery: ${shots.length} pictures in ${join(out, 'index.html')}`)
  return 0
}

if (isMain(import.meta)) {
  process.exitCode = await main(process.argv.slice(2))
}
