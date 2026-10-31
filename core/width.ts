import { WIDE } from './width-table.ts'

// Terminal columns: East Asian Width W and F count 2; combining marks (Mn, Me),
// the zero-width characters and core/emphasis.ts's markers (U+0001–U+0003, which
// unsupported() rejects in source text) count 0; everything else counts 1.
const ZERO = /[\p{Mn}\p{Me}\x01-\x03\u{200B}\u{200C}\u{2060}\u{FEFF}]/u
// Unsupported: ZWJ, every variation selector (R4), regional indicators, emoji
// modifiers and control characters, which terminals draw at differing widths.
const BAD = /[\u{200D}\u{FE00}-\u{FE0F}\u{E0100}-\u{E01EF}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\p{Cc}]/u
const FORMAT = /\p{Cf}/u

export function isWide(cp: number): boolean {
  let lo = 0
  let hi = WIDE.length / 2 - 1
  while (lo <= hi) {
    const m = (lo + hi) >> 1
    if (cp < WIDE[2 * m]!) {
      hi = m - 1
    } else if (cp > WIDE[2 * m + 1]!) {
      lo = m + 1
    } else {
      return true
    }
  }

  return false
}

export function width(s: string): number {
  let w = 0
  for (const ch of s) {
    if (!ZERO.test(ch)) {
      w += isWide(ch.codePointAt(0)!) ? 2 : 1
    }
  }

  return w
}

// The first code point that makes `s` unsupported, as 'U+XXXX', or null. Format
// characters (Cf) other than the zero-width ones are unsupported too.
export function unsupported(s: string): string | null {
  for (const ch of s) {
    if (BAD.test(ch) || (FORMAT.test(ch) && !ZERO.test(ch))) {
      return 'U+' + ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')
    }
  }

  return null
}
