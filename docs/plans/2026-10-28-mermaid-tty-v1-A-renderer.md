# mermaid-tty v1, sub-project A: renderer and Claude Code mod — implementation plan

**Goal:** in Claude Code's terminal on macOS, Linux and Windows, draw each closed mermaid fence (flowchart, sequence) as a flat, colored, width-exact diagram. Show the untouched source whenever any check fails, and whenever the user picks `/mermaid-tty source`.
**Architecture:** `core/` is host-agnostic, dependency-free, erasable TypeScript. Its pipeline is source → registry → parse → layout → route → canvas → validate → theme, run inside a fit ladder and an LRU. `hooks/register.tsx` is thin: a `ui.render` hook on `AssistantMessage` (terminal only), plus `/mermaid-tty`, which keeps the mode in `$.state`. The checks live in Node (`scripts/*.ts`); `scripts/check.sh` is a thin bash entry point.
**Tech stack:** Node ≥ 24 with type stripping (no build); `node:test`; the Claude Code 2.1.308 mods API and `claude-code/testing`. Only the separate e2e job installs packages: node-pty and @xterm/headless, under `scripts/e2e/`.
**Plan files (each ≤ 500 lines):** this file holds the design, checks, traceability and risks. `…-A2-tasks.md` holds T0–T11 (scaffold, core). `…-A3-tasks.md` holds T12–T21 (fit ladder, registry, flowchart, hook). `…-A4-tasks.md` holds T22–T32 (command, sequence, gates, corpus, visual review). `…-A5-tasks.md` holds T33–T39 (e2e, parity, type check). All four implement §6; each depends on the ones before it.
**Inputs:** spec A, the acceptance doc and the matrix at `1dbf48a`, amended through `a02e6cc` (rule 12, bare headers, sequence `title`) and `994de0e` (rule 12 Emoji scope, `flowchart-ok-50…52`); the PM's answers of 2026-10-28; GPT-6's blind second design (§12).

## 1. Settled facts
| # | Fact | Proof |
|---|---|---|
| F1 | The mod loader resolves relative imports with explicit `.ts` suffixes from `hooks/register.tsx`. | scratch mod under `claude plugin test` drew `w=3` |
| F2 | `claude plugin test .` runs every `*.test.ts` and `*.test.tsx` under the folder and skips `*_test.ts`. | probe run list |
| F3 | Bare `node --test` (Node 26) runs `*_test.ts` and `*.test.ts`, never `.tsx`; `enum` fails with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. | scratch dir |
| F4 | `test(name, { options: { theme: 'nord' } }, body)` reaches `register(on, options)`. | drawn `theme=nord` |
| F5 | A test answers `$.ui.log` with `on('ui.log', async ($, e) => { …; return { value: undefined } })` and reads `e.to`. | probe |
| F6 | In `ui.drawn()` and `find`, `Box` keeps `key` and `Text` drops it; nested `Text` keeps `color`, `backgroundColor` and `wrap`. | `findAll` dump |
| F7 | A test's own `ui.render` hook sits under the plugin and receives every `next()` call. | `seen = ["before\|true","after\|false"]` |
| F8 | `claude plugin validate .` passes with `userConfig.theme` (a string with `options`) and with `marketplace.json` `source: "./"`. Its only warning is `ICON_MISSING` (B6). | probe |
| F9 | Naming: kit tests are `tests/hooks/*.test.tsx`; Node tests are `tests/**/*_test.ts`. Neither runner loads the other's files. | F2, F3 |
| F10 | Source view: `$.command.register({ name, description })` in `session.start`; `on('command.run', { command: 'mermaid-tty' }, …)` with `e.args` = `source`, `diagram` or `''`. `$.state.get(SOURCE)` gives `{ value }` and `$.state.set(SOURCE, v)` stores it, with `SOURCE = { plugin: 'mermaid-tty', key: 'source' }` (the plugin.json name). `PluginState` is declared in `types/mermaid-tty.d.ts`, which plugin.json names under `"types"`. `$.ui.invalidate('ui.render')` redraws diagrams already on screen. A test calls `$.command.run({ command, args })`. | coordinator's spike code (8b2f51e); types `:1817` (`CommandRunArgs`), `:4881` |
| F11 | E2E with no account works. Use a fresh `HOME` and `CLAUDE_CONFIG_DIR`, `ANTHROPIC_API_KEY=dummy` and `ANTHROPIC_BASE_URL` pointing at the mock. Seed `$CLAUDE_CONFIG_DIR/.claude.json` with onboarding done, the key's last 20 chars approved and the realpath(cwd) trust flag. The mock must answer 2 concurrent streamed `POST /v1/messages`. `CONNECT downloads.claude.ai:443` may be refused. Under tmux, truecolor needs `CLAUDE_CODE_TMUX_TRUECOLOR=1`. | coordinator's spike |
| F12 | ctrl+o redraws the same hooked rows (AssistantMessage has no `isExpanded`), so the source view is `/mermaid-tty source`. | coordinator's spike |
| F13 | Glyphs (matrix rule 12): outside source text, only printable ASCII, the Box Drawing block U+2500–U+257F and section-named glyphs (`►◄▲▼◇●◉`). No non-ASCII glyph has the Unicode `Emoji` property. Heavy edges take heavy corners and junctions; dashed lines bend with light corners; light and heavy lines meet with the block's mixed glyphs. `▶` stays a `width()` test case only. | 8135944, a02e6cc, 994de0e |

## 2. Spike items (S: T0 and the first CI run, recorded in `docs/decisions/task0-spikes.md`; E: the e2e tasks T33–T37)
| # | Question | Fallback |
|---|---|---|
| S2 | Does Node 24 bare `node --test` include `*_test.ts`? | check.ts passes explicit file lists; `fresh-clone.ts` runs both forms |
| S4 | The `@{ shape }` alias list (T4) against `flowchart.md` at the pinned commit. | An unknown name draws rectangle caps (matrix line 66): a miss changes caps, never correctness. |
| S6 | Does the engine accept the hyphenated `$.state` key (`plugin: 'mermaid-tty'`, `PluginState['mermaid-tty']`) for get and set? (T0) | `mermaidTty`, for the `PluginState` key and `SOURCE.plugin`, everywhere |
| S7 | Does a kit test's `$.command.run({ command: 'mermaid-tty', args })` reach the command that `session.start` registers? (T0, T22) | The test sets the state itself with `$.state.set(SOURCE, true)`; the handler is tested as a pure function in `mode_test.ts` |
| E1 | Does node-pty + @xterm/headless drive CC 2.1.308 on Linux and macOS (prompt ready, truecolor cells)? | `--driver tmux` (the proven recipe) on Linux and macOS; PTY on Windows only |
| E2 | Windows launch: the `.cmd` shim via `cmd.exe /d /s /c`, `USERPROFILE`, and the trust-key path form. | Seed both `C:\…` and `C:/…` keys |
| E3 | The 256-color run without tmux: `TMUX=e2e`, with `CLAUDE_CODE_TMUX_TRUECOLOR` unset. | `COLORTERM` unset with `TERM=xterm-256color`; else `--driver tmux` |
| E4 | The options key for a `--plugin-dir` mod in `settings.json` `pluginConfigs`: `mermaid-tty` or `mermaid-tty@inline`? | seed both keys |
| E5 | The clipboard command `/copy` calls: `pbcopy` (proven) on macOS; on Linux `wl-copy`, `xclip` or `xsel`; on Windows `clip.exe` or PowerShell. | Capture OSC 52 from the PTY stream; else the job lists the OS as not run (as A9.stored allows) |
| E6 | `/copy` flow: does it copy the whole reply, or open a code-block picker? | Drive the picker to the flowchart block; assert that the payload contains the fence body byte for byte |
| E7 | Do node-pty prebuilds load on the three runners? | `@homebridge/node-pty-prebuilt-multiarch` |

## 3. Platform rules (macOS, Linux, Windows)
- **Entry:** `scripts/check.sh` is bash 3.2: `#!/usr/bin/env bash`, `set -euo pipefail`, `cd` to the repo root, `claude plugin validate .`, `claude plugin test .`, then `node scripts/check.ts all`. CI runs it with `shell: bash` (Git Bash on Windows), so a native `claude` failure fails CI; no skip is designed in. All other check logic is in `scripts/*.ts`, using `node:path` and `node:child_process`, with no shell-isms.
- **Spawning `claude`:** always `spawnSync('claude', args, { stdio: 'inherit', shell: process.platform === 'win32' })` (the `.cmd` shim), through one helper, `scripts/lib/claude.ts`. A non-zero exit fails the check, and with it `check.sh`.
- **Temp dirs:** only `fs.mkdtempSync(path.join(os.tmpdir(), 'mtty-'))`, removed in `finally`.
- **Line endings:** `.gitattributes` holds `* text=auto eol=lf` and `*.png binary`, so fixtures and goldens compare byte for byte on every OS. `core/source.ts` normalizes `\r\n` and `\r` to `\n` once, at the boundary. `hooks/fences.ts` accepts `\r\n` fence lines and returns prose byte-exact.
- **No OS-specific code** in `core/` or `hooks/`: `check-portable` forbids `process`, `node:` and the rest (A8.portability). Widths come from one table (§6), never from the platform.
- **Glyphs:** every non-source cell comes from `core/glyphs.ts` `GLYPHS`, which is matrix rule 12's set (§6). A golden scan enforces it (A8.platforms).
- **Ownership:** B owns `ci.yml` (ubuntu, macos, windows) and `release.yml`; A ships the stable commands in §9. Only the e2e job installs packages, from `scripts/e2e/package.json` and `package-lock.json`. The root `package.json` has no `dependencies`, so a fresh clone needs no install.

## 4. Test strategy
Every test title starts with its check ID (`A4.width-table: 中 counts 2`). `node scripts/check.ts <ID>` runs the Node tests whose title matches `^<ID>\b`, so a row ID runs all of its labels, and fails if none ran. Kit tests run whole (`claude plugin test .` has no filter).

| Kind | Runner | Files | Proves |
|---|---|---|---|
| Unit | `node --test` | `tests/core/*_test.ts` | width, text, caps, glyphs, themes and palettes, lru, source, canvas, validate (mutations), fit, registry, parsers, layout, route |
| Golden | `node --test` | `tests/golden/*_test.ts`, `fixtures/{flowchart,sequence}/*.mmd`, `goldens/…/*.golden` | every ok fixture renders, validates and matches at 60/80/120; every reject fixture returns `null` (A1–A4) |
| Pure hook | `node --test` | `tests/hooks/*_test.ts` | `splitFences` (CRLF, nesting, unclosed), `parseModeArgs` |
| Kit | `claude plugin test .` | `tests/hooks/*.test.tsx` | A5.errors, A6.hook-tests, A6.command, A7 spans, cache use |
| Script | `node --test` | `tests/scripts/*_test.ts` | check-portable, check-ids, review hashes, tangle, palettes, corpus mix |
| Gates | `node scripts/*.ts` | §9 | no-build, validation, benchmark, corpus, gallery, tangle, palettes, hashes |
| E2E | `node scripts/e2e/run.ts` | `scripts/e2e/*` | A9, with a real CC and a mock API |
| Type check (CI only) | `node scripts/typecheck.ts` | `core/`, plus `hooks/` when `.claude-plugin/types/` exists | strict, erasable TypeScript; PM decision D2, no acceptance ID |

**Golden format** (`goldens/<type>/<fixture-id>.golden`, LF): for each width, `@<cols>` followed by the text rows, then `@<cols> roles` followed by one role row per text row, cell for cell. Role codes: uppercase is source text, lowercase is a drawn glyph. `N`/`n` node, `D`/`d` decision, `e` edge, `a` arrow or end mark, `L` label, `F`/`f` frame, `O`/`o` note (lifelines, `rect`), `T` title, `1`–`8` a series ink (C), `~` the second cell of a wide character, space for empty. `UPDATE_GOLDEN=1` rewrites goldens. A rewrite changes their hashes, which re-opens the review (§10).

## 5. Design check
### 5a. Bottom-up: what exists
| Component | Job | Key files | Depends on | Evidence |
|---|---|---|---|---|
| Spike hook | Splits a reply at its first closed fence, sends prose to `next()`, draws colored `Text` in a `Box` | `spike-mod/hooks/register.tsx` | `claude-code` types | `:3` FENCE regex; `:10` `ui.render` on AssistantMessage; `:21-25` resolve + `next` composition; `:27-41` Box/Text |
| Spike manifest | Loads the hooks module | `spike-mod/.claude-plugin/plugin.json`, `hooks/hooks.json` | — | `plugin.json:1`, `hooks.json:1` `{"modules":["./register.tsx"]}` |
| Generated tsconfig | Hooks typing (`jsx: react`, factory `h`, strict) | `.claude-plugin/types/tsconfig.json` | engine-written, self-gitignored | `:2-29`; `types/.gitignore:1` is `*` |
| Mods API types | Render input, Text props, ThemeKey, ui.log, testing kit | `…/types/claude-code/index.d.ts` | — | `:10177-10210` surface, viewport; `:10320-10350` AssistantMessage props; `:13431` ThemeKey; `:13355-13421` TextProps; `:2450` ui.log; `:16034` mount; `:16888-16925` test options |
| tmux recipe | Live session with the mod | `scripts/spike-runner.sh` | tmux, claude | `:3` `claude --plugin-dir … --permission-mode bypassPermissions` |
| Specs | Normative contract | `docs/specs/*.md` | — | acceptance A1–A10; matrix lines 5–200 and 1665+ |
| Mermaid 12.2.0 copy | Grammar reference (detectors, other types' jison) | `mermaid-12.2.0-src/*.txt` (46) | — | no flowchart or sequence grammar (matrix lines 84 and 158): the docs syntax rules |
| Repo | README placeholder, LICENSE, specs; no code | — | — | `1dbf48a` tree |

**Reuse:** the `next()` composition and Box/Text drawing (`register.tsx:21-41`); the tmux recipe (`--driver tmux`); the tsconfig options (in a committed, editor-only `tsconfig.json`). **Replace:** the spike's single-fence regex, which ignores nesting and every fence after the first, with a line-based splitter. Everything else is new: the repo has no code.

### 5b. Top-down: requirements → responsibilities → components
| Req | Responsibilities | Components |
|---|---|---|
| R1 | header and direction; shapes and `@{shape}`; quoted and `<br/>` labels; edges (kinds, ends, labels, chains, `&`, IDs, `~~~`); subgraphs; comments and frontmatter; ignored directives | `source`, `registry`, `diagrams/flowchart/parse`, `caps` |
| R2 | participants, actors, aliases; 10 arrows; activations; notes; frames; autonumber; rect, box, create, destroy | `diagrams/sequence/parse` |
| R3 | one row per label line; caps carry the shape | `caps`, `text`, `graph/draw`, `diagrams/sequence/layout` |
| R4 | `width`, `unsupported`, wrapping; the fit ladder; fallback below the minimum | `width`, `width-table`, `text`, `fit`, `diagrams/*/layout` |
| R5 | five invariants plus label adjacency; `null` on a parse error or unsupported type; the reason in the debug log only | `validate`, `canvas` (conflict log), `render`, `hooks/register` |
| R6 | prose to `next()` byte for byte; read-only props kept; unclosed fences untouched; `/mermaid-tty source\|diagram` in `$.state`; `isExpanded` pass-through; `/copy` exact | `hooks/fences`, `hooks/mode`, `hooks/register`, `types/mermaid-tty.d.ts` |
| R7 | 7 roles → ThemeKeys by default; 5 palettes; contrast and OKLab | `themes`, `color`, `hooks/register` (spans) |
| R8 | no deps, no build, validate, p90, LRU 64, 3 OSes, LF, glyph allow-list | `package.json`, `lru`, `render`, `glyphs`, `.gitattributes`, `scripts/*` |
| A9 | mock API, PTY driver, screen reader, theme-aware assertions, stored transcript, `/copy`, 256-color run | `scripts/e2e/*` |
| A10 | ≥ 90 synthetic blocks with the owner's mix; a private path on the Mac | `scripts/gen-corpus.ts`, `fixtures/corpus/`, `scripts/corpus-gate.ts` |
| VR | gallery, tangle, palettes, review hashes | `scripts/{render-svg,render-gallery,check-tangle,check-palettes,check-review-hashes}.ts` |

### 5c. Reconcile: one normal path, one failure path
- **Normal:** on the terminal at 100 columns, under nord, in diagram mode, the reply is `Intro⏎```mermaid⏎flowchart LR⏎A[读取配置文件] --> B[完成]⏎```⏎Done`. `splitFences` returns [prose, fence, prose]. `renderer.render(body, {columns:100, theme:'nord'})` misses the cache. `readSource` normalizes and finds `flowchart`. `lookup` → `flowchart.parse` → ladder `natural` → `layoutGraph` → `routeGraph` → `drawGraph` → `validate` passes → `toRows`. The hook returns `Box(column)[ next(prose₁, first:true), Box key=mermaid-0 [Text rows], next(prose₂, first:false) ]`.
- **Failure:** the same reply with `A[👨‍👩‍👧]`. `unsupported()` finds U+200D, so the result is `{ reason: 'unsupported-char U+200D' }`, cached. `$.ui.log('mermaid-tty fallback: unsupported-char U+200D', { to: 'debug' })` runs once per miss. The fence text merges back into the neighbouring prose, giving one `next()` with the original text: the tree is identical to having no mod.
- **Decisions raised (not guessed):** D1 module homes; D2 the type check runs outside check.sh; D3 A creates `render-svg.ts`; D4 failed fences re-merge; D5 a diagram-first reply keeps its bullet. All are in §8; the PM settled D2 and D5 on 2026-10-28.

### 5d. Component map (each row passes the fitness check: one job, one-way dependencies, an interface smaller than what it hides, the likely change stays local, testable through the interface)
| Component | Job | Interface | Reuses or extends | Likely change | Test seam |
|---|---|---|---|---|---|
| `core/width.ts` + `width-table.ts` | Measures display columns | `width`, `unsupported`, `isWide` | generated EAW table | a Unicode update (regenerate the table) | table test A4.width-table |
| `core/text.ts` | Splits labels into lines and wraps them by width | `labelLines`, `wrap` | width | the wrap policy | unit |
| `core/glyphs.ts` + `box-table.ts` | Lists every glyph the renderer may emit and picks box glyphs by arm weight | `GLYPHS`, `boxGlyph`, `junction`, `isAllowed` | matrix rule 12; UnicodeData names | a new section-named glyph | golden scan A8.platforms; 80-entry table test |
| `core/caps.ts` | Gives each shape its caps and resolves `@{shape}` aliases | `CAPS`, `capsFor`, `shapeFromName` | matrix End caps | C adds shapes | A3 mono-distinct |
| `core/themes.ts` + `color.ts` | Maps roles and series to colors | `THEMES`, `palette`, `contrast`, `oklabDistance` | CC ThemeKeys | a new palette | A7, palette checks |
| `core/lru.ts` | Bounded recency cache | `createLru(cap)` | — | — | A8.cache |
| `core/source.ts` | Normalizes text and reads frontmatter, comments and the header | `readSource` | — | a new common rule | unit |
| `core/registry.ts` | Maps keywords to modules or fallback | `lookup`, `ENABLED`, `KEYWORDS` | — | C enables a type | unit |
| `core/canvas.ts` | Cell grid with owners, a write policy and a conflict log | `createCanvas`, `put*`, `toDrawing` | width, glyphs | a new cell kind | unit, mutations |
| `core/validate.ts` | Five invariants plus label adjacency | `validate(drawing, expect)` | canvas types | C's legend counting | A5.mutation-tests |
| `core/fit.ts` | Runs ladder steps until one fits | `fitLadder` | validate | a new step name | A4.fit-ladder |
| `core/graph/model.ts` | Shared node, edge and cluster model (multi-row nodes) | types only | — | C's member rows | via layered and draw |
| `core/graph/layered.ts` | Ranks, order and grid coordinates | `layoutGraph(g, spacing)` | technique: Sugiyama | crossing tuning | unit |
| `core/graph/route.ts` | Orthogonal tracks and ports | `routeGraph(placed)` | — | doglegs | unit |
| `core/graph/draw.ts` | Draws a placed and routed graph on a canvas | `drawGraph(placed, routes)` | canvas, caps | a new edge end | unit and golden |
| `core/diagrams/flowchart/*` | Turns flowchart text into a graph, plus its ladder steps | `flowchart: DiagramModule` | graph/* | grammar additions | A1 fixtures |
| `core/diagrams/sequence/*` | Turns sequence text into a drawing, plus its ladder steps | `sequence: DiagramModule` | canvas, text | grammar additions | A2 fixtures |
| `core/render.ts` | The public entry, explain, cache and spans | `renderMermaid`, `explain`, `createRenderer`, `toRows` | all of core | — | smoke, A8.cache |
| `hooks/fences.ts` | Splits a reply into prose and closed fences | `splitFences` | — | fence rules | pure Node test |
| `hooks/mode.ts` | Parses `/mermaid-tty` arguments and the reply text | `parseModeArgs`, `modeReply` | — | a new subcommand | pure Node test |
| `hooks/register.tsx` | Wires the render hook, the command and the state | `register` | spike composition | API drift | A5, A6, A7 kit |
| `scripts/check.ts` + `check.sh` + `lib/claude.ts` + `lib/check-ids.ts` | The single must-pass entry, with per-ID steps; the one check-ID parser (B7's rules; B imports it) | `node scripts/check.ts <ID\|all>`; `parseIds`, `slug`, `diffIds` | — | B and C append to `CHECKS` | check-ids test |
| `scripts/{check-portable,fresh-clone,bench}.ts` | Checks for A8 | CLI | core/render | new forbidden tokens | script tests |
| `scripts/{gen-corpus,corpus-gate}.ts` | A10 corpus | CLI `DIR` | fences, render | mix targets | mix test |
| `scripts/{render-svg,render-gallery}.ts` | SVG cells and the gallery artifact | `rowsToSvg`, CLI `OUT_DIR` | render | B's assets | VR.gallery self-check |
| `scripts/{check-tangle,check-palettes,check-review-hashes}.ts` + `lib/tangle.ts` | Visual-review CI checks | CLI | render, themes, color | rule tweaks | script tests |
| `scripts/typecheck.ts` + `TS_VERSION` | Type-checks `core/` (and `hooks/` when the engine types exist) with a pinned TypeScript in its own dir | CLI | PM decision D2 (CI only, no acceptance ID) | a TypeScript bump | `tsconfigFor` unit test |
| `scripts/e2e/*` | A9 harness | `run.ts [--claude-version V] [--installed CONFIG_DIR] [--theme T\|all] [--color 256] [--driver pty\|tmux] [--scenario harness\|source-view\|stored\|lead]` | F11 recipe | CC drift | itself plus mock unit test |

Dependencies point one way: `width ← text ← canvas ← validate ← fit`; `caps, glyphs, themes → canvas → graph/draw`; `graph/* ← diagrams/* ← registry ← render ← hooks`; `scripts → core` and the pure `hooks/fences.ts`. Nothing duplicates existing code; the repo has none.

## 6. Exported interfaces (fixed here; A2–A4 tasks implement them; C builds on them)
```ts
// core/fail.ts — the one fallback result
export type Fail = { reason: string }
export const fail = (reason: string): Fail => ({ reason })
export const isFail = (x: unknown): x is Fail => typeof x === 'object' && x !== null && 'reason' in x
// core/width.ts
export function width(s: string): number               // W/F 2; Mn/Me, U+200B/200C/2060/FEFF 0; else 1 (box drawing, ◇, ▶ too)
export function unsupported(s: string): string | null   // first ZWJ, variation selector (U+FE00–FE0F, U+E0100–E01EF), regional indicator, emoji modifier, Cc or other Cf, as 'U+XXXX'
export function isWide(cp: number): boolean             // binary search over WIDE in core/width-table.ts (generated, committed)
// core/text.ts
export type Piece = { text: string; join: '' | ' ' | '\n' }   // how this piece attaches to the previous one
export function labelLines(label: string): string[]          // split at <br>, <br/>, <br />
export function wrap(line: string, max: number): Piece[] | null  // at spaces or between W/F chars; null if one word > max
// core/glyphs.ts — printable ASCII plus the matrix-named non-ASCII glyphs; none has \p{Emoji}
export const GLYPHS: ReadonlySet<string>  // matrix rule 12: printable ASCII, Box Drawing U+2500–U+257F, ►◄▲▼◇●◉; no non-ASCII \p{Emoji}
export function boxGlyph(arms: string): string           // arms 'urdl', each 0 none / 1 light / 2 heavy → a Box Drawing glyph, mixed weights included (rule 12)
export function junction(dirs: number, weight: 'light' | 'heavy' | 'dotted'): string  // dirs: 1 up 2 right 4 down 8 left; a straight dotted run is ┄/┆, and it bends light
// core/caps.ts — the matrix End caps table, all types
export type Shape = 'rect' | 'round' | 'stadium' | 'subroutine' | 'cylinder' | 'hcyl' | 'circle' | 'dcircle' | 'diamond'
  | 'hexagon' | 'leanR' | 'leanL' | 'trap' | 'trapInv' | 'asym' | 'bang' | 'cloud' | 'arrowR' | 'arrowL' | 'arrowU' | 'arrowD' | 'plain'
export const CAPS: Readonly<Record<Shape, readonly [left: string, right: string]>>
export function shapeFromName(name: string): Shape       // @{shape: name}: alias → row; any other name → 'rect'
// core/themes.ts — palette shape is a sub-project B dependency: keep stable
export type Role = 'node' | 'decision' | 'edge' | 'arrow' | 'label' | 'frame' | 'note' | 'title' | 'value'
export type SeriesKey = 's1' | 's2' | 's3' | 's4' | 's5' | 's6' | 's7' | 's8'
export type Ink = Role | SeriesKey                         // a cell's color source: a role, or a series color (C)
export type ThemeName = 'default' | 'nord' | 'dracula' | 'gruvbox' | 'solarized' | 'mono'
export type Color = string                                 // a CC ThemeKey ('suggestion') or '#rrggbb'
export type Palette = {
  name: ThemeName
  background: Color | null                                 // the palette's canvas; null = the terminal's (default, mono)
  roles: Readonly<Record<Role, Color | null>>              // null = no color (mono)
  onFill: Color | null                                     // label text on a role-filled pill
  series: Readonly<Record<SeriesKey, Color | null>>        // mono: all null (series differ by glyph, key or position)
  fill: boolean                                            // false in mono: no backgrounds
  dim: readonly Role[]                                     // drawn with dimColor: [] in every theme (dimColor is itself a color; mono carries none)
}
export const THEMES: Readonly<Record<ThemeName, Palette>>
export function palette(name: string): Palette            // unknown name → THEMES.default
// core/color.ts
export function contrast(a: string, b: string): number    // WCAG ratio of two '#rrggbb'
export function oklabDistance(a: string, b: string): number
// core/lru.ts
export type Lru<K, V> = { get(k: K): V | undefined; set(k: K, v: V): void; readonly size: number }
export function createLru<K, V>(capacity: number): Lru<K, V>
// core/source.ts — CRLF/CR → LF once; frontmatter title; skips blank and whole-line %% lines
export type Source = { header: string; title: string | null; lines: readonly { n: number; text: string }[] }
export function readSource(text: string): Source | Fail   // 'directive' (%%{…}%%, trailing %%) | 'empty' | 'frontmatter'
// core/registry.ts
export type DiagramType = 'flowchart' | 'sequence' | 'state' | 'class' | 'er' | 'requirement' | 'c4' | 'architecture' | 'gantt'
  | 'pie' | 'xychart' | 'quadrant' | 'journey' | 'sankey' | 'radar' | 'treemap' | 'mindmap' | 'gitGraph' | 'timeline'
  | 'kanban' | 'block' | 'packet' | 'zenuml'
export const KEYWORDS: Readonly<Record<string, DiagramType | null>>  // every keyword and alias; null = explicit fallback
export const ENABLED: ReadonlySet<DiagramType>                      // A: flowchart, sequence
export type DiagramModule<M = unknown> = {
  type: DiagramType
  parse(src: Source): M | Fail
  steps(model: M): readonly Step[]                                  // the type's ladder
  layout(model: M, step: Step, columns: number): Drawing | Fail
}
export function lookup(header: string): DiagramModule | Fail        // 'unknown-type' | 'disabled:<type>'
```
```ts
// core/canvas.ts — a cell grid with owners, a write policy and a conflict log
export type Kind = 'text' | 'cap' | 'fill' | 'line' | 'arrow' | 'frame' | 'title' | 'lifeline' | 'cont'  // cont = 2nd cell of a W/F char
export type Cell = { ch: string; role: Ink; kind: Kind; owners: readonly string[]; dirs: number; join?: Piece['join']; arms?: string; style?: 'light' | 'heavy' | 'dotted' }  // arms: per-arm weights 'urdl'
export type Conflict = { row: number; col: number; had: string; by: string }
export type Drawing = { columns: number; cells: (Cell | null)[][]; conflicts: readonly Conflict[]; expect: Expect }
export type Canvas = {
  text(r: number, c: number, s: string, role: Ink, owner: string | readonly string[], join?: Piece['join']): number  // columns used; owners[0] owns the text
  cap(r: number, c: number, s: string, role: Ink, owner: string): void
  fill(r: number, c: number, n: number, role: Ink, owner: string): void
  line(r: number, c: number, dirs: number, weight: 'light' | 'heavy' | 'dotted', role: Ink, owner: string): void
  arrow(r: number, c: number, ch: string, owner: string): void
  frame(top: number, left: number, bottom: number, right: number, role: Ink, owner: string, title?: string): void
  lifeline(r: number, c: number, heavy: boolean, owner: string): void
  toDrawing(expect: Expect): Drawing
}
export function createCanvas(rows: number, cols: number, columns: number, shares?: (a: string, b: string) => boolean): Canvas  // shares: may two owners merge a line cell (default a === b)
// Write policy: text, cap, fill, arrow and title cells are exclusive, so any later write is a Conflict. A line on a line merges arm by arm
// when the owners share an endpoint, light and heavy arms meeting in their mixed glyph (rule 12); unrelated owners may only cross
// straight and perpendicular (┼ ╂ ┿ ╋). One arm claimed with two weights, or anything else, is a Conflict.
// A line on a frame or lifeline replaces it; a frame or lifeline on a line is a no-op.
// core/validate.ts
export type Expect = {
  labels: readonly { owner: string; text: string }[]                 // every label instance, keyed by owner id
  edges: readonly { id: string; from: string; to: string; heads: readonly string[] }[]  // drawn edges; ~~~ is not listed
  edgeLabels: readonly { owner: string; edge: string }[]
}
export function validate(d: Drawing): Fail | null  // label-missing | label-dup | edge-disconnected | head-on-junction | overwrite | row-too-wide | label-not-adjacent
// core/fit.ts
export type Step = 'natural' | 'tight' | 'wrap' | 'lrToTd'          // C widens this union with its own steps
export function fitLadder<M>(mod: DiagramModule<M>, model: M, columns: number): { step: Step; drawing: Drawing } | Fail
// core/graph/model.ts — shared by flowchart now; by state, class, ER, requirement, C4 and architecture in C
export type Dir = 'TB' | 'BT' | 'LR' | 'RL'
export type NodeRow = { text: string; role: Role; align: 'center' | 'left'; id?: string }  // rows[0] is the header; C's member rows carry their own id (default: the node's)
export type GNode = { id: string; shape: Shape; role: Role; rows: NodeRow[]; order: number }
export type End = 'arrow' | 'circle' | 'cross' | 'none'
export type GEdge = { id: string; from: string; to: string; style: 'solid' | 'dotted' | 'thick' | 'invisible'
  tail: End; head: End; label: string | null; minlen: number; order: number }
export type GCluster = { id: string; title: string | null; dir: Dir | null; nodes: string[]; clusters: string[] }
export type Graph = { dir: Dir; title: string | null; nodes: GNode[]; edges: GEdge[]; clusters: GCluster[] }
// core/graph/{layered,route,draw}.ts
export type Box = { row: number; col: number; rows: number; cols: number }
export type Spacing = { rankGap: number; nodeGap: number; wrapAt: number | null }
export type Placed = { graph: Graph; boxes: ReadonlyMap<string, Box>; frames: ReadonlyMap<string, Box>; rows: number; cols: number }
export function layoutGraph(g: Graph, s: Spacing): Placed | Fail
export type Route = { edge: string; cells: readonly { r: number; c: number; dirs: number }[]; ends: readonly { r: number; c: number; ch: string }[] }
export function routeGraph(p: Placed): Route[] | Fail              // 'route-conflict' when the channel constraints form a cycle
export function drawGraph(p: Placed, routes: readonly Route[], columns: number): Drawing
// core/diagrams/flowchart/layout.ts and core/diagrams/sequence/layout.ts
export const flowchart: DiagramModule<Graph>
export const sequence: DiagramModule<Seq>                          // Seq is defined in sequence/parse.ts
// core/render.ts
export type Span = { text: string; role?: Role; color?: Color; backgroundColor?: Color; bold?: boolean; dimColor?: boolean }  // the hook strips role
export type Rows = Span[][]
export type Options = { columns: number; theme?: string }  // theme defaults to 'default'
export function renderMermaid(source: string, o: Options): Rows | null                       // spec A's signature
export function explain(source: string, o: Options): { step: Step; drawing: Drawing } | Fail  // tests and scripts
export function toRows(d: Drawing, p: Palette): Rows
export function createRenderer(capacity?: number, inner?: typeof explain): { render(s: string, o: Options, onMiss?: (f: Fail) => void): Rows | Fail; readonly size: number }
// hooks/fences.ts and hooks/mode.ts
export type Segment = { kind: 'prose'; text: string } | { kind: 'mermaid'; text: string; body: string }
export function splitFences(reply: string): Segment[]             // segments join back to exactly `reply`; CRLF accepted
export type Mode = 'diagram' | 'source'
export function parseModeArgs(args: string): { set: Mode } | { report: true } | { error: string }
export function modeReply(mode: Mode, changed: boolean): string
```
**What C builds on:** the shared model with multi-row nodes (`Graph`, `GNode.rows`); `layoutGraph`, `routeGraph` and `drawGraph`; `createCanvas` and `Drawing`; `validate`; `KEYWORDS`, `ENABLED`, `lookup` and `DiagramModule`; `Palette.series` (s1–s8, cycling in source order; a cell takes one through `Ink`); `CAPS` and `shapeFromName`; `width`, `unsupported` and `wrap`; `fitLadder` and the `Step` union. **Legend:** A keys nothing, so A ships no legend (YAGNI). C adds `core/charts/legend.ts`. It needs no change in A: `validate` counts text cells per owner, so a legend row owned by the item is that item's one instance (matrix rule 7, rule 10).

## 7. Algorithms and constants (normative for A2–A4)
**Flowchart parse** (matrix lines 72–121; flowchart.md syntax):
- **Header:** `flowchart` or `graph`, optionally followed by TD, TB, BT, LR or RL; a bare header is TB, as in Mermaid (`flowchart-ok-49`). Statements split at newlines and at `;` outside quotes.
- **Node id:** `/^[\p{L}\p{N}_]+(?:[.-][\p{L}\p{N}_]+)*/u`, so `A-->B` reads as `A`, `-->`, `B`.
- **Shapes:** openers are tried longest first: `(((` `([` `[[` `[(` `((` `{{` `[/` `[\` `(` `[` `{` `>`. The closer must pair with its opener (`[/ /]` leanR, `[\ \]` leanL, `[/ \]` trap, `[\ /]` trapInv). `@{ shape: n, label: "t" }` uses `shapeFromName`; other keys are ignored. The last label given to a node wins.
- **Labels:** `"…"` keeps punctuation. `<br>`, `<br/>` and `<br />` become lines. A markdown string (`` "`…`" ``) and `#…;` entities fall back.
- **Links:** `(<|o|x)?(-{2,}|={2,}|-\.+-)(>|o|x)?`, plus the text forms `-- t -->`, `== t ==>` and `-. t .->`; `~~~` is invisible. `minlen` is 1 plus the extra dashes. Labels are written `|t|`; an edge ID is an `id@` prefix. Chains and `&` expand into the cross product.
- **Subgraphs:** `subgraph id`, `id [t]`, `id ["t"]` or `"t"`; they nest, take `direction X`, and close with `end`. An edge may end at a subgraph id only when that subgraph is sealed; otherwise it falls back with 'cluster-edge'.
- **Ignored:** `classDef`, `class`, `style`, `linkStyle`, `click`, `accTitle`, `accDescr` (including `{…}` blocks), a `:::name` suffix, and `id@{…}` on a known edge id. Anything else falls back.

**Layered layout** (`layoutGraph`):
1. Break cycles by DFS in source order; back edges are reversed and drawn with their ends swapped.
2. Ranks are longest-path. A labelled edge has `minlen ≥ 2`, and its label is a node on the middle rank.
3. Dummies fill spans over 1, each owned by the innermost cluster that holds both ends.
4. Order: source order first, then 8 alternating barycenter sweeps; ties keep source order. Cluster members stay contiguous, as blocks ordered by their mean barycenter. Keep the order with the fewest crossings.
5. Cross axis: left-pack with `nodeGap`, plus a border and one pad cell per cluster level. Then two median pulls, dummies first, that keep the separation. A cluster is a strip: no non-member enters its span on any rank it covers.
6. Main axis: each rank band is as tall as its tallest node. Each gap is `max(rankGap, tracks + 2)` plus one row for every cluster border that ends or starts there (a top border carries the title).
7. A sealed subgraph (no edge crosses its border) with its own `direction` is laid out recursively and placed as one block. An open subgraph inherits its parent's direction, as Mermaid does.
8. Layout runs in TB. LR swaps the axes (text stays horizontal); BT and RL mirror the main axis.

| Step | TB rankGap / nodeGap | LR rankGap / nodeGap | wrapAt tried |
|---|---|---|---|
| natural | 3 / 4 | 6 / 1 | — |
| tight | 2 / 2 | 4 / 1 | — |
| wrap | 2 / 2 | 4 / 1 | 24, 20, 16, 12, 8 |
| lrToTd (LR and RL only) | 2 / 2, drawn as TB (RL → BT) | — | —, then 24…8 |

A pill is `capL ␠ text ␠ capR`; in color themes the fill covers the two spaces and the text. A sequence ladder is natural, tight, wrap; after that it falls back.

**Router:**
- One port for each (node, face, style, end) group: edges of equal style and end share a stem. Other ports spread across the face, sorted by the far end's cross position, and are nudged so that no top pin shares a column with a bottom pin in the same channel when the face is wide enough.
- Every gap is a channel, with one net per source port. Each net gets a horizontal track, assigned by the left-edge algorithm under vertical constraints. A cyclic constraint fails with 'route-conflict', and the ladder moves on. A gap's rows are its tracks, one straight in-stem row, then the head row, so no head sits on a junction or crossing.
- Ends: `►◄▲▼` sit in the cell before the target face; the circle is `o` and the cross is `x` (ASCII); with no end, the line meets the face.
- Lines are light for solid, heavy for thick (heavy corners and junctions), and `┄`/`┆` for dotted, which bend with light corners. A cell's glyph is `boxGlyph(arms)`, so light and heavy lines meeting in one cell (a crossing, or a shared endpoint) take the matching mixed glyph (`┠`, `╂`, `┿`, …).

**Sequence layout:**
- **Lifelines:** one x per participant, in declaration order. A neighbour gap is the largest of: the pill halves + 2, the widest label spanning only that gap + `pad`, and 2 × the frame borders between them. A message that spans several gaps spreads its need evenly over them.
- **Rows:** the header pills. Each message takes a label row and a line row. A self-message takes a label row, then `─┐`, then `◄┘`. A note takes one row per line.
- **Frames:** a top border titled `kind [cond]`, a dashed divider for `else`, `and` and `option`, and a bottom border. `rect` is a dim, untitled frame. `box` is a titled frame around adjacent columns.
- **Lifeline state:** activation draws `┃`; create puts the pill on its creating row; destroy ends the lifeline at its message.
- **Layers:** lifeline < frame < line < arrow, text and cap. A higher layer replaces a lower one without a conflict.
- **Spacing:** `pad` is 4 for natural and 2 for tight; the wrap step wraps labels and notes at 24…8.
- **Title:** frontmatter or a `title` statement draws a bold title row; a second title falls back (`sequence-reject-08`).

**Validate:**
- **Labels:** a text cell's owner is its `owners[0]`. Join each owner's text runs in reading order, using each run's `join`, and compare with the expected text. Count instances per owner.
- **Edges:** BFS over each edge's cells, following matching dirs bits. The edge must touch both endpoints and carry each head next to its end node. The cell behind a head may not be a junction (3 or more directions) → `head-on-junction`.
- **Conflicts:** the conflict log must be empty.
- **Width:** every row satisfies `width(row) ≤ columns`.
- **Edge labels:** every edge-label cell lies within 1 cell (Chebyshev) of its edge.

## 8. Design comparison and decisions
| Choice | Chosen | Alternative | Why |
|---|---|---|---|
| Layout | Our own layered layout (§7) | Port termaid | Spec: "we own the renderer". The termaid port is the R1 fallback. |
| Subgraphs | Open subgraphs become flattened strips; sealed ones become recursive compartments | Compartments for every subgraph (GPT-6) | Mermaid honors a subgraph's `direction` only when no edge crosses its border, which is our sealed case; an open subgraph needs edges through its border. Subgraphs are 3.4% of the owner's corpus (§12). |
| D1 Module homes | `core/diagrams/<type>/{parse,layout}.ts` plus a shared `core/graph/` | Spec A's `core/parse/`, `core/layout/` | Same jobs, one convention for all 23 types (C). Recorded here. |
| Overwrite detection | Canvas conflict log | Diffing the final grid | The grid cannot show what was overwritten. |
| Edge labels | A rank of their own | Inline on the edge | Spec A; inline labels collide with tracks. |
| D4 Failed fence | Merged back into the neighbouring prose, as one `next()` | One `next()` per segment | Identical to having no mod (A5.errors). |
| Mode store | `$.state`, with `/mermaid-tty` | `userConfig` | Spec (8b2f51e); F10 proves it. |
| Tangle check | An independent `scripts/lib/tangle.ts` over `Drawing` owners | Reusing `validate` | A bug shared by both would hide itself. |
| E2E driver | node-pty + @xterm/headless on every OS | tmux on Linux and macOS | One code path, which Windows needs. `--driver tmux` stays for E1 and for the PM's runtime proof. |
| D2 Type check | A separate CI step: a pinned TypeScript via npx, in its own dir, over `core/`, plus `hooks/` when `.claude-plugin/types/` exists (T39) | `tsc` in check.sh | PM decision (2026-10-28): a fresh clone still needs no install. No acceptance ID. |
| D3 SVG | A creates `scripts/render-svg.ts`; B extends it for README assets (B1) | B creates it | A's gallery (VR.gallery) needs it first. |
| D5 Diagram-first reply | Keep the bullet: `next()` with empty prose before a leading diagram | No bullet | PM decision (2026-10-28). T35's lead check falls back to no bullet only if the empty prose draws an extra row; T21's hook test pins the winner. |

## 9. The must-pass entry and the check-ID commands
```bash
#!/usr/bin/env bash
# scripts/check.sh: the single must-pass entry (CI: shell: bash; Git Bash on Windows).
# Sub-projects B and C add rows to CHECKS in scripts/check.ts, not lines here.
set -euo pipefail
cd "$(dirname "$0")/.."
claude plugin validate .
claude plugin test .
node scripts/check.ts all
```
`scripts/check.ts <ID|all>` looks up `CHECKS: { id, argv[][], kit?, inAll }[]`.
- `argv[0]` may be `node`, which becomes `process.execPath`, or `claude`, which goes through `scripts/lib/claude.ts` (`shell: true` on win32).
- A `node --test` row lists files with a recursive `readdirSync` walk, never a shell glob. It runs `--test-name-pattern '^<ID>\b'` and fails when 0 tests ran (the TAP `# tests 0`).
- `all` runs `@nt` once and every other distinct step once, except `@kit` and `claude plugin validate .`, which `check.sh` runs itself. It stops at the first non-zero exit.
- **B7 binding:** each A check ID runs as `node scripts/check.ts <ID>` unless the table gives another command.

| Check ID | Stable command | In `all` | Task |
|---|---|---|---|
| A1, A2, A3 | `node scripts/check.ts A1` (and A2, A3): golden and unit tests | yes | T20, T25, T20 |
| A4, A4.width-table, A4.fit-ladder | `node scripts/check.ts A4.width-table` (and the others) | yes | T2, T12, T20, T25 |
| A5, A5.mutation-tests, A5.errors | `node scripts/check.ts A5.errors`; `.errors` and `A5` also run the kit | yes | T11, T19, T21 |
| A6, A6.hook-tests, A6.command | `node scripts/check.ts A6.command`: Node tests plus `claude plugin test .` | yes | T8, T21, T22 |
| A6.in-claude-code | `node scripts/e2e/run.ts --scenario source-view` (the e2e job) | no | T35 |
| A7 | `node scripts/check.ts A7`: theme units plus the kit span test | yes | T5, T21 |
| A8.portability | `node scripts/check-portable.ts` | yes | T27 |
| A8.benchmark | `node scripts/bench.ts fixtures` (p90 ≤ 50 ms; ≤ 200 ms when `CI` is set) | yes | T28 |
| A8.cache | `node scripts/check.ts A8.cache` | yes | T6, T19 |
| A8.no-build | `node scripts/fresh-clone.ts` (clones HEAD into `os.tmpdir()`; runs bare and globbed `node --test`, `claude plugin test .` and `node scripts/smoke.ts`) | yes | T27 |
| A8.validation | `node scripts/check.ts A8.validation`, which runs `claude plugin validate .` | yes | T1 |
| A8.platforms | `node scripts/check.ts A8.platforms`: `.gitattributes`, the golden glyph scan, the no-OS-code scan | yes | T3, T20, T27 |
| A8 | `node scripts/check.ts A8`: all of the above | yes | — |
| A9, A9.harness | `node scripts/e2e/run.ts` (the pinned `scripts/e2e/CLAUDE_VERSION`; all themes, the 256-color run, source view, lead) | no | T33–T35 |
| A9.stored | `node scripts/e2e/run.ts --scenario stored` | no | T36 |
| A9.release | `node scripts/e2e/run.ts --installed "$CLAUDE_CONFIG_DIR"` (B's release.yml installs from the marketplace into that dir first) | no | T37 |
| A10 | `node scripts/corpus-gate.ts fixtures/corpus`; on the Mac also `--private <dir>` | yes | T29 |
| VR.gallery | `node scripts/render-gallery.ts OUT_DIR` (CI uploads OUT_DIR; it self-checks glyph x = col × cell) | yes (tmp dir) | T30 |
| VR.tangled | `node scripts/check-tangle.ts` | yes | T31 |
| VR.reviewers | `node scripts/check-review-hashes.ts --require-pass` (record format, hashes, and a pass for every required scope) | yes | T32 |
| VR.passes | `node scripts/check-review-hashes.ts --require-pass`: the merge gate; CI stays red until each verdict is recorded (PM, 2026-10-28) | yes | T32 |
| VR.in-ci | `node scripts/check.ts VR.in-ci`: gallery self-check, tangle, `check-palettes.ts` | yes | T5, T30, T31, T38 |
| — (CI type check, D2) | `node scripts/typecheck.ts`: B binds a CI step to it; no check ID | no | T39 |

These are A's 31 of the 48 IDs, matching B2's `IDS48`; B owns the other 17. One parser, `scripts/lib/check-ids.ts` (T1), serves `scripts/check-ids.ts` (T1, T38) and B's `check-ci-coverage.ts`, so the two cannot drift. It fails when an A or VR ID has no row here, or when a row names an ID the doc lacks.

## 10. Review verdict record (`docs/reviews/<date>-<scope>.md`; `check-review-hashes.ts` reads it; a B dependency, keep stable)
```markdown
---
scope: vr-A                 # a slug: vr-A, vr-C-<type>, beauty, translation, …
verdict: pass               # pass | fail
date: 2026-11-02
reviewers: [PM, cross-family:<model id>]
---
## Files
| path | sha256 |
|---|---|
| goldens/flowchart/flowchart-ok-01.golden | <64 lowercase hex, the SHA-256 of the file's bytes> |
| core/themes.ts | <64 hex> |
## Notes
- <finding> → <fix commit, or "accepted">
```
- **Integrity (CI, VR.reviewers):** for every record, the front matter has exactly these keys, and every Files row names an existing file whose current SHA-256 matches. A mismatch exits 1, listing the path, the recorded hash and the actual hash.
- **Merge gate (VR.reviewers, VR.passes, B1.beauty-review, B2.translation-review):** CI always runs `--require-pass`. `docs/reviews/required.json` maps each scope to path globs (A seeds `vr-A` → `goldens/**`, `core/themes.ts`; B adds `beauty` and `translation`), and every path needs a `verdict: pass` record of its scope. CI stays red until the reviews are recorded (PM, 2026-10-28).
- **Helper:** `--table <paths…>` prints the Files rows for reviewers to paste.

## 11. Traceability (every requirement has a task; every task has a requirement)
| Requirement or check | Tasks |
|---|---|
| R1 flowchart syntax · A1 | T7, T13, T14, T15, T19, T20 |
| R2 sequence syntax · A2 | T23, T24, T25 |
| R3 flat nodes · A3 | T4, T9, T18, T20, T24 |
| R4 width · A4.width-table · A4.fit-ladder | T2 · T9, T12, T19, T20, T25 |
| R5 fail closed · A5.mutation-tests · A5.errors | T10, T11 · T19, T21 |
| R6 source preserved · A6.hook-tests · A6.command · A6.in-claude-code | T8, T21 · T22 · T35, T36 |
| R7 colors · A7 | T5, T21, T35 |
| R8 zero install · A8.portability · .benchmark · .cache · .no-build · .validation · .platforms | T27 · T28 · T6, T19 · T27 · T1 · T0, T3, T7, T8, T20, T27 |
| A9.harness · A9.stored · A9.release · scheduled per-CC-version run | T33, T34, T35 · T36 · T37 · T35 (`--claude-version`; B's `cc-versions.ts` picks the versions) |
| A10 corpus (CI synthetic ≥ 90; Mac private 87) | T29 |
| VR.gallery · VR.in-ci · VR.tangled · VR.reviewers · VR.passes | T30 · T5, T30, T31 · T31 · T32 (`--require-pass`) · T32 + PM (merge gate) |
| Runtime proof | T35 `--driver tmux` on the Mac (the PM runs it). **Windows and Linux evidence:** CI runs `scripts/check.sh` (`node --test`, `claude plugin validate .`, `claude plugin test .`) and the A9 job on each OS. |
| `/mermaid-tty source\|diagram` toggle; `isExpanded` pass-through | T22, T35 · T21 |
| Platform rules (§3) | T0, T1, T3, T7, T8, T20, T27 |
| B7 check-ID binding (§9) | T1, T38 |
| CI type check (PM decision D2; no acceptance ID) · diagram-first bullet (D5) | T39 · T21, T35 |
| flowchart-ok-01…06 headers · -49 bare header · -07…18 shapes · -19, -20 `@{shape}` · -21, -22 labels | T13, T20 |
| flowchart-ok-23…29 edge kinds and ends · -30, -31 edge labels · -32, -33 chains and `&` · -46 `~~~` · -47 edge IDs · -50…52 thick bend, thick/solid junction, dotted bend | T14, T17, T18, T20 (-47 also T15; -50…52 also T3, T10) |
| flowchart-ok-34…36 subgraphs · -37, -38 comments and frontmatter · -39, -48 ignored directives | T15, T16, T20 · T7, T20 · T15, T20 |
| flowchart-ok-40 CJK · -41…44 boundary and ladder · -45 identical text | T20 · T19, T20 · T11, T20 |
| flowchart-reject-01, -02 malformed · -03 ZWJ · -04 61 at 60 · -05 `flowchart-elk` | T13, T15, T20 · T2, T20 · T20 · T12, T20 |
| sequence-ok-01…03 participants · -04…11, -36, -37 arrows · -12 self · -13, -31 activations | T23, T24, T25 |
| sequence-ok-14…17 notes · -18…24 frames · -25, -32 autonumber · -33 rect · -34 box · -35 create and destroy · -38 base design · -39 `title` | T23, T24, T25 |
| sequence-ok-26 CJK · -27…29 boundary and ladder · -30 identical alias text | T24, T25 · T11 |
| sequence-reject-01, -02, -05, -06, -07 malformed, order and box split · -08 second title · -03 ZWJ · -04 61 at 60 | T23, T25 · T23, T25 · T2, T25 · T24, T25 |
| Matrix common rules 1, 2, 3, 5 · 4 · 6 · 9 · 10 · 11 (coverage rows) | T7, T12 · T15 · T9 · T5 · T11 · T26 (rules 7 and 8 do not apply to A: it keys and computes nothing) |

## 12. Second-designer reconciliation (placeholder)
GPT-6's blind second design (2026-10-28), compared topic by topic. Every *theirs* row is folded into §6–§8 and the tasks.

| Topic | Agree | Differ | Chosen and why |
|---|---|---|---|
| Component split | The same 8 jobs | Theirs shares one Placement type and router between flow and sequence | Ours: sequence draws its own rows (one row per message, nothing to route); flow keeps `Placed` → `Route` |
| Loader and test gates | `.ts` imports proven by loader tests; fresh clone and smoke | Theirs names Node tests `.test.mjs` | Ours: `*_test.ts` keeps tests typed and erasable; F2 and F3 prove neither runner loads the other's files |
| Parsing | Longest-token lexing; whole-input consumption; ignored directives parsed; an unknown statement falls back | — | Same |
| Width | Pinned table; unsafe clusters rejected; wraps only at spaces and W/F | Theirs attaches combining marks to their base cell | Theirs: our canvas gave a mark its own cell. T10 now joins zero-width chars to the previous cell |
| Subgraphs | Edge-label ranks; stable barycenters | Theirs: recursive compartments for every subgraph | Ours (§8): Mermaid honors `direction` only on a sealed subgraph, and open ones need edges through the border |
| Back edges | Bounded routing work | Theirs: feedback tracks | Ours: reversed into ordinary channels, head kept at the true target; one router |
| Fit attempts | Immutable attempts; cold p90 ≤ 50 ms | — | Same: `layout` is pure per step |
| Provenance | Owner ids on cells; counts, collisions, endpoints, widths | Theirs compares write-time text ranges | Ours: text rebuilt per owner, plus the conflict log, also catches a changed glyph inside a label |
| Arrowheads | Unrelated shared segments rejected | Theirs rejects a head on a junction at render time | Theirs: validate adds `head-on-junction` (T11); the router keeps a straight cell before every head (T17) |
| Sequence | Event state machine; critical/option; create/destroy; activation depth; no graph ranking | — | Same |
| Hook tests | Exact slices; untouched fallback, unclosed and non-terminal; spans or null cached, 64 keys; debug-only failures; automated source view | Theirs also asserts read-only props | Theirs: T21 asserts `isSummary` reaches `next()` unchanged |
| C contract | ENABLED, global caps, role and series palettes, symbolic theme keys, charts deferred | Theirs gives multi-row members their own identity | Theirs: `NodeRow.id` owns a member row's text (T18) |

## 13. Risks (each with a concrete trigger)
| # | Risk | Trigger | Response |
|---|---|---|---|
| R1 | Dense graphs stay tangled | more than 5 of the 87 private blocks fail `check-tangle` or the PM review after 3 fix cycles | Port termaid's placement and routing (spec A), keeping flat nodes and the validator |
| R2 | Channel-routing cycles | more than 3 corpus blocks fall back with `route-conflict` | Add doglegs: split a net's track across two rows |
| R3 | Too slow | p90 > 50 ms on the Mac, or > 200 ms on any CI OS | Profile; cap the sweeps at 4; memoize the wrapAt layouts within one ladder |
| R4 | The mods API is early access | the scheduled A9 job fails on a newly published CC version | Fix, or pin `engines` and the README to the last good version |
| R5 | A terminal disagrees with `width()` (an ambiguous-width glyph drawn wide) | an A9 screen where a diagram row's cell count ≠ `width(row)`, or a user report | The glyph allow-list already excludes Emoji glyphs; add an ASCII glyph set behind `theme: mono` |
| R6 | The empty prose before a leading diagram draws an extra row (D5) | T35's lead check | Drop the empty `next()` (no bullet); re-pin T21's hook test |
| R7 | K₂,₂-style crossings make channel constraints cyclic | `flowchart-ok-51`, or a corpus block, falls back with `route-conflict` | Port nudging (§7), then doglegs (R2) |
| R8 | A curated palette's colors cannot pass 3:1 and ΔOKLab ≥ 0.08 over all 9 roles and over s1–s8 | `check-palettes` fails after trying every official color of that palette | Use the nearest passing color; record it in the VR record notes |
| R9 | The Windows e2e harness (ConPTY, `.cmd`, trust key) | E2 unresolved after T34 | Fix the harness; no skip is designed in. A native engine failure goes to the PM. |
| R10 | node-pty native build on the runners | E7 fails | Switch to the prebuilt fork; pin it in `scripts/e2e/package-lock.json` |
| R11 | Private corpus syntax lies outside the matrix subset | A10 on the Mac falls back on a block the owner expects drawn | Report the feature to the PM; a matrix amendment comes before code |

## 14. What the PM runs by hand
- **Runtime proof (macOS):** `node scripts/e2e/run.ts --driver tmux --theme nord --keep` in a logged-out shell. It prints the kept capture, `$TMPDIR/mtty-e2e-*/screen.ansi`; `cat` it in a truecolor terminal. Check: the CJK flowchart is drawn with themed truecolor rows; the prose is intact; the unsupported and unclosed fences show their source.
- **Source toggle:** in the same kept session (attach with the command `--keep` printed), type `/mermaid-tty source`, then press ctrl+o, and confirm both views show the Mermaid source; `/mermaid-tty diagram` draws it again; bare `/mermaid-tty` reports the mode.
- **Gallery review:** `node scripts/render-gallery.ts /tmp/mtty-gallery --png` (PNGs need `rsvg-convert`). Review every golden at 80 and 60 columns, the CJK set, and the palette sheets, with the tangle rules. The cross-family reviewer reads the `.golden` text and role rows. Record the verdict with `node scripts/check-review-hashes.ts --table goldens core/themes.ts` (§10).
- **Private corpus:** `node scripts/corpus-gate.ts fixtures/corpus --private <dir>` on the Mac. The output gives counts and block indexes only; never commit the corpus or its path.
- **Merge gate:** record each verdict (§10) so that `node scripts/check-review-hashes.ts --require-pass` passes in CI; then B's `release.yml` runs A9.release.
