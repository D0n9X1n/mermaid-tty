// Bar glyph runs. A bar of e eighths is ⌊e/8⌋ full cells, then one partial cell when e mod 8 > 0. The glyphs are
// core/glyphs.ts's bar set: █ shows 8 eighths and a partial its index + 1, ▏…▉ growing right and ▁…▇ growing up, as
// validate counts them back.
const FULL = '█'
const PART = { h: [...'▏▎▍▌▋▊▉'], v: [...'▁▂▃▄▅▆▇'] } as const

// The cells of e ≥ 0 eighths on axis, from the bar's base out: its full cells, then its partial, if any.
function run(e: number, axis: 'h' | 'v'): string[] {
  const full = Array<string>(Math.floor(e / 8)).fill(FULL)
  const part = PART[axis][(e % 8) - 1]
  return part ? [...full, part] : full
}

// A horizontal bar of e ≥ 0 eighths, left to right. 0 is ''.
export const hbar = (e: number): string => run(e, 'h').join('')
// A vertical bar of 0 ≤ e ≤ 8·h eighths in a column of h cells: it grows up from the bottom cell, with blanks above it.
// The cells, top to bottom.
export function vbar(e: number, h: number): string[] {
  const bar = run(e, 'v')
  return [...Array<string>(h - bar.length).fill(' '), ...bar.toReversed()]
}
