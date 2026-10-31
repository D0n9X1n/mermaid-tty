import test from 'node:test'
import assert from 'node:assert/strict'
import { unsafeReason } from '../../hooks/safe.ts'
import { parseFail } from '../../core/render.ts'

// The gate before mmdc, apart from core's parser: a source with any way to style, fetch or load something is text.
// Every source below except the last group is one core parses, so only this gate keeps it from mmdc.
const FC = 'flowchart TD\nA --> B'

test("A5.errors: the reviewer's themeCSS repro is unsafe", () => {
  const repro = "---\nconfig:\n  themeCSS: '.nodeLabel::before {content: url(file:///tmp/private.svg)}'\n---\n" + FC
  assert.equal(unsafeReason(repro), 'frontmatter')
})

test('A5.errors: (a) frontmatter may hold one plain-scalar title and nothing else', () => {
  for (const ok of [
    FC,
    `---\ntitle: Hello world\n---\n${FC}`,
    `---\n\ntitle: Hello\n\n---\n${FC}`,
    `---\r\ntitle: Hi\r\n---\r\n${FC}`,
  ]) {
    assert.equal(unsafeReason(ok), null, JSON.stringify(ok))
  }
  for (const bad of [
    `---\nconfig:\n  theme: dark\n---\n${FC}`, // config at all
    `---\ndisplayMode: compact\n---\n${FC}`, // another key
    `---\ntitle: a\ntitle: b\n---\n${FC}`, // a second title
    `---\ntitle: "quoted"\n---\n${FC}`, // not a plain scalar
    `---\ntitle: 'quoted'\n---\n${FC}`,
    `---\ntitle: |\n  block\n---\n${FC}`,
    `---\ntitle: [a]\n---\n${FC}`,
    `---\ntitle: {a: 1}\n---\n${FC}`,
    `---\ntitle: &x a\n---\n${FC}`,
    `---\ntitle: *x\n---\n${FC}`,
    `---\ntitle: !!str a\n---\n${FC}`,
    `---\ntitle: a # comment\n---\n${FC}`,
    `---\ntitle:\n---\n${FC}`, // empty
    `---\n  title: indented\n---\n${FC}`,
    `---\ntitle: Hello\n${FC}`, // never closed
    `\n---\ntitle: Hello\n---\n${FC}`, // a fence not on the first line
    `${FC}\n---\nconfig: {}\n---`, // a fence later on
    `---\ntitle: Hi\n---\n---\nconfig: {}\n---\n${FC}`, // a second block
  ]) {
    assert.equal(unsafeReason(bad), 'frontmatter', JSON.stringify(bad))
  }
})

test('A5.errors: (b) %%{ anywhere is unsafe', () => {
  for (const bad of [
    `%%{init: {'theme':'dark'}}%%\n${FC}`,
    `${FC}\n%% a %%{ in a comment`,
    `flowchart TD\nA["%%{x}%%"] --> B`,
  ]) {
    assert.equal(unsafeReason(bad), 'directive', bad)
  }
})

test('A5.errors: (c) a style, classDef, linkStyle, class, cssClass or click statement is unsafe, in any case, after a ; too', () => {
  for (const [src, word] of [
    [`${FC}\nstyle A fill:#f00`, 'style'],
    [`flowchart TD\nA:::c --> B\nclassDef c fill:#f00`, 'classdef'],
    [`${FC}\nlinkStyle 0 stroke:#f00`, 'linkstyle'],
    [`${FC}\nclass A c`, 'class'],
    [`${FC}\ncssClass "A" c`, 'cssclass'],
    [`${FC}\nclick A call f()`, 'click'],
    [`${FC}\n    STYLE A fill:#f00`, 'style'],
    [`${FC}; style A fill:#f00`, 'style'],
    ['classDiagram\nclass Animal\nAnimal <|-- Dog', 'class'],
  ] as const) {
    assert.equal(unsafeReason(src), `statement ${word}`, src)
  }
  for (const ok of [`flowchart TD\nstyled --> classy\nclicks --> B`, 'flowchart TD\nA[style] --> B[click here]']) {
    assert.equal(unsafeReason(ok), null, ok)
  }
})

test('A5.errors: (d) url(, image(, image-set(, @import, file:, data:, javascript:, http:, https:, // or a backslash anywhere is unsafe, in any case', () => {
  for (const [token, src] of [
    ['url(', 'flowchart TD\nA["URL(x)"] --> B'],
    ['image(', 'flowchart TD\nA[image(x)] --> B'],
    ['image-set(', 'flowchart TD\nA[Image-Set(x)] --> B'],
    ['@import', 'flowchart TD\nA[@IMPORT x] --> B'],
    ['file:', 'flowchart TD\nA[File:x] --> B'],
    ['data:', 'flowchart TD\nA[DATA:x] --> B'],
    ['javascript:', 'flowchart TD\nA[JavaScript:x] --> B'],
    ['http:', 'flowchart TD\nA[see HTTP:x] --> B'],
    ['https:', 'flowchart TD\nA[https:x] --> B'],
    ['//', 'flowchart TD\nA[a//b] --> B'],
    ['\\', 'flowchart TD\nA[a\\b] --> B'],
  ] as const) {
    assert.equal(unsafeReason(src), `token ${token}`, src)
  }
  for (const ok of ['flowchart TD\nA[a/b] --> B[urls] --> C[data x]', 'sequenceDiagram\nA->>B: files: 3, images: 2']) {
    assert.equal(unsafeReason(ok), null, ok)
  }
})

// The reviewer's five gaps, as reconstructed here from the review's short form: each passed core's parser and the gate
// before this change. Core still parses each; the gate now stops each.
const ch = (n: number) => String.fromCharCode(n)
const NB = ch(0xa0)
const MARK = `${ch(0xfb02)}${ch(0xb0)}${ch(0xb0)}117${ch(0xb6)}${ch(0xdf)}` // Mermaid's marker for #117; (u)
// Each gap source is unsafe here whatever core says. Core's config allowlist now also rejects the themeCSS one, as
// config:themeCSS; the other four still parse in core, so this gate is what stops them.
test('A5.errors: the five gap sources are unsafe; four of them parse in core', () => {
  for (const [src, reason, core] of [
    [`sequenceDiagram\nrect ${MARK}rl(/asset.svg#paint)\nA->>B: hi\nend`, 'char U+FB02', null],
    [
      `---${NB}\nconfig:\n  themeCSS: '.nodeLabel::before {content: ${MARK}rl(/asset.svg)}'\n---${NB}\nflowchart TD\nA --> B`,
      'char U+00A0',
      'config:themeCSS',
    ],
    [`flowchart TD\nA --> B\n${NB}click A href "/asset.svg"`, 'char U+00A0', null],
    ['flowchart TD\nA --> B\naccDescr {x} click A href "/asset.svg"', 'statement accdescr', null],
    ['classDiagram\nA <|-- B\nlink A "/asset.svg"', 'statement link', null],
  ] as const) {
    assert.equal(parseFail(src)?.reason ?? null, core, src)
    assert.equal(unsafeReason(src), reason, JSON.stringify(src))
  }
})

test("A5.errors: a character outside the safe set is unsafe: Mermaid's entity markers, odd whitespace, Cc and Cf", () => {
  for (const [code, label] of [
    [0xfb02, 'FB02'],
    [0xb6, '00B6'],
    [0xa7, '00A7'],
    [0xa0, '00A0'],
    [0x0b, '000B'],
    [0x0c, '000C'],
    [0x2028, '2028'],
    [0x3000, '3000'],
    [0xfeff, 'FEFF'],
    [0x200b, '200B'],
    [0x07, '0007'],
    [0x200d, '200D'],
  ] as const) {
    assert.equal(unsafeReason(`flowchart TD\nA[a${ch(code)}b] --> B`), `char U+${label}`, label)
  }
  assert.equal(unsafeReason(`flowchart TD\nA[a${ch(0xb0)}${ch(0xb0)}b] --> B`), 'marker')
  assert.equal(unsafeReason('flowchart TD\nA["#117;rl"] --> B'), 'entity #117;')
  for (const ok of [
    `flowchart TD\nA[20${ch(0xb0)}C] --> B[Stra${ch(0xdf)}e]`,
    'flowchart TD\r\n\tA --> B',
    'flowchart TD\nA[读取] --> B',
  ]) {
    assert.equal(unsafeReason(ok), null, JSON.stringify(ok))
  }
})

test('A5.errors: statements split at newlines, ;, { and }; link, callback, call, href, accDescr and accTitle are unsafe too', () => {
  for (const [src, word] of [
    ['flowchart TD\nA{ok} click A call f()', 'click'],
    ['flowchart TD\nA --> B\nB{ style A fill:#f00 }', 'style'],
    ['flowchart TD\nA --> B\nlink A x', 'link'],
    ['flowchart TD\nA --> B\ncallback A f', 'callback'],
    ['flowchart TD\nA --> B\ncall f()', 'call'],
    ['flowchart TD\nA --> B\nhref A x', 'href'],
    ['flowchart TD\nA --> B\naccTitle: x', 'acctitle'],
    ['flowchart TD\nA --> B\naccDescr: x', 'accdescr'],
  ] as const) {
    assert.equal(unsafeReason(src), `statement ${word}`, src)
  }
  assert.equal(unsafeReason('flowchart TD\nA{ok} --> B{yes}'), null)
})

test('A5.errors: a sequence rect takes only #hex or rgb()/rgba() with numbers; a box only that before its title', () => {
  for (const ok of [
    'rect rgb(40, 40, 60)',
    'rect rgba(0,0,0,0.5)',
    'rect #abc',
    'rect #AABBCC',
    'box',
    'box rgb(1,2,3) Team',
    'box #fff Team',
  ]) {
    assert.equal(unsafeReason(`sequenceDiagram\n${ok}\nA->>B: hi\nend`), null, ok)
  }
  for (const [bad, word] of [
    ['rect red', 'rect'],
    ['rect var(--x)', 'rect'],
    ['rect rgb(a,b,c)', 'rect'],
    ['rect', 'rect'],
    ['box Aqua Team', 'box'],
    ['box Team', 'box'],
  ] as const) {
    assert.equal(unsafeReason(`sequenceDiagram\n${bad}\nA->>B: hi\nend`), `color ${word}`, bad)
  }
})
