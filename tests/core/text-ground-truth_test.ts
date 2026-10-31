// Each drawn field against what Mermaid 12.2.0 shows: 16
// cases, each rendered as X{case}Y in Chrome under securityLevel strict. A case Mermaid shows as written draws as written; one
// it splits at its <br> draws as split lines; any other, shown as other text, swallowed (MISS) or an error (ERR), falls back.
import test from 'node:test'; import assert from 'node:assert/strict'
import { isFail, type Fail } from '../../core/fail.ts'
import { explain } from '../../core/render.ts'
import { parseXy, type Xy } from '../../core/diagrams/xychart/parse.ts'; import { readSource } from '../../core/source.ts'
import { parseSequence } from '../../core/diagrams/sequence/parse.ts'
import { parseQuadrant, type Quadrant } from '../../core/diagrams/quadrant/parse.ts'

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
const BRS = [9, 10, 11, 12]
const  TAG = 13

// A drawn field: the text it draws for a case, one string per row, or its Fail. strict: the cases it falls back on though
// Mermaid shows them as written or split, where the drawing cannot match (a <br> in one-line text) or the field's mode
// cannot tell (sanitized: any <).
// shows: the cases it draws as the text Mermaid shows, as the truth gives it (a #…; code decoded).
type Field = { name: string; truth: readonly string[]; draw: (c: string) => string[] | Fail; strict?: readonly number[]; shows?: readonly number[] }

// The rows that owner's text cells draw of src at 120 columns, in the mono theme, or the Fail.
function drawn(src: string, owner: string): string[] | Fail {
  const r = explain(src, { columns: 120, theme: 'mono' })
  if (isFail(r)) { return r }
  return r.drawing.cells.flatMap(cells => {
    const t = cells.flatMap(c => ((c?.kind === 'text' || c?.kind === 'cont') && c.owners[0] === owner ? [c.ch] : [])).join('')
    return t ? [t] : []
  })
}

// Each case of f draws as written ([case]), split at its <br>, or falls back, as its truth and strict say.
function check(f: Field): void {
  const strict = new Set(f.strict ?? [])
  assert.ok([...strict].every(i => f.truth[i] === '=' || f.truth[i] === '⏎'), `${f.name}: strict lists only = and ⏎ cases`)
  const want = (c: string, i: number) => f.shows?.includes(i) ? [f.truth[i]!] : strict.has(i) || !['=', '⏎'].includes(f.truth[i]!) ? 'fallback'
    : f.truth[i] === '=' ? [c] : c.split(/<br\s*\/?>/i)
  const got = (c: string) => { const d = f.draw(c); return isFail(d) ? 'fallback' : d }
  assert.deepEqual(CASES.map(c => [c, got(c)]), CASES.map((c, i) => [c, want(c, i)]), f.name)
}

// A subgraph title draws on one line, on its frame's border, so a <br> there falls back.
test('A5.errors: ground truth: a flowchart node label, edge label and subgraph title draw each case as Mermaid shows it, or fall back', () => {
  const fields: Field[] = [
    { name: 'node', truth: TRUTH.html, draw: c => drawn(`flowchart TD\nA["${c}"]`, 'A'), shows: [8] },
    { name: 'edge', truth: TRUTH.html, draw: c => drawn(`flowchart TD\nA -->|"${c}"| B`, 'L_A_B_0:label'), shows: [8] },
    { name: 'subgraph', truth: TRUTH.html, draw: c => drawn(`flowchart TD\nsubgraph S ["${c}"]\nA\nend`, 'S'), strict: BRS, shows: [8] },
  ]
  fields.forEach(check)
})

// An alias draws in a one-line pill, and a frame's label and a box's title on its border, so a <br> there falls back. A box
// title is sanitized: any < falls back, <b>z</b> too.
test('A5.errors: ground truth: a sequence message, note, alias, frame label and box title draw each case as Mermaid shows it, or fall back', () => {
  // Each case drawn as X{case}Y, as the truth was rendered, then the X and Y dropped: Mermaid ends a sequence statement at
  // a ;, so &lt; alone draws &lt as Mermaid shows it, while X&lt;Y fails in both.
  const S = (body: string, owner: string) => drawn(`sequenceDiagram\n${body}`, owner)
  const xy = (d: string[] | Fail): string[] | Fail => {
    if (isFail(d)) { return d }
    if (!d[0]?.startsWith('X') || !d.at(-1)?.endsWith('Y')) { return { reason: 'not X…Y' } as Fail }
    return d.map((t, i) => (i === 0 ? t.slice(1) : t)).map((t, i, a) => (i === a.length - 1 ? t.slice(0, -1) : t))
  }
  const frame = (c: string) => { const d = S(`alt X${c}Y\nA->>B: x\nend`, 'f0'); return isFail(d) ? d : xy(d.map(t => t.replace(/^alt \[(.*)\]$/, '$1'))) }
  const fields: Field[] = [
    { name: 'message', truth: TRUTH.sequence, draw: c => xy(S(`A->>B: X${c}Y`, 'm0:label')) },
    { name: 'note', truth: TRUTH.sequence, draw: c => xy(S(`Note over A: X${c}Y`, 'n0')) },
    { name: 'alias', truth: TRUTH.sequence, draw: c => xy(S(`participant A as X${c}Y`, 'A')), strict: BRS },
    { name: 'frame', truth: TRUTH.sequence, draw: frame, strict: BRS },
    { name: 'box', truth: TRUTH.box, draw: c => xy(S(`box X${c}Y\nparticipant A\nend\nA->>A: x`, 'b0')), strict: [...BRS, TAG] },
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
    const s = readSource(`xychart-beta\n${body.replace('$', c)}`)
const  m = isFail(s) ? s : parseXy(s)
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

// QA repro: Mermaid 12.2.0 shows flowchart A["a<br />b"] as one unsplit line, an edge label too. Its sequence splitter
// splits there and at </br>, which this drawing does not, so each falls back.
test('A5.errors: ground truth: a <br> with a non-HTML space, or a </br>, falls back in a flowchart node or edge label and a sequence message or note', () => {
  const nb = 'a<br />b'
  const srcs: [string, string][] = [[`flowchart TD\nA["${nb}"]`, 'A'], [`flowchart TD\nA -->|"${nb}"| B`, 'L_A_B_0:label'],
    [`sequenceDiagram\nA->>B: ${nb}`, 'm0:label'], ['sequenceDiagram\nA->>B: a</br>b', 'm0:label'], ['sequenceDiagram\nNote over A: a</br>b', 'n0']]
  assert.deepEqual(srcs.map(([s, o]) => [s, drawn(s, o)]), srcs.map(([s]) => [s, { reason: 'html' }]))
})

// QA repro: Mermaid 12.2.0 shows sequence `title a<!--c-->b` as ab. A sequence title, statement or frontmatter, is sanitized
// with no <br>, as a pie title is.
test('A5.errors: ground truth: a sequence title, statement or frontmatter, is sanitized: a < or a <br> falls back', () => {
  const T = (src: string) => { const s = readSource(src); return isFail(s) ? s : parseSequence(s) }
  const bad = ['a<!--c-->b', 'a < b', 'a<br>b', '<b>z</b>']
  assert.deepEqual(bad.map(c => [c, T(`sequenceDiagram\ntitle ${c}\nA->>B: x`)]), bad.map(c => [c, { reason: 'html' }]))
  assert.deepEqual(bad.map(c => [c, T(`---\ntitle: "${c}"\n---\nsequenceDiagram\nA->>B: x`)]), bad.map(c => [c, { reason: 'html' }]))
  assert.deepEqual(drawn('sequenceDiagram\ntitle a<!--c-->b\nA->>B: x', 'title'), { reason: 'html' })
  assert.deepEqual(['Q & A', 'x > 5'].map(c => drawn(`sequenceDiagram\ntitle ${c}\nA->>B: x`, 'title')), [['Q & A'], ['x > 5']])
})

// QA repro: Mermaid 12.2.0 shows a frontmatter title "ﬂ°x¶ß" as &x; and "a<!--c-->b" as ab, in every type. explain checks
// it as a sanitized title with no <br>. Only those two cases were probed for frontmatter; the rest take the title's truth.
// #9829; falls back though encodeEntities never sees frontmatter, so Mermaid may show it as written: conservative.
test('A5.errors: ground truth: a frontmatter title draws each case as Mermaid shows a title, or falls back, in pie, flowchart and xychart', () => {
  const F = (body: string) => (c: string) => drawn(`---\ntitle: "${c}"\n---\n${body}`, 'title')
  const fields: Field[] = [
    { name: 'pie frontmatter', truth: TRUTH.title, draw: F('pie\n"a" : 1'), strict: [9, TAG] },
    { name: 'flowchart frontmatter', truth: TRUTH.title, draw: F('flowchart TD\nA'), strict: [9, TAG] },
    { name: 'xychart frontmatter', truth: TRUTH.title, draw: F('xychart-beta\nbar [1]'), strict: [9, TAG] },
  ]
  fields.forEach(check)
})

// X2. QA repro: Mermaid 12.2.0 shows ER A["a<!--c-->b"] as ab. Every ER text is an HTML label (erBox's createText). An
// entity's label draws in a one-line pill, an attribute's comment in one row, and a subgraph's title on its frame's border,
// so a <br> there falls back; a relation's label splits at each <br>.
test('A5.errors: ground truth: an ER entity label, relation label, attribute comment and subgraph title draw each case as Mermaid shows it, or fall back', () => {
  const E = (body: string, owner: string) => (c: string) => drawn(`erDiagram\n${body.replace('$', c)}`, owner)
  const fields: Field[] = [
    { name: 'entity label', truth: TRUTH.html, draw: E('A["$"]\nA ||--o{ B : owns', 'A'), strict: BRS },
    { name: 'relation label', truth: TRUTH.html, draw: E('A ||--o{ B : "$"', 'r0:label') },
    { name: 'attribute comment', truth: TRUTH.html, draw: E('A {\nstring x "$"\n}', 'A.a0.comment'), strict: BRS },
    { name: 'subgraph title', truth: TRUTH.html, draw: E('subgraph S ["$"]\nA\nend', 'S'), strict: BRS },
  ]
  fields.forEach(check)
})

// X2. journey: a task or section never splits, so each <br> spelling draws as written (plain, literal); an actor shows a
// <br> as a space, so any <br falls back; a title is sanitized with no <br>. Every field falls back on a marker.
test('A5.errors: ground truth: a journey task, section, actor and title draw as Mermaid shows them, or fall back', () => {
  const J = (body: string, owner: string) => (c: string) => drawn(`journey\n${body.replace('$', c)}`, owner)
  const task = J('section s\n$: 3: me', 't0')
const  section = J('section $\nt: 3: me', 'sec0')
  const actor = J('section s\nt: 3: $', 't0.a0')
const  title = J('title $\nsection s\nt: 3: me', 'title')
  const fb = { reason: 'html' }
const  ent = { reason: 'entity' }
  const cases: [string, (c: string) => string[] | Fail, string, string[] | Fail][] = [
    ['task', task, 'ﬂ°x¶ß', ent], ['task', task, 'a<br>b', ['a<br>b']], ['task', task, 'a<!--c-->b', ['a<!--c-->b']],
    ['task', task, 'Q&A', ['Q&A']], ['task', task, 'a < b', ['a < b']],
    ['section', section, 'ﬂ°x¶ß', ent], ['section', section, 'a<BR>b', ['a<BR>b']], ['section', section, 'a < b', ['a < b']],
    ['actor', actor, 'ﬂ°x¶ß', ent], ['actor', actor, 'a<br>b', fb], ['actor', actor, 'a</br>b', fb], ['actor', actor, 'Q&A', ['Q&A']],
    ['actor', actor, 'a < b', ['a < b']],
    ['title', title, 'ﬂ°x¶ß', ent], ['title', title, 'a<!--c-->b', fb], ['title', title, 'a < b', fb], ['title', title, 'a<br>b', fb],
    ['title', title, 'Q&A', ['Q&A']], ['title', title, 'x > 5', ['x > 5']],
  ]
  assert.deepEqual(cases.map(([f, d, c]) => [f, c, d(c)]), cases.map(([f, , c, w]) => [f, c, w]))
})

// X2. Every quadrant text is sanitized (quadrantDb's textSanitizer; a title by setDiagramTitle), with no <br>: column T for
// quoted text. Unquoted text cannot hold < or > (quadrant.jison), but a marker falls back there too.
test('A5.errors: ground truth: a quadrant title, axis, quadrant and point text keep each case as Mermaid shows it, or fall back', () => {
  const Q = (body: string, pick: (m: Quadrant) => string | null | undefined) => (c: string): string[] | Fail => {
    const s = readSource(`quadrantChart\n${body.replace('$', c)}`)
const  m = isFail(s) ? s : parseQuadrant(s)
    return isFail(m) ? m : [pick(m) ?? '']
  }
  const fields: Field[] = [
    { name: 'quadrant title', truth: TRUTH.title, draw: Q('title $', m => m.title), strict: [9, TAG] },
    { name: 'x-axis', truth: TRUTH.title, draw: Q('x-axis "$" --> hi', m => m.x?.[0]), strict: [9, TAG] },
    { name: 'y-axis', truth: TRUTH.title, draw: Q('y-axis lo --> "$"', m => m.y?.[1]), strict: [9, TAG] },
    { name: 'quadrant-1', truth: TRUTH.title, draw: Q('quadrant-1 "$"', m => m.quads[0]), strict: [9, TAG] },
    { name: 'point', truth: TRUTH.title, draw: Q('"$": [0.5, 0.5]', m => m.points[0]?.name), strict: [9, TAG] },
  ]
  fields.forEach(check)
  const bare = ['quadrant-1 Q&A', 'quadrant-1 ﬂ°x¶ß', 'x-axis ﬂ°x¶ß', 'ﬂ°x¶ß: [0.5, 0.5]']
  assert.deepEqual(bare.map(b => [b, Q(b, m => m.quads[0])('')]),
    [[bare[0], ['Q&A']], ...bare.slice(1).map(b => [b, { reason: 'entity' }])])
})

// X2. A gantt title, statement or frontmatter, is sanitized with no <br>, as a pie title is (column T).
test('A5.errors: ground truth: a gantt title draws each case as Mermaid shows it, or falls back', () => {
  const fields: Field[] = [
    { name: 'gantt title', truth: TRUTH.title, draw: c => drawn(`gantt\ntitle ${c}\nT :2024-01-01, 1d`, 'title'), strict: [9, TAG] },
  ]
  fields.forEach(check)
})

// X3 (Mermaid 12.2.0 source): createText runs replaceIconSubstring and, given $$…$$, KaTeX on every HTML label, and marked
// on a markdown one (class, state, ER, mindmap; not a flowchart's plain label). Each cross-family QA repro falls back; an
// ordinary label in each field still draws.
const reason = (src: string): string | null => { const r = explain(src, { columns: 120, theme: 'mono' }); return isFail(r) ? r.reason : null }
// gitGraph is parsed but not yet drawn (explain: unimplemented), so its whitespace repros are in gitGraph-parse_test.ts.
test('X3: QA repros: Markdown other than bold and italic, icons and math in class, state and ER labels, ER comments and class notes fall back', () => {
  const repros = ['classDiagram\nclass A["**a **b** c**"]', 'stateDiagram-v2\nstate "**a **b** c**" as A', 'erDiagram\nA {\n  string id "**a **b** c**"\n}',
    'classDiagram\nclass A["fa:fa-book"]', 'stateDiagram-v2\nA : fa:fa-book', 'erDiagram\nA["fa:fa-book"]',
    'classDiagram\nclass A["$$x^2$$"]', 'stateDiagram-v2\nA : $$x^2$$', 'erDiagram\nA {\n  string id "$$x^2$$"\n}',
    'classDiagram\nclass A\nnote "a<br\u00a0/>b"',
    'flowchart TD\nA[fa:fa-book]', 'flowchart TD\nA["$$x$$"]', 'mindmap\nR\n  fa:fa-book']
  assert.deepEqual(repros.map(s => [s, reason(s) !== null]), repros.map(s => [s, true]))
  // A literal \n in a class note shows as written in Mermaid: one line here too.
  assert.deepEqual(drawn('classDiagram\nclass A\nnote for A "First\\nSecond"', 'note0'), ['First\\nSecond'])
  const ordinary = ['classDiagram\nclass A["snake_case"]\nA --> B : a*b\nnote "plain"', 'stateDiagram-v2\nstate "snake_case" as A\nA --> B : a*b',
    'erDiagram\nA {\n  string id "plain_id"\n}\nA ||--o{ B : owns', 'flowchart TD\nA["**bold**"] -->|x| B', 'mindmap\nR\n  plain',
    // X3.emphasis: bold and italic Mermaid shows as <strong> and <em> draw.
    'classDiagram\nclass A["**bold**"]', 'stateDiagram-v2\nstate "**bold**" as A', 'erDiagram\nA {\n  string id "**bold**"\n}']
  assert.deepEqual(ordinary.map(s => [s, reason(s)]), ordinary.map(s => [s, null]))
})
