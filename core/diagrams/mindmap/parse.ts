// Reads a mindmap (plan C, T76; matrix, mindmap) into its model: one root and its children by indentation, each node's
// shape and label lines, the title and colorBy. Anything Mermaid 12.2.0's mindmap.jison reads otherwise fails, so the
// fence draws as source.
import { fail, isFail, type Fail } from '../../fail.ts'
import type { Source } from '../../source.ts'
import { drawable, labelLines, styled } from '../../text.ts'
import { unsupported } from '../../width.ts'

export type Shape = 'plain' | 'rect' | 'round' | 'circle' | 'bang' | 'cloud' | 'hexagon'
// k is the node's index in source order, the root's 0, used for owners.
export type MNode = { k: number; shape: Shape; lines: string[]; children: MNode[] }
export type Mindmap = { title: string | null; colorBy: 'branch' | 'depth'; root: MNode }

// Ends the walk: parseMindmap returns this Fail.
function stop(reason: string): never { throw fail(reason) }

// Fails 'header'; 'empty' (from readSource); 'root:<n>' (a node with no parent: a second root); 'syntax:<n>' (a line
// the grammar reads otherwise or rejects); 'markdown:<n>', 'blank:<n>', 'entity:<n>', 'html:<n>' (a label Mermaid shows
// otherwise or this layout cannot draw); or 'unsupported-char U+XXXX'.
export function parseMindmap(src: Source): Mindmap | Fail {
  try { return walk(src) } catch (e) { if (isFail(e)) return e; throw e }
}

function walk(src: Source): Mindmap {
  if (src.header !== 'mindmap') stop('header')
  // Each node so far, with its indent: Mermaid's SPACELIST, every \s before the node, a tab counting one.
  const seen: { indent: number; node: MNode }[] = []
  for (const { n, text } of src.lines) {
    const t = text.trim(), indent = text.length - text.trimStart().length
    // The lexer reads ::icon( in any case at a token's start; mindmapDb draws the icon.
    // U+2028 and U+2029 end no line for us but break Mermaid's lexer anywhere, a :::class line too.
    if (/^::icon\(/i.test(t) || /[\u2028\u2029]/.test(t)) stop(`syntax:${n}`)
    // A :::class line decorates the last node and is not drawn. Before any node Mermaid throws; with no name the
    // lexer's CLASS state swallows the line break.
    if (t.startsWith(':::')) {
      if (seen.length === 0 || t === ':::') stop(`syntax:${n}`)
      continue
    }
    const node = { k: seen.length, ...shaped(t, n), children: [] }
    if (seen.length > 0) {
      // Mermaid's getParent: the nearest earlier node with less indentation; the root's is the least any node may have.
      const parent = seen[0]!.indent < indent ? seen.findLast(s => s.indent < indent)! : stop(`root:${n}`)
      parent.node.children.push(node)
    }
    seen.push({ indent, node })
  }
  const colorBy = src.config['mindmap.colorBy'] === 'depth' ? 'depth' : 'branch'
  return { title: src.title, colorBy, root: seen[0]!.node }
}

// Each shape's opener, in the order the lexer tries them, and the closer that pairs with it.
const OPENERS: readonly (readonly [string, Shape, string])[] = [['))', 'bang', '(('], [')', 'cloud', '('], ['((', 'circle', '))'],
  ['{{', 'hexagon', '}}'], ['(', 'round', ')'], ['[', 'rect', ']']]
// The NODE state's closers, in the lexer's order. A closer other than the opener's pair fails: getType reads the
// opener alone, so Mermaid draws id[x) as a square, and this parser fails closed.
const CLOSERS = ['))', ')', ']', '}}', '(-', '-)', '((', '(']

// A node line t, trimmed, on source line n: [id]opener text closer, or bare text. The lexer reads a NODE_ID up to the
// first ( [ ) { or }, and its -) and (- openers, which no shape here takes, fail. A line holding no closer fails: the
// lexer's NODE_DESCR runs on over the line break, so Mermaid reads a node across lines.
function shaped(t: string, n: number): { shape: Shape; lines: string[] } {
  // The lexer reads mindmap, in any case, as its header keyword wherever a token starts.
  if (/^mindmap/i.test(t) || /[\u2028\u2029]/.test(t) || /^(?:-\)|\(-)/.test(t)) stop(`syntax:${n}`)
  const id = /^[^([){}]*/.exec(t)![0], rest = t.slice(id.length)
  // A bare text runs to the line's end, so a ::: in it is text to Mermaid, not a class.
  if (rest === '') return t.includes(':::') ? stop(`syntax:${n}`) : { shape: 'plain', lines: label(t, n) }
  const [open, shape, close] = OPENERS.find(([o]) => rest.startsWith(o)) ?? stop(`syntax:${n}`)
  if (/^(?:-\)|\(-)/.test(rest)) stop(`syntax:${n}`)
  const inner = rest.slice(open.length)
  if (inner.startsWith('"`')) stop(`markdown:${n}`)
  let text: string, after: string
  if (inner.startsWith('"')) {
    // The NSTR state: a "…" of at least one character, then the closer.
    const end = inner.indexOf('"', 1)
    if (end < 2) stop(`syntax:${n}`)
    text = inner.slice(1, end); after = inner.slice(end + 1)
  } else {
    // A closer is tried before any text, so text that starts with one is empty and fails.
    text = CLOSERS.some(c => inner.startsWith(c)) ? '' : /^[^)\](}]*/.exec(inner)![0]
    if (text === '') stop(`syntax:${n}`)
    after = inner.slice(text.length)
  }
  const closer = CLOSERS.find(c => after.startsWith(c))
  if (closer !== close || after.slice(close.length).trim() !== '') stop(`syntax:${n}`)
  return { shape, lines: label(text, n) }
}

// Markdown: mindmapDb gives every label labelType 'markdown', so marked renders it. A * or `, a _ at either end of a
// word, or a \ before ASCII punctuation (an escape marked drops).
const MARKDOWN = /[*\x60]|(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])|\\[!-/:-@[-`{-~]/u

// A label's lines, as it draws: an HTML label, so <br> in any spelling splits (text ground truth, mindmap), its bold and
// italic marked (core/emphasis.ts). Fails on line n for other Markdown, a blank line, or text drawable (a markdown HTML label: 'icon' and 'math' for text createText
// replaces) or unsupported() rejects.
function label(raw: string, n: number): string[] {
  const s = raw.trim()
  let d = s
  if (MARKDOWN.test(s)) {
    // Bold and italic draw marked, as styled says; Markdown that styles nothing, or that the port cannot match, fails.
    const r = styled(s, 'any')
    if (isFail(r) || r === s) stop(`markdown:${n}`)
    d = r
  } else {
    const f = drawable(s, 'markdown', 'any')
    if (f) stop(`${f.reason}:${n}`)
    const bad = unsupported(s)
    if (bad) stop(`unsupported-char ${bad}`)
  }
  const lines = labelLines(d).map(l => l.trim())
  return lines.some(l => l === '') ? stop(`blank:${n}`) : lines
}
