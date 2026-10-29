import { isWide, width } from './width.ts'

// One piece of a wrapped line, and how it attaches to the previous piece: '' after
// a split between W/F characters, ' ' after a split at spaces. The first piece of
// every label line after the first joins with '\n', which the drawing code sets.
export type Piece = { text: string; join: '' | ' ' | '\n' }

// A label's lines: it breaks at <br>, <br/> or <br />, in any case. Two breaks in a
// row, or a break at the end, keep a blank line, as Mermaid's HTML does.
export function labelLines(label: string): string[] {
  return label.split(/<br\s*\/?>/i)
}

// Fills line greedily into pieces at most max columns wide (matrix, common rule 6).
// A token is a run of non-space characters, split only between two adjacent W/F
// characters, so a narrow character stays with its neighbors. A run of spaces is
// one space, and leading and trailing spaces drop. The result is never empty: a blank
// line is one empty piece, so every label line takes a row. null only if a token is
// wider than max.
export function wrap(line: string, max: number): Piece[] | null {
  // Each token, and whether a space came before it.
  const toks: { t: string; sp: boolean }[] = []
  let cur = '', sp = false, prevWide = false
  for (const ch of line) {
    if (ch === ' ') {
      if (cur) toks.push({ t: cur, sp })
      cur = ''; sp = true; prevWide = false
      continue
    }
    const w = isWide(ch.codePointAt(0)!)
    if (w && prevWide && cur) { toks.push({ t: cur, sp }); cur = ''; sp = false }
    cur += ch; prevWide = w
  }
  if (cur) toks.push({ t: cur, sp })
  const out: Piece[] = []
  for (const k of toks) {
    if (width(k.t) > max) return null
    const last = out.at(-1), sep = k.sp ? ' ' : ''
    if (last && width(last.text + sep + k.t) <= max) last.text += sep + k.t
    else out.push({ text: k.t, join: out.length ? sep : '' })
  }
  return out.length ? out : [{ text: '', join: '' }]
}
