// scanPlaceholders(root): each test, it or describe call with no function or an empty one, in a file under root the runner
// can run, as file:line: call. node:test passes such a test on Node 24 and 26, and its events do not say whether a test has
// a body, so passed-tests-reporter.ts counts it as a real run. check.ts fails a filtered @nt run on any; `all` runs
// tests/scripts/no-placeholder-tests_test.ts, which fails on any too.
// A small tokenizer, not one regex: strings, templates, regexes and comments hide what they hold, and brackets balance to
// find each call's arguments.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// A token of a test file: a word; a string, template or regex, whole; or punctuation, one character but =>. at is its offset.
type Token = { text: string; at: number }

// The index of s in src at or after i, or src's length.
const until = (src: string, s: string, i: number) => { const j = src.indexOf(s, i); return j < 0 ? src.length : j }
// The end of the string whose quote is at i: just past its closing quote, or at a line end, which it cannot cross.
function quoted(src: string, i: number): number {
  const q = src[i]
  for (i++; i < src.length && src[i] !== q && src[i] !== '\n'; i++) if (src[i] === '\\') i++
  return src[i] === q ? i + 1 : i
}
// The end of the template whose ` is at i, just past its closing `. Each ${…} in it is code, lexed up to its own }.
function template(src: string, i: number): number {
  for (i++; i < src.length && src[i] !== '`'; i++) if (src[i] === '\\') i++; else if (src.startsWith('${', i)) i = lex(src, i + 2, true).end
  return i + 1
}
// Whether a / after prev starts a regex rather than a division: after nothing, a keyword, or punctuation but ) ] }.
const regexAfter = (prev?: Token) => !prev || /^(?:[^\w$'"`/)\]}]|(?:return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$)/.test(prev.text)
// The end of the regex whose / is at i, past its flags, or -1 if no / closes it on its line.
function regexEnd(src: string, i: number): number {
  for (let k = i + 1, inClass = false; k < src.length && src[k] !== '\n'; k++) {
    if (src[k] === '\\') k++
    else if (src[k] === '[' || src[k] === ']') inClass = src[k] === '['
    else if (src[k] === '/' && !inClass) { for (k++; /\w/.test(src[k] ?? ''); k++); return k }
  }
  return -1
}
// The tokens of src from i, and where they end: at src's end or, for the code of a ${…} (sub), at the } that closes it.
// Comments and whitespace are not tokens, so no call inside a comment, a string, a template or a regex is seen.
function lex(src: string, i = 0, sub = false): { tokens: Token[]; end: number } {
  const tokens: Token[] = []
  for (let depth = 0; i < src.length;) {
    const at = i, c = src[i]!
    if (/\s/.test(c)) { i++; continue }
    if (src.startsWith('//', i)) { i = until(src, '\n', i); continue }
    if (src.startsWith('/*', i)) { i = until(src, '*/', i + 2) + 2; continue }
    if (sub && c === '}' && depth-- === 0) break
    const re = c === '/' && regexAfter(tokens.at(-1)) ? regexEnd(src, i) : -1
    if (c === "'" || c === '"') i = quoted(src, i)
    else if (c === '`') i = template(src, i)
    else if (re > 0) i = re
    else if (/[\w$]/.test(c)) while (i < src.length && /[\w$]/.test(src[i]!)) i++
    else { if (c === '{') depth++; i += src.startsWith('=>', i) ? 2 : 1 }
    tokens.push({ text: src.slice(at, i), at })
  }
  return { tokens, end: i }
}

// The arguments of the call whose ( is tokens[open], split at its own commas; a trailing comma adds none.
function argsOf(tokens: Token[], open: number): Token[][] {
  const args: Token[][] = [[]]
  for (let i = open + 1, depth = 0; i < tokens.length && !(depth === 0 && tokens[i]!.text === ')'); i++) {
    const t = tokens[i]!
    if (depth === 0 && t.text === ',') args.push([])
    else { depth += '([{'.includes(t.text) ? 1 : ')]}'.includes(t.text) ? -1 : 0; args.at(-1)!.push(t) }
  }
  return args.filter(a => a.length > 0)
}
const texts = (a: Token[]) => a.map(t => t.text).join(' ')
// An argument that cannot be a function: a lone string or template, or an object literal.
const inert = (a: Token[]) => (a.length === 1 && /^['"`]/.test(a[0]!.text)) || (a[0]!.text === '{' && a.at(-1)!.text === '}')
// A function whose body is an empty block: an arrow that ends => { }, or a function expression that ends { }.
const emptyFunction = (a: Token[]) => texts(a.slice(-3)) === '=> { }' || (/^(async )?function\b/.test(texts(a.slice(0, 2))) && texts(a.slice(-2)) === '{ }')

const CALLEES = ['test', 'it', 'describe'], MODIFIERS = ['only', 'skip', 'todo']
// Whether a value token is literally true or a non-empty string: a skip or todo the runner always takes.
const literal = (s = '') => s === 'true' || (/^(['"`]).+\1$/s.test(s) && !s.includes('${'))
// An options object whose skip or todo is such a literal. skip: false, skip: '' or a variable may let the test run, and count.
const excused = (a: Token[]) => a[0]!.text === '{' &&
  a.some((t, i) => ['skip', 'todo'].includes(t.text) && a[i + 1]?.text === ':' && literal(a[i + 2]?.text) && [',', '}'].includes(a[i + 3]?.text ?? ''))
// The calls in src, the text of file, to test, it and describe, bare or with .only, .skip or .todo, that have no function or
// an empty one. A name after a dot is another object's method, such as a RegExp's test, and one after `function` is
// declared, not called. .skip, .todo or an excusing option allows a call: the runner skips it and does not count it.
function placeholders(file: string, src: string): string[] {
  const { tokens } = lex(src)
  return tokens.flatMap((t, i) => {
    const mod = tokens[i + 1]?.text === '.' ? tokens[i + 2]?.text : undefined, open = mod === undefined ? i + 1 : i + 3
    if (!CALLEES.includes(t.text) || ['.', 'function'].includes(tokens[i - 1]?.text ?? '') || (mod !== undefined && !MODIFIERS.includes(mod)) ||
      tokens[open]?.text !== '(') return []
    const args = argsOf(tokens, open), first = args[0]
    if (mod === 'skip' || mod === 'todo' || args.some(excused)) return []
    const call = `${file}:${src.slice(0, t.at).split('\n').length}: ${t.text}${mod === undefined ? '' : `.${mod}`}(${first?.length === 1 ? first[0]!.text : ''})`
    return args.every(inert) ? [`${call} has no function`] : args.some(emptyFunction) ? [`${call} has an empty function`] : []
  })
}

// The files the runner can run under dir: *_test.ts and *.docs-spec.ts, outside node_modules, as '/'-separated paths from root.
function testFiles(root: string, dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap(e => {
    const file = `${dir}/${e.name}`
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : testFiles(root, file)
    return e.isFile() && /(_test|\.docs-spec)\.ts$/.test(e.name) ? [file] : []
  })
}
// Every placeholder in the test files under root's tests/ and scripts/tests/, in file order, as file:line: call.
export function scanPlaceholders(root: string): string[] {
  return ['scripts/tests', 'tests'].filter(d => existsSync(join(root, d))).flatMap(d => testFiles(root, d)).sort()
    .flatMap(f => placeholders(f, readFileSync(join(root, f), 'utf8')))
}
