// Splits a reply at its closed mermaid fences. The segments' texts join back to exactly `reply`; an unclosed fence, or
// one nested in a longer fence, stays prose. A diagram's body drops only its last line end. As in CommonMark, a line
// ends at LF, CRLF or a lone CR and nowhere else. U+2028, U+2029 and U+0085 are plain characters: no pattern here uses
// `.`, and an info string is trimmed of spaces and tabs only.
export type Segment = { kind: 'prose'; text: string } | { kind: 'mermaid'; text: string; body: string }

const LINE_END = /(?:\r\n|\r|\n)$/
const LINES = /[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g

// A fence at the top level: up to three spaces, then three or more backticks or tildes and the info string.
const OPENER = /^( {0,3})(`{3,}|~{3,})([^\r\n]*)$/

// A fence on a list item's own line, such as `- ```js` or `1. ~~~`. CommonMark reads it as a fence inside the item,
// closed by a fence at the item's content column. It is never drawn: the bullet or number shares its line, and a
// drawing there would drop it. It is still read to its end, so its closing line, indented to the item, never opens a
// new fence that would swallow the rest of the reply.
const ITEM_OPENER = /^( {0,3})([-+*]|\d{1,9}[.)])( {1,4})(`{3,}|~{3,})([^\r\n]*)$/

// The columns of t's leading spaces and tabs, a tab reaching the next multiple of four, as CommonMark counts them.
function indentColumns(t: string): number {
  let col = 0
  for (const ch of /^[ \t]*/.exec(t)![0]) {
    col = ch === '\t' ? col + 4 - (col % 4) : col + 1
  }

  return col
}

// Whether a fence's info string names mermaid. The letter case doesn't matter, as for Markdown renderers' language
// names; without the u flag, `i` folds only to ASCII letters, so `ı` or `İ` never stand in for `i`.
const isMermaid = (info: string) => /^[ \t]*mermaid[ \t]*$/i.test(info)

// A backtick fence's info string may not hold a backtick; a tilde fence's may.
const opens = (ch: string, info: string) => !(ch === '`' && info.includes('`'))

// A diagram's body as CommonMark gives it to Mermaid: each line loses up to `indent` of its leading spaces, the
// indentation of the opening fence. null when Markdown renderers disagree on that body: a line that starts with fewer
// spaces than `indent`, or with a tab inside them, comes out differently under CommonMark, which removes what is there,
// and marked, which removes nothing. Drawing either reading could show a diagram Mermaid doesn't. A blank line loses
// its spaces either way.
function dedent(body: string, indent: number): string | null {
  if (indent === 0) {
    return body
  }

  let out = ''
  for (const line of body.match(LINES) ?? []) {
    const lead = /^[ \t]*/.exec(line)![0]
    const blank = /^[ \t]*(?:\r\n|\r|\n)?$/.test(line)
    if (line.startsWith(' '.repeat(indent))) {
      out += line.slice(indent)
    } else if (lead === '') {
      out += line
    } else if (blank) {
      out += line.slice(Math.min(indent, /^ */.exec(line)![0].length))
    } else {
      return null
    }
  }

  return out
}

type Open = {
  ch: string
  len: number
  at: number
  bodyAt: number
  mermaid: boolean
  // the opener's own indentation, which leaves each body line; 0 for a list item's fence
  indent: number
  // a list item's content column, which the item's lines keep and its closer starts within three of; 0 at the top level
  base: number
}

export function splitFences(reply: string): Segment[] {
  const out: Segment[] = []
  const lines = reply.match(LINES) ?? []
  let from = 0
  let pos = 0
  let open: Open | null = null
  for (let i = 0; i < lines.length; ) {
    const line = lines[i]!
    const t = line.replace(LINE_END, '')
    const next = pos + line.length
    if (open && open.base > 0 && /[^ \t]/.test(t) && indentColumns(t) < open.base) {
      // A line indented less than the item ends the item, and its fence unclosed: no lazy continuation inside a fence.
      // The line is read again at the top level.
      open = null
      continue
    }

    if (!open) {
      const top = OPENER.exec(t)
      const item = top ? null : ITEM_OPENER.exec(t)
      if (top && opens(top[2]![0]!, top[3]!)) {
        const ch = top[2]!
        open = {
          ch: ch[0]!,
          len: ch.length,
          at: pos,
          bodyAt: next,
          mermaid: isMermaid(top[3]!),
          indent: top[1]!.length,
          base: 0,
        }
      } else if (item && opens(item[4]![0]!, item[5]!)) {
        const ch = item[4]!
        const base = item[1]!.length + item[2]!.length + item[3]!.length
        open = { ch: ch[0]!, len: ch.length, at: pos, bodyAt: next, mermaid: false, indent: 0, base }
      }
    } else {
      const m = /^[ \t]*(`{3,}|~{3,})[ \t]*$/.exec(t)
      const shift = indentColumns(t) - open.base
      if (m && shift >= 0 && shift <= 3 && m[1]![0] === open.ch && m[1]!.length >= open.len) {
        const body = open.mermaid ? dedent(reply.slice(open.bodyAt, pos).replace(LINE_END, ''), open.indent) : null
        if (body !== null) {
          if (open.at > from) {
            out.push({ kind: 'prose', text: reply.slice(from, open.at) })
          }

          out.push({ kind: 'mermaid', text: reply.slice(open.at, next), body })
          from = next
        }

        open = null
      }
    }

    pos = next
    i++
  }

  if (from < reply.length) {
    out.push({ kind: 'prose', text: reply.slice(from) })
  }

  return out
}
