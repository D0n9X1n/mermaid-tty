# mermaid-tty v1 diagram matrix

Normative per-type contract for specs A and C. Mermaid v12.2.0 (`1fb78698`).

## Common rules

These rules apply to every type. A type's section can add to them but never contradicts them.

**Sources:** Mermaid v12.2.0, commit `1fb7869866dd619168d840291c9c54b4f129758b`. That covers the detectors, the jison/langium grammars, the database and renderer code, and `docs/syntax/*.md`.

1. **Fallback.** A diagram renders only if every statement is in its type's supported subset. Otherwise the original fence is drawn unchanged. The renderer never draws part of a diagram.
2. **Headers and comments.**
   - Headers are case-sensitive, as in Mermaid's detectors, and sit alone on their line unless a section says otherwise.
   - Blank lines and whole-line `%%` comments are skipped.
   - A trailing `%%` and a `%%{…}%%` init directive fall back.
3. **Frontmatter.** `title` adds a bold title row. A second title, whether from frontmatter or a statement, falls back. The config keys a section names are honored; every other config key is ignored.
4. **Styling and accessibility are ignored.** `style`, `classDef`, `class`, `:::name`, `linkStyle`, `click`, `accTitle` and `accDescr` (including their `{…}` forms) are parsed and ignored wherever the type's Mermaid grammar defines them as statements. They never cause a fallback, and nothing they set is drawn. In a type whose grammar does not define a keyword, a line starting with that word is ordinary text: a node, card or event, which is counted under rule 10.
5. **Keywords.** A line that starts with one of its type's keywords is only that keyword's statement. A keyword in another case, or one that starts a longer word (`Section A`, `titled`), falls back. Mermaid's lexers ignore case, and some ignore word ends. The exception is a type whose section says its keywords match in any case; requirement fields are one, because Mermaid's requirement grammar sets `%options case-insensitive`.
6. **Text.**
   - Widths follow spec A requirement 4. Text wraps at spaces or between W/F characters, and a word wider than its field falls back.
   - Title and header rows wrap whenever they exceed `columns`.
7. **Legend.** A legend lists `key text` rows under the diagram, in source order. Keys are `1, 2, …` for points and `a`…`z`, `aa`, `ab`, … for fields, so a legend never runs out of keys. A legend row wider than `columns` wraps, indented under its text. **All or none:** if any item of a keyed class (fields, points, timings, notes, relation or edge labels) in a diagram is shown by its key, every item of that class is, so a key can never be mistaken for a literal label. A section's ladder step that keys a class keys every item of that class.
8. **Numbers.**
   - Source numbers print as written. Arithmetic is exact decimal, and rounding is half up.
   - A horizontal bar field is `W = min(60, cells left in the row)` unless a section fixes it.
   - A bar is `round(8·v/M·W)` eighth-cells long.
9. **Roles and series.**
   - The roles are spec A's, plus `title`, `value` and the series colors `s1`…`s8`. Each theme defines all eight series colors.
   - Series-colored items take series colors in source order and cycle after eight. These are lanes, branches, sections, columns, fields and series.
   - Under the mono theme, series differ by glyph, key or position, never by color alone.
10. **Counting.** Every source label, member, event, actor and value appears exactly once, in place or in the legend. The exceptions are stated in their sections: sankey counts each link once, and packet bit numbers are positions, not values.
11. **Coverage.** Each coverage row lists the fixtures that exercise its feature, OK or rejection. Every OK fixture must be cited by at least one row.
12. **Glyphs.** Outside source text, the renderer draws only printable ASCII, the Box Drawing block (U+2500–U+257F), and the other glyphs a section names. No non-ASCII glyph among them has the Unicode `Emoji` property. Heavy edges take heavy corners, and light and heavy lines meet with the block's mixed junctions. The block has no dashed corners, so a dashed line bends with a light corner.

### End caps

A pill is a label drawn on a background color between two caps. The caps show the shape when there is no color.

- Each distinct shape has a distinct cap pair; the empty pair counts as one.
- The same shape uses the same caps in every type.
- Caps are drawn in the element's role color. They are single-column ASCII or geometric glyphs.

| Shape | Left | Right | Used by |
|---|---|---|---|
| rectangle | `[` | `]` | flowchart `[ ]`, mindmap `[ ]`, block rect, class, ER, requirement, architecture service, sequence `participant` |
| round | `(` | `)` | flowchart/mindmap/block `( )`, state, C4 element (default) |
| stadium | `([` | `])` | flowchart/block `([ ])`, C4 person, sequence `actor` |
| subroutine | `[[` | `]]` | flowchart/block `[[ ]]` |
| cylinder | `[(` | `)]` | flowchart/block `[( )]`, C4 `Db` |
| horizontal cylinder | `(\|` | `\|)` | flowchart `@{shape: h-cyl}`, C4 `Queue` |
| circle | `((` | `))` | flowchart/mindmap/block `(( ))` |
| double circle | `(((` | `)))` | flowchart/block `((( )))` |
| diamond | `{` | `}` | flowchart/block `{ }` |
| hexagon | `{{` | `}}` | flowchart/mindmap/block `{{ }}` |
| lean right | `/` | `/` | `[/ /]` |
| lean left | `\` | `\` | `[\ \]` |
| trapezoid | `/` | `\` | `[/ \]` |
| inverted trapezoid | `\` | `/` | `[\ /]` |
| asymmetric | `>` | `]` | flowchart/block `> ]` |
| bang | `))` | `((` | mindmap `))…((` |
| cloud | `)` | `(` | mindmap `)…(` |
| block arrow right / left / up / down | (none) / `◄` / `▲` / (none) | `►` / (none) / (none) / `▼` | block `<[ ]>(dir)`. Several directions join in the order right, left, up, down: `x` is `◄ … ►`, `y` is `▲ … ▼` |
| plain | (none) | (none) | mindmap default node, kanban card, timeline period and event |

The following are drawn as glyphs or containers, not pills, so they have no caps: start and end (`●`, `◉`), choice (`◇`), fork and join (`━`), notes, junctions and frames.

A `@{shape: name}` whose name is an alias of a row above uses that row; for example, `cyl` is cylinder and `diam` is diamond. Any other name uses the rectangle caps.

## Part A — graph family

The Common rules and their end-cap table (`00-common.md`) apply to every section below, and give the sources. Claims about what Mermaid does also rest on these files at the pinned commit, under `packages/mermaid/src/`: `preprocess.ts`, `diagram-api/comments.ts`, `diagrams/state/{stateDb,dataFetcher}.ts`, `diagrams/class/{classDb,classTypes,shapeUtil}.ts`, `diagrams/er/erDb.ts`, `diagrams/requirement/requirementDb.ts`, `rendering-util/rendering-elements/shapes/requirementBox.ts`, `diagrams/c4/{c4Db,c4Renderer,svgDraw,c4ShapeAdapter}.ts`, `diagrams/architecture/{architectureDb,architectureTypes}.ts`.

### flowchart

**Tier:** spec A (ships in v1). **Keywords:** `flowchart`, `graph`, alone or with `TD`, `TB`, `BT`, `LR` or `RL`; alone means `TB`, as in Mermaid. `flowchart-elk` has its own Mermaid detector and is not an alias here; it falls back.

**Contract:** defined by spec A requirement 1, with requirements 3 (flat nodes) and 4 (width), plus the additions below. "Every classic bracket shape" includes the double circle `(((…)))` from the docs' *Node shapes* list. Caps per the common table.

**Additions to requirement 1:**
- `A ~~~ B` is an invisible link. It places its nodes like any edge but is never drawn, so spec A's validator skips it.
- Edge IDs are parsed and ignored: `A e1@--> B` draws the edge `A --> B` (any link may carry an ID), and a later `e1@{ … }` line, such as `e1@{ animate: true }`, has no effect.

**Ignored (common rule 4):** styling and accessibility directives, including `:::name`, `accTitle` and `accDescr`, which requirement 1 does not name.

**Grammar source:** Mermaid's flowchart grammar is not in the fetched set. The syntax named here was checked against `flowchart.md` at the pinned commit.

**Required fixtures** (60/80/120 columns; acceptance A1, A3, A4):

| ID | Purpose |
|---|---|
| `flowchart-ok-01`…`05` | `flowchart` with `TD`, `TB`, `BT`, `LR`, `RL` |
| `-06` | `graph` alias |
| `-07`…`18` | One shape each: `[ ]`, `( )`, `([ ])`, `[[ ]]`, `[( )]`, `(( ))`, `{ }`, `{{ }}`, `[/ /]`+`[\ \]`, `[/ \]`+`[\ /]`, `> ]`, `((( )))` |
| `-19`, `-20` | `@{ shape: … }`: known name; unknown name draws a rectangle |
| `-21`, `-22` | Quoted label with punctuation; `<br/>` label takes N rows |
| `-23`…`26` | Solid `-->`, dotted `-.->`, thick `==>`, bidirectional `<-->` |
| `-27`…`29` | Ends: circle `--o`, cross `--x`, none `---` |
| `-30`, `-31` | Edge labels `-->\|x\|` and `-- x -->` |
| `-32`, `-33` | Chain `A --> B --> C`; `&` fan-out and fan-in |
| `-34`…`36` | Nested subgraphs; titled `subgraph id [title]`; per-subgraph `direction` |
| `-37`, `-38` | `%%` comments; frontmatter `title` shown |
| `-39` | `classDef`, `style`, `class`, `linkStyle`, `click` parsed and ignored |
| `-40` | CJK labels next to box drawing |
| `-41` | 60-column boundary: natural layout is exactly 60 wide |
| `-42`…`44` | First fitting ladder step is tighter gaps, wrapped labels, LR→TD |
| `-45` | Two node ids with identical text both render |
| `-46` | Invisible link `A ~~~ B`: it changes the layout and is never drawn |
| `-47` | Edge IDs: `A e1@--> B`, then `e1@{ animate: true }`, both parsed and ignored |
| `-48` | `:::name` on nodes, `accTitle` and `accDescr` parsed and ignored (common rule 4) |
| `-49` | Bare `flowchart` header, no direction: drawn top-down |
| `-50` | A thick `==>` edge that must bend: heavy segments and heavy corners (rule 12) |
| `-51` | A thick and a solid edge share a junction: the matching light/heavy mixed junction glyph (rule 12) |
| `-52` | A dotted `-.->` edge that must bend: dashed segments and a light corner (rule 12) |

**Rejection fixtures** (common rule 1):

| ID | Input |
|---|---|
| `flowchart-reject-01` | Malformed: `A[open --> B` |
| `-02` | Malformed: `subgraph` with no `end` |
| `-03` | Label with a ZWJ emoji sequence (requirement 4) |
| `-04` | Narrowest ladder layout is 61 columns, rendered at 60 |
| `-05` | `flowchart-elk TD` header |

Repeated label text is valid (spec A counts labels per node id), so `-45` covers it and there is no duplicate-label rejection.

### sequence

**Tier:** spec A (ships in v1). **Keyword:** `sequenceDiagram`.

**Contract:** defined by spec A requirement 2, with requirement 4 (width), plus the supported subset below. Requirement 2's two line styles and four ends give eight arrows: `->>` and `-->>` (arrow), `->` and `-->` (open), `-x` and `--x` (cross), `-)` and `--)` (async). Other forms in the docs fall back, for example half arrowheads. The ladder's LR→TD step does not apply here: after wrapped labels comes fallback.

**Supported subset** (in addition to requirement 2):

```text
activate X    deactivate X               same as + and - on a message
autonumber <start> <step>                integers: numbering restarts at <start>, steps by <step>
rect <color> … end                       color ignored; holds any statement but box; nests
box <color> <label> … end                both optional; holds participant and actor lines
create participant|actor X [as alias]    the next message must target X
destroy X                                the next message must have X at one end
A<<->>B: text    A<<-->>B: text          bidirectional, solid and dotted
title <text>                             a bold title row (common rule 3)
```

**Text design** (base):
- **Participants:** one header row of pills in declaration order, each drawn once. Mermaid's mirrored footer is off, which counting rule 10 needs. A `participant` uses rectangle caps and an `actor` uses stadium caps, so the two differ in mono. An `as` alias shows the alias text.
- **Lifelines:** a dim `│` (note role) under the centre of each pill, down to the last row. Column gaps widen to fit the widest message label between neighbours.
- **Messages:** one row each, sender to receiver. The line is `─` for solid or `┄` for dotted (edge role). The end is `►`/`◄` for an arrow, no head for an open end, `x` for a cross, or `)` for async (arrow role). The label (label role) sits on the row above, starting at the line.
- **Self-messages:** a two-row loop, `─┐` then `◄┘`.
- **Activations:** the lifeline becomes `┃` for the span.
- **Notes:** dim pills, plain caps, placed left of, right of, or across the lifelines they name.
- **Frames:** `alt`/`opt`/`loop`/`par`/`critical`/`break` are frames (frame role) titled `kind [condition]`. `else` and `and` add a dashed divider row with their condition.
- **`autonumber`:** prefixes each message label with `1.`, `2.`, ….

**Text design** (additions):
- `rect` is a dim, untitled frame (note role) around its statements.
- `box` is a frame (frame role) around its participants' columns, titled with its label. As in Mermaid, a leading CSS color, such as `Aqua`, `transparent` or `rgb(33, 66, 99)`, is not part of the label; like a `rect` color, it is ignored. A box's participants must be adjacent in column order, or the diagram falls back.
- A created participant's box is drawn on its creating message's row, and its lifeline starts there. A destroyed participant's lifeline ends at its destroying message; any later statement naming it falls back.
- A bidirectional message has an arrowhead (arrow role) at both ends.

**Ignored (common rule 4):** styling and accessibility directives, such as `accTitle` and `accDescr`.

**Grammar source:** Mermaid's sequence grammar is not in the fetched set. The syntax named here was checked against `sequenceDiagram.md` at the pinned commit.

**Required fixtures** (60/80/120 columns; acceptance A2, A4):

| ID | Purpose |
|---|---|
| `sequence-ok-01` | `participant` declarations keep source order |
| `-02` | `actor` declarations |
| `-03` | Aliases: `participant A as Alice`, `actor B as Bob` |
| `-04`…`11` | One labelled arrow each: `->>`, `-->>`, `->`, `-->`, `-x`, `--x`, `-)`, `--)` |
| `-12` | Self-message `A->>A: x` |
| `-13` | `+`/`-` activations, stacked on one participant |
| `-14`…`17` | Notes `left of`, `right of`, `over A`, `over A,B` |
| `-18`…`23` | One frame each: `alt`/`else`, `opt`, `loop`, `par`/`and`, `critical`/`option`, `break` |
| `-24` | `loop` nested inside `alt` |
| `-25` | Bare `autonumber` |
| `-26` | CJK participants, messages and notes |
| `-27` | 60-column boundary: natural layout is exactly 60 wide |
| `-28`, `-29` | First fitting ladder step is tighter gaps; wrapped labels |
| `-30` | Two participant ids with identical alias text both render |
| `-31` | `activate X` and `deactivate X`, stacked on one participant, drawn as `+`/`-` |
| `-32` | `autonumber 10 5`: three messages numbered 10, 15, 20 |
| `-33` | `rect rgb(…) … end` around messages and a note, with a nested `rect`: dim untitled frames, colors ignored |
| `-34` | Docs `box Purple Alice & John … end` and `box Another Group … end`: titled frames, color ignored |
| `-35` | Docs create/destroy example: `create participant`, `create actor … as …`, `destroy` at either end of a message |
| `-36` | Bidirectional `A<<->>B: hi` |
| `-37` | Bidirectional dotted `A<<-->>B: hi` |
| `-38` | Base design: an `actor` and a `participant` (caps differ in mono), solid and dotted messages, a self-message, an activation, a note over two lifelines |
| `-39` | `title Checkout` statement: a bold title row above the diagram |

**Rejection fixtures:**

| ID | Input |
|---|---|
| `sequence-reject-01` | Malformed: `A->>: hi` (no target) |
| `-02` | Malformed: `loop` with no `end` |
| `-03` | Label with a ZWJ emoji sequence |
| `-04` | Narrowest ladder layout is 61 columns, rendered at 60 |
| `-05` | Malformed: `create participant C`, then a message that does not target `C` |
| `-06` | Order: `destroy B` and its message, then a later message to `B` |
| `-07` | Order: `A->>C: hi`, then a `box` holding `A` and `B`, which `C` splits |
| `-08` | A frontmatter `title` and a `title` statement (common rule 3) |

Repeated text is valid (counted per participant id), so `-30` covers it and there is no duplicate-label rejection.

### state

**Tier 1.** **Keywords:** `stateDiagram`, `stateDiagram-v2` (one renderer in Mermaid).

**Supported subset:**

```text
direction TB|BT|LR|RL                  root or composite
id    id : description    state "description" as id
state id { … }    state "description" as id { … }
[*] --> a    a --> [*]    a --> b    a --> b : label
state id <<choice>>|<<fork>>|<<join>>  or [[choice]] [[fork]] [[join]]
note left of id : text
note right of id
  lines
end note
--                                     region divider in a composite
hide empty description   scale N width   (no effect)
```

Comments, `%%{…}%%` and frontmatter: see the Common rules.

**Ignored (common rule 4):** styling and accessibility directives.

**Not supported (falls back):** floating `note "…" as N`, a bare `state id`, and a description on a choice, fork or join. These also fall back:
- a second description or note on one state, because Mermaid either splits the box or keeps only the last note;
- a state id used in two scopes. A scope is the root or one composite body, and a composite's own id belongs to its parent's scope.

**Text design:**
- States are flat pills (node role) labelled with the description, or else the id.
- As in Mermaid, each scope has one start `●` and one end `◉` (node role), shared by all its `[*]`.
- Choice is an unlabelled `◇` (decision role). Fork and join are unlabelled `━` bars across the flow (`┃` in LR/RL).
- A composite is a frame (frame role) titled with its label; edges to it end on its border. Its regions stack along the flow, split by dashed `┄` rows (`┆` in LR/RL).
- Transition labels use the label role, on their own rank.
- Notes are dim (note role) and borderless. A `┄` connector joins each note to the left or right side of its state.

**Collisions and narrow widths:** spec A's layered layout, composites laid out inside out, ties broken by source order. Ladder:
1. natural layout;
2. tighter gaps;
3. wrapped labels and notes;
4. LR/RL redrawn as TB;
5. notes too wide for their slot become keys `a`, `b`, …, with a legend (common rule 7);
6. otherwise fall back.

**Required fixtures** (60/80/120 columns):

| ID | Purpose |
|---|---|
| `state-ok-01` | Docs "Simple sample" under `stateDiagram-v2`, with frontmatter `title` |
| `-02` | The same under `stateDiagram` |
| `-03` | Bare `id` line, `id : description`, `state "…" as id` |
| `-04` | Transition labels |
| `-05` | Several `[*]` in one scope share one `●` and one `◉` |
| `-06` | Composite with inner `[*]`; edges to and from its frame |
| `-07` | Composites nested three deep; titled `state "…" as id { … }` |
| `-08` | `<<choice>>` with labelled branches |
| `-09`, `-10` | `<<fork>>`/`<<join>>` bars in TB, then in LR |
| `-11` | `[[choice]]`, `[[fork]]`, `[[join]]` |
| `-12`, `-13` | One-line notes left and right; multi-line `note … end note` |
| `-14` | Three concurrent regions split by `--` |
| `-15` | `direction LR` at root and inside a composite |
| `-16` | `%%` comment lines, `hide empty description`, `scale 350 width` |
| `-17` | CJK states, labels and notes |
| `-18` | 60-column boundary: natural layout is exactly 60 wide |
| `-19`…`22` | First fitting ladder step: tighter gaps, wrapped labels, LR→TB, keyed notes |
| `-23` | Two ids with identical descriptions both render |
| `-24` | `classDef bad fill:#f00` parsed and ignored |
| `-25` | `click s1 href "https://example.com"` parsed and ignored |

**Rejection fixtures:**

| ID | Input |
|---|---|
| `state-reject-01` | Valid prefix, then a bare `state s9` |
| `-02` | Malformed: `state Two Words {` (Mermaid's lexer rejects multi-word names) |
| `-03` | Malformed: `state A {` with no `}` |
| `-04` | Repeated: `s1 : one`, then `s1 : two` |
| `-05` | Repeated: two notes on one state |
| `-06` | Duplicate: id `x` inside two composites |
| `-07` | Valid prefix, then a floating `note "memo" as N1` |
| `-08` | Valid prefix, then `state c <<choice>>` and a description `c : pick` |
| `-09` | Valid prefix, then `state f <<fork>>` and a description `f : split` |
| `-10` | Valid prefix, then `state j <<join>>` and a description `j : merge` |

### class

**Tier 1.** **Keywords:** `classDiagram`, `classDiagram-v2` (one renderer in Mermaid).

**Supported subset:**

```text
direction TB|BT|LR|RL
class A   class A["label"]   class `A b`   class A~T~   class A <<annot>>
class A { member… }   A : member   <<annot>> A   a <<annot>> line inside { }
member: [+-#~]text   or   [+-#~]name(params) [return], then an optional $ or *
A [e]--[e] B   A [e]..[e] B   e is <| |> * o < > or nothing; then an optional : label
A "card" --> "card" B          cardinality on one end or both
note "text"   note for A "text"   (\n and <br> break lines)
namespace N { classes, notes }   namespace N["label"] { … }
```

Comments, `%%{…}%%` and frontmatter: see the Common rules.

**Ignored (common rule 4):** styling and accessibility directives. In this type the `class` directive is spelled `cssClass`, because a line starting with `class` declares a class (common rule 5), and `link` and `callback` are forms of `click`.

**Not supported (falls back):** lollipops `()`, nested or dotted namespaces, and generics containing a comma. These also fall back:
- a bare `A` line, which Mermaid ignores;
- a second annotation on one class, because Mermaid draws only the first;
- a class relabelled, or redeclared with another generic, because Mermaid keeps only one.

**Text design:**
- **Class:** a name pill (node role) shows a `«annot»` row if there is one, then the label or name, with `~T~` shown as `<T>`. Member rows (label role) follow with no divider row: attributes, then methods, each in source order.
- **Member text** matches Mermaid's: visibility is kept, and methods read `name(params) : return`. Mermaid shows a `*` member in italic and a `$` member underlined; we keep the `*` or `$` suffix instead.
- **Edges** (edge role): `--` is solid and `..` is dashed. Ends (arrow role) face their class:
  - `▷` (or `◁△▽`, by direction) for inheritance; realization is a dashed line with `▷`;
  - `◆` for composition and `◇` for aggregation;
  - the flowchart arrowhead for association; dependency is a dashed line with that arrowhead.
- **Labels:** cardinality (label role) sits beside its end. Relation labels take their own rank.
- **Notes** are dim and borderless (note role). A `note for` note has a `┄` connector.
- **Namespace:** a frame (frame role) titled with its label or name.

**Collisions and narrow widths:** the state ladder, with two changes: members wrap too (continuation rows are indented one cell), and relation labels are keyed like notes. Cardinality is never keyed; if two ends need the same cells, the ladder goes to its next step.

**Required fixtures** (60/80/120 columns):

| ID | Purpose |
|---|---|
| `class-ok-01` | Docs "Animal example" with frontmatter `title`, notes and inheritance |
| `-02` | The same under `classDiagram-v2` |
| `-03` | `class A`, `class A["label"]`, `` class `A b` ``, classes created only by a relation |
| `-04` | Members in `{ }` and by `A : member`; attributes listed before methods |
| `-05` | Visibility `+ - # ~`, return types, `$` and `*` suffixes |
| `-06` | Generics: `class Square~Shape~`, member `List~List~int~~` |
| `-07` | Annotations: inline, on their own line, inside `{ }` |
| `-08`…`15` | One relation each: `<\|--`, `*--`, `o--`, `-->`, `--`, `..>`, `..\|>`, `..` |
| `-16` | Reversed ends `--\|>`, `--*`, `--o` |
| `-17` | Two-way `<\|--\|>` |
| `-18` | Relation labels |
| `-19` | Cardinality on one end, and on both ends |
| `-20` | `note` and `note for`, with `<br>` and `\n` |
| `-21` | `namespace N { … }` and `namespace N["label"] { … }`, each holding a note |
| `-22` | `direction RL`; `%%` comment lines |
| `-23` | CJK class names, members and labels |
| `-24` | 60-column boundary: natural layout is exactly 60 wide |
| `-25`…`28` | First fitting ladder step: tighter gaps, wrapped members, LR→TB, keyed relation labels |
| `-29` | Two classes with identical labels both render |
| `-30` | `click A href "https://example.com"`, plus `link` and `callback` lines, parsed and ignored |
| `-31` | `style A fill:#f9f`, plus `classDef`, `cssClass` and `class A:::name`, parsed and ignored |

**Rejection fixtures:**

| ID | Input |
|---|---|
| `class-reject-01` | Valid prefix, then the lollipop `A --() bar` |
| `-02` | Valid prefix, then `namespace A.B { class C }` |
| `-03` | Valid prefix, then a bare `A` line |
| `-04` | Malformed: `class A {` with no `}` |
| `-05` | Repeated: `<<interface>> A` and `<<service>> A` |
| `-06` | Repeated: `class A["x"]`, then `class A["y"]` |
| `-07` | Duplicate: `class Box~int~` and `class Box~str~` |
| `-08` | Valid prefix, then a nested `namespace A { namespace B { class C } }` |
| `-09` | Valid prefix, then a generic with a comma, `class Box~K,V~` |

### ER

**Tier 1.** **Keyword:** `erDiagram`.

**Supported subset:**

```text
direction TB|BT|LR|RL                     root or subgraph
E   "E with spaces"   e[Alias]   e["Alias"]   each optionally followed by { … }
type name [PK|FK|UK[, …]] ["comment"]     one per line; type may end in ?
A <left><line><right> B : label           label is a word, "words" or ""
cardinality: left / right / word forms                       shown as
  |o / o| / zero or one, one or zero                           0..1
  || / || / 1, one, only one                                   1
  }o / o{ / 0+, many, many(0), zero or more, zero or many      0..*
  }| / |{ / 1+, many(1), one or more, one or many              1..*
line: -- or to → solid;  .. .- -. or optionally to → dashed
subgraph id | "id" | id [title] … end     nested; relations may use its id after end
```

Comments, `%%{…}%%` and frontmatter: see the Common rules. Mermaid's ER parser also rejects a trailing `%%` comment.

**Ignored (common rule 4):** styling and accessibility directives.

**Not supported (falls back):**
- the undocumented `u` parent marker;
- `~…~` and backtick attribute words;
- entity names containing `*`, a backtick, or `_` at either end of a word, because Mermaid renders them as Markdown; in aliases, relation labels, subgraph titles and attribute comments, Markdown other than bold and italic (a code span, a style nested in itself, an escape).

These also fall back, because Mermaid keeps only the first:
- a second alias for one entity;
- an entity listed in two subgraphs.

An id used for both an entity and a subgraph also falls back.

**Text design:**
- **Entity:** a pill (node role) showing the alias, or else the name. Attribute rows follow in source order with no divider row. Their columns are aligned: type, name and keys (label role), then the comment, dim (note role). Several blocks for one entity append, as in Mermaid.
- **Relation:** a solid line if identifying, dashed if not (edge role), with no arrowheads. Each end shows its cardinality next to its entity, in the arrow role because it replaces the crow's foot: the left token at the first entity, the right token at the second.
- **Labels:** a relation label (label role) takes its own rank. An empty `""` label draws nothing.
- **Subgraph:** a frame (frame role) titled with its title, or else its id. It uses its own `direction`, and relations to it end on its border.

**Collisions and narrow widths:** the state ladder. Comments and relation labels wrap, and they are what gets keyed. Types, names and keys never wrap. Cardinality is never keyed: if two ends need the same cells, the ladder goes to its next step.

**Required fixtures** (60/80/120 columns):

| ID | Purpose |
|---|---|
| `er-ok-01` | Docs CUSTOMER/ORDER/LINE-ITEM example, with frontmatter `title` |
| `-02` | Entity with no relation; quoted and Unicode names |
| `-03` | Aliases `p[Person]` and `a["Customer Account"]` |
| `-04` | Attributes: `PK`, `FK`, `UK`, `PK, FK`, comments, `string?`, `string(99)`, `string[]`, `*id` |
| `-05` | Two blocks for one entity append in source order; an empty `{ }` |
| `-06`…`09` | One cardinality pair each: `\|o`/`o\|`, `\|\|`, `}o`/`o{`, `}\|`/`\|{` |
| `-10` | Word forms: `1 to zero or more`, `many(0) optionally to 0+`, `only one`, `one or many` |
| `-11` | Identifying `--`; non-identifying `..`, `.-`, `-.` |
| `-12` | Labels: a word, `"quoted words"`, `""` |
| `-13` | `direction LR` |
| `-14` | `subgraph id`, `subgraph "Customer Domain"`, `subgraph id1 [title 1]`, nested |
| `-15` | `direction` inside subgraphs; relations to and from a subgraph id |
| `-16` | `%%` comment lines |
| `-17` | CJK entity names, attributes and labels |
| `-18` | 60-column boundary: natural layout is exactly 60 wide |
| `-19`…`22` | First fitting ladder step: tighter gaps, wrapped comments, LR→TB, keyed labels |
| `-23` | Two entities with identical aliases both render |
| `-24` | `style CUSTOMER fill:#f9f` parsed and ignored |

**Rejection fixtures:**

| ID | Input |
|---|---|
| `er-reject-01` | Valid prefix, then the parent marker `A u--\|\| B : x` |
| `-02` | Valid prefix, then the docs' `"This **is** _Markdown_"` entity |
| `-03` | Malformed: `A \|\|--o{ B : x %% note` (trailing comment) |
| `-04` | Malformed: `A \|\|--o{ B` with no `: label` |
| `-05` | Malformed: `CAR {` with no `}` |
| `-06` | Repeated: `p[Person]`, then `p[Human]` |
| `-07` | Duplicate: `CAR` listed in two subgraphs |
| `-08` | Duplicate: `Sales` used as an entity, then as a subgraph id |
| `-09` | Valid prefix, then the attribute `List~string~ tags` in an entity block |
| `-10` | Valid prefix, then an attribute name in backticks, `` string `id` `` |
| `-11` | Valid prefix, then Markdown nesting bold in bold in an alias, `p["**a **b** c**"]` |
| `-12` | Valid prefix, then a code span in a relation label, `` C \|\|--o{ D : "`owns`" `` |
| `-13` | Valid prefix, then an entity name in backticks, `` `CAR` `` |

### requirement

**Tier 2.** Gated: the keyword falls back until this type's fixtures and visual review pass. **Keyword:** `requirementDiagram`. Mermaid's detector also matches a bare `requirement`, but its grammar needs `requirementDiagram`, so the registry maps only `requirementDiagram`.

**Supported subset:**

```text
direction TB|BT|LR|RL
<type> name {          requirement | functionalRequirement | interfaceRequirement
  id: x                | performanceRequirement | physicalRequirement | designConstraint
  text: x
  risk: low|medium|high
  verifymethod: analysis|demonstration|inspection|test
}                      every field optional, one per line
element name {
  type: x
  docref: x
}
src - <rel> -> dst     dst <- <rel> - src
<rel>: contains | copies | derives | satisfies | verifies | refines | traces
names, values: "quoted", or unquoted (starts with A-Z a-z 0-9 _; stops at : , { < > - =)
keywords match in any case
```

Comments, `%%{…}%%` and frontmatter: see the Common rules.

**Ignored (common rule 4):** styling and accessibility directives.

**Not supported (falls back):**
- Markdown in a name or value (`*`, a backtick, or `_` at either end of a word);
- a relation naming an undefined node.

These also fall back, because Mermaid keeps only one:
- a field repeated in one body;
- a second requirement or element with an existing name (the first wins);
- one name used for both a requirement and an element (Mermaid gives both nodes that id, and relations resolve to the requirement).

**Text design:**
- **Requirement:** a pill (node role) with two lines: the type tag, such as `«Functional Requirement»`, and the name. Field rows (label role) follow in Mermaid's order and wording: `ID: …`, `Text: …`, `Risk: High`, `Verification: Test`. An absent field draws no row.
- **Element:** a pill reading `«Element»` and the name, then the rows `Type: …` and `Doc Ref: …`.
- **Relation:** a label such as `«satisfies»` (label role) on its own rank. `contains` is a solid line with `⊕` (arrow role) at the source end, matching Mermaid's start marker. The other six are dashed, with an arrowhead at the destination.

**Collisions and narrow widths:** the class ladder. Field rows wrap like members, and relation labels are keyed.

**Required fixtures** (60/80/120 columns):

| ID | Purpose |
|---|---|
| `requirement-ok-01` | Docs "Larger Example": six types, three elements, seven relations, with frontmatter `title` |
| `-02` | All risks and verify methods; a body with only `id:`; an empty element; `verifyMethod`, `docRef` in mixed case |
| `-03`…`09` | One relation each: `contains`, `copies`, `derives`, `satisfies`, `verifies`, `refines`, `traces` |
| `-10` | Reverse form `dst <- rel - src` |
| `-11` | Quoted and unquoted names and values, including an unquoted name with spaces |
| `-12` | `direction LR`; `%%` comment lines |
| `-13` | CJK in quoted names and values (an unquoted value cannot start with CJK) |
| `-14` | 60-column boundary: natural layout is exactly 60 wide |
| `-15`…`18` | First fitting ladder step: tighter gaps, wrapped field rows, LR→TB, keyed relation labels |
| `-19` | Two requirements with identical text both render |
| `-20` | `style test_req fill:#f9f` parsed and ignored |

**Rejection fixtures:**

| ID | Input |
|---|---|
| `requirement-reject-01` | Valid prefix, then the docs' `requirement "__test_req__"` with Markdown text |
| `-02` | Valid prefix, then `a - satisfies -> ghost` (undefined node) |
| `-03` | Malformed: unquoted `text: test the system` (starts with the keyword `test`) |
| `-04` | Malformed: `requirement r {` with no `}` |
| `-05` | Repeated: `id:` twice in one body |
| `-06` | Duplicate: two `requirement r { … }` blocks |
| `-07` | Duplicate: `r` as both a requirement and an element |
| `-08` | Header `requirement` alone |

### C4

**Tier 2.** Gated: the keywords fall back until this type's fixtures and visual review pass. **Keywords:** `C4Context`, `C4Container`, `C4Component`, `C4Dynamic`, `C4Deployment`; one grammar serves all five, and the docs call it experimental. Mermaid's detector regex anchors only `C4Context`, so the other names match anywhere in the text. The registry matches the header line only.

**Supported subset:**

```text
Person|Person_Ext(alias, label, ?descr)
System[Db|Queue][_Ext](alias, label, ?descr)
Container[Db|Queue][_Ext](alias, label, ?techn, ?descr)    Component… likewise
Boundary(alias, label, ?type) { … }    Enterprise_Boundary | System_Boundary | Container_Boundary(alias, label) { … }
Deployment_Node | Node | Node_L | Node_R(alias, label, ?type, ?descr) { … }
  { on the same line or the next; boundaries nest
Rel | BiRel | Rel_Back(from, to, label, ?techn, ?descr)
Rel_U|Rel_Up|Rel_D|Rel_Down|Rel_L|Rel_Left|Rel_R|Rel_Right(…)   drawn as Rel, as in Mermaid
RelIndex(n, from, to, label, …)         C4Dynamic only, n equal to its 1-based relation number
UpdateLayoutConfig(…)                    no effect: our layout replaces Mermaid's row grid
title text   "" or ,, is an empty arg
args are "quoted"; a bare arg only before a comma (Mermaid runs a bare last arg past ")")
<br/> breaks a line
```

Comments, `%%{…}%%`, frontmatter and a second title: see the Common rules.

**Ignored (common rule 4):** styling and accessibility directives, including `accDescription`, this type's spelling of `accDescr`.

**Not supported (falls back):**
- `UpdateElementStyle` and `UpdateRelStyle`, which are C4 statements rather than common rule 4 directives (`UpdateElementStyle` also takes content arguments such as `$techn`);
- sprite, tags or link arguments, and any `$name=` argument outside `UpdateLayoutConfig`;
- `Lay_*` and other C4-PlantUML macros, which Mermaid's lexer lacks;
- a relation to an undefined alias or to a boundary.

These also fall back, because Mermaid keeps only one:
- an alias defined twice, since Mermaid reuses and overwrites the first;
- two relations with the same `from` and `to`.

**Text design:**
- **Element:** a pill (node role) with rows: the label; then a type line, dim (note role), in Mermaid's wording: `[Person]`, `[Software System]`, `[Container: techn]` or `[Component: techn]`; then the description (label role). Mermaid marks external elements only by color, so we write `[External Software System]` and the mono theme keeps the distinction.
- **Caps:** per the common table, from its C4 entries: person, `Db`, `Queue`, and the default for other elements.
- **Boundary or deployment node:** a frame (frame role) titled `label [type]`, as Mermaid prints it: `[system]` by default for `Boundary` and `[node]` for nodes; `[ENTERPRISE]`, `[SYSTEM]` or `[CONTAINER]` for the named boundaries. An empty type prints no tag, and a description is a dim first row inside the frame.
- **Relation:** a solid line (edge role). Ends (arrow role) follow Mermaid: the arrowhead is at `to` for `Rel` and its aliases, at `from` only for `Rel_Back`, and at both ends for `BiRel`.
- **Relation labels** (label role): the label, then `[techn]`, then the description. In `C4Dynamic`, Mermaid prefixes each label `1: `, `2: `, … in source order, and so do we.

**Collisions and narrow widths:** C4 has no `direction`; layout is TB. Ladder:
1. natural layout;
2. tighter gaps;
3. wrapped labels and descriptions (Mermaid has wrapped C4 text by default since v11.17.1);
4. relation labels keyed, with a legend (common rule 7);
5. otherwise fall back.

**Required fixtures** (60/80/120 columns):

| ID | Purpose |
|---|---|
| `c4-ok-01` | Docs System Context example without its `Update…Style` lines: all eight person and system kinds, `Boundary`, `Enterprise_Boundary`, `System_Boundary`, `BiRel`, `title`, `<br/>`, `UpdateLayoutConfig` |
| `-02` | Docs `C4Container` example, edited the same way: `Container`, `ContainerDb`, `Container_Boundary`, `Rel_Back` |
| `-03` | Docs `C4Component` example, edited the same way |
| `-04` | Docs `C4Dynamic` example: labels numbered `1:`…`3:`; a `RelIndex` whose `n` is its position |
| `-05` | Docs `C4Deployment` example: nested typed `Deployment_Node`s, `Rel_U`, `Rel_R`; plus `Node`, `Node_L`, `Node_R` showing `[node]` |
| `-06` | Every other `Container*` and `Component*` kind, internal and external, with `techn` |
| `-07` | `Rel`, `BiRel`, `Rel_Back`, and every `Rel_U`…`Rel_Right` alias |
| `-08` | Relation `techn` and `descr`; `""` and `,,` arguments; bare aliases |
| `-09` | Boundaries nested three deep; `{` on the next line; a `Boundary` type given, omitted (`[system]`) and `""` (no tag) |
| `-10` | Frontmatter `title` and `%%` comments, with no `title` statement |
| `-11` | CJK labels, descriptions and relation labels |
| `-12` | 60-column boundary: natural layout is exactly 60 wide |
| `-13`…`15` | First fitting ladder step: tighter gaps, wrapped descriptions, keyed relation labels |
| `-16` | Two elements with identical labels both render |

**Rejection fixtures:**

| ID | Input |
|---|---|
| `c4-reject-01` | Valid prefix, then `UpdateElementStyle(a, $fontColor="red")` |
| `-02` | Valid prefix, then `Person(p9, "P", "d", "sprite")` (a sprite argument) |
| `-03` | Valid prefix, then `Rel(a, b0, "x")`, where `b0` is a boundary |
| `-04` | Valid prefix, then `RelIndex(5, a, b, "x")` as the second relation of a `C4Dynamic` |
| `-05` | Valid prefix, then `Rel(a, b, Uses)` and another line (a bare last argument) |
| `-06` | Malformed: `Lay_R(a, b)`, a C4-PlantUML macro that Mermaid's lexer lacks |
| `-07` | Malformed: `System_Boundary(b, "B") {` with no `}` |
| `-08` | Duplicate: alias `a` defined twice |
| `-09` | Duplicate: two `Rel(a, b, …)` lines |

### architecture

**Tier 2.** Gated: the keyword falls back until this type's fixtures and visual review pass. **Keyword:** `architecture-beta`. Mermaid's detector matches any text that starts with `architecture`, but its grammar needs `architecture-beta`.

**Supported subset:**

```text
group id(icon)[title] in parent      (icon), [title] and "in parent" each optional
service id(icon)[title] in parent    likewise
junction id in parent                "in parent" optional
a:S -- S:b   a:S <-- S:b   a:S --> S:b   a:S <--> S:b      S is L, R, T or B
a:S -[label]- S:b                    also with < and >
a{group}:S --> S:b{group}            only for services inside groups
align row a b …   align column a b … two or more services or junctions
title text
icons: cloud, database, disk, internet, server, or pack:name
ids: ASCII word characters, with - inside; [title] may be "quoted" or 'quoted'
order: free, since Mermaid adds groups, then services, junctions and edges; only a parent group must precede its child group
```

Comments, `%%{…}%%` and frontmatter: see the Common rules.

**Ignored (common rule 4):** styling and accessibility directives.

**Not supported (falls back):**
- quoted icon text (`service s "text"`), which the docs do not describe;
- a service with neither icon nor title; a group with no members;
- an edge naming a group id, which the docs forbid;
- anything Mermaid's own checks reject: a duplicate id; an undeclared id; a group placed `in` a group declared after it; a `{group}` edge whose ends share a group; an `align` member that is repeated, or that is not a service or junction;
- any placement failure below.

**Text design:**
- **Service:** a pill (node role) reading `(icon) title`, with the `(icon)` tag dim (note role). A terminal cannot draw the icon, so its name stands in. With no title, the pill shows only the tag, just as Mermaid shows only the icon.
- **Junction:** no pill. The router's junction glyph for its sides marks it, such as `┼` or `┤`.
- **Group:** a frame (frame role) titled `(icon) title`, nested by `in`.
- **Edge:** a line (edge role) between the named sides. `<` and `>` put an arrowhead (arrow role) into that end. A label (label role) sits beside the middle of the line. A `{group}` end starts at its group frame's border.

**Placement.** This grid replaces Mermaid's layout. Mermaid's layout also starts from its first service and walks the port pairs. Steps:
1. The first declared service takes cell (0, 0). If there are no services, the first junction takes it.
2. Take the first edge, in source order, that has exactly one placed end. Put the other end one cell beyond the placed end's side.
   - For a bend (one side `L` or `R`, the other `T` or `B`), move it one more cell away from its own side.
   - If that cell is taken, use the next free cell below it when the placed side is `L` or `R`, or to its right when it is `T` or `B`.
3. When no edge has exactly one placed end, the next unplaced node (services first, then junctions, each in declaration order) goes in row 0, one column right of every placed cell.
4. Repeat steps 2 and 3 until every node is placed. Each grid row and column takes the size of its largest pill. A row or column holding only junctions is 1 cell, the junction glyph's size. The gaps hold the routes and edge labels, which spec A's router draws.

Fall back if:
- an edge's sides disagree with its ends' cells: `R` needs the other end strictly to the right, `T` strictly above, and so on. Same-side pairs such as `R`–`R` always fail this.
- an `align` line's members do not share one row or column in the listed order. Mermaid's `align` moves nodes, while ours only checks them. The docs say Mermaid also fails when the listed order contradicts an edge.
- a group's frame (the box around its members' cells) holds a node that is not a member, or two frames overlap without nesting.

**Collisions and narrow widths:** the ports fix the geometry, so there is no LR→TB step. Ladder:
1. natural layout;
2. tighter gaps;
3. wrapped titles and edge labels;
4. edge labels keyed, with a legend (common rule 7);
5. otherwise fall back.

**Required fixtures** (60/80/120 columns):

| ID | Purpose |
|---|---|
| `architecture-ok-01` | Docs example: group `api`, four services, three edges |
| `-02` | Docs icon-pack example: `logos:aws-…` names as tags |
| `-03` | All five built-in icons; a service with only a title; a service with only an icon |
| `-04` | Nested groups; a group with only a title; a group with only an icon |
| `-05` | Straight pairs `R`–`L`, `L`–`R`, `T`–`B`, `B`–`T` |
| `-06` | Bends `T`–`L` and `R`–`B`, each placed from either end |
| `-07` | Arrows `-->`, `<--`, `<-->`; labels `-[label]-` and `-[label]->` |
| `-08` | Docs `server{group}:B --> T:subnet{group}`, with both groups declared |
| `-09` | Docs junction example: one `┼` and one `┤` |
| `-10` | A junction inside a group |
| `-11` | Docs fan-in example: the next-free-cell rule satisfies `align column db1 db2 db3` |
| `-12` | Docs `align row src1 src2 src3` example |
| `-13` | Docs grid example: three `align row` and three `align column` lines |
| `-14` | Two unconnected parts side by side; a `title` statement |
| `-15` | Frontmatter `title`; `%%` comment lines |
| `-16` | CJK titles and edge labels (ids stay ASCII) |
| `-17` | 60-column boundary: natural layout is exactly 60 wide |
| `-18`…`20` | First fitting ladder step: tighter gaps, wrapped titles, keyed edge labels |
| `-21` | Two services with identical titles both render |
| `-22` | Edges written before their services, which Mermaid allows |
| `-23` | `accTitle: x` and `accDescr: y` parsed and ignored |
| `-24` | Junctions only: `junction a`, `junction b`, `a:R -- L:b`; each 1-cell column |

**Rejection fixtures:**

| ID | Input |
|---|---|
| `architecture-reject-01` | Valid prefix, then `service s "text"` (quoted icon text) |
| `-02` | Valid prefix, then the same-side pair `a:R -- R:b` |
| `-03` | Valid prefix, then `api:R -- L:server`, where `api` is a group |
| `-04` | Malformed: `a:R -- b` (no right port) |
| `-05` | Undeclared: `a:R -- L:ghost` |
| `-06` | Order: a group placed `in` a group declared after it |
| `-07` | Duplicate: `service a` declared twice |
| `-08` | Duplicate: `group x` and `service x` |
| `-09` | Conflict: `a:R -- L:b` and `a:L -- R:b` |
| `-10` | Conflict: the docs' `a:L --> R:b` with `align row a b` |
| `-11` | Header `architecture` without `-beta` |

## Part B — chart family

Sources: Mermaid v12.2.0, commit `1fb7869866dd619168d840291c9c54b4f129758b` — detectors, jison/langium grammars and `docs/syntax/*.md` at that commit.

General rules: see Common rules (`00-common.md`).

### gantt

**Tier:** 1. **Header:** `gantt`. No aliases.

**Supported subset:**

```text
title <text>
section <text>
todayMarker off
dateFormat <fmt>   tokens YYYY MM M DD D HH H mm m ss s SSS (one-letter
                   tokens take no leading zero), literals - / . : T and
                   space; year, month and day all present or all absent;
                   default YYYY-MM-DD
axisFormat <fmt>   %Y %y %m %d %e %H %M %S %L %j %b %a; other text is
                   literal, with no other %; default %Y-%m-%d; with a
                   date-free dateFormat, only %H %M %S %L
<name> : [tags,] [[id,] start,] end
  tags   done | active | crit | milestone, before other items
  id     [A-Za-z0-9_-]+, unique
  start  <date> | after <id> [<id>…]        omitted: previous task's end
  end    <date> | <n><unit> | until <id> [<id>…]
  unit   ms s m h d w; n may be a decimal giving whole ms, for ms s m h only (1.5h)
```

A task name is any text without `:`; names may repeat, as in the docs. The previous task is the one before it in source order, across sections. `after` takes the latest end of its ids; `until` takes the earliest start, since the task runs "until … starts". An id may be defined later, as the docs' `until isadded` is. As in the docs, a milestone sits at start + duration/2 and the next task starts at its end.

**Not supported (falls back):**
- `excludes`, `includes`, `weekday`, `weekend`, `tickInterval`, `topAxis`, `inclusiveEndDates`, `todayMarker` other than `off`, and the `vert` tag. The docs don't define `excludes` precisely enough to reproduce, so it falls back rather than being drawn approximately.
- `M` and `y` durations; a fractional `d` or `w` duration (`1.5d`); any other duration token (the docs say Mermaid silently turns `3dX` into zero); a date that doesn't match `dateFormat`; a format token not listed above.
- A repeated or unknown id, a reference cycle, a first task with no start, an end before its start, more than 3 items after the tags.
- A task name with `%` as its first or second character, one that starts with a `YYYY-MM-DD` date, or one whose first word is `call`: Mermaid's lexer reads these as a comment or as tokens.
- `displayMode: compact` is ignored: every task keeps its own row.

**Amendment (plan C fix cycle 1, 2026-10-29):** a fractional `d` or `w` duration falls back. Mermaid's `ganttDb.js` adds a duration with Day.js `add(n, unit)`, which rounds a fractional day or week to whole days (`1.5d` adds 2 days); this design does not reproduce that rounding. Day.js adds a fractional `h`, `m`, `s` or `ms` exactly, so those stay supported.

**Text design** (W = 30; source: `title Release`, `section Build`, `Spec :crit, done, s, 2024-01-01, 10d`, `Code :active, after s, 20d`, `Ship :milestone, 2024-01-31, 0d`):

```text
Release
Build
!✓ Spec 2024-01-01 · 10d ██████████
 ▸ Code after s · 20d              ████████████████████
   Ship 2024-01-31 · 0d                               ◆
                         ┬─────────────┬───────────────
                         2024-01-01    2024-01-15
```

- Rows: the title, then each section header (none for tasks before the first section), then its tasks.
- A task row is a 2-cell status field, a space, the name padded to the widest name `N`, a space, the timing padded to the widest timing `T`, a space, and the bar field `W`.
- Status cell 0 is `!` for `crit`; cell 1 is `✓` for `done`, else `▸` for `active`.
- Bar and `◆` color: the `crit` role, else `done`, else `active`, else the section's series color.
- The timing is the task's source start and end, exactly as written: each is trimmed, and they are joined by `·` with a space on each side (`2024-01-01 · 3d`, `after a1 · 5d`, `2017-07-20 · until b c`). A task with no written start prints only its end (`24d`). Dates keep their `dateFormat` text and durations their unit, so `1w` never prints as `7d`. Timings are left-aligned, in the `value` role. A milestone draws `◆` and prints its timing like any other task.
- Under the field: an axis rule `─` with `┬` at each tick (frame role), then tick labels left-aligned at their ticks (value role). No today marker is drawn.

**Numbers:**
- Time is naive wall-clock time, with no time zone and no DST: `1d` is always 24 h and output never depends on the host. A date-free `dateFormat` places its times on 1970-01-01.
- `t0` is the earliest start and `t1` the latest end, over tasks and milestones. `M = t1 − t0`; `M = 0` falls back.
- A task's bar starts at cell `⌊W·(start − t0)/M⌋` and is `round(8·(end − start)/M·W)` eighth-cells long. A zero-length task draws no bar; its timing still prints.
- A milestone's `◆` sits at cell `min(W − 1, ⌊W·(mid − t0)/M⌋)`, where `mid` is start + duration/2.
- Ticks sit at `t0 + k·step`, up to `t1`, at cell `⌊W·k·step/M⌋`. `step` is the smallest of 1 5 10 50 100 500 ms; 1 5 15 30 s; 1 5 15 30 min; 1 3 6 12 h; 1 2 7 14 30 90 180 365 730 1825 3650 7300 18250 36500 d with `⌊W·step/M⌋ ≥ L + 1`, where `L` is the label width. Every supported token has a fixed width; `%b` and `%a` print English abbreviations (`Jan`, `Mon`). If no step qualifies, only `t0` is labeled. A tick is drawn only if its label fits in the field.
- Timings are text, not numbers: they print as written and are never resolved or converted. Only the resolved starts and ends place bars, `◆` and ticks.

**Collisions and narrow widths:** each task owns a row, and ticks are at least `L + 1` cells apart, so marks never collide; keys appear only when timings move into the legend. A task row is `N + T + W + 5` cells with timings in place, or `N + W + 5 + K` with keys, where `K` is the widest key's width (1 for up to 26 tasks, 2 for 27–702). Ladder:
1. Timings in place: `W = min(60, columns − N − T − 5)`, if that is at least 20.
2. Timings move into the keyed legend: each task gets a key `a`, `b`, … in source order, drawn in the `label` role where its timing was, and the legend lists `key timing` rows under the tick labels. `W = min(60, columns − N − 5 − K)`, if that is at least 20.
3. As step 2, with `W = 20`; task names wrap to `columns − 25 − K` cells, with the key and bar on the name's first row.
4. Fall back. Steps 2 and 3 give each task its own key (`a`…`z`, then `aa`, `ab`, …; common rule 7), so the number of tasks is never a reason to fall back.

The sketch source at 40 columns reaches step 2 (W = 30):

```text
Release
Build
!✓ Spec a ██████████
 ▸ Code b           ████████████████████
   Ship c                              ◆
          ┬─────────────┬───────────────
          2024-01-01    2024-01-15
a 2024-01-01 · 10d
b after s · 20d
c 2024-01-31 · 0d
```

**Required fixtures** (each renders and validates at 60, 80 and 120 columns):
- `gantt-ok-01`: docs' first example: sections, `after a1`, start + length, length only; timings `2014-01-01 · 30d`, `after a1 · 20d`, `2014-01-12 · 12d`, `24d`. Another task 01-31 → 02-20; another task 01-24 → 02-17.
- `gantt-ok-02`: the sketch source; timings `2024-01-01 · 10d`, `after s · 20d`, `2024-01-31 · 0d` (`T` = 16). At 120 (W = 60): Spec 160 eighths from cell 0; Code 320 from cell 20; `◆` at 59; ticks 01-01, 01-08, 01-15, 01-22 at 0, 14, 28, 42. At 80 (W = 55): 147; 293 from cell 18; `◆` at 54; the same ticks at 0, 12, 25, 38. At 60 (W = 35): 93; 187 from cell 11; `◆` at 34; ticks 01-01 and 01-15 at 0 and 16.
- `gantt-ok-03`: docs' `after b a` / `until b c` example: cherry 07-27 → 07-28; kiwi 07-20 → 07-23. Timings print as written: `2017-07-20 · 1w`, `2017-07-23 · 1d`, `after b a · 1d`, `2017-07-20 · until b c`.
- `gantt-ok-04`: docs' milestone example (`HH:mm`, `%H:%M`): `◆` at 17:50 and 18:10; Task A 17:51 → 18:01. Timings `17:49 · 2m`, `10m`, `5m`, `18:08 · 4m`. At 120 (W = 60): `◆` at cells 2 and 54; Task A from cell 5, 209 eighths; 5-minute ticks at 0, 13, 26, 39, 52.
- `gantt-ok-05`: docs' syntax example without `excludes`: status fields `!✓`, `!▸`, `! `, ` ▸`, ` ✓`; forward `until isadded`; repeated names; tasks without ids. Timings include `2014-01-06 · 2014-01-08`, `2014-01-06 · 24h` (not `1d`), `after a1 · 20h` (trimmed) and `until isadded`; `T` = 23. Step 1 at 120 (W = 57); step 2 at 80 (W = 39, keys `a`–`q`); step 3 at 60, where `Completed task in the critical line` wraps to 34 cells.
- `gantt-ok-06`: `active, done` shows `✓` and the `done` role; a `crit` milestone's `◆` takes the `crit` role.
- `gantt-ok-07`: `500ms`, `30s`, `1.5s`, `1.5m` and `1.5h` print as written (not `1500ms`, `90s` or `90m`) and span exactly 1.5 s, 90 s and 90 min; a `0d` task draws no bar and prints its timing; tasks before any section.
- `gantt-ok-08`: `dateFormat YYYY-MM-DDTHH:mm:ss.SSS`, `axisFormat %y/%j %H:%M:%S.%L`: timings keep the `dateFormat` text; tick labels use `axisFormat`.
- `gantt-ok-09`: `dateFormat D/M/YYYY H:m:s`, `axisFormat %a %e %b`: timings keep the unpadded dates as written.
- `gantt-ok-10`: `%%` comments, frontmatter title, `displayMode: compact` (ignored), `todayMarker off`.
- `gantt-ok-11`: CJK task and section names.
- `gantt-ok-12`: a natural row of exactly 60 cells at W = 20: step 1 at 60; at 59, step 2 moves the timings into the legend.
- `gantt-ok-13`: wrapped names with keyed timings; step 3 first fits at 60 (names wrap to 34 cells).
- `gantt-ok-14`: valid chart, then `click a1 href "https://example.com"`: parsed and ignored (common rule 4); the drawing is unchanged.
- `gantt-ok-15`: timings move into the legend. `dateFormat YYYY-MM-DD HH:mm`, `axisFormat %H:%M`; `Load trucks :l, 2024-03-01 08:00, 2024-03-01 11:30`, `Drive :d, after l, 2024-03-01 15:00`, `Unload :after d, 90m` (`N` = 11, `T` = 35). Step 1 at 120 (W = 60) and 80 (W = 29). At 60, step 1 leaves W = 9, so step 2 draws keys `a`, `b`, `c` (W = 43): bars 142, 142 and 61 eighths from cells 0, 17 and 35; ticks 08:00, 11:00, 14:00 at 0, 15, 30; legend rows `a 2024-03-01 08:00 · 2024-03-01 11:30`, `b after l · 2024-03-01 15:00`, `c after d · 90m`.
- `gantt-ok-16`: two-character keys. 27 tasks `t01`…`t27`, each `2024-01-01, 1d` (N = 3, T = 15), at 42 columns. Step 1 gives W = 19, so step 2 applies: keys `a`…`z`, `aa` (K = 2), W = 32. Every task row, `aa` included, is exactly 42 cells.

**Rejection fixtures** (each returns the original fence):
- `gantt-reject-01`: valid chart, then `excludes weekends`.
- `gantt-reject-02`: duration `3dX`.
- `gantt-reject-03`: `2014-1-1` under `YYYY-MM-DD`.
- `gantt-reject-04`: two tasks with id `a1`.
- `gantt-reject-05`: `after zz`, with no task `zz`.
- `gantt-reject-06`: `a` after `b` and `b` after `a`.
- `gantt-reject-07`: an end date before its start.
- `gantt-reject-08`: a lone task `:5d`, with no start.
- `gantt-reject-09`: duration `1M`.
- `gantt-reject-10`: docs' bar-chart example (`dateFormat X`, `axisFormat %s`).
- `gantt-reject-11`: `dateFormat HH:mm` with the default `axisFormat`.
- `gantt-reject-12`: docs' `vert` example.
- `gantt-reject-13`: a single `0d` milestone (`M = 0`).
- `gantt-reject-14`: a one-word 40-letter task name, at 60 columns.
- `gantt-reject-15`: `Call vendor :2d` (Mermaid's lexer starts a `call`).
- `gantt-reject-16`: `5% bonus :2d` (Mermaid skips the line as a comment).
- `gantt-reject-17`: `2024-01-01 kickoff :1d` (Mermaid lexes a date).
- `gantt-reject-18`: duration `1.5d` (the amendment above).
- `gantt-reject-19`: valid chart, then `includes 2024-01-06`.
- `gantt-reject-20`: valid chart, then `weekday monday`.
- `gantt-reject-21`: valid chart, then `weekend friday`.
- `gantt-reject-22`: valid chart, then `tickInterval 1week`.
- `gantt-reject-23`: valid chart, then `topAxis`.
- `gantt-reject-24`: valid chart, then `inclusiveEndDates`.
- `gantt-reject-25`: valid chart, then `todayMarker stroke-width:5px`.
- `gantt-reject-26`: duration `1y`.
- `gantt-reject-27`: `B :crit, b1, 2024-01-04, 3d, 4d` (four items after the tags).

### pie

**Tier:** 1. **Header:** `pie`, optionally followed on the same line by `showData`, then `title <text>`. No aliases.

**Supported subset:**

```text
pie [showData] [title <text>]
title <text>
"<label>" : <value>      '<label>' too
  value  [1-9][0-9]* or [0-9]+\.[0-9]+ (NUMBER_PIE without its sign or 0)
```

`showData` is accepted; values print anyway. Pie config (`textPosition`, `donutHole`, `legendPosition`, `highlightSlice`) is ignored.

**Not supported (falls back):** a value of 0 or less (the docs require positive values); a repeated label; a backslash in a label; a pie with no slices.

**Text design** (docs' Pets example, W = 60):

```text
Pets adopted by volunteers
Dogs ███████████████████████████████████████████████▋             386 79.4%
Cats ██████████▌                                                   85 17.5%
Rats █▉                                                            15  3.1%
```

- One row per slice, sorted by value, largest first; ties keep source order. This differs on purpose from Mermaid's pie, which keeps source order (`pieRenderer.ts` sorts with `null`): the text design is a ranked bar list, not a circle, and a ranked list reads largest first.
- A row: the label padded to the widest label `N`, a space, the bar field `W`, a space, the value right-aligned to the widest value `V`, a space, and the percentage right-aligned to the widest percentage `P`.
- Each bar takes its slice's series color, assigned in source order, so sorting doesn't change colors.

**Numbers:** `M = Σv`, so the bars together fill the field, like an unrolled pie. A bar is `round(8·v/Σv·W)` eighth-cells. A percentage is `100·v/Σv`, rounded half up to one decimal and printed with `%`; printed percentages need not sum to 100.0. Mermaid prints whole percentages on its slices and leaves slices under 1% off the circle; this design keeps one decimal and draws every slice on purpose, since dropping a slice would hide a source item (spec C rule 4).

**Collisions and narrow widths:** each slice owns a row, so nothing collides. A row is `N + W + V + P + 3` cells. Ladder:
1. `W = min(60, columns − N − V − P − 3)`, if that is at least 10.
2. `W = 10`; labels wrap to `columns − V − P − 13` cells, with the bar on the label's first row.
3. Fall back.

**Required fixtures** (60, 80 and 120 columns):
- `pie-ok-01`: docs' Pets example: Dogs 79.4%, Cats 17.5%, Rats 3.1%. At 80 and 120 (W = 60): 381, 84, 15 eighths. At 60 (W = 45): 286, 63, 11.
- `pie-ok-02`: docs' `showData` example (frontmatter config ignored): Potassium, Calcium, Magnesium, Iron; 46.3%, 39.8%, 9.3%, 4.6%. At 120 (W = 60): 222, 191, 44, 22 eighths. At 80 (W = 58): 215, 185, 43, 21.
- `pie-ok-03`: `"A" : 15` and `"B" : 1`: 93.8% and 6.3% (half up; the printed sum is 100.1). At 80 and 120 (W = 60): 450 and 30 eighths. At 60 (W = 49): 368 and 25, both rounded up from exact halves.
- `pie-ok-04`: equal values keep source order; single-quoted labels; decimal values.
- `pie-ok-05`: `pie showData title …` on one line; `%%` comments.
- `pie-ok-06`: `title` on its own line; a single slice fills the field and prints 100.0%.
- `pie-ok-07`: CJK labels.
- `pie-ok-08`: a natural row of exactly 60 cells at W = 10: step 1 at 60, step 2 at 59.
- `pie-ok-09`: wrapped labels; step 2 first fits at 60.
- `pie-ok-10`: valid pie, then `accTitle: Pets`: parsed and ignored (common rule 4); the drawing is unchanged.

**Rejection fixtures:**
- `pie-reject-01`: a value `0`.
- `pie-reject-02`: a value `-5`.
- `pie-reject-03`: the label `"Dogs"` twice.
- `pie-reject-04`: an unquoted label (`Dogs : 386`).
- `pie-reject-05`: a header with no slices.
- `pie-reject-06`: a one-word 50-letter label, at 60 columns.
- `pie-reject-07`: a backslash in a label, `"a\b" : 1`.

### xychart

**Tier:** 1. **Header:** `xychart-beta` or `xychart` (v12.2.0's detector and lexer accept both; one type), optionally followed by `vertical` or `horizontal`.

**Supported subset** (in `x-axis`, `bar` and `line`, the last `[…]` is literal; other `[…]` mark optional parts):

```text
title <text>
x-axis <text>                        title only
x-axis [<text>] [<text>, <text>, …]  categories, optional title
y-axis <text>                        title only
y-axis [<text>] <n> --> <n>          range, optional title
bar  [<text>] [<n>, <n>, …]
line [<text>] [<n>, <n>, …]
  text  "quoted", or one unquoted word of [A-Za-z0-9&+=*.#_-] where no
        keyword (bar, line, title, x-axis, y-axis, vertical, horizontal,
        xychart) begins at the start of a run of letters, in any case
  n     [+-]?(\d+(\.\d+)?|\.\d+)
```

Both axes are optional. Every series has one value per category; with no categories, the first series sets the number of groups, which stay unlabelled. With no y range, `y0 = min(0, smallest value)` and `y1 = max(0, largest value)`, so bars start at 0; the docs say only that the range is generated from the data. Config (`chartOrientation`, `showDataLabel`, `showLegend`, `plotColorPalette`) is ignored: the header word sets the orientation, and values and names always print.

**Not supported (falls back):**
- A numeric x range (`x-axis 0 --> 100`); point labels (`line [540 "PaLM", …]`); markdown strings.
- Unquoted text of several words, which Mermaid joins without spaces; an unquoted axis title with digits, which Mermaid lexes as numbers; an unquoted word where a keyword begins a run of letters (`barley`), which Mermaid splits.
- A repeated `x-axis`, `y-axis` or category; a series whose length differs from the number of groups.
- A value outside an explicit range; `y0 ≥ y1`, including all-zero data with no range.
- A bar series when `y0 < 0`: bars grow from `y0`, so a zero bar would not be empty. More than 8 line series (markers would repeat) or 26 bar series. An implicit range whose values are all 0 (`y0 = y1`), which leaves no scale.

**Text design** (source: `title Sales`, `x-axis [jan, feb, mar]`, `y-axis 0 --> 100`, `bar [20, 75, 50]`, `line [30, 60, 90]`):

```text
Sales
100 ┤           ●
    │
    │     ██
    │     ██●
 50 ┤     ██  ██
    │   ● ██  ██
    │ ▅▅  ██  ██
    │ ██  ██  ██
  0 └─┬───┬───┬──
      jan feb mar
a      20  75  50
●      30  60  90
```

- **Vertical:** an 8-row plot over an axis row. The gutter is `G` = 1 + the widest tick label or `tag name` text. Tick labels `y1`, the midpoint and `y0` are right-aligned at plot rows 8 and 4 and the axis row, before `┤` (`└` on the axis row); other rows have `│`.
- Each category is a group: a gap cell, then `c` content cells, where `c` = the widest of the category, its values, and the number of series. Each line series takes 1 cell; bar series share the rest evenly (rounded down), in source order; leftover cells stay blank at the group's end.
- Bars use `▁▂▃▄▅▆▇█` in their series color. Line points use their series' marker, `●◆▲■○◇△□` in source order, and are not joined.
- Below the axis row (`─`, with `┬` under each group's first content cell): category labels, left-aligned in their groups; then one row per series: its tag (`a`, `b`, … for bars, the marker for lines) and name in the gutter, and its values right-aligned in the groups.
- The `y-axis` title sits above the plot and the `x-axis` title below the category labels; horizontal swaps them.
- **Horizontal:** per category, one row per series: the category label (first row only, padded to the widest `C`), a space, the tag, a space, the field `W` (bars `▏…█`, points the marker), a space, and the value right-aligned to `V`. Under the field: a `─` rule with `┬` at cells 0 and `W − 1`, then `y0` left-aligned and `y1` right-aligned. A legend lists named series as `tag name`; as in the docs, unnamed series are left out.
- Roles: axes, ticks and rules are `frame`; categories, tags and names `label`; tick labels and values `value`; bars and markers their series color.

**Numbers:** `y0` and `y1` are the explicit range, else the rule above; the scale is `M = y1 − y0`, with `v` measured from `y0`. Only line values may be negative.
- Vertical, `H = 8` rows counted from the bottom: a bar is `round(8·H·(v − y0)/M)` eighth-rows; a point sits in row `max(1, ⌈H·(v − y0)/M⌉)`.
- Horizontal: a bar is `round(8·W·(v − y0)/M)` eighth-cells; a point sits in cell `min(W − 1, ⌊W·(v − y0)/M⌋)`.
- A bar equal to `y0` draws nothing but keeps its value. An explicit bound prints as written; a computed bound and the midpoint `(y0 + y1)/2` print as the shortest exact decimal. Values print as written.

**Collisions and narrow widths:** each series owns a sub-column (vertical) or a row (horizontal), so marks never share a cell and need no keys beyond series tags. A vertical chart is `G + 1 + n·(c + 1)` cells for `n` categories; a horizontal row is `C + W + V + 4`. Ladder:
1. The header's orientation: vertical if it fits `columns`; horizontal with `W = min(60, columns − C − V − 4)` if that is at least 10.
2. A vertical chart that doesn't fit is redrawn horizontal, as in step 1.
3. Horizontal with `W = 10`; categories wrap to `columns − V − 14` cells.
4. Fall back. Horizontal also falls back if `y0` and `y1`, with a space between them, are wider than `W`.

**Required fixtures** (60, 80 and 120 columns):
- `xychart-ok-01`: docs' Sales Revenue example (bar + line): bars 9, 18, 32, 38, 50, 59, 64, 57, 48, 41, 27, 18 eighth-rows; ticks 4000, 7500, 11000. Vertical (79 cells) at 80 and 120; horizontal at 60 (W = 48).
- `xychart-ok-02`: docs' legend example (`xychart-beta`): three named lines, markers `●◆▲`; midpoint tick 99.1; vertical (55 cells) at every width.
- `xychart-ok-03`: docs' simplest example: no axes, 4 unlabelled groups; ticks `-0.34`, `1.03`, `2.4`; points in rows 5, 3, 8, 1; values print `+1.3`, `.6`, `2.4`, `-.34`.
- `xychart-ok-04`: docs' Genres example (`showDataLabel` ignored): bars 26, 4, 43, 53, 36, 51 eighth-rows; quoted `"non fiction"`. Vertical (76 cells) at 80 and 120; horizontal at 60 (W = 43).
- `xychart-ok-05`: docs' palette example (palette ignored): each group draws line, bar, bar, line in source order, tagged `●`, `a`, `b`, `◆`; quoted axis titles.
- `xychart-ok-06`: `xychart horizontal`, `title Revenue`, `x-axis Quarter [2023, 2024]`, `y-axis 0 --> 100` (no title); two named bars and a named line; legend `a`, `b`, `●`.
- `xychart-ok-07`: `xychart vertical`, `x-axis Month`, `y-axis Units` (titles only): unlabelled groups; range 0 to the largest value; a zero bar draws nothing and prints `0`.
- `xychart-ok-08`: CJK title, categories and series names (quoted).
- `xychart-ok-09`: a vertical chart of exactly 60 cells: step 1 at 60, step 2 at 59.
- `xychart-ok-10`: wrapped categories; step 3 first fits at 60.
- `xychart-ok-11`: valid chart, then `accTitle: Sales`: parsed and ignored (common rule 4); the drawing is unchanged.

**Rejection fixtures:**
- `xychart-reject-01`: docs' point-label example (`line [540 "PaLM", …]`).
- `xychart-reject-02`: 12 categories, 11 values.
- `xychart-reject-03`: `y-axis 0 --> 100` with a value 120.
- `xychart-reject-04`: docs' `bar [2.3, 45, .98, -3.4]` (`y0 < 0` with a bar).
- `xychart-reject-05`: `x-axis 0 --> 100`.
- `xychart-reject-06`: unquoted `title Sales Revenue` (Mermaid prints `SalesRevenue`).
- `xychart-reject-07`: `x-axis Q1 [a, b]` (digit in an unquoted axis title).
- `xychart-reject-08`: `x-axis [barley, wheat]` (Mermaid lexes `bar`).
- `xychart-reject-09`: `bar [1, 2` (unclosed).
- `xychart-reject-10`: `x-axis [a, a]` (repeated category).
- `xychart-reject-11`: `y-axis 5 --> 5`.
- `xychart-reject-12`: one 50-letter category, at 60 columns.
- `xychart-reject-13`: 9 line series.
- `xychart-reject-14`: the only title is a markdown string, `` "`**Sales**`" ``; nothing else is wrong.
- `xychart-reject-15`: a second `x-axis`.
- `xychart-reject-16`: every value 0 and no `y-axis` range, so the implicit range is empty (`y0 = y1 = 0`).
- `xychart-reject-17`: 27 bar series.
- `xychart-reject-18`: a second `y-axis`.

### quadrant

**Tier:** 1. **Header:** `quadrantChart`. No aliases.

**Supported subset** (`[--> <text>]` is optional; a point's `[…]` is literal):

```text
title <any text>
x-axis <text> [--> <text>]     left, then right
y-axis <text> [--> <text>]     bottom, then top
quadrant-1 <text>              1 top right, 2 top left, 3 bottom left,
                               4 bottom right
<text>: [<x>, <y>]             a point
  x, y  0, 1 or 0.<digits>, as the lexer's point pattern
  text  "quoted", or unquoted: letters, digits, spaces, non-ASCII and
        !#$%&'*+,./=?\_- , not starting with -; no keyword (title,
        x-axis, y-axis, quadrant-1…4, classDef, quadrantChart) begins at
        the start of a run of ASCII letters, in any case
```

Point names may repeat. `classDef` and a point's `:::name` are ignored (common rule 4). With no points, Mermaid centers the texts; this design draws the same layout either way.

**Not supported (falls back):** point styles (`radius:`, `color:`, `stroke-color:`, `stroke-width:`); `x-axis <text> -->` with no right text (Mermaid appends ` ⟶ `); markdown strings; a repeated `x-axis`, `y-axis` or `quadrant-N`; any other coordinate (`1.0`, `.5`, `1.2`), which the lexer rejects.

**Text design** (q = 10; source: `title Reach`, `x-axis Low --> High`, `y-axis Cold --> Hot`, `quadrant-1 Expand`, `quadrant-2 Promote`, `quadrant-3 Rethink`, `quadrant-4 Improve`, `A: [0.3, 0.6]`, `B: [0.45, 0.23]`, `C: [0.78, 0.34]`):

```text
Reach
↑ Hot
┌──────────┬──────────┐
│ Promote  │  Expand  │
│          │          │
│          │          │
│          │          │
│      1   │          │
│          │          │
├──────────┼──────────┤
│ Rethink  │ Improve  │
│          │          │
│          │     3    │
│         2│          │
│          │          │
│          │          │
└──────────┴──────────┘
 Low        High
↓ Cold
1 A (0.3, 0.6)
2 B (0.45, 0.23)
3 C (0.78, 0.34)
```

- A frame split by a cross into four quadrants, each `q` cells wide and 6 rows tall: a title row, then 5 point rows. Quadrant texts are centered in their title rows (odd space goes right).
- Above the frame: the title, then `↑` and the top text. Below: the left and right texts at the first cell of their halves, then `↓` and the bottom text, then the legend.
- Each point draws its key in series color `s1`. The legend lists every point in source order as `key name (x, y)`, coordinates as written; with no points it is omitted.
- Roles: frame and cross `frame`; quadrant and axis texts `label`; title `title`; coordinates `value`.

**Numbers:** `q = min(30, ⌊(columns − 3)/2⌋)`; the frame is `2q + 3` cells. A point's column is `min(2q − 1, ⌊2q·x⌋)` and its row `min(9, ⌊10·y⌋)`, counted from the bottom; columns `0…q − 1` are the left half and rows `0…4` the bottom half. So 0.5 lies right of and above the cross, and 1 lies in the last cell.

**Collisions and narrow widths:**
- Points take keys in source order. A point whose key would sit in, or next to on the same row, an existing key's cells joins that key (the lowest-numbered one). Otherwise it takes the next number, drawn from its cell rightward. Every point keeps its own legend row.
- If any quadrant or x-axis text is wider than `q`, every quadrant and x-axis text becomes a field key `a`, `b`, … in its place (common rule 7, all or none), listed in the legend in source order. The title and y-axis texts wrap like header rows.
- Ladder: (1) every text in place; (2) texts wider than `q` become field keys; (3) fall back when `q < 8` (`columns < 19`) or a key would run into the cross or the frame.

**Required fixtures** (60, 80 and 120 columns):
- `quadrant-ok-01`: docs' campaign example: keys 1–6 and six legend rows. Campaign A's `1` is at column 18, row 6 at 80 and 120 (q = 30), and at column 16 at 60 (q = 28).
- `quadrant-ok-02`: points at 0, 1 and 0.5 on each axis: 1 clamps to the last cell; 0.5 lies right of and above the cross.
- `quadrant-ok-03`: quoted `x-axis "Effort"` and `y-axis "Value"` only; no quadrant texts; frontmatter title; `%%` comments. Absent texts draw nothing (no `↑` row).
- `quadrant-ok-04`: `A` and `B` in one cell and `C` (0.32 vs 0.3) in the next cell share key 1, with three legend rows; a second point named `A` elsewhere takes key 2.
- `quadrant-ok-05`: 12 points; keys 10–12 take two cells.
- `quadrant-ok-06`: unquoted CJK title, quadrant texts and point names.
- `quadrant-ok-07`: docs' config example (`"Important ❤"`; config ignored): no points, so no legend.
- `quadrant-ok-08`: a 28-cell quadrant text: in place at 59 and 60 (q = 28); at 58 (q = 27) every quadrant and x-axis text is keyed.
- `quadrant-ok-09`: a legend row of exactly 60 cells: one row at 60, wrapped at 59.
- `quadrant-ok-10`: docs' class example (`Point A:::class1: [0.9, 0.0]` … `classDef class3 color: #f00fff, radius : 10`): `:::name` and `classDef` parsed and ignored (common rule 4). Points C and D, both at (0.7, 0.2), share key 3; four legend rows.

**Rejection fixtures:**
- `quadrant-reject-01`: valid chart, then docs' `Point A: [0.9, 0.0] radius: 12`.
- `quadrant-reject-02`: `[1.2, 0.5]` (out of domain).
- `quadrant-reject-03`: `[1.0, 0.5]` (the lexer rejects `1.0`).
- `quadrant-reject-04`: `x-axis Low -->` (no right text).
- `quadrant-reject-05`: `quadrant-1` twice.
- `quadrant-reject-06`: `A: [0.3 0.6]` (no comma).
- `quadrant-reject-07`: a point named `Titled work` (Mermaid reads a title).
- `quadrant-reject-08`: a 10th point at x = 0.49, the last cell of the left half: its key `10` would run into the cross.
- `quadrant-reject-09`: docs' campaign example at 18 columns (q = 7).
- `quadrant-reject-10`: the only `quadrant-1` is a markdown string, `` "`**A**`" ``; nothing else is wrong.
- `quadrant-reject-11`: a second `x-axis`.
- `quadrant-reject-12`: `A: [.5, 0.5]` (the point pattern needs `0.`).
- `quadrant-reject-13`: `Point A: [0.9, 0.0] color: #ff3300`.
- `quadrant-reject-14`: `Point A: [0.9, 0.0] stroke-color: #10f0f0`.
- `quadrant-reject-15`: `Point A: [0.9, 0.0] stroke-width: 5px`.
- `quadrant-reject-16`: a second `y-axis`.

### journey

**Tier:** 1. **Header:** `journey`. No aliases.

**Supported subset:**

```text
title <text>
section <text>
<task>: <score>: <actor>[, <actor>…]
  score  a number from 1 to 5 (the docs: "between 1 and 5, inclusive")
```

Tasks before the first section have no header. Actors are trimmed. Actors and task names may repeat across tasks.

**Not supported (falls back):** `#` or `;` anywhere except in an ignored `accTitle` or `accDescr` (common rule 4), because Mermaid's lexer skips `#` to the line end and has no rule for `;`; `:` in a section name; a score outside 1–5 or not a number; a task with no actor, an empty actor, or the same actor twice; more than two `:` in a task line.

**Text design** (docs' example, first section):

```text
My working day
Go to work
  Make tea    ██████████ 5  Me
  Go upstairs ██████     3  Me
  Do work     ██         1  Me, Cat
```

- Rows: the title, then each section header in its series color, then its tasks, indented 2 cells.
- A task row: the name padded to the widest name `N`, a space, a 10-cell score bar in the section's color, a space, the score right-aligned to the widest score `S`, two spaces, and the actors joined by `, `.
- Roles: task names and actors `label`; scores `value`.

**Numbers:** the bar field is fixed at `W = 10` with `M = 5`, so a score `s` fills `round(16·s)` eighth-cells: 5 fills the field and 1 fills 2 cells. Scores print as written.

**Collisions and narrow widths:** each task owns a row, so nothing collides. A task row is `N + S + A + 16` cells, where `A` is the widest actor list. Ladder:
1. Natural, if it fits `columns`.
2. Actor lists wrap after commas to `columns − N − S − 16` cells.
3. One actor per row; task names wrap to `columns − S − a − 16` cells, where `a` is the widest actor, comma included.
4. Fall back.

**Required fixtures** (60, 80 and 120 columns):
- `journey-ok-01`: docs' example: Make tea 80 eighths (10 cells), Go upstairs 48, Do work 16; actors `Me, Cat`; two sections.
- `journey-ok-02`: decimal scores: 2.5 fills 40 eighths, 4.75 fills 76.
- `journey-ok-03`: tasks before any section; `title`; `%%` comments.
- `journey-ok-04`: CJK task, section and actor names.
- `journey-ok-05`: a natural row of exactly 60 cells: step 1 at 60; at 59, step 2 wraps the actor list.
- `journey-ok-06`: an actor wider than step 2's field: step 3 first fits at 60.
- `journey-ok-07`: one actor across many tasks; a repeated task name.
- `journey-ok-08`: valid journey, then `accDescr: My day`: parsed and ignored (common rule 4); the drawing is unchanged.

**Rejection fixtures:**
- `journey-reject-01`: score `6`.
- `journey-reject-02`: score `high`.
- `journey-reject-03`: `Make tea: 5` (no actor).
- `journey-reject-04`: `Do work: 1: Me, Me` (repeated actor).
- `journey-reject-05`: `Fix #12: 3: Me` (Mermaid reads a comment).
- `journey-reject-06`: `Plan; review: 3: Me` (no lexer rule for `;`).
- `journey-reject-07`: `section Morning: early`.
- `journey-reject-08`: a one-word 50-letter task name with actor `Me`, at 60 columns.
- `journey-reject-09`: an empty actor list, `A: 3:`.
- `journey-reject-10`: extra colons, `A: 3: Me: Cat`.
- `journey-reject-11`: an empty actor inside the list, `A: 3: Me,,Cat`.

### sankey

**Tier:** 2 (gated). **Header:** `sankey-beta` or `sankey` (v12.2.0's detector and lexer accept both; one type), then a newline.

**Supported subset:**

```text
<source>,<target>,<value>      one link per line
  field  unquoted: printable ASCII except , and "
         quoted: "…", printable ASCII; "" is a literal "
  value  [0-9]+(\.[0-9]+)?
```

Fields are trimmed. Blank lines and whole-line `%%` comments are skipped, as in the docs. A repeated source–target pair is a separate link. Config (`showValues`, `linkColor`, `nodeAlignment`, `labelStyle`, `nodeWidth`, `nodePadding`, `nodeColors`) is ignored; values always print.

**Not supported (falls back):** non-ASCII text, since the CSV lexer's `TEXTDATA` covers only U+0020–U+007E and Mermaid can't read it; a line break inside quotes; a record without exactly 3 fields; a negative or non-numeric value; a cycle, including a self-link, because ranks need a one-way flow; text after the header.

**Text design** (W = 15; source: `Solar,Grid,40`, `Wind,Grid,60`, `Grid,Homes,70`, `Grid,Loss,30`):

```text
Solar ─→ Grid  ████████▋       40
Wind  ─→ Grid  ████████████▉   60
Grid  ┬→ Homes ███████████████ 70
      └→ Loss  ██████▍         30
```

- Links are grouped by source. A node's rank is 0 if no link enters it, else 1 + the highest rank of its sources. Groups are ordered by their source's rank, then first appearance; links keep source order within a group.
- A row: the source name (on the group's first row only) padded to the widest source `S`, a space, a 2-cell connector, a space, the target padded to the widest target `T`, a space, the bar field `W`, a space, and the value right-aligned to `V`.
- Connectors: `─→` for a group's only link; else `┬→`, `├→` and `└→` for its first, middle and last links, with `│` on wrapped rows between them.
- Roles: each source's name and bars take its series color, by first appearance; connectors `edge`, with `→` in `arrow`; targets `label`; values `value`.
- **Counting** (the sankey exception to common rule 10): each source link appears exactly once, as its own row, and validation counts link rows. A node's name can appear several times: as its group's heading, if the node has outgoing links, and in the row of each link into it.

**Numbers:** `M` is the largest link value. A bar is `round(8·v/M·W)` eighth-cells; a zero link draws no bar and prints its value as written (common rule 8). `M = 0` falls back.

**Collisions and narrow widths:** each link owns a row, so nothing collides. A row is `S + T + W + V + 6` cells. Ladder:
1. `W = min(60, columns − S − T − V − 6)`, if that is at least 10.
2. `W = 10`; with `A = columns − V − 16`, source names wrap to `⌊A·S/(S + T)⌋` cells and target names to the rest. A link takes as many rows as its target needs; a group gets blank rows if its source needs more.
3. Fall back.

**Required fixtures** (60, 80 and 120 columns):
- `sankey-ok-01`: docs' Basic example (blank line, `%%` line): at 120 (W = 60) bars 441, 480, 115 eighths; at 80 (W = 24) 176, 192, 46; at 60, step 2 (W = 10) 73, 80, 19, with sources wrapped to 13 cells and targets to 24.
- `sankey-ok-02`: docs' Commas and Double Quotes examples: targets `Heating and cooling, homes` and `Heating and cooling, "homes"`.
- `sankey-ok-03`: docs' Empty Lines example.
- `sankey-ok-04`: `B,C,2`, `A,B,3`, `A,C,1`: group A (rank 0) comes before group B (rank 1), though B appears first.
- `sankey-ok-05`: a zero link (no bar, `0`); a repeated pair takes two rows.
- `sankey-ok-06`: docs' energy example (68 links, 48 nodes, ranks 0–7; `showValues: false` ignored): step 1 at 120 (W = 50) and at 80 (W = 10); step 2 at 79 and at 60, where sources wrap to 14 cells and targets to 23.
- `sankey-ok-07`: a natural row of exactly 60 cells at W = 10: step 1 at 60, step 2 at 59.
- `sankey-ok-08`: `sankey-beta` header; wrapped names; step 2 first fits at 60.

There is no CJK ok-fixture: Mermaid's sankey lexer can't read non-ASCII text, so `sankey-reject-06` covers CJK.

**Rejection fixtures:**
- `sankey-reject-01`: valid links, then `A,B,-5`.
- `sankey-reject-02`: `A,B` (2 fields).
- `sankey-reject-03`: `A,B,12abc` (the grammar's `parseFloat` would read 12).
- `sankey-reject-04`: `A,B,1` and `B,A,1` (a cycle).
- `sankey-reject-05`: `A,A,1` (a self-link).
- `sankey-reject-06`: CJK names (`"电网",Homes,5`): the lexer can't read them.
- `sankey-reject-07`: a quoted field with a line break inside.
- `sankey-reject-08`: `sankey title Flows` (text after the header).
- `sankey-reject-09`: a one-word 50-letter source, at 60 columns.

### radar

**Tier:** 2 (gated). **Header:** `radar-beta` or `radar-beta:`, as the grammar allows. No aliases: v12.2.0's detector matches only `radar-beta`, so `radar` falls back.

**Supported subset** (`["…"]` is literal):

```text
title <text>
axis <axis>, <axis>, …           one or more per line
curve <curve>, <curve>, …        one or more per line
max <n>   min <n>   ticks <n>   graticule circle|polygon   showLegend true|false
  axis   id  or  id["label"]
  curve  id{n, n, …} in axis order, or id{axisId: n, …}; id may be id["label"]
  id     letters, digits, _ and -; starts with a letter or _; doesn't end with -
  n      0, [1-9][0-9]* or [0-9]+\.[0-9]+ (no sign)
```

Values may span lines inside `{…}`; the `:` in `axisId: n` is optional; options may share a line, comma-separated; labels may use `'…'`. Unlabelled axes and curves show their id. Axis ids and curve ids are separate: the docs' Grades example uses `a` for both. `ticks`, `graticule` and `showLegend` are accepted but change nothing: bars have no graticule, and the key legend always prints.

**Not supported (falls back):**
- A curve without exactly one value per axis; a keyed value for an unknown or repeated axis; plain and keyed values in one curve (the grammar allows one kind per curve).
- A repeated axis id or curve id; an id that is a keyword or starts with `true`, `false`, `circle`, `polygon`, `title`, `accTitle` or `accDescr`, which Mermaid's lexer may read as tokens; a backslash in a label; more than 26 curves.
- A value outside `[min, max]`; `min ≥ max`, including all-zero data with no `max`.

**Text design** (W = 25; source: `axis m["Math"], s["Science"]`, `curve a["Alice"]{85, 90}`, `curve b["Bob"]{70, 75}`, `max 100`):

```text
Math    a █████████████████████▎    85
        b █████████████████▌        70
Science a ██████████████████████▌   90
        b ██████████████████▊       75
a Alice
b Bob
```

- One block per axis, in source order; one row per curve, in source order.
- A row: the axis label (first row of its block only) padded to the widest label `N`, a space, the curve's key, a space, the bar field `W`, a space, and the value right-aligned to `V`.
- Keys are `a`, `b`, … in curve order; the legend lists `key label`.
- Roles: keys, bars and legend keys take the curve's series color; labels `label`; values `value`.

**Numbers:** `min` defaults to 0 and `max` to the largest value. A bar is `round(8·(v − min)/(max − min)·W)` eighth-cells; a value equal to `min` draws no bar and prints its value. Values print as written.

**Collisions and narrow widths:** each value owns a row, so nothing collides. A row is `N + W + V + 4` cells. Ladder:
1. `W = min(60, columns − N − V − 4)`, if that is at least 10.
2. `W = 10`; axis labels wrap to `columns − V − 14` cells.
3. Fall back.

**Required fixtures** (60, 80 and 120 columns):
- `radar-ok-01`: docs' Grades example (frontmatter title; `max 100`, `min 0`; axis id `a` and curve id `a`): Alice's Math 85 is 408 eighths at 80 and 120 (W = 60) and 306 at 60 (W = 45).
- `radar-ok-02`: docs' Restaurant example: `title`; four curves; `graticule polygon`; `max 5`.
- `radar-ok-03`: docs' curve example without its `...` line: keyed values out of axis order; two curves on one line; unlabelled axes and curves show their ids; no `max`, so 30 fills the field.
- `radar-ok-04`: values on several lines inside `{…}`; a zero value draws no bar and prints `0`.
- `radar-ok-05`: `min 10`: a value 10 draws no bar.
- `radar-ok-06`: CJK axis and curve labels.
- `radar-ok-07`: `radar-beta:` header; `ticks 5, graticule circle, showLegend false` on one line: the drawing is unchanged.
- `radar-ok-08`: a natural row of exactly 60 cells at W = 10: step 1 at 60, step 2 at 59.
- `radar-ok-09`: wrapped axis labels; step 2 first fits at 60.
- `radar-ok-10`: valid chart, then `accTitle: Grades`: parsed and ignored (common rule 4); the drawing is unchanged.

**Rejection fixtures:**
- `radar-reject-01`: `max 100` with a value 120.
- `radar-reject-02`: 3 axes, a curve with 2 values.
- `radar-reject-03`: `curve c{zz: 1}` (unknown axis).
- `radar-reject-04`: two axes with id `m`.
- `radar-reject-05`: `min 5` and `max 5`.
- `radar-reject-06`: `curve c{1, 2` (unclosed).
- `radar-reject-07`: `curve c{1, b: 2}` (plain and keyed values).
- `radar-reject-08`: `radar` header (not a v12.2.0 keyword).
- `radar-reject-09`: an axis id `circles`.
- `radar-reject-10`: a one-word 50-letter axis label, at 60 columns.

### treemap

**Tier:** 2 (gated). **Header:** `treemap-beta` or `treemap` (v12.2.0's grammar has `TREEMAP_KEYWORD: 'treemap-beta' | 'treemap'`; one type).

**Supported subset:**

```text
title <text>
<indent>"<name>"               a section
<indent>"<name>": <value>      a leaf; `,` may replace `:`, as the grammar allows
  name   "…" or '…'
  value  [0-9]+(\.[0-9]+)?
```

A row's parent is the nearest earlier row with less indentation, which must be a section; a row with no such row is top-level. Indentation is spaces only or tabs only, measured in characters. Names may repeat. A `:::name` after a name or a value, and `classDef`, are ignored (common rule 4). Config (`valueFormat`, `showValues`, …) is ignored; values print as written.

**Not supported (falls back):** a row indented under a leaf; spaces and tabs mixed in indentation; a value with `,` or `_` (the grammar's `NUMBER2` allows them, but the docs don't say what they mean); a negative value (`NUMBER2` has no sign, so Mermaid can't lex `-5`).

**Text design** (docs' Hierarchical example, W = 20):

```text
Products        ████████████████████ 180
  Electronics   ███████████▏         100
    Phones      █████▌                50
    Computers   ███▍                  30
    Accessories ██▎                   20
  Clothing      ████████▉             80
    Men's       ████▌                 40
    Women's     ████▌                 40
```

- One row per node, in source order, indented 2 cells per depth.
- A row: the indented name padded to the widest indented name `N`, a space, the bar field `W`, a space, and the value right-aligned to the widest value `V`.
- Each top-level node and its subtree take one series color, for bars and section names; leaf names are `label`; values `value`.

**Numbers:** a section's value is the sum of its leaves, printed with as many decimals as its most precise leaf. `M` is the sum of the top-level values. A bar is `round(8·v/M·W)` eighth-cells, so it shows its node's share of the whole map. A zero leaf draws no bar and prints its value as written (common rule 8); an empty section draws no bar and prints its sum, `0` with its leaves' decimals. `M = 0` falls back.

**Collisions and narrow widths:** each node owns a row, so nothing collides. A row is `N + W + V + 2` cells. Ladder:
1. `W = min(60, columns − N − V − 2)`, if that is at least 10.
2. `W = 10`; names wrap to `columns − V − 12` cells, indentation included.
3. Fall back.

**Required fixtures** (60, 80 and 120 columns):
- `treemap-ok-01`: docs' Hierarchical example. At 80 and 120 (W = 60): Products 480 eighths, Electronics 267, Phones 133, Computers 80, Accessories 53, Clothing 213, Men's and Women's 107 each. At 60, W = 40.
- `treemap-ok-02`: docs' Basic example: `M` = 70; Category A 30, Category B 40.
- `treemap-ok-03`: `treemap` header; `title`; a top-level leaf; `,` separator; single quotes; `%%` comments.
- `treemap-ok-04`: docs' percentage example (`valueFormat` ignored): leaves 0.35, 0.25, 0.15, 0.25; `Market Share` prints `1.00`.
- `treemap-ok-05`: a zero leaf and an empty section draw no bar and print `0`.
- `treemap-ok-06`: tab indentation; a row at 1 tab after rows at 2 and 3 tabs joins the nearest shallower row; repeated names.
- `treemap-ok-07`: CJK names.
- `treemap-ok-08`: a natural row of exactly 60 cells at W = 10: step 1 at 60, step 2 at 59.
- `treemap-ok-09`: wrapped names; step 2 first fits at 60.
- `treemap-ok-10`: docs' styling example (`"Section 1.2":::class1`, `"Leaf 2.1": 20:::class1`, `classDef class1 …`): `:::name` and `classDef` parsed and ignored (common rule 4). Section 1 is 24, Section 1.2 is 12, Section 2 is 57; `M` = 81.
- `treemap-ok-11`: valid map, then `accTitle: Budget`: parsed and ignored (common rule 4); the drawing is unchanged.
- `treemap-ok-12`: decimal zero: `"Z": 0.00` and `"P": 1`; `M = 1`; Z draws no bar and prints `0.00`, as written.

**Rejection fixtures:**
- `treemap-reject-01`: a row indented under a leaf.
- `treemap-reject-02`: spaces and tabs mixed in indentation.
- `treemap-reject-03`: `"A": 1,000`.
- `treemap-reject-04`: `"A": -5` (Mermaid can't lex it).
- `treemap-reject-05`: `A: 5` (unquoted name).
- `treemap-reject-06`: every leaf 0 (`M = 0`).
- `treemap-reject-07`: a one-word 50-letter name, at 60 columns.

## Part C — other types

Sources and shared behavior are in the Common rules and their end-cap table; each section below only adds to them.

### mindmap

**Tier:** 1. **Header:** `mindmap` (common rule 2). No aliases.

**Supported subset:**

```text
mindmap
<indent>node                 one per line; the first is the root
node = text | id[text] | id(text) | id((text))
     | id))text(( | id)text( | id{{text}}
     | any shape without id, e.g. [text]
     | id["quoted (text)"]
<br>, <br/> or <br /> in text breaks the line
%% whole-line comment
```

A node's parent is the nearest earlier node with less indentation. Blank lines, comments and the title follow common rules 2 and 3. Honored config key: `colorBy`.

**Not supported:** `::icon()`, markdown strings, mismatched delimiters (`id[x)`), HTML except `<br>`, a second root. Trailing `%%` and text after the header fall back (common rule 2).

`:::class`: ignored (common rule 4).

**Text design:** the root is leftmost. Children stack rightward in source order: the first on its parent's first row (`─┬─`, or `───` if alone), the rest via `├─`/`└─` on a `│` trunk. Nodes are pills with caps per the common table; the default shape is plain. The root takes the node role. Each top-level branch takes the next series color for its subtree and connectors (each depth does, under `colorBy: depth`).

**Collisions and narrow widths:** subtrees own disjoint rows, so nothing collides. Ladder: (1) one column per sibling group; (2) children right after their parent; (3) wrapped labels; (4) indented outline; then fall back.

**Required fixtures:**
- `mindmap-ok-01`: docs Root/A/B/C.
- `mindmap-ok-02`: all seven shapes; in mono, each shows its distinct caps from the common table.
- `mindmap-ok-03`: id-less shapes; quoted brackets.
- `mindmap-ok-04`: a `<br/>` parent with children.
- `mindmap-ok-05`: docs unclear indentation.
- `mindmap-ok-06`: comments, blank lines, title.
- `mindmap-ok-07`: duplicate texts both render.
- `mindmap-ok-08`: CJK labels.
- `mindmap-ok-09`: exactly 60 columns at step 1; 59 takes step 2.
- `mindmap-ok-10`, `mindmap-ok-11`, `mindmap-ok-12`: first fit at 60 for steps 2, 3, 4.
- `mindmap-ok-13`: `colorBy: depth`.
- `mindmap-ok-14`: valid tree, then `:::urgent`; class parsed and ignored.

**Rejection fixtures:**
- `mindmap-reject-01`: valid tree, then `::icon(fa fa-book)`.
- `mindmap-reject-02`: second root.
- `mindmap-reject-03`: `id[Square)`.
- `mindmap-reject-04`: markdown string.
- `mindmap-reject-05`: header only.
- `mindmap-reject-06`: unbreakable 61-column label, at 60.
- `mindmap-reject-07`: HTML other than `<br>`, `<b>bold</b>`.
- `mindmap-reject-08`: a trailing `%% note` after a node.
- `mindmap-reject-09`: text after the header, `mindmap extra`.

### gitGraph

**Tier:** 1. **Header:** `gitGraph`, `gitGraph:` or `gitGraph LR:`/`TB:`/`BT:` (common rule 2). No aliases.

**Supported subset:**

```text
commit [id: "x"] [msg: "m" | "m"] [tag: "t"]… [type: NORMAL|REVERSE|HIGHLIGHT]
branch name [order: N]     name = \w([-./\w]*[-\w])? or "quoted"
checkout name | switch name
merge name [id: "x"] [tag: "t"]… [type: …]
cherry-pick id: "x" [parent: "p"] [tag: "t"]…
title Text
%% whole-line comment
```

Attributes go in any order. The title follows common rule 3. Honored config keys: `mainBranchName`, `mainBranchOrder`.

**Not supported:** a repeated attribute other than `tag:`; a repeated commit id (Mermaid silently overwrites the first); anything Mermaid's db throws on: an unknown or existing branch, merging itself, an empty branch or the same head, a reused merge id, an invalid cherry-pick. A second title falls back (common rule 3).

`accTitle` and `accDescr`: ignored (common rule 4).

**Text design:** one row per event: branch start, commit, merge or cherry-pick. Time runs down; `BT` reverses events and flips glyphs vertically. Branches are lanes 2 cells apart, stably sorted by `order:` (absent is 0; main takes `mainBranchOrder`). Lanes run to the end: main opens with `╷`; a branch forks `├─╮` or `╭─┤` from its parent's head (no fork if that is empty). Commit `●`, REVERSE `⊗`, HIGHLIGHT `■`, merge `◉` (or its `type:` glyph) joined by `─┤`/`├─` from the merged lane, cherry-pick `◎`. One label column right of the lanes holds the branch name on its start row, `id: msg [tag]…` on commits, and a cherry-pick's tags (Mermaid's default is `cherry-pick:<id>`). Each lane takes a series color, shared by its glyphs, name and fork; a merge connector takes the merged lane's. Ids and messages take the label role, tags the note role.

**Collisions and narrow widths:** one event per row, so nothing collides. A connector crossing a lane draws `┼`, never a junction. Ladder: (1) natural; (2) wrapped labels; then fall back.

**Required fixtures:**
- `gitGraph-ok-01`: ids, all three types, tags (docs).
- `gitGraph-ok-02`: branch, checkout, `switch`, merge (docs).
- `gitGraph-ok-03`: merge with id, tag and type, crossing a lane.
- `gitGraph-ok-04`: cherry-picks of a commit and of a merge with `parent:` (docs).
- `gitGraph-ok-05`: docs `order:` example with `mainBranchOrder: 2`; `mainBranchName`.
- `gitGraph-ok-06`: headers `gitGraph:`, `LR:`, `TB:`, `BT:`.
- `gitGraph-ok-07`: quoted and `feature/x.y` names; `msg:` and bare messages; `title`; a comment.
- `gitGraph-ok-08`: a branch made before main's first commit.
- `gitGraph-ok-09`: CJK branch names, ids and tags.
- `gitGraph-ok-10`: exactly 60 columns at step 1; 59 wraps.
- `gitGraph-ok-11`: valid graph, then `accTitle: Log`; accTitle parsed and ignored.
- `gitGraph-ok-12`, `-13`, `-14`: headers `gitGraph:`, `gitGraph LR:` and `gitGraph TB:`, each drawn as `gitGraph`.
- `gitGraph-ok-15`: a cherry-pick with an explicit `tag:`, which replaces `cherry-pick:<id>`.

**Rejection fixtures:**
- `gitGraph-reject-01`: `checkout` of an unknown branch.
- `gitGraph-reject-02`: `merge` of a branch with no commits.
- `gitGraph-reject-03`: `branch develop` twice.
- `gitGraph-reject-04`: docs MetroLine example (id `Boston` twice).
- `gitGraph-reject-05`: cherry-pick of a merge without `parent:`.
- `gitGraph-reject-06`: `commit type: BOLD`.
- `gitGraph-reject-07`: 30 branches at 60 columns.
- `gitGraph-reject-08`: a repeated attribute, `commit id: "a" id: "b"`.
- `gitGraph-reject-09`: two `title` lines.
- `gitGraph-reject-10`: a merge reusing an existing id.
- `gitGraph-reject-11`: `merge nope` (an unknown branch).
- `gitGraph-reject-12`: `merge main` on main (a self merge).
- `gitGraph-reject-13`: a merge from a branch with no commits.
- `gitGraph-reject-14`: `cherry-pick id: "zz"` (an unknown id).
- `gitGraph-reject-15`: a cherry-pick of a commit on the current branch.
- `gitGraph-reject-16`: a cherry-pick onto a branch with no commits.
- `gitGraph-reject-17`: a cherry-pick of an ordinary commit with a `parent:` that is not its parent.
- `gitGraph-reject-18`: `branch b`, `commit`, `checkout main`, `merge b`: main has no commits, as Mermaid's branch map starts `main → null`.
- `gitGraph-reject-19`: a cherry-pick of a merge commit with a `parent:` that is not its direct parent (`gitGraph-ok-04` with `parent: "ZERO"`).

### timeline

**Tier:** 1. **Header:** `timeline`, `timeline LR` or `timeline TD` (common rule 2). No aliases.

**Supported subset:**

```text
timeline [LR|TD]
title Text
section Name                no ':'
Period                      no '#' or ':'
Period : event [: event]…   ': ' splits; '10:30' does not
       : event              adds to the last period
<br>, <br/> or <br /> breaks a line
%% whole-line comment
```

The title follows common rule 3. Honored config key: `disableMulticolor`. As in Mermaid, it applies only when there are no sections: then every period takes `s1`, and sections keep their colors.

**Not supported:** HTML except `<br>`; an event before any period (Mermaid throws); a period before the first `section` (Mermaid drops it); a repeated section name (Mermaid draws its periods twice). Trailing `%%` (common rule 2) and a second title, from a statement or frontmatter (common rule 3), fall back.

`accTitle` and `accDescr`: ignored (common rule 4).

**Text design:** `LR` gives one column per period, in source order. Rows: the title; section names, each spanning its periods' columns; period pills; an axis row of `─` with `●` at each column's start; then events in source order, one row per line. `TD` gives a left axis: `●` and the period pill on one row, then `│` and the indented events; a section name takes its own row before its first period. Each section takes the next series color for its name, pills, dots and events. Without sections, each period takes one, or all share the first under `disableMulticolor`. The title row follows the common rules; the axis takes the edge role.

**Collisions and narrow widths:** columns are disjoint, so nothing collides. A section name wider than its span widens its last column. Ladder for `LR`: (1) natural, gap 2; (2) gap 1; (3) wrapped labels, all columns capped at the largest common width that fits; (4) redrawn as `TD`. `TD` wraps as needed. A word wider than its column falls back (common rule 6).

**Required fixtures:**
- `timeline-ok-01`: docs social media example; `: Google` continuation.
- `timeline-ok-02`: `2004 : Facebook : Google`; an event containing `10:30`.
- `timeline-ok-03`: docs Industrial Revolution sections.
- `timeline-ok-04`: `<br>` in a section, a period and an event.
- `timeline-ok-05`: a period without events; two periods with the same text.
- `timeline-ok-06`: `timeline TD`.
- `timeline-ok-07`: `timeline LR`; comments; frontmatter title.
- `timeline-ok-08`: `disableMulticolor: true`.
- `timeline-ok-09`: CJK periods and events.
- `timeline-ok-10`: exactly 60 columns at step 1; 59 takes step 2.
- `timeline-ok-11`, `timeline-ok-12`: first fit at 60 at steps 3 and 4.
- `timeline-ok-13`: valid timeline, then `accTitle: History`; accTitle parsed and ignored.
- `timeline-ok-14`: CJK period labels, `2001年` and `2002年`.

**Rejection fixtures:**
- `timeline-reject-01`: an event before any period.
- `timeline-reject-02`: a period before the first `section`.
- `timeline-reject-03`: `section Bronze Age` twice.
- `timeline-reject-04`: `2002 :LinkedIn` (no space after the colon).
- `timeline-reject-05`: `C# 1.0 : released` (`#` starts a comment).
- `timeline-reject-06`: two `title` lines.
- `timeline-reject-07`: an unbreakable 61-column event, at 60.
- `timeline-reject-08`: HTML other than `<br>` in an event.
- `timeline-reject-09`: a trailing `%%` after an event.
- `timeline-reject-10`: a frontmatter `title` and a `title` statement.

### kanban

**Tier:** 2. **Header:** `kanban` (common rule 2). No aliases.

**Supported subset:**

```text
kanban
<indent>column             the first node's indent is the column level
<deeper>card [@{ meta }]   any deeper indent is a card
node = text | id[text] | [text] | id["quoted [text]"]
meta = assigned: v, ticket: v, priority: v   any subset, one line, v bare or quoted
priority = Very High | High | Low | Very Low
%% whole-line comment
```

The title follows common rule 3. No config key is honored; `ticketBaseUrl` is ignored (no links).

**Not supported:** other delimiters (`(…)`, `{{…}}`, …); `::icon()`; other meta keys (`label`, `icon`, `shape`); multi-line meta or meta on a column; markdown markup (`*`, `` ` ``, `_` at a word edge); HTML; a node shallower than the column level (Mermaid throws or misfiles it); a repeated column id, explicit or taken from its text (Mermaid draws its cards twice). Trailing `%%` falls back (common rule 2).

`:::class`: ignored (common rule 4).

**Text design:** grouping: a node at the column level starts a column; every deeper node is a card in the latest column, flattened as Mermaid does. Order: columns left to right, then band by band; cards top to bottom; all in source order. Each column is a frame in the next series color (common rule 9), titled in its top border (`┌ Todo ───┐`); a title too wide for the frame continues on its first interior rows. Frames in a band share the tallest height. A card is a node-role pill whose first line starts with `•`; wrapped lines indent 2. Its meta follows on one row, `ticket · assigned · priority`, in the note role.

**Collisions and narrow widths:** frames are disjoint, so nothing collides. Ladder: (1) one band at natural widths, gap 1; (2) one band, columns capped at the largest common width that fits, text wrapped; (3) bands of k columns, the largest k for which step 1 or 2 fits every band; then fall back.

**Required fixtures:**
- `kanban-ok-01`: docs overview (`column1[Column Title]`, one task).
- `kanban-ok-02`: bare `Todo` and `[In progress]` columns; quoted text; an empty column.
- `kanban-ok-03`: each meta key alone; all four priorities; bare and quoted values.
- `kanban-ok-04`: docs full example (long card, card id `id3` reused).
- `kanban-ok-05`: cards at mixed deeper indents, flattened.
- `kanban-ok-06`: comments, blank lines, frontmatter title, `ticketBaseUrl`.
- `kanban-ok-07`: CJK titles and cards.
- `kanban-ok-08`: exactly 60 columns at step 1; 59 takes step 2.
- `kanban-ok-09`, `kanban-ok-10`: first fit at 60 at step 3 with k = 2 and k = 1.
- `kanban-ok-11`: a title wrapping inside its frame.

**Rejection fixtures:**
- `kanban-reject-01`: valid board, then `::icon(fa fa-bug)`.
- `kanban-reject-02`: two bare `Todo` columns (same id).
- `kanban-reject-03`: `@{ priority: 'Medium' }`.
- `kanban-reject-04`: `@{ label: 'Other' }`.
- `kanban-reject-05`: `id[Task` with no `]`.
- `kanban-reject-06`: a node shallower than the first column.
- `kanban-reject-07`: `[**Urgent** fix]`.
- `kanban-reject-08`: an unbreakable 61-column word, at 60.

### block

**Tier:** 2. **Header:** `block-beta` or `block` (common rule 2). One type; the keywords are aliases.

**Supported subset:**

```text
columns N | columns auto       N ≥ 1; one per level, applies to the whole level
id[:N] | id SHAPE[:N]          a bare id is its own label; N ≥ 1 cells
SHAPE = ["t"] ("t") (("t")) ((("t"))) (["t"]) [["t"]] [("t")]
        {"t"} {{"t"}} >"t"] [/"t"/] [\"t"\] [/"t"\] [\"t"/]
id<["t"]>(dir[, dir]…)         block arrow; dir = right left up down x y
space[:N]
block … end | block:id[:N] … end      composite, nestable
a LINK b | a -- "t" --> b      LINK = --- --> ==> === -.-> -.-, ends x o <
%% whole-line comment
```

Statements may share a line. An id's first appearance, edges included, places it in that level's grid; a later mention may give a bare block its shape and label. The title follows common rule 3. No config key is honored.

**Not supported:** markdown strings, HTML, entities; unquoted labels; `~~~`; chains `a --> b --> c` (Mermaid mislinks them); a labeled composite; a second `columns` in one level; changing an existing shape or label (Mermaid overwrites it); the id `end`, or ids starting with `block`, `space`, `default`, `linkStyle` or `interpolate` (Mermaid lexes them as keywords).

`style`, `classDef` and `class`: ignored (common rule 4).

**Text design:** each level is a grid of `columns` cells per row (`auto`: one row), filled in source order. A block spans min(N, cells left in its row), as Mermaid clamps it. A level's cells share the smallest width that fits every block (k cells plus k−1 gaps for a k-cell block); grid rows are one gap row apart. Blocks are pills with caps per the common table; the diamond takes the decision role. A block arrow is an arrow-role pill with caps per the common table's block arrow row; several directions join their caps in the order right, left, up, down (`x` is left and right, `y` is up and down). `space` cells stay blank. A composite is an untitled frame (Mermaid shows no id) in the next series color. Edges route orthogonally through the gaps, with spec A's router, ends and labels.

**Collisions and narrow widths:** the grid fixes every block, and edges use only gaps, widened for extra tracks. Ladder: (1) natural, gap 2; (2) gap 1; (3) wrapped labels, cells capped at the largest width that fits; then fall back.

**Required fixtures:**
- `block-ok-01`: header `block`; docs `a b c` (auto columns, one row).
- `block-ok-02`: header `block-beta`; docs `columns 3` / `a b c d`.
- `block-ok-03`: docs `a["A label"] b:2 c:2 d`; a `:3` block clamped at its row's end.
- `block-ok-04`: docs composites: anonymous, `block:group1:2` with `columns 2`, nested.
- `block-ok-05`: all 14 shapes; in mono, each shows its distinct caps from the common table.
- `block-ok-06`: the docs' seven block arrows.
- `block-ok-07`: `space` and `space:3`.
- `block-ok-08`: `-->`, `-- "X" -->`, `==>`, `-.->`, `x` and `o` ends; an edge to a composite.
- `block-ok-09`: docs `id1 space id2`, then `id1("Start")-->id2("Stop")`, minus `style`; comments; title.
- `block-ok-10`: CJK labels.
- `block-ok-11`: exactly 60 columns at step 1; 59 takes step 2.
- `block-ok-12`: first fit at 60 at step 3.
- `block-ok-13`: valid grid, then `style B fill:#969` (docs); style parsed and ignored.
- `block-ok-14`: valid grid, then `classDef blue …` and `class A blue` (docs); classDef and class parsed and ignored.

**Rejection fixtures:**
- `block-reject-01`: docs `A - B`.
- `block-reject-02`: `a["x"]`, later `a["y"]`.
- `block-reject-03`: `a --> b --> c`.
- `block-reject-04`: `id[unquoted text]`.
- `block-reject-05`: block id `spaceship`.
- `block-reject-06`: an unbreakable 61-column label, at 60.

### packet

**Tier:** 2. **Header:** `packet-beta` or `packet` (common rule 2). One type; the keywords are aliases.

**Supported subset:**

```text
packet
start: "label"            one bit
start-end: "label"
+bits: "label"            starts after the previous field
title Text
%% whole-line comment
```

Labels use `"…"` or `'…'`. The title follows common rule 3. Honored config keys: `bitsPerRow`, `bitOrder`; `showBits` is ignored.

**Not supported:** backslash escapes in labels. Trailing `%%` (common rule 2) and a second title (common rule 3) fall back.

`accTitle` and `accDescr`: ignored (common rule 4).

**Numbers:** bit numbers are integers. Fields start at bit 0 and are contiguous; Mermaid throws on a gap, an overlap, `end < start` or `+0`. A packet past Mermaid's 10,000-row cap falls back (Mermaid truncates it). Bit numbers are positions (common rule 10), shown by the ruler and gutter, not printed per field.

**Text design:** a ruler row marks every 8th bit offset. Each row of `bitsPerRow` bits (default 32) is one text row, its first bit number in a left gutter as wide as the largest such number plus a space. Each bit is c columns. A field spans its bits and opens with `│`; the row closes with `│`; a partial last row ends at its last field. `bitOrder: descending` mirrors each row and the ruler, padding a partial row on the left. Labels are centered. A field crossing a row edge is split: its widest part (first on ties) holds the label, the others `…`. Fields take series colors in source order (common rule 9); ruler and gutter take the label role, `│` the frame role, and the title row follows the common rules.

**Collisions and narrow widths:** if any label is wider than its field's interior, every field is shown by its key, in its field's color, and the legend lists all labels (common rule 7, all or none). c is the smallest value ≥ 2 that fits; with keys, the fewest keyed rows wins. Ladder: (1) rows of `bitsPerRow` bits; (2) rows of half that, rounded up; then fall back. A key wider than its field falls back.

**Required fixtures:**
- `packet-ok-01`: docs TCP example: frontmatter title; the 1-bit flags are too narrow for their labels, so all fields are keyed (rule 7); step 2 at 60.
- `packet-ok-02`: docs UDP example: `title`; `+16` mixed with ranges.
- `packet-ok-03`: header `packet-beta`; single-bit fields; `24-39` split at a row edge.
- `packet-ok-04`: docs `bitOrder: descending` example (`bitsPerRow: 16`) plus a partial row.
- `packet-ok-05`: two `Reserved` fields; single-quoted labels; a whole-line comment.
- `packet-ok-06`: CJK labels; one too wide, so all fields are keyed.
- `packet-ok-07`: `bitsPerRow: 28`, 112 bits: exactly 60 columns at step 1; 59 takes step 2.
- `packet-ok-08`: valid fields, then `accTitle: TCP`; accTitle parsed and ignored.
- `packet-ok-09`: key/label collision. `bitsPerRow: 28` at 60 columns with `0: "Long label"`, `1: "a"`, `2-27: "Rest"`: all three fields are keyed (`a`, `b`, `c`) and the legend lists `a Long label`, `b a`, `c Rest`, so swapping the first two labels changes the legend.

**Rejection fixtures:**
- `packet-reject-01`: `0-15: Source Port` (unquoted).
- `packet-reject-02`: a gap: `0-15`, then `20-31`.
- `packet-reject-03`: an overlap: `0-15`, then `8-23`.
- `packet-reject-04`: `16-8: "Bad"`.
- `packet-reject-05`: `+0: "Empty"`.
- `packet-reject-06`: a first field at bit 1.
- `packet-reject-07`: `bitsPerRow: 128`, at 60 columns.
- `packet-reject-08`: `0-399999: "Huge"` (12,500 rows).

### zenuml

**Tier:** 2. **Header:** `zenuml` (common rule 2; the detector is in `packages/mermaid-zenuml`). No aliases.

**Status: subset TBD by implementation.** ZenUML is an external DSL. Its grammar is in `@zenuml/core` (^3.47.9, a dependency of `@mermaid-js/mermaid-zenuml` 1.0.1), not in these sources. The candidate subset below uses only forms shown in Mermaid's zenuml doc. Before enabling the type, the implementation pins identifier, text and whitespace rules against that grammar; anything it cannot pin falls back. Until then `zenuml` falls back.

**Supported subset (candidate):**

```text
zenuml
title Text
Name | A as Alice | @Actor Alice      participants
A->B: text                           async message
Src->A.method(args) [{ … }]          sync call; { … } is its call block
A.method | A.method(args) [{ … }]    sync call inside a call block
return text                          reply, inside a call block
while(cond) { … }
if(c) { … } [else if(c) { … }]… [else { … }]
opt { … }
par { … }
```

The title follows common rule 3. No config key is honored.

**Not supported:** other annotators (`@Database`, …; the doc lists them only as an image); `new`; assignments (`a = A.m()`); `@return`/`@reply`; `try`/`catch`/`finally`; `//` comments; `for`, `forEach`, `foreach`, `loop` (no example in the doc); a sync call or `return` with no source (outside every call block); a participant given two labels.

**Text design:** parsed into spec A's sequence model and drawn with its layout, glyphs and colors. Participants keep their order of first appearance, as ZenUML does. A sync call is a solid arrow from `Src`, or from the target of the innermost enclosing call, labeled `method(args)` as written; its call block activates the target. `return t` is a dotted arrow from the innermost enclosing call's target back to that call's source. `A->B: t` is a solid line with spec A's async end. `while` becomes `loop` and `if`/`else` becomes `alt`/`else`, labeled with their conditions; `opt` and `par` are one-section frames.

**Collisions and narrow widths:** as spec A's sequence diagrams: (1) natural; (2) tighter gaps; (3) wrapped labels; then fall back.

**Required fixtures:**
- `zenuml-ok-01`: docs "Demo": `title`, participants from messages, async messages.
- `zenuml-ok-02`: docs declared order (`Bob`, then `Alice`).
- `zenuml-ok-03`: docs aliases `A as Alice`, `J as John`.
- `zenuml-ok-04`: `@Actor Alice` (docs annotators without `@Database`).
- `zenuml-ok-05`: docs reply example without the comment, `@return` and `A->Client: x11`.
- `zenuml-ok-06`: docs sync forms `B.SyncMessage` and `B.SyncMessage(with, parameters) { … }`, and a nested async `B->C:`, inside `Client->A.run() { … }`.
- `zenuml-ok-07`: docs loop (`while(true)`).
- `zenuml-ok-08`: docs alt (`if(is_sick)` … `else`), plus an `else if`.
- `zenuml-ok-09`: docs opt and par examples.
- `zenuml-ok-10`: CJK frontmatter title and message text.
- `zenuml-ok-11`: exactly 60 columns at step 1; 59 takes step 2.

**Rejection fixtures:**
- `zenuml-reject-01`: valid diagram, then `new A1`.
- `zenuml-reject-02`: docs annotators example (`@Database Bob`).
- `zenuml-reject-03`: docs try/catch/finally example.
- `zenuml-reject-04`: valid diagram plus one `// comment` line.
- `zenuml-reject-05`: docs top-level `A.SyncMessage` (no source).
- `zenuml-reject-06`: an unclosed `{`.
- `zenuml-reject-07`: `A as Alice`, then `A as Alicia`.
- `zenuml-reject-08`: `a = A.SyncMessage()`.
- `zenuml-reject-09`: an unbreakable 61-column message, at 60.

## Coverage

| type | feature | fixture IDs |
|---|---|---|
| flowchart | header `flowchart TD` | flowchart-ok-01 |
| flowchart | header `flowchart TB` | flowchart-ok-02 |
| flowchart | header `flowchart BT` | flowchart-ok-03 |
| flowchart | header `flowchart LR` | flowchart-ok-04 |
| flowchart | header `flowchart RL` | flowchart-ok-05 |
| flowchart | header alias `graph` | flowchart-ok-06 |
| flowchart | shape rectangle `[ ]` | flowchart-ok-07 |
| flowchart | shape round `( )` | flowchart-ok-08 |
| flowchart | shape stadium `([ ])` | flowchart-ok-09 |
| flowchart | shape subroutine `[[ ]]` | flowchart-ok-10 |
| flowchart | shape cylinder `[( )]` | flowchart-ok-11 |
| flowchart | shape circle `(( ))` | flowchart-ok-12 |
| flowchart | shape rhombus `{ }` | flowchart-ok-13 |
| flowchart | shape hexagon `{{ }}` | flowchart-ok-14 |
| flowchart | shape parallelogram `[/ /]`, `[\ \]` | flowchart-ok-15 |
| flowchart | shape trapezoid `[/ \]`, `[\ /]` | flowchart-ok-16 |
| flowchart | shape asymmetric `> ]` | flowchart-ok-17 |
| flowchart | shape double circle `((( )))` | flowchart-ok-18 |
| flowchart | `@{ shape: … }` known name | flowchart-ok-19 |
| flowchart | `@{ shape: rect }` draws a rectangle | flowchart-ok-20 |
| flowchart | quoted label | flowchart-ok-21 |
| flowchart | `<br/>` label, one row per line | flowchart-ok-22 |
| flowchart | edge solid `-->` | flowchart-ok-23 |
| flowchart | edge dotted `-.->` | flowchart-ok-24 |
| flowchart | edge thick `==>` | flowchart-ok-25 |
| flowchart | edge bidirectional `<-->` | flowchart-ok-26 |
| flowchart | edge end circle `--o` | flowchart-ok-27 |
| flowchart | edge end cross `--x` | flowchart-ok-28 |
| flowchart | edge end none `---` | flowchart-ok-29 |
| flowchart | edge label `-->\|x\|` | flowchart-ok-30 |
| flowchart | edge label `-- x -->` | flowchart-ok-31 |
| flowchart | chained edges | flowchart-ok-32 |
| flowchart | `&` fan-out and fan-in | flowchart-ok-33 |
| flowchart | nested subgraphs | flowchart-ok-34 |
| flowchart | titled subgraph | flowchart-ok-35 |
| flowchart | per-subgraph `direction` | flowchart-ok-36 |
| flowchart | `%%` comments | flowchart-ok-37 |
| flowchart | frontmatter `title` | flowchart-ok-38 |
| flowchart | `classDef`/`style`/`class`/`linkStyle`/`click` ignored | flowchart-ok-39 |
| flowchart | CJK width | flowchart-ok-40 |
| flowchart | 60-column fit boundary | flowchart-ok-41 |
| flowchart | ladder: tighter gaps | flowchart-ok-42 |
| flowchart | ladder: wrapped labels | flowchart-ok-43 |
| flowchart | ladder: LR redrawn as TD | flowchart-ok-44 |
| flowchart | identical text on distinct node ids | flowchart-ok-45 |
| flowchart | invisible link `~~~` (layout only, never drawn) | flowchart-ok-46 |
| flowchart | edge IDs `e1@-->` and `e1@{ animate: true }` ignored | flowchart-ok-47 |
| flowchart | `:::name` ignored | flowchart-ok-48 |
| flowchart | `accTitle`/`accDescr` ignored | flowchart-ok-48 |
| flowchart | bare header defaults to `TB` | flowchart-ok-49 |
| flowchart | thick bend: heavy corners | flowchart-ok-50 |
| flowchart | light/heavy mixed junction | flowchart-ok-51 |
| flowchart | dotted bend: light corner | flowchart-ok-52 |
| flowchart | text-form two-headed links `<-- t -->`, `<-. t .->`, `<== t ==>` | flowchart-ok-53 |
| flowchart | mixed end marks `<--o`, `x-->`: only the head, as Mermaid draws | flowchart-ok-54 |
| flowchart | partly quoted labels `["a" b]` drawn as `a b` | flowchart-ok-55 |
| flowchart | `#…;` codes `#35;`, `#quot;`, `#9829;` drawn as their characters | flowchart-ok-56 |
| flowchart | `@{ … }` split over lines | flowchart-ok-57 |
| flowchart | Markdown strings with no emphasis | flowchart-ok-58 |
| flowchart | Markdown bold and italic in a node, edge label and `@{ label }`, drawn bold and italic | flowchart-ok-59 |
| sequence | header `sequenceDiagram` | sequence-ok-01 |
| sequence | `participant` | sequence-ok-01 |
| sequence | `actor` | sequence-ok-02 |
| sequence | alias `as` | sequence-ok-03 |
| sequence | message `->>` | sequence-ok-04 |
| sequence | message `-->>` | sequence-ok-05 |
| sequence | message `->` | sequence-ok-06 |
| sequence | message `-->` | sequence-ok-07 |
| sequence | message `-x` | sequence-ok-08 |
| sequence | message `--x` | sequence-ok-09 |
| sequence | message `-)` | sequence-ok-10 |
| sequence | message `--)` | sequence-ok-11 |
| sequence | message label | sequence-ok-04 |
| sequence | self-message | sequence-ok-12 |
| sequence | `+`/`-` activations | sequence-ok-13 |
| sequence | note `left of` | sequence-ok-14 |
| sequence | note `right of` | sequence-ok-15 |
| sequence | note `over` one participant | sequence-ok-16 |
| sequence | note `over` two participants | sequence-ok-17 |
| sequence | frame `alt`/`else` | sequence-ok-18 |
| sequence | frame `opt` | sequence-ok-19 |
| sequence | frame `loop` | sequence-ok-20 |
| sequence | frame `par`/`and` | sequence-ok-21 |
| sequence | frame `critical`/`option` | sequence-ok-22 |
| sequence | frame `break` | sequence-ok-23 |
| sequence | nested frames | sequence-ok-24 |
| sequence | `autonumber` | sequence-ok-25 |
| sequence | CJK width | sequence-ok-26 |
| sequence | 60-column fit boundary | sequence-ok-27 |
| sequence | ladder: tighter gaps | sequence-ok-28 |
| sequence | ladder: wrapped labels | sequence-ok-29 |
| sequence | identical text on distinct participant ids | sequence-ok-30 |
| sequence | `activate`/`deactivate` | sequence-ok-31 |
| sequence | `autonumber <start> <step>` | sequence-ok-32 |
| sequence | `rect` frame, color ignored | sequence-ok-33 |
| sequence | nested `rect` | sequence-ok-33 |
| sequence | `box` group frame with title, color ignored | sequence-ok-34 |
| sequence | `create participant` | sequence-ok-35 |
| sequence | `create actor … as …` | sequence-ok-35 |
| sequence | `destroy` | sequence-ok-35 |
| sequence | message `<<->>` | sequence-ok-36 |
| sequence | message `<<-->>` | sequence-ok-37 |
| sequence | base design: actor vs participant caps, lifelines, self-message, activation, note | sequence-ok-38 |
| sequence | `title` statement; a second title falls back | sequence-ok-39, sequence-reject-08 |
| sequence | `;` ends a statement, as in Mermaid 12.2.0 | sequence-ok-40 |
| sequence | `#` ends message, note and condition text; the rest of the line is a comment | sequence-ok-41 |
| sequence | `autonumber` restart, `off` and on again | sequence-ok-42 |
| sequence | keyword and number participant ids where Mermaid reads ids | sequence-ok-43 |
| sequence | `#` in a box line is a comment; box color is the label's first word-character run | sequence-ok-44 |
| sequence | `activate`/`deactivate`/`destroy` do not order participants | sequence-ok-45 |
| sequence | bare `rect` | sequence-ok-46 |
| sequence | nested `rect` inside a `box`, its border a blank column beyond the outer rect | sequence-ok-47, sequence-ok-49 |
| sequence | nested `rect` beside a `box`, clear of its border | sequence-ok-48 |
| sequence | a `rect` from one `box` into another, which would cross both borders, falls back | sequence-reject-09 |
| sequence | with a `box`, a frame whose Mermaid extent turns on text width (a self-message), takes in a deactivation beyond its run, or nests 10 deep, falls back | sequence-reject-10, sequence-reject-11, sequence-reject-12, sequence-reject-13 |
| sequence | with a `box`, a frame a wide note would widen over a lifeline beyond its run falls back | sequence-reject-14 |
| sequence | without a `box`, a frame covers exactly the lifelines Mermaid's does: a self-message or a note on one lifeline that would widen it over another falls back | sequence-reject-15, sequence-reject-16, sequence-reject-17 |
| state | header `stateDiagram-v2` | state-ok-01 |
| state | header `stateDiagram` | state-ok-02 |
| state | frontmatter `title` | state-ok-01 |
| state | state from a bare `id` line | state-ok-03 |
| state | `id : description` | state-ok-03 |
| state | `state "description" as id` | state-ok-03 |
| state | transition `-->` | state-ok-01 |
| state | transition label | state-ok-04 |
| state | `[*]` start and end, one each per scope | state-ok-05 |
| state | composite `state id { … }` | state-ok-06 |
| state | titled composite `state "…" as id { … }` | state-ok-07 |
| state | nested composites | state-ok-07 |
| state | `<<choice>>` | state-ok-08 |
| state | `<<fork>>`/`<<join>>` bars, TB | state-ok-09 |
| state | fork/join bars, LR | state-ok-10 |
| state | `[[choice]]`/`[[fork]]`/`[[join]]` | state-ok-11 |
| state | one-line note `left of`/`right of` | state-ok-12 |
| state | multi-line note `end note` | state-ok-13 |
| state | `--` concurrency regions | state-ok-14 |
| state | `direction` at root | state-ok-15 |
| state | `direction` in a composite | state-ok-15 |
| state | `%%` comments | state-ok-16 |
| state | `hide empty description`, `scale N width` (no effect) | state-ok-16 |
| state | CJK width | state-ok-17 |
| state | 60-column fit boundary | state-ok-18 |
| state | ladder: tighter gaps | state-ok-19 |
| state | ladder: wrapped labels | state-ok-20 |
| state | ladder: LR redrawn as TB | state-ok-21 |
| state | ladder: notes keyed with legend | state-ok-22 |
| state | identical descriptions on distinct ids | state-ok-23 |
| state | `classDef` ignored | state-ok-24 |
| state | `click` ignored | state-ok-25 |
| state | Markdown bold and italic in a description, transition, note and an id shown as its label | state-ok-26 |
| class | header `classDiagram` | class-ok-01 |
| class | header `classDiagram-v2` | class-ok-02 |
| class | frontmatter `title` | class-ok-01 |
| class | `class A` | class-ok-03 |
| class | class label `["…"]` | class-ok-03 |
| class | backtick class name | class-ok-03 |
| class | class created by a relation | class-ok-03 |
| class | members in `{ }` | class-ok-04 |
| class | member by `A : member` | class-ok-04 |
| class | attributes before methods, each in source order | class-ok-04 |
| class | visibility `+ - # ~` | class-ok-05 |
| class | method return type | class-ok-05 |
| class | `$` and `*` suffixes | class-ok-05 |
| class | generics `~T~` | class-ok-06 |
| class | annotation inline | class-ok-07 |
| class | annotation on its own line | class-ok-07 |
| class | annotation inside `{ }` | class-ok-07 |
| class | relation `<\|--` inheritance | class-ok-08 |
| class | relation `*--` composition | class-ok-09 |
| class | relation `o--` aggregation | class-ok-10 |
| class | relation `-->` association | class-ok-11 |
| class | relation `--` solid link | class-ok-12 |
| class | relation `..>` dependency | class-ok-13 |
| class | relation `..\|>` realization | class-ok-14 |
| class | relation `..` dashed link | class-ok-15 |
| class | reversed ends `--\|>`, `--*`, `--o` | class-ok-16 |
| class | two-way relation `<\|--\|>` | class-ok-17 |
| class | relation label | class-ok-18 |
| class | cardinality on one end | class-ok-19 |
| class | cardinality on both ends | class-ok-19 |
| class | `note "…"` | class-ok-20 |
| class | `note for A "…"` | class-ok-20 |
| class | note line breaks `<br>`, `\n` | class-ok-20 |
| class | `namespace N { … }` frame | class-ok-21 |
| class | `namespace N["label"]` | class-ok-21 |
| class | note inside a namespace | class-ok-21 |
| class | `direction` | class-ok-22 |
| class | `%%` comments | class-ok-22 |
| class | CJK width | class-ok-23 |
| class | 60-column fit boundary | class-ok-24 |
| class | ladder: tighter gaps | class-ok-25 |
| class | ladder: wrapped members | class-ok-26 |
| class | ladder: LR redrawn as TB | class-ok-27 |
| class | ladder: relation labels keyed with legend | class-ok-28 |
| class | identical labels on distinct classes | class-ok-29 |
| class | `click` ignored | class-ok-30 |
| class | `link`, `callback` ignored | class-ok-30 |
| class | `style` ignored | class-ok-31 |
| class | `classDef`, `cssClass`, `:::name` ignored | class-ok-31 |
| class | Markdown bold and italic in a label, relation label and note | class-ok-32 |
| er | header `erDiagram` | er-ok-01 |
| er | frontmatter `title` | er-ok-01 |
| er | entity with no relation | er-ok-02 |
| er | quoted and Unicode entity names | er-ok-02 |
| er | alias `e[Alias]`, `e["Alias"]` | er-ok-03 |
| er | attribute `type name` | er-ok-04 |
| er | keys `PK`, `FK`, `UK`, combined | er-ok-04 |
| er | attribute comment | er-ok-04 |
| er | optional type `?` | er-ok-04 |
| er | repeated blocks append; empty block | er-ok-05 |
| er | cardinality `\|o`/`o\|` as `0..1` | er-ok-06 |
| er | cardinality `\|\|` as `1` | er-ok-07 |
| er | cardinality `}o`/`o{` as `0..*` | er-ok-08 |
| er | cardinality `}\|`/`\|{` as `1..*` | er-ok-09 |
| er | word-form cardinalities | er-ok-10 |
| er | `to` and `optionally to` | er-ok-10 |
| er | identifying `--`, solid | er-ok-11 |
| er | non-identifying `..`, `.-`, `-.`, dashed | er-ok-11 |
| er | relation label: word, quoted, empty | er-ok-12 |
| er | `direction` | er-ok-13 |
| er | subgraph forms | er-ok-14 |
| er | nested subgraphs | er-ok-14 |
| er | `direction` in a subgraph | er-ok-15 |
| er | relation to a subgraph | er-ok-15 |
| er | `%%` comment lines | er-ok-16 |
| er | CJK width | er-ok-17 |
| er | 60-column fit boundary | er-ok-18 |
| er | ladder: tighter gaps | er-ok-19 |
| er | ladder: wrapped comments | er-ok-20 |
| er | ladder: LR redrawn as TB | er-ok-21 |
| er | ladder: labels keyed with legend | er-ok-22 |
| er | identical aliases on distinct entities | er-ok-23 |
| er | `style` ignored | er-ok-24 |
| er | Markdown bold and italic in an alias, relation label and attribute comment | er-ok-25 |
| requirement | header `requirementDiagram` | requirement-ok-01 |
| requirement | frontmatter `title` | requirement-ok-01 |
| requirement | type `requirement` | requirement-ok-01 |
| requirement | type `functionalRequirement` | requirement-ok-01 |
| requirement | type `interfaceRequirement` | requirement-ok-01 |
| requirement | type `performanceRequirement` | requirement-ok-01 |
| requirement | type `physicalRequirement` | requirement-ok-01 |
| requirement | type `designConstraint` | requirement-ok-01 |
| requirement | `element` with `type`, `docref` | requirement-ok-01 |
| requirement | field `id` | requirement-ok-02 |
| requirement | field `text` | requirement-ok-02 |
| requirement | field `risk` low/medium/high | requirement-ok-02 |
| requirement | field `verifymethod`, four values | requirement-ok-02 |
| requirement | absent field draws no row | requirement-ok-02 |
| requirement | keywords in any case | requirement-ok-02 |
| requirement | relation `contains` | requirement-ok-03 |
| requirement | relation `copies` | requirement-ok-04 |
| requirement | relation `derives` | requirement-ok-05 |
| requirement | relation `satisfies` | requirement-ok-06 |
| requirement | relation `verifies` | requirement-ok-07 |
| requirement | relation `refines` | requirement-ok-08 |
| requirement | relation `traces` | requirement-ok-09 |
| requirement | reverse form `dst <- rel - src` | requirement-ok-10 |
| requirement | quoted and unquoted text | requirement-ok-11 |
| requirement | `direction` | requirement-ok-12 |
| requirement | `%%` comment lines | requirement-ok-12 |
| requirement | CJK width | requirement-ok-13 |
| requirement | 60-column fit boundary | requirement-ok-14 |
| requirement | ladder: tighter gaps | requirement-ok-15 |
| requirement | ladder: wrapped field rows | requirement-ok-16 |
| requirement | ladder: LR redrawn as TB | requirement-ok-17 |
| requirement | ladder: relation labels keyed with legend | requirement-ok-18 |
| requirement | identical text on distinct requirements | requirement-ok-19 |
| requirement | `style` ignored | requirement-ok-20 |
| c4 | header `C4Context` | c4-ok-01 |
| c4 | header `C4Container` | c4-ok-02 |
| c4 | header `C4Component` | c4-ok-03 |
| c4 | header `C4Dynamic` | c4-ok-04 |
| c4 | header `C4Deployment` | c4-ok-05 |
| c4 | `title` statement | c4-ok-01 |
| c4 | frontmatter `title` | c4-ok-10 |
| c4 | `%%` comments | c4-ok-10 |
| c4 | `UpdateLayoutConfig` (no effect) | c4-ok-01 |
| c4 | `<br/>` line break | c4-ok-01 |
| c4 | `Person` | c4-ok-01 |
| c4 | `Person_Ext` | c4-ok-01 |
| c4 | `System` | c4-ok-01 |
| c4 | `SystemDb` | c4-ok-01 |
| c4 | `SystemQueue` | c4-ok-01 |
| c4 | `System_Ext` | c4-ok-01 |
| c4 | `SystemDb_Ext` | c4-ok-01 |
| c4 | `SystemQueue_Ext` | c4-ok-01 |
| c4 | `Container` | c4-ok-02 |
| c4 | `ContainerDb` | c4-ok-02 |
| c4 | `ContainerQueue` | c4-ok-06 |
| c4 | `Container_Ext` | c4-ok-06 |
| c4 | `ContainerDb_Ext` | c4-ok-06 |
| c4 | `ContainerQueue_Ext` | c4-ok-06 |
| c4 | `Component` | c4-ok-03 |
| c4 | `ComponentDb` | c4-ok-06 |
| c4 | `ComponentQueue` | c4-ok-06 |
| c4 | `Component_Ext` | c4-ok-06 |
| c4 | `ComponentDb_Ext` | c4-ok-06 |
| c4 | `ComponentQueue_Ext` | c4-ok-06 |
| c4 | `Boundary` with a type | c4-ok-01 |
| c4 | `Boundary` default `[system]`; empty type prints no tag | c4-ok-09 |
| c4 | `Enterprise_Boundary` | c4-ok-01 |
| c4 | `System_Boundary` | c4-ok-01 |
| c4 | `Container_Boundary` | c4-ok-02 |
| c4 | `Deployment_Node` with a type | c4-ok-05 |
| c4 | `Node`, `Node_L`, `Node_R` showing `[node]` | c4-ok-05 |
| c4 | nested boundaries | c4-ok-09 |
| c4 | `{` on the next line | c4-ok-09 |
| c4 | `Rel` | c4-ok-07 |
| c4 | `BiRel` | c4-ok-07 |
| c4 | `Rel_Back` | c4-ok-07 |
| c4 | `Rel_U`/`Rel_Up` | c4-ok-07 |
| c4 | `Rel_D`/`Rel_Down` | c4-ok-07 |
| c4 | `Rel_L`/`Rel_Left` | c4-ok-07 |
| c4 | `Rel_R`/`Rel_Right` | c4-ok-07 |
| c4 | `RelIndex` in `C4Dynamic` | c4-ok-04 |
| c4 | `C4Dynamic` label numbering | c4-ok-04 |
| c4 | relation `techn` and `descr` | c4-ok-08 |
| c4 | empty `""` and `,,` arguments | c4-ok-08 |
| c4 | bare alias arguments | c4-ok-08 |
| c4 | element type line wording | c4-ok-06 |
| c4 | `[External …]` type line | c4-ok-01 |
| c4 | caps per the common table: person, `Db`, `Queue`, other | c4-ok-01 |
| c4 | CJK width | c4-ok-11 |
| c4 | 60-column fit boundary | c4-ok-12 |
| c4 | ladder: tighter gaps | c4-ok-13 |
| c4 | ladder: wrapped descriptions | c4-ok-14 |
| c4 | ladder: relation labels keyed with legend | c4-ok-15 |
| c4 | identical labels on distinct elements | c4-ok-16 |
| architecture | header `architecture-beta` | architecture-ok-01 |
| architecture | `group` with icon and title | architecture-ok-01 |
| architecture | `service` with icon, title and `in` | architecture-ok-01 |
| architecture | built-in icons | architecture-ok-03 |
| architecture | icon pack `pack:name` | architecture-ok-02 |
| architecture | service with only a title | architecture-ok-03 |
| architecture | service with only an icon | architecture-ok-03 |
| architecture | nested groups | architecture-ok-04 |
| architecture | group with only a title, or only an icon | architecture-ok-04 |
| architecture | straight port pairs | architecture-ok-05 |
| architecture | bent port pairs | architecture-ok-06 |
| architecture | arrows `-->`, `<--`, `<-->` | architecture-ok-07 |
| architecture | edge label `-[label]-` | architecture-ok-07 |
| architecture | `{group}` edge | architecture-ok-08 |
| architecture | `junction` glyphs | architecture-ok-09 |
| architecture | junction inside a group | architecture-ok-10 |
| architecture | taken cell: next free cell | architecture-ok-11 |
| architecture | `align column` | architecture-ok-11 |
| architecture | `align row` | architecture-ok-12 |
| architecture | `align row` with `align column` | architecture-ok-13 |
| architecture | unconnected parts side by side | architecture-ok-14 |
| architecture | `title` statement | architecture-ok-14 |
| architecture | frontmatter `title` | architecture-ok-15 |
| architecture | `%%` comment lines | architecture-ok-15 |
| architecture | CJK width | architecture-ok-16 |
| architecture | 60-column fit boundary | architecture-ok-17 |
| architecture | ladder: tighter gaps | architecture-ok-18 |
| architecture | ladder: wrapped titles | architecture-ok-19 |
| architecture | ladder: edge labels keyed with legend | architecture-ok-20 |
| architecture | identical titles on distinct services | architecture-ok-21 |
| architecture | free statement order (edges before services) | architecture-ok-22 |
| architecture | `accTitle`/`accDescr` ignored | architecture-ok-23 |
| architecture | junction-only rows and columns size to 1 cell | architecture-ok-24 |
| gantt | header `gantt` | gantt-ok-01 |
| gantt | `title`, `section`, tasks in source order | gantt-ok-01, gantt-ok-05 |
| gantt | `dateFormat` tokens and literals; default `YYYY-MM-DD` | gantt-ok-01, gantt-ok-08, gantt-ok-09, gantt-ok-15, gantt-reject-03 |
| gantt | date-free `dateFormat` | gantt-ok-04, gantt-reject-11 |
| gantt | `axisFormat` tokens; default `%Y-%m-%d` | gantt-ok-02, gantt-ok-04, gantt-ok-08, gantt-ok-09, gantt-reject-10 |
| gantt | tags `done`, `active`, `crit`; status field and bar roles | gantt-ok-05, gantt-ok-06 |
| gantt | `milestone` at start + duration/2 | gantt-ok-02, gantt-ok-04, gantt-ok-06, gantt-reject-13 |
| gantt | task id; `after` with several ids | gantt-ok-01, gantt-ok-03, gantt-reject-04, gantt-reject-05, gantt-reject-06 |
| gantt | `until` with several ids; forward reference | gantt-ok-03, gantt-ok-05 |
| gantt | explicit start and end dates | gantt-ok-05, gantt-ok-15, gantt-reject-07 |
| gantt | default start = previous task's end | gantt-ok-01, gantt-ok-05, gantt-reject-08 |
| gantt | durations `ms` `s` `m` `h` `d` `w`; decimals for `ms` `s` `m` `h` only | gantt-ok-03, gantt-ok-04, gantt-ok-07, gantt-reject-02, gantt-reject-09, gantt-reject-18, gantt-reject-26 |
| gantt | `excludes`, `includes`, `weekday`, `weekend`, `tickInterval`, `topAxis`, `inclusiveEndDates`, a `todayMarker` other than `off`, more than 3 items after the tags fall back | gantt-reject-01, gantt-reject-19, gantt-reject-20, gantt-reject-21, gantt-reject-22, gantt-reject-23, gantt-reject-24, gantt-reject-25, gantt-reject-27 |
| gantt | zero-length task; repeated names | gantt-ok-05, gantt-ok-07 |
| gantt | timing column: start and end as written | gantt-ok-01, gantt-ok-02, gantt-ok-03, gantt-ok-04, gantt-ok-05, gantt-ok-07, gantt-ok-08, gantt-ok-09 |
| gantt | timings move into the keyed legend | gantt-ok-05, gantt-ok-12, gantt-ok-13, gantt-ok-15 |
| gantt | time axis: scale, ticks, labels | gantt-ok-02, gantt-ok-04 |
| gantt | `todayMarker off`; frontmatter title; `displayMode` ignored | gantt-ok-10 |
| gantt | CJK width | gantt-ok-11 |
| gantt | fit ladder steps 1-3 and fallback | gantt-ok-12, gantt-ok-13, gantt-reject-14 |
| gantt | `click` parsed and ignored (common rule 4) | gantt-ok-14 |
| gantt | `excludes` and `vert` fall back | gantt-reject-01, gantt-reject-12 |
| gantt | task names Mermaid lexes as a comment or as tokens fall back | gantt-reject-15, gantt-reject-16, gantt-reject-17 |
| gantt | two-character keys budgeted in the row width | gantt-ok-16 |
| pie | header `pie` | pie-ok-01 |
| pie | `showData` and `title` on the header line; `%%` comments | pie-ok-01, pie-ok-05 |
| pie | `title` on its own line; `showData` has no effect | pie-ok-02, pie-ok-06 |
| pie | double- and single-quoted labels | pie-ok-01, pie-ok-04, pie-reject-04 |
| pie | integer and decimal values, greater than 0 | pie-ok-02, pie-ok-04, pie-reject-01, pie-reject-02 |
| pie | sort by value, ties in source order | pie-ok-01, pie-ok-02, pie-ok-04 |
| pie | bar eighths `round(8·v/Σv·W)` | pie-ok-01, pie-ok-02, pie-ok-03, pie-ok-06 |
| pie | percentages, one decimal, half up | pie-ok-01, pie-ok-02, pie-ok-03 |
| pie | config ignored | pie-ok-02 |
| pie | repeated label falls back | pie-reject-03 |
| pie | CJK width | pie-ok-07 |
| pie | fit ladder steps 1-2 and fallback | pie-ok-08, pie-ok-09, pie-reject-06 |
| pie | an empty pie falls back | pie-reject-05 |
| pie | `accTitle` parsed and ignored (common rule 4) | pie-ok-10 |
| xychart | headers `xychart-beta` and `xychart` | xychart-ok-01, xychart-ok-02 |
| xychart | `vertical` and `horizontal` | xychart-ok-06, xychart-ok-07 |
| xychart | `title`: quoted or one word | xychart-ok-01, xychart-ok-06, xychart-reject-06 |
| xychart | `x-axis` categories, with or without a title | xychart-ok-01, xychart-ok-05, xychart-ok-06, xychart-reject-10 |
| xychart | `x-axis` title only, or none: unlabelled groups | xychart-ok-03, xychart-ok-07 |
| xychart | `y-axis` range, with or without a title | xychart-ok-01, xychart-ok-06, xychart-reject-03, xychart-reject-11 |
| xychart | `y-axis` title only, or none: range from the data | xychart-ok-03, xychart-ok-07 |
| xychart | bar series from `y0`; zero bar | xychart-ok-01, xychart-ok-04, xychart-ok-07, xychart-reject-04 |
| xychart | line series, distinct markers | xychart-ok-02, xychart-ok-03, xychart-reject-13 |
| xychart | mixed series in source order; tags | xychart-ok-05, xychart-ok-06 |
| xychart | signed and leading-dot numbers; tick labels | xychart-ok-02, xychart-ok-03 |
| xychart | horizontal layout and legend | xychart-ok-01, xychart-ok-06 |
| xychart | config ignored | xychart-ok-04, xychart-ok-05 |
| xychart | unquoted-text limits | xychart-reject-06, xychart-reject-07, xychart-reject-08 |
| xychart | CJK width | xychart-ok-08 |
| xychart | fit ladder steps 1-3 and fallback | xychart-ok-09, xychart-ok-10, xychart-reject-12 |
| xychart | point labels, numeric x range, length mismatch, malformed list fall back | xychart-reject-01, xychart-reject-02, xychart-reject-05, xychart-reject-09 |
| xychart | `accTitle` parsed and ignored (common rule 4) | xychart-ok-11 |
| quadrant | header `quadrantChart` | quadrant-ok-01 |
| quadrant | `title` statement; frontmatter title | quadrant-ok-01, quadrant-ok-03 |
| quadrant | `x-axis` and `y-axis` with two texts | quadrant-ok-01, quadrant-ok-06 |
| quadrant | `x-axis` and `y-axis` with one text | quadrant-ok-03, quadrant-reject-04 |
| quadrant | `quadrant-1` … `quadrant-4` | quadrant-ok-01, quadrant-ok-06, quadrant-reject-05 |
| quadrant | points: coordinate pattern, clamping, cells | quadrant-ok-01, quadrant-ok-02, quadrant-reject-02, quadrant-reject-03, quadrant-reject-06 |
| quadrant | quoted and unquoted text; keyword limit | quadrant-ok-03, quadrant-ok-06, quadrant-reject-07 |
| quadrant | point keys: shared, two-digit, into the cross | quadrant-ok-04, quadrant-ok-05, quadrant-reject-08 |
| quadrant | repeated point names | quadrant-ok-04 |
| quadrant | legend with coordinates as written | quadrant-ok-01, quadrant-ok-04 |
| quadrant | `%%` comments | quadrant-ok-03 |
| quadrant | config ignored; no points, no legend | quadrant-ok-07 |
| quadrant | CJK width | quadrant-ok-06 |
| quadrant | fit ladder: field keys, legend wrap, fallback | quadrant-ok-08, quadrant-ok-09, quadrant-reject-09 |
| quadrant | point styles fall back | quadrant-reject-01 |
| quadrant | `:::name` and `classDef` parsed and ignored (common rule 4) | quadrant-ok-10 |
| journey | header `journey` | journey-ok-01 |
| journey | `title`, `section`, tasks; tasks before any section | journey-ok-01, journey-ok-03, journey-reject-07 |
| journey | task `name: score: actors` | journey-ok-01, journey-reject-03 |
| journey | score 1–5, decimals; bar eighths | journey-ok-01, journey-ok-02, journey-reject-01, journey-reject-02 |
| journey | actor lists; an actor across tasks; repeated actor falls back | journey-ok-01, journey-ok-07, journey-reject-04 |
| journey | repeated task names | journey-ok-07 |
| journey | `%%` comments | journey-ok-03 |
| journey | CJK width | journey-ok-04 |
| journey | fit ladder steps 1-3 and fallback | journey-ok-05, journey-ok-06, journey-reject-08 |
| journey | `#` and `;` fall back | journey-reject-05, journey-reject-06 |
| journey | `accDescr` parsed and ignored (common rule 4) | journey-ok-08 |
| sankey | headers `sankey` and `sankey-beta` | sankey-ok-01, sankey-ok-08, sankey-reject-08 |
| sankey | link `source,target,value`, 3 fields | sankey-ok-01, sankey-reject-02 |
| sankey | quoted fields: commas, `""` | sankey-ok-02, sankey-reject-07 |
| sankey | blank lines and `%%` comments | sankey-ok-01, sankey-ok-03 |
| sankey | ranks and group order | sankey-ok-04, sankey-ok-06 |
| sankey | bars against the largest link; zero link | sankey-ok-01, sankey-ok-05 |
| sankey | repeated pair; a node in several links | sankey-ok-05, sankey-ok-06 |
| sankey | negative or non-numeric value falls back | sankey-reject-01, sankey-reject-03 |
| sankey | cycle and self-link fall back | sankey-reject-04, sankey-reject-05 |
| sankey | non-ASCII (CJK) falls back: Mermaid can't lex it | sankey-reject-06 |
| sankey | config ignored | sankey-ok-06 |
| sankey | fit ladder steps 1-2 and fallback | sankey-ok-06, sankey-ok-07, sankey-ok-08, sankey-reject-09 |
| radar | headers `radar-beta` and `radar-beta:`; `radar` falls back | radar-ok-01, radar-ok-07, radar-reject-08 |
| radar | `title` statement; frontmatter title | radar-ok-01, radar-ok-02 |
| radar | `axis` with and without labels; several per line | radar-ok-01, radar-ok-03, radar-reject-04 |
| radar | `curve` values in axis order | radar-ok-01, radar-ok-02, radar-reject-02 |
| radar | `curve` values by axis id; several curves per line | radar-ok-03, radar-reject-03, radar-reject-07 |
| radar | values across lines; malformed curve | radar-ok-04, radar-reject-06 |
| radar | `min`, `max` and their defaults; bar eighths | radar-ok-01, radar-ok-03, radar-ok-05, radar-reject-01, radar-reject-05 |
| radar | a value equal to `min` draws no bar | radar-ok-04, radar-ok-05 |
| radar | `ticks`, `graticule`, `showLegend` accepted | radar-ok-02, radar-ok-07 |
| radar | key legend; unlabelled ids | radar-ok-01, radar-ok-03 |
| radar | id limits | radar-reject-09 |
| radar | CJK width | radar-ok-06 |
| radar | fit ladder steps 1-2 and fallback | radar-ok-08, radar-ok-09, radar-reject-10 |
| radar | `accTitle` parsed and ignored (common rule 4) | radar-ok-10 |
| treemap | headers `treemap-beta` and `treemap` | treemap-ok-01, treemap-ok-02, treemap-ok-03 |
| treemap | `title`; `%%` comments | treemap-ok-03 |
| treemap | sections and leaves by indentation | treemap-ok-01, treemap-ok-02, treemap-reject-01 |
| treemap | tab indentation; joining the nearest shallower row | treemap-ok-06, treemap-reject-02 |
| treemap | quoted names; `:` and `,` separators | treemap-ok-01, treemap-ok-03, treemap-reject-05 |
| treemap | section sums; decimals | treemap-ok-01, treemap-ok-04 |
| treemap | bars as shares of `M`; zero leaf; empty section | treemap-ok-01, treemap-ok-05, treemap-reject-06 |
| treemap | repeated names | treemap-ok-06 |
| treemap | values with `,` or a sign fall back | treemap-reject-03, treemap-reject-04 |
| treemap | config ignored | treemap-ok-04 |
| treemap | CJK width | treemap-ok-07 |
| treemap | fit ladder steps 1-2 and fallback | treemap-ok-08, treemap-ok-09, treemap-reject-07 |
| treemap | `:::name` and `classDef` parsed and ignored (common rule 4) | treemap-ok-10 |
| treemap | `accTitle` parsed and ignored (common rule 4) | treemap-ok-11 |
| treemap | zero printed as written (`0.00`) | treemap-ok-12 |
| mindmap | header `mindmap` | mindmap-ok-01, mindmap-reject-05 |
| mindmap | nesting by indentation, single root | mindmap-ok-01, mindmap-ok-05, mindmap-reject-02 |
| mindmap | default shape (no caps) | mindmap-ok-01, mindmap-ok-02 |
| mindmap | square, rounded, circle, bang, cloud, hexagon | mindmap-ok-02, mindmap-reject-03 |
| mindmap | shape without id; quoted text | mindmap-ok-03 |
| mindmap | `<br>` line breaks | mindmap-ok-04 |
| mindmap | comments, blank lines, frontmatter title | mindmap-ok-06 |
| mindmap | identical texts on distinct nodes | mindmap-ok-07 |
| mindmap | CJK width | mindmap-ok-08 |
| mindmap | branch colors; `colorBy: depth` | mindmap-ok-01, mindmap-ok-13 |
| mindmap | fit ladder steps 1-4 and fallback | mindmap-ok-09, mindmap-ok-10, mindmap-ok-11, mindmap-ok-12, mindmap-reject-06 |
| mindmap | `:::class` parsed and ignored | mindmap-ok-14 |
| mindmap | Markdown bold and italic in a label | mindmap-ok-15 |
| gitGraph | headers `gitGraph`, `gitGraph:`, `LR:`, `TB:`, `BT:` | gitGraph-ok-01, gitGraph-ok-06, gitGraph-ok-12, gitGraph-ok-13, gitGraph-ok-14 |
| gitGraph | commit id, `msg:` and bare message, tags | gitGraph-ok-01, gitGraph-ok-07 |
| gitGraph | commit types NORMAL, REVERSE, HIGHLIGHT | gitGraph-ok-01, gitGraph-reject-06 |
| gitGraph | branch, checkout, switch | gitGraph-ok-02, gitGraph-reject-01, gitGraph-reject-03 |
| gitGraph | merge with id, tag and type | gitGraph-ok-02, gitGraph-ok-03, gitGraph-reject-02 |
| gitGraph | cherry-pick with tags and `parent:` | gitGraph-ok-04, gitGraph-reject-05, gitGraph-ok-15 |
| gitGraph | `order:`, `mainBranchOrder`, `mainBranchName` | gitGraph-ok-05 |
| gitGraph | quoted and `feature/x.y` branch names | gitGraph-ok-07 |
| gitGraph | `title`, comments | gitGraph-ok-07 |
| gitGraph | branch before the first commit | gitGraph-ok-08 |
| gitGraph | lane crossing `┼` | gitGraph-ok-03 |
| gitGraph | unique commit ids | gitGraph-reject-04 |
| gitGraph | CJK width | gitGraph-ok-09 |
| gitGraph | fit ladder and fallback | gitGraph-ok-10, gitGraph-reject-07 |
| gitGraph | `accTitle` parsed and ignored | gitGraph-ok-11 |
| timeline | headers `timeline`, `timeline LR`, `timeline TD` | timeline-ok-01, timeline-ok-06, timeline-ok-07 |
| timeline | `title` statement or frontmatter, once | timeline-ok-01, timeline-ok-07, timeline-reject-06 |
| timeline | period with inline events | timeline-ok-02, timeline-reject-04, timeline-reject-05 |
| timeline | CJK period labels | timeline-ok-14 |
| timeline | `: event` continuation lines | timeline-ok-01, timeline-reject-01 |
| timeline | `:` inside event text | timeline-ok-02 |
| timeline | period without events; repeated period text | timeline-ok-05 |
| timeline | sections, unique and covering every period | timeline-ok-03, timeline-reject-02, timeline-reject-03 |
| timeline | `<br>` line breaks | timeline-ok-04 |
| timeline | comments | timeline-ok-07 |
| timeline | series colors; `disableMulticolor` | timeline-ok-01, timeline-ok-03, timeline-ok-08 |
| timeline | CJK width | timeline-ok-09 |
| timeline | fit ladder steps 1-4 and fallback | timeline-ok-10, timeline-ok-11, timeline-ok-12, timeline-reject-07 |
| timeline | `accTitle` parsed and ignored | timeline-ok-13 |
| kanban | header `kanban` | kanban-ok-01 |
| kanban | node text `text`, `id[text]`, `[text]`, quoted | kanban-ok-01, kanban-ok-02, kanban-reject-05, kanban-reject-07 |
| kanban | cards grouped by indent; deeper indents flattened | kanban-ok-01, kanban-ok-05, kanban-reject-06 |
| kanban | empty column | kanban-ok-02 |
| kanban | unique column ids; reused card ids | kanban-ok-04, kanban-reject-02 |
| kanban | meta `assigned`, `ticket`, `priority` | kanban-ok-03, kanban-ok-04, kanban-reject-03, kanban-reject-04 |
| kanban | comments, blank lines, frontmatter title, ignored `ticketBaseUrl` | kanban-ok-06 |
| kanban | column series colors | kanban-ok-01 |
| kanban | CJK width | kanban-ok-07 |
| kanban | title wrapping inside its frame | kanban-ok-11 |
| kanban | fit ladder steps 1-3 and fallback | kanban-ok-08, kanban-ok-09, kanban-ok-10, kanban-reject-08 |
| block | headers `block-beta`, `block` | block-ok-01, block-ok-02 |
| block | bare id as its own label | block-ok-01, block-reject-05 |
| block | `columns N`, `columns auto` | block-ok-01, block-ok-02, block-ok-04 |
| block | width `:N`, clamped at the row's end | block-ok-03 |
| block | 14 shapes with quoted labels | block-ok-05, block-reject-04 |
| block | block arrows and directions | block-ok-06 |
| block | `space`, `space:N` | block-ok-07 |
| block | composites: anonymous, `block:id[:N]`, nested | block-ok-04 |
| block | edges: kinds, ends, labels, to a composite | block-ok-08, block-reject-01, block-reject-03 |
| block | placement by first appearance; later shape for a bare block | block-ok-09, block-reject-02 |
| block | comments, frontmatter title | block-ok-09 |
| block | CJK width | block-ok-10 |
| block | fit ladder steps 1-3 and fallback | block-ok-11, block-ok-12, block-reject-06 |
| block | `style` parsed and ignored | block-ok-13 |
| block | `classDef` and `class` parsed and ignored | block-ok-14 |
| packet | headers `packet-beta`, `packet` | packet-ok-01, packet-ok-03 |
| packet | fields `start` and `start-end` | packet-ok-01, packet-ok-03, packet-reject-04 |
| packet | `+bits` fields mixed with ranges | packet-ok-02, packet-reject-05 |
| packet | contiguous fields from bit 0 | packet-ok-01, packet-reject-02, packet-reject-03, packet-reject-06 |
| packet | quoted labels, double and single; repeated labels | packet-ok-05, packet-reject-01 |
| packet | `title` statement, frontmatter title | packet-ok-01, packet-ok-02 |
| packet | whole-line comments | packet-ok-05 |
| packet | field split at a row edge | packet-ok-03 |
| packet | keyed labels and legend | packet-ok-01, packet-ok-06 |
| packet | `bitsPerRow`, `bitOrder: descending`, partial row | packet-ok-04, packet-ok-07 |
| packet | 10,000-row cap | packet-reject-08 |
| packet | CJK width | packet-ok-06 |
| packet | fit ladder steps 1-2 and fallback | packet-ok-01, packet-ok-07, packet-reject-07 |
| packet | `accTitle` parsed and ignored | packet-ok-08 |
| packet | all-or-none keys: a key never looks like a literal label | packet-ok-09 |
| zenuml | header `zenuml` (subset TBD; falls back until pinned) | zenuml-ok-01 |
| zenuml | `title` statement, frontmatter title | zenuml-ok-01, zenuml-ok-10 |
| zenuml | participants: from messages, declared, `as` alias, `@Actor` | zenuml-ok-01, zenuml-ok-02, zenuml-ok-03, zenuml-ok-04, zenuml-reject-02, zenuml-reject-07 |
| zenuml | async message `A->B: text` | zenuml-ok-01, zenuml-ok-06 |
| zenuml | sync call with source; nested calls; call block as activation | zenuml-ok-05, zenuml-ok-06, zenuml-reject-05, zenuml-reject-06 |
| zenuml | `return` reply | zenuml-ok-05, zenuml-reject-08 |
| zenuml | `while` as `loop` | zenuml-ok-07 |
| zenuml | `if`/`else if`/`else` as `alt` | zenuml-ok-08 |
| zenuml | `opt`, `par` | zenuml-ok-09 |
| zenuml | CJK width | zenuml-ok-10 |
| zenuml | fit ladder and fallback | zenuml-ok-11, zenuml-reject-09 |
