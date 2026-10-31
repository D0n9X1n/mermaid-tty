// The e2e package's mock Messages API and its scripted replies. The e2e harness points a real Claude Code at the mock
// and checks how mermaid-tty draws REPLY's fences. Node built-ins only, so the main suite runs this with nothing installed.
import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { connect } from 'node:net'
import { setTimeout as sleep } from 'node:timers/promises'
import { chunks, startMock } from '../../scripts/e2e/mock.ts'
import { REPLY, REPLY_LEAD } from '../../scripts/e2e/reply.ts'
import { splitFences } from '../../hooks/fences.ts'

// Every "text" field of an SSE body, in order, joined: a stream's deltas, reassembled.
const text = (sse: string) => [...sse.matchAll(/"text":"((?:[^"\\]|\\.)*)"/g)].map(m => JSON.parse(`"${m[1]}"`)).join('')

// The events of an SSE body, in order. Each must be exactly `event: <name>\ndata: <json>\n\n`, the Messages API's wire format.
function events(sse: string): { event: string; data: any }[] {
  assert.ok(sse.endsWith('\n\n'), `the stream does not end with a blank line: ${JSON.stringify(sse.slice(-20))}`)
  return sse.slice(0, -2).split('\n\n').map(block => {
    const m = /^event: ([a-z_]+)\ndata: ([^\n]+)$/.exec(block)
    assert.ok(m, `not an SSE event: ${JSON.stringify(block)}`)
    return { event: m[1]!, data: JSON.parse(m[2]!) }
  })
}
// A streamed POST /v1/messages whose one user message is content; resolves to the response's text.
const stream = (url: string, content: unknown) =>
  fetch(`${url}/v1/messages`, { method: 'POST', body: JSON.stringify({ stream: true, messages: [{ role: 'user', content }] }) }).then(r => r.text())

test('A9.harness: the mock streams REPLY to every concurrent POST /v1/messages; other paths 404', async () => {
  const m = await startMock()
  try {
    const post = () => fetch(`${m.url}/v1/messages`, { method: 'POST', body: JSON.stringify({ stream: true, messages: [] }) }).then(r => r.text())
    for (const s of await Promise.all([post(), post()])) { assert.equal(text(s), REPLY); assert.match(s, /event: message_stop/) }
    assert.equal(text(await fetch(`${m.url}/v1/messages`, { method: 'POST', body: JSON.stringify({ stream: true, messages: [{ role: 'user', content: 'lead' }] }) }).then(r => r.text())), REPLY_LEAD)
    assert.equal((await fetch(`${m.url}/v1/other`)).status, 404)
  } finally { await m.stop() }
})

test('A9.harness: REPLY has prose, a CJK flowchart, a sequence, an unsupported diagram and an unclosed fence', () => {
  for (const s of ['读取配置文件', 'sequenceDiagram', 'flowchart-elk TD']) { assert.ok(REPLY.includes(s), s) }
  assert.match(REPLY, /`{3}mermaid\nflowchart TD\nA --> B\n?$/)
})

test('A9.harness: REPLY and REPLY_LEAD are the scripted replies, line for line, with LF line ends', () => {
  assert.equal(REPLY, [
    'Here is the config flow:',
    '',
    '```mermaid',
    'flowchart LR',
    'A[读取配置文件] -->|成功| B{完成?}',
    'B --> C([结束])',
    '```',
    '',
    'And the handshake:',
    '',
    '```mermaid',
    'sequenceDiagram',
    'participant U as User',
    'U->>S: ping',
    'S-->>U: pong',
    '```',
    '',
    'This one stays source:',
    '',
    '```mermaid',
    'flowchart-elk TD',
    'X --> Y',
    '```',
    '',
    'Unclosed:',
    '',
    '```mermaid',
    'flowchart TD',
    'A --> B',
  ].join('\n'))
  assert.equal(REPLY_LEAD, ['```mermaid', 'flowchart TD', 'S[开始] --> E[结束]', '```', '', 'After the diagram.'].join('\n'))
})

test("A9.harness: mermaid-tty's fence splitter finds REPLY's three closed diagrams, keeps its unclosed fence as prose, and finds REPLY_LEAD's diagram first", () => {
  const segments = splitFences(REPLY)
  assert.deepEqual(segments.map(s => s.kind), ['prose', 'mermaid', 'prose', 'mermaid', 'prose', 'mermaid', 'prose'])
  assert.deepEqual(segments.flatMap(s => (s.kind === 'mermaid' ? [s.body] : [])), [
    'flowchart LR\nA[读取配置文件] -->|成功| B{完成?}\nB --> C([结束])',
    'sequenceDiagram\nparticipant U as User\nU->>S: ping\nS-->>U: pong',
    'flowchart-elk TD\nX --> Y',
  ])
  assert.equal(segments.at(-1)?.text, '\nUnclosed:\n\n```mermaid\nflowchart TD\nA --> B')
  assert.deepEqual(splitFences(REPLY_LEAD).map(s => s.kind), ['mermaid', 'prose'])
})

// U+1F600, an astral character: two UTF-16 code units, four UTF-8 bytes. 读, a CJK character: one code unit, three bytes.
const ASTRAL = '\u{1F600}'
const  CJK = '读'
test('A9.harness: chunks splits text into runs of 64 code points, never inside a surrogate pair or a character', () => {
  // Code unit 64 is the astral character's second half: a split by code units leaves a lone surrogate in each run.
  assert.deepEqual(chunks('a'.repeat(63) + ASTRAL + 'b'), ['a'.repeat(63) + ASTRAL, 'b'])
  assert.deepEqual(chunks(ASTRAL.repeat(65)), [ASTRAL.repeat(64), ASTRAL])
  // Byte 64 falls inside the 22nd 读; a split by UTF-8 bytes cuts it.
  assert.deepEqual(chunks(CJK.repeat(65)), [CJK.repeat(64), CJK])
  assert.deepEqual(chunks('x'.repeat(64)), ['x'.repeat(64)])
})

test('A9.harness: the stream carries REPLY in one text delta per 64 code points, whose texts join back to REPLY exactly, CJK included', async () => {
  const m = await startMock()
  try {
    const deltas = events(await stream(m.url, 'hi')).filter(e => e.event === 'content_block_delta').map(e => e.data.delta.text as string)
    assert.deepEqual(deltas.map(d => [...d].length), [64, 64, 64, 64, 44])
    assert.equal(deltas.join(''), REPLY)
    // Code point 64 falls just before 成功: the first delta ends `-->|`, the second opens with CJK.
    assert.ok(deltas[0]!.endsWith('A[读取配置文件] -->|'), deltas[0])
    assert.ok(deltas[1]!.startsWith('成功| B{完成?}'), deltas[1])
    assert.deepEqual(events(await stream(m.url, 'lead')).filter(e => e.event === 'content_block_delta').map(e => e.data.delta.text), [REPLY_LEAD])
  } finally { await m.stop() }
})

test('A9.harness: a stream is message_start, content_block_start, the deltas, content_block_stop, message_delta, message_stop, each exact', async () => {
  const m = await startMock()
  try {
    const r = await fetch(`${m.url}/v1/messages`, { method: 'POST', body: JSON.stringify({ model: 'claude-test', stream: true, messages: [{ role: 'user', content: 'hi' }] }) })
    assert.equal(r.status, 200)
    assert.equal(r.headers.get('content-type'), 'text/event-stream')
    const body = await r.text()
const  list = events(body)
    const deltas = list.filter(e => e.event === 'content_block_delta').map(e => e.data.delta.text as string)
    assert.equal(deltas.length, 5)
    assert.deepEqual(list, [
      { event: 'message_start', data: { type: 'message_start', message: { id: 'msg_mock_1', type: 'message', role: 'assistant', content: [], model: 'claude-test', stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } } },
      { event: 'content_block_start', data: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } },
      ...deltas.map(text => ({ event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } } })),
      { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
      { event: 'message_delta', data: { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 5 } } },
      { event: 'message_stop', data: { type: 'message_stop' } },
    ])
    // The wire bytes of the last event, exactly: one space after each colon, compact JSON, a blank line after.
    assert.ok(body.endsWith('}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n'), JSON.stringify(body.slice(-60)))
    // Each request gets its own message id.
    assert.equal(events(await stream(m.url, 'hi'))[0]?.data.message.id, 'msg_mock_2')
  } finally { await m.stop() }
})

test('A9.harness: without stream: true the reply is one JSON message of the same shape, its content the whole text', async () => {
  const m = await startMock()
  try {
    const post = (body: object) => fetch(`${m.url}/v1/messages`, { method: 'POST', body: JSON.stringify(body) })
    const r = await post({ model: 'claude-test', messages: [{ role: 'user', content: 'hi' }] })
    assert.equal(r.status, 200)
    assert.equal(r.headers.get('content-type'), 'application/json')
    assert.deepEqual(await r.json(), { id: 'msg_mock_1', type: 'message', role: 'assistant', content: [{ type: 'text', text: REPLY }], model: 'claude-test', stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 5 } })
    // stream: false is not streamed either; a request without a model gets model ''.
    assert.deepEqual(await (await post({ stream: false, messages: [{ role: 'user', content: 'lead' }] })).json(), { id: 'msg_mock_2', type: 'message', role: 'assistant', content: [{ type: 'text', text: REPLY_LEAD }], model: '', stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } })
  } finally { await m.stop() }
})

// stream must be the boolean true: a truthy "false" or 1 gets JSON, as a missing stream does.
test('A9.harness: only stream: true streams; stream "false", stream 1 and no stream each get one JSON message', async () => {
  const m = await startMock()
  try {
    const post = (body: object) => fetch(`${m.url}/v1/messages`, { method: 'POST', body: JSON.stringify({ ...body, messages: [{ role: 'user', content: 'hi' }] }) })
    for (const body of [{ stream: 'false' }, { stream: 1 }, {}]) {
      const r = await post(body)
      assert.equal(r.headers.get('content-type'), 'application/json', JSON.stringify(body))
      const { type, content } = await r.json()
      assert.deepEqual({ type, content }, { type: 'message', content: [{ type: 'text', text: REPLY }] }, JSON.stringify(body))
    }
    const r = await post({ stream: true })
const  sse = await r.text()
    assert.equal(r.headers.get('content-type'), 'text/event-stream')
    assert.equal(events(sse).at(-1)?.event, 'message_stop')
    assert.equal(text(sse), REPLY)
  } finally { await m.stop() }
})

test('A9.harness: the body {"stream":"true"}, a string and not the boolean, gets one JSON message, not an event stream', async () => {
  const m = await startMock()
  try {
    const r = await fetch(`${m.url}/v1/messages`, { method: 'POST', body: '{"stream":"true"}' })
    assert.equal(r.headers.get('content-type'), 'application/json')
    assert.deepEqual(await r.json(), { id: 'msg_mock_1', type: 'message', role: 'assistant', content: [{ type: 'text', text: REPLY }], model: '', stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 5 } })
  } finally { await m.stop() }
})

test('A9.harness: array-form user content gets REPLY_LEAD when one of its text blocks contains lead', async () => {
  const m = await startMock()
  try {
    assert.equal(text(await stream(m.url, [{ type: 'text', text: 'lead' }])), REPLY_LEAD)
    // Claude Code may send a system reminder as a text block of its own, before the prompt's.
    assert.equal(text(await stream(m.url, [{ type: 'text', text: '<system-reminder>x</system-reminder>' }, { type: 'text', text: 'draw the lead diagram' }])), REPLY_LEAD)
    assert.equal(text(await stream(m.url, [{ type: 'text', text: 'hi' }])), REPLY)
    // Only text blocks count: lead inside an image block's data does not.
    assert.equal(text(await stream(m.url, [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'lead' } }, { type: 'text', text: 'hi' }])), REPLY)
  } finally { await m.stop() }
})

test('A9.harness: only the last user message picks the reply; lead in an earlier user message or an assistant message does not', async () => {
  const m = await startMock()
  try {
    const post = (messages: object[]) => fetch(`${m.url}/v1/messages`, { method: 'POST', body: JSON.stringify({ stream: true, messages }) }).then(r => r.text())
    assert.equal(text(await post([{ role: 'user', content: 'lead' }, { role: 'assistant', content: 'ok' }, { role: 'user', content: 'hi' }])), REPLY)
    assert.equal(text(await post([{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'lead' }, { role: 'user', content: 'again' }])), REPLY)
    // After an assistant prefill, the last user message still decides.
    assert.equal(text(await post([{ role: 'user', content: 'lead' }, { role: 'assistant', content: 'Sure' }])), REPLY_LEAD)
    assert.equal(text(await post([{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'lead' }])), REPLY)
  } finally { await m.stop() }
})

test('A9.harness: POST /v1/messages is answered whatever its query string, as the SDK sends ?beta=true; other methods and paths get an empty 404', async () => {
  const m = await startMock()
  try {
    const r = await fetch(`${m.url}/v1/messages?beta=true`, { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }) })
    assert.equal(r.status, 200)
    assert.equal((await r.json()).content[0].text, REPLY)
    for (const [method, path] of [['GET', '/v1/messages'], ['PUT', '/v1/messages'], ['POST', '/v1/messages/count_tokens'], ['POST', '/v1/message'], ['POST', '/']]) {
      const res = await fetch(`${m.url}${path}`, { method, ...(method === 'GET' ? {} : { body: '{}' }) })
      assert.equal(res.status, 404, `${method} ${path}`)
      assert.equal(await res.text(), '', `${method} ${path}`)
    }
  } finally { await m.stop() }
})

test('A9.harness: every POST /v1/messages is answered, even one whose body is empty, not JSON, not an object, or holds malformed messages', async () => {
  const m = await startMock()
  try {
    const cases: [string, string][] = [
      ['', REPLY],
      ['not json', REPLY],
      ['null', REPLY],
      ['[]', REPLY],
      ['{"messages":"lead"}', REPLY],
      // A null message after the last user message, and a null block in its content, are skipped.
      ['{"messages":[{"role":"user","content":[null,{"type":"text","text":"lead"}]},null]}', REPLY_LEAD],
    ]
    for (const [body, reply] of cases) {
      const r = await fetch(`${m.url}/v1/messages`, { method: 'POST', body })
      assert.equal(r.status, 200, body)
      assert.deepEqual((await r.json()).content, [{ type: 'text', text: reply }], body)
    }
  } finally { await m.stop() }
})

// Resolves to 'timed out' after 2 s, without keeping the process alive: a race's other side that should win first.
const late = () => sleep(2000, 'timed out', { ref: false })
test('A9.harness: stop() resolves, closing a connection that a client holds open mid-request', async () => {
  const m = await startMock()
  // The client sends a request's headers and promises a body it never sends. Node answers 100 Continue once the mock's
  // handler is waiting on that body, so the connection is busy, not idle, when stop() is called.
  const c = connect(Number(new URL(m.url).port), '127.0.0.1').on('error', () => {})
  const closed = new Promise<string>(resolve => c.once('close', () => resolve('closed')))
  let stopping: Promise<void> | undefined
  try {
    c.write('POST /v1/messages HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 100\r\nExpect: 100-continue\r\n\r\n')
    assert.equal(await Promise.race([once(c, 'data').then(([d]) => String(d)), late()]), 'HTTP/1.1 100 Continue\r\n\r\n')
    stopping = m.stop()
    assert.equal(await Promise.race([stopping.then(() => 'stopped'), late()]), 'stopped')
    assert.equal(await Promise.race([closed, late()]), 'closed')
  } finally { c.destroy(); await (stopping ?? m.stop()) }
})

test('A9.harness: the mock refuses CONNECT, closing the connection without a byte of reply, so nothing tunnels through it', async () => {
  const m = await startMock()
  const c = connect(Number(new URL(m.url).port), '127.0.0.1').on('error', () => {})
  const got: Buffer[] = []
  c.on('data', d => got.push(d))
  const closed = new Promise<string>(resolve => c.once('close', () => resolve('closed')))
  try {
    c.write('CONNECT api.anthropic.com:443 HTTP/1.1\r\nHost: api.anthropic.com:443\r\n\r\n')
    assert.equal(await Promise.race([closed, late()]), 'closed')
    assert.equal(Buffer.concat(got).toString(), '')
  } finally { c.destroy(); await m.stop() }
})
