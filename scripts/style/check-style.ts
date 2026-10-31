// node scripts/style/check-style.ts [FILE...]: checks the code style rules Prettier can't, on every tracked TypeScript
// file under core/, hooks/, scripts/, tests/ and types/, or on the files given. Prints `file:line rule` for each
// violation and exits 1 if there is any. The rules, and the closest ESLint rule for each, are listed under "Code style"
// in wiki/Development-and-Release.md; Prettier, with .prettierrc.json, does the layout.
//
// It parses with the TypeScript parser Prettier bundles, so the only package it needs is the one pinned in this
// folder. TypeScript's own compiler API is not used: the pinned TypeScript 7 exposes no stable one.
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as typescript from 'prettier/plugins/typescript'
import { isMain } from '../lib/is-main.ts'

export type Rule =
  | 'curly'
  | 'eqeqeq'
  | 'no-nested-ternary'
  | 'one-var'
  | 'blank-line-after-block'
  | 'max-len'
  | 'max-lines'
  | 'no-multiple-empty-lines'
  | 'issue-number'
  | 'one-statement-per-line'
export type Violation = { file: string; line: number; rule: Rule }

export const MAX_COLUMNS = 120
export const MAX_LINES = 1000
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ROOTS = ['core', 'hooks', 'scripts', 'tests', 'types']

// Generated tables, written by their own scripts, and the release scripts' tests, which hold real issue numbers as
// data, are not held to these rules.
const EXEMPT = new Set(['core/width-table.ts', 'core/box-table.ts'])

type Node = {
  type: string
  range: [number, number]
  loc: { start: { line: number; column: number }; end: { line: number; column: number } }
  [key: string]: unknown
}
type Comment = Node & { value: string }

// Every node of the tree, parents before children. Prettier's nodes carry no parent link, so a walk is how rules see
// a node's context.
function* walk(node: unknown, parent: Node | null = null): Generator<{ node: Node; parent: Node | null }> {
  if (!node || typeof node !== 'object') {
    return
  }

  if (Array.isArray(node)) {
    for (const child of node) {
      yield* walk(child, parent)
    }

    return
  }

  const n = node as Node
  if (typeof n.type !== 'string') {
    return
  }

  yield { node: n, parent }
  for (const [key, value] of Object.entries(n)) {
    if (key !== 'loc' && key !== 'range' && key !== 'tokens' && key !== 'comments') {
      yield* walk(value, n)
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

// A multi-line statement that ends in a block: what padding-line-between-statements calls multiline-block-like.
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

// Issue and PR citations in prose: a hash and a number that isn't part of a word, a color or an HTML entity;
// "issue", "PR" or "pull request" with a number; or a link to an issue or pull request page.
const CITATIONS = [
  /(?<![\w&/#-])#\d{1,5}\b(?!;)(?![0-9a-fA-F])/,
  /\b(?:issues?|PRs?|pull requests?)[ \t]*(?:#|no\.|number)?[ \t]*\d+\b/i,
  /\/(?:issues|pulls?)\/\d+\b/,
]

// A hash and 3, 4, 6 or 8 hex digits is a color, not a citation.
const COLOR = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g

export function citesIssue(prose: string): boolean {
  const text = prose.replace(COLOR, '')
  return CITATIONS.some((pattern) => pattern.test(text))
}

// The violations in one file's source. `file` is only used to label them.
export async function check(file: string, source: string): Promise<Violation[]> {
  const found: Violation[] = []
  const add = (line: number, rule: Rule) => found.push({ file, line, rule })
  const lines = source.split('\n')
  if (lines.at(-1) === '') {
    lines.pop()
  }

  if (lines.length > MAX_LINES) {
    add(MAX_LINES + 1, 'max-lines')
  }

  const ast = (await typescript.parsers.typescript.parse(source, {})) as unknown as Node & { comments: Comment[] }
  const literals: [number, number][] = []
  for (const { node, parent } of walk(ast)) {
    const line = node.loc.start.line
    if (
      node.type === 'TemplateLiteral' ||
      (node.type === 'Literal' && (typeof node.value === 'string' || 'regex' in node))
    ) {
      literals.push(node.range)
    }

    for (const key of BODIES[node.type] ?? []) {
      const body = node[key] as Node | null
      const elseIf = node.type === 'IfStatement' && key === 'alternate' && body?.type === 'IfStatement'
      if (body && body.type !== 'BlockStatement' && !elseIf) {
        add(body.loc.start.line, 'curly')
      }
    }

    if (node.type === 'BinaryExpression' && (node.operator === '==' || node.operator === '!=')) {
      const sides = [node.left, node.right] as Node[]
      const againstNull = sides.some((side) => side.type === 'Literal' && side.value === null)
      if (!againstNull) {
        add(line, 'eqeqeq')
      }
    }

    if (node.type === 'ConditionalExpression') {
      const branches = [node.consequent, node.alternate] as Node[]
      if (branches.some((branch) => branch.type === 'ConditionalExpression')) {
        add(line, 'no-nested-ternary')
      }
    }

    if (node.type === 'VariableDeclaration' && (node.declarations as Node[]).length > 1) {
      const loopHeader =
        parent !== null &&
        ['ForStatement', 'ForInStatement', 'ForOfStatement'].includes(parent.type) &&
        (parent.init === node || parent.left === node)
      if (!loopHeader) {
        add(line, 'one-var')
      }
    }

    const body =
      node.type === 'Program' || node.type === 'BlockStatement' || node.type === 'SwitchCase'
        ? ((node.type === 'SwitchCase' ? node.consequent : node.body) as Node[])
        : null
    for (const [i, statement] of (body ?? []).entries()) {
      const next = body![i + 1]
      const multiLine = statement.loc.end.line > statement.loc.start.line
      if (next && multiLine && BLOCK_LIKE.has(statement.type) && lines[statement.loc.end.line]?.trim() !== '') {
        const between = ast.comments.some((c) => c.range[0] > statement.range[1] && c.range[1] < next.range[0])
        if (!between) {
          add(next.loc.start.line, 'blank-line-after-block')
        }
      }
    }

    const isTest = node.type === 'CallExpression' && (node.callee as Node).type === 'Identifier'
    const name = isTest && ['test', 'it', 'describe'].includes((node.callee as Node & { name: string }).name)
    const title = name ? ((node.arguments as Node[])[0] as Node & { value?: unknown }) : null
    if (title?.type === 'Literal' && typeof title.value === 'string' && citesIssue(title.value)) {
      add(line, 'issue-number')
    }
  }

  for (const comment of ast.comments) {
    if (citesIssue(comment.value)) {
      add(comment.loc.start.line, 'issue-number')
    }
  }

  // At most one blank line in a row, inside comments too; only a template literal's own text may hold more.
  const templates = literals.filter(([from]) => source[from] === '`')
  let at = 0
  let blanks = 0
  for (const [i, text] of lines.entries()) {
    const inTemplate = templates.some(([from, to]) => from < at && to > at)
    blanks = text.trim() === '' && !inTemplate ? blanks + 1 : 0
    if (blanks === 2) {
      add(i + 1, 'no-multiple-empty-lines')
    }

    at += text.length + 1
  }

  // A line may run past the limit only where a string, template or regex, which can't be broken without changing
  // it, or a URL crosses the limit.
  let offset = 0
  lines.forEach((text, i) => {
    const start = offset
    offset += text.length + 1
    if (text.length <= MAX_COLUMNS || /https?:\/\//.test(text)) {
      return
    }

    const at = start + MAX_COLUMNS
    const inLiteral = literals.some(([from, to]) => from < at && to > at)
    if (!inLiteral) {
      add(i + 1, 'max-len')
    }
  })

  return found.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule))
}

// Tracked files under the checked roots that match a pattern, relative to the repo root.
function tracked(pattern: RegExp): string[] {
  const out = execFileSync('git', ['ls-files', '--', ...ROOTS], { cwd: ROOT, encoding: 'utf8' })
  return out.split('\n').filter((file) => pattern.test(file) && !EXEMPT.has(file) && !file.includes('node_modules/'))
}

export const trackedFiles = () => tracked(/\.tsx?$/)

// The Python scripts' violations, from check_py.py, which reads them with Python's own tokenizer. Windows names the
// interpreter python, other systems python3.
export function checkPython(files: string[]): string[] {
  if (files.length === 0) {
    return []
  }

  const python = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3')
  const script = join(ROOT, 'scripts', 'style', 'check_py.py')
  const run = spawnSync(python, [script, ...files], { cwd: ROOT, encoding: 'utf8' })
  if (run.status !== 0) {
    throw new Error(`check_py.py failed: ${run.error?.message ?? run.stderr}`)
  }

  return run.stdout.split('\n').filter(Boolean)
}

async function main(args: string[]): Promise<number> {
  const files = args.length > 0 ? args.filter((f) => /\.tsx?$/.test(f)) : trackedFiles()
  const violations: Violation[] = []
  for (const file of files) {
    violations.push(...(await check(file, readFileSync(join(ROOT, file), 'utf8'))))
  }

  const pythonFiles = args.length > 0 ? args.filter((f) => f.endsWith('.py')) : tracked(/\.py$/)
  const lines = [...violations.map((v) => `${v.file}:${v.line} ${v.rule}`), ...checkPython(pythonFiles)]
  for (const line of lines) {
    console.error(line)
  }

  if (lines.length > 0) {
    console.error(`check-style: ${lines.length} violation(s)`)
    return 1
  }

  console.log(`check-style: ${files.length} file(s) follow the rules`)
  return 0
}

if (isMain(import.meta)) {
  process.exitCode = await main(process.argv.slice(2))
}
