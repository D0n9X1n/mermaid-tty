# mermaid-tty v1 design: more diagram types (sub-project C)

**Goal:** draw as many Mermaid diagram types as possible. Each one meets sub-project A's quality bar: flat, colored, exact width, validated, and fail-closed. The owner asked to "try to support as many charts in mermaid" as possible.

**Approval:** waived by the PM under `/goal` autonomy on 2026-10-27. This sub-project depends on the core from sub-project A: `width`, `canvas`, `themes`, `validate`, the graph layout, and the `render` dispatcher.

## Rules for every type

- **Parsing:** each type parses a documented subset of its syntax. If a diagram uses anything outside that subset, the whole diagram falls back to its source. The renderer never shows partial output.
- **Width and validation:** output fits within `columns`. The validator checks that every item's label appears exactly once, that no glyph overwrites another, and that the width holds.
- **Flat rows:** an item takes one row per label line. Only containers (frames, lanes and axes) draw border rows.
- **Golden tests:** each type has golden snapshots at 80 and 120 columns. Their fixtures are adapted from the syntax pages on mermaid.js.org (MIT licensed) and include CJK variants.
- **Tiers:**
  - Tier 1 must ship in v1.
  - A Tier 2 type ships once it passes its tests and a cross-family review of its golden renders. Until then its header keyword stays unsupported, so it falls back to the source, and the README lists it as planned.

## Types

| Type (header keyword) | Tier | Text design |
|---|---|---|
| state (`stateDiagram`, `stateDiagram-v2`) | 1 | Graph engine. `[*]` draws as a start dot ● or an end ◉. Composite states become frames, choice is ◇, fork and join are ━ bars, and notes are dim. |
| class (`classDiagram`) | 1 | Graph engine. A class is a name pill followed by member rows, with visibility kept. Relation ends: ▷ inheritance, ◆ composition, ◇ aggregation, and a dashed line for dependency. Cardinality labels are shown. |
| ER (`erDiagram`) | 1 | Graph engine. An entity is a pill followed by attribute rows (type, name, PK/FK). Cardinality appears at the edge ends as `1`, `0..1`, `1..*` or `0..*`, plus a relation label. |
| mindmap | 1 | A horizontal tree that grows from the root with `├─` and `└─` branches. Shapes are pills. |
| gantt | 1 | Task names on the left and bars on a date axis scaled to the width. Sections are headers and milestones are ◆. Color shows done, active and crit. |
| pie | 1 | Horizontal bars sorted by size, each with label, value and percent. |
| gitGraph | 1 | One lane per branch, each in its own color. Commits are ●, plus merges, tags and cherry-picks. |
| timeline | 1 | Periods are headers with their events listed beneath. Sections are colored. |
| journey | 1 | Sections of tasks, each with a score bar (1–5) and its actors. |
| xychart (`xychart-beta`) | 1 | Bars drawn with `▁▂▃▄▅▆▇█` and lines drawn as markers, on axes with ticks. |
| quadrant (`quadrantChart`) | 1 | A 2D grid with axis labels, quadrant titles and labeled points. |
| requirement (`requirementDiagram`) | 2 | Graph engine. A requirement or element is a pill followed by field rows. Edges carry «satisfies»-style labels. |
| C4 (`C4Context` and the others) | 2 | Graph engine. People, systems and containers are pills with a type tag. Boundaries are frames. |
| block (`block-beta`) | 2 | A grid of pills laid out by `columns N`, with arrows between blocks. |
| architecture (`architecture-beta`) | 2 | Graph engine. Services are pills with an icon tag, and groups are frames. |
| kanban | 2 | Columns side by side with their cards. They wrap into rows when the terminal is narrow. |
| packet (`packet-beta`) | 2 | Bit-field rows, 32 bits to a row, with labeled fields. |
| sankey (`sankey-beta`) | 2 | Ranked layers, with links drawn as bars scaled by value. |
| treemap | 2 | Nested, indented bars sized by value. |
| radar (`radar-beta`) | 2 | Bars for each axis, per series. |
| zenuml | 2 | Parsed into sub-project A's sequence model. |

## Architecture

- **Per-type modules:** each type lives in `core/diagrams/<type>/` with a `parse.ts` and a `layout.ts`. It is registered in `core/registry.ts` under its header keyword.
- **Graph family:** state, class, ER, requirement, C4 and architecture reuse A's layered layout and router. They share a node and edge model that allows multi-row nodes, made of a header plus member rows. A's interfaces must expose this model from the start.
- **Chart family:** gantt, xychart, pie, journey, quadrant, sankey and radar share `core/charts/{axis.ts,bars.ts}`.

## Test strategy

- `node --test` runs unit and golden tests for each type.
- A registry test checks that every Mermaid header keyword maps either to a renderer or to an explicit fallback.
- A property test runs over all fixtures and checks that each one fits the width and passes validation.
- Sub-project B's README shows one example of each shipped type, and a support table that marks each type Tier 1, Tier 2 or planned.

## Decisions (self-answered)

- **Pie and radar are drawn as bars, not circles.** Bars are legible and exact in a terminal.
- **Multi-row nodes are allowed only for member lists** (class, ER and requirement). Even these never use a row just for a border.
- **Unknown or unsupported keywords keep the engine's own drawing.**

## Risks

- **Breadth versus quality:** Tier 2 is gated rather than forced, so a weak renderer stays off instead of shipping.
- **Shared graph model:** the graph engine must support multi-row nodes early, so the plan for A has to account for it.
