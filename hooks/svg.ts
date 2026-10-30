// Layer A, the authority on what a picture may hold: the SVG mmdc drew for a source, checked before any PNG is made.
// svgUnsafe gives why the SVG refers to anything outside itself, or holds anything that loads or runs, or null:
//   entity     an entity that is not one of amp, lt, gt, quot, apos or a numeric one for a real character, a Mermaid
//              entity marker left after decoding, or one that does not settle in a few rounds of decoding
//   backslash  a backslash (a CSS escape could spell anything)        comment  a CSS comment (it could split a word)
//   url        a url( that is not url(#...)                           href     an href or xlink:href not starting with #
//   token t    an element, scheme or CSS that loads or runs: <image, <img, src=, @import, <link, <script, <iframe, ...
//   slashes    // anywhere but the SVG, XLink and XHTML namespace declarations
// The text is decoded first (Mermaid's markers, then numeric and named entities, until it settles), so no spelling of
// a reference survives; all matching is case-blind. Rejecting too much keeps a diagram as text, never worse.
// No Node, so the engine can load it.
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const FL = String.fromCharCode(0xfb02), DEG = String.fromCharCode(0xb0), PIL = String.fromCharCode(0xb6), SZ = String.fromCharCode(0xdf)
const NUMERIC_MARK = new RegExp(`${FL}${DEG}${DEG}(\\d+)${PIL}${SZ}`, 'g'), NAMED_MARK = new RegExp(`${FL}${DEG}(\\w+)${PIL}${SZ}`, 'g')
const NAMESPACES = /\sxmlns(?::xlink)?\s*=\s*"http:\/\/www\.w3\.org\/(?:2000\/svg|1999\/xlink|1999\/xhtml)"/g
const TOKENS: [string, RegExp][] = [
  ['<image', /<image/], ['<img', /<img/], ['src=', /\bsrc\s*=/], ['srcset', /srcset/], ['@import', /@import/], ['@font-face', /@font-face/],
  ['<link', /<link/], ['<script', /<script/], ['<iframe', /<iframe/], ['<frame', /<frame/], ['<object', /<object/], ['<embed', /<embed/],
  ['<audio', /<audio/], ['<video', /<video/], ['<source', /<source/], ['<base', /<base\b/], ['<meta', /<meta/], ['<feimage', /<feimage/],
  ['<set', /<set\b/], ['<animate', /<animate/], ['xml:base', /xml:base/], ['javascript:', /javascript:/], ['vbscript:', /vbscript:/],
  ['file:', /file:/], ['data:', /data:/], ['image-set(', /image-set\s*\(/], ['image(', /\bimage\s*\(/], ['cross-fade(', /cross-fade\s*\(/],
  ['element(', /element\s*\(/], ['src(', /\bsrc\s*\(/], ['on*=', /[\s"'/]on[a-z]+\s*=/],
]

export function svgUnsafe(svg: string): string | null {
  const text = decode(svg)
  if (text === null) return 'entity'
  const s = text.replace(NAMESPACES, '').toLowerCase()
  if (s.includes('\\')) return 'backslash'
  if (s.includes('/*')) return 'comment'
  for (const m of s.matchAll(/url\s*\(/g)) if (!/^\s*['"]?\s*#/.test(s.slice(m.index! + m[0].length))) return 'url'
  for (const m of s.matchAll(/(?:^|[\s"'/])(?:xlink:)?href\s*=\s*(['"]?)\s*/g)) if (s[m.index! + m[0].length] !== '#') return 'href'
  const t = TOKENS.find(([, re]) => re.test(s))
  if (t) return `token ${t[0]}`
  return s.includes('//') ? 'slashes' : null
}

// The text with Mermaid's entity markers and every known entity decoded, round after round until it settles; null on
// an entity that is not known, a marker left over, or no settling within 4 rounds.
function decode(svg: string): string | null {
  let s = svg
  for (let round = 0; round < 4; round++) {
    let bad = false
    const next = s.replace(NUMERIC_MARK, '&#$1;').replace(NAMED_MARK, '&$1;')
      .replace(/&#(?:x([0-9a-f]+)|(\d+));?/gi, (_, hex: string | undefined, dec: string | undefined) => {
        const code = hex !== undefined ? parseInt(hex, 16) : Number(dec)
        if (!(code > 0 && code <= 0x10ffff)) { bad = true; return '' }
        return String.fromCodePoint(code)
      })
      .replace(/&([a-z][a-z0-9]*);/gi, (_, name: string) => { const c = NAMED[name.toLowerCase()]; if (c === undefined) bad = true; return c ?? '' })
      .replace(/&(amp|lt|gt|quot)(?![a-z0-9;])/gi, (_, name: string) => NAMED[name.toLowerCase()]!)
    if (bad || next.includes(FL)) return null
    if (next === s) return s
    s = next
  }
  return null
}
