// Layer A, the authority on what a picture may hold: the SVG mmdc drew for a source, checked before any PNG is made. An
// allowlist over a real tokenisation (a small XML scanner; Mermaid's output is well-formed XML), not a search for bad
// strings. svgUnsafe gives the first thing the SVG breaks, or null:
//   syntax       not one well-formed element tree: a tag that does not close or closes the wrong one, an attribute
//   twice,
//                unquoted or with a < in it, text outside the root
//   markup       anything but elements and text: a comment, CDATA, a DOCTYPE or DTD, a processing instruction (an XML
//                declaration is allowed only first)
//   element n    a name not on the list for its context, exactly (no prefix, any case): SVG_ELEMENTS outside a
//                foreignObject, HTML_ELEMENTS inside one; svg only as the root; nothing inside a <style>
//   namespace n a namespace declaration other than xmlns (SVG) and xmlns:xlink (XLink) on the root, or xmlns (XHTML) on
//   a
//                foreignObject's child
//   attribute n  a name not on the list for its context: SVG_ATTRIBUTES, or HTML_ATTRIBUTES inside a foreignObject
//   entity       an entity but &lt; &gt; &amp; &quot; &apos; or a numeric reference to a Unicode scalar value XML
//   allows
//   char         a control character but tab, LF and CR, or a lone surrogate
//   marker       Mermaid's entity-marker characters (U+FB02, U+00B6), decoded or not
//   css t        in any attribute value or <style> text: @import, @font-face, @namespace, a backslash, /*, image(,
//                image-set(, cross-fade(, element( or src(
//   url          in any attribute value or <style> text, a url( that is not exactly url(#id) (quotes optional)
// Values and text are decoded once, as XML does; text outside <style> may hold anything else. The lists are the names
// Mermaid 11 and 12 draw with for the fixtures that reach mmdc (tests/hooks/svg-corpus_test.ts keeps them exact).
// No Node, so the engine can load it.
const SVG_NS = 'http://www.w3.org/2000/svg'
const XLINK_NS = 'http://www.w3.org/1999/xlink'
const XHTML_NS = 'http://www.w3.org/1999/xhtml'
export const SVG_ELEMENTS: ReadonlySet<string> = new Set([
  'circle',
  'defs',
  'feDropShadow',
  'filter',
  'foreignObject',
  'g',
  'line',
  'linearGradient',
  'marker',
  'path',
  'polygon',
  'rect',
  'stop',
  'style',
  'svg',
  'switch',
  'symbol',
  'text',
  'title',
  'tspan',
])
export const HTML_ELEMENTS: ReadonlySet<string> = new Set(['br', 'div', 'p', 'span'])
export const SVG_ATTRIBUTES: ReadonlySet<string> = new Set([
  'alignment-baseline',
  'aria-roledescription',
  'class',
  'clip-rule',
  'cx',
  'cy',
  'd',
  'data-edge',
  'data-et',
  'data-from',
  'data-id',
  'data-look',
  'data-points',
  'data-to',
  'data-type',
  'dominant-baseline',
  'dx',
  'dy',
  'fill',
  'fill-rule',
  'filter',
  'flood-color',
  'flood-opacity',
  'font-family',
  'font-size',
  'font-weight',
  'gradientUnits',
  'height',
  'id',
  'marker-end',
  'marker-start',
  'markerHeight',
  'markerUnits',
  'markerWidth',
  'name',
  'offset',
  'opacity',
  'orient',
  'overflow',
  'points',
  'preserveAspectRatio',
  'r',
  'refX',
  'refY',
  'role',
  'rx',
  'ry',
  'stdDeviation',
  'stop-color',
  'stop-opacity',
  'stroke',
  'stroke-dasharray',
  'stroke-width',
  'style',
  'text-anchor',
  'transform',
  'transform-origin',
  'viewBox',
  'width',
  'x',
  'x1',
  'x2',
  'xml:space',
  'y',
  'y1',
  'y2',
])
export const HTML_ATTRIBUTES: ReadonlySet<string> = new Set(['class', 'style'])

const XML_DECL = /^<\?xml[ \t\r\n][^?<>]*\?>/
const OPEN = /<([A-Za-z][\w:.-]*)/y
const ATTR = /[ \t\r\n]+([^\s=/>"'<]+)[ \t\r\n]*=[ \t\r\n]*(?:"([^"<]*)"|'([^'<]*)')/y
const END = /[ \t\r\n]*(\/?)>/y
const CLOSE = /<\/([A-Za-z][\w:.-]*)[ \t\r\n]*>/y
const ENTITY = /&(?:(lt|gt|amp|quot|apos)|#([0-9]{1,7})|#x([0-9A-Fa-f]{1,6}));/y
const NAMED: Readonly<Record<string, string>> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }
const BAD_CHAR = /(?![\t\n\r])\p{Cc}|\p{Cs}/u
const MARKER = new RegExp(`[${String.fromCharCode(0xfb02)}${String.fromCharCode(0xb6)}]`)
const CSS: [string, RegExp][] = [
  ['@import', /@import/i],
  ['@font-face', /@font-face/i],
  ['@namespace', /@namespace/i],
  ['\\', /\\/],
  ['/*', /\/\*/],
  ['image-set(', /image-set\(/i],
  ['cross-fade(', /cross-fade\(/i],
  ['element(', /element\(/i],
  ['src(', /src\(/i],
  ['image(', /image\(/i],
]
const URL_REF = /^url\((?:#[A-Za-z_][\w.-]*|'#[A-Za-z_][\w.-]*'|"#[A-Za-z_][\w.-]*")\)/i

export function svgUnsafe(svg: string): string | null {
  const stack: string[] = []
  let roots = 0
  let i = XML_DECL.exec(svg)?.[0].length ?? 0
  while (i < svg.length) {
    const lt = svg.indexOf('<', i)
    const stop = lt < 0 ? svg.length : lt
    if (stop > i) {
      const r = text(svg.slice(i, stop), stack)
      if (r) {
        return r
      }
    }

    if (lt < 0) {
      break
    }

    i = lt
    if (svg.startsWith('</', i)) {
      CLOSE.lastIndex = i
      const m = CLOSE.exec(svg)
      if (!m || stack.pop() !== m[1]) {
        return 'syntax'
      }

      i = CLOSE.lastIndex
      continue
    }

    if (svg[i + 1] === '!' || svg[i + 1] === '?') {
      return 'markup'
    }

    OPEN.lastIndex = i
    const open = OPEN.exec(svg)
    if (!open) {
      return 'syntax'
    }

    i = OPEN.lastIndex
    const attrs = new Map<string, string>()
    for (;;) {
      ATTR.lastIndex = i
      const a = ATTR.exec(svg)
      if (!a) {
        break
      }

      if (attrs.has(a[1]!)) {
        return 'syntax'
      }

      attrs.set(a[1]!, a[2] ?? a[3]!)
      i = ATTR.lastIndex
    }

    END.lastIndex = i
    const end = END.exec(svg)
    if (!end) {
      return 'syntax'
    }

    i = END.lastIndex
    if (stack.length === 0 && roots++ > 0) {
      return 'syntax'
    }

    const r = element(open[1]!, attrs, stack)
    if (r) {
      return r
    }

    if (!end[1]) {
      stack.push(open[1]!)
    }
  }

  return roots === 1 && stack.length === 0 ? null : 'syntax'
}

// An element's name in its context, then each attribute's name and value.
function element(name: string, attrs: Map<string, string>, stack: string[]): string | null {
  const html = stack.includes('foreignObject')
  const parent = stack[stack.length - 1]
  // A <style> holds text only: an element in it would split the stylesheet into pieces each checked alone.
  if (parent === 'style') {
    return `element ${name} in style`
  }

  let known: boolean
  if (stack.length === 0) {
    known = name === 'svg'
  } else if (html) {
    known = HTML_ELEMENTS.has(name)
  } else {
    known = name !== 'svg' && SVG_ELEMENTS.has(name)
  }

  if (!known) {
    return `element ${name}`
  }

  for (const [a, v] of attrs) {
    if (a === 'xmlns' || a.startsWith('xmlns:')) {
      const ok =
        stack.length === 0
          ? (a === 'xmlns' && v === SVG_NS) || (a === 'xmlns:xlink' && v === XLINK_NS)
          : a === 'xmlns' && html && parent === 'foreignObject' && v === XHTML_NS
      if (!ok) {
        return `namespace ${a}`
      }

      continue
    }

    if (!(html ? HTML_ATTRIBUTES : SVG_ATTRIBUTES).has(a)) {
      return `attribute ${a}`
    }

    const r = value(v, true)
    if (r) {
      return r
    }
  }

  return null
}

// Text between tags: only whitespace outside the root; inside, a value, held to the CSS rules inside <style>.
function text(t: string, stack: string[]): string | null {
  if (stack.length === 0) {
    return /^[ \t\r\n]*$/.test(t) ? null : 'syntax'
  }

  return value(t, stack[stack.length - 1] === 'style')
}

// A value or text, decoded once; with css, also its CSS and url( rules.
function value(raw: string, css: boolean): string | null {
  const v = decode(raw)
  if (v === null) {
    return 'entity'
  }

  if (BAD_CHAR.test(v)) {
    return 'char'
  }

  if (MARKER.test(v)) {
    return 'marker'
  }

  if (!css) {
    return null
  }

  const t = CSS.find(([, re]) => re.test(v))
  if (t) {
    return `css ${t[0]}`
  }

  for (const m of v.matchAll(/url\(/gi)) {
    if (!URL_REF.test(v.slice(m.index))) {
      return 'url'
    }
  }

  return null
}

// s with each entity decoded once, as XML does; null on any & that does not start an entity XML defines, or a numeric
// reference to a code point XML does not allow (a C0 control but tab, LF and CR; a surrogate; U+FFFE, U+FFFF; past
// U+10FFFF).
function decode(s: string): string | null {
  let out = ''
  let i = 0
  for (let j = s.indexOf('&'); j >= 0; j = s.indexOf('&', i)) {
    ENTITY.lastIndex = j
    const m = ENTITY.exec(s)
    if (!m) {
      return null
    }

    let c: string
    if (m[1] !== undefined) {
      c = NAMED[m[1]]!
    } else {
      const code = m[2] !== undefined ? parseInt(m[2], 10) : parseInt(m[3]!, 16)
      const allowed =
        code === 9 ||
        code === 10 ||
        code === 13 ||
        (code >= 0x20 && code <= 0xd7ff) ||
        (code >= 0xe000 && code <= 0xfffd) ||
        (code >= 0x10000 && code <= 0x10ffff)
      if (!allowed) {
        return null
      }

      c = String.fromCodePoint(code)
    }

    out += s.slice(i, j) + c
    i = ENTITY.lastIndex
  }

  return out + s.slice(i)
}
