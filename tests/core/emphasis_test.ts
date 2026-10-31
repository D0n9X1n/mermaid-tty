// core/emphasis.ts against Mermaid 12.2.0: each expectation is what its markdownToHTML (marked 16.4.2) emits, rendered
// under JSDOM, written per character: {b:…} bold, {i:…} italic, {bi:…} both; a space between two characters of one
// style joins their run. null is text the port does not draw: it falls back.
import test from 'node:test'
import assert from 'node:assert/strict'
import { emOf, emphasize, plain } from '../../core/emphasis.ts'

const CODE = ['', 'b', 'i', 'bi']
// A marked string per character, runs of one style grouped.
function show(s: string): string {
  const cs: { ch: string; em: number }[] = []
  let em = 0
  for (const ch of s) {
    if (emOf(ch)) {
      em = emOf(ch)
      continue
    }

    cs.push({ ch, em })
    em = 0
  }
  // A space takes the style of its two neighbours when they share one.
  cs.forEach((c, i) => {
    if (c.ch === ' ' && cs[i - 1]?.em && cs[i - 1]!.em === cs[i + 1]?.em) {
      c.em = cs[i - 1]!.em
    }
  })
  let out = ''
  let cur = 0
  for (const c of cs) {
    if (c.em !== cur) {
      out += (cur ? '}' : '') + (c.em ? `{${CODE[c.em]}:` : '')
      cur = c.em
    }

    out += c.ch
  }

  return out + (cur ? '}' : '')
}

const E = (t: string) => {
  const r = emphasize(t)
  return r === null ? null : show(r)
}

test('X3.emphasis: ** and __ draw bold, * and _ italic, three of either both, as Mermaid shows them', () => {
  assert.equal(E('**bold** and *it*'), '{b:bold} and {i:it}')
  assert.equal(E('__b__ _i_ ***bi*** x'), '{b:b} {i:i} {bi:bi} x')
  assert.equal(E('**a *b* c**'), '{b:a} {bi:b} {b:c}')
  assert.equal(E('**b c d e f**'), '{b:b c d e f}')
})

test('X3.emphasis: intraword * opens and closes, intraword _ does not; an unmatched run stays as written', () => {
  assert.equal(E('a**b**c a__b__c'), 'a{b:b}c a__b__c')
  assert.equal(E('a **b'), 'a **b')
  assert.equal(E('snake_case'), 'snake_case')
})

test('X3.emphasis: a <br> inside emphasis stays a <br>, unstyled, with both sides styled', () => {
  assert.equal(E('a **b<br>c** d'), 'a {b:b}<br>{b:c} d')
  assert.equal(E('a<br>**b**'), 'a<br>{b:b}')
})

test('X3.emphasis: a wide character takes one marker; plain strips every marker', () => {
  assert.equal(E('中**文字**'), '中{b:文字}')
  assert.equal(plain(emphasize('x **中文** _y_')!), 'x 中文 y')
})

test('X3.emphasis: nesting a style in itself, escapes, code, links, strikethrough, autolinks and block starts fall back', () => {
  for (const t of [
    '**a **b** c**',
    '*a *b* c*',
    'a\\*b* *c*',
    '`x` **b**',
    '[x](y) **b**',
    '~~s~~ **b**',
    'www.x.com **b**',
    'a@b.co **b**',
    'http://x **b**',
    'a < **b**',
    'a > **b**',
    '# **h**',
    '- **l**',
    '1. **l**',
    '> **q**',
    'a\n**b**',
    'a\t**b**',
    '<b>x</b> **b**',
    '&amp; **b**',
    '**b** \u{1}',
  ]) {
    assert.equal(E(t), null, t)
  }
})

// Mermaid 12.2.0 (JSDOM) turns each <br> spelling in an edge, transition or relation label into a newline before marked
// runs, so emphasis spans it as whitespace, and a line after it can start a block (`a<br>- **b**` shows <p>a</p>-
// **b**). breaks: that reading. A block start, a heading underline or a hard break on any line falls back.
test('X3.emphasis: in an edge label each <br> is a newline as Mermaid makes it; a block start on any line falls back', () => {
  const B = (t: string) => {
    const r = emphasize(t, true)
    return r === null ? null : show(r)
  }
  assert.equal(B('**a<br>b**'), '{b:a}<br>{b:b}')
  assert.equal(B('a<br/>**b** c'), 'a<br>{b:b} c')
  assert.equal(B('a<BR />_b_'), 'a<br>{i:b}')
  assert.equal(B('a<br> **b**'), 'a<br>{b:b}')
  assert.equal(B('**a<br>** b'), '**a<br>** b')
  assert.equal(B('a</br>**b**'), 'a<br>{b:b}')
  for (const t of [
    'a<br>- **b**',
    'a<br># **h**',
    '**a**<br>===',
    '*a*<br>---',
    'a<br>1. **b**',
    'a<br>> **b**',
    'a  <br>**b**',
    'a<br><br>**b**',
    '<br>**b**',
    '- **a**<br>b',
    'a<br>|-|-|<br>**b**',
  ]) {
    assert.equal(B(t), null, t)
  }
})
