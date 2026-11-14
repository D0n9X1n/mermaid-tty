import test from 'node:test'
import assert from 'node:assert/strict'
import { splitFences } from '../../hooks/fences.ts'
import { all, parse, type Node } from '../docs/markdown.ts'

// splitFences draws a fence only when it is certainly a mermaid code block. The oracle is the CommonMark parser the docs
// checks pin: every drawn segment must be a mermaid code block that CommonMark starts on the same line, with the same
// content. 30000 seeded replies, built from the constructs that change how Markdown reads a fence: list markers, tabs,
// quotes, setext underlines, thematic breaks, HTML, tables and indentation.
const PREFIX = ['', '', '', ' ', '  ', '   ', '    ', '\t', '- ', '* ', '1. ', '2. ', '10) ', '- - ', '-\t', '* \t']
const PREFIX2 = ['> ', '>', '  > ', '  - ', '1.  ', '| ']
const BODY = ['```mermaid', '~~~mermaid', '```Mermaid', '```js', '```', '~~~', '````', 'flowchart LR', 'A --> B']
const BODY2 = ['text', '', '===', '---', '--', '- - -', '# h', 'mindmap', ' root', '   child', '\tx', '<div>', 'a | b']
const HTML = ['<details>', '</details>', '<pre>', '<!-- c', '<b>x</b>', '<summary>s</summary>']
const BODY3 = ['| - | - |', '\u2028', '\u2029', 'lazy', '  - x']

test('every diagram splitFences draws is a mermaid code block CommonMark reads at that line, with that content', () => {
  let seed = 20261114
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const pick = <T>(a: readonly T[]) => a[Math.floor(rand() * a.length)]!
  const prefixes = [...PREFIX, ...PREFIX2]
  const bodies = [...BODY, ...BODY2, ...BODY3, ...HTML]
  const norm = (x: string) => x.replace(/\r\n|\r/g, '\n')
  let drawn = 0
  for (let n = 0; n < 30000; n++) {
    const lines = Array.from({ length: 2 + Math.floor(rand() * 9) }, () => pick(prefixes) + pick(bodies))
    const reply = lines.join(pick(['\n', '\n', '\r\n'])) + (rand() < 0.7 ? '\n' : '')
    const codes = all(parse(reply), 'code') as (Node & { lang?: string; meta?: string })[]
    let at = 0
    for (const s of splitFences(reply)) {
      if (s.kind === 'mermaid') {
        drawn++
        const line = reply.slice(0, at).split(/\r\n|\r|\n/).length
        const c = codes.find((x) => x.position?.start.line === line)
        assert.ok(
          c && (c.lang ?? '').toLowerCase() === 'mermaid' && !c.meta && norm(c.value ?? '') === norm(s.body),
          JSON.stringify(reply),
        )
      }

      at += s.text.length
    }
  }

  assert.ok(drawn > 50, `only ${drawn} diagrams drawn: the replies no longer test drawing`)
})
