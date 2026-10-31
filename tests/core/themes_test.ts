import test from 'node:test'
import assert from 'node:assert/strict'
import { THEMES, palette } from '../../core/themes.ts'
import { contrast, oklabDistance } from '../../core/color.ts'
import { paletteProblems } from '../../scripts/check-palettes.ts'
import type { ThemeName } from '../../core/themes.ts'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const R = ['node', 'decision', 'edge', 'arrow', 'label', 'frame', 'note'] as const
const T = {
  default: 'suggestion warning inactive claude text permission subtle',
  nord: '#88C0D0 #EBCB8B #D8DEE9 #BF616A #A3BE8C #B48EAD #5E81AC',
  dracula: '#8BE9FD #F1FA8C #F8F8F2 #FF79C6 #50FA7B #BD93F9 #FFB86C',
  gruvbox: '#83A598 #FABD2F #928374 #FB4934 #B8BB26 #D3869B #FE8019',
  solarized: '#268BD2 #B58900 #93A1A1 #CB4B16 #EEE8D5 #D33682 #2AA198',
}
test('A7: the 7 role colors under the default mapping and each palette', () => {
  for (const [t, cs] of Object.entries(T)) {
    cs.split(' ').forEach((c, i) => assert.equal(THEMES[t as 'nord'].roles[R[i]!], c, `${t}.${R[i]}`))
  }

  for (const r of R) {
    assert.equal(THEMES.mono.roles[r], null)
  }

  for (const p of Object.values(THEMES)) {
    assert.equal(Object.keys(p.series).length, 8)
  }

  assert.equal(palette('nope').name, 'default')
  assert.equal(THEMES.mono.fill, false)
})
test('VR.in-ci: color math and curated palettes', () => {
  assert.equal(Math.round(contrast('#000000', '#FFFFFF')), 21)
  assert.ok(Math.abs(oklabDistance('#000000', '#FFFFFF') - 1) < 0.01)
  assert.deepEqual(paletteProblems(), [])
})

// The rest of plan A's T5 table, per theme: background onFill title value s1…s8 ('-' is null).
const MORE = {
  default: '- inverseText text success suggestion success warning error merged claude permission planMode',
  nord: '#2E3440 #2E3440 #D08770 #81A1C1 #88C0D0 #A3BE8C #EBCB8B #D08770 #B48EAD #81A1C1 #BF616A #5E81AC',
  dracula: '#282A36 #282A36 #FF5555 #6272A4 #8BE9FD #50FA7B #F1FA8C #FFB86C #FF79C6 #BD93F9 #FF5555 #6272A4',
  gruvbox: '#282828 #282828 #EBDBB2 #458588 #83A598 #B8BB26 #FABD2F #FE8019 #FB4934 #D3869B #458588 #928374',
  solarized: '#002B36 #FDF6E3 #6C71C4 #859900 #268BD2 #859900 #B58900 #CB4B16 #93A1A1 #D33682 #6C71C4 #2AA198',
  mono: '- - - - - - - - - - - -',
}
test("A7: every field of every palette matches plan A's table", () => {
  for (const [t, more] of Object.entries(MORE)) {
    const [background, onFill, title, value, ...series] = more.split(' ').map((c) => (c === '-' ? null : c))
    const seven = t === 'mono' ? R.map(() => null) : T[t as 'nord'].split(' ')
    assert.deepEqual(
      THEMES[t as ThemeName],
      {
        name: t,
        background,
        onFill,
        fill: t !== 'mono',
        dim: [],
        roles: { ...Object.fromEntries(R.map((r, i) => [r, seven[i]])), title, value },
        series: Object.fromEntries(series.map((c, i) => [`s${i + 1}`, c])),
      },
      t,
    )
  }

  assert.deepEqual(Object.keys(THEMES).sort(), Object.keys(MORE).sort())
})
test('A7: palette() returns the named theme; any other name, inherited ones too, gives default', () => {
  for (const t of Object.keys(MORE)) {
    assert.equal(palette(t), THEMES[t as ThemeName], t)
  }

  for (const n of ['', 'nope', 'constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    assert.equal(palette(n), THEMES.default, n)
  }
})

// WCAG 2 references: each channel alone on black, the 4.5:1 grey #767676 on white, and the sRGB knee
// (a channel of 0x0A is on the linear segment, 0x0B on the curve).
test('VR.in-ci: contrast is the WCAG 2 ratio, in either order', () => {
  const cases = [
    ['#FF0000', '#000000', '5.2520'],
    ['#00FF00', '#000000', '15.3040'],
    ['#0000FF', '#000000', '2.4440'],
    ['#767676', '#FFFFFF', '4.5422'],
    ['#000000', '#FFFFFF', '21.0000'],
    ['#2E3440', '#2E3440', '1.0000'],
  ] as const
  for (const [a, b, want] of cases) {
    assert.equal(contrast(a, b).toFixed(4), want, `${a} ${b}`)
    assert.equal(contrast(b, a).toFixed(4), want, `${b} ${a}`)
  }

  assert.equal(contrast('#0A0A0A', '#000000').toFixed(6), '1.060705')
  assert.equal(contrast('#0B0B0B', '#000000').toFixed(6), '1.066931')
})
// The sRGB primaries in OKLab: red (0.62796, 0.22486, 0.12585), green (0.86644, -0.23389, 0.17950), blue (0.45201,
// -0.03246, -0.31153).
test('VR.in-ci: oklabDistance is the Euclidean distance in OKLab, in either order', () => {
  const cases = [
    ['#000000', '#FF0000', '0.6788'],
    ['#000000', '#00FF00', '0.9152'],
    ['#000000', '#0000FF', '0.5499'],
    ['#FF0000', '#00FF00', '0.5198'],
    ['#FF0000', '#0000FF', '0.5371'],
    ['#00FF00', '#0000FF', '0.6734'],
    ['#000000', '#FFFFFF', '1.0000'],
    ['#88C0D0', '#88C0D0', '0.0000'],
  ] as const
  for (const [a, b, want] of cases) {
    assert.equal(oklabDistance(a, b).toFixed(4), want, `${a} ${b}`)
    assert.equal(oklabDistance(b, a).toFixed(4), want, `${b} ${a}`)
  }
})

// THEMES with some colors replaced, keyed 'theme.ink': { 'nord.note': '#5D7EA9', 'dracula.background': null }.
type Inks = Record<string, string | null>
function broken(edits: Inks): typeof THEMES {
  const themes = structuredClone(THEMES)
  for (const [key, color] of Object.entries(edits)) {
    const [t = '', ink = ''] = key.split('.')
    const p = themes[t as ThemeName] as { background: string | null; roles: Inks; series: Inks }
    if (ink === 'background') {
      p.background = color
    } else if (Object.hasOwn(p.roles, ink)) {
      p.roles[ink] = color
    } else if (Object.hasOwn(p.series, ink)) {
      p.series[ink] = color
    } else {
      throw new Error(`no such ink: ${key}`)
    }
  }

  return themes
}

test('VR.in-ci: paletteProblems reports a low contrast and look-alike roles or series, first to last', () => {
  assert.deepEqual(
    paletteProblems(
      broken({
        'nord.node': '#2E3440',
        'dracula.value': '#8BE9FD',
        'gruvbox.s8': '#83A598',
        'solarized.value': '#002B36',
      }),
    ),
    [
      'nord.node #2E3440: contrast 1.00 < 3 on #2E3440',
      'dracula.node #8BE9FD ~ value #8BE9FD: OKLab distance 0.0000 < 0.08',
      'gruvbox.s1 #83A598 ~ s8 #83A598: OKLab distance 0.0000 < 0.08',
      'solarized.value #002B36: contrast 1.00 < 3 on #002B36',
    ],
  )
})
// Just under each limit. The curated palettes hold the other side: dracula.value has contrast 3.03, nord frame ~ value
// 0.0815.
test('VR.in-ci: the limits are contrast 3 and OKLab distance 0.08, for roles and series alike', () => {
  assert.deepEqual(
    paletteProblems(broken({ 'nord.note': '#5D7EA9', 'gruvbox.value': '#C0C9AA', 'solarized.s8': '#0071DD' })),
    [
      'nord.note #5D7EA9: contrast 2.99 < 3 on #2E3440',
      'gruvbox.title #EBDBB2 ~ value #C0C9AA: OKLab distance 0.0794 < 0.08',
      'solarized.s1 #268BD2 ~ s8 #0071DD: OKLab distance 0.0786 < 0.08',
    ],
  )
})
test('VR.in-ci: paletteProblems names each color that is not #rrggbb, and measures nothing else in that palette', () => {
  assert.deepEqual(
    paletteProblems(
      broken({
        'nord.node': '#88c0d0',
        'dracula.background': null,
        'gruvbox.node': '#83A59',
        'gruvbox.s8': 'suggestion',
        'solarized.value': '#85990G',
        'solarized.s1': '#268BD2F',
      }),
    ),
    [
      'dracula.background is not #rrggbb: null',
      'gruvbox.node is not #rrggbb: #83A59',
      'gruvbox.s8 is not #rrggbb: suggestion',
      'solarized.value is not #rrggbb: #85990G',
      'solarized.s1 is not #rrggbb: #268BD2F',
    ],
  )
})

const SCRIPT = fileURLToPath(new URL('../../scripts/check-palettes.ts', import.meta.url))
const run = (...pre: string[]) => spawnSync(process.execPath, [...pre, SCRIPT], { encoding: 'utf8' })
const cells = (line: string | undefined) => line?.trim().split(/\s+/)
// Columns are padded to their widest cell (solarized, background, decision); numbers align right.
test('VR.in-ci: check-palettes prints every checked color with its contrast and nearest neighbor, then ok, and exits 0', () => {
  const { status, stdout, stderr } = run()
  const lines = stdout.trimEnd().split(/\r?\n/)
  assert.equal(stderr, '')
  assert.equal(status, 0)
  assert.equal(lines.length, 1 + 4 * 18 + 1)
  assert.equal(lines[0], 'theme      ink         color    contrast  nearest   distance')
  assert.equal(lines[1], 'nord       background  #2E3440')
  assert.equal(lines[2], 'nord       node        #88C0D0      6.24  value       0.0847')
  assert.deepEqual(cells(lines[10]), ['nord', 'value', '#81A1C1', '4.64', 'frame', '0.0815'])
  assert.deepEqual(cells(lines[11]), ['nord', 's1', '#88C0D0', '6.24', 's6', '0.0847'])
  assert.deepEqual(cells(lines[72]), ['solarized', 's8', '#2AA198', '4.75', 's5', '0.1019'])
  assert.equal(lines[73], 'ok: nord, dracula, gruvbox, solarized pass: contrast >= 3, OKLab distance >= 0.08')
})
// The preload edits THEMES before the script reads it: nord.note takes the background's color, dracula loses its
// background.
test('VR.in-ci: check-palettes prints each problem on stderr, leaves malformed palettes out of the table, and exits 1', () => {
  const themes = new URL('../../core/themes.ts', import.meta.url).href
  const pre = `import { THEMES } from '${themes}'; THEMES.nord.roles.note = THEMES.nord.background; THEMES.dracula.background = null`
  const { status, stdout, stderr } = run('--import', 'data:text/javascript,' + encodeURIComponent(pre))
  const lines = stdout.trimEnd().split(/\r?\n/)
  assert.equal(stderr, 'nord.note #2E3440: contrast 1.00 < 3 on #2E3440\ndracula.background is not #rrggbb: null\n')
  assert.equal(status, 1)
  assert.equal(lines.length, 1 + 3 * 18)
  assert.deepEqual([...new Set(lines.slice(1).map((l) => cells(l)?.[0]))], ['nord', 'gruvbox', 'solarized'])
})
