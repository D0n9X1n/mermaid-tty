// node scripts/render-gallery.ts [OUT_DIR] [--png]: the review gallery, for judging the drawings outside a terminal. It
// renders every non-reject fixture of every fixtures/<type> folder but corpus to SVG at 80 and 60 columns under nord,
// stacks A's CJK fixtures in cjk.svg and each Tier 1 type's in cjk-<type>.svg, puts A's two fixtures and each Tier 1
// type's first ok fixture under all 6 themes in palettes.svg, and links them all from index.html. Every SVG is B's toSvg
// page, the README assets' serializer. It self-checks every SVG, with B's misplaced and with offGrid, which measures
// columns on its own, and exits 1 on a problem. --png runs rsvg-convert on each SVG.
import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TIER1 } from '../core/registry.ts'
import type { Rows, Span } from '../core/render.ts'
import { renderMermaid } from '../core/render.ts'
import { THEMES } from '../core/themes.ts'
import { width } from '../core/width.ts'
import { isMain } from './lib/is-main.ts'
import { CELL, esc, misplaced, type Styled, toSvg } from './lib/svg.ts'
import { DARK_KEYS, offGrid } from './render-svg.ts'

const FIXTURES = fileURLToPath(new URL('../fixtures/', import.meta.url))
const WIDTHS = [80, 60]
type Section = { theme: string; id: string; cols: number }

// The type folders under fixtures/, corpus excepted: flowchart, sequence and the Tier 1 types in that order, then any other.
const ORDER = ['flowchart', 'sequence', ...TIER1]
const types = (): string[] => {
  const dirs = readdirSync(FIXTURES, { withFileTypes: true }).filter(e => e.isDirectory() && e.name !== 'corpus').map(e => e.name)
  return [...ORDER.filter(t => dirs.includes(t)), ...dirs.filter(t => !ORDER.includes(t)).sort()]
}
// The ids of type's fixtures, the rejects excepted, sorted.
const ids = (type: string) => readdirSync(join(FIXTURES, type)).filter(f => f.endsWith('.mmd') && !f.includes('-reject-')).map(f => f.slice(0, -4)).sort()
// A fixture's source, by id: its type begins its id.
const source = (id: string) => readFileSync(join(FIXTURES, id.slice(0, id.indexOf('-')), `${id}.mmd`), 'utf8')
// Whether a source holds Han, Kana or Hangul.
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u

// A color as hex: a '#rrggbb' as given, a ThemeKey through T30's DARK_KEYS. Anything else throws.
function hex(c: string): string {
  if (/^#[0-9a-f]{6}$/i.test(c)) { return c }
  if (Object.hasOwn(DARK_KEYS, c)) { return DARK_KEYS[c]! }
  throw new Error(`render-gallery: no color for ${JSON.stringify(c)}`)
}
// A span as B's Styled, as the README assets style it (render-image.ts): dim draws in inactive, no color in text.
export const styled = (sp: Span): Styled => ({ text: sp.text, fg: sp.dimColor ? DARK_KEYS.inactive! : sp.color ? hex(sp.color) : DARK_KEYS.text!,
  ...(sp.backgroundColor ? { bg: hex(sp.backgroundColor) } : {}), ...(sp.bold ? { bold: true } : {}) })
// The rows core draws of a section's fixture, or null when core falls back.
const draw = ({ theme, id, cols }: Section) => renderMermaid(source(id), { columns: cols, theme })

// Writes the gallery into out, serializing with svg (B's toSvg by default; a seam for the tests), and self-checks every
// SVG. Returns the problems, each led by its file: a fixture core fell back on, a Tier 1 type with no CJK fixture, and
// each glyph B's misplaced finds off its cell or offGrid finds not at x = col × CELL.
export function gallery(out: string, svg: (rows: Styled[][], title: string) => string = (rows, title) => toSvg(rows, width, title)):
  { problems: string[] } {
  mkdirSync(out, { recursive: true })
  const problems: string[] = []
  const write = (file: string, rows: Rows) => {
    const s = rows.map(row => row.map(styled))
const  page = svg(s, file.slice(0, -'.svg'.length))
    writeFileSync(join(out, file), page)
    problems.push(...[...misplaced(page, s, width), ...offGrid(page, rows, CELL)].map(p => `${file}: ${p}`))
  }
  // A sheet stacks its sections, each under a bold label and followed by a blank row.
  const sheet = (file: string, sections: Section[]) => write(file, sections.flatMap((s): Rows => {
    const label = `${s.theme}: ${s.id}@${s.cols}`
const  rows = draw(s)
    if (!rows) { problems.push(`${file}: core fell back on ${label}`) }
    return [[{ text: label, bold: true }], ...(rows ?? []), []]
  }))
  const all = types()
const  tier1 = TIER1.filter(t => all.includes(t))
const  nord = (id: string) => WIDTHS.map(cols => ({ theme: 'nord', id, cols }))
  const groups: [string, string[]][] = [['sheets', ['cjk.svg', ...tier1.map(t => `cjk-${t}.svg`), 'palettes.svg']]]
  for (const type of all) {
    const files: string[] = []
    for (const id of ids(type)) { for (const cols of WIDTHS) {
      const file = `${id}@${cols}.svg`
const  rows = draw({ theme: 'nord', id, cols })
      if (rows) { write(file, rows); files.push(file) } else { problems.push(`${file}: core fell back`) }
    } }
    groups.push([type, files])
  }
  sheet('cjk.svg', ['flowchart-ok-40', 'sequence-ok-26'].flatMap(nord))
  for (const t of tier1) {
    const cjk = ids(t).filter(id => id.includes('-ok-') && CJK.test(source(id)))
    if (!cjk.length) { problems.push(`cjk-${t}.svg: no ok fixture of ${t} holds Han, Kana or Hangul`) }
    sheet(`cjk-${t}.svg`, cjk.flatMap(nord))
  }
  const firsts = tier1.flatMap(t => ids(t).find(id => id.includes('-ok-')) ?? [])
  sheet('palettes.svg', ['flowchart-ok-40', 'sequence-ok-38', ...firsts].flatMap(id => Object.keys(THEMES).map(theme => ({ theme, id, cols: 80 }))))
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
  const args = process.argv.slice(2)
const  dirs = args.filter(a => a !== '--png')
  if (dirs.length > 1) { console.error(USAGE); return 2 }
  const out = dirs[0] ?? join('out', 'gallery')
const  problems = [...gallery(out).problems, ...(args.includes('--png') ? png(out) : [])]
  for (const p of problems) { console.error(`render-gallery: ${p}`) }
  if (problems.length) { return 1 }
  console.log(`render-gallery: wrote ${readdirSync(out).filter(f => f.endsWith('.svg')).length} SVGs and index.html to ${out}`)
  return 0
}

// main() runs only when node runs this file, not when another module imports it.
if (isMain(import.meta)) { process.exitCode = main() }
