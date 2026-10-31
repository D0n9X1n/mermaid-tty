import test from 'node:test'
import assert from 'node:assert/strict'
import { drawable, labelLines, wrap, type Br, type Mode } from '../../core/text.ts'
test('A3: <br> variants split label lines', () =>
  assert.deepEqual(labelLines('a<br>b<br/>c<br />d'), ['a', 'b', 'c', 'd']))
test('A4.fit-ladder: wrap at spaces and between W/F chars; a word wider than max fails', () => {
  assert.deepEqual(wrap('alpha beta gamma', 10), [
    { text: 'alpha beta', join: '' },
    { text: 'gamma', join: ' ' },
  ])
  assert.deepEqual(wrap('读取配置文件', 8), [
    { text: '读取配置', join: '' },
    { text: '文件', join: '' },
  ])
  assert.equal(wrap('supercalifragilistic', 8), null)
})

test('A3: <br> matches in any case and with any spaces before the slash; a label without one is one line', () => {
  assert.deepEqual(labelLines('a<BR>b<Br />c<bR/>d<br  />e'), ['a', 'b', 'c', 'd', 'e'])
  assert.deepEqual(labelLines('plain'), ['plain'])
})

test('A3: two breaks in a row, or a break at the end, keep a blank line', () => {
  assert.deepEqual(labelLines('a<br><br>b'), ['a', '', 'b'])
  assert.deepEqual(labelLines('a<br>'), ['a', ''])
})

test('A4.fit-ladder: a line exactly max wide is one piece; one column narrower splits it or fails', () => {
  assert.deepEqual(wrap('ab cd', 5), [{ text: 'ab cd', join: '' }])
  assert.deepEqual(wrap('ab cd', 4), [
    { text: 'ab', join: '' },
    { text: 'cd', join: ' ' },
  ])
  assert.deepEqual(wrap('supercalifragilistic', 20), [{ text: 'supercalifragilistic', join: '' }])
  assert.equal(wrap('supercalifragilistic', 19), null)
})

test('A4.fit-ladder: a W/F character counts 2 columns', () => {
  assert.deepEqual(wrap('中文', 4), [{ text: '中文', join: '' }])
  assert.deepEqual(wrap('中文', 3), [
    { text: '中', join: '' },
    { text: '文', join: '' },
  ])
  assert.equal(wrap('中', 1), null)
})

// U+20000 and U+20001 (CJK Extension B) are East Asian Width W and 2 code units each: the code point, not its high
// surrogate, is W.
test('A4.fit-ladder: an astral W/F character counts 2 columns and splits from a W/F neighbor, BMP or astral', () => {
  assert.deepEqual(wrap('\u{20000}\u{20001}', 2), [
    { text: '\u{20000}', join: '' },
    { text: '\u{20001}', join: '' },
  ])
  assert.deepEqual(wrap('\u{20000}\u{20001}', 4), [{ text: '\u{20000}\u{20001}', join: '' }])
  assert.deepEqual(wrap('读\u{20000} \u{20001}取', 2), [
    { text: '读', join: '' },
    { text: '\u{20000}', join: '' },
    { text: '\u{20001}', join: ' ' },
    { text: '取', join: '' },
  ])
})

// 读取a is the tokens 读 and 取a: no split falls between 取 and a, so the 3-column 取a cannot fit in 2.
test('A4.fit-ladder: a narrow character stays in the token of the W/F character next to it', () => {
  assert.deepEqual(wrap('读取a', 3), [
    { text: '读', join: '' },
    { text: '取a', join: '' },
  ])
  assert.equal(wrap('读取a', 2), null)
  assert.equal(wrap('a读', 2), null)
})

// e + U+0301 COMBINING ACUTE ACCENT is 2 code units and 1 column.
test('A4.fit-ladder: a combining mark counts 0 columns', () => {
  assert.deepEqual(wrap('éé x', 2), [
    { text: 'éé', join: '' },
    { text: 'x', join: ' ' },
  ])
  assert.deepEqual(wrap('éé x', 4), [{ text: 'éé x', join: '' }])
})

test('A4.fit-ladder: leading and trailing spaces drop, and a run of spaces is one space', () => {
  assert.deepEqual(wrap('  a   b  ', 3), [{ text: 'a b', join: '' }])
  assert.deepEqual(wrap('  a   b  ', 2), [
    { text: 'a', join: '' },
    { text: 'b', join: ' ' },
  ])
})

// wrap never returns []: a blank label line still takes a row.
test('A3: a blank line, empty or only spaces, wraps to one empty piece', () => {
  assert.deepEqual(wrap('', 5), [{ text: '', join: '' }])
  assert.deepEqual(wrap('   ', 5), [{ text: '', join: '' }])
})

test('A4.fit-ladder: a piece split off between W/F characters joins with nothing, one split at a space with a space', () => {
  assert.deepEqual(wrap('读取 配置文件', 4), [
    { text: '读取', join: '' },
    { text: '配置', join: ' ' },
    { text: '文件', join: '' },
  ])
})

// drawable: whether text draws as Mermaid 12.2.0 shows it.
const MODES: Mode[] = ['html', 'plain', 'sanitized', 'escaped', 'member']
const BRS: Br[] = ['any', 'lower', 'literal', 'none']
const D = (t: string, mode: Mode, br: Br = 'any') => drawable(t, mode, br)?.reason ?? null
test('A5.errors: drawable: a #…; entity or a ﬂ° or ¶ß marker fails entity in every mode and br; a lone #, ﬂ, ° or ¶ is text', () => {
  for (const m of MODES) {
    for (const b of BRS) {
      assert.deepEqual(
        ['#9829;', 'I #quot; x', 'aﬂ°b', 'a¶ßb', 'ﬂ°x¶ß'].map((t) => D(t, m, b)),
        Array(5).fill('entity'),
        `${m} ${b}`,
      )
      assert.equal(D('C# 1; ﬂ ° ¶ ß', m, b), null, `${m} ${b}`)
    }
  }
})
test('A5.errors: drawable: br any splits every <br> spelling, lower only <br>, literal leaves them to the mode, none fails html', () => {
  const all = ['a<br>b', 'a<BR>b', 'a<br/>b', 'a<br />b', 'a<Br  />b']
  assert.deepEqual(
    all.map((t) => D(t, 'sanitized', 'any')),
    Array(5).fill(null),
  )
  assert.deepEqual(
    all.map((t) => D(t, 'sanitized', 'lower')),
    [null, 'html', 'html', 'html', 'html'],
  )
  assert.deepEqual(
    all.map((t) => [D(t, 'plain', 'literal'), D(t, 'html', 'literal')]),
    Array(5).fill([null, 'html']),
  )
  assert.deepEqual(
    [...all, 'a<br'].map((t) => D(t, 'plain', 'none')),
    Array(6).fill('html'),
  )
  assert.equal(D('a<br>b<b>', 'html', 'any'), 'html')
})
test('A5.errors: drawable: html fails a tag-like < and an & before # or two letters; Q&A, AT&T, a < b and x > 5 pass', () => {
  const ok = ['Q&A', 'Q & A', 'AT&T', 'a&b', 'a < b', 'x > 5', 'a <3', '1<2', 'a<', 'a& b', 'éé&é']
  assert.deepEqual(
    ok.map((t) => D(t, 'html')),
    Array(ok.length).fill(null),
  )
  const tags = ['a<b', '<b>z</b>', 'a</b', 'a<!--c-->b', '<?x', 'x<Y']
  assert.deepEqual(
    tags.map((t) => D(t, 'html')),
    Array(tags.length).fill('html'),
  )
  const ents = ['&lt;', '&amp;', '&lt', 'a&#60;', '&#x41', 'Tom&Jerry', '&nbsp']
  assert.deepEqual(
    ents.map((t) => D(t, 'html')),
    Array(ents.length).fill('entity'),
  )
})
test('A5.errors: drawable: plain draws < > and & as written; sanitized fails any <; escaped any < or >', () => {
  const t = ['a<b', '<b>z</b>', 'a < b', 'x > 5', '&lt;', '&amp;', 'a<!--c-->b']
  assert.deepEqual(
    t.map((s) => D(s, 'plain')),
    Array(t.length).fill(null),
  )
  assert.deepEqual(
    t.map((s) => D(s, 'sanitized')),
    ['html', 'html', 'html', null, null, null, 'html'],
  )
  assert.deepEqual(
    t.map((s) => D(s, 'escaped')),
    ['html', 'html', 'html', 'html', null, null, 'html'],
  )
  assert.deepEqual(
    ['Q&A', 'Q & A'].map((s) => [D(s, 'sanitized'), D(s, 'escaped')]),
    [
      [null, null],
      [null, null],
    ],
  )
})
test('A5.errors: drawable: member fails any < and an & before # or two letters of any script', () => {
  assert.deepEqual(
    ['a < b', 'a<b', '&lt', '&#9', 'a&éé', 'Q&A', 'x > 5'].map((s) => D(s, 'member')),
    ['html', 'html', 'entity', 'entity', 'entity', null, null],
  )
  assert.equal(D('a&éé', 'html'), null)
})

// HTML ends a tag name only at its whitespace (space, tab, newline, form feed, return), / or >: <br /> is no br tag.
const ODD = [' ', ' ', '　'].map((s) => `a<br${s}/>b`)
test('A3: <br> splits only with HTML whitespace before its slash', () => {
  assert.deepEqual(labelLines('a<br\t/>b<br\n/>c<br\f/>d<br\r/>e<br />f'), ['a', 'b', 'c', 'd', 'e', 'f'])
  assert.deepEqual(
    ODD.map((t) => labelLines(t)),
    ODD.map((t) => [t]),
  )
})
// Mermaid's own splitter (common.ts lineBreakRegex, /<\/?br\s*\/?>/gi) splits at those and at </br> too; a field whose
// <br> splits would draw them as written, so it falls back, as a field with no <br> does.
test('A5.errors: drawable: a <br> with another space, or a </br>, fails html where a <br> splits or none may be drawn', () => {
  const odd = [...ODD, 'a</br>b', 'a</BR >b']
  for (const m of MODES) {
    assert.deepEqual(
      odd.map((t) => [D(t, m, 'any'), D(t, m, 'none')]),
      odd.map(() => ['html', 'html']),
      m,
    )
  }

  assert.deepEqual(
    odd.map((t) => D(t, 'plain', 'literal')),
    odd.map(() => null),
  )
})
test('A5.errors: drawable: br any and lower remove every <br>, not only the first', () => {
  assert.deepEqual(
    ['a<br>b<br>c', 'a<br><br>'].map((t) => D(t, 'sanitized', 'lower')),
    [null, null],
  )
  assert.deepEqual(
    ['a<br>b<br/>c', 'a<BR><br />'].map((t) => D(t, 'sanitized', 'any')),
    [null, null],
  )
  assert.equal(D('a<br>b<BR>c', 'sanitized', 'lower'), 'html')
})
test('X2: a removed <br> joins nothing, so text on either side is checked on its own', () => {
  assert.equal(drawable('Q&A<br>x', 'html', 'any'), null)
  assert.equal(drawable('Q&A<br>x', 'html', 'lower'), null)
  assert.deepEqual(drawable('a&<br>amp;', 'html', 'any'), null)
  assert.deepEqual(drawable('&am<br>p', 'html', 'any'), { reason: 'entity' })
})

// createText (Mermaid 12.2.0) renders every HTML label through replaceIconSubstring and, given $$…$$, KaTeX; a markdown
// one (labelType 'markdown', and every class member) through marked, whose emphasis and escapes show other text; a
// plain one turns a literal \n into <br />.
const RENDERED: Mode[] = ['html', 'markdown', 'member']
test('X3: drawable: an icon token or a $$…$$ formula fails icon or math in every HTML-label mode, and nowhere else', () => {
  const icons = [
    'fa:fa-book',
    'x fab:fa-github y',
    'fas:fa-a-b',
    'fak:fa-x',
    'fal:fa-x',
    'far:fa-x',
    'fad:fa-x',
    'sofa:fa-x',
  ]
  for (const m of RENDERED) {
    assert.deepEqual(
      icons.map((t) => D(t, m)),
      icons.map(() => 'icon'),
      m,
    )
    assert.deepEqual(
      ['$$x^2$$', 'a $$b$$ c', '$$$$'].map((t) => D(t, m)),
      ['math', 'math', 'math'],
      m,
    )
    assert.deepEqual(
      ['fa:book', 'fa-book', 'fa:fa-', '$5', 'a $$ b', '$$$'].map((t) => D(t, m)),
      Array(6).fill(null),
      m,
    )
  }

  for (const m of ['plain', 'sanitized', 'escaped'] as Mode[]) {
    assert.deepEqual(
      ['fa:fa-book', '$$x$$'].map((t) => D(t, m)),
      [null, null],
      m,
    )
  }
})
test('X3: drawable: markdown and member fail emphasis marked renders and a \\ escaping punctuation; html does not', () => {
  const md = [
    '**bold**',
    '*a*',
    '_a_',
    '__init__',
    '+__init__()',
    'x._y_',
    '(_a_)',
    'a*b*c',
    'a\\*b',
    'a\\\\b',
    'a \\# b',
    'a * b * c',
  ]
  for (const m of ['markdown', 'member'] as Mode[]) {
    assert.deepEqual(
      md.map((t) => D(t, m)),
      md.map(() => 'markdown'),
      m,
    )
  }

  const ok = [
    'bold',
    'snake_case',
    'my_var_name',
    'a_b_c',
    '_private',
    'x_',
    'a*b',
    '+someMethod()*',
    'C:\\Users',
    'a\\nb',
    '`code`',
    '# h',
    '- item',
    '[x](y)',
    'Q&A',
  ]
  for (const m of ['markdown', 'member'] as Mode[]) {
    assert.deepEqual(
      ok.map((t) => D(t, m)),
      ok.map(() => null),
      m,
    )
  }

  assert.equal(D('a < b', 'markdown'), null)
  assert.deepEqual(
    md.map((t) => D(t, 'html')),
    md.map(() => null),
  )
})
test('X3: drawable: a literal \\n fails newline in html, where Mermaid splits it, and draws in markdown', () => {
  assert.deepEqual(
    ['a\\nb', 'x\\n'].map((t) => [D(t, 'html'), D(t, 'markdown')]),
    [
      ['newline', null],
      ['newline', null],
    ],
  )
})

// A marker stays with the character it styles: wrap splits before the marker, never between it and its character.
test('X3.emphasis: wrap measures a marked line by what it shows and keeps each marker with its character', async () => {
  const { emphasize, plain } = await import('../../core/emphasis.ts')
  const m = emphasize('**中文字** ab')!
  const ps = wrap(m, 5)!
  assert.deepEqual(
    ps.map((p) => plain(p.text)),
    ['中文', '字 ab'],
  )
  assert.ok(ps.every((p) => !/[\x01-\x03]$/.test(p.text)))
  assert.equal(ps[1]!.text, emphasize('**字** ab'))
})

// styled: a markdown field's text as the marked string Mermaid shows (core/emphasis.ts), or why not. Text the port
// cannot match keeps the Fail drawable gives; an unsupported character fails before any marker is written, so a marker
// can never come from the source.
test('X3.emphasis: styled draws emphasis in a markdown field, and keeps every other Fail', async () => {
  const { styled } = await import('../../core/text.ts')
  const { emphasize } = await import('../../core/emphasis.ts')
  const R = (t: string, br: Br = 'any', decode = false) => {
    const r = styled(t, br, { decode })
    return typeof r === 'string' ? r : r.reason
  }
  assert.equal(R('**b** _i_'), emphasize('**b** _i_'))
  assert.equal(R('a<br>**b**'), emphasize('a<br>**b**'))
  assert.equal(R('plain text'), 'plain text')
  assert.equal(R('a * b * c'), 'a * b * c') // two lone * Mermaid shows as written
  assert.deepEqual(
    ['a\\*b*', '`x` **b**', '**a **b** c**', '#35; **b**', '&amp; **b**'].map((t) => R(t)),
    ['markdown', 'markdown', 'markdown', 'entity', 'entity'],
  )
  assert.equal(R('**b**<br>c', 'none'), 'html')
  assert.equal(R('fa:fa-x **b**'), 'icon')
  assert.equal(R('**b** \u{1}'), 'unsupported-char U+0001')
  assert.equal(R('\u{1}b'), 'unsupported-char U+0001')
  assert.equal(R('#35; x', 'any', true), '# x') // decode: a flowchart field's codes, as decoded says
  assert.equal(R('#35; **x**', 'any', true), 'markdown') // codes and emphasis together fall back
})

// styled's breaks: an edge label, where Mermaid makes each <br> a newline before marked. A line that would start a
// block, underline a heading, or end in a hard break falls back as markdown, emphasis or not.
test('X3.emphasis: styled with breaks falls back on a block start after a <br>, and reads emphasis across one', async () => {
  const { styled } = await import('../../core/text.ts')
  const { emphasize } = await import('../../core/emphasis.ts')
  const R = (t: string, breaks: boolean) => {
    const r = styled(t, 'any', { breaks })
    return typeof r === 'string' ? r : r.reason
  }
  assert.deepEqual(
    ['a<br>- b', 'a<br>===', 'a  <br>b', 'a<br>- **b**'].map((t) => R(t, true)),
    ['markdown', 'markdown', 'markdown', 'markdown'],
  )
  assert.equal(R('a<br>- b', false), 'a<br>- b')
  assert.equal(R('a<br>b', true), 'a<br>b')
  assert.equal(R('**a<br>b**', true), emphasize('**a<br>b**', true))
})
