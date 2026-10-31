// Splits a reply at its closed mermaid fences. The segments' texts join back to
// exactly `reply`; an unclosed fence, or one nested in a longer fence, stays prose.
// A diagram's body drops only its last line end. As in CommonMark, a line ends at
// LF, CRLF or a lone CR and nowhere else. U+2028, U+2029 and U+0085 are plain
// characters: no pattern here uses `.`, and an info string is trimmed of spaces and
// tabs only.
export type Segment = { kind: 'prose'; text: string } | { kind: 'mermaid'; text: string; body: string }

const LINE_END = /(?:\r\n|\r|\n)$/

export function splitFences(reply: string): Segment[] {
  const out: Segment[] = []; let from = 0
let  pos = 0
  let open: { ch: string; len: number; at: number; bodyAt: number; mermaid: boolean } | null = null
  for (const line of reply.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) ?? []) {
    const t = line.replace(LINE_END, '')
const  next = pos + line.length
    if (!open) {
      const m = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)$/.exec(t)
      if (m && !(m[1]![0] === '`' && m[2]!.includes('`'))) { open = { ch: m[1]![0]!, len: m[1]!.length, at: pos, bodyAt: next, mermaid: /^[ \t]*mermaid[ \t]*$/.test(m[2]!) } }
    } else {
      const m = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(t)
      if (m && m[1]![0] === open.ch && m[1]!.length >= open.len) {
        if (open.mermaid) {
          if (open.at > from) { out.push({ kind: 'prose', text: reply.slice(from, open.at) }) }
          out.push({ kind: 'mermaid', text: reply.slice(open.at, next), body: reply.slice(open.bodyAt, pos).replace(LINE_END, '') })
          from = next
        }
        open = null
      }
    }
    pos = next
  }
  if (from < reply.length) { out.push({ kind: 'prose', text: reply.slice(from) }) }
  return out
}
