// checkedSite(src, line, column): whether the test node:test reports at that line and column of src is a test or it call
// whose own inline function calls an assertion. node:test passes a test with no function, an empty one or one that asserts
// nothing, and its events do not say which, so check.ts counts a passing test only at a checked site. It judges only the
// sites node reports, never every call: x.test( there is a registered test, not a RegExp's.
// A small tokenizer, not one regex: strings, templates, regexes and comments hide what they hold, and brackets balance to
// find each call's arguments.

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

// The offset in src of a 1-based line and column as V8 counts them: CRLF, CR, LF, U+2028 and U+2029 each end a line, and
// columns are UTF-16 code units. -1 when src has fewer lines.
function offsetOf(src: string, line: number, column: number): number {
  const ends = /\r\n?|[\n\u2028\u2029]/g
  for (let l = 1; l < line; l++) if (!ends.exec(src)) return -1
  return ends.lastIndex + column - 1
}
// The body of an argument that is an inline function: what follows an arrow's => or a function expression's {, at depth 0.
function bodyOf(arg: Token[]): Token[] | undefined {
  const fn = arg[0]?.text === 'function' || (arg[0]?.text === 'async' && arg[1]?.text === 'function')
  for (let i = 0, depth = 0; i < arg.length; i++) {
    const t = arg[i]!.text
    if (depth === 0 && t === (fn ? '{' : '=>')) return arg.slice(i + 1)
    depth += '([{'.includes(t) ? 1 : ')]}'.includes(t) ? -1 : 0
  }
  return undefined
}
// Whether tokens call an assertion: a name that starts with assert, and is not being declared, then ( or .member(.
const callsAssert = (tokens: Token[]) => tokens.some((t, i) => /^assert[\w$]*$/.test(t.text) && tokens[i - 1]?.text !== 'function' &&
  (tokens[i + 1]?.text === '(' || (tokens[i + 1]?.text === '.' && tokens[i + 3]?.text === '(')))
// true when the test node:test reports at line and column of src, its callee's last name, is a call to test or it, bare,
// with .only, or as a method (t.test), whose arguments hold an inline function that calls an assertion; else why not.
export function checkedSite(src: string, line: number, column: number): true | string {
  const { tokens } = lex(src), at = offsetOf(src, line, column), i = tokens.findIndex(t => t.at === at)
  const callee = tokens[tokens[i]?.text === 'only' && tokens[i - 1]?.text === '.' ? i - 2 : i]?.text ?? ''
  if (!['test', 'it'].includes(callee) || tokens[i + 1]?.text !== '(') return 'no test or it call here'
  const bodies = argsOf(tokens, i + 1).flatMap(a => { const body = bodyOf(a); return body ? [body] : [] })
  if (bodies.length === 0) return 'no inline function'
  return bodies.some(callsAssert) ? true : 'its function calls no assert'
}
