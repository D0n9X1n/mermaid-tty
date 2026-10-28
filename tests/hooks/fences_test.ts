import test from 'node:test'
import assert from 'node:assert/strict'
import { splitFences, type Segment } from '../../hooks/fences.ts'

const F = '```mermaid\nflowchart TD\nA-->B\n```\n', CR = 'Hi\r\n```mermaid\r\nflowchart TD\r\nA-->B\r\n```\r\nBye'
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
  const CF = F.replaceAll('\n', '\r\n'), lf = mermaid(F, 'flowchart TD\nA-->B'), crlf = mermaid(CF, 'flowchart TD\r\nA-->B')
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
  ] as const) assert.deepEqual(splitFences(r), [mermaid(r, body)], JSON.stringify(r))
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
  ]) assert.deepEqual(splitFences(r), [prose(r)], JSON.stringify(r))
})

test('A6.hook-tests: a fence closed before a diagram stays prose, and so does one left open after it', () => {
  const D = '```mermaid\nA\n```\n', d = mermaid(D, 'A')
  assert.deepEqual(splitFences('```js\nx\n```\n' + D), [prose('```js\nx\n```\n'), d])
  assert.deepEqual(splitFences('``` a`b\n' + D), [prose('``` a`b\n'), d]) // a backtick in a backtick info: not an opener
  assert.deepEqual(splitFences(D + '```mermaid\nB\n'), [d, prose('```mermaid\nB\n')])
})
