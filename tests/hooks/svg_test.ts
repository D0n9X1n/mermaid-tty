import test from 'node:test'
import assert from 'node:assert/strict'
import { svgUnsafe } from '../../hooks/svg.ts'

// Layer A: the SVG mmdc draws is the authority. After decoding entities (numeric, named, and Mermaid's own markers) it
// must refer to nothing outside itself: url( only as url(#...), href only as #..., and none of the elements, schemes or
// CSS that load anything. CLEAN is the shape of Mermaid's own output (namespaces, a <style>, arrowhead markers, an
// HTML label in a foreignObject, entities).
const ch = (n: number) => String.fromCharCode(n)
const MARK = (code: number) => `${ch(0xfb02)}${ch(0xb0)}${ch(0xb0)}${code}${ch(0xb6)}${ch(0xdf)}`
const CLEAN = '<svg id="my-svg" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100%">'
  + '<style>#my-svg{font-family:"trebuchet ms",verdana,arial;fill:#ccc;}#my-svg .marker{fill:#333;}</style>'
  + '<marker id="my-svg_flowchart-pointEnd" viewBox="0 0 10 10"><path d="M 0 0 L 10 5 L 0 10 z"/></marker>'
  + '<path d="M1,2L3,4" marker-end="url(#my-svg_flowchart-pointEnd)" style="fill:none;"/><use href="#x"/>'
  + '<a href="#top"><text>A &amp; B &lt;ok&gt; &quot;q&quot; &#10;</text></a>'
  + '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><span class="nodeLabel">start</span></div></foreignObject></svg>'
const at = (inner: string) => CLEAN.replace('</svg>', `${inner}</svg>`)

test('A6.hook-tests: Mermaid-shaped SVG with only url(#...) markers and #... links is safe', () => {
  assert.equal(svgUnsafe(CLEAN.replace('<use href="#x"/>', '')), null)
  assert.equal(svgUnsafe(at('<rect style="fill: url( #grad )"/><a xlink:href="#a">x</a>')), null)
})

test('A5.errors: a reference outside the SVG, however spelled, is unsafe', () => {
  for (const [inner, reason] of [
    ['<rect fill="url(/asset.svg#paint)"/>', 'url'],
    ["<style>.a{background:url('file:///tmp/x.svg')}</style>", 'url'],
    ['<rect fill="&#117;rl(/asset.svg)"/>', 'url'],
    ['<rect fill="&#x75;rl(/asset.svg)"/>', 'url'],
    [`<rect fill="${MARK(117)}rl(/asset.svg)"/>`, 'url'],
    ['<rect fill="&amp;#117;rl(/asset.svg)"/>', 'url'],
    ['<a xlink:href="/asset.svg">x</a>', 'href'],
    ['<a href="/asset.svg">x</a>', 'href'],
    ['<a href=/asset.svg>x</a>', 'href'],
    ['<a href="&#47;asset.svg">x</a>', 'href'],
  ] as const) assert.equal(svgUnsafe(at(inner)), reason, inner)
})

test('A5.errors: elements, schemes and CSS that load or run anything are unsafe, in a foreignObject too', () => {
  for (const [inner, token] of [
    ['<image href="#x"/>', '<image'], ['<foreignObject><img src="x.png"/></foreignObject>', '<img'], ['<x src="y"/>', 'src='],
    ['<style>@import "a.css";</style>', '@import'], ['<foreignObject><link rel="stylesheet"/></foreignObject>', '<link'],
    ['<script>1</script>', '<script'], ['<foreignObject><iframe/></foreignObject>', '<iframe'], ['<object/>', '<object'], ['<embed/>', '<embed'],
    ['<text>javascript:x</text>', 'javascript:'], ['<text>FILE:x</text>', 'file:'], ['<text>data:x</text>', 'data:'],
    ['<set attributeName="href" to="/x"/>', '<set'], ['<animate attributeName="href"/>', '<animate'], ['<feImage/>', '<feimage'],
    ['<style>.a{background:image-set("/x" 1x)}</style>', 'image-set('], ['<style>@font-face{src:local(x)}</style>', '@font-face'],
    ['<rect onload="f()"/>', 'on*='], ['<x srcset="a"/>', 'srcset'], ['<x xml:base="file:///"/>', 'xml:base'],
  ] as const) assert.equal(svgUnsafe(at(inner)), `token ${token}`, inner)
})

test('A5.errors: an escape, a comment, a stray scheme, or an entity that is not known is unsafe', () => {
  for (const [inner, reason] of [
    ['<style>.a{background:u\\72l(x)}</style>', 'backslash'], ['<style>.a{background:u/**/rl(x)}</style>', 'comment'],
    ['<text>see //host/x</text>', 'slashes'], ['<text>&lpar;</text>', 'entity'], ['<text>&#0;</text>', 'entity'],
    [`<text>${ch(0xfb02)}${ch(0xb0)}x</text>`, 'entity'],
  ] as const) assert.equal(svgUnsafe(at(inner)), reason, inner)
})
