import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { THEMES } from '../../core/themes.ts'
import { gallery } from '../../scripts/render-gallery.ts'
import { DARK_KEYS, glyphXs } from '../../scripts/render-svg.ts'
import { TIER1 } from '../../core/registry.ts'
import { type Styled, toSvg } from '../../scripts/lib/svg.ts'
import { width } from '../../core/width.ts'

const FIXTURES = fileURLToPath(new URL('../../fixtures/', import.meta.url))

// A fresh temp dir, removed after the test.
function scratch(t: { after(fn: () => void): void }): string {
  const dir = mkdtempSync(join(tmpdir(), 'mtty-gal-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}
// The SVGs the gallery owes type's fixtures, the rejects excepted: one at 80 columns and one at 60 each, sorted.
const owed = (type: string) => readdirSync(join(FIXTURES, type)).filter(f => f.endsWith('.mmd') && !f.includes('-reject-'))
  .flatMap(f => [80, 60].map(w => `${f.slice(0, -4)}@${w}.svg`)).sort()
// The type folders the gallery walks: flowchart, sequence, then the Tier 1 types.
const TYPES = ['flowchart', 'sequence', ...TIER1]
// The first ok fixture of type.
const firstOk = (type: string) => readdirSync(join(FIXTURES, type)).filter(f => f.includes('-ok-')).sort()[0]!.slice(0, -4)
// A file's glyphs, joined: its text with the blanks left out.
const glyphs = (file: string) => glyphXs(readFileSync(file, 'utf8')).map(([ch]) => ch).join('')

test('VR.gallery: the self-check names every file in which a glyph is planted off its cell', t => {
  const out = scratch(t), planted = (rows: Styled[][], title: string) => toSvg(rows, width, title).replace(/<text x="(\d+)"/, (_, x: string) => `<text x="${Number(x) + 1}"`)
  const named = new Set(gallery(out, planted).problems.map(p => p.slice(0, p.indexOf(':'))))
  assert.deepEqual([...named].sort(), readdirSync(out).filter(f => f.endsWith('.svg')).sort())
})

test('VR.gallery: index.html links and shows each SVG once: the sheets, then every non-reject fixture of every type at 80 and 60 under its type', t => {
  const out = scratch(t)
  assert.deepEqual(gallery(out).problems, [])
  const html = readFileSync(join(out, 'index.html'), 'utf8'), svgs = readdirSync(out).filter(f => f.endsWith('.svg')).sort()
  const groups = Object.fromEntries(html.split('<h2>').slice(1)
    .map(s => [s.slice(0, s.indexOf('<')), [...s.matchAll(/<a href="([^"]+)"/g)].map(m => m[1]).sort()]))
  assert.deepEqual(groups, { sheets: ['cjk.svg', ...TIER1.map(t => `cjk-${t}.svg`), 'palettes.svg'].sort(), ...Object.fromEntries(TYPES.map(t => [t, owed(t)])) })
  assert.deepEqual(html.split('<h2>').slice(1).map(s => s.slice(0, s.indexOf('<'))), ['sheets', ...TYPES])
  assert.deepEqual(Object.values(groups).flat().sort(), svgs)
  assert.deepEqual([...html.matchAll(/<img src="([^"]+)"/g)].map(m => m[1]).sort(), svgs)
})

test('VR.gallery: the sheets: CJK at 80 and 60; each of the 6 themes labelled and drawn in its own colors', t => {
  const out = scratch(t)
  assert.deepEqual(gallery(out).problems, [])
  const cjk = glyphs(join(out, 'cjk.svg')), pal = glyphs(join(out, 'palettes.svg')), svg = readFileSync(join(out, 'palettes.svg'), 'utf8')
  for (const id of ['flowchart-ok-40', 'sequence-ok-26']) for (const w of [80, 60]) assert.ok(cjk.includes(`nord:${id}@${w}`), `cjk ${id}@${w}`)
  assert.ok(cjk.includes('读取配置文件'))
  for (const id of ['flowchart-ok-40', 'sequence-ok-38']) for (const theme of Object.keys(THEMES)) assert.ok(pal.includes(`${theme}:${id}@80`), `${theme}:${id}`)
  for (const { name, roles: { node } } of Object.values(THEMES)) if (node) assert.ok(svg.includes(`fill="${DARK_KEYS[node] ?? node}"`), name)
})

test('VR.gallery: each Tier 1 type has a CJK sheet of its CJK fixtures at 80 and 60, and its first ok fixture under all 6 themes', t => {
  const out = scratch(t)
  assert.deepEqual(gallery(out).problems, [])
  const pal = glyphs(join(out, 'palettes.svg')), cjkSource = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
  for (const type of TIER1) {
    const sheet = glyphs(join(out, `cjk-${type}.svg`)), cjk = readdirSync(join(FIXTURES, type))
      .filter(f => f.includes('-ok-') && cjkSource.test(readFileSync(join(FIXTURES, type, f), 'utf8'))).map(f => f.slice(0, -4))
    assert.ok(cjk.length > 0, type)
    for (const id of cjk) for (const w of [80, 60]) assert.ok(sheet.includes(`nord:${id}@${w}`), `cjk-${type} ${id}@${w}`)
    for (const theme of Object.keys(THEMES)) assert.ok(pal.includes(`${theme}:${firstOk(type)}@80`), `${theme}:${firstOk(type)}`)
  }
})

test("VR.gallery: every gallery SVG is B's toSvg page, the README assets' serializer", t => {
  const out = scratch(t)
  assert.deepEqual(gallery(out).problems, [])
  for (const f of readdirSync(out).filter(f => f.endsWith('.svg'))) assert.match(readFileSync(join(out, f), 'utf8'), /^<svg [^>]* role="img" aria-label="[^"]+">/, f)
})

const RENDER_GALLERY = fileURLToPath(new URL('../../scripts/render-gallery.ts', import.meta.url))
// render-gallery.ts run with args, its PATH, under whatever name the environment gives it, set to path.
const cli = (path: string, ...args: string[]) => spawnSync(process.execPath, [RENDER_GALLERY, ...args],
  { encoding: 'utf8', env: { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toUpperCase() !== 'PATH')), PATH: path } })

test('VR.gallery: render-gallery.ts with two OUT_DIRs prints its usage and exits 2', t => {
  const r = cli('', scratch(t), scratch(t))
  assert.equal(r.status, 2); assert.match(r.stderr, /usage: node scripts\/render-gallery\.ts \[OUT_DIR\] \[--png\]/)
})

test('VR.gallery: render-gallery.ts without OUT_DIR writes out/gallery under the working directory, as the wiki runs it', t => {
  const cwd = scratch(t), r = spawnSync(process.execPath, [RENDER_GALLERY], { encoding: 'utf8', cwd })
  assert.equal(r.status, 0, r.stderr)
  const files = readdirSync(join(cwd, 'out', 'gallery'))
  assert.ok(files.includes('index.html') && files.includes('flowchart-ok-01@80.svg'), files.join(' '))
})

test('VR.gallery: render-gallery.ts OUT_DIR --png with no rsvg-convert on PATH writes the gallery, says rsvg-convert is missing, and exits 0', t => {
  const out = scratch(t), r = cli('', out, '--png'), files = readdirSync(out)
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /rsvg-convert is not on PATH/)
  assert.ok(files.includes('index.html')); assert.deepEqual(files.filter(f => f.endsWith('.png')), [])
})

// A stand-in rsvg-convert, run by /bin/sh with builtins only: it answers --version, fails on cjk.svg, and otherwise
// writes an empty file at -o's path.
const FAKE_RSVG = '#!/bin/sh\n[ "$1" = --version ] && exit 0\ncase "$*" in *cjk.svg*) echo boom >&2; exit 3;; esac\nwhile [ $# -gt 0 ]; do [ "$1" = -o ] && : > "$2"; shift; done\n'

test('VR.gallery: render-gallery.ts OUT_DIR --png runs rsvg-convert on each SVG, names one it fails on, and exits 1',
  { skip: process.platform === 'win32' && 'the stand-in rsvg-convert is a shell script' }, t => {
    const out = scratch(t), bin = scratch(t)
    writeFileSync(join(bin, 'rsvg-convert'), FAKE_RSVG); chmodSync(join(bin, 'rsvg-convert'), 0o755)
    const r = cli(bin, out, '--png'), files = readdirSync(out)
    assert.equal(r.status, 1); assert.match(r.stderr, /cjk\.svg: rsvg-convert failed: boom/)
    assert.deepEqual(files.filter(f => f.endsWith('.png')).sort(),
      files.filter(f => f.endsWith('.svg') && f !== 'cjk.svg').map(f => f.replace(/\.svg$/, '.png')).sort())
  })

const ROOT = fileURLToPath(new URL('../../', import.meta.url))

// A copy of the gallery whose glyphCells advances a W/F glyph one cell, not two, so the renderer draws each glyph after a
// CJK one a cell early. A self-check that shared glyphCells would agree with that renderer and pass it.
test('VR.gallery: the self-check measures columns on its own: a renderer that advances a W/F glyph one cell fails it, by file', t => {
  const root = scratch(t)
  for (const p of ['package.json', 'core', 'fixtures/flowchart', 'fixtures/sequence', 'scripts/render-gallery.ts', 'scripts/render-svg.ts', 'scripts/lib/svg.ts', 'scripts/lib/palette.ts', 'scripts/lib/is-main.ts'])
    cpSync(join(ROOT, p), join(root, p), { recursive: true })
  const svgTs = join(root, 'scripts/lib/svg.ts'), src = readFileSync(svgTs, 'utf8'), mutated = src.replace(/col \+= w;?$/m, 'col += Math.min(w, 1)')
  assert.notEqual(mutated, src, "glyphCells's column advance, col += w, is gone from scripts/lib/svg.ts")
  writeFileSync(svgTs, mutated)
  const r = spawnSync(process.execPath, [join(root, 'scripts/render-gallery.ts'), join(root, 'out')], { encoding: 'utf8' })
  assert.equal(r.status, 1, r.stdout + r.stderr)
  assert.match(r.stderr, /^render-gallery: flowchart-ok-40@80\.svg: /m)
})
