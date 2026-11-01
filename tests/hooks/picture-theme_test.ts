// A picture's theme: the Mermaid config each look draws with, and the text and line pairs it chooses, each readable.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import test from 'node:test'
import { contrast } from '../../core/color.ts'
import { THEMES } from '../../core/themes.ts'
import { brighten, LOOKS, pictureTheme, type Look } from '../../hooks/picture-theme.ts'
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
    // A border keeps the frame color where it reads on both canvas and surface; solarized's falls back.
    assert.equal(v.clusterBorder, look === 'solarized' ? p.onFill : p.roles.frame)
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

// Where Mermaid draws one color on more than the fill it was named for: a state's label on a composite state's title
// bar, an active or done task's label beside its bar, a timeline label on its section brightened 120%, a loop box's and
// a quadrant's borders across the surface.
test('the pairs follow every place Mermaid draws a color, not only the one its name suggests', () => {
  for (const look of CURATED) {
    const t = pictureTheme(look)
    const v = t.config.themeVariables!
    const has = (ink: unknown, on: unknown) => t.pairs.some((p) => p.ink === ink && p.on === on)
    const surface = THEMES[look].surface
    assert.ok(has(v.stateLabelColor, v.compositeTitleBackground), `${look} composite title`)
    for (const on of [v.activeTaskBkgColor, v.doneTaskBkgColor, surface, t.background]) {
      assert.ok(has(v.taskTextDarkColor, on), `${look} active and done task text on ${on}`)
    }

    for (const k of ['labelBoxBorderColor', 'quadrantInternalBorderStrokeFill', 'clusterBorder', 'gridColor']) {
      assert.ok(has(v[k], surface) && has(v[k], t.background), `${look} ${k} on surface and canvas`)
    }
  }
})

// Timeline draws its event groups through brightness(120%), which brightens the label along with its section: each look
// pairs every label, brightened, with its section brightened.
test('every timeline label reads on its section and, brightened, on its brightened event, in every look', () => {
  for (const look of LOOKS) {
    const t = pictureTheme(look)
    const v = t.config.themeVariables!
    for (let i = 0; i < 12; i++) {
      const label = v[`cScaleLabel${i}`] as string
      const fill = v[`cScale${i}`] as string
      assert.ok(
        t.pairs.some((p) => p.ink === label && p.on === fill),
        `${look} section ${i}`,
      )
      assert.ok(
        t.pairs.some((p) => p.ink === brighten(label, 1.2) && p.on === brighten(fill, 1.2)),
        `${look} event ${i}`,
      )
    }
  }
})

test("default's chart lines take Claude Code's series colors too, each readable on Mermaid's own plot", () => {
  for (const look of ['default-dark', 'default-light'] as const) {
    const t = pictureTheme(look)
    const xy = t.config.themeVariables!.xyChart as Record<string, string>
    assert.equal(Object.keys(xy).length, 13, look)
    for (const c of xy.plotColorPalette!.split(',')) {
      assert.ok(
        t.pairs.some((p) => p.ink === c && p.on === xy.backgroundColor),
        `${look} ${c}`,
      )
    }
  }
})

// The approved scope of the surface: subgraph and composite-state bodies, gantt section bands and the loop label tab.
test('a curated look fills with its surface only where the spec says', () => {
  const allowed = new Set([
    'tertiaryColor',
    'clusterBkg',
    'compositeBackground',
    'altBackground',
    'labelBoxBkgColor',
    'sectionBkgColor',
    'sectionBkgColor2',
    'excludeBkgColor',
  ])
  for (const look of CURATED) {
    const v = pictureTheme(look).config.themeVariables!
    const used = Object.entries(v).filter(([k, c]) => c === THEMES[look].surface && !/Text|Color$|Label/.test(k))
    assert.deepEqual(
      used.map(([k]) => k).filter((k) => !allowed.has(k)),
      [],
      look,
    )
  }
})

// Every theme variable the styles of the 13 drawn types read in Mermaid 11.17 and 12.2, and the families base derives
// from them: a curated look sets each, so nothing they draw is left for base to derive. Families only other types read
// (architecture, requirement, venn, event modeling, and base's own surface and surfacePeer steps) are left to base,
// since no picture mermaid-tty makes draws them.
const READ = [
  'activationBkgColor activationBorderColor activeTaskBkgColor activeTaskBorderColor actorBkg actorBorder',
  'actorLineColor actorTextColor altBackground altSectionBkgColor arrowheadColor background border2 classText',
  'clusterBkg clusterBorder commitLabelBackground commitLabelColor commitLineColor compositeBackground',
  'compositeTitleBackground critBkgColor critBorderColor doneTaskBkgColor doneTaskBorderColor edgeLabelBackground',
  'errorBkgColor errorTextColor excludeBkgColor faceColor gridColor innerEndBackground labelBackgroundColor',
  'labelBoxBkgColor labelBoxBorderColor labelTextColor lineColor loopTextColor mainBkg nodeBorder nodeTextColor',
  'noteBkgColor noteBorderColor noteTextColor pieLegendTextColor pieOuterStrokeColor pieSectionTextColor',
  'pieStrokeColor pieTitleTextColor primaryColor sectionBkgColor sectionBkgColor2 sequenceNumberColor signalColor',
  'signalTextColor specialStateColor stateBkg stateBorder stateLabelColor tagLabelBackground tagLabelBorder',
  'tagLabelColor taskBkgColor taskBorderColor taskTextClickableColor taskTextColor taskTextDarkColor',
  'taskTextOutsideColor tertiaryColor tertiaryTextColor textColor titleColor todayLineColor transitionColor',
  'transitionLabelColor vertLineColor secondaryBorderColor tertiaryBorderColor flowContainerStroke',
]
  .join(' ')
  .split(' ')

test('a curated look sets every theme variable the drawn types read', () => {
  for (const look of CURATED) {
    const v = pictureTheme(look).config.themeVariables!
    assert.deepEqual(
      READ.filter((k) => v[k] === undefined),
      [],
      look,
    )
    for (let i = 0; i < 12; i++) {
      assert.ok(v[`cScalePeer${i}`], `${look} cScalePeer${i}`)
    }
  }
})

// Mermaid draws a shape's outline, and the lines inside it (a cylinder's lid, a class's compartments, an entity's
// rows), in its border color over its own fill: a border the color of the fill hides them.
test("every filled shape's border reads on its fill, so a cylinder's lid and a class's compartments show", () => {
  const borders: [string, string][] = [
    ['nodeBorder', 'mainBkg'],
    ['primaryBorderColor', 'primaryColor'],
    ['stateBorder', 'stateBkg'],
    ['actorBorder', 'actorBkg'],
    ['noteBorderColor', 'noteBkgColor'],
    ['activationBorderColor', 'activationBkgColor'],
    ['secondaryBorderColor', 'secondaryColor'],
    ['taskBorderColor', 'taskBkgColor'],
    ['critBorderColor', 'critBkgColor'],
    ['tagLabelBorder', 'tagLabelBackground'],
  ]
  for (const look of CURATED) {
    const t = pictureTheme(look)
    const v = t.config.themeVariables!
    for (const [border, fill] of borders) {
      assert.ok(
        t.pairs.some((p) => p.ink === v[border] && p.on === v[fill]),
        `${look} ${border} on ${fill}: ${v[border]} on ${v[fill]}`,
      )
    }
  }
})
