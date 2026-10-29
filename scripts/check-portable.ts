// node scripts/check-portable.ts: checks that core/ and hooks/ can run in the engine's module sandbox,
// which has no Node and no DOM. In each .ts and .tsx file it flags process, Buffer, document, window,
// require(, eval(, new Function and import(, and each import or export … from specifier that is not a
// relative .ts or .tsx path; a type-only claude-code import is erased, so it is allowed. It also flags a
// dependencies key in package.json, since nothing is installed. Prints each problem as `file:line token`
// and exits 1 when there is any.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isMain } from './lib/is-main.ts'

const TOKENS: [string, RegExp][] = [
  ['process', /\bprocess\b/g], ['require(', /\brequire\s*\(/g], ['Buffer', /\bBuffer\b/g], ['document', /\bdocument\b/g],
  ['window', /\bwindow\b/g], ['eval(', /\beval\s*\(/g], ['new Function', /\bnew\s+Function\b/g], ['import(', /\bimport\s*\(/g],
]
// The words after which a / starts a regex literal rather than a division.
const BEFORE_REGEX = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await'])

// An import or export … from specifier: the offset of its opening quote, and its text.
type Specifier = { at: number; text: string }

// The last non-blank character of out, and the word that ends there ('' when that is not a word character).
function before(out: string[]): { char: string; word: string } {
  let i = out.length - 1
  while (i >= 0 && /\s/.test(out[i]!)) i--
  let word = ''
  for (let j = i; j >= 0 && /[\w$]/.test(out[j]!); j--) word = out[j] + word
  return { char: out[i] ?? '', word }
}

// Whether a / after out starts a regex literal: it does after an operator, punctuation, a keyword such as
// return, or nothing; after a value (a name, a number, ), ], } or a literal's closing quote) it divides.
// A regex right after the ) of if (…) is read as a division, so its text is scanned as code: a rare form.
function regexStarts(out: string[]): boolean {
  const { char, word } = before(out)
  if (word) return BEFORE_REGEX.has(word)
  return !/[)\]}'"`]/.test(char)
}

// The index of the quote that closes the string literal opened at i, or of the line break or end of code
// that cuts it short. A backslash escapes the next character, a line break included.
function closeQuote(code: string, i: number): number {
  let j = i + 1
  while (j < code.length && code[j] !== code[i] && code[j] !== '\n') j += code[j] === '\\' ? 2 : 1
  return Math.min(j, code.length)
}

// The index of the / that closes the regex literal opened at i, or -1 when the line ends first.
// A backslash escapes the next character, and a / inside a [class] does not close it.
function closeRegex(code: string, i: number): number {
  let inClass = false
  for (let j = i + 1; j < code.length && code[j] !== '\n'; j++) {
    const c = code[j]
    if (c === '\\') j++
    else if (c === '[') inClass = true
    else if (c === ']') inClass = false
    else if (c === '/' && !inClass) return j
  }
  return -1
}

// code with each comment, and the text of each string, regex and template literal, blanked: one space per
// code unit, line breaks kept, so offsets and lines stay aligned. The code inside each ${…} is kept: depth
// counts the { open in the current substitution, and subs holds the outer ones' counts, so the } that
// closes a substitution is told from a nested one. A regex literal is a pattern, not a use of a global,
// so its text is blanked like a string's: /process/ is not flagged. The specifiers are returned apart,
// blanked in the text too, to be checked as imports rather than scanned for tokens.
function lex(code: string): { text: string; specifiers: Specifier[] } {
  const out: string[] = [], specifiers: Specifier[] = [], subs: number[] = []
  let i = 0, depth = 0
  // Copies code from i up to end, kept or blanked, and moves i there.
  const take = (end: number, keep: boolean) => { for (; i < end; i++) out.push(keep || code[i] === '\n' ? code[i]! : ' ') }
  // From the ` or } at i, blanks template text up to the closing `, or up to a ${ that opens a substitution.
  const template = () => {
    take(i + 1, true)
    while (i < code.length) {
      const c = code[i]
      if (c === '\\') take(Math.min(i + 2, code.length), false)
      else if (c === '`') { take(i + 1, true); return }
      else if (c === '$' && code[i + 1] === '{') { take(i + 2, true); subs.push(depth); depth = 0; return }
      else take(i + 1, false)
    }
  }
  while (i < code.length) {
    const c = code[i], next = code[i + 1]
    if (c === '/' && next === '/') { const end = code.indexOf('\n', i); take(end < 0 ? code.length : end, false) }
    else if (c === '/' && next === '*') { const end = code.indexOf('*/', i + 2); take(end < 0 ? code.length : end + 2, false) }
    else if (c === "'" || c === '"') {
      const { word } = before(out), end = closeQuote(code, i)
      if (word === 'from' || word === 'import') specifiers.push({ at: i, text: code.slice(i + 1, end) })
      take(i + 1, true); take(end, false)
      if (code[end] === c) take(end + 1, true)
    } else if (c === '`') template()
    else if (c === '/' && regexStarts(out)) {
      const end = closeRegex(code, i)
      take(i + 1, true)
      if (end >= 0) { take(end, false); take(end + 1, true) }
    } else if (c === '}' && depth === 0 && subs.length) { depth = subs.pop()!; template() }
    else { if (c === '{') depth++; else if (c === '}') depth--; take(i + 1, true) }
  }
  return { text: out.join(''), specifiers }
}

// The lexed text of the import or export statement that holds the specifier at `at`: from the last
// import or export keyword before it.
function statement(text: string, at: number): string {
  const head = text.slice(0, at)
  let start = 0
  for (const m of head.matchAll(/\b(?:import|export)\b/g)) start = m.index!
  return head.slice(start)
}
// A type-only statement, which TypeScript erases. `import type from 'x'` imports a binding named type,
// and `import type, { a } from 'x'` a value too: neither is type-only.
const TYPE_ONLY = /^(?:import|export)\s+type\b(?!\s*(?:,|from\b))/
// Whether the sandbox can load a specifier: a relative .ts or .tsx path; or claude-code, which has only
// types, in a type-only statement.
const allowed = (s: Specifier, text: string) =>
  /^\.\.?\/.*\.tsx?$/.test(s.text) || (s.text === 'claude-code' && TYPE_ONLY.test(statement(text, s.at)))

// The 1-based line of offset `at` in text.
const lineOf = (text: string, at: number) => text.slice(0, at).split('\n').length

// The problems in a .ts or .tsx file's code, each as `line token`, in the order they appear.
export function scanSource(code: string): string[] {
  const { text, specifiers } = lex(code)
  const found: [number, string][] = [
    ...TOKENS.flatMap(([token, re]) => [...text.matchAll(re)].map((m): [number, string] => [m.index!, token])),
    ...specifiers.filter(s => !allowed(s, text)).map((s): [number, string] => [s.at, `import '${s.text}'`]),
  ]
  return found.sort((a, b) => a[0] - b[0]).map(([at, what]) => `${lineOf(text, at)} ${what}`)
}

// The problems in root's core/ and hooks/ .ts and .tsx files, each as `file:line token` with a
// /-separated path relative to root; then a dependencies key in root's package.json.
export function scanRepo(root: string): string[] {
  const problems: string[] = []
  for (const dir of ['core', 'hooks']) {
    const files = readdirSync(join(root, dir), { recursive: true, encoding: 'utf8' })
      .map(f => `${dir}/${f.replaceAll('\\', '/')}`).filter(f => /\.tsx?$/.test(f)).sort()
    for (const f of files) problems.push(...scanSource(readFileSync(join(root, f), 'utf8')).map(p => `${f}:${p}`))
  }
  const pkg = readFileSync(join(root, 'package.json'), 'utf8')
  if ('dependencies' in JSON.parse(pkg)) problems.push(`package.json:${lineOf(pkg, Math.max(0, pkg.indexOf('"dependencies"')))} dependencies`)
  return problems
}

function main(): number {
  const problems = scanRepo('.')
  for (const p of problems) console.error(p)
  if (problems.length) return 1
  console.log('check-portable: core/ and hooks/ are portable, and package.json has no dependencies')
  return 0
}

// main() runs only when node runs this file, not when a test imports it.
if (isMain(import.meta)) process.exitCode = main()
