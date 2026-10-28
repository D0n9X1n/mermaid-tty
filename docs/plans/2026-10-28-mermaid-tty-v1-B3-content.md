# mermaid-tty v1 B3: SVG serializer, icon, release checks, install, content, render cross-check and LF (T2, T7, T9–T14, T16, T18)

Part of [plan B](2026-10-28-mermaid-tty-v1-B-docs-release.md), which holds the design check, component map, traceability, runbook and reconciliation. Each task adds its failing check, then the code under it, then runs its done-when command. The code ran on 2026-10-28 in a scratch tree against stub `core/` modules; T18's cross-check also ran live against GitHub's renderer. A **Waits on A** interface is an assumption (D3): confirm it against plan A. Commits: one per task on `feat/v1`, each ending with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

**Needs:** B1's T1 (the parser), T5 (`check-wiki.ts`) and T6 (`check-docs.ts`); from B2, T9 and T18 need T8, T12 needs T8 and T17, and T16 needs T15. T7 needs `rsvg-convert` and `sips` on the dev Mac. **Unblocks:** B2's T15.

### T2 — SVG serializer
- **Files:** create `scripts/lib/svg.ts` (C3) and `scripts/tests/svg_test.ts` (C4). **Acceptance:** B1 (glyph x = col × cell width). **Depends on:** none. **Group:** G1.
- **Failing check:** add C4; `node --test scripts/tests/svg_test.ts` → FAIL `ERR_MODULE_NOT_FOUND … scripts/lib/svg.ts`.
- **Implement:** C3. **Done when:** → `ℹ pass 3`. **Commit:** `B: SVG serializer with each glyph at col × CELL`
````ts C3 — scripts/lib/svg.ts
// Serializes styled terminal rows to SVG. Every glyph is its own <text> at x = col × CELL, so
// alignment never depends on the viewer's font metrics (spec B, requirement 1, Images).
export const CELL = 9, ROW = 18, FONT = 15, BASE = 14, PAD = 16, BAR = 28, BG = '#1e1f26';
export type Styled = { text: string; fg: string; bg?: string; bold?: boolean };
export type Glyph = { row: number; col: number; text: string; span: number };
const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function glyphCells(rows: Styled[][], width: (s: string) => number): Glyph[] {
  const out: Glyph[] = [];
  rows.forEach((row, r) => {
    let col = 0;
    row.forEach((sp, k) => {
      for (const { segment } of seg.segment(sp.text)) {
        const w = width(segment);
        if (w > 0 && segment.trim()) out.push({ row: r, col, text: segment, span: k });
        col += w;
      }
    });
  });
  return out;
}
export function toSvg(rows: Styled[][], width: (s: string) => number, title: string): string {
  const cols = Math.max(1, ...rows.map((r) => r.reduce((n, sp) => n + width(sp.text), 0)));
  const W = cols * CELL + 2 * PAD, H = rows.length * ROW + 2 * PAD + BAR, out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">`,
    `<rect width="${W}" height="${H}" rx="10" fill="${BG}"/>`,
    ...['#ff5f57', '#febc2e', '#28c840'].map((c, i) => `<circle cx="${PAD + 6 + i * 18}" cy="14" r="5" fill="${c}"/>`),
    `<g transform="translate(${PAD} ${PAD + BAR})" font-family="Menlo, Consolas, 'DejaVu Sans Mono', 'PingFang SC', 'Noto Sans Mono CJK SC', monospace" font-size="${FONT}">`);
  rows.forEach((row, r) => {
    let col = 0;
    for (const sp of row) {
      const w = width(sp.text);
      if (sp.bg) out.push(`<rect x="${col * CELL}" y="${r * ROW}" width="${w * CELL}" height="${ROW}" fill="${sp.bg}"/>`);
      col += w;
    }
  });
  for (const g of glyphCells(rows, width)) {
    const sp = rows[g.row]![g.span]!;
    out.push(`<text x="${g.col * CELL}" y="${g.row * ROW + BASE}" fill="${sp.fg}"${sp.bold ? ' font-weight="bold"' : ''}>${esc(g.text)}</text>`);
  }
  return [...out, '</g>', '</svg>', ''].join('\n');
}
// B1 glyph rule: lists every glyph whose <text> is not at x = col × CELL, y = row × ROW + BASE.
export function misplaced(svg: string, rows: Styled[][], width: (s: string) => number): string[] {
  const want = glyphCells(rows, width).map((g) => `${g.col * CELL},${g.row * ROW + BASE},${esc(g.text)}`);
  const got = [...svg.matchAll(/<text x="(\d+)" y="(\d+)"[^>]*>([^<]*)<\/text>/g)].map((m) => `${m[1]},${m[2]},${m[3]}`);
  return want.length === got.length ? want.filter((w, i) => w !== got[i]) : [`expected ${want.length} glyphs, found ${got.length}`];
}
````
````ts C4 — scripts/tests/svg_test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { CELL, glyphCells, misplaced, toSvg } from '../lib/svg.ts';
// Stand-in for core/width.ts with spec A's table: W/F = 2, Mn/Me and ZWSP = 0, else 1.
const width = (s: string) => [...s].reduce((n, c) => n + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿＀-｠]/.test(c) ? 2 : /[̀-ͯ​]/.test(c) ? 0 : 1), 0);
const rows = [[{ text: '[中]', fg: '#fff', bg: '#333' }, { text: '─►é​<', fg: '#aaa' }]];
test('each glyph gets its own cell; wide glyphs take two; combining marks join their base', () =>
  assert.deepEqual(glyphCells(rows, width).map((g) => [g.col, g.text]),
    [[0, '['], [1, '中'], [3, ']'], [4, '─'], [5, '►'], [6, 'é'], [7, '<']]));
test('toSvg places every glyph at col × CELL and sizes pill backgrounds by width', () => {
  const svg = toSvg(rows, width, 'demo');
  assert.ok(svg.includes(`<text x="${3 * CELL}" y="14" fill="#fff">]</text>`));
  assert.ok(svg.includes(`<rect x="0" y="0" width="${4 * CELL}" height="18" fill="#333"/>`));
  assert.ok(svg.includes('>&lt;</text>'));
  assert.deepEqual(misplaced(svg, rows, width), []);
});
test('misplaced reports a glyph moved off its cell', () => {
  const bad = toSvg(rows, width, 'demo').replace(`<text x="${CELL}" `, `<text x="${CELL + 1}" `);
  assert.equal(misplaced(bad, rows, width).length, 1);
});
````

### T7 — Plugin icon
- **Files:** create `assets/icon.svg` (P1), `scripts/make-icon.sh` (P2) and `.claude-plugin/icon.png`. **Acceptance:** B6. **Depends on:** T6. **Group:** G4.
- **Failing check:** `node scripts/check-docs.ts 2>&1 | grep -F icon.png` → `check-docs: icon.png: missing`.
- **Implement:** P1, P2; on the Mac, `bash scripts/make-icon.sh` (needs `brew install librsvg`).
- **Done when:** → `make-icon: .claude-plugin/icon.png 512x512, … bytes (sips)`, and the grep prints nothing. **Commit:** `B: plugin icon from assets/icon.svg`
````xml P1 — assets/icon.svg
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#1e1f26"/>
  <rect x="136" y="72" width="240" height="72" rx="36" fill="#d77757"/>
  <path d="M256 144v44M256 340v44" stroke="#999999" stroke-width="16"/>
  <path d="M234 184h44l-22 26zM234 380h44l-22 26z" fill="#b1b9f9"/>
  <path d="M256 214l84 62-84 62-84-62z" fill="#ffc107"/>
  <rect x="136" y="410" width="240" height="72" rx="36" fill="#4eba65"/>
</svg>
````
````bash P2 — scripts/make-icon.sh
#!/usr/bin/env bash
# B6 (dev Mac): assets/icon.svg -> .claude-plugin/icon.png, 512×512, under 2 MB, confirmed by sips. CI re-reads the PNG header in check-docs.ts.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
command -v rsvg-convert >/dev/null || { printf 'make-icon: needs rsvg-convert (brew install librsvg)\n' >&2; exit 1; }
rsvg-convert -w 512 -h 512 assets/icon.svg -o .claude-plugin/icon.png
read -r w h < <(sips -g pixelWidth -g pixelHeight .claude-plugin/icon.png | awk '/pixel/ {print $2}' | paste -s -d ' ' -)
bytes=$(( $(wc -c < .claude-plugin/icon.png) ))
[[ "$w" == 512 && "$h" == 512 ]] || { printf 'make-icon: %sx%s, want 512x512\n' "$w" "$h" >&2; exit 1; }
(( bytes < 2000000 )) || { printf 'make-icon: %s bytes, want under 2 MB\n' "$bytes" >&2; exit 1; }
printf 'make-icon: .claude-plugin/icon.png 512x512, %s bytes (sips)\n' "$bytes"
````

### T9 — Release checks and notes
- **Files:** create `scripts/check-release.ts` (P5) and `docs/release-notes/v1.0.0.md` (P6). **Acceptance:** B5. **Depends on:** T8. **Group:** G5. **Waits on A:** `plugin.json` version `1.0.0`.
- **Failing check:** `node scripts/check-release.ts tag v1.0.0` → FAIL `Cannot find module …/scripts/check-release.ts`.
- **Implement:** P5, P6 (hand-written; they name `/mermaid-tty source`, `/mermaid-tty diagram` and `/copy`, and make no ctrl+o claim, per D12).
- **Done when:** `node scripts/check-release.ts tag v1.0.0 && node scripts/check-release.ts notes docs/release-notes/v1.0.0.md` → `check-release: tag ok (1.0.0)` and `check-release: notes ok (1.0.0)`; `node scripts/check-release.ts tag v1.0.1` exits 1 with `tag v1.0.1 does not match plugin.json version 1.0.0`. **Commit:** `B: release tag and notes checks; v1.0.0 notes`
````ts P5 — scripts/check-release.ts
// B5 release checks: `tag vX.Y.Z` must equal plugin.json's version; `notes FILE|-` must hold both install commands.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { notesErrors, tagErrors } from './lib/ci-rules.ts';
const root = fileURLToPath(new URL('..', import.meta.url)), [mode, arg = ''] = process.argv.slice(2);
const version = JSON.parse(readFileSync(join(root, '.claude-plugin/plugin.json'), 'utf8')).version as string;
const errors = mode === 'tag' ? tagErrors(arg, version) : mode === 'notes' ? notesErrors(readFileSync(arg === '-' ? 0 : arg, 'utf8'))
  : ['usage: node scripts/check-release.ts tag vX.Y.Z | notes FILE|-'];
for (const e of errors) console.error(`check-release: ${e}`);
if (errors.length) process.exit(1);
console.log(`check-release: ${mode} ok (${version})`);
````
````markdown P6 — docs/release-notes/v1.0.0.md
# mermaid-tty v1.0.0

The first release. In Claude Code, each closed mermaid code fence in a reply is drawn as a colored, flat, box-drawing diagram sized to your terminal, on macOS, Linux and Windows. The transcript keeps the source.

## Install

```sh
claude plugin marketplace add D0n9X1n/mermaid-tty
claude plugin install mermaid-tty@mermaid-tty
```

Needs Claude Code 2.1.287 or later.

## What's in it

- Flowcharts with subgraphs, sequence diagrams, and every type in the README's support table.
- Exact widths for CJK labels. A diagram that can't be drawn falls back to its source.
- Colors follow your Claude Code theme, or pick nord, dracula, gruvbox, solarized or mono.
- `/mermaid-tty source` shows every diagram as its Mermaid source, and `/mermaid-tty diagram` draws them again; `/copy` copies the exact source.
````

### T10 — Local-marketplace install on every PR
- **Files:** create `scripts/test-local-install.sh` (P7). **Acceptance:** B5 (every PR). **Depends on:** none. **Group:** G1. **Waits on A:** `.claude-plugin/plugin.json` and `marketplace.json` (`source: "./"`).
- **Failing check:** `bash scripts/test-local-install.sh` → FAIL `No such file or directory`.
- **Implement:** P7. **Done when:** → `local install: ok (mermaid-tty 1.0.0)`; it writes only to a throwaway `CLAUDE_CONFIG_DIR` (probed offline). **Commit:** `B: install from the local marketplace on every PR`
````bash P7 — scripts/test-local-install.sh
#!/usr/bin/env bash
# B5, every PR: install the plugin from this checkout's marketplace into a throwaway config. Offline; no account.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
config="$(mktemp -d)"
trap 'rm -rf "$config"' EXIT
if command -v cygpath >/dev/null 2>&1; then config="$(cygpath -w "$config")"; fi # Git Bash: give claude.exe a Windows path
export CLAUDE_CONFIG_DIR="$config"
version="$(node -p 'require("./.claude-plugin/plugin.json").version')"
claude plugin marketplace add ./
claude plugin install mermaid-tty@mermaid-tty
list="$(claude plugin list)"
grep -Fq 'mermaid-tty@mermaid-tty' <<<"$list" || { printf '%s\n' "$list" >&2; printf 'local install: mermaid-tty is not installed\n' >&2; exit 1; }
grep -Fq "Version: $version" <<<"$list" || { printf 'local install: installed version is not %s\n' "$version" >&2; exit 1; }
printf 'local install: ok (mermaid-tty %s)\n' "$version"
````

### T11 — README images from core
- **Files:** create `scripts/lib/render-image.ts` (P8), `scripts/render-svg.ts` (P9), `scripts/tests/render-image_test.ts` (P10), `assets/readme/src/*.mmd` (P11) and the 10 `assets/readme/*.svg`; add C10's `// T11` lines to `scripts/check-docs.ts`. **Acceptance:** B1 (images and glyph cells). **Depends on:** T2, T6. **Group:** G6. **Waits on A:** `core/render.ts` and `core/width.ts`, confirmed at `c3a6b26`; spans arrive with resolved colors, so nothing reads `core/themes.ts` (D3).
- **Failing check:** add P10; `node --test scripts/tests/render-image_test.ts` → FAIL `ERR_MODULE_NOT_FOUND … scripts/lib/render-image.ts`.
- **Implement:** P8, P9, P11 and C10's `// T11` lines (the `width` import after the `node:url` import, the `renderImage` and `misplaced` imports after the `images.ts` import, the block after the `icon.png` line); `node scripts/render-svg.ts --readme` → `render-svg: wrote 10 images`.
- **Done when:** the test → `ℹ pass 2`; `node scripts/check-docs.ts 2>&1 | grep -E 'stale|off its cell|fell back|manifest'` prints nothing. If core falls back for a source, change the source or its width in `images.ts`; never edit an SVG by hand (D4). **Commit:** `B: README images rendered from core`
````ts P8 — scripts/lib/render-image.ts
// Adapter: core's role rows -> styled rows -> SVG. Draws exactly the glyphs core emits; owns the reference palette.
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Span, renderMermaid } from '../../core/render.ts';
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
// Plan A's spans carry resolved colors (a CC ThemeKey or #rrggbb; none under mono; dimColor for mono notes); keys resolve through DARK (D2).
export function spanStyle(sp: Span): Omit<Styled, 'text'> {
  const fg = sp.dimColor ? DARK.inactive! : sp.color ? hex(sp.color) : DARK.text!;
  return { fg, ...(sp.backgroundColor ? { bg: hex(sp.backgroundColor) } : {}), ...(sp.bold ? { bold: true } : {}) };
}
export function styledRows(source: string, columns: number, theme: string, raw = false): Styled[][] | null {
  if (raw) return source.trimEnd().split(/\r?\n/).map((text) => [{ text, fg: DARK.text! }]);
  const rows = renderMermaid(source, theme === 'default' ? { columns } : { columns, theme });
  return rows && rows.map((row) => row.map((sp) => ({ text: sp.text, ...spanStyle(sp) })));
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
import { IMAGES, THEMES } from '../lib/images.ts';
import { renderImage, styledRows } from '../lib/render-image.ts';
const HEX = /^#[0-9a-f]{6}$/i;
test('every span resolves to hex colors under every theme', () => {
  for (const theme of THEMES) for (const row of styledRows('flowchart TD\n  A[a] --> B[b]', 60, theme)!) for (const s of row) {
    assert.match(s.fg, HEX, `${theme} fg`);
    if (s.bg) assert.match(s.bg, HEX, `${theme} bg`);
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
- **Implement:** P12 (in the README grammar, D15b: the hero is its only HTML), then fit the table and the Configuration row. The FAQ documents `/mermaid-tty source`, `/mermaid-tty diagram`, bare `/mermaid-tty` and `/copy`, and makes no ctrl+o claim (D12).
- **Done when:** → `check-docs: ok (README, 10 images, 4 workflows, check.sh, icon)`. Beauty review at R3. **Commit:** `B: README`
````markdown P12 — README.md
<p align="center"><img src="assets/icon.svg" alt="mermaid-tty logo" width="120"></p>

# mermaid-tty

**Yet, just another Mermaid renderer for your terminal**

[![CI](https://github.com/D0n9X1n/mermaid-tty/actions/workflows/ci.yml/badge.svg)](https://github.com/D0n9X1n/mermaid-tty/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/D0n9X1n/mermaid-tty)](https://github.com/D0n9X1n/mermaid-tty/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Stars](https://img.shields.io/github/stars/D0n9X1n/mermaid-tty?style=flat)](https://github.com/D0n9X1n/mermaid-tty/stargazers)

A Claude Code plugin that redraws each closed mermaid code fence in Claude's replies as a colored, flat, box-drawing diagram sized to your terminal. The transcript keeps the Mermaid source.

## Install

```sh
claude plugin marketplace add D0n9X1n/mermaid-tty
claude plugin install mermaid-tty@mermaid-tty
```

Needs Claude Code 2.1.287 or later, on macOS, Linux or Windows.

## Before and after

| Before | After |
|---|---|
| ![A mermaid fence as Claude Code shows it today](assets/readme/before.svg) | ![The same fence drawn by mermaid-tty](assets/readme/after.svg) |

![A sequence diagram drawn by mermaid-tty](assets/readme/sequence.svg)

## Supported diagrams

| Type | Header keywords |
|---|---|
| `flowchart` | `flowchart`, `graph` |
| `sequence` | `sequenceDiagram` |

Any other diagram keeps Claude Code's own drawing.

## Themes

Diagrams follow your Claude Code theme unless you pick a curated palette.

| default | nord |
|---|---|
| ![default](assets/readme/theme-default.svg) | ![nord](assets/readme/theme-nord.svg) |
| **dracula** | **gruvbox** |
| ![dracula](assets/readme/theme-dracula.svg) | ![gruvbox](assets/readme/theme-gruvbox.svg) |
| **solarized** | **mono** |
| ![solarized](assets/readme/theme-solarized.svg) | ![mono](assets/readme/theme-mono.svg) |

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

![A flowchart with Chinese labels drawn by mermaid-tty](assets/readme/cjk.svg)

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
- **Implement:** each page opens with `# Title`, a blank line and `[Chinese (Simplified)](<Page>-zh-CN)`, then these `##` sections:

| Page | EN / zh-CN title | `##` sections, EN / zh-CN | Must state |
|---|---|---|---|
| Home | mermaid-tty Wiki / mermaid-tty 百科 | Pages / 页面; Quick start / 快速开始 | the pitch; a same-language link to every other page; both install commands |
| Usage | Usage / 用法 | Install / 安装; Platforms and terminals / 平台与终端; Drawing diagrams / 绘制图表; Source view / 查看源码; Fallback / 回退; Width and CJK / 宽度与 CJK; Uninstall / 卸载 | Claude Code 2.1.287 or later; Windows, macOS and Linux by name; Windows Terminal, macOS Terminal, iTerm2, Ghostty and Linux terminals; truecolor and 256-color; fonts; closed fences only; `/mermaid-tty source`, `/mermaid-tty diagram`, bare `/mermaid-tty` and `/copy`, never that ctrl+o shows the source; `claude --debug`; the fit ladder; W/F = 2 columns; `claude plugin uninstall mermaid-tty@mermaid-tty` |
| Configuration-and-Themes | Configuration and Themes / 配置与主题 | The theme option / theme 选项; Palettes / 配色; Roles / 角色 | the `userConfig.theme` values in `plugin.json`; the default theme-key mapping; the 7 roles plus title, value and s1–s8; mono tells roles apart by caps and glyphs; `claude plugin configure … --values-stdin` |
| Architecture | Architecture / 架构 | Pipeline / 流水线; Modules / 模块; Validation and fallback / 校验与回退; Width / 宽度; Hook and cache / 钩子与缓存 | a localized Mermaid flowchart; the `core/` files at HEAD; the validator's invariants; the glyph allow-list (no `Emoji` glyphs; `►`/`◄`); the 64-entry LRU |
| Development-and-Release | Development and Release / 开发与发布 | Repository / 仓库; Local checks / 本地检查; CI / 持续集成; Images and icon / 图片与图标; Wiki / 百科; Release / 发布 | the five `LOCAL` commands in one `sh` block; `check` and `e2e` on three OSes; the gallery; the scheduled A9 run on each new Claude Code version; `shell: bash` and `set -euo pipefail`; `render-svg.ts --readme` and `make-icon.sh`; `wiki/` is the only source, and edits to the GitHub wiki are overwritten; R1–R8 |

- **Wiki grammar (D15b):** no HTML and no images (draw diagrams with mermaid fences); links go to page names or allowlisted `https://` hosts; `check-wiki.ts` rejects anything else.
- **Done when:** `node scripts/check-wiki.ts` lists only five `missing language counterpart …-zh-CN` lines and five `…-zh-CN.md: required page missing` lines. **Commit:** `B: English wiki`

### T14 — Chinese wiki
- **Files:** create the five `wiki/*-zh-CN.md`. **Acceptance:** B2. **Depends on:** T13. **Group:** G5.
- **Failing check:** T13's ten lines.
- **Implement:** the same heading levels in the same order; each page opens with `[英文版](<Page>)`, no paragraph is exempt from the language rules, and the page stays in the wiki grammar (D15b); every paragraph, list item and table row contains Chinese, with OS, product and command names kept in Latin inside Chinese sentences; Mermaid labels are localized; Usage names Windows, macOS and Linux and the source-view commands; Development shows the five commands.
- **Done when:** `node scripts/check-wiki.ts` → `check-wiki: ok (10 pages)`. Translation review at R3. **Commit:** `B: Chinese wiki`

### T18 — GitHub render cross-check (D15d)
- **Files:** create `scripts/lib/github-render.ts` (P14) and `scripts/tests/github-render.docs-spec.ts` (P15); add C10's `// T18` lines to `scripts/check-docs.ts`. **Acceptance:** B1 (B1.docs-check) and B2, as a step of the `check` job; no new ID. **Depends on:** B1's T1 and T6; B2's T8 (`GH_TOKEN` on the check step). **Group:** G5.
- **Failing check:** add P15; `node --test scripts/tests/github-render.docs-spec.ts` → FAIL `ERR_MODULE_NOT_FOUND … scripts/lib/github-render.ts`.
- **Implement:** P14 and the `// T18` lines (the import after the `images.ts` import; the block before the output loop). `gh api markdown` output recorded on 2026-10-28: each image sits in `<a target="_blank" … href="<its src>">`; an external image is proxied, its source in `data-canonical-src`; an `@name` outside code becomes a live link, so write it in code. `-F text=@file` sends the file; `-f` would send the literal string.
- **Done when:** the test → `ℹ pass 3`; `node scripts/check-docs.ts` prints the skip line without `GH_TOKEN` and fails with `GITHUB_ACTIONS=true`; `GH_TOKEN=$(gh auth token) node scripts/check-docs.ts` passes on the README and fails with both D15d lines on a wiki page holding the 1,001-backtick repro. **Commit:** `B: cross-check every page against GitHub's own render`
````ts P14 — scripts/lib/github-render.ts
// D15d: GitHub's own render of each page must show exactly the GFM tree's links and images, so any micromark/cmark-gfm divergence (such as code spans past 1,000 backticks) fails in CI.
import { spawnSync } from 'node:child_process';
import { all, parse } from '../docs/markdown.ts';
const REPO = 'D0n9X1n/mermaid-tty';
const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const attr = (tag: string, name: string) => { const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag); return m ? decode(m[1]!) : undefined; };
// Live links and images in GitHub's HTML, minus its image wrappers (<a target="_blank" href="<the img src>">) and heading anchors; a proxied image keeps data-canonical-src.
export function githubRefs(html: string): string[] {
  const out: string[] = [];
  for (const [, a, img, one] of html.matchAll(/(<a\s[^>]*>)(<img\s[^>]*>)|(<(?:a|img)\s[^>]*>)/g))
    for (const t of a ? [a, img!] : [one!]) {
      if (t.startsWith('<img')) { out.push(`image ${attr(t, 'data-canonical-src') ?? attr(t, 'src')}`); continue; }
      const href = attr(t, 'href'), wrapper = !!img && href === attr(img, 'src') && /\starget="_blank"/.test(t);
      if (href !== undefined && !wrapper && !/\sclass="anchor"/.test(t)) out.push(`link ${href}`);
    }
  return out;
}
// What the checker sees: link and image nodes, plus <a href> and <img src> inside raw HTML (the README hero).
export function treeRefs(md: string): string[] {
  const tree = parse(md), html = all(tree, 'html').flatMap((h) => [...h.value!.matchAll(/<(a|img)\s[^>]*>/g)])
    .flatMap(([t, k]) => { const v = attr(t!, k === 'a' ? 'href' : 'src'); return v === undefined ? [] : [`${k === 'a' ? 'link' : 'image'} ${v}`]; });
  return [...all(tree, 'link').map((l) => `link ${l.url}`), ...all(tree, 'image').map((i) => `image ${i.url}`), ...html];
}
const minus = (a: string[], b: string[]) => { const rest = [...b]; return a.filter((x) => { const i = rest.indexOf(x); if (i >= 0) rest.splice(i, 1); return i < 0; }); };
export function renderErrors(where: string, md: string, html: string): string[] {
  const gh = githubRefs(html), ours = treeRefs(md);
  return [...minus(gh, ours).map((r) => `${where}: GitHub renders ${r}, which the checker does not see (D15d)`),
    ...minus(ours, gh).map((r) => `${where}: the checker sees ${r}, which GitHub does not render (D15d)`)];
}
// GitHub's render of a repo file, as `gh api markdown` returns it; CI passes the job's GITHUB_TOKEN as GH_TOKEN.
export function githubHtml(file: string, cwd: string): string {
  const r = spawnSync('gh', ['api', 'markdown', '-F', `text=@${file}`, '-f', 'mode=gfm', '-f', `context=${REPO}`], { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`gh api markdown failed: ${(r.stderr || r.error?.message || 'no output').trim()}`);
  return r.stdout;
}
````
````ts P15 — scripts/tests/github-render.docs-spec.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { githubRefs, renderErrors, treeRefs } from '../lib/github-render.ts';
const T = '`'.repeat(1001), HERO = '<p align="center"><img src="assets/icon.svg" alt="logo" width="120"></p>'; // the HTML below is shaped like gh api markdown output recorded on 2026-10-28
const W = (src: string) => `<a target="_blank" rel="noopener noreferrer" href="${src}"><img src="${src}" alt="x" style="max-width: 100%;"></a>`;
test('githubRefs drops image wrappers and heading anchors and reads data-canonical-src', () => {
  const camo = 'https://camo.githubusercontent.com/abc';
  const html = `<p dir="auto">${W('assets/icon.svg')} <a target="_blank" rel="noopener noreferrer nofollow" href="${camo}"><img src="${camo}" alt="s" data-canonical-src="https://img.shields.io/b.svg?x=1&amp;y=2" style="max-width: 100%;"></a> ` +
    '<a href="https://github.com/D0n9X1n/mermaid-tty/releases"><img src="https://github.com/D0n9X1n/mermaid-tty/actions/workflows/ci.yml/badge.svg" alt="r"></a></p><h2><a class="anchor" href="#install"></a>Install</h2><a href="LICENSE">l</a>';
  assert.deepEqual(githubRefs(html), ['image assets/icon.svg', 'image https://img.shields.io/b.svg?x=1&y=2', 'link https://github.com/D0n9X1n/mermaid-tty/releases',
    'image https://github.com/D0n9X1n/mermaid-tty/actions/workflows/ci.yml/badge.svg', 'link LICENSE']);
});
test('the 1,001-backtick repro: GitHub renders a link and an image that the GFM tree hides in code spans', () => {
  const md = `[a](Usage-zh-CN) ${T}[Chinese](Usage-zh-CN)${T} ${T}![x](assets/rogue.svg)${T}`;
  const html = `<p dir="auto"><a href="Usage-zh-CN">a</a> ${T}<a href="Usage-zh-CN">Chinese</a>${T} ${T}${W('assets/rogue.svg')}${T}</p>`;
  assert.deepEqual(renderErrors('wiki/Usage.md', md, html), ['wiki/Usage.md: GitHub renders link Usage-zh-CN, which the checker does not see (D15d)',
    'wiki/Usage.md: GitHub renders image assets/rogue.svg, which the checker does not see (D15d)']);
});
test('agreement passes, the hero counts, and a ref only the checker sees fails', () => {
  assert.deepEqual(treeRefs(`${HERO}\n\n[l](LICENSE)`), ['link LICENSE', 'image assets/icon.svg']);
  assert.deepEqual(renderErrors('README', `${HERO}\n\n[l](LICENSE)`, `${W('assets/icon.svg')}<a href="LICENSE">l</a>`), []);
  assert.deepEqual(renderErrors('README', '[l](LICENSE)', '<p>[l](LICENSE)</p>'), ['README: the checker sees link LICENSE, which GitHub does not render (D15d)']);
});
````
````ts C10 — scripts/check-docs.ts, the // T18 lines
import { githubHtml, renderErrors } from './lib/github-render.ts'; // T18
// T18 begin: D15d, GitHub's render of each page must show the tree's links and images; CI passes GH_TOKEN, and a local run without it skips.
if (process.env.GH_TOKEN) for (const p of ['README.md', ...pages]) try { errors.push(...renderErrors(p, read(p), githubHtml(p, root))); } catch (e) { errors.push(`${p}: ${(e as Error).message}`); }
else if (process.env.GITHUB_ACTIONS === 'true') errors.push('GitHub render cross-check: GH_TOKEN is not set in CI (D15d)');
else console.log('check-docs: GitHub render cross-check skipped: no GH_TOKEN (CI sets it)');
// T18 end
````

### T16 — LF on every OS
- **Files:** modify `.gitattributes`, only if a check prints anything. **Acceptance:** A8 platforms (B's files), B4. **Depends on:** T15. **Group:** G9.
- **Failing check** (prints nothing when everything is right):
  ```bash
  git ls-files --eol -- '*.ts' '*.sh' '*.md' '*.yml' '*.svg' '*.mmd' '*.json' | grep -v 'eol=lf'
  git ls-files --eol -- '*.png' | grep -v -e '-text'
  ```
- **Implement**, only if either prints: append `*.<ext> text eol=lf` for each listed extension, and `*.png binary`, below A's lines; then `git add --renormalize .`.
- **Done when:** both print nothing; the Windows `check` job proves it at R2. **Commit:** `B: keep text LF on every OS`
