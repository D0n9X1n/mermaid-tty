// node scripts/style/codemod.ts [FILE...]: rewrites the code style rules that are mechanical but that Prettier won't
// touch, on every file check-style checks or on the files given:
// - an unbraced if, else, for or while body gets braces (curly);
// - a declaration of several variables becomes one declaration per variable (one-var), outside loop headers. Each
// rewrite must leave the program the same: the file's tree before and after, with locations dropped, a one-statement
// block read as its statement and a declaration list read as its parts, must be equal, or the file is left as it was
// and reported. Run Prettier afterwards to lay the result out.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as typescript from 'prettier/plugins/typescript'
import { isMain } from '../lib/is-main.ts'
import { trackedFiles } from './check-style.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

type Node = { type: string; range: [number, number]; [key: string]: unknown }
type Edit = { at: number; text: string; end?: number }

const parse = async (source: string) => (await typescript.parsers.typescript.parse(source, {})) as unknown as Node

function* nodes(node: unknown, parent: Node | null = null): Generator<{ node: Node; parent: Node | null }> {
  if (Array.isArray(node)) {
    for (const child of node) {
      yield* nodes(child, parent)
    }

    return
  }

  if (!node || typeof node !== 'object' || typeof (node as Node).type !== 'string') {
    return
  }

  yield { node: node as Node, parent }
  for (const [key, value] of Object.entries(node)) {
    if (key !== 'loc' && key !== 'range' && key !== 'tokens' && key !== 'comments') {
      yield* nodes(value, node as Node)
    }
  }
}

const BODIES: Record<string, string[]> = {
  IfStatement: ['consequent', 'alternate'],
  ForStatement: ['body'],
  ForInStatement: ['body'],
  ForOfStatement: ['body'],
  WhileStatement: ['body'],
  DoWhileStatement: ['body'],
}

// The edits for one file: braces around each unbraced body, and each multi-variable declaration split. A comment a
// compiler or formatter applies to the line below it, which a split would leave covering only part of a declaration.
const DIRECTIVE = /@ts-|prettier-ignore|eslint-|c8 |istanbul /

function edits(ast: Node, source: string): Edit[] {
  const out: Edit[] = []
  const comments = (ast.comments as Node[] | undefined) ?? []
  const inComment = (at: number) => comments.some((c) => c.range[0] <= at && at < c.range[1])
  // Whether a directive comment applies to the code at offset: one in the run of comments directly above it, with only
  // whitespace between them, since TypeScript applies a directive to the next line of code past comments and blanks.
  const directed = (at: number) => {
    let end = at
    for (const c of comments.filter((x) => x.range[1] <= at).reverse()) {
      if (source.slice(c.range[1], end).trim() !== '') {
        return false
      }

      if (DIRECTIVE.test(source.slice(c.range[0], c.range[1]))) {
        return true
      }

      end = c.range[0]
    }

    return false
  }

  for (const { node, parent } of nodes(ast)) {
    for (const key of BODIES[node.type] ?? []) {
      const body = node[key] as Node | null
      const elseIf = node.type === 'IfStatement' && key === 'alternate' && body?.type === 'IfStatement'
      if (body && body.type !== 'BlockStatement' && !elseIf) {
        out.push({ at: body.range[0], text: '{ ' }, { at: body.range[1], text: ' }' })
      }
    }

    const declarations = node.declarations as Node[] | undefined
    const loopHeader =
      parent !== null &&
      ['ForStatement', 'ForInStatement', 'ForOfStatement'].includes(parent.type) &&
      (parent.init === node || parent.left === node)
    const statementStart = (parent?.type === 'ExportNamedDeclaration' ? parent : node).range[0]
    const split = declarations && declarations.length > 1 && !loopHeader && !directed(statementStart)
    if (node.type === 'VariableDeclaration' && split) {
      // Each declarator after the first starts its own statement with the same keyword. The comma before it, and the
      // space after the comma, become a line break; anything else between them, such as a comment, stays.
      const exported = parent?.type === 'ExportNamedDeclaration' && parent.declaration === node
      const keyword = source.slice((exported ? parent : node).range[0], declarations[0]!.range[0]).trim()
      for (let i = 1; i < declarations.length; i++) {
        // The comma between them is the first one outside a comment: a comment's own commas are its text.
        let from = declarations[i - 1]!.range[1]
        while (from < declarations[i]!.range[0] && (source[from] !== ',' || inComment(from))) {
          from++
        }

        // The comma and the spaces after it become a line break and the keyword.
        let end = from + 1
        while (source[end] === ' ' || source[end] === '\t') {
          end++
        }

        out.push({ at: from, end, text: `\n${keyword} ` })
      }
    }
  }

  return out
}

function apply(source: string, list: Edit[]): string {
  const sorted = [...list].sort((a, b) => b.at - a.at || (b.end ?? b.at) - (a.end ?? a.at))
  let out = source
  for (const edit of sorted) {
    out = out.slice(0, edit.at) + edit.text + out.slice(edit.end ?? edit.at)
  }

  return out
}

// The tree with what these rewrites may change normalized away: locations, a one-statement block read as its statement,
// and consecutive declarations of one kind read as one declaration of all their declarators.
function normal(node: unknown): unknown {
  if (Array.isArray(node)) {
    const out: unknown[] = []
    for (const child of node.map(normal)) {
      // An exported declaration splits into exported declarations: read each as its declaration, marked exported.
      const unwrap = (n: Record<string, unknown> | undefined | null) =>
        n?.type === 'ExportNamedDeclaration' &&
        (n.declaration as Record<string, unknown> | null)?.type === 'VariableDeclaration'
          ? { ...(n.declaration as Record<string, unknown>), exported: true }
          : n
      const previous = unwrap(out.at(-1) as Record<string, unknown> | undefined)
      const current = unwrap(child as Record<string, unknown> | null)
      const merge =
        previous?.type === 'VariableDeclaration' &&
        current?.type === 'VariableDeclaration' &&
        previous.kind === current.kind &&
        previous.declare === current.declare &&
        previous.exported === current.exported
      if (merge) {
        previous.declarations = [...(previous.declarations as unknown[]), ...(current.declarations as unknown[])]
        out[out.length - 1] = previous
      } else {
        out.push(current)
      }
    }

    return out
  }

  if (!node || typeof node !== 'object') {
    return node
  }

  const n = node as Record<string, unknown>
  if (n.type === 'BlockStatement' && Array.isArray(n.body) && n.body.length === 1) {
    return normal(n.body[0])
  }

  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(n)) {
    if (!['loc', 'range', 'tokens', 'comments', 'start', 'end'].includes(key)) {
      out[key] = normal(value)
    }
  }

  return out
}

// Rewrites one file; returns why it was left alone, or null.
export async function rewrite(source: string): Promise<{ output: string; problem: string | null }> {
  const before = await parse(source)
  const list = edits(before, source)
  if (list.length === 0) {
    return { output: source, problem: null }
  }

  const output = apply(source, list)
  let after: Node
  try {
    after = await parse(output)
  } catch (error) {
    return { output: source, problem: `rewrite does not parse: ${(error as Error).message.split('\n')[0]}` }
  }

  const text = (tree: unknown) => JSON.stringify(normal(tree), (_, v) => (typeof v === 'bigint' ? `${v}n` : v))
  if (text(before) !== text(after)) {
    return { output: source, problem: 'rewrite changes the program' }
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
    const { output, problem } = await rewrite(source)
    if (problem) {
      console.error(`${file}: ${problem}`)
      problems++
    } else if (output !== source) {
      writeFileSync(path, output)
      changed++
    }
  }

  console.log(`codemod: rewrote ${changed} file(s); left ${problems} alone`)
  return problems > 0 ? 1 : 0
}

if (isMain(import.meta)) {
  process.exitCode = await main(process.argv.slice(2))
}
