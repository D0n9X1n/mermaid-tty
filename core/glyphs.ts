// The rule-12 glyph set, and the Box Drawing glyph for a cell's arms.
import { BOX } from './box-table.ts' // generated: arms 'urdl' (0 none, 1 light, 2 heavy) → glyph; 80 entries

export const boxGlyph = (arms: string): string => BOX[arms]! // arms is never '0000'

// dirs bits: 1 up, 2 right, 4 down, 8 left.
export function junction(dirs: number, w: 'light' | 'heavy' | 'dotted'): string {
  if (w === 'dotted' && (dirs === 1 || dirs === 4 || dirs === 5)) {
    return '┆'
  }
  if (w === 'dotted' && (dirs === 2 || dirs === 8 || dirs === 10)) {
    return '┄'
  }
  const k = w === 'heavy' ? '2' : '1' // a dashed line bends and branches light (rule 12)
  return boxGlyph([1, 2, 4, 8].map((b) => (dirs & b ? k : '0')).join(''))
}

const ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i))
const BOXES = Array.from({ length: 128 }, (_, i) => String.fromCharCode(0x2500 + i))
// The glyphs C's sections name (rule 12). None has the Emoji property.
const C_GLYPHS = [
  ...'▏▎▍▌▋▊▉█▁▂▃▄▅▆▇', // bars: horizontal ▏…█, vertical ▁…█ (spec C rule 5)
  ...'✓▸◆·', // gantt: done and active status cells, the milestone, the timing's separator
  ...'■○△□', // xychart: the line markers ●◆▲■○◇△□ not listed above
  ...'▷◁▽«»', // class: triangle ends, with △ above; «annotation»
  ...'⊗◎', // gitGraph: reverse and cherry-pick commits; highlight is ■ above
  ...'↑↓', // quadrant: before the top and bottom axis texts
]
export const GLYPHS: ReadonlySet<string> = new Set([...ASCII, ...BOXES, ...'►◄▲▼◇●◉', ...C_GLYPHS])
export const isAllowed = (g: string): boolean => GLYPHS.has(g)
