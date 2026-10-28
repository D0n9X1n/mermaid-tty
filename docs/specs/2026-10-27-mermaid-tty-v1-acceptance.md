# mermaid-tty v1 acceptance tests (normative)

This file lists the acceptance checks for spec A ([`…-design.md`](2026-10-27-mermaid-tty-v1-design.md)) and spec B ([`…-docs-release.md`](2026-10-27-mermaid-tty-v1-docs-release.md)). Spec C's per-type checks are in [`…-diagram-matrix.md`](2026-10-27-mermaid-tty-v1-diagram-matrix.md).

Every row is a must-pass check in `scripts/check.sh`, except rows marked:
- ***release***: run once, when releasing;
- ***review***: a gate whose verdict is recorded in `docs/reviews/`.

## Spec A

| ID | Requirement | Check |
|---|---|---|
| A1 | Flowchart syntax | There is one fixture per feature in requirement 1: each shape, edge kind, edge end and label form; chains; `&`; nested subgraphs with `direction`; comments; the frontmatter title; and the ignored directives. Each fixture renders and validates at 60, 80 and 120 columns and matches its golden snapshot. |
| A2 | Sequence syntax | There is one fixture per feature in requirement 2. Each is checked the same way as in A1. |
| A3 | Flat nodes | For every shape: a one-line label renders as exactly 1 row; a `<br/>` label with N lines renders as N rows; a wrapped label takes as many rows as it has wrapped lines. No row of a node consists only of border glyphs. Under the mono theme, which has no color, every pair of shapes has different end caps. |
| A4 | Width | **`width()` table test:** ASCII counts 1; `中`, `ア` and `한` count 2; `─`, `│`, `┌`, `◇` and `▶` count 1; `e`+U+0301 counts 1; ZWSP counts 0. Text containing ZWJ, VS15/VS16, regional indicators, emoji modifiers or control characters is unsupported, and the diagram falls back. **Fit ladder:** each step (tighter gaps, wrapped labels, LR→TD) has a fixture sized so that this step is the first one that fits, and the test asserts which step was taken. A width below the minimum falls back. |
| A5 | Fail closed | **Mutation tests:** the validator receives a hand-broken layout for each invariant, and each must fail. The broken layouts are: a missing label instance, a duplicated label instance, a disconnected edge end, an overwritten glyph, and an overlong row. Distinct nodes with identical text pass, because instances are counted by node id. **Errors:** parse errors and unsupported types return `null`, and the hook then draws the original fence. The reason is logged only at debug level; the test asserts that nothing extra appears in the drawn tree. |
| A6 | Source preserved | **Hook tests:** cover prose, then a diagram, then prose; two adjacent fences; and a fence between two paragraphs. The prose reaches `next()` unchanged and the diagrams render in order. An unclosed fence is passed to `next(e)` untouched, and so is any reply on a non-terminal surface. ***release*:** in the tmux session, ctrl+o shows the original Mermaid source. |
| A7 | Colors | Unit tests assert the color of each of the 7 roles under the default mapping (theme keys) and under each of the 5 palettes. A hook test asserts that the drawn spans carry those colors. |
| A8 | Zero install | **Portability** (`scripts/check-portable.ts`): `package.json` has no `dependencies`. Every import under `core/` and `hooks/` is relative, except type-only `claude-code` imports. The code uses none of: `node:` imports, `require`, `process`, `Buffer`, `document`, `window`, `eval`, `new Function`, or dynamic `import()`. **Benchmark** (`scripts/bench.ts`): renders each corpus or fixture diagram 20 times, cold, at 80 columns, and reports p50 and p90 together with the machine and Node version. p90 must be 50 ms or less on the development Mac. **Cache:** an LRU of 64 entries, keyed by (text, width, theme). Tests cover a hit; a miss whenever any part of the key changes; and eviction of the least recently used entry when a 65th is added. **No build:** in a fresh `git clone` of the commit, with no `npm install` and no build step, `node --test`, `claude plugin test .` and `scripts/smoke.ts` all pass. `scripts/smoke.ts` renders a flowchart fixture through `core/render.ts` from the checked-in sources. **Validation:** `claude plugin validate .` passes. |

## Visual review (*review*, for A and C)

**Gallery:** every golden, rendered to PNG at 80 columns, at 60 columns, and with CJK labels.

**Reviewers:** the PM inspects the PNGs. A cross-family reviewer inspects the text and the role map.

**A diagram is tangled if any of these is true:**
- an edge passes through a node;
- two edges share a segment but share no endpoint;
- an edge's direction is ambiguous, because its arrowhead is missing or sits on a junction;
- an edge label is not adjacent to its edge.

**A diagram passes when** every label is readable, it is not tangled, and its colors tell the roles apart.

## Spec B

| ID | Requirement | Check |
|---|---|---|
| B1 | README | **`scripts/check-docs.ts` asserts:** the hero has the logo image and tagline; the CI, release, license and stars badges are present; the exact two-line install block is present; the Before/after, Themes, Configuration and FAQ sections exist, with the FAQ covering fallback, width and CJK; the wiki links (English and 简体中文) are present; every `assets/` image exists and matches a fresh `render-svg` run; in each SVG, every glyph's `x` equals its column × cell width. **Beauty (*review*):** the PM reviews the rendered GitHub page. |
| B2 | Wiki pages | All five named pairs exist. Each pair has the same heading levels in the same order. Each page opens with exactly one link to its twin, which is the only cross-language link. zh-CN bodies contain CJK prose; English bodies contain none outside code. **Per paragraph:** every non-code paragraph of a zh-CN page contains CJK characters, so a mostly untranslated page fails. **Translation (*review*):** the PM and a cross-family reviewer confirm that each of the five pairs says the same things in full, and record the verdict in `docs/reviews/`. |
| B3 | Publishing | **`scripts/test-wiki-publish.sh`**, run in throwaway repos, covers: mirroring, a no-op run, and removal of stale pages. **`check-docs.ts`** asserts the workflow's triggers (`push` to `main` and `workflow_dispatch`), the job-scoped `contents: write` permission, and SHA-pinned actions. ***release*:** the workflow run on `main` succeeds and the wiki shows the pages. If the wiki repo doesn't exist yet, the one-click bootstrap is reported to the owner and the run is repeated. |
| B4 | CI | `check-docs.ts` asserts that `ci.yml`: runs on push and pull_request; pins actions by SHA; sets up Node 24 and Claude Code; and runs `scripts/check.sh`. The PR's CI run is green. |
| B5 | Release | ***release*:** the tag `v1.0.0` exists. The notes shown by `gh release view v1.0.0` contain both install commands. A scratch session installs the plugin from the marketplace and renders a diagram. |
| B6 | Icon | `scripts/make-icon.sh` produces `.claude-plugin/icon.png` from `assets/icon.svg`. The PNG is 512×512 (checked with `sips`) and under 2 MB. |
