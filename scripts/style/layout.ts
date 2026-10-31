// node scripts/style/layout.ts [FILE...]: lays out what Prettier leaves alone, on every file check-style checks or on
// the files given:
// - a blank line after each multi-line block statement (padding-line-between-statements, multiline-block-like);
// - a trailing comment that runs a line past the limit moves onto its own line above the code;
// - a comment line past the limit is wrapped: the words past the limit move onto new comment lines below it, with the
//   same indent and the same `//` or ` *` prefix, so lists and indented continuations keep their shape.
// The rewrite is kept only when the file's tree is unchanged and its comments hold the same words in the same order;
// otherwise the file is left as it was and reported.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as typescript from 'prettier/plugins/typescript'
import { isMain } from '../lib/is-main.ts'
import { MAX_COLUMNS, trackedFiles } from './check-style.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

type Loc = { start: { line: number; column: number }; end: { line: number; column: number } }
type Node = { type: string; range: [number, number]; loc: Loc; [key: string]: unknown }
type Comment = Node & { value: string }
type Tree = Node & { comments: Comment[] }

const parse = async (source: string) => (await typescript.parsers.typescript.parse(source, {})) as unknown as Tree

function* nodes(node: unknown): Generator<Node> {
  if (Array.isArray(node)) {
    for (const child of node) {
      yield* nodes(child)
    }

    return
  }

  if (!node || typeof node !== 'object' || typeof (node as Node).type !== 'string') {
    return
  }

  yield node as Node
  for (const [key, value] of Object.entries(node)) {
    if (key !== 'loc' && key !== 'range' && key !== 'tokens' && key !== 'comments') {
      yield* nodes(value)
    }
  }
}

const BLOCK_LIKE = new Set([
  'IfStatement',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'TryStatement',
  'SwitchStatement',
  'BlockStatement',
  'FunctionDeclaration',
  'ClassDeclaration',
  'TSInterfaceDeclaration',
  'TSEnumDeclaration',
  'TSModuleDeclaration',
])

// The statements a node holds directly: a program's or block's body, or a switch case's consequent.
function statements(node: Node): Node[] | null {
  if (node.type === 'Program' || node.type === 'BlockStatement') {
    return node.body as Node[]
  }

  return node.type === 'SwitchCase' ? (node.consequent as Node[]) : null
}

// The 1-based line numbers after which a blank line goes: the last line of each multi-line block statement whose next
// sibling starts on the very next line.
function blankLinesAfter(tree: Tree): Set<number> {
  const out = new Set<number>()
  for (const node of nodes(tree)) {
    const list = statements(node)
    for (const [i, statement] of (list ?? []).entries()) {
      const next = list![i + 1]
      const multiLine = statement.loc.end.line > statement.loc.start.line
      if (next && multiLine && BLOCK_LIKE.has(statement.type) && next.loc.start.line === statement.loc.end.line + 1) {
        out.add(statement.loc.end.line)
      }
    }
  }

  return out
}

// A comment line split at the last space that keeps it within the limit, its overflow on new lines with its prefix.
function wrap(line: string): string[] {
  const match = /^(\s*(?:\/\/|\*)\s?)(\s*)(.*)$/.exec(line)
  if (!match || line.length <= MAX_COLUMNS) {
    return [line]
  }

  const [, prefix, indent, text] = match as unknown as [string, string, string, string]
  const out: string[] = []
  let rest = text
  let lead = prefix + indent
  while ((lead + rest).length > MAX_COLUMNS) {
    const room = MAX_COLUMNS - lead.length
    const cut = rest.lastIndexOf(' ', room)
    if (cut <= 0) {
      break
    }

    out.push((lead + rest.slice(0, cut)).trimEnd())
    rest = rest.slice(cut + 1)
    // A list item's continuation lines up under its text, past the marker.
    lead = prefix + indent + (/^(?:[-*]|\d+\.)\s/.test(text) && out.length === 1 ? '  ' : '')
  }

  out.push(lead + rest)
  return out
}

// A comment line's parts: its prefix (indent and `//` or ` *`, with one space), any further indent, and its text.
const PARTS = /^(\s*(?:\/\/|\*)\s?)(\s*)(.*)$/

// Where a comment paragraph ends: a line that starts a list item, a table row, a code fence or an indented
// continuation, a blank comment line, or one after a line ending in a colon. Those keep their own lines.
const STARTS_BLOCK = /^(?:[-*•]\s|\d+[.)]\s|\||```|$)/
// Aligned columns or box drawing: a comment laid out by hand, left exactly as written.
const LAID_OUT = /\S {3,}\S|[─│┌┐└┘├┤┬┴┼━┃]/

// Comment lines refilled as paragraphs: each run of `//` (or ` *`) lines with one prefix and no deeper indent is joined
// and wrapped again at the limit, so no line holds a stray word cut from the one above. Lists, tables, code, indented
// continuations and hand-aligned text keep their lines.
export function refill(lines: readonly string[], inComment: (n: number) => boolean): string[] {
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const first = PARTS.exec(lines[i]!)
    if (!inComment(i + 1) || !first) {
      out.push(lines[i]!)
      i++
      continue
    }

    const [, prefix, ,] = first as unknown as [string, string, string, string]
    const run: string[] = [lines[i]!]
    let j = i + 1
    while (j < lines.length && inComment(j + 1)) {
      const next = PARTS.exec(lines[j]!)
      const previous = run.at(-1)!
      if (!next || next[1] !== prefix || next[2] !== '' || STARTS_BLOCK.test(next[3]!) || /:$/.test(previous)) {
        break
      }

      run.push(lines[j]!)
      j++
    }

    const texts = run.map((line) => PARTS.exec(line)![3]!)
    const keep = run.length === 1 || texts.some((t) => LAID_OUT.test(t)) || (first[2] ?? '') !== ''
    out.push(...(keep ? run : fill(prefix, texts.join(' '))))
    i = j
  }

  return out
}

// Words laid greedily onto lines of at most the limit, each starting with prefix.
function fill(prefix: string, text: string): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && (prefix + line + ' ' + word).length > MAX_COLUMNS) {
      out.push(prefix + line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }

  out.push(prefix + line)
  return out
}

// The comments' words, in order: what wrapping and moving may not change. A block comment's ` *` line prefixes are
// layout, not words; a line comment's text is all words, a leading * too.
const words = (tree: Tree) =>
  tree.comments
    .flatMap((comment) =>
      comment.type === 'Block' ? comment.value.split('\n').map((line) => line.replace(/^\s*\*/, '')) : [comment.value],
    )
    .join(' ')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')

function normal(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(normal)
  }

  if (!node || typeof node !== 'object') {
    return typeof node === 'bigint' ? `${node}n` : node
  }

  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node)) {
    if (!['loc', 'range', 'tokens', 'comments', 'start', 'end'].includes(key)) {
      out[key] = normal(value)
    }
  }

  return out
}

export async function layout(source: string): Promise<{ output: string; problem: string | null }> {
  const tree = await parse(source)
  const lines = source.split('\n')
  const blanks = blankLinesAfter(tree)

  // Trailing line comments on lines past the limit, by line: their column, so the code before them stays as it is.
  const trailing = new Map<number, number>()
  for (const comment of tree.comments) {
    const line = comment.loc.start.line
    const before = lines[line - 1]!.slice(0, comment.loc.start.column)
    const directive = /@ts-|prettier-ignore|eslint-/.test(comment.value)
    if (comment.type === 'Line' && before.trim() !== '' && lines[line - 1]!.length > MAX_COLUMNS && !directive) {
      trailing.set(line, comment.loc.start.column)
    }
  }

  // Lines inside a comment: only these are wrapped, so a line of a string or template that looks like one is not.
  const inComment = new Set<number>()
  for (const comment of tree.comments) {
    const before = lines[comment.loc.start.line - 1]!.slice(0, comment.loc.start.column)
    for (let line = comment.loc.start.line; line <= comment.loc.end.line; line++) {
      if (line > comment.loc.start.line || before.trim() === '') {
        inComment.add(line)
      }
    }
  }

  const out: string[] = []
  for (const [i, text] of lines.entries()) {
    const number = i + 1
    const column = trailing.get(number)
    if (column !== undefined) {
      const code = text.slice(0, column).trimEnd()
      const indent = /^\s*/.exec(text)![0]
      out.push(...wrap(indent + text.slice(column).trim()), code)
    } else if (inComment.has(number) && /^\s*(?:\/\/|\*)/.test(text)) {
      out.push(...wrap(text))
    } else {
      out.push(text)
    }

    if (blanks.has(number)) {
      out.push('')
    }
  }

  const laid = await parse(out.join('\n'))
  const laidLines = out
  const laidComment = new Set<number>()
  for (const comment of laid.comments) {
    const before = laidLines[comment.loc.start.line - 1]!.slice(0, comment.loc.start.column)
    for (let line = comment.loc.start.line; line <= comment.loc.end.line; line++) {
      if (line > comment.loc.start.line || before.trim() === '') {
        laidComment.add(line)
      }
    }
  }

  const output = refill(laidLines, (n) => laidComment.has(n)).join('\n')
  if (output === source) {
    return { output, problem: null }
  }

  let after: Tree
  try {
    after = await parse(output)
  } catch (error) {
    return { output: source, problem: `layout does not parse: ${(error as Error).message.split('\n')[0]}` }
  }

  if (JSON.stringify(normal(tree)) !== JSON.stringify(normal(after))) {
    return { output: source, problem: 'layout changes the program' }
  }

  if (words(tree) !== words(after)) {
    return { output: source, problem: 'layout changes a comment' }
  }

  return { output, problem: null }
}

async function main(args: string[]): Promise<number> {
  const files = args.length > 0 ? args : trackedFiles()
  let changed = 0
  let problems = 0
  for (const file of files) {
    const path = join(ROOT, file)
    const source = readFileSync(path, 'utf8')
    const { output, problem } = await layout(source)
    if (problem) {
      console.error(`${file}: ${problem}`)
      problems++
    } else if (output !== source) {
      writeFileSync(path, output)
      changed++
    }
  }

  console.log(`layout: rewrote ${changed} file(s); left ${problems} alone`)
  return problems > 0 ? 1 : 0
}

if (isMain(import.meta)) {
  process.exitCode = await main(process.argv.slice(2))
}
