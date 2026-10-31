import test from 'node:test'
import assert from 'node:assert/strict'
import { svgUnsafe } from '../../hooks/svg.ts'

// Layer A, an allowlist over a tokenised SVG: exact element and attribute names (those Mermaid draws with), namespace
// declarations only where Mermaid puts them, entities decoded once as XML does, no markup but elements and text, and no
// reference outside the document. CLEAN is the shape of Mermaid's own output.
const ch = (n: number) => String.fromCharCode(n)
const NS = 'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"'
const XHTML = 'xmlns="http://www.w3.org/1999/xhtml"'
const doc = (inner: string, root = NS) =>
  `<svg ${root} width="100%" id="my-svg"><style>#my-svg{fill:#ccc;}@keyframes dash{to{stroke-dashoffset:0;}}</style><g>${inner}</g></svg>`
const CLEAN = doc(
  '<defs><marker id="arrowhead" refX="5"><path d="M0,0L10,5z"/></marker></defs><path marker-end="url(#arrowhead)" style="fill:none;"/>' +
    '<text xml:space="preserve">A &amp; B &lt;ok&gt; &quot;q&quot; &apos;a&apos; &#10; &#x41;</text>' +
    `<foreignObject width="10"><div ${XHTML} style="display: table-cell;"><span class="nodeLabel"><p>start<br /></p></span></div></foreignObject>`,
)

test('A6.hook-tests: Mermaid-shaped SVG passes, with url(#id) in any quotes, an XML declaration, or no namespace declarations', () => {
  assert.equal(svgUnsafe(CLEAN), null)
  assert.equal(svgUnsafe('<?xml version="1.0" encoding="UTF-8"?>\n' + CLEAN), null)
  assert.equal(svgUnsafe(doc(`<rect fill="url('#a')" style="fill:url(&quot;#a&quot;)"/>`)), null)
  assert.equal(svgUnsafe('<svg><style>.a{fill:url("#b.c-d_e")}</style><path marker-end="url(#a)"/></svg>'), null)
})

// The review's five canned inputs, each of which the deny-list passed, and the extras it named.
test("A5.errors: the review's five canned SVGs are unsafe", () => {
  for (const [svg, reason] of [
    [doc('<use href=" xmlns=&quot;http://www.w3.org/2000/svg&quot;#x"/>'), 'element use'], // 1: a namespace in a value
    [doc('<rect fill=" xmlns=&quot;http://www.w3.org/2000/svg&quot; url(other.svg)"/>'), 'url'],
    [doc('<path marker-end="url(&#160;#x)"/>'), 'url'], // 2: NBSP
    [doc(`<path marker-end="url('&#160;#x')"/>`), 'url'],
    [doc('<rect href="&#160;#x"/>'), 'attribute href'],
    [
      doc(
        '<xlink:script>1</xlink:script>',
        'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/2000/svg"',
      ),
      'namespace xmlns:xlink',
    ], // 3
    [doc('<xlink:script>1</xlink:script>'), 'element xlink:script'],
    [doc(`<foreignObject><table ${XHTML} background="other.png"/></foreignObject>`), 'element table'], // 4
    [doc(`<foreignObject><div ${XHTML} background="other.png"/></foreignObject>`), 'attribute background'],
    ['<!DOCTYPE svg [<!ENTITY _u "u">]>' + doc('<rect fill="&_u;rl(other.svg#paint)"/>'), 'markup'], // 5
    [doc('<rect fill="&_u;rl(other.svg#paint)"/>'), 'entity'],
    [doc('<rect fill="&constructor;"/>'), 'entity'],
    [doc('<text>&constructor;</text>'), 'entity'],
    [doc('<rect fill="&#55296;"/>'), 'entity'],
    [doc('<text>&#xD800;</text>'), 'entity'],
    [doc('<text>&#182;&#223;</text>'), 'marker'],
    [doc(`<text>${ch(0xb6)}${ch(0xdf)}</text>`), 'marker'],
    [doc(`<rect id="a${ch(0xfb02)}"/>`), 'marker'],
  ] as const) {
    assert.equal(svgUnsafe(svg), reason, svg)
  }
})

test('A5.errors: an element inside <style> is unsafe, so its text is checked whole (review: @im<g/>port)', () => {
  assert.equal(
    svgUnsafe('<svg xmlns="http://www.w3.org/2000/svg"><style>@im<g/>port "other.css";</style></svg>'),
    'element g in style',
  )
  assert.equal(
    svgUnsafe('<svg xmlns="http://www.w3.org/2000/svg"><style>a{fill:u<tspan></tspan>rl(x)}</style></svg>'),
    'element tspan in style',
  )
  assert.equal(svgUnsafe('<svg xmlns="http://www.w3.org/2000/svg"><style>a{fill:url(#m)}</style></svg>'), null)
})
test('A5.errors: an element not on the list, a prefixed one, or one in the wrong context is unsafe', () => {
  for (const el of [
    'use',
    'image',
    'script',
    'set',
    'animate',
    'feImage',
    'a',
    'iframe',
    'svg:set',
    'x:image',
    'Rect',
    'div',
  ]) {
    assert.equal(svgUnsafe(doc(`<${el}/>`)), `element ${el}`, el)
  }
  assert.equal(svgUnsafe(doc('<svg/>')), 'element svg')
  assert.equal(svgUnsafe(doc('<foreignObject><rect/></foreignObject>')), 'element rect')
  assert.equal(svgUnsafe(doc(`<foreignObject><div ${XHTML}><img/></div></foreignObject>`)), 'element img')
  assert.equal(svgUnsafe('<g></g>'), 'element g')
})

test('A5.errors: an attribute not on the list, or a namespace declaration anywhere but where Mermaid puts it, is unsafe', () => {
  for (const [svg, reason] of [
    [doc('<rect xlink:href="#x"/>'), 'attribute xlink:href'],
    [doc('<rect onload="f()"/>'), 'attribute onload'],
    [doc('<rect src="x"/>'), 'attribute src'],
    [doc('<rect FILL="red"/>'), 'attribute FILL'],
    [doc('<g/>', 'xmlns="http://www.w3.org/1999/xhtml"'), 'namespace xmlns'],
    [doc('<g/>', 'xmlns:foo="x"'), 'namespace xmlns:foo'],
    [doc('<g xmlns="http://www.w3.org/2000/svg"/>'), 'namespace xmlns'],
    [doc('<foreignObject><div xmlns="http://www.w3.org/2000/svg"/></foreignObject>'), 'namespace xmlns'],
    [doc(`<foreignObject><div ${XHTML}><span ${XHTML}/></div></foreignObject>`), 'namespace xmlns'],
    [doc(`<foreignObject><div ${XHTML} id="x"/></foreignObject>`), 'attribute id'],
  ] as const) {
    assert.equal(svgUnsafe(svg), reason, svg)
  }
})

test('A5.errors: comments, CDATA, a DTD and processing instructions are unsafe; so is an XML declaration not first', () => {
  for (const svg of [
    doc('<!-- x -->'),
    doc('<style><![CDATA[a{}]]></style>'),
    '<!DOCTYPE svg>' + CLEAN,
    doc('<?php x?>'),
    '<?xml-stylesheet href="x.css"?>' + CLEAN,
    ' <?xml version="1.0"?>' + CLEAN,
    CLEAN + '<!-- x -->',
  ]) {
    assert.equal(svgUnsafe(svg), 'markup', svg)
  }
})

test('A5.errors: an entity XML does not define, a raw &, a control character or a lone surrogate is unsafe', () => {
  for (const [svg, reason] of [
    [doc('<text>a & b</text>'), 'entity'],
    [doc('<rect id="a&b"/>'), 'entity'],
    [doc('<text>&lpar;</text>'), 'entity'],
    [doc('<text>&#1;</text>'), 'entity'],
    [doc('<text>&#xFFFE;</text>'), 'entity'],
    [doc('<text>&#1114112;</text>'), 'entity'],
    [doc(`<text>a${ch(1)}</text>`), 'char'],
    [doc(`<text>a${ch(0xd800)}</text>`), 'char'],
    [doc(`<rect id="a${ch(0xdc00)}"/>`), 'char'],
  ] as const) {
    assert.equal(svgUnsafe(svg), reason, svg)
  }
})

test('A5.errors: a url( that is not exactly url(#id), or CSS that loads, escapes or hides, is unsafe in <style> and in values', () => {
  for (const [svg, reason] of [
    [doc('<rect fill="url(other.svg#paint)"/>'), 'url'],
    [doc('<rect fill="URL(x)"/>'), 'url'],
    [doc('<rect fill="url( #a)"/>'), 'url'],
    [doc('<rect fill="url(#a )"/>'), 'url'],
    [doc('<rect fill="url(\'#a&quot;)"/>'), 'url'],
    [doc('<rect fill="url(#)"/>'), 'url'],
    ['<svg><style>.a{background:url(file:///tmp/x.svg)}</style></svg>', 'url'],
    ['<svg><style>.a{fill:url(&#35;a)}</style></svg>', null],
  ] as const) {
    assert.equal(svgUnsafe(svg), reason, svg)
  }
  for (const token of [
    '@import',
    '@font-face',
    '@namespace',
    '\\',
    '/*',
    'image(',
    'image-set(',
    'cross-fade(',
    'element(',
    'src(',
  ] as const) {
    assert.equal(svgUnsafe(`<svg><style>.a{x:${token}y}</style></svg>`), `css ${token}`, token)
    assert.equal(svgUnsafe(doc(`<rect style="x:${token.replace('\\', '&#92;')}y"/>`)), `css ${token}`, token)
  }
  assert.equal(svgUnsafe('<svg><style>.a{x:-webkit-IMAGE-SET(y)}</style></svg>'), 'css image-set(')
})

test('A5.errors: malformed XML is unsafe', () => {
  for (const svg of [
    '',
    '<svg>',
    doc('<g>'),
    doc('</g>'),
    CLEAN + CLEAN,
    CLEAN + 'x',
    'x' + CLEAN,
    doc('<rect fill=red/>'),
    doc('<rect fill="a" fill="b"/>'),
    doc('<rect fill="a<b"/>'),
    doc('<rect fill="a"x="1"/>'),
    doc('<rect fill = "a" / >'),
    doc(`<rect${ch(0xa0)}fill="a"/>`),
  ]) {
    assert.equal(svgUnsafe(svg), 'syntax', JSON.stringify(svg))
  }
})
