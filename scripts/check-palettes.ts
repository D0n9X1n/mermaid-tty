// Checks the curated palettes: every role has contrast >= 3 against the palette's
// background, and every pair of roles, and every pair of series colors, is at least
// 0.08 apart in OKLab. `default` (theme keys) and `mono` (no color) are exempt.
// Usage: node scripts/check-palettes.ts  (prints the table; exits 1 on any problem)
import { contrast, oklabDistance } from '../core/color.ts'
import { THEMES } from '../core/themes.ts'
import type { Palette, ThemeName } from '../core/themes.ts'
import { isMain } from './lib/is-main.ts'

const CHECKED: readonly ThemeName[] = ['nord', 'dracula', 'gruvbox', 'solarized']
const MIN_CONTRAST = 3
const MIN_DISTANCE = 0.08
const HEX = /^#[0-9a-f]{6}$/i

type Swatch = readonly [ink: string, color: string]

// The inks whose color is not '#rrggbb'. Only a palette with none of them is measured.
const notHex = (p: Palette) =>
  Object.entries({ background: p.background, ...p.roles, ...p.series }).filter(([, c]) => !HEX.test(c ?? ''))
// A group's [ink, color] pairs, for a palette that notHex passed.
const swatches = (group: Readonly<Record<string, string | null>>) => Object.entries(group) as Swatch[]

// Each pair in the group, earlier ink first, that is closer than MIN_DISTANCE.
const alike = (t: string, group: readonly Swatch[]) =>
  group.flatMap(([a, x], i) =>
    group.slice(i + 1).flatMap(([b, y]) => {
      const d = oklabDistance(x, y)
      return d < MIN_DISTANCE ? [`${t}.${a} ${x} ~ ${b} ${y}: OKLab distance ${d.toFixed(4)} < ${MIN_DISTANCE}`] : []
    }),
  )

export function paletteProblems(themes: Readonly<Record<ThemeName, Palette>> = THEMES): string[] {
  return CHECKED.flatMap((t) => {
    const p = themes[t]
    const bad = notHex(p)
    if (bad.length) {
      return bad.map(([ink, c]) => `${t}.${ink} is not #rrggbb: ${c}`)
    }
    const bg = p.background!
    const roles = swatches(p.roles)
    return [
      ...roles.flatMap(([ink, c]) => {
        const k = contrast(c, bg)
        return k < MIN_CONTRAST ? [`${t}.${ink} ${c}: contrast ${k.toFixed(2)} < ${MIN_CONTRAST} on ${bg}`] : []
      }),
      ...alike(t, roles),
      ...alike(t, swatches(p.series)),
    ]
  })
}

// The ink in the group nearest to group[i] in OKLab; the first on a tie.
function nearest(group: readonly Swatch[], i: number): [string, number] {
  let best: [string, number] = ['', Infinity]
  group.forEach(([ink, c], j) => {
    const d = oklabDistance(group[i]![1], c)
    if (j !== i && d < best[1]) {
      best = [ink, d]
    }
  })
  return best
}

// A header, then for each palette notHex passed: its background, and each role and
// series color with its contrast on the background and the nearest ink of its group.
function table(themes: Readonly<Record<ThemeName, Palette>>): string {
  const rows = [['theme', 'ink', 'color', 'contrast', 'nearest', 'distance']]
  for (const t of CHECKED) {
    const p = themes[t]
    if (notHex(p).length) {
      continue
    }
    rows.push([t, 'background', p.background!])
    for (const group of [swatches(p.roles), swatches(p.series)]) {
      group.forEach(([ink, c], i) => {
        const [near, d] = nearest(group, i)
        rows.push([t, ink, c, contrast(c, p.background!).toFixed(2), near, d.toFixed(4)])
      })
    }
  }
  const widths = rows[0]!.map((_, k) => Math.max(...rows.map((r) => r[k]?.length ?? 0)))
  const numeric = new Set([3, 5]) // contrast and distance align right
  return rows
    .map((r) =>
      r
        .map((cell, k) => (numeric.has(k) ? cell.padStart(widths[k]!) : cell.padEnd(widths[k]!)))
        .join('  ')
        .trimEnd(),
    )
    .join('\n')
}

function main(): number {
  console.log(table(THEMES))
  const problems = paletteProblems()
  for (const p of problems) {
    console.error(p)
  }
  if (problems.length) {
    return 1
  }
  console.log(`ok: ${CHECKED.join(', ')} pass: contrast >= ${MIN_CONTRAST}, OKLab distance >= ${MIN_DISTANCE}`)
  return 0
}

// main() runs only when node is given this file, not when a test imports paletteProblems.
if (isMain(import.meta)) {
  process.exitCode = main()
}
