# mermaid-tty v1 design: renderer and Claude Code mod

**Goal:** be the best Mermaid rendering in a CLI. In Claude Code's terminal, each closed ```mermaid fence in a reply draws as a colored, flat box-drawing diagram; the transcript keeps the source.

**Approval:** PM waiver under `/goal` autonomy, 2026-10-27. Docs, wiki, CI and release: sub-project B.

## Scope

- **In:**
  - The Claude Code terminal surface on macOS, Linux and Windows. Mods need 2.1.287 or later; tested on 2.1.308.
  - Flowcharts, including subgraphs, and sequence diagrams. They are all 87 blocks of the owner's docs.
- **Out:**
  - Copilot CLI comes after v1.
  - Other diagram types are sub-project C. Desktop, VS Code and images keep the engine's own drawing.
  - `classDef` and `style` colors are not applied.

## Requirements (must pass)

1. **Flowchart syntax:**
   - **Header:** `flowchart` or `graph`, with direction TD, TB, BT, LR or RL.
   - **Shapes:** every classic bracket shape (rectangle, round, stadium, subroutine, cylinder, circle, rhombus, hexagon, parallelogram, trapezoid, asymmetric) and `@{shape}`. An unknown shape draws as a rectangle.
   - **Labels:** quoted labels and `<br/>` line breaks.
   - **Edges:** solid, dotted, thick and bidirectional, ending in an arrow, circle, cross or nothing. Labels are written `|x|` or `-- x -->`. Chains and `&` work.
   - **Subgraphs:** nested and titled, each with its own `direction`.
   - **Also parsed:** `%%` comments and `---` frontmatter, whose title is shown. `classDef`, `style`, `class`, `linkStyle` and `click` are parsed and ignored.
2. **Sequence syntax:**
   - **Participants:** `participant` and `actor`, with aliases.
   - **Messages:** solid or dotted; arrow, open, cross or async ends; with labels.
   - **Also:** `+`/`-` activations; notes left of, right of or over; `alt`/`else`, `opt`, `loop`, `par`/`and`, `critical` and `break` frames; `autonumber`.
   - **Full subsets:** the diagram matrix's `flowchart` and `sequence` sections are normative.
3. **Flat nodes:** a node takes exactly one row per label line, with no border-only rows. End caps show the shape, so shape doesn't depend on color.
4. **Width:**
   - One function measures width: East Asian Width `W`/`F` characters count 2 columns; combining marks (Mn/Me) and zero-width characters count 0; everything else counts 1, including box-drawing, arrows and `◇`. Labels containing ZWJ, variation selectors, regional indicators, emoji modifiers or control characters fall back.
   - Every row fits within `e.viewport.columns`. To fit, try natural layout, tighter gaps, wrapped labels, then LR redrawn as TD; otherwise show the source.
5. **Fail closed:**
   - A validator confirms that each node's label appears once (per node id, so identical texts are fine), each edge connects its endpoints, no glyph overwrites another, and every row fits.
   - Any validator failure, parse error or unsupported type shows the original fence unchanged. The reason goes only to the debug log.
6. **Source preserved:**
   - Only the drawing changes: the stored reply keeps the exact source, so `/copy` copies it.
   - `/mermaid-tty source` shows every diagram as its source, on screen and under ctrl+o; `/mermaid-tty diagram` draws them again. (The API doesn't flag the ctrl+o view.)
   - Unclosed fences are left alone.
   - The prose around diagrams goes through `next()`.
7. **Colors:**
   - By default, the roles node, decision, edge, arrow, label, frame and note map to Claude Code theme keys, so diagrams follow the user's theme.
   - The `theme` option picks a curated palette: nord, dracula, gruvbox, solarized or mono.
8. **Zero install:**
   - No runtime dependencies and no build step.
   - `claude plugin validate .` passes.
   - p90 corpus render time is at most 50 ms (cold, 80 columns, development Mac).
   - An LRU cache of 64 entries is keyed by text, width and theme.
   - Works the same on macOS, Linux and Windows: no OS-specific code, and CI runs the full suite on all three.

## Architecture

```mermaid
flowchart LR
  P[parse] --> L[layout] --> R[route] --> C[canvas] --> V{validate}
  V -->|ok| T[themed rows]
  V -->|fail| F[original fence]
```

- **Plugin root:** the repo root; the marketplace entry uses `source: "./"`.
- **`core/`:** host-agnostic, dependency-free TypeScript in erasable syntax only, so it runs under both Claude Code's loader and Node's type stripping.
  - `width.ts` (the width function) and `parse/`.
  - `layout/flowchart.ts`: cycle breaking, ranks (edge labels get their own), barycenter sweeps, grid coordinates.
  - `layout/sequence.ts`: sequence layout.
  - `route.ts`: orthogonal tracks; a junction bitmask picks the box-drawing glyph.
  - `canvas.ts`, `validate.ts`, `themes.ts`.
  - `render.ts`: `renderMermaid(source, {columns, theme})` returns rows of spans, or `null`.

- **`hooks/register.tsx`:** a `ui.render` hook on `AssistantMessage`, terminal surface only.
  - It splits the reply at closed mermaid fences and passes the prose to `next()`.
  - It draws each diagram as colored `Text` rows with `wrap: 'truncate-end'`, and caches the result.
  - It registers `/mermaid-tty` and keeps the mode in `$.state`.
- **`.claude-plugin/`:** `plugin.json` (`userConfig.theme`), `marketplace.json`, and an icon.

## Test strategy

- **Acceptance:** every requirement maps to the checks in the normative [`2026-10-27-mermaid-tty-v1-acceptance.md`](2026-10-27-mermaid-tty-v1-acceptance.md). CI runs every automatic check.
- **Corpus gate:** a committed synthetic corpus with the owner's feature mix runs in CI; the owner's 87 blocks also run locally, never committed.
- **Runtime proof (CI, three OSes):** real Claude Code, driven headlessly against a mock API, draws a CJK flowchart as themed truecolor rows, and `/mermaid-tty source` shows the source.
- **Must-pass suite:** `scripts/check.sh`.

## Decisions (grill, self-answered)

- We own the renderer; no third-party layout code.
- Nodes are flat pills with end caps; the mono theme drops the backgrounds.
- Failed renders fall back silently. Version 1.0.0.

## Prior art

| Practice | Source | Fit (evidence) |
|---|---|---|
| termaid | fasouto/termaid | Correct CJK and subgraphs, but 3-row boxes and a subprocess |
| merman-cli | Latias94/merman | Fails on subgraph routes |
| beautiful-mermaid | lukilabs/beautiful-mermaid | Misaligns CJK (owner's screenshot) |
| Community mods; built-in `cc-plugin-mermaid` | ngothanhluc, ejklock, BukeLy; Claude Code | Weeks old; flagged off |

## Risks

- **Tangled dense graphs:** if more than 5 corpus diagrams stay tangled after 3 fix cycles, port termaid's placement and routing, keeping flat nodes.
- **Early-access mods API:** a scheduled CI job tests every new Claude Code release.
