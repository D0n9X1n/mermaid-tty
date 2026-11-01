// A picture's theme: the Mermaid config each look draws with, and the text and line pairs it chooses, each readable.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import test from 'node:test'
import { contrast } from '../../core/color.ts'
import { THEMES } from '../../core/themes.ts'
import { LOOKS, pictureTheme, type Look } from '../../hooks/picture-theme.ts'
import { CC_DARK } from '../../scripts/lib/palette.ts'

const CURATED = ['nord', 'dracula', 'gruvbox', 'solarized'] as const
const HEX = /^#[0-9A-Fa-f]{6}$/
// Values in the config that are not colors: Mermaid reads them as a mode, a font, an opacity or a CSS filter.
const NOT_COLORS = new Set(['darkMode', 'fontFamily', 'pieOpacity', 'dropShadow', 'useGradient'])

// Every [path, value] leaf of the config's colors: themeVariables (xyChart's fields included) and journey's lists.
function colors(look: Look): [string, unknown][] {
  const { config } = pictureTheme(look)
  const vars = Object.entries(config.themeVariables ?? {}).flatMap(([k, v]): [string, unknown][] => {
    if (NOT_COLORS.has(k)) {
      return []
    }

    if (k === 'xyChart') {
      return Object.entries(v as object).flatMap(([x, c]): [string, unknown][] =>
        x === 'plotColorPalette'
          ? String(c)
              .split(',')
              .map((p, i) => [`xyChart.plotColorPalette.${i}`, p])
          : [[`xyChart.${x}`, c]],
      )
    }

    return [[k, v]]
  })
  const lists = Object.entries(config.journey ?? {}).filter(([, v]) => Array.isArray(v))
  const journey = lists.flatMap(([k, list]) =>
    (list as unknown[]).map((c, i): [string, unknown] => [`journey.${k}.${i}`, c]),
  )
  return [...vars, ...journey]
}

test('the looks: the four curated palettes, and default in dark and in light', () => {
  assert.deepEqual([...LOOKS], ['nord', 'dracula', 'gruvbox', 'solarized', 'default-dark', 'default-light'])
})

test("a curated look draws on Mermaid's base theme, its own background painted, strict as ever", () => {
  for (const look of CURATED) {
    const t = pictureTheme(look)
    assert.equal(t.config.securityLevel, 'strict')
    assert.equal(t.config.theme, 'base')
    assert.equal(t.background, THEMES[look].background)
    assert.equal(t.config.themeVariables?.background, THEMES[look].background)
    assert.equal(t.config.themeVariables?.darkMode, true, look)
  }
})

test("default keeps Mermaid's dark or light theme on a transparent background, with Claude Code's series colors", () => {
  const dark = pictureTheme('default-dark')
  const light = pictureTheme('default-light')
  assert.deepEqual([dark.config.theme, dark.background], ['dark', 'transparent'])
  assert.deepEqual([light.config.theme, light.background], ['default', 'transparent'])
  assert.equal(dark.config.themeVariables?.pie1, CC_DARK.suggestion)
  assert.equal(dark.config.themeVariables?.git1, CC_DARK.success)
})

test('the series colors of default-dark are the ones scripts/lib/palette.ts names for the dark theme', () => {
  // hooks/ can't import scripts/, so the hook keeps its own copy; this keeps the two the same.
  const dark = pictureTheme('default-dark').config.themeVariables!
  const named = ['suggestion', 'success', 'warning', 'error', 'merged', 'claude', 'professionalBlue', 'planMode']
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7, 8].map((i) => dark[`pie${i}`]),
    named.map((k) => CC_DARK[k]),
  )
})

test('every color the config holds is #rrggbb, so no value can reach past the CSS Mermaid writes it into', () => {
  for (const look of LOOKS) {
    for (const [path, value] of colors(look)) {
      assert.match(String(value), HEX, `${look} ${path}`)
    }
  }
})

test('a curated look sets every color Mermaid would otherwise derive from what it was given', () => {
  for (const look of CURATED) {
    const v = pictureTheme(look).config.themeVariables!
    for (let i = 0; i < 12; i++) {
      for (const k of ['cScale', 'cScaleLabel', 'cScaleInv']) {
        assert.ok(v[`${k}${i}`], `${look} ${k}${i}`)
      }

      assert.ok(v[`pie${i + 1}`], `${look} pie${i + 1}`)
    }

    for (let i = 0; i < 8; i++) {
      for (const k of ['git', 'gitInv', 'gitBranchLabel', 'fillType']) {
        assert.ok(v[`${k}${i}`], `${look} ${k}${i}`)
      }
    }

    for (const k of [
      'taskBkgColor',
      'taskTextColor',
      'taskTextDarkColor',
      'taskTextOutsideColor',
      'activeTaskBkgColor',
      'doneTaskBkgColor',
      'critBkgColor',
      'sectionBkgColor',
      'sectionBkgColor2',
      'altSectionBkgColor',
      'excludeBkgColor',
      'gridColor',
      'todayLineColor',
      'actor0',
      'actor5',
      'faceColor',
    ]) {
      assert.ok(v[k], `${look} ${k}`)
    }

    assert.equal(v.pieOpacity, '1')
    assert.equal(v.dropShadow, 'none')
    // Mermaid 11 replaces a partial xyChart object whole, so every field is sent.
    assert.equal(Object.keys(v.xyChart as object).length, 13, look)
  }
})

test('every text and line pair the theme chooses has contrast 3 or more, the floor text drawings meet', () => {
  for (const look of LOOKS) {
    const t = pictureTheme(look)
    assert.ok(t.pairs.length > 20, `${look}: ${t.pairs.length} pairs`)
    for (const p of t.pairs) {
      const k = contrast(p.ink, p.on)
      assert.ok(k >= 3, `${look} ${p.what}: ${p.ink} on ${p.on} is ${k.toFixed(2)}`)
    }
  }
})

test('the pairs cover the colors Mermaid shares between two places, where one variable must read on both', () => {
  for (const look of CURATED) {
    const t = pictureTheme(look)
    const v = t.config.themeVariables!
    const has = (ink: unknown, on: unknown) => t.pairs.some((p) => p.ink === ink && p.on === on)
    // Edge labels: Mermaid draws their text in nodeTextColor, on edgeLabelBackground.
    assert.ok(has(v.nodeTextColor, v.edgeLabelBackground), `${look} edge label`)
    // Timeline connectors: the last cScaleLabel colors every connector line, on the canvas.
    assert.ok(has(v.cScaleLabel11, t.background), `${look} timeline connector`)
    assert.ok(has(v.cScaleLabel11, v.cScale11), `${look} last timeline section`)
    // Pie labels: one color on every slice.
    for (let i = 1; i <= 12; i++) {
      assert.ok(has(v.pieSectionTextColor, v[`pie${i}`]), `${look} pie${i}`)
    }

    // xychart: every series line on the plot.
    for (const c of String((v.xyChart as { plotColorPalette: string }).plotColorPalette).split(',')) {
      assert.ok(has(c, (v.xyChart as { backgroundColor: string }).backgroundColor), `${look} xy series ${c}`)
    }
  }
})

test('a curated look uses its palette: node fills, edges, titles, series, and its surface for subgraphs', () => {
  for (const look of CURATED) {
    const p = THEMES[look]
    const v = pictureTheme(look).config.themeVariables!
    assert.equal(v.mainBkg, p.roles.node)
    assert.equal(v.lineColor, p.roles.edge)
    assert.equal(v.noteBkgColor, p.roles.note)
    assert.equal(v.clusterBkg, p.surface)
    assert.equal(v.clusterBorder, p.roles.frame)
    assert.equal(v.edgeLabelBackground, p.roles.node)
    assert.equal(v.pie1, p.series.s1)
    assert.equal(v.git0, p.series.s1)
  }
})

// The reviewed configs: a change to any look's colors shows up here, and is regenerated with UPDATE_GOLDEN=1.
test('each look matches its reviewed config in goldens/pictures', () => {
  for (const look of LOOKS) {
    const path = `goldens/pictures/${look}.json`
    const got = `${JSON.stringify(pictureTheme(look), null, 2)}\n`
    if (process.env.UPDATE_GOLDEN === '1') {
      writeFileSync(path, got)
    }

    assert.equal(got, readFileSync(path, 'utf8'), path)
  }
})
