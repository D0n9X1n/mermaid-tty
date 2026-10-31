import test from 'node:test'
import assert from 'node:assert/strict'
import { splitFences, type Segment } from '../../hooks/fences.ts'

const F = '```mermaid\nflowchart TD\nA-->B\n```\n'
const  CR = 'Hi\r\n```mermaid\r\nflowchart TD\r\nA-->B\r\n```\r\nBye'
const prose = (text: string): Segment => ({ kind: 'prose', text })
const mermaid = (text: string, body: string): Segment => ({ kind: 'mermaid', text, body })

test('A6.hook-tests: prose and fences split and re-join exactly (LF and CRLF)', () => {
  for (const r of [`Intro\n${F}Outro`, `${F}${F}`, `P1\n\n${F}\nP2`, CR]) {
    const s = splitFences(r); assert.equal(s.map(x => x.text).join(''), r); assert.ok(s.some(x => x.kind === 'mermaid'), r)
  }
  assert.deepEqual(splitFences(`Intro\n${F}Outro`).map(x => x.kind), ['prose', 'mermaid', 'prose'])
  assert.equal((splitFences(F)[0] as { body: string }).body, 'flowchart TD\nA-->B')
})

test('A6.hook-tests: unclosed and nested fences stay prose', () => {
  assert.deepEqual(splitFences('x\n```mermaid\nflowchart TD\n'), [{ kind: 'prose', text: 'x\n```mermaid\nflowchart TD\n' }])
  const nested = '````md\n' + F + '````\n'; assert.deepEqual(splitFences(nested), [{ kind: 'prose', text: nested }])
})

test('A6.hook-tests: whitespace-only prose between two fences is its own exact segment (LF and CRLF)', () => {
  const CF = F.replaceAll('\n', '\r\n')
const  lf = mermaid(F, 'flowchart TD\nA-->B')
const  crlf = mermaid(CF, 'flowchart TD\r\nA-->B')
  for (const [fence, seg, gap] of [[F, lf, '\n'], [F, lf, '\n\n'], [F, lf, ' \t\n'], [F, lf, '\r\n\r\n'], [CF, crlf, '\r\n'], [CF, crlf, '\r\n\r\n']] as const) {
    assert.deepEqual(splitFences(fence + gap + fence), [seg, prose(gap), seg], JSON.stringify(fence + gap))
  }
})

test('A6.hook-tests: exact segments at the edges: empty, no fence, fence first or last, no final newline, empty body, CRLF', () => {
  const body = 'flowchart TD\nA-->B'
  assert.deepEqual(splitFences(''), [])
  assert.deepEqual(splitFences('just prose\n'), [prose('just prose\n')])
  assert.deepEqual(splitFences(F + F), [mermaid(F, body), mermaid(F, body)])
  assert.deepEqual(splitFences(`Intro\n${F}Outro`), [prose('Intro\n'), mermaid(F, body), prose('Outro')])
  assert.deepEqual(splitFences(`P1\n\n${F}\nP2`), [prose('P1\n\n'), mermaid(F, body), prose('\nP2')])
  assert.deepEqual(splitFences('P\n```mermaid\nA\n```'), [prose('P\n'), mermaid('```mermaid\nA\n```', 'A')])
  assert.deepEqual(splitFences('```mermaid\n```\nZ'), [mermaid('```mermaid\n```\n', ''), prose('Z')])
  // CRLF inside a body is kept; only the body's last line end is dropped.
  assert.deepEqual(splitFences(CR), [prose('Hi\r\n'), mermaid('```mermaid\r\nflowchart TD\r\nA-->B\r\n```\r\n', 'flowchart TD\r\nA-->B'), prose('Bye')])
})

test('A6.hook-tests: a diagram opens on 0-3 spaces and 3+ backticks or tildes, and closes on the same char, at least as long, then blanks', () => {
  for (const [r, body] of [
    ['   ```mermaid\nA\n   ```\n', 'A'], // 3 spaces before the opener and the closer
    ['~~~mermaid\nA\n~~~\n', 'A'], // tildes
    ['```  mermaid \t\nA\n```\n', 'A'], // the info is trimmed
    ['````mermaid\nA\n```\n````\n', 'A\n```'], // a shorter closer is body; an equal one closes
    ['```mermaid\nA\n`````\n', 'A'], // a longer closer closes
    ['```mermaid\nA\n``` \t\n', 'A'], // blanks may follow the closer
    ['```mermaid\nA\n~~~\n```\n', 'A\n~~~'], // the other char does not close
    ['```mermaid\nA ```\n```\n', 'A ```'], // a fence after text does not close
    ['```mermaid\n  A  \n\n```\n', '  A  \n'], // the body keeps its blanks and loses only its last line end
  ] as const) { assert.deepEqual(splitFences(r), [mermaid(r, body)], JSON.stringify(r)) }
})

test('A6.hook-tests: a reply with no closed mermaid fence is one prose segment', () => {
  for (const r of [
    '    ```mermaid\nA\n```\n', // 4 spaces: not an opener
    '``mermaid\nA\n```\n', // 2 backticks: not an opener
    '~~mermaid\nA\n~~~\n', // 2 tildes: not an opener
    'x ```mermaid\nA\n```\n', // text before the fence: not an opener
    '```mermaidx\nA\n```\n', // the info must be exactly mermaid
    '````mermaid\nA\n```\n', // the closer is shorter than the opener
    '```mermaid\nA\n~~~\n', // the closer uses the other char
    '```mermaid\nA\n    ```\n', // 4 spaces: not a closer
    '```mermaid\nA\n``` x\n', // text after the closer
    '```\n```mermaid\nA\n```\n', // a mermaid line inside a bare fence is content
    '```js\n```mermaid\nA\n```\n', // ...and inside a fence with an info
    '~~~ a`b\n```mermaid\nA\n```\n~~~\n', // a tilde opener's info may hold a backtick
  ]) { assert.deepEqual(splitFences(r), [prose(r)], JSON.stringify(r)) }
})

test('A6.hook-tests: a fence closed before a diagram stays prose, and so does one left open after it', () => {
  const D = '```mermaid\nA\n```\n'
const  d = mermaid(D, 'A')
  assert.deepEqual(splitFences('```js\nx\n```\n' + D), [prose('```js\nx\n```\n'), d])
  assert.deepEqual(splitFences('``` a`b\n' + D), [prose('``` a`b\n'), d]) // a backtick in a backtick info: not an opener
  assert.deepEqual(splitFences(D + '```mermaid\nB\n'), [d, prose('```mermaid\nB\n')])
})

// CommonMark ends a line at LF, CRLF or a lone CR, and nowhere else: U+2028 and U+2029 (JS line terminators, which `.`
// does not match) and U+0085 are ordinary characters. They may sit in an info string, never on a closer line.
const SEP = [0x2028, 0x2029, 0x85].map(c => String.fromCharCode(c)) // from code points: raw, they are invisible in source

test('A6.hook-tests: QA repro: U+2028 in the info string of an outer fence still opens it, so its nested diagram stays prose', () => {
  const r = '````md' + SEP[0] + 'x\n```mermaid\nflowchart TD\nA-->B\n```\n````\n' // SEP[0] is U+2028
  assert.deepEqual(splitFences(r), [prose(r)])
})

test('A6.hook-tests: QA repro: a lone CR ends a line, and every segment keeps its bytes', () => {
  assert.deepEqual(splitFences('Hi\r```mermaid\rflowchart TD\rA-->B\r```\rBye'),
    [prose('Hi\r'), mermaid('```mermaid\rflowchart TD\rA-->B\r```\r', 'flowchart TD\rA-->B'), prose('Bye')])
})

test('A6.hook-tests: U+2028, U+2029 and U+0085 are plain info-string characters: the fence opens, and beside mermaid they make it no diagram', () => {
  const D = '```mermaid\nA\n```\n'
  for (const s of SEP) {
    for (const r of [
      '````md' + s + 'x\n' + D + '````\n', // an outer fence with the char in its info hides the diagram
      '~~~' + s + '\n' + D + '~~~\n', // ...and so does a tilde one
      '```mermaid' + s + '\nA\n```\n', // the info is trimmed of spaces and tabs only, so this info is not mermaid
      '```' + s + 'mermaid\nA\n```\n',
    ]) { assert.deepEqual(splitFences(r), [prose(r)], JSON.stringify(r)) }
    const fence = '```' + s + 'x\nB\n```\n' // a closed fence with the char in its info, then a diagram
    assert.deepEqual(splitFences(fence + D), [prose(fence), mermaid(D, 'A')], JSON.stringify(s))
  }
})

test('A6.hook-tests: a closing run with U+2028, U+2029 or U+0085 before or after it on its line does not close (LF, CRLF, lone CR)', () => {
  for (const eol of ['\n', '\r\n', '\r']) { for (const s of SEP) { for (const bad of ['```' + s, '``` ' + s, s + '```']) {
    const r = ['```mermaid', 'A', bad, '```', ''].join(eol)
    assert.deepEqual(splitFences(r), [mermaid(r, 'A' + eol + bad)], JSON.stringify(r))
  } } }
})

test('A6.hook-tests: LF, CRLF and lone CR mixed in one reply: each is one line end, and every segment keeps its bytes', () => {
  const F1 = '```mermaid\r\nA\rB\n```\r' // opener CRLF; body CR then LF; closer CR
  const F2 = '~~~mermaid\rC\r\nD\n~~~\r\n' // opener CR; body CRLF then LF; closer CRLF
  const F3 = '````mermaid\nE\r```\r\n````\n' // a shorter run ending CRLF is body
  assert.deepEqual(splitFences('a\nb\r\nc\r' + F1 + 'mid\r\n' + F2 + '\r' + F3 + 'end'), [
    prose('a\nb\r\nc\r'), mermaid(F1, 'A\rB'), prose('mid\r\n'), mermaid(F2, 'C\r\nD'), prose('\r'), mermaid(F3, 'E\r```'), prose('end'),
  ])
})

test('A6.hook-tests: 600 seeded random replies (prose, fences, LF/CRLF/CR, U+2028/U+2029, ` and ~) split into the segments they were built from', () => {
  let seed = 20261028 // fixed, so every run checks the same replies
  const rand = () => { // mulberry32
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (n: number) => Math.floor(rand() * n)
const  pick = (a: string[]) => a[int(a.length)]!
  const [S, P] = SEP as [string, string]
  // Prose lines never open a fence and body lines never close one; an info is mermaid only when trimmed of spaces and tabs.
  const PROSE = ['', 'text', ' x', S + 'y' + P, '``mermaid', '~~', '    ```mermaid', S + '```mermaid', 'a' + S + '~~~', '``` a`b', '```mermaid`']
  const BODY = ['', 'flowchart TD', 'A-->B', S + 'A' + P, '```mermaid', '~~~mermaid', '``` x', '    ```', '```' + S, '~~~' + P, S + '```', '``']
  const MERMAID = ['mermaid', ' mermaid \t', '\tmermaid']
  const OTHER = ['', 'js', 'md' + S + 'x', 'mermaid' + S, P + 'mermaid', 'mermaid' + P, 'mermaid\u0085', 'mermaidx']
  for (let n = 0; n < 600; n++) {
    const want: Segment[] = []
    let reply = ''
let  last = ''
let  from = 0
    const line = (text: string) => {
      last = pick(['\n', '\r\n', '\r'])
      if (text === '' && last === '\n' && reply.endsWith('\r')) { last = '\r\n' } // else the lone CR and this LF read as one CRLF
      reply += text + last
    }
    const blocks = int(7)
    for (let b = 0; b < blocks; b++) {
      if (rand() < 0.4) { line(pick(PROSE)); continue }
      const ch = pick(['`', '~'])
const  other = ch === '`' ? '~' : '`'
const  len = 3 + int(3)
const  at = reply.length
const  isMermaid = rand() < 0.5
      line(' '.repeat(int(4)) + ch.repeat(len) + (isMermaid ? pick(MERMAID) : pick(ch === '`' ? OTHER : [...OTHER, 'a`b'])))
      const bodyAt = reply.length
      for (let k = int(4); k > 0; k--) { line(pick([...BODY, other.repeat(3 + int(3)), ...(len > 3 ? [ch.repeat(len - 1)] : [])])) }
      const body = reply.length > bodyAt ? reply.slice(bodyAt, reply.length - last.length) : ''
      if (b === blocks - 1 && rand() < 0.2) { continue } // the last fence may stay open: prose to the end
      line(' '.repeat(int(4)) + ch.repeat(len + int(2)) + pick(['', ' ', '\t', ' \t ']))
      if (isMermaid) { if (at > from) { want.push(prose(reply.slice(from, at))); } want.push(mermaid(reply.slice(at), body)); from = reply.length }
    }
    if (reply && rand() < 0.3) { // no final line end
      reply = reply.slice(0, -last.length)
      if (from > reply.length) { const end = want.at(-1)!; end.text = end.text.slice(0, -last.length); from = reply.length }
    }
    if (from < reply.length) { want.push(prose(reply.slice(from))) }
    const got = splitFences(reply)
    assert.equal(got.map(x => x.text).join(''), reply, JSON.stringify(reply))
    assert.deepEqual(got, want, JSON.stringify(reply))
  }
})
