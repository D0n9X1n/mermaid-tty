// Splits a reply at its closed mermaid fences. The segments' texts join back to exactly `reply`; an unclosed fence, or
// one nested in a longer fence, stays prose. A diagram's body drops only its last line end. As in CommonMark, a line
// ends at LF, CRLF or a lone CR and nowhere else. U+2028, U+2029 and U+0085 are plain characters: no pattern here uses
// `.`, an info string is trimmed of spaces and tabs only, and only spaces and tabs make a line blank.
//
// A fence is drawn only when it is certainly a mermaid code block as CommonMark reads the reply, so the Markdown around
// it is followed: list items by their content columns, with lazy continuation and the rule for which items may
// interrupt a paragraph; block quotes at the top level; setext headings; and the paragraph or table a line goes on.
// Where a reply goes beyond that, such as an HTML block, a block quote inside a list item, a quote's lazy line or a
// line that may or may not be a table's, no later diagram is drawn: the rest of the reply stays prose, as written.
export type Segment = { kind: 'prose'; text: string } | { kind: 'mermaid'; text: string; body: string }

const LINE_END = /(?:\r\n|\r|\n)$/
const LINES = /[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g

// The patterns below read a line after its indentation. A fence opener: its run and its info string.
const FENCE = /^(`{3,}|~{3,})([^\r\n]*)$/
// A fence closer.
const CLOSER = /^(`{3,}|~{3,})[ \t]*$/
// A list marker, a bullet or a number with . or ), then its padding and the item's first line, or nothing.
const MARKER = /^([-+*]|\d{1,9}[.)])(?:([ \t]+)([^\r\n]*))?$/
// A thematic break: three or more -, * or _, spaces or tabs between. Not a list item, though `- - -` looks like one.
const BREAK = /^([-*_])(?:[ \t]*\1){2,}[ \t]*$/
const HEADING = /^#{1,6}(?:[ \t]|$)/
// A setext underline, which makes the paragraph above it a heading.
const UNDERLINE = /^(?:=+|-+)[ \t]*$/
// HTML blocks, by CommonMark's start conditions. Raw HTML that runs to its own end marker across blank lines (types 1
// to 5: <pre>, <script>, <style>, <textarea>, a comment, a processing instruction, a declaration or CDATA) is not
// followed. A block-level tag (type 6, such as <details> or <div>) or any other tag alone on its line (type 7, which
// cannot interrupt a paragraph) ends at the next blank line, and is followed: its lines are raw HTML, never fences. An
// autolink such as <https://example.com> starts no block. Type 7 is matched loosely, a tag name at the start and > at
// the end: a line read as HTML here at worst draws no diagram.
const RAW_HTML = /^(?:<(?:pre|script|style|textarea)(?:[ \t>]|$)|<!--|<\?|<![A-Za-z]|<!\[CDATA\[)/i
const BLOCK_TAGS = [
  'address',
  'article',
  'aside',
  'base',
  'basefont',
  'blockquote',
  'body',
  'caption',
  'center',
  'col',
  'colgroup',
  'dd',
  'details',
  'dialog',
  'dir',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'frame',
  'frameset',
  'h[1-6]',
  'head',
  'header',
  'hr',
  'html',
  'iframe',
  'legend',
  'li',
  'link',
  'main',
  'menu',
  'menuitem',
  'nav',
  'noframes',
  'ol',
  'optgroup',
  'option',
  'p',
  'param',
  'search',
  'section',
  'summary',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'title',
  'tr',
  'track',
  'ul',
]
const BLOCK_TAG = new RegExp(`^</?(?:${BLOCK_TAGS.join('|')})(?:[ \t>]|/>|$)`, 'i')
const OTHER_TAG = /^<\/?[A-Za-z][A-Za-z0-9-]*(?:[ \t/][^\r\n]*)?>[ \t]*$/

// The HTML block a line starts, or null: 'raw' for one this scanner does not follow, 'line' for one that ends at a
// blank line. Type 7 cannot interrupt a paragraph, so in one its tag is paragraph text.
function htmlStart(content: string, para: boolean): 'raw' | 'line' | null {
  if (RAW_HTML.test(content)) {
    return 'raw'
  }

  return BLOCK_TAG.test(content) || (!para && OTHER_TAG.test(content)) ? 'line' : null
}
// A line that may be a table's delimiter row: cells of dashes, with a pipe or colon.
const DELIMITER = /^\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/
const isDelimiter = (s: string) => DELIMITER.test(s) && /[|:]/.test(s)

// Blank as CommonMark reads it: spaces and tabs only.
const isBlank = (s: string) => !/[^ \t]/.test(s)

// The column after whitespace ws that starts at column from, a tab reaching the next multiple of four.
function advance(ws: string, from = 0): number {
  let col = from
  for (const ch of ws) {
    col = ch === '\t' ? col + 4 - (col % 4) : col + 1
  }

  return col
}

// The columns of t's leading spaces and tabs.
const indentColumns = (t: string) => advance(/^[ \t]*/.exec(t)![0])

// line without its first n columns of leading whitespace; a tab that straddles column n leaves spaces for the columns
// past it, as CommonMark does.
function stripColumns(line: string, n: number): string {
  let col = 0
  let i = 0
  while (col < n && (line[i] === ' ' || line[i] === '\t')) {
    const end = advance(line[i]!, col)
    if (end > n) {
      return ' '.repeat(end - n) + line.slice(i + 1)
    }

    col = end
    i++
  }

  return line.slice(i)
}

// Whether a fence's info string names mermaid. The letter case doesn't matter, as for Markdown renderers' language
// names; without the u flag, `i` folds only to ASCII letters, so `ı` or `İ` never stand in for `i`.
const isMermaid = (info: string) => /^[ \t]*mermaid[ \t]*$/i.test(info)

// A fence opener, or null: a backtick fence's info string may not hold a backtick; a tilde fence's may.
function fenceAt(content: string): RegExpExecArray | null {
  const f = FENCE.exec(content)
  return f && !(f[1]![0] === '`' && f[2]!.includes('`')) ? f : null
}

// Whether a list marker may interrupt a paragraph: CommonMark lets an item start one only with a bullet or the number
// 1, and only when its first line is not blank. Otherwise the marker is the paragraph's text.
function interrupts(marker: RegExpExecArray): boolean {
  const bullet = /^[-+*]$/.test(marker[1]!)
  return !isBlank(marker[3] ?? '') && (bullet || Number(marker[1]!.slice(0, -1)) === 1)
}

// A diagram's body as CommonMark gives it to Mermaid: each line loses up to `indent` columns of its leading spaces, the
// indentation of the opening fence and its item. null when Markdown renderers disagree on that body: a line that starts
// with some spaces but fewer than `indent`, or with a tab inside them, comes out differently under CommonMark, which
// removes what is there, and marked, which removes nothing. Drawing either reading could show a diagram Mermaid
// doesn't. A line with no indentation reads the same in both, and a blank line loses its spaces either way.
function dedent(body: string, indent: number): string | null {
  if (indent === 0) {
    return body
  }

  let out = ''
  for (const line of body.match(LINES) ?? []) {
    if (line.startsWith(' '.repeat(indent))) {
      out += line.slice(indent)
    } else if (!/^[ \t]/.test(line)) {
      out += line
    } else if (isBlank(line.replace(LINE_END, ''))) {
      out += stripColumns(line, indent)
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
  // The innermost container's last line was paragraph text, which a lazy line may go on and an ordered item numbered
  // other than 1 may not interrupt.
  let para = false
  // The innermost container's last lines may be a table, or a paragraph if they are not one.
  let table = false
  // The last line was in a block quote at the top level.
  let quote = false
  // The last line was in an HTML block at the top level that ends at a blank line.
  let html = false
  // The last line opened a list item with nothing on it. Such an item may start with one blank line, not two: a blank
  // line next leaves it empty, and ends it.
  let fresh = false
  let from = 0
  let pos = 0
  let open: Open | null = null
  let stop = false
  for (let i = 0; i < lines.length && !stop; ) {
    const line = lines[i]!
    const t = line.replace(LINE_END, '')
    const next = pos + line.length
    const blank = isBlank(t)
    const col = indentColumns(t)
    const content = t.replace(/^[ \t]*/, '')
    if (open) {
      if (!blank && col < open.base) {
        // A fence never continues lazily, so this line ends its item and the fence, unclosed; it is read again.
        open = null
        para = false
        table = false
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

    if (fresh) {
      fresh = false
      if (blank) {
        items.pop()
        para = false
        pos = next
        i++
        continue
      }
    }

    if (html) {
      // Raw HTML to the next blank line: no fence opens inside it.
      html = !blank
      para = false
      pos = next
      i++
      continue
    }

    if (quote) {
      const top = col <= 3
      if (blank || (top && content.startsWith('>'))) {
        quote = !blank
        pos = next
        i++
        continue
      }

      // A line without `>` ends the quote when it starts a block; otherwise it may go on the quote's paragraph.
      if (!(top && (fenceAt(content) || HEADING.test(content) || BREAK.test(content) || MARKER.test(content)))) {
        break
      }

      quote = false
      para = false
    }

    if (!blank && col < base()) {
      const rel = col - (items.findLast((b) => b <= col) ?? 0)
      const starts =
        rel <= 3 &&
        (fenceAt(content) !== null ||
          content.startsWith('>') ||
          HEADING.test(content) ||
          BREAK.test(content) ||
          MARKER.test(content))
      if (
        table ||
        (rel <= 3 && htmlStart(content, para) !== null) ||
        (para && (UNDERLINE.test(content) || isDelimiter(content)))
      ) {
        break
      }

      if (para && !starts) {
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
    const fence = rel <= 3 ? fenceAt(content) : null
    const marker = MARKER.exec(content)
    if (blank) {
      para = false
      table = false
    } else if (rel >= 4) {
      // Indented code, or a line that goes on a paragraph or table: neither opens a fence or an item.
    } else if (fence) {
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
      table = false
    } else if (table) {
      // A table and a paragraph agree that a heading or break ends them; for anything else they may not.
      if (HEADING.test(content) || BREAK.test(content)) {
        table = false
      } else if (content.startsWith('>') || /^</.test(content) || marker || UNDERLINE.test(content)) {
        break
      }
    } else if (content.startsWith('>')) {
      if (items.length > 0) {
        break
      }

      quote = true
      para = false
    } else if (htmlStart(content, para) !== null) {
      if (items.length > 0 || htmlStart(content, para) === 'raw') {
        break
      }

      html = true
      para = false
    } else if ((para && UNDERLINE.test(content)) || BREAK.test(content) || HEADING.test(content)) {
      para = false
    } else if (marker && (!para || interrupts(marker))) {
      // An item, and any item its first line starts, as `- - x` starts two.
      let m: RegExpExecArray | null = marker
      let at = col
      let first = ''
      let wide = false
      while (m) {
        first = m[3] ?? ''
        const start = at + m[1]!.length
        const gap = advance(m[2] ?? '', start) - start
        wide = isBlank(first) || gap > 4
        at = wide ? start + 1 : start + gap
        items.push(at)
        m = wide || BREAK.test(first) ? null : MARKER.exec(first)
      }

      fresh = isBlank(first)
      const own = wide ? null : fenceAt(first)
      if (own) {
        open = { ch: own[1]![0]!, len: own[1]!.length, at: pos, bodyAt: next, mermaid: false, indent: 0, base: at }
        para = false
      } else if (!wide && (first.startsWith('>') || htmlStart(first, false) !== null)) {
        break
      } else {
        para = !wide && !HEADING.test(first) && !BREAK.test(first)
      }
    } else if (para && isDelimiter(content)) {
      table = true
      para = false
    } else {
      para = true
    }

    pos = next
    i++
  }

  if (from < reply.length) {
    out.push({ kind: 'prose', text: reply.slice(from) })
  }

  return out
}
