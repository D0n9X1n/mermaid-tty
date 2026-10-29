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
| flowchart node label, edge label | html | any | Keeps its `markdown-string` reason. |
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
