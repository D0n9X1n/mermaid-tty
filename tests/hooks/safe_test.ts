import test from 'node:test'
import assert from 'node:assert/strict'
import { unsafeReason } from '../../hooks/safe.ts'

// The gate before mmdc, apart from core's parser: a source with any way to style, fetch or load something is text.
// Every source below except the last group is one core parses, so only this gate keeps it from mmdc.
const FC = 'flowchart TD\nA --> B'

test('A5.errors: the reviewer\'s themeCSS repro is unsafe', () => {
  const repro = "---\nconfig:\n  themeCSS: '.nodeLabel::before {content: url(file:///tmp/private.svg)}'\n---\n" + FC
  assert.equal(unsafeReason(repro), 'frontmatter')
})

test('A5.errors: (a) frontmatter may hold one plain-scalar title and nothing else', () => {
  for (const ok of [FC, `---\ntitle: Hello world\n---\n${FC}`, `---\n\ntitle: Hello\n\n---\n${FC}`, `---\r\ntitle: Hi\r\n---\r\n${FC}`])
    assert.equal(unsafeReason(ok), null, JSON.stringify(ok))
  for (const bad of [
    `---\nconfig:\n  theme: dark\n---\n${FC}`,          // config at all
    `---\ndisplayMode: compact\n---\n${FC}`,             // another key
    `---\ntitle: a\ntitle: b\n---\n${FC}`,               // a second title
    `---\ntitle: "quoted"\n---\n${FC}`,                  // not a plain scalar
    `---\ntitle: 'quoted'\n---\n${FC}`,
    `---\ntitle: |\n  block\n---\n${FC}`,
    `---\ntitle: [a]\n---\n${FC}`, `---\ntitle: {a: 1}\n---\n${FC}`, `---\ntitle: &x a\n---\n${FC}`, `---\ntitle: *x\n---\n${FC}`, `---\ntitle: !!str a\n---\n${FC}`,
    `---\ntitle: a # comment\n---\n${FC}`,
    `---\ntitle:\n---\n${FC}`,                            // empty
    `---\n  title: indented\n---\n${FC}`,
    `---\ntitle: Hello\n${FC}`,                           // never closed
    `\n---\ntitle: Hello\n---\n${FC}`,                    // a fence not on the first line
    `${FC}\n---\nconfig: {}\n---`,                        // a fence later on
    `---\ntitle: Hi\n---\n---\nconfig: {}\n---\n${FC}`,   // a second block
  ]) assert.equal(unsafeReason(bad), 'frontmatter', JSON.stringify(bad))
})

test('A5.errors: (b) %%{ anywhere is unsafe', () => {
  for (const bad of [`%%{init: {'theme':'dark'}}%%\n${FC}`, `${FC}\n%% a %%{ in a comment`, `flowchart TD\nA["%%{x}%%"] --> B`])
    assert.equal(unsafeReason(bad), 'directive', bad)
})

test('A5.errors: (c) a style, classDef, linkStyle, class, cssClass or click statement is unsafe, in any case, after a ; too', () => {
  for (const [src, word] of [
    [`${FC}\nstyle A fill:#f00`, 'style'], [`flowchart TD\nA:::c --> B\nclassDef c fill:#f00`, 'classdef'], [`${FC}\nlinkStyle 0 stroke:#f00`, 'linkstyle'],
    [`${FC}\nclass A c`, 'class'], [`${FC}\ncssClass "A" c`, 'cssclass'], [`${FC}\nclick A call f()`, 'click'],
    [`${FC}\n    STYLE A fill:#f00`, 'style'], [`${FC}; style A fill:#f00`, 'style'], ['classDiagram\nclass Animal\nAnimal <|-- Dog', 'class'],
  ] as const) assert.equal(unsafeReason(src), `statement ${word}`, src)
  for (const ok of [`flowchart TD\nstyled --> classy\nclicks --> B`, 'flowchart TD\nA[style] --> B[click here]'])
    assert.equal(unsafeReason(ok), null, ok)
})

test('A5.errors: (d) url(, image(, image-set(, @import, file:, data:, javascript:, http:, https:, // or a backslash anywhere is unsafe, in any case', () => {
  for (const [token, src] of [
    ['url(', 'flowchart TD\nA["URL(x)"] --> B'], ['image(', 'flowchart TD\nA[image(x)] --> B'], ['image-set(', 'flowchart TD\nA[Image-Set(x)] --> B'],
    ['@import', 'flowchart TD\nA[@IMPORT x] --> B'], ['file:', 'flowchart TD\nA[File:x] --> B'], ['data:', 'flowchart TD\nA[DATA:x] --> B'],
    ['javascript:', 'flowchart TD\nA[JavaScript:x] --> B'], ['http:', 'flowchart TD\nA[see HTTP:x] --> B'], ['https:', 'flowchart TD\nA[https:x] --> B'],
    ['//', 'flowchart TD\nA[a//b] --> B'], ['\\', 'flowchart TD\nA[a\\b] --> B'],
  ] as const) assert.equal(unsafeReason(src), `token ${token}`, src)
  for (const ok of ['flowchart TD\nA[a/b] --> B[urls] --> C[data x]', 'sequenceDiagram\nA->>B: files: 3, images: 2'])
    assert.equal(unsafeReason(ok), null, ok)
})
