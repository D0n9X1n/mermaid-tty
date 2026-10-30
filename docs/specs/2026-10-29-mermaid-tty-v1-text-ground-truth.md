# mermaid-tty v1 drawn-text ground truth

Normative for drawn text (task X1). It records what Mermaid 12.2.0 shows for 16 special-character cases in each kind of field, and the rule each field follows. X2 and the wiki cite it.

## Method

- Each case was rendered as `X{case}Y` in each field, with Mermaid 12.2.0 from jsDelivr, in Chrome, under `securityLevel: strict`. The cell is what the page showed.
- Cells: `=` shown exactly as written, on one line; `⏎` split at the `<br>`; `MISS` the text after `a<b` was swallowed; `ERR` a parse error; anything else is the text shown, which differs from the source.
- **The rule.** A field draws a case only where Mermaid shows it as written (`=`) or split at its `<br>` (`⏎`), and the renderer draws it the same way. Every other case falls back to the fence's source. Falling back on a `=` or `⏎` case is allowed; drawing other text than Mermaid shows never is.

## Ground truth

Columns:

- **H** (HTML labels): flowchart node, edge label and subgraph title; state; class label, note and relation; ER; mindmap.
- **S**: sequence message, note, participant alias and frame label.
- **B**: sequence box title.
- **P**: pie slice; gantt task.
- **T**: gantt, pie and xychart title; xychart category; quoted quadrant text. One `<` makes the whole string show DOMPurify's escaped output.

| # | Case | H | S | B | P | T |
|---|---|---|---|---|---|---|
| 1 | `Q&A` | = | = | = | = | = |
| 2 | `Q & A` | = | = | = | = | = |
| 3 | `a < b` | = | = | `a &lt; b` | = | `a &lt; b` |
| 4 | `a<b` | MISS | = | MISS | = | MISS |
| 5 | `x > 5` | = | = | = | = | = |
| 6 | `&lt;` | `<` | ERR | ERR | = | = |
| 7 | `&amp;` | `&` | ERR | ERR | = | = |
| 8 | `&lt` | `<` | = | = | = | = |
| 9 | `#9829;` | `♥` | `♥` | `♥` | `♥` | `♥` |
| 10 | `a<br>b` | ⏎ | ⏎ | ⏎ | = | = |
| 11 | `a<BR>b` | ⏎ | ⏎ | ⏎ | = | `a<br>b` |
| 12 | `a<br/>b` | ⏎ | ⏎ | ⏎ | = | `a<br>b` |
| 13 | `a<br />b` | ⏎ | ⏎ | ⏎ | = | `a<br>b` |
| 14 | `<b>z</b>` | `z` | = | = | = | = |
| 15 | `a<!--c-->b` | `ab` | = | `ab` | = | `ab` |
| 16 | `ﬂ°x¶ß` | `&x;` | `&x;` | `&x;` | `&x;` | `&x;` |

Case 16: Mermaid's `encodeEntities` writes `#name;` and `#123;` as the markers `ﬂ°…¶ß` and `ﬂ°°…¶ß`, and `decodeEntities` turns `ﬂ°` into `&` and `¶ß` into `;` in the SVG. So markers written in the source show as `&` and `;`.

QA probes since (Mermaid 12.2.0, Chrome):

- A frontmatter title `ﬂ°x¶ß` shows `&x;`, and `a<!--c-->b` shows `ab`, in pie, flowchart and xychart.
- A sequence `title a<!--c-->b` shows `ab`.
- A flowchart node or edge label `a<br />b` (a no-break space before the slash) shows one unsplit line.

### Not in X1's scope (for X2)

- timeline splits only a lowercase `<br>`.
- journey: a task or section never splits; an actor shows a `<br>` as a space.
- gitGraph: a tag or id escapes `<` and `>`.
- class member: decodes entities, keeps tags literal, cuts at `a<b`, and never splits.
- state: a `;` starts a new line.

## The rule: `drawable(text, mode, br)`

`core/text.ts` exports `drawable(text, mode, br): Fail | null`. It runs in this order:

1. **Every mode:** `#\w+;`, `ﬂ°` or `¶ß` fails `entity`.
2. **`br`:**
   - `any`: `<br[ \t\n\f\r]*\/?>`, in any case, splits; it is removed before the mode rules run. Only HTML's whitespace may come before the slash: HTML ends a tag name nowhere else, so `<br />` is other markup. A break Mermaid's own splitter still finds after that (`lineBreakRegex`, `/<\/?br\s*\/?>/i`: a `<br>` with another space, or `</br>`) fails `html`, since Mermaid would split there and this drawing would not.
   - `lower`: only `<br>` splits; every one is removed.
   - `literal`: every `<br>` spelling draws as written, and the mode rules see it.
   - `none`: any `<br` or `</br` fails `html`.
3. **Mode:**
   - `plain`: nothing more.
   - `html`: `<` before `[A-Za-z/!?]` fails `html`; `&` before `#` or two ASCII letters fails `entity`. `Q&A`, `AT&T` and `a < b` pass.
   - `sanitized`: any `<` fails `html`.
   - `escaped`: any `<` or `>` fails `html`.
   - `member`: any `<` fails `html`; `&` before `#` or two letters of any script fails `entity`.

## Each field's mode

| Field | Mode | br | Notes |
|---|---|---|---|
| flowchart node label, edge label | html | any | X5: `#…;` codes decoded; a `` "`…`" `` string, or an `@{ label }`, is mode markdown. |
| flowchart subgraph title | html | **none** | Stricter: see below. |
| sequence message, note | plain | any | Sequence also fails `hash` on any `#` and `semicolon` on any `;`. |
| sequence participant alias, frame label (`alt`…, `else`…) | plain | **none** | Stricter: see below. |
| sequence box title | sanitized | **none** | Stricter: see below. |
| sequence title, statement or frontmatter | sanitized | none | QA: Mermaid shows `title a<!--c-->b` as `ab`. |
| pie slice | plain | literal | The layout wraps a slice only at spaces, never at `<br>`. |
| pie title, header or statement | sanitized | none | |
| xychart title, category | sanitized | none | |
| xychart axis titles, series name | sanitized | none | Not probed: given the title's rule. |
| ER relation label | html | any | X2. Every ER text is an HTML label (erBox's createText). |
| ER entity name or alias, attribute type, name and comment, subgraph id or title | html | **none** | X2. One-line pill, row or frame border. QA: `A["a<!--c-->b"]` showed `ab`. |
| journey task, section | plain | literal | X2. Never split. |
| journey actor | plain | **none** | X2. Mermaid shows a `<br>` as a space. |
| journey title | sanitized | none | X2. |
| quadrant title, axis, quadrant and point text | sanitized | none | X2. quadrantDb sanitizes all; unquoted text cannot hold `<`. |
| gantt title | sanitized | none | X2. A section with no task falls back `section-empty`: Mermaid draws no header. |

**Frontmatter title, every type:** sanitized, `br: none`. `explain` (`core/render.ts`) checks it right after `readSource`, before any parser. QA: Mermaid shows a frontmatter title `ﬂ°x¶ß` as `&x;` and `a<!--c-->b` as `ab`, in pie, flowchart and xychart alike: the title is sanitized, and `decodeEntities` runs over the whole SVG. Only those two cases were probed; the rest take column T. `#9829;` falls back conservatively, though `encodeEntities` never sees frontmatter and Mermaid may show it as written.

## Where X1 falls back on a `=` or `⏎` case

These cells fall back though Mermaid shows them as written or split. The tests list each one as `strict`.

- **One-line fields.** A subgraph title draws on its frame's border, an alias in a one-line pill, and a frame label or box title on a border, so none can show the split Mermaid draws at a `<br>`. They take `br: none`: cases 10–13 fall back. Drawing them split needs layout changes outside X1.
- **Sanitized fields.** Mermaid shows `a<br>b` (case 10 in T) and `<b>z</b>` (case 14 in B and T) as written: DOMPurify keeps a well-formed tag and escapes only some `<`. `sanitized` fails any `<`, as it cannot tell which text DOMPurify reserializes unchanged.

## Tests

- `tests/core/text_test.ts`: `drawable` for each mode and each `br`, the HTML-whitespace `<br>`, and every `<br>` removed.
- `tests/core/text-ground-truth_test.ts`: all 16 cases for every probed field above, plus the xychart axis titles and the frontmatter title of pie, flowchart and xychart; and the QA repros: the sequence title, and `<br />` or `</br>` in a flowchart node or edge label and a sequence message or note. A `=` case draws as written, a `⏎` case as its split lines, and every other case falls back. The xychart field cases check what the parser keeps.

## Blast radius

None. Every block of `fixtures/flowchart`, `fixtures/sequence` and `fixtures/corpus` draws the same cells, or fails with the same reason, at 60, 80 and 120 columns as before X1: 204 results compared, all unchanged. The fixtures hold `<br>` and `<br/>` only outside subgraph titles, aliases, frame labels, box titles and titles; no `&` before `#` or two letters; no other `<`; no markers. The one `&` in a drawn field is `Alice & John` in a sequence box, which stays drawable.

Fix cycle 1 (frontmatter and sequence titles sanitized, `<br>` separators ASCII only): none. The same 204 results match the base, including the 10 fixtures with a frontmatter title.

## X3: Markdown, icons and math

Verified by reading Mermaid 12.2.0's source (`npm install mermaid@12.2.0`, its source maps): `rendering-util/createText.ts`, `rendering-util/handle-markdown-text.ts`, `diagrams/common/common.ts`, and each diagram's db; `marked` 16.4.2 was run on probe strings through a copy of `markdownToHTML`.

- **Every HTML label** goes through `createText`, which runs `replaceIconSubstring` (`/(fa[bklrs]?):fa-([\w-]+)/g`: an icon replaces the token) and, when `hasKatex` (`/\$\$(.*?)\$\$/`) matches, renders the whole label as KaTeX. Fails `icon` (also `fad:`, to be safe) and `math`.
- **Markdown** runs only where `createText` gets `markdown: true`: a label with `labelType: 'markdown'`, and every call that leaves the default. That is every class name, label, annotation, member, note and relation label; every state node, note, transition and composite title (a state shown by its id too); every ER entity, attribute column, relation label and subgraph title (`sanitizeNodeLabelType` defaults to `markdown`); every mindmap node. Not a flowchart node, edge label or subgraph title (`labelType: 'text'`; X5: a `` "`…`" `` string and an `@{ label }` are `markdown`), a class cardinality or a namespace title (`createLabel`, `markdown: false`).
- `markdownToHTML` changes text only through `strong`, `em`, `escape` and newlines; code spans, links, headings, lists, rules and `~~` are emitted as their raw source. So mode `markdown` (and `member`) fails `markdown` on a `\` before ASCII punctuation, two or more `*`, or two or more `_` in runs touching a non-letter, non-digit or an end. Verified as written, and drawn: `a*b`, `+swim()*`, `snake_case`, `a_b_c`, `_private`, `x__`, `C:\Users`, `a\nb`, `` `code` ``, `# h`, `- item`, `[x](y)`. Shown as written but falling back conservatively: `a * b * c` (two `*`). Verified rendered: `**bold**`, `*a*`, `_a_`, `__init__`, `+__init__()`, `x._y_`, `(_a_)`, `a*b*c`, `a\*b`, `a\\b`.
- **A plain HTML label** (`nonMarkdownToHTML`) turns a literal `\n` into `<br />`: mode `html` fails `newline` on one.
- **Class notes** reach the label as written: Mermaid converts neither a literal `\n` (shown as written) nor `<br` + U+00A0 + `/>` (no break). The parser no longer rewrites them; `drawable` sees the raw text and `labelLines` splits only the `<br>` HTML would.
- **gitGraph:** the Langium grammar hides only `WS: /[ \t]+/` and ends lines at `/\r?\n/`. Any other whitespace (U+00A0, U+2028, form feed), between tokens or at a line's end, fails `syntax`.

| Field | Mode before | Mode now |
|---|---|---|
| class name, annotation | html, none | markdown, none |
| class label, note, relation label | html, any | markdown, any |
| class cardinality, namespace title | html, none | html, none |
| state text, composite title, id shown as label | html | markdown |
| ER every text | html | markdown |
| mindmap label | html (+ own Markdown rule) | markdown (+ own Markdown rule); icons and math now fail `icon:<n>`, `math:<n>`, not `syntax:<n>` |
| flowchart node, edge label, subgraph title | html | html (now also `icon`, `math`, `newline`) |

Tests: `tests/core/text_test.ts` (the rules), each parser's test (QA repros and an ordinary label per field), `tests/core/text-ground-truth_test.ts` (repros end to end; gitGraph is not drawn yet, so its repros are in `gitGraph-parse_test.ts`).

Blast radius: none. All 612 results (204 blocks of `fixtures/{flowchart,sequence,corpus}` at 60, 80 and 120 columns) are unchanged against 6699750.

## X4: non-HTML labels and whitespace the lexers reject

Verified against `mermaid@12.2.0` from npm, in a fresh temp dir: `mermaid.parse` and `mermaidAPI.getDiagramFromText` under JSDOM, and `dist/mermaid.js` read directly.

**`htmlLabels`.** Every mode above assumes HTML labels. Mermaid reads the flag through `getEffectiveHtmlLabels` (`config.htmlLabels ?? config.flowchart?.htmlLabels ?? true`, through `evaluate`, which reads `false`, `"false"`, `"null"` and `"0"` as false) and, in some shapes, `config.htmlLabels` or `flowchart.htmlLabels` directly. No reader of `class.htmlLabels` or `state.htmlLabels` exists. With labels off, `markdownToLines` draws SVG text and drops unsupported inline tokens: `` class A["before `code` after"] `` shows "before after". Rule (`readSource`): any config key `htmlLabels` or `<anything>.htmlLabels` whose value is not the boolean `true` fails `config:htmlLabels`. That covers keys Mermaid does not read, to be safe.

**Directives.** `preprocessDiagram` runs `directiveRegex` over the whole text after the frontmatter, so `%%{init: {"htmlLabels": false}}%%` sets config even inside a `%%` comment line or inside a quoted label. `parse` returned `config: {htmlLabels: false}` for both. Before X4, `readSource` caught `%%{` only at a line's start. Rule: any line holding `%%{` fails `directive`.

**Whitespace.** `ODD_WS` is JS's `\s` less space, tab and line breaks: U+00A0, U+1680, U+2000–U+200A, U+2028/9, U+202F, U+205F, U+3000, U+FEFF, `\v` and `\f`. `trim()` drops them, so `readSource` hid them from the parsers in the header line and in blank lines. What Mermaid 12.2.0 does with each, probed in the header line, a blank line and a leading indent:

| Types | Header line | Blank line | Indent |
|---|---|---|---|
| gitGraph, pie (Langium; hide only `[ \t]+`) | lexer error | lexer error | lexer error |
| mindmap, quadrantChart (Jison) | parse error | parse error | accepted (mindmap indents the same as spaces) |
| flowchart/graph, sequenceDiagram, stateDiagram(-v2), classDiagram(-v2), erDiagram, gantt, journey, timeline, xychart(-beta) (Jison `\s`) | accepted | accepted | accepted |

Before the header, Mermaid's `cleanupComments` `trimStart()` drops them in every type. Inside double quotes, gitGraph and pie accept them (`"a b"`).

Rule (`readSource`, `oddWhitespace`), from the header line on (its leading whitespace dropped):
- gitGraph and pie fail `whitespace` on any `ODD_WS` outside double quotes. A title holding U+00A0 is included, which fails closed.
- Types in `JISON_WS` never fail on it.
- Every other type fails on one in the header line or in a blank line.

gitGraph's own check (X3, `syntax:<n>`) stays, tested past `readSource`.

Tests: `tests/core/source-config_test.ts` (X4 htmlLabels), `tests/core/source_test.ts` (X4 directive, X4 whitespace: pie, mindmap and quadrantChart fail; flowchart's header and blank line, a mindmap indent and a quoted pie label read as their ASCII twins), `tests/core/gitGraph-parse_test.ts` (X4, both repros; X3 updated).

Blast radius: none. All 1257 results (419 blocks of `fixtures/**`, corpus included, at 60, 80 and 120 columns) are unchanged against 86d5df4.

## X5: flowchart constructs from issue #4

Verified against `mermaid@12.2.0` from npm, in a fresh temp dir: `flow.jison` and `flowDb.ts` read from the package's source map, `getDiagramFromText` for the parsed edges and nodes, and `mermaid.render` under JSDOM for the shown label HTML and edge markers.

- **Links** (`core/diagrams/flowchart/links.ts`) port the lexer's link rules and `destructLink`. A text form's opener mark pairs with its closer's head: `<-- t -->`, `<-. t .->`, `<== t ==>`, `x-- t --x`, `o-- t --o` draw both heads. A mark that does not pair, or strokes that differ (`<-- t ---`, `<-- t --o`, `x-- t -->`), is `INVALID` and falls back `syntax`. Text-form text is lexed as Mermaid lexes it: `-- a<--> B` is label `a` with two heads, and `-. a.b .->` and `== a=b ==>` are lexer errors.
- **Mixed end marks**: `destructEndLink` keeps only the head; an unpaired tail mark stays in the line, so `<--o` has length 2 and `<==o` draws a normal (solid) line. These draw so.
- **Partly quoted labels**: one non-empty `"…"` (or `` "`…`" ``) first, then text with no `"`; Mermaid shows the two joined and trimmed (`["a" b]` → `a b`, `["a"b]` → `ab`). A space or text before the string, a second string, an empty string or an empty label is a parse error; `A[ "a" ]` and `A -->|""| B`, drawn before, now fall back `syntax`.
- **`@{ … }` over lines**: the lexer keeps the body's line breaks, and `flowDb.addVertex` then loads it as a YAML block mapping (no `{}` added). Only bodies whose block and flow readings agree are joined (`core/diagrams/flowchart/data.ts`): one `key: value` per line at one indent of spaces, a `"…"`/`'…'` value with no escape or a bare word, then a line starting with `}`. An uneven indent (`bad indentation`), a comma (block YAML keeps it in the value), a tab or a quote across lines falls back.
- **Markdown strings**: `` "`…`" `` gives `labelType: 'markdown'` in node, edge and subgraph labels; `flowDb` gives an `@{ label }` `markdown` too. Mermaid shows the text without quotes and backquotes, through marked, so mode `markdown` applies: plain text draws; bold and italic draw as X3.emphasis says; escapes and other Markdown fail `markdown`. A backquoted `@{ label }` value keeps `markdown-string`.
- **`#…;` codes** (`decoded`, `core/text.ts`, flowchart only): `encodeEntities` marks `#name;` and `#123;` before parsing, so their `;` never ends a statement; the browser then shows the character. A decimal code draws as its character unless a control, a surrogate, whitespace or past U+10FFFF. Names drawn: those seen shown (`quot amp lt gt apos copy reg trade hearts deg hellip mdash ndash larr rarr times divide plusmn middot bull euro`); `#Hearts;`, `#QUOT;` and unknown names show as `&name;`, so fall back `entity`. The text with codes masked, and each `<br>` piece decoded, must pass `drawable`, so a decoded `<b>`, `fa:` or `*` falls back. A directive holding a code outside quotes (`style A fill:#f9f;stroke:#333;`) is a parse error. A quoted subgraph title keeps its raw text as its id.
- Other diagrams keep failing `entity` on codes: their parsers are outside this change. Bold and italic now draw (X3.emphasis below).

Tests: `tests/core/flowchart-edges_test.ts`, `flowchart-parse_test.ts`, `flowchart-subgraph_test.ts`, `text-ground-truth_test.ts` (case 9 now drawn as `♥` in flowchart fields). Fixtures `flowchart-ok-53`…`58`.

### X5 review: where we now fall back

A cross-family review of 37a8ff2 found eight inputs drawn other than Mermaid 12.2.0 shows them. Each was reproduced under JSDOM, then narrowed:

- `subgraph "`A`"` takes `A` as its id (the string's text, trimmed), so `A --> C` joins the cluster.
- A `#…;` name is looked up as an own property only: `#__proto__;`, `#constructor;` fall back `entity`.
- `@{ labelType }` decides the label's mode: `text` or `string` HTML (a literal `\n` falls back `newline`), any other Markdown.
- Every `@{ … }` value must be one `yamlValue` reads (`core/diagrams/flowchart/data.ts`): a `"…"` with no `\`, a `'…'` with no `}`, `^` or lone `"` (Mermaid's shape-data lexer protects only `"…"`), or a bare string that starts with a letter or `_` and holds no YAML or lexer indicator. A bool, null, number or empty `label` falls back, as do `icon` and `img` (another shape), and any `@{ shape }` name Mermaid does not know (`No such shape`).
- An `@{` joins following lines only right after an id, outside `"…"`, brackets and acc statements.
- Unquoted text in a node, `|…|` or subgraph label is Mermaid's text token: `( ) [ ] { } |` anywhere, or `~~~` at its start, fail `syntax`. A text form's edge text (`-- a (b) -->`) still takes them.

### X5 re-review: more fallbacks

A second review of cf4faef found six more inputs, each reproduced against Mermaid 12.2.0 under JSDOM, then narrowed:

- A subgraph id or title with a backquote falls back unless one `` "`…`" `` encloses it all: Mermaid keeps the id of `subgraph "A`"` as ``A` ``.
- An `@{ … }` pair needs whitespace after its colon: Mermaid reads `label:x` as one key and draws the id. One line or several.
- An `@{ … }` key must start with a letter or `_`, not be `true`, `false` or `null` in any case, and appear once: YAML reads `true`/`True` and `01`/`1` as duplicate keys and Mermaid throws. Edge metadata too.
- A multi-line `@{` is joined only when its opening line is just `<id>@{`. After a link, in edge text, or in an acc statement it falls back.
- An empty `accTitle:` or `accDescr:` (only whitespace after the colon) falls back: Mermaid's lexer reads the next line as its text. Verified per type: flowchart, class, ER, gantt, journey, quadrant, state, timeline and xychart swallow the line; pie and gitGraph keep it; mindmap has no acc statement; sequence is fixed separately. Test: `tests/core/acc-empty_test.ts`.

## Flowchart ids the lexer reads as keywords (issue #4)

Verified against `mermaid@12.2.0` from npm under JSDOM, with `flow.jison`'s lexer rules read from the package's source map. Jison tries rules in order and picks the first that matches; its keyword rules come before an id's own tokens, and it tries them at each token start inside an id: the id's start, after a leading run of ASCII digits (NUM), and after each non-ASCII character (UNICODE_TEXT, one character from a fixed table). Each id was probed at a statement's start, after a link and after `&`.

- **Node ids, `:::class` names and directive ids** fail where a token start begins with `style`, `linkStyle`, `classDef`, `class`, `graph`, `flowchart`, `subgraph`, `end`, `interpolate`, `_self`, `_blank`, `_parent`, `_top`, `flowchart-elk` or `swimlane-beta` followed by no ASCII word character (end, `.`, `-` or non-ASCII): `style`, `style.x`, `end-x`, `styleé`, `1style`, `éend`. They also fail on `call`, `href` or `click` followed by whitespace (a line break included), and on `accTitle:`, `accDescr:` or `accDescr{`.
- **Still drawn**, as Mermaid reads them: `styleX`, `classDefX`, `clickX`, `linkStyleX`, `endX`, `classX`, `subgraphX`, `endpoint`, `classic`, `style_x`, `a.style`, `a-end`, `1styleX`, `default.x`, `v.x`, `TB`, `accTitle`, `call;`, `call[x]`. The issue's `styleX --> B` is not rejected by Mermaid 12.2.0: `\b` stops `style` from matching inside it.
- **Edge ids** (`id@`) read as one token unless a keyword matches at the start, where `default` also counts: `end@`, `style.x@` and `default.x@` fail; `defaultX@` and `call.x@` draw.
- **Subgraph ids** take most keywords. They fail on `interpolate`, `default`, `_self`, `_blank`, `_parent` or `_top` (with `\b`), on `call`, `href` or `click` followed by whitespace, and on `end` alone on the line. `subgraph style` and `subgraph end [t]` draw.
- **Non-ASCII ids** fail on a character outside UNICODE_TEXT's table (BMP letters only): `𝐀`, `²`, `٣`. `ā` and `中文` draw.
- A styling directive whose id is no plain name (`style --> B`) also fails: Mermaid rejects the line.

Code: `core/diagrams/flowchart/ids.ts`. Tests: `tests/core/flowchart-parse_test.ts`.

## X3.emphasis: Markdown bold and italic

Verified under JSDOM against Mermaid 12.2.0 (marked 16.4.2) by rendering each label kind and reading its `<strong>` and `<em>`. `core/emphasis.ts` is a literal port of marked's inline lexer (masking, `emStrong`, `inlineText`) on a fail-closed alphabet; a differential fuzz against marked through Mermaid's `markdownToHTML` output found 0 mismatches in about 260,000 drawn strings.

- **Drawn bold and italic**: a flowchart Markdown string (node, edge label, subgraph title) and `@{ label }`; a state description, transition label, note and an id shown as its label; a class label, relation label and note; an ER alias, relation label, subgraph title and attribute comment; a mindmap label. `**`/`__` draw bold, `*`/`_` italic, `***x***` both; a `<br>` inside emphasis splits with both sides styled.
- **Still `markdown`**: a backquoted `@{ label }` (`markdown-string`); an escape; a code span, link, strikethrough, autolink, `@`, `<` other than `<br>`, an entity-like `&`; a block start (heading, quote, list, rule, HTML); a style nested in itself (`**a **b** c**`), which a terminal cannot draw apart from one; emphasis with a `#…;` code; a class name, annotation or member (Mermaid parses a member's classifiers first: `+foo() **x**` shows `+foo() : <strong>x</strong>`); an ER entity name (its id); a state composite title, which Mermaid shows as written (`**Comp** x`).
- **Cells**: a text cell carries `em` (bold 1, italic 2); the validator reads it back as part of the label, and rejects `em` on any other cell. Spaces never carry emphasis. Widths count the shown text only.
