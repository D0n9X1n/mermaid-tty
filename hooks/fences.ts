// Splits a reply at its closed mermaid fences. The segments' texts join back to exactly `reply`; an unclosed fence, or
// one nested in a longer fence, stays prose. A diagram's body drops only its last line end. As in CommonMark, a line
// ends at LF, CRLF or a lone CR and nowhere else. U+2028, U+2029 and U+0085 are plain characters: no pattern here uses
// `.`, and an info string is trimmed of spaces and tabs only.
//
// List items are followed as CommonMark reads them, so a fence inside one ends where the item ends, and the item's
// lines are never taken for top-level ones: each item has a content column, a line indented less than it ends the item
// unless it continues the item's paragraph lazily, and a fence never continues lazily. Block quotes are not followed; a
// fence inside one stays prose.
export type Segment = { kind: 'prose'; text: string } | { kind: 'mermaid'; text: string; body: string }

const LINE_END = /(?:\r\n|\r|\n)$/
const LINES = /[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g

// After a line's indentation: a fence opener, its run and its info string.
const FENCE = /^(`{3,}|~{3,})([^\r\n]*)$/
// After a line's indentation: a fence closer.
const CLOSER = /^(`{3,}|~{3,})[ \t]*$/
// After a line's indentation: a list marker, a bullet or a number with . or ), then the spaces and the item's first
// line, or nothing.
const MARKER = /^([-+*]|\d{1,9}[.)])(?:( +)([^\r\n]*))?$/
// After a line's indentation: a thematic break, three or more -, * or _ with spaces or tabs between. It is not a list
// item, though `- - -` looks like one.
const BREAK = /^([-*_])(?:[ \t]*\1){2,}[ \t]*$/
const HEADING = /^#{1,6}(?:[ \t]|$)/

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

// Whether content, indented rel columns into its container, starts a block, so it cannot continue a paragraph lazily.
// Four or more columns is indented code, which cannot interrupt a paragraph.
function startsBlock(content: string, rel: number): boolean {
  const f = FENCE.exec(content)
  return (
    rel <= 3 &&
    ((f !== null && opens(f[1]![0]!, f[2]!)) ||
      content.startsWith('>') ||
      HEADING.test(content) ||
      BREAK.test(content) ||
      MARKER.test(content))
  )
}

// A diagram's body as CommonMark gives it to Mermaid: each line loses up to `indent` of its leading spaces, the
// indentation of the opening fence. null when Markdown renderers disagree on that body: a line that starts with some
// spaces but fewer than `indent`, or with a tab inside them, comes out differently under CommonMark, which removes what
// is there, and marked, which removes nothing. Drawing either reading could show a diagram Mermaid doesn't. A line with
// no indentation reads the same in both, and a blank line loses its spaces either way.
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
  // drawn when closed: a mermaid fence indented at most three spaces, not on a list item's own line, where the bullet
  // or number shares its line and a drawing would drop it
  mermaid: boolean
  // the opener's indentation, which leaves each body line
  indent: number
  // the content column of the list item it is in, 0 at the top level: its closer starts within three columns of it, and
  // a line indented less ends it unclosed
  base: number
}

export function splitFences(reply: string): Segment[] {
  const out: Segment[] = []
  const lines = reply.match(LINES) ?? []
  // The content column of each open list item, innermost last.
  const items: number[] = []
  const base = () => items.at(-1) ?? 0
  // Whether the last line was paragraph text in the innermost container, which a lazy line may continue and an ordered
  // item numbered other than 1 may not interrupt.
  let para = false
  let from = 0
  let pos = 0
  let open: Open | null = null
  for (let i = 0; i < lines.length; ) {
    const line = lines[i]!
    const t = line.replace(LINE_END, '')
    const next = pos + line.length
    const blank = !/[^ \t]/.test(t)
    const col = indentColumns(t)
    const content = t.replace(/^[ \t]*/, '')
    if (open) {
      if (!blank && col < open.base) {
        // A fence never continues lazily, so this line ends its item and the fence, unclosed; it is read again.
        open = null
        para = false
        continue
      }

      const m = CLOSER.exec(content)
      const shift = col - open.base
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

      pos = next
      i++
      continue
    }

    if (!blank && col < base()) {
      const parent = items.findLast((b) => b <= col) ?? 0
      if (para && !startsBlock(content, col - parent)) {
        // A lazy line: it goes on with the item's paragraph.
        pos = next
        i++
        continue
      }

      // The line ends each item it is indented less than, and is read again in the container it falls into.
      while (items.length > 0 && col < base()) {
        items.pop()
      }

      para = false
      continue
    }

    const rel = col - base()
    const fence = FENCE.exec(content)
    const marker = MARKER.exec(content)
    if (blank) {
      para = false
    } else if (rel >= 4) {
      // Indented code, or a paragraph's continuation: neither opens a fence or an item.
    } else if (fence && opens(fence[1]![0]!, fence[2]!)) {
      const spaces = /^ */.exec(t)![0].length === col
      open = {
        ch: fence[1]![0]!,
        len: fence[1]!.length,
        at: pos,
        bodyAt: next,
        mermaid: isMermaid(fence[2]!) && col <= 3 && spaces,
        indent: col,
        base: base(),
      }
      para = false
    } else if (BREAK.test(content)) {
      para = false
    } else if (marker && !(para && !interrupts(marker))) {
      const first = marker[3] ?? ''
      const gap = marker[2]?.length ?? 0
      const wide = first.trim() === '' || gap > 4
      const item = wide ? col + marker[1]!.length + 1 : col + marker[1]!.length + gap
      items.push(item)
      const own = wide ? null : FENCE.exec(first)
      if (own && opens(own[1]![0]!, own[2]!)) {
        open = { ch: own[1]![0]!, len: own[1]!.length, at: pos, bodyAt: next, mermaid: false, indent: 0, base: item }
        para = false
      } else {
        para = !wide && !HEADING.test(first)
      }
    } else {
      para = !HEADING.test(content)
    }

    pos = next
    i++
  }

  if (from < reply.length) {
    out.push({ kind: 'prose', text: reply.slice(from) })
  }

  return out
}

// Whether a list marker may interrupt a paragraph: CommonMark lets an item start one only with a bullet or the number
// 1, and only when its first line is not blank. Otherwise the marker is the paragraph's text.
function interrupts(marker: RegExpExecArray): boolean {
  const first = marker[3] ?? ''
  const bullet = /^[-+*]$/.test(marker[1]!)
  return first.trim() !== '' && (bullet || Number(marker[1]!.slice(0, -1)) === 1)
}
