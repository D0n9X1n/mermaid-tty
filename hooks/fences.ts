// Splits a reply at its closed mermaid fences. The segments' texts join back to
// exactly `reply`, CRLF included; an unclosed fence, or one nested in a longer
// fence, stays prose. A diagram's body drops only its last line end.
export type Segment = { kind: 'prose'; text: string } | { kind: 'mermaid'; text: string; body: string }

export function splitFences(reply: string): Segment[] {
  const out: Segment[] = []; let from = 0, pos = 0
  let open: { ch: string; len: number; at: number; bodyAt: number; mermaid: boolean } | null = null
  for (const line of reply.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    const t = line.replace(/\r?\n$/, ''), next = pos + line.length
    if (!open) {
      const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(t)
      if (m && !(m[1]![0] === '`' && m[2]!.includes('`'))) open = { ch: m[1]![0]!, len: m[1]!.length, at: pos, bodyAt: next, mermaid: m[2]!.trim() === 'mermaid' }
    } else {
      const m = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(t)
      if (m && m[1]![0] === open.ch && m[1]!.length >= open.len) {
        if (open.mermaid) {
          if (open.at > from) out.push({ kind: 'prose', text: reply.slice(from, open.at) })
          out.push({ kind: 'mermaid', text: reply.slice(open.at, next), body: reply.slice(open.bodyAt, pos).replace(/\r?\n$/, '') })
          from = next
        }
        open = null
      }
    }
    pos = next
  }
  if (from < reply.length) out.push({ kind: 'prose', text: reply.slice(from) })
  return out
}
