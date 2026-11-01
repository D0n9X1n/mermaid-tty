// A picture's theme: the Mermaid config mmdc draws a look with, the background it paints, and the text and line pairs
// the config chooses, so a test can hold each one to contrast 3, the floor the text drawings meet.
//
// A curated palette (nord, dracula, gruvbox, solarized) draws on Mermaid's base theme with every color set: base
// derives what it is not given from intermediate values (a git commit's highlight from a lightened branch color, gantt
// text from a light textColor on a light fill), and those derived colors were what made the first trial unreadable. Its
// background is painted, so its colors keep the contrast they were chosen for on any terminal. default keeps Mermaid's
// own dark or light theme on a transparent background, following Claude Code, and changes only its series colors, to
// Claude Code's own. Every color is #rrggbb: Mermaid writes them into CSS, and khroma, which derives from them, takes
// no theme key. No Node, so the engine can load it.
import { contrast } from '../core/color.ts'
import { THEMES, type Palette } from '../core/themes.ts'

export const LOOKS = ['nord', 'dracula', 'gruvbox', 'solarized', 'default-dark', 'default-light'] as const
export type Look = (typeof LOOKS)[number]
export type Curated = 'nord' | 'dracula' | 'gruvbox' | 'solarized'

// One color drawn on another: text on its fill, or a line on the canvas. what names where Mermaid draws it.
export type Pair = { what: string; ink: string; on: string }

export type MermaidConfig = {
  securityLevel: 'strict'
  theme: 'base' | 'dark' | 'default'
  themeVariables: Record<string, unknown>
  // The colors journey draws its actors' dots in.
  journey: { actorColours: string[] }
}

export type PictureTheme = { config: MermaidConfig; background: string; pairs: Pair[] }

// The floor every pair meets: the same as the text drawings' roles on their background (scripts/check-palettes.ts).
const MIN = 3

// Claude Code 2.1.308's built-in dark and light themes, as hex: the series a default picture's charts cycle through, in
// the order the text drawings use them (core/themes.ts). Its dark theme gives permission the same color as suggestion,
// so the seventh is professionalBlue, as in light the ide blue; text and inverseText are the canvas text colors.
const CC = {
  'default-dark': {
    series: ['#b1b9f9', '#4eba65', '#ffc107', '#ff6b80', '#af87ff', '#d77757', '#6a9bcc', '#48968c'],
    text: '#ffffff',
    inverse: '#000000',
    // The terminal's canvas, which a transparent picture shows: black, or the near-black most dark themes use.
    canvas: ['#000000', '#1e1e1e'],
  },
  'default-light': {
    series: ['#5769f7', '#2c7a39', '#966c1e', '#ab2b3f', '#8700ff', '#d77757', '#4782c8', '#006666'],
    text: '#000000',
    inverse: '#ffffff',
    canvas: ['#ffffff'],
  },
} as const

// Records each pair a color takes part in while the config is built.
class Pairs {
  readonly list: Pair[] = []

  // ink on each of fills, recorded under what; returns ink.
  on(what: string, ink: string, ...fills: string[]): string {
    for (const on of fills) {
      if (!this.list.some((p) => p.ink === ink && p.on === on && p.what === what)) {
        this.list.push({ what, ink, on })
      }
    }

    return ink
  }
}

// The lowest contrast ink reaches on any of fills.
const worst = (ink: string, fills: readonly string[]) => Math.min(...fills.map((f) => contrast(ink, f)))

// The color for text that sits on every one of fills: prefer when it reaches MIN on all of them, so a role keeps its
// color where it can; else the candidate whose lowest contrast across them is highest, the first on a tie.
export function pick(prefer: string, candidates: readonly string[], fills: readonly string[]): string {
  if (worst(prefer, fills) >= MIN) {
    return prefer
  }

  let best = prefer
  for (const c of candidates) {
    if (worst(c, fills) > worst(best, fills)) {
      best = c
    }
  }

  return best
}

// The palette's colors any text may take, in a fixed order: its canvas, surface and fill text first.
function candidates(p: Palette): string[] {
  const all = [p.background, p.surface, p.onFill, ...Object.values(p.roles), ...Object.values(p.series)]
  return [...new Set(all.filter((c): c is string => c !== null))]
}

// series[i], cycling.
const cycle = (series: readonly string[], i: number) => series[i % series.length]!

// The series color the last of twelve scale slots takes. Mermaid colors every timeline connector with that slot's label
// color, on the canvas, so the slot's fill must leave one color readable on both: the first series color that does,
// else the one that comes closest.
function lastSlot(series: readonly string[], texts: readonly string[], canvas: readonly string[]): string {
  const reach = (fill: string) => Math.max(...texts.map((t) => worst(t, [fill, ...canvas])))
  return series.find((s) => reach(s) >= MIN) ?? series.reduce((a, b) => (reach(b) > reach(a) ? b : a))
}

// a toned toward b: t of a and the rest of b, channel by channel, as '#rrggbb'.
export function mix(a: string, b: string, t: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16)
  const hex = (i: number) =>
    Math.round(ch(a, i) * t + ch(b, i) * (1 - t))
      .toString(16)
      .padStart(2, '0')
  return `#${hex(0)}${hex(1)}${hex(2)}`.toUpperCase()
}

// The most of each series color (in steps of 0.05, from all of it) that leaves ink readable on every one toned toward
// the canvas.
function toneFor(series: readonly string[], canvas: string, ink: string): number {
  for (let t = 1; t > 0; t -= 0.05) {
    if (series.every((c) => contrast(ink, mix(c, canvas, t)) >= MIN)) {
      return Math.round(t * 100) / 100
    }
  }

  return 0
}

// The twelve scale slots timeline and mindmap fill their sections with: the series in turn, the last one lastSlot's.
function scale(series: readonly string[], texts: readonly string[], canvas: readonly string[]): string[] {
  return Array.from({ length: 12 }, (_, i) => (i === 11 ? lastSlot(series, texts, canvas) : cycle(series, i)))
}

// A curated palette's theme on Mermaid's base theme.
function curated(look: Curated): PictureTheme {
  const p = THEMES[look]
  const bg = p.background!
  const surface = p.surface!
  const fill = p.onFill!
  const r = p.roles as Record<keyof Palette['roles'], string>
  const series = Object.values(p.series) as string[]
  const all = candidates(p)
  const pairs = new Pairs()
  const text = (what: string, prefer: string, ...fills: string[]) => pairs.on(what, pick(prefer, all, fills), ...fills)
  // A line keeps its role color where it reads; else it takes the palette color that reads best, as text does.
  const line = text

  const v: Record<string, unknown> = {
    darkMode: true,
    background: bg,
    fontFamily: '"trebuchet ms", verdana, arial, sans-serif',
    dropShadow: 'none',
    useGradient: false,
  }

  // Nodes, and the edge labels Mermaid draws in the same text color: a label chip is filled like a node, so one color
  // reads on both.
  v.primaryColor = v.mainBkg = v.nodeBkg = v.primaryBorderColor = v.nodeBorder = r.node
  v.edgeLabelBackground = r.node
  v.nodeTextColor = v.primaryTextColor = text('node and edge label text', fill, r.node)
  v.secondaryColor = r.decision
  v.secondaryTextColor = text('secondary text', fill, r.decision)
  v.tertiaryColor = surface
  v.tertiaryTextColor = text('subgraph title', r.title, surface)
  v.lineColor = v.defaultLinkColor = line('edges', r.edge, bg)
  v.arrowheadColor = line('arrowheads', r.arrow, bg)
  // Text on the canvas, journey's task text on its toned sections among it: the palette's most readable color there.
  v.textColor = pairs.on('text on the canvas', [...all].sort((a, b) => contrast(b, bg) - contrast(a, bg))[0]!, bg)
  v.titleColor = text('titles', r.title, bg, surface)
  // Subgraphs, state groups and the like: the surface, framed.
  v.clusterBkg = v.compositeBackground = v.altBackground = surface
  v.clusterBorder = v.border2 = r.frame
  v.compositeTitleBackground = surface
  // Notes.
  v.noteBkgColor = v.noteBorderColor = r.note
  v.noteTextColor = text('note text', fill, r.note)

  // Sequence: actors like nodes, activations in the decision color, messages in the edge color. A loop box is lines;
  // only its label tab is filled.
  v.actorBkg = v.actorBorder = r.node
  v.actorTextColor = text('actor text', fill, r.node)
  v.actorLineColor = line('lifelines', r.edge, bg)
  v.signalColor = line('messages', r.edge, bg)
  v.signalTextColor = text('message text', r.label, bg)
  v.activationBkgColor = v.activationBorderColor = r.decision
  v.labelBoxBkgColor = surface
  v.labelBoxBorderColor = line('loop boxes', r.frame, bg)
  v.labelTextColor = text('loop label', r.frame, surface)
  v.loopTextColor = text('loop condition', r.label, bg)
  v.sequenceNumberColor = text('sequence number', bg, r.edge)

  // Class, state and ER.
  v.classText = text('class text', fill, r.node)
  v.stateBkg = r.node
  v.stateLabelColor = text('state text', fill, r.node)
  v.transitionColor = line('transitions', r.edge, bg)
  v.transitionLabelColor = text('transition label', fill, r.node)
  v.labelBackgroundColor = r.node
  v.specialStateColor = line('start and end states', r.edge, bg)
  v.innerEndBackground = r.node
  // ER attribute rows take the node text color, so both stripes are node-filled.
  v.rowOdd = v.rowEven = v.attributeBackgroundColorOdd = v.attributeBackgroundColorEven = r.node

  // Pie: the slices in series order, solid, one label color on all of them.
  const slices = Array.from({ length: 12 }, (_, i) => cycle(series, i))
  slices.forEach((c, i) => (v[`pie${i + 1}`] = c))
  v.pieSectionTextColor = text('pie labels', fill, ...slices)
  v.pieTitleTextColor = text('pie title', r.title, bg)
  v.pieLegendTextColor = text('pie legend', r.edge, bg)
  v.pieStrokeColor = bg
  v.pieOuterStrokeColor = line('pie outline', r.edge, bg)
  v.pieOpacity = '1'

  // gitGraph: a branch per series color, its label on it, and a highlight in the canvas color.
  for (let i = 0; i < 8; i++) {
    const c = series[i]!
    v[`git${i}`] = line(`branch ${i}`, c, bg)
    v[`gitBranchLabel${i}`] = text(`branch ${i} label`, fill, c)
    v[`gitInv${i}`] = bg
  }

  v.commitLabelBackground = surface
  v.commitLabelColor = text('commit labels', r.edge, surface)
  v.tagLabelBackground = v.tagLabelBorder = r.decision
  v.tagLabelColor = text('tag labels', fill, r.decision)

  // Timeline and mindmap: twelve slots, each label on its slot; the last slot's label also draws the connectors.
  const slots = scale(series, all, [bg])
  slots.forEach((c, i) => {
    v[`cScale${i}`] = c
    v[`cScaleInv${i}`] = bg
    v[`cScaleLabel${i}`] =
      i === 11 ? text('timeline connectors and last section', fill, c, bg) : text(`section ${i}`, fill, c)
  })

  // Journey: Mermaid draws its task text in textColor, the canvas text color, which also writes its legend on the
  // canvas. So each section is its series color toned toward the canvas, as dark themes tint a chip, as far as keeps
  // that text readable on every section.
  const tone = toneFor(series, bg, v.textColor as string)
  series.forEach((c, i) => {
    v[`fillType${i}`] = mix(c, bg, tone)
    pairs.on(`journey section ${i}`, v.textColor as string, mix(c, bg, tone))
  })

  series.slice(0, 6).forEach((c, i) => (v[`actor${i}`] = c))
  v.faceColor = r.decision

  // Gantt: sections banded in surface and canvas; tasks in node, active, done and critical colors.
  v.sectionBkgColor = v.sectionBkgColor2 = surface
  v.altSectionBkgColor = bg
  v.excludeBkgColor = surface
  v.taskBkgColor = v.taskBorderColor = r.node
  v.activeTaskBkgColor = v.activeTaskBorderColor = r.decision
  v.doneTaskBkgColor = v.doneTaskBorderColor = r.value
  v.critBkgColor = v.critBorderColor = r.arrow
  v.taskTextColor = v.taskTextLightColor = text('gantt task text', fill, r.node, r.arrow)
  v.taskTextDarkColor = text('gantt active and done task text', fill, r.decision, r.value)
  v.taskTextOutsideColor = text('gantt text beside a task', r.edge, surface, bg)
  v.taskTextClickableColor = text('gantt clickable task', r.label, surface, bg)
  v.gridColor = line('gantt grid', r.edge, bg)
  v.todayLineColor = line('gantt today line', r.arrow, bg)
  v.vertLineColor = line('gantt marker line', r.frame, bg)

  // Quadrant: the four quadrants in surface and canvas, points and text readable on both.
  v.quadrant1Fill = v.quadrant4Fill = surface
  v.quadrant2Fill = v.quadrant3Fill = bg
  for (let i = 1; i <= 4; i++) {
    v[`quadrant${i}TextFill`] = text(`quadrant ${i} text`, r.edge, i === 1 || i === 4 ? surface : bg)
  }

  v.quadrantPointFill = line('quadrant points', r.arrow, surface, bg)
  v.quadrantPointTextFill = text('quadrant point text', r.label, surface, bg)
  v.quadrantXAxisTextFill = v.quadrantYAxisTextFill = text('quadrant axes', r.edge, bg)
  v.quadrantInternalBorderStrokeFill = v.quadrantExternalBorderStrokeFill = line('quadrant borders', r.frame, bg)
  v.quadrantTitleFill = text('quadrant title', r.title, bg)

  // xychart: the plot on the canvas, every series line readable on it. Mermaid 11 replaces a partial object whole.
  const axis = text('chart axes', r.edge, bg)
  v.xyChart = {
    backgroundColor: bg,
    titleColor: text('chart title', r.title, bg),
    dataLabelColor: axis,
    legendTextColor: axis,
    xAxisTitleColor: axis,
    xAxisLabelColor: axis,
    xAxisTickColor: axis,
    xAxisLineColor: axis,
    yAxisTitleColor: axis,
    yAxisLabelColor: axis,
    yAxisTickColor: axis,
    yAxisLineColor: axis,
    plotColorPalette: series.map((c, i) => line(`chart series ${i + 1}`, c, bg)).join(','),
  }

  return {
    config: {
      securityLevel: 'strict',
      theme: 'base',
      themeVariables: v,
      journey: { actorColours: series.slice(0, 6) },
    },
    background: bg,
    pairs: pairs.list,
  }
}

// default's theme: Mermaid's dark or light one, with Claude Code's series colors and labels readable on them.
function standard(look: 'default-dark' | 'default-light'): PictureTheme {
  const cc = CC[look]
  const series = [...cc.series]
  const texts = [cc.text, cc.inverse]
  const pairs = new Pairs()
  const text = (what: string, ...fills: string[]) => pairs.on(what, pick(cc.inverse, texts, fills), ...fills)
  const v: Record<string, unknown> = {}

  const slices = Array.from({ length: 12 }, (_, i) => cycle(series, i))
  slices.forEach((c, i) => (v[`pie${i + 1}`] = c))
  v.pieSectionTextColor = text('pie labels', ...slices)
  v.pieOpacity = '1'

  for (let i = 0; i < 8; i++) {
    v[`git${i}`] = series[i]
    v[`gitBranchLabel${i}`] = text(`branch ${i} label`, series[i]!)
  }

  const slots = scale(series, texts, cc.canvas)
  slots.forEach((c, i) => {
    v[`cScale${i}`] = c
    v[`cScaleLabel${i}`] =
      i === 11 ? text('timeline connectors and last section', c, ...cc.canvas) : text(`section ${i}`, c)
  })

  // Journey keeps Mermaid's own section colors: its task text is the theme's canvas text color, which only Mermaid's
  // own fills were chosen for.

  return {
    config: {
      securityLevel: 'strict',
      theme: look === 'default-dark' ? 'dark' : 'default',
      themeVariables: v,
      journey: { actorColours: series.slice(0, 6) },
    },
    background: 'transparent',
    pairs: pairs.list,
  }
}

export function pictureTheme(look: Look): PictureTheme {
  return look === 'default-dark' || look === 'default-light' ? standard(look) : curated(look)
}

// The theme mmdc's -t names. mmdc 11 accepts no base, but the config file's theme wins over it.
export const mmdcTheme = (look: Look): 'dark' | 'default' => (look === 'default-light' ? 'default' : 'dark')
