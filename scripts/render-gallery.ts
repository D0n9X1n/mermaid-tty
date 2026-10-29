// node scripts/render-gallery.ts [OUT_DIR] [--png]: the review gallery, for judging the drawings outside a terminal. It
// renders every non-reject fixture of fixtures/{flowchart,sequence} to SVG at 80 and 60 columns under nord, stacks the
// CJK fixtures in cjk.svg and two fixtures under all 6 themes in palettes.svg, and links them all from index.html. It
// self-checks every SVG, each glyph at x = col × CELL_W, and exits 1 on a problem. --png runs rsvg-convert on each SVG.
import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Rows } from '../core/render.ts'
import { renderMermaid } from '../core/render.ts'
import { THEMES } from '../core/themes.ts'
import { isMain } from './lib/is-main.ts'
import { esc } from './lib/svg.ts'
import { CELL_W, offGrid, rowsToSvg } from './render-svg.ts'

const FIXTURES = fileURLToPath(new URL('../fixtures/', import.meta.url))
const WIDTHS = [80, 60]
type Section = { theme: string; id: string; cols: number }

// The ids of type's fixtures, the rejects excepted, sorted.
const ids = (type: string) => readdirSync(join(FIXTURES, type)).filter(f => f.endsWith('.mmd') && !f.includes('-reject-')).map(f => f.slice(0, -4)).sort()
// The rows core draws of the fixture, whose type begins its id, or null when core falls back.
const draw = ({ theme, id, cols }: Section) =>
  renderMermaid(readFileSync(join(FIXTURES, id.slice(0, id.indexOf('-')), `${id}.mmd`), 'utf8'), { columns: cols, theme })

// Writes the gallery into out, rendering with toSvg, a seam for the tests, and self-checks every SVG. Returns the
// problems, each led by its file: a fixture core fell back on, and each glyph not at x = col × CELL_W.
export function gallery(out: string, toSvg: (rows: Rows) => string = rowsToSvg): { problems: string[] } {
  mkdirSync(out, { recursive: true })
  const problems: string[] = []
  const write = (file: string, rows: Rows) => {
    const svg = toSvg(rows)
    writeFileSync(join(out, file), svg)
    problems.push(...offGrid(svg, rows, CELL_W).map(p => `${file}: ${p}`))
  }
  // A sheet stacks its sections, each under a bold label and followed by a blank row.
  const sheet = (file: string, sections: Section[]) => write(file, sections.flatMap((s): Rows => {
    const label = `${s.theme}: ${s.id}@${s.cols}`, rows = draw(s)
    if (!rows) problems.push(`${file}: core fell back on ${label}`)
    return [[{ text: label, bold: true }], ...(rows ?? []), []]
  }))
  const groups: [string, string[]][] = [['sheets', ['cjk.svg', 'palettes.svg']]]
  for (const type of ['flowchart', 'sequence']) {
    const files: string[] = []
    for (const id of ids(type)) for (const cols of WIDTHS) {
      const file = `${id}@${cols}.svg`, rows = draw({ theme: 'nord', id, cols })
      if (rows) { write(file, rows); files.push(file) } else problems.push(`${file}: core fell back`)
    }
    groups.push([type, files])
  }
  sheet('cjk.svg', ['flowchart-ok-40', 'sequence-ok-26'].flatMap(id => WIDTHS.map(cols => ({ theme: 'nord', id, cols }))))
  sheet('palettes.svg', ['flowchart-ok-40', 'sequence-ok-38'].flatMap(id => Object.keys(THEMES).map(theme => ({ theme, id, cols: 80 }))))
  writeFileSync(join(out, 'index.html'), index(groups))
  return { problems }
}

// The index page: under a heading per group, each SVG as an <img>, linked to its file and captioned with its name.
function index(groups: [string, string[]][]): string {
  const figure = (f: string) => `<figure><a href="${esc(f)}"><img src="${esc(f)}" alt="${esc(f)}" loading="lazy"></a><figcaption>${esc(f)}</figcaption></figure>`
  return ['<!doctype html>', '<html lang="en"><head><meta charset="utf-8"><title>mermaid-tty gallery</title>',
    '<style>body{background:#111;color:#ddd;font:14px system-ui,sans-serif;margin:24px}figure{display:inline-block;vertical-align:top;margin:0 24px 24px 0}img{display:block}</style>',
    '</head><body><h1>mermaid-tty gallery</h1>', ...groups.flatMap(([name, files]) => [`<h2>${esc(name)}</h2>`, ...files.map(figure)]),
    '</body></html>', ''].join('\n')
}

// --png: each SVG in out as a PNG at twice its size, through rsvg-convert when it is on PATH. A missing rsvg-convert is
// not a problem, since the SVGs are the gallery; a conversion that fails is one.
function png(out: string): string[] {
  if (spawnSync('rsvg-convert', ['--version']).error) { console.log('render-gallery: rsvg-convert is not on PATH (it comes with librsvg), so no PNGs'); return [] }
  return readdirSync(out).filter(f => f.endsWith('.svg')).flatMap(f => {
    const r = spawnSync('rsvg-convert', ['-z', '2', '-o', join(out, f.replace(/\.svg$/, '.png')), join(out, f)], { encoding: 'utf8' })
    return r.status === 0 ? [] : [`${f}: rsvg-convert failed: ${r.stderr?.trim() || r.error?.message || `status ${r.status}`}`]
  })
}

const USAGE = 'usage: node scripts/render-gallery.ts [OUT_DIR] [--png]'
// OUT_DIR defaults to out/gallery, under the working directory (out/ is gitignored), as the wiki's local checks run it.

// Writes the gallery to OUT_DIR, and with --png its PNGs. Exits 1 on a problem, 2 on more than one OUT_DIR.
function main(): number {
  const args = process.argv.slice(2), dirs = args.filter(a => a !== '--png')
  if (dirs.length > 1) { console.error(USAGE); return 2 }
  const out = dirs[0] ?? join('out', 'gallery'), problems = [...gallery(out).problems, ...(args.includes('--png') ? png(out) : [])]
  for (const p of problems) console.error(`render-gallery: ${p}`)
  if (problems.length) return 1
  console.log(`render-gallery: wrote ${readdirSync(out).filter(f => f.endsWith('.svg')).length} SVGs and index.html to ${out}`)
  return 0
}

// main() runs only when node runs this file, not when another module imports it.
if (isMain(import.meta)) process.exitCode = main()
