// A stand-in for the Anthropic Messages API on 127.0.0.1, for the e2e harness's real Claude Code. startMock() answers
// every POST /v1/messages, whatever its query string, with REPLY, or REPLY_LEAD when the last user message contains
// lead: as SSE when the request has stream: true, else as one JSON message. Any other method or path gets an empty 404,
// CONNECT is refused, and stop() closes every connection. Node built-ins only, so the main suite needs nothing installed.
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { REPLY, REPLY_LEAD } from './reply.ts'

// text in runs of at most 64 code points, one per text delta. A string iterates by code point, so no run splits a surrogate pair.
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
type Body = { model?: unknown; stream?: unknown; messages?: unknown }

// The request's JSON body, or {} when it is not a JSON object, so that every POST still gets a reply.
function parse(raw: string): Body {
  try {
    const v: unknown = JSON.parse(raw)
    return typeof v === 'object' && v !== null ? (v as Body) : {}
  } catch {
    return {}
  }
}

// Whether the last user message contains lead. Its content is a string or an array of blocks, of which a text block has
// text; any other block, a malformed message and a malformed block are skipped.
function wantsLead(messages: unknown): boolean {
  if (!Array.isArray(messages)) {
    return false
  }
  const content = messages.findLast((m) => m?.role === 'user')?.content
  const texts = typeof content === 'string' ? [content] : Array.isArray(content) ? content.map((b) => b?.text) : []
  return texts.some((t) => typeof t === 'string' && t.includes('lead'))
}

export async function startMock(): Promise<{ url: string; stop(): Promise<void> }> {
  let n = 0
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
    const text = wantsLead(body.messages) ? REPLY_LEAD : REPLY
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
  // Refuse CONNECT: a client that uses the mock as a proxy gets no tunnel to a real host. Node closes an unheard CONNECT
  // too; this listener makes the refusal the mock's own.
  server.on('connect', (_r, s) => s.destroy())
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  // stop() closes every open connection too, idle or mid-request, so a test never waits on a client.
  const stop = () =>
    new Promise<void>((resolve, reject) => {
      server.close((e) => (e ? reject(e) : resolve()))
      server.closeAllConnections()
    })
  return { url: `http://127.0.0.1:${port}`, stop }
}
