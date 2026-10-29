import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderMermaid } from '../../core/render.ts'
import { THEMES } from '../../core/themes.ts'
import { BG, PAD } from '../../scripts/lib/svg.ts'
import { DARK_KEYS, glyphXs, offGrid, rowsToSvg } from '../../scripts/render-svg.ts'

const CELLS = { cellW: 10, cellH: 20 }
// Each cell <rect> as 'x y width height fill'; the page's <rect> has no x, so it is left out.
const rects = (svg: string) => [...svg.matchAll(/<rect x="([^"]*)" y="([^"]*)" width="([^"]*)" height="([^"]*)" fill="([^"]*)"\/>/g)].map(m => m.slice(1).join(' '))
// Each glyph's <text> attributes, keyed by its glyph.
const attrs = (svg: string): Record<string, string> => Object.fromEntries([...svg.matchAll(/<text ([^>]*)>([^<]*)<\/text>/g)].map(m => [m[2], m[1]]))

test('VR.gallery: each background run is one <rect> at col × cellW, as wide as its cells, a W/F char counting two', () =>
  assert.deepEqual(rects(rowsToSvg([
    [{ text: '中 ' }, { text: '[', color: '#88C0D0' }, { text: ' 读取 ', color: '#2E3440', backgroundColor: '#88C0D0' }, { text: '?', color: '#2E3440', backgroundColor: '#88C0D0', bold: true }, { text: ']' }],
    [{ text: 'ab', backgroundColor: '#111111' }, { text: 'c' }, { text: 'd', backgroundColor: '#111111' }, { text: 'e', backgroundColor: '#222222' }],
  ], CELLS)), ['40 0 70 20 #88C0D0', '0 20 20 20 #111111', '30 20 10 20 #111111', '40 20 10 20 #222222']))

test('VR.gallery: <, & and " in text are escaped, and glyphXs reads each glyph back', () => {
  const svg = rowsToSvg([[{ text: 'a<&"b' }]], CELLS)
  for (const e of ['>&lt;</text>', '>&amp;</text>', '>&quot;</text>']) assert.ok(svg.includes(e), e)
  assert.doesNotMatch(svg, />[<&"]<\/text>/)
  assert.deepEqual(glyphXs(svg), [['a', 0], ['<', 10], ['&', 20], ['"', 30], ['b', 40]])
})

test('VR.gallery: a ThemeKey color or background resolves through DARK_KEYS to its hex; an unknown one throws', () => {
  const svg = rowsToSvg([[{ text: 'a', color: 'suggestion' }, { text: 'b', color: 'inverseText', backgroundColor: 'warning' }]], CELLS)
  assert.match(attrs(svg).a!, new RegExp(`fill="${DARK_KEYS.suggestion}"`))
  assert.match(attrs(svg).b!, new RegExp(`fill="${DARK_KEYS.inverseText}"`))
  assert.deepEqual(rects(svg), [`10 0 10 20 ${DARK_KEYS.warning}`])
  assert.doesNotMatch(svg, /suggestion|inverseText|warning/)
  assert.throws(() => rowsToSvg([[{ text: 'a', color: 'nope' }]]), /nope/)
})

test('VR.gallery: DARK_KEYS previews in hex exactly the 12 ThemeKeys the default theme draws with', () => {
  const d = THEMES.default, used = new Set([...Object.values(d.roles), ...Object.values(d.series), d.onFill])
  assert.deepEqual(Object.keys(DARK_KEYS).sort(), [...used].sort())
  for (const [k, v] of Object.entries(DARK_KEYS)) assert.match(v, /^#[0-9a-f]{6}$/, k)
})

test('VR.gallery: a bold span sets font-weight and a dim span opacity, each on its own glyphs only', () => {
  const a = attrs(rowsToSvg([[{ text: 'B', bold: true }, { text: 'D', dimColor: true }, { text: 'p' }]], CELLS))
  assert.match(a.B!, /font-weight="bold"/); assert.doesNotMatch(a.B!, /opacity/)
  assert.match(a.D!, /opacity="0.5"/); assert.doesNotMatch(a.D!, /font-weight/)
  assert.doesNotMatch(a.p!, /font-weight|opacity|fill/)
})

test('VR.gallery: a dark page as wide as the widest row, glyphs in ui-monospace, Menlo, Consolas, monospace', () => {
  const svg = rowsToSvg([[{ text: 'ab' }], [{ text: '中中中' }]], CELLS)
  const [, w, h] = /<svg [^>]*width="(\d+)" height="(\d+)"/.exec(svg)!
  assert.deepEqual([Number(w) - 2 * PAD, Number(h) - 2 * PAD], [60, 40])
  assert.ok(svg.includes(`<rect width="${w}" height="${h}" fill="${BG}"/>`))
  assert.match(svg, /<g [^>]*font-family="ui-monospace, Menlo, Consolas, monospace"/)
})

test('VR.gallery: offGrid passes a true render, and reports a glyph moved off its cell and a dropped glyph', () => {
  const rows = [[{ text: '中a' }], [{ text: '─►', color: '#88C0D0' }]], svg = rowsToSvg(rows, CELLS)
  assert.deepEqual(offGrid(svg, rows, 10), [])
  assert.equal(offGrid(svg.replace('<text x="20"', '<text x="21"'), rows, 10).length, 1)
  assert.deepEqual(offGrid(svg.replace(/<text [^>]*>►<\/text>/, ''), rows, 10), ['expected 4 glyphs, found 3'])
})

// é is e + U+0301 COMBINING ACUTE ACCENT, one glyph; ​ is ZERO WIDTH SPACE, which draws nothing. Escapes, since a copy can lose either.
test('VR.gallery: offGrid passes a combining mark riding on its base, and a zero-width space that draws nothing', () => {
  const rows = [[{ text: 'éx​中y' }]]
  assert.deepEqual(offGrid(rowsToSvg(rows, CELLS), rows, 10), [])
})

const RENDER_SVG = fileURLToPath(new URL('../../scripts/render-svg.ts', import.meta.url))
const LR = 'flowchart LR\nA[alpha one] --> B[beta two] --> C[gamma three] --> D[delta four]\n'

// A temp dir, removed after the test, holding src as in.mmd; run spawns render-svg.ts with args, '@in' standing for in.mmd.
function cli(t: { after(fn: () => void): void }, src: string) {
  const dir = mkdtempSync(join(tmpdir(), 'mtty-svg-')), file = join(dir, 'in.mmd')
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  writeFileSync(file, src)
  const run = (...args: string[]) => spawnSync(process.execPath, [RENDER_SVG, ...args.map(a => (a === '@in' ? file : a))], { encoding: 'utf8' })
  return { out: join(dir, 'out.svg'), run }
}

test('VR.gallery: render-svg.ts FILE COLS THEME OUT.svg writes the SVG of the rows core draws at COLS under THEME, and exits 0', t => {
  const { out, run } = cli(t, LR), r = run('@in', '40', 'dracula', out)
  assert.equal(r.status, 0, r.stderr)
  assert.equal(readFileSync(out, 'utf8'), rowsToSvg(renderMermaid(LR, { columns: 40, theme: 'dracula' })!))
})

test('VR.gallery: render-svg.ts prints its usage and exits 2 on a missing OUT.svg, a bad COLS or an unknown THEME, writing nothing', t => {
  const { out, run } = cli(t, LR)
  for (const args of [['@in', '40', 'nord'], ['@in', 'wide', 'nord', out], ['@in', '40', 'neon', out]]) {
    const r = run(...args)
    assert.equal(r.status, 2, args.join(' ')); assert.match(r.stderr, /usage: node scripts\/render-svg\.ts FILE COLS THEME OUT\.svg/)
  }
  assert.equal(existsSync(out), false)
})

test('VR.gallery: render-svg.ts says so, exits 1 and writes nothing when core falls back', t => {
  const { out, run } = cli(t, 'no diagram here\n'), r = run('@in', '80', 'nord', out)
  assert.equal(r.status, 1); assert.match(r.stderr, /fell back/); assert.equal(existsSync(out), false)
})
