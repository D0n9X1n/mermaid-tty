// A stand-in for the Anthropic Messages API on 127.0.0.1, for the e2e harness's real Claude Code. startMock() answers
// every POST /v1/messages, whatever its query string, with REPLY; REPLY_BTW when the last user message is a side
// question, as /btw asks one, or the system prompt frames one, as mermaid-tty's answer from the conversation does;
// REPLY_CROSS when it contains crossing; or REPLY_LEAD when it contains lead: as SSE when the request has stream: true,
// else as one JSON message. Any other method or path gets an empty 404, CONNECT is refused, and stop() closes every
// connection. holdSide() keeps the next side question unanswered until its release is called, and says through arrived
// when that question has come in, so a scenario can read the screen while a /btw is being answered. Node built-ins
// only, so the main suite needs nothing installed.
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { REPLY, REPLY_BTW, REPLY_CROSS, REPLY_LEAD } from './reply.ts'

// text in runs of at most 64 code points, one per text delta. A string iterates by code point, so no run splits a
// surrogate pair.
export function chunks(text: string): string[] {
  const points = [...text]
  const out: string[] = []
  for (let i = 0; i < points.length; i += 64) {
    out.push(points.slice(i, i + 64).join(''))
  }

  return out
}

// One event in the Messages API's SSE wire format; its data's type is the event's name.
const sse = (event: string, data: object) => `event: ${event}\ndata: ${JSON.stringify({ type: event, ...data })}\n\n`

// What the mock reads of a request; any of it may be missing or malformed.
type Body = { model?: unknown; stream?: unknown; system?: unknown; messages?: unknown }

// The request's JSON body, or {} when it is not a JSON object, so that every POST still gets a reply.
function parse(raw: string): Body {
  try {
    const v: unknown = JSON.parse(raw)
    return typeof v === 'object' && v !== null ? (v as Body) : {}
  } catch {
    return {}
  }
}

// Whether the last user message contains word. Its content is a string or an array of blocks, of which a text block has
// text; any other block, a malformed message and a malformed block are skipped.
function lastAsks(messages: unknown, word: string): boolean {
  if (!Array.isArray(messages)) {
    return false
  }

  const content = messages.findLast((m) => m?.role === 'user')?.content
  if (typeof content === 'string') {
    return content.includes(word)
  }

  const texts = Array.isArray(content) ? content.map((b) => b?.text) : []
  return texts.some((t) => typeof t === 'string' && t.includes(word))
}

// Whether the system prompt, a string or text blocks, contains word.
function systemAsks(system: unknown, word: string): boolean {
  const texts = Array.isArray(system) ? system.map((b) => b?.text) : [system]
  return texts.some((t) => typeof t === 'string' && t.includes(word))
}

// The reply for a request's messages and system prompt: a side question first, since its prompt may hold any word.
export function replyFor(messages: unknown, system?: unknown): string {
  if (lastAsks(messages, 'side question') || systemAsks(system, 'side question')) {
    return REPLY_BTW
  }

  if (lastAsks(messages, 'crossing')) {
    return REPLY_CROSS
  }

  return lastAsks(messages, 'lead') ? REPLY_LEAD : REPLY
}

export type Hold = { release(): void; arrived: Promise<void> }
export type Mock = { url: string; stop(): Promise<void>; holdSide(): Hold }

export async function startMock(): Promise<Mock> {
  let n = 0
  // The hold the next side question waits on, taken by that request, and how it says it came in; null when side
  // questions are answered at once.
  let sideHold: { until: Promise<void>; came: () => void } | null = null
  const server = createServer(async (req, res) => {
    // The path, without its query string: the SDK posts to /v1/messages?beta=true.
    if (req.method !== 'POST' || req.url?.split('?')[0] !== '/v1/messages') {
      res.writeHead(404).end()
      return
    }

    const parts: Buffer[] = []
    // A request aborted before its body is whole, as stop() aborts one, has no client left to answer.
    try {
      for await (const c of req) {
        parts.push(c)
      }
    } catch {
      return
    }

    const body = parse(Buffer.concat(parts).toString('utf8'))
    const text = replyFor(body.messages, body.system)
    if (text === REPLY_BTW && sideHold) {
      const hold = sideHold
      sideHold = null
      hold.came()
      await hold.until
    }

    const pieces = chunks(text)
    const message = {
      id: `msg_mock_${++n}`,
      type: 'message',
      role: 'assistant',
      content: [],
      model: body.model ?? '',
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    }
    if (body.stream !== true) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          ...message,
          content: [{ type: 'text', text }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: pieces.length },
        }),
      )
      return
    }

    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.end(
      [
        sse('message_start', { message }),
        sse('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }),
        ...pieces.map((text) => sse('content_block_delta', { index: 0, delta: { type: 'text_delta', text } })),
        sse('content_block_stop', { index: 0 }),
        sse('message_delta', {
          delta: { stop_reason: 'end_turn', stop_sequence: null },
          usage: { output_tokens: pieces.length },
        }),
        sse('message_stop', {}),
      ].join(''),
    )
  })
  // Refuse CONNECT: a client that uses the mock as a proxy gets no tunnel to a real host. Node closes an unheard
  // CONNECT too; this listener makes the refusal the mock's own.
  server.on('connect', (_r, s) => s.destroy())
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  // stop() closes every open connection too, idle or mid-request, so a test never waits on a client.
  const stop = () =>
    new Promise<void>((resolve, reject) => {
      server.close((e) => (e ? reject(e) : resolve()))
      server.closeAllConnections()
    })
  const holdSide = (): Hold => {
    let release: () => void = () => {}
    let came: () => void = () => {}
    const until = new Promise<void>((resolve) => (release = resolve))
    const arrived = new Promise<void>((resolve) => (came = resolve))
    sideHold = { until, came }
    return { release, arrived }
  }
  return { url: `http://127.0.0.1:${port}`, stop, holdSide }
}
