# mermaid-tty v1 B3: content (T11–T14)

Part of [plan B](2026-10-28-mermaid-tty-v1-B-docs-release.md), which holds the design check, component map, traceability, runbook and reconciliation. Each task adds its failing check, then the code under it, then runs its done-when command. The code ran on 2026-10-28 in a scratch tree against stub `core/` modules. A **Waits on A** interface is an assumption (D3): confirm it against plan A. Commits: one per task on `feat/v1`, each ending with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

**Needs:** B1's T2 (`svg.ts`), T5 (`check-wiki.ts`), T6 (`check-docs.ts`) and T7 (icon); T12 also needs B2's T8 and T17. **Unblocks:** B2's T15.

### T11 — README images from core
- **Files:** create `scripts/lib/render-image.ts` (P8), `scripts/render-svg.ts` (P9), `scripts/tests/render-image_test.ts` (P10), `assets/readme/src/*.mmd` (P11) and the 10 `assets/readme/*.svg`; add C10's `// T11` lines to `scripts/check-docs.ts`. **Acceptance:** B1 (images and glyph cells). **Depends on:** T2, T6. **Group:** G6. **Waits on A:** `core/render.ts`, `core/themes.ts`, `core/width.ts` (D3).
- **Failing check:** add P10; `node --test scripts/tests/render-image_test.ts` → FAIL `ERR_MODULE_NOT_FOUND … scripts/lib/render-image.ts`.
- **Implement:** P8, P9, P11 and C10's `// T11` lines (the `width` import after the `node:url` import, the `renderImage` and `misplaced` imports after the `images.ts` import, the block after the `icon.png` line); `node scripts/render-svg.ts --readme` → `render-svg: wrote 10 images`.
- **Done when:** the test → `ℹ pass 2`; `node scripts/check-docs.ts 2>&1 | grep -E 'stale|off its cell|fell back|manifest'` prints nothing. If core falls back for a source, change the source or its width in `images.ts`; never edit an SVG by hand (D4). **Commit:** `B: README images rendered from core`
````ts P8 — scripts/lib/render-image.ts
// Adapter: core's role rows -> styled rows -> SVG. Draws exactly the glyphs core emits; owns the reference palette.
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMermaid } from '../../core/render.ts';
import { DEFAULT, PALETTES } from '../../core/themes.ts';
import { width } from '../../core/width.ts';
import { type Image } from './images.ts';
import { type Styled, toSvg } from './svg.ts';
export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
// Claude Code 2.1.308's built-in dark theme (the rgb() table whose text is rgb(255,255,255)), as hex.
const DARK: Record<string, string> = { claude: '#d77757', permission: '#b1b9f9', planMode: '#48968c', ide: '#4782c8',
  text: '#ffffff', inactive: '#999999', subtle: '#505050', suggestion: '#b1b9f9', success: '#4eba65', error: '#ff6b80',
  warning: '#ffc107', merged: '#af87ff', professionalBlue: '#6a9bcc', rainbow_red: '#eb5f57', rainbow_orange: '#f58b57',
  rainbow_yellow: '#fac35f', rainbow_green: '#91c882', rainbow_blue: '#82aadc', rainbow_indigo: '#9b82c8', rainbow_violet: '#c882b4',
  red_FOR_SUBAGENTS_ONLY: '#dc2626', blue_FOR_SUBAGENTS_ONLY: '#6a9bcc', green_FOR_SUBAGENTS_ONLY: '#16a34a',
  yellow_FOR_SUBAGENTS_ONLY: '#ca8a04', purple_FOR_SUBAGENTS_ONLY: '#827dbd', orange_FOR_SUBAGENTS_ONLY: '#d97757',
  pink_FOR_SUBAGENTS_ONLY: '#c46686', cyan_FOR_SUBAGENTS_ONLY: '#0891b2' };
const hex = (c: string) => { const v = c.startsWith('#') ? c : DARK[c]; if (!v) throw new Error(`no reference color for theme key ${c}`); return v; };
export function roleStyle(role: string, theme: string): Omit<Styled, 'text'> {
  const c = (theme === 'default' ? DEFAULT : PALETTES[theme as keyof typeof PALETTES])?.[role];
  if (!c) throw new Error(`theme ${theme} has no color for role ${role}`);
  return { fg: hex(c.fg), ...(c.bg ? { bg: hex(c.bg) } : {}), ...(c.bold ? { bold: true } : {}) };
}
export function styledRows(source: string, columns: number, theme: string, raw = false): Styled[][] | null {
  if (raw) return source.trimEnd().split(/\r?\n/).map((text) => [{ text, fg: DARK.text! }]);
  const rows = renderMermaid(source, theme === 'default' ? { columns } : { columns, theme });
  return rows && rows.map((row) => row.map((sp) => ({ text: sp.text, ...roleStyle(sp.role, theme) })));
}
export function renderImage(img: Image): { svg: string; rows: Styled[][] } {
  const rows = styledRows(readFileSync(join(ROOT, img.source), 'utf8'), img.columns, img.theme, img.raw);
  if (!rows) throw new Error(`${img.source}: core fell back at ${img.columns} columns`);
  return { svg: toSvg(rows, width, basename(img.file, '.svg')), rows };
}
````
````ts P9 — scripts/render-svg.ts
// CLI: `--readme` rewrites every README image from core; `FILE [COLUMNS] [THEME]` prints one SVG (exit 3 = core fell back).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { width } from '../core/width.ts';
import { IMAGES } from './lib/images.ts';
import { ROOT, renderImage, styledRows } from './lib/render-image.ts';
import { toSvg } from './lib/svg.ts';
const [first, cols = '80', theme = 'default'] = process.argv.slice(2);
if (first === '--readme') {
  for (const img of IMAGES) { mkdirSync(dirname(join(ROOT, img.file)), { recursive: true }); writeFileSync(join(ROOT, img.file), renderImage(img).svg); }
  console.log(`render-svg: wrote ${IMAGES.length} images`);
} else if (first) {
  const rows = styledRows(readFileSync(first, 'utf8'), Number(cols), theme);
  if (!rows) { console.error(`render-svg: core fell back for ${first} at ${cols} columns`); process.exit(3); }
  process.stdout.write(toSvg(rows, width, basename(first)));
} else { console.error('usage: node scripts/render-svg.ts --readme | FILE [COLUMNS] [THEME]'); process.exit(2); }
````
````ts P10 — scripts/tests/render-image_test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT } from '../../core/themes.ts';
import { IMAGES, THEMES } from '../lib/images.ts';
import { renderImage, roleStyle } from '../lib/render-image.ts';
const HEX = /^#[0-9a-f]{6}$/i;
test('every role resolves to hex colors under every theme', () => {
  for (const theme of THEMES) for (const role of Object.keys(DEFAULT)) {
    const s = roleStyle(role, theme);
    assert.match(s.fg, HEX, `${theme}/${role}`);
    if (s.bg) assert.match(s.bg, HEX, `${theme}/${role} bg`);
  }
});
test('every README image renders through core without falling back', () => {
  for (const img of IMAGES) assert.ok(renderImage(img).svg.startsWith('<svg '), img.file);
});
````
````text P11 — assets/readme/src/hero.mmd
flowchart TD
  A[Claude replies] --> B{mermaid fence?}
  B -->|yes| C[mermaid-tty draws it]
  B -->|no| D[Text as usual]
````
````text P11 — assets/readme/src/sequence.mmd
sequenceDiagram
  actor You
  participant C as Claude Code
  participant M as mermaid-tty
  You->>C: Ask for a diagram
  C->>M: Reply with a mermaid fence
  M-->>C: Colored rows
  C-->>You: Diagram in the terminal
````
````text P11 — assets/readme/src/cjk.mmd
flowchart TD
  A[用户提问] --> B{包含图表?}
  B -->|是| C[绘制图表]
  B -->|否| D[显示文字]
````
````text P11 — assets/readme/src/theme.mmd
flowchart LR
  A[Plan] --> B{Ready?}
  B -->|yes| C[Ship]
  B -.->|no| A
````
````ts C10 — scripts/check-docs.ts, the // T11 lines
import { width } from '../core/width.ts'; // T11
import { renderImage } from './lib/render-image.ts'; // T11
import { misplaced } from './lib/svg.ts'; // T11
// T11 begin: each README SVG equals a fresh render, and every glyph sits at col × CELL.
for (const img of IMAGES) {
  try {
    const { svg, rows } = renderImage(img), file = read(img.file);
    if (file !== svg) errors.push(`${img.file}: stale; run node scripts/render-svg.ts --readme`);
    for (const m of misplaced(file, rows, width)) errors.push(`${img.file}: glyph off its cell: ${m}`);
  } catch (err) { errors.push(`${img.file}: ${(err as Error).message}`); }
}
// T11 end
````

### T12 — README
- **Files:** modify `README.md` (P12). **Acceptance:** B1; the FAQ's platforms entry. **Depends on:** T7, T8, T11, T17. **Group:** G7. **Waits on C:** one support-table row per `ENABLED` id, with its header keywords. **Waits on A:** `plugin.json` `userConfig.theme` values for the Configuration row, and `check.sh`'s header.
- **Failing check:** `node scripts/check-docs.ts` → `hero:`, `section missing:`, `FAQ:`, `Development:` and wiki-link lines.
- **Implement:** P12, then fit the table and the Configuration row. The FAQ documents `/mermaid-tty source`, `/mermaid-tty diagram`, bare `/mermaid-tty` and `/copy`, and makes no ctrl+o claim (D12).
- **Done when:** → `check-docs: ok (README, 10 images, 4 workflows, check.sh, icon)`. Beauty review at R3. **Commit:** `B: README`
````markdown P12 — README.md
<div align="center">

<img src="assets/icon.svg" width="120" height="120" alt="mermaid-tty logo">

# mermaid-tty

**Yet, just another Mermaid renderer for your terminal**

[![CI](https://github.com/D0n9X1n/mermaid-tty/actions/workflows/ci.yml/badge.svg)](https://github.com/D0n9X1n/mermaid-tty/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/D0n9X1n/mermaid-tty)](https://github.com/D0n9X1n/mermaid-tty/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Stars](https://img.shields.io/github/stars/D0n9X1n/mermaid-tty?style=flat)](https://github.com/D0n9X1n/mermaid-tty/stargazers)

</div>

A Claude Code plugin that redraws each closed mermaid code fence in Claude's replies as a colored, flat, box-drawing diagram sized to your terminal. The transcript keeps the Mermaid source.

## Install

```sh
claude plugin marketplace add D0n9X1n/mermaid-tty
claude plugin install mermaid-tty@mermaid-tty
```

Needs Claude Code 2.1.287 or later, on macOS, Linux or Windows.

## Before and after

<table><tr>
<td><img src="assets/readme/before.svg" alt="A mermaid fence as Claude Code shows it today"></td>
<td><img src="assets/readme/after.svg" alt="The same fence drawn by mermaid-tty"></td>
</tr></table>

<img src="assets/readme/sequence.svg" alt="A sequence diagram drawn by mermaid-tty">

## Supported diagrams

<!-- types:start -->
| Type | Header keywords |
|---|---|
| `flowchart` | `flowchart`, `graph` |
| `sequence` | `sequenceDiagram` |
<!-- types:end -->

Any other diagram keeps Claude Code's own drawing.

## Themes

Diagrams follow your Claude Code theme unless you pick a curated palette.

<table>
<tr><td><img src="assets/readme/theme-default.svg" alt="default"><br>default</td><td><img src="assets/readme/theme-nord.svg" alt="nord"><br>nord</td></tr>
<tr><td><img src="assets/readme/theme-dracula.svg" alt="dracula"><br>dracula</td><td><img src="assets/readme/theme-gruvbox.svg" alt="gruvbox"><br>gruvbox</td></tr>
<tr><td><img src="assets/readme/theme-solarized.svg" alt="solarized"><br>solarized</td><td><img src="assets/readme/theme-mono.svg" alt="mono"><br>mono</td></tr>
</table>

## Configuration

| Option | Values | Default |
|---|---|---|
| `theme` | `nord`, `dracula`, `gruvbox`, `solarized`, `mono` | unset: follow the Claude Code theme |

```sh
echo '{"theme":"nord"}' | claude plugin configure mermaid-tty@mermaid-tty --values-stdin
```

## FAQ

**Why do I sometimes see the Mermaid source?** mermaid-tty falls back to the original fence when it can't parse a diagram, doesn't support its type, or can't fit it. `claude --debug` logs the reason.

**How wide are diagrams?** They always fit the terminal's columns: mermaid-tty tightens gaps, wraps labels, then redraws left-to-right charts top-down, and falls back if nothing fits.

**Do CJK labels line up?** Yes. Wide characters count as 2 columns and combining marks as 0, so CJK labels stay aligned.

<img src="assets/readme/cjk.svg" alt="A flowchart with Chinese labels drawn by mermaid-tty">

**How do I see the Mermaid source?** Run `/mermaid-tty source` to show every diagram as its Mermaid source, on screen and in the ctrl+o transcript; `/mermaid-tty diagram` draws them again, and `/mermaid-tty` alone reports the current mode. `/copy` copies the exact source.

**Which platforms and terminals work?** macOS, Linux and Windows: Windows Terminal; macOS Terminal, iTerm2 and Ghostty; and Linux terminals. Truecolor terminals show the palettes exactly; 256-color terminals get the nearest colors. Use a monospaced font with box-drawing and geometric-shape glyphs, plus a CJK font for CJK labels.

## Development

```sh
bash scripts/check.sh                   # the must-pass suite CI runs on Linux, macOS and Windows
npm ci --prefix scripts/e2e             # the end-to-end job's own pinned tooling
node scripts/e2e/run.ts                 # real Claude Code against a mock API, once per theme
node scripts/render-gallery.ts gallery  # the visual-review gallery, as SVG
node scripts/check-ci-coverage.ts       # every acceptance check has a CI step
```

More in the [English](https://github.com/D0n9X1n/mermaid-tty/wiki) and [简体中文](https://github.com/D0n9X1n/mermaid-tty/wiki/Home-zh-CN) wiki.

## License

[MIT](LICENSE)
````

### T13 — English wiki
- **Files:** create `wiki/{Home,Usage,Configuration-and-Themes,Architecture,Development-and-Release}.md`. **Acceptance:** B2; Usage covers three OSes. **Depends on:** T5. **Group:** G4. **Waits on A:** facts, checked against the code at HEAD.
- **Failing check:** `node scripts/check-wiki.ts` → `wiki/: directory missing` and the 10 required pages.
- **Implement:** each page opens with `# Title`, a blank line and `[简体中文](<Page>-zh-CN)`, then these `##` sections:

| Page | EN / zh-CN title | `##` sections, EN / zh-CN | Must state |
|---|---|---|---|
| Home | mermaid-tty Wiki / mermaid-tty 百科 | Pages / 页面; Quick start / 快速开始 | the pitch; a same-language link to every other page; both install commands |
| Usage | Usage / 用法 | Install / 安装; Platforms and terminals / 平台与终端; Drawing diagrams / 绘制图表; Source view / 查看源码; Fallback / 回退; Width and CJK / 宽度与 CJK; Uninstall / 卸载 | Claude Code 2.1.287 or later; Windows, macOS and Linux by name; Windows Terminal, macOS Terminal, iTerm2, Ghostty and Linux terminals; truecolor and 256-color; fonts; closed fences only; `/mermaid-tty source`, `/mermaid-tty diagram`, bare `/mermaid-tty` and `/copy`, never that ctrl+o shows the source; `claude --debug`; the fit ladder; W/F = 2 columns; `claude plugin uninstall mermaid-tty@mermaid-tty` |
| Configuration-and-Themes | Configuration and Themes / 配置与主题 | The theme option / theme 选项; Palettes / 配色; Roles / 角色 | the `userConfig.theme` values in `plugin.json`; the default theme-key mapping; the 7 roles plus title, value and s1–s8; mono tells roles apart by caps and glyphs; `claude plugin configure … --values-stdin` |
| Architecture | Architecture / 架构 | Pipeline / 流水线; Modules / 模块; Validation and fallback / 校验与回退; Width / 宽度; Hook and cache / 钩子与缓存 | a localized Mermaid flowchart; the `core/` files at HEAD; the validator's invariants; the glyph allow-list (no `Emoji` glyphs; `►`/`◄`); the 64-entry LRU |
| Development-and-Release | Development and Release / 开发与发布 | Repository / 仓库; Local checks / 本地检查; CI / 持续集成; Images and icon / 图片与图标; Wiki / 百科; Release / 发布 | the five `LOCAL` commands in one `sh` block; `check` and `e2e` on three OSes; the gallery; the scheduled A9 run on each new Claude Code version; `shell: bash` and `set -euo pipefail`; `render-svg.ts --readme` and `make-icon.sh`; `wiki/` is the only source, and edits to the GitHub wiki are overwritten; R1–R8 |

- **Done when:** `node scripts/check-wiki.ts` lists only five `missing language counterpart …-zh-CN` lines and five `…-zh-CN.md: required page missing` lines. **Commit:** `B: English wiki`

### T14 — Chinese wiki
- **Files:** create the five `wiki/*-zh-CN.md`. **Acceptance:** B2. **Depends on:** T13. **Group:** G5.
- **Failing check:** T13's ten lines.
- **Implement:** the same heading levels in the same order; each page opens with `[English](<Page>)`; every paragraph, list item and table row contains Chinese, with OS, product and command names kept in Latin inside Chinese sentences; Mermaid labels are localized; Usage names Windows, macOS and Linux and the source-view commands; Development shows the five commands.
- **Done when:** `node scripts/check-wiki.ts` → `check-wiki: ok (10 pages)`. Translation review at R3. **Commit:** `B: Chinese wiki`
