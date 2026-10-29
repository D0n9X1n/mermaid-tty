// Each drawn field against Mermaid 12.2.0's ground truth (docs/specs/2026-10-29-mermaid-tty-v1-text-ground-truth.md): 16
// cases, each rendered as X{case}Y in Chrome under securityLevel strict. A case Mermaid shows as written draws as written; one
// it splits at its <br> draws as split lines; any other, shown as other text, swallowed (MISS) or an error (ERR), falls back.
import test from 'node:test'; import assert from 'node:assert/strict'
import { isFail, type Fail } from '../../core/fail.ts'
import { explain } from '../../core/render.ts'
import { parseXy, type Xy } from '../../core/diagrams/xychart/parse.ts'; import { readSource } from '../../core/source.ts'

const CASES = ['Q&A', 'Q & A', 'a < b', 'a<b', 'x > 5', '&lt;', '&amp;', '&lt', '#9829;', 'a<br>b', 'a<BR>b', 'a<br/>b', 'a<br />b',
  '<b>z</b>', 'a<!--c-->b', 'ﬂ°x¶ß']
// What Mermaid shows of each case, in CASES' order: = as written, ⏎ split at its <br>, MISS, ERR, or the text it shows.
const row = (s: string): string[] => s.split(' | ')
const TRUTH = {
  html: row('= | = | = | MISS | = | < | & | < | ♥ | ⏎ | ⏎ | ⏎ | ⏎ | z | ab | &x;'),
  sequence: row('= | = | = | = | = | ERR | ERR | = | ♥ | ⏎ | ⏎ | ⏎ | ⏎ | = | = | &x;'),
  box: row('= | = | a &lt; b | MISS | = | ERR | ERR | = | ♥ | ⏎ | ⏎ | ⏎ | ⏎ | = | ab | &x;'),
  slice: CASES.map(c => (c === '#9829;' ? '♥' : c === 'ﬂ°x¶ß' ? '&x;' : '=')),
  title: row('= | = | a &lt; b | MISS | = | = | = | = | ♥ | = | a<br>b | a<br>b | a<br>b | = | ab | &x;'),
}
// The <br> cases, and <b>z</b>.
const BRS = [9, 10, 11, 12], TAG = 13

// A drawn field: the text it draws for a case, one string per row, or its Fail. strict: the cases it falls back on though
// Mermaid shows them as written or split, where the drawing cannot match (a <br> in one-line text) or the field's mode
// cannot tell (sanitized: any <).
type Field = { name: string; truth: readonly string[]; draw: (c: string) => string[] | Fail; strict?: readonly number[] }

// The rows that owner's text cells draw of src at 120 columns, in the mono theme, or the Fail.
function drawn(src: string, owner: string): string[] | Fail {
  const r = explain(src, { columns: 120, theme: 'mono' })
  if (isFail(r)) return r
  return r.drawing.cells.flatMap(cells => {
    const t = cells.flatMap(c => ((c?.kind === 'text' || c?.kind === 'cont') && c.owners[0] === owner ? [c.ch] : [])).join('')
    return t ? [t] : []
  })
}

// Each case of f draws as written ([case]), split at its <br>, or falls back, as its truth and strict say.
function check(f: Field): void {
  const strict = new Set(f.strict ?? [])
  assert.ok([...strict].every(i => f.truth[i] === '=' || f.truth[i] === '⏎'), `${f.name}: strict lists only = and ⏎ cases`)
  const want = (c: string, i: number) => strict.has(i) || !['=', '⏎'].includes(f.truth[i]!) ? 'fallback'
    : f.truth[i] === '=' ? [c] : c.split(/<br\s*\/?>/i)
  const got = (c: string) => { const d = f.draw(c); return isFail(d) ? 'fallback' : d }
  assert.deepEqual(CASES.map(c => [c, got(c)]), CASES.map((c, i) => [c, want(c, i)]), f.name)
}

// A subgraph title draws on one line, on its frame's border, so a <br> there falls back.
test('A5.errors: ground truth: a flowchart node label, edge label and subgraph title draw each case as Mermaid shows it, or fall back', () => {
  const fields: Field[] = [
    { name: 'node', truth: TRUTH.html, draw: c => drawn(`flowchart TD\nA["${c}"]`, 'A') },
    { name: 'edge', truth: TRUTH.html, draw: c => drawn(`flowchart TD\nA -->|"${c}"| B`, 'L_A_B_0:label') },
    { name: 'subgraph', truth: TRUTH.html, draw: c => drawn(`flowchart TD\nsubgraph S ["${c}"]\nA\nend`, 'S'), strict: BRS },
  ]
  fields.forEach(check)
})

// An alias draws in a one-line pill, and a frame's label and a box's title on its border, so a <br> there falls back. A box
// title is sanitized: any < falls back, <b>z</b> too.
test('A5.errors: ground truth: a sequence message, note, alias, frame label and box title draw each case as Mermaid shows it, or fall back', () => {
  const S = (body: string, owner: string) => drawn(`sequenceDiagram\n${body}`, owner)
  const frame = (c: string) => { const d = S(`alt ${c}\nA->>B: x\nend`, 'f0'); return isFail(d) ? d : d.map(t => t.replace(/^alt \[(.*)\]$/, '$1')) }
  const fields: Field[] = [
    { name: 'message', truth: TRUTH.sequence, draw: c => S(`A->>B: ${c}`, 'm0:label') },
    { name: 'note', truth: TRUTH.sequence, draw: c => S(`Note over A: ${c}`, 'n0') },
    { name: 'alias', truth: TRUTH.sequence, draw: c => S(`participant A as ${c}`, 'A'), strict: BRS },
    { name: 'frame', truth: TRUTH.sequence, draw: frame, strict: BRS },
    { name: 'box', truth: TRUTH.box, draw: c => S(`box ${c}\nparticipant A\nend\nA->>A: x`, 'b0'), strict: [...BRS, TAG] },
  ]
  fields.forEach(check)
})

// A slice draws every <br> spelling as written, on its one row. A title is sanitized: any < falls back, and so do a<br>b
// and <b>z</b>, which Mermaid shows as written.
test('A5.errors: ground truth: a pie slice and title, on the header or a statement, draw each case as Mermaid shows it, or fall back', () => {
  const fields: Field[] = [
    { name: 'slice', truth: TRUTH.slice, draw: c => drawn(`pie\n"${c}" : 1`, 's0') },
    { name: 'header title', truth: TRUTH.title, draw: c => drawn(`pie title ${c}\n"a" : 1`, 'title'), strict: [9, TAG] },
    { name: 'title', truth: TRUTH.title, draw: c => drawn(`pie\ntitle ${c}\n"a" : 1`, 'title'), strict: [9, TAG] },
  ]
  fields.forEach(check)
})

// xychart has no layout yet, so each text is what the parser keeps, one line. Each is sanitized with no <br>, as the title;
// Mermaid's axis titles were not probed, so they take the title's truth.
test('A5.errors: ground truth: an xychart title, category and axis titles keep each case as Mermaid shows it, or fall back', () => {
  const X = (body: string, pick: (m: Xy) => string | null | undefined) => (c: string): string[] | Fail => {
    const s = readSource(`xychart-beta\n${body.replace('$', c)}`), m = isFail(s) ? s : parseXy(s)
    return isFail(m) ? m : [pick(m) ?? '']
  }
  const fields: Field[] = [
    { name: 'xy title', truth: TRUTH.title, draw: X('title "$"\nbar [1]', m => m.title), strict: [9, TAG] },
    { name: 'category', truth: TRUTH.title, draw: X('x-axis ["$", zz]\nbar [1, 2]', m => m.categories?.[0]), strict: [9, TAG] },
    { name: 'x-axis title', truth: TRUTH.title, draw: X('x-axis "$" [p, q]\nbar [1, 2]', m => m.xTitle), strict: [9, TAG] },
    { name: 'y-axis title', truth: TRUTH.title, draw: X('y-axis "$" 0 --> 5\nbar [1]', m => m.yTitle), strict: [9, TAG] },
  ]
  fields.forEach(check)
})
