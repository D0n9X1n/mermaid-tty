# mermaid-tty v1 design: more diagram types (sub-project C)

**Goal:** draw as many Mermaid diagram types as possible at sub-project A's quality bar: flat, colored, exact width, validated and fail-closed. The owner asked: "try to support as many as charts in mermaid".

**Approval:** PM waiver under `/goal` autonomy, 2026-10-27.

**Depends on:** A's core (`width`, `canvas`, `themes`, `validate`, the graph layout and the `render` dispatcher).

**Normative companion:** [`2026-10-27-mermaid-tty-v1-diagram-matrix.md`](2026-10-27-mermaid-tty-v1-diagram-matrix.md). This spec sets the rules every type follows. The matrix sets each type's contract:
- exact header keywords;
- the supported syntax subset;
- the text design;
- the numeric rules;
- the required fixtures and the rejection fixtures.

## Tiers

- **Tier 1, must ship in v1:** state, class, ER, mindmap, gantt, pie, gitGraph, timeline, journey, xychart, quadrant.
- **Tier 2, gated:** requirement, C4 (`C4Context`, `C4Container`, `C4Component`, `C4Dynamic`, `C4Deployment`), block, architecture, kanban, packet, sankey, treemap, radar, zenuml. A Tier 2 type is enabled only after its matrix fixtures and its visual review pass. Until then its keywords fall back.

## Rules for every type

1. **Contract.**
   - A diagram renders only if every statement is in its type's matrix subset.
   - Anything else falls back to the source as a whole, including a valid prefix followed by unsupported syntax.
   - Output is never partial.
2. **Flat rows.**
   - An item takes one row per label line.
   - Only containers (frames, lanes, axes, tables) draw border rows.
   - Member-list types (class, ER, requirement) add member rows, never border-only rows.
3. **Width.** All widths come from A's width function. Every row fits in `columns`. Each type's fit ladder ends in fallback.
4. **Validate.**
   - Every label, member, event, actor and value from the source appears exactly once, either in place or in a keyed legend under rule 6.
   - No glyph overwrites another.
5. **Numbers.**
   - **Domain:** values must be finite. Negative, NaN or out-of-domain values fall back unless the matrix allows them.
   - **Bars:** a bar of value `v`, in a field `W` cells wide with scale maximum `M`, is `round(8·v/M·W)` eighth-cells long. Horizontal bars use `▏▎▍▌▋▊▉█`; vertical bars use `▁▂▃▄▅▆▇█`.
   - **Zero:** a zero value draws no bar but keeps its label and value.
   - **Printed values:** every bar prints its value. Percentages are `v/Σv` with one decimal.
6. **Collisions.**
   - When two items need the same cells, the renderer puts a short key there and lists the full text in a legend under the diagram, in source order. Typical cases are coincident points, overlapping series markers, and labels wider than their field.
   - Keys are `1`, `2`, … for points and `a`, `b`, … for fields.
   - If no deterministic placement exists, the whole diagram falls back. Nothing is moved, clipped or dropped silently.
7. **Order.** Output follows source order. Exceptions are listed in the matrix; for example, pie sorts by value, descending, and ties keep source order.

## Registry

`core/registry.ts` maps every header keyword and alias to a renderer or an explicit fallback. Aliases include `stateDiagram` and `stateDiagram-v2`, `graph` and `flowchart`, and the `-beta` names. The registry exports `ENABLED`, the exact set of types allowed to render.

## Architecture

- **Per-type modules:** `core/diagrams/<type>/{parse,layout}.ts`, each registered in the registry.
- **Graph family:** state, class, ER, requirement, C4 and architecture reuse A's layered layout and router. They share a node/edge model with multi-row nodes (a header plus member rows), which A's interfaces expose from the start.
- **Chart family:** gantt, xychart, pie, journey, quadrant, sankey, radar and treemap share `core/charts/{scale,bars,legend}.ts`.

## Test strategy

- **Feature coverage:** every matrix row (keyword, statement form, relation, cardinality, value rule) names the fixtures that cover it. A test fails if any row has none.
- **Per type, required fixtures:** they render and validate at 60, 80 and 120 columns. Tests assert the expected numbers: bar lengths, percentages and dates.
- **Per type, rejection fixtures:** each returns the original fence. They cover:
  - a valid prefix plus an unsupported statement;
  - malformed input;
  - repeated labels;
  - out-of-domain values.
- **Integration:**
  - No border-only rows appear outside containers.
  - Each span carries its role's color from the active theme.
  - W/F text next to box drawing measures exactly.
  - At widths of fit −1, 0 and +1 cells, the renderer takes the specified ladder step or falls back.
- **Registry:**
  - `ENABLED` equals Tier 1 plus the Tier 2 types recorded as passed.
  - Every alias resolves, and every disabled keyword falls back.
  - The README support table matches the registry.
- **Visual gate:** applies to every shipped type, Tier 1 included. A gallery is rendered from the goldens, as PNG through B's SVG pipeline, at 80 columns, at a narrow width, and with CJK.
  - The PM reviews color and legibility.
  - A cross-family reviewer checks the text and the role map.
  - A type ships only after both pass.

## Decisions (self-answered)

- Pie and radar are drawn as bars, with values printed.
- Collisions get keys and a legend rather than moving or clipping anything.
- Unknown or disabled keywords keep the engine's own drawing.

## Risks

- **Breadth vs. quality:** Tier 2 is gated, and every shipped type passes the visual gate.
- **Drift from Mermaid:** fixtures are adapted from the syntax pages on mermaid.js.org, and the matrix records the docs version.
