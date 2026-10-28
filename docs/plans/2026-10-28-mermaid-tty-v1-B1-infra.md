# mermaid-tty v1 B1: independent infrastructure (T1–T6)

Part of [plan B](2026-10-28-mermaid-tty-v1-B-docs-release.md), which holds the design check, component map, traceability, runbook and reconciliation. Each task adds its failing check, then the code under it, then runs its done-when command. The code ran on 2026-10-28 in a scratch tree against stub `core/` modules. A **Waits on A** interface is an assumption (D3): confirm it against plan A. Commits: one per task on `feat/v1`, each ending with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

**Needs:** nothing from B2 or B3. **Unblocks:** B2's T8 and T17 (T3, T6); B3's T7 (T6), T11 (T2, T6) and T13 (T5). T7 sits in B3 to keep this file under 500 lines.

### T1 — Markdown scanner
- **Files:** create `scripts/lib/markdown.ts` (C1) and `scripts/tests/markdown_test.ts` (C2). **Acceptance:** B1, B2. **Depends on:** none. **Group:** G1.
- **Failing check:** add C2; `node --test scripts/tests/markdown_test.ts` → FAIL `ERR_MODULE_NOT_FOUND … scripts/lib/markdown.ts`.
- **Implement:** C1. **Done when:** the same command → `ℹ pass 4`, `ℹ fail 0`. **Commit:** `B: fence-aware Markdown scanner`
````ts C1 — scripts/lib/markdown.ts
// Fence-aware Markdown scanning shared by check-wiki.ts and doc-rules.ts.
export type Block = { kind: 'heading' | 'para' | 'code'; line: number; lines: string[] };
const FENCE = /^ {0,3}(`{3,}|~{3,})/, HEADING = /^(#{1,6})[ \t]+(.*)$/;
export const CJK = /[぀-ヿ㐀-䶿一-鿿가-힯豈-﫿]/;
export function blocks(text: string): Block[] {
  const out: Block[] = [];
  let fence = '', cur: Block | null = null;
  text.split(/\r?\n/).forEach((line, i) => {
    const m = FENCE.exec(line);
    if (fence) {
      cur!.lines.push(line);
      if (m && m[1]![0] === fence[0] && m[1]!.length >= fence.length && line.trim() === m[1]) { fence = ''; cur = null; }
    } else if (m) { fence = m[1]!; out.push((cur = { kind: 'code', line: i + 1, lines: [line] })); }
    else if (HEADING.test(line)) { out.push({ kind: 'heading', line: i + 1, lines: [line] }); cur = null; }
    else if (!line.trim()) cur = null;
    else if (cur) cur.lines.push(line);
    else out.push((cur = { kind: 'para', line: i + 1, lines: [line] }));
  });
  return out;
}
export const headings = (text: string) => blocks(text).filter((b) => b.kind === 'heading')
  .map((b) => { const m = HEADING.exec(b.lines[0]!)!; return { depth: m[1]!.length, text: m[2]!.trim(), line: b.line }; });
// Links and images come only from the subset's allowlisted forms (D15); comments are blanked first, keeping line numbers.
export type Ref = { line: number; kind: 'link' | 'image'; label: string; target: string };
const FORMS = /\[!\[([^\]]*)\]\(([^)\s]+)\)\]\(([^)\s]+)\)|!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]*)\]\(([^)\s]+)\)|<(img|source)\b[^>]*?\b(?:src|srcset)="([^"]+)"[^>]*>|<a\b[^>]*?\bhref="([^"]+)"[^>]*>/g;
export function refs(text: string): Ref[] {
  const out: Ref[] = [];
  for (const b of blocks(text.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ' '))).filter((b) => b.kind !== 'code'))
    b.lines.forEach((l, k) => {
      for (const m of l.replace(/`[^`]*`/g, (c) => ' '.repeat(c.length)).matchAll(FORMS)) {
        const line = b.line + k;
        if (m[3]) out.push({ line, kind: 'image', label: m[1]!, target: m[2]! }, { line, kind: 'link', label: m[1]!, target: m[3] });
        else if (m[5]) out.push({ line, kind: 'image', label: m[4]!, target: m[5] });
        else if (m[7]) out.push({ line, kind: 'link', label: m[6]!, target: m[7] });
        else if (m[9]) out.push({ line, kind: 'image', label: '', target: m[9].split(/[\s,]/)[0]! });
        else if (m[10]) out.push({ line, kind: 'link', label: '', target: m[10] });
      }
    });
  return out;
}
export const links = (text: string) => refs(text).filter((r) => r.kind === 'link');
export const prose = (s: string) => s.replace(/`[^`]*`/g, ' ').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<[^>]*>/g, ' ');
export function section(text: string, title: string): string | null {
  const bs = blocks(text), start = bs.findIndex((b) => b.kind === 'heading' && b.lines[0] === `## ${title}`);
  if (start < 0) return null;
  const end = bs.findIndex((b, i) => i > start && b.kind === 'heading' && /^#{1,2}[ \t]/.test(b.lines[0]!));
  return bs.slice(start + 1, end < 0 ? undefined : end).map((b) => b.lines.join('\n')).join('\n\n');
}
````
````ts C2 — scripts/tests/markdown_test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { CJK, blocks, headings, links, prose, section } from '../lib/markdown.ts';
const md = '# T\n\n[中文](Home-zh-CN)\n\n```sh\n# not a heading [x](Fake)\n```\n\n## A\n`[c](Code)` and [Usage](Usage) ![i](a.svg)\n\n### A1\n\n## B\n';
test('blocks keep fences whole and split on blank lines', () => assert.deepEqual(blocks(md).map((b) => [b.kind, b.line]),
  [['heading', 1], ['para', 3], ['code', 5], ['heading', 9], ['para', 10], ['heading', 12], ['heading', 14]]));
test('headings and links skip code; images and inline code are not links', () => {
  assert.deepEqual(headings(md).map((h) => h.depth), [1, 2, 3, 2]);
  assert.deepEqual(links(md).map((l) => l.target), ['Home-zh-CN', 'Usage']);
});
test('prose keeps link text and drops code and tags; CJK ignores box drawing and accents', () => {
  assert.equal(prose('`x` [甲](Y) <b>z</b>').trim(), '甲  z');
  assert.ok(CJK.test('中') && CJK.test('한') && !CJK.test('─►é'));
});
test('section runs to the next h1/h2; an unclosed fence runs to the end', () => {
  assert.equal(section(md, 'A'), md.split('\n').slice(9, 12).join('\n'));
  assert.equal(section(md, 'Missing'), null);
  assert.deepEqual(headings('```\n# x'), []);
});
````

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

### T3 — Acceptance rules
- **Files:** create `scripts/lib/doc-rules.ts` (C5) and `scripts/tests/doc-rules_test.ts` (C6). **Acceptance:** B1, B3, B6, and the workflow helpers B2 reuses. **Depends on:** T1. **Group:** G2.
- **Failing check:** add C6; `node --test scripts/tests/doc-rules_test.ts` → FAIL `ERR_MODULE_NOT_FOUND … scripts/lib/doc-rules.ts`.
- **Implement:** C5. **Done when:** → `ℹ pass 29`, `ℹ fail 0`. **Commit:** `B: acceptance rules for README, publish-wiki and icon`
````ts C5 — scripts/lib/doc-rules.ts
// Pure acceptance rules: B1 README, B3 publish-wiki.yml, B6 icon; plus the workflow helpers that ci-rules.ts and cc-versions.ts reuse.
import { blocks, refs, section } from './markdown.ts';
export const TAGLINE = 'Yet, just another Mermaid renderer for your terminal';
export const INSTALL = ['claude plugin marketplace add D0n9X1n/mermaid-tty', 'claude plugin install mermaid-tty@mermaid-tty'];
export const LOCAL = ['bash scripts/check.sh', 'npm ci --prefix scripts/e2e', 'node scripts/e2e/run.ts', 'node scripts/render-gallery.ts', 'node scripts/check-ci-coverage.ts'];
export const CTRL_O = /ctrl\+o (shows|reveals|displays)/i;
const REPO = 'https://github.com/D0n9X1n/mermaid-tty', SHIELDS = 'img\\.shields\\.io\\/github';
const BADGES: [string, RegExp][] = [['CI', /\[!\[CI\]\([^)]*\/actions\/workflows\/ci\.yml\/badge\.svg\)\]/],
  ['release', new RegExp(`\\[!\\[Release\\]\\([^)]*${SHIELDS}\\/v\\/release\\/D0n9X1n\\/mermaid-tty[^)]*\\)\\]`)],
  ['license', /\[!\[License[^\]]*\]\([^)]*license[^)]*\)\]/i],
  ['stars', new RegExp(`\\[!\\[Stars\\]\\([^)]*${SHIELDS}\\/stars\\/D0n9X1n\\/mermaid-tty[^)]*\\)\\]`)]];
const SECTIONS = ['Install', 'Before and after', 'Supported diagrams', 'Themes', 'Configuration', 'FAQ', 'Development'];
const FAQ = [/falls? ?back/i, /width|columns/i, /CJK/, /Windows Terminal/, /macOS Terminal/, /iTerm2/, /Ghostty/, /Linux/, /256-colou?r/, /fonts?\b/i, /\/mermaid-tty source/, /\/mermaid-tty diagram/, /\/copy\b/];
export const supportedTypes = (md: string) =>
  [...(/<!-- types:start -->([\s\S]*?)<!-- types:end -->/.exec(md)?.[1] ?? '').matchAll(/^\| `([\w-]+)` \|/gm)].map((m) => m[1]!);
// B1 images: only what renders counts; each displayed assets/ image is a rendered diagram or on this short non-diagram list.
export const NON_DIAGRAM = ['assets/icon.svg'];
export const visible = (md: string) => blocks(md).filter((b) => b.kind !== 'code').map((b) => b.lines.join('\n')).join('\n\n')
  .replace(/<!--[\s\S]*?-->/g, '').replace(/`[^`]*`/g, '');
export const assetImages = (md: string) => refs(md).filter((r) => r.kind === 'image').map((r) => r.target.replace(/^.*?(?=assets\/)/, '')).filter((p) => p.startsWith('assets/'));
export const imageErrors = (where: string, md: string, diagrams: string[]) => assetImages(md)
  .filter((p) => !diagrams.includes(p) && !NON_DIAGRAM.includes(p)).map((p) => `${where}: displays ${p}, which is neither a rendered diagram nor allow-listed`);
// D15: README and wiki pages use a strict, checkable Markdown subset; anything outside it fails, so no link or image can hide.
const ATTRS = String.raw`(?:\s+[\w-]+="[^"]*")*\s*`;
const ALLOWED = new RegExp(String.raw`\[!\[[^\]]*\]\([^)\s]+\)\]\([^)\s]+\)|!\[[^\]]*\]\([^)\s]+\)|\[[^\]]*\]\([^)\s]+\)|<(?:img|source)${ATTRS}\/?>|<a${ATTRS}>|<\/a>|<p align="center">|<\/p>|<\/?picture>|<!-- types:(?:start|end) -->`, 'g');
const OUTSIDE: [RegExp, string][] = [[/<https?:/i, 'autolink'], [/<!--/, 'HTML comment'], [/<(?:img|source|a|p)\b[^>]*=\s*[^"\s>]/i, 'HTML attribute not double-quoted'],
  [/<\/?[a-z]/i, 'raw HTML tag outside the allowlist'], [/\]\[|^\s*\[[^\]]*\]:/, 'reference-style link, image or definition'], [/https?:\/\/|www\./i, 'bare URL'],
  [/[[\]]/, 'bracket outside a link or image (reference or wiki link)']];
export function subsetErrors(where: string, md: string): string[] {
  const e: string[] = [];
  let inList = false;
  for (const b of blocks(md).filter((b) => b.kind !== 'code')) b.lines.forEach((l, k) => {
    const at = `${where}:${b.line + k}`, t = l.replace(/`[^`]*`/g, ' ');
    if (k === 0 && /^( {4}|\t)/.test(l) && !inList) e.push(`${at}: indented code block outside the Markdown subset`);
    if (/^\s*([-*+]|\d+[.)])\s/.test(l)) inList = true; else if (!/^\s/.test(l)) inList = false;
    if (/\\[[\]()!<>]/.test(t)) e.push(`${at}: backslash escape of link or image syntax outside the Markdown subset`);
    const hit = OUTSIDE.find(([re]) => re.test(t.replace(ALLOWED, ' ')));
    if (hit) e.push(`${at}: ${hit[1]} outside the Markdown subset`);
  });
  return e;
}
export function readmeErrors(md: string, generated: string[]): string[] {
  const e: string[] = [], hero = visible(md.split(/^## /m)[0]!), faq = section(md, 'FAQ') ?? '', dev = section(md, 'Development') ?? '';
  if (!assetImages(hero).includes('assets/icon.svg')) e.push('hero: logo <img src="assets/icon.svg"> missing');
  if (!hero.includes(TAGLINE)) e.push('hero: tagline missing');
  for (const [name, re] of BADGES) if (!re.test(hero)) e.push(`hero: ${name} badge missing`);
  if (!blocks(md).some((b) => b.kind === 'code' && b.lines.slice(1, -1).join('\n') === INSTALL.join('\n')))
    e.push('install: no code block holding exactly the two install commands');
  for (const s of SECTIONS) if (section(md, s) === null) e.push(`section missing: ## ${s}`);
  for (const re of FAQ) if (!re.test(faq)) e.push(`FAQ: no answer matching /${re.source}/`);
  if (!md.includes(`[English](${REPO}/wiki)`)) e.push('wiki link missing: English');
  if (!md.includes(`[简体中文](${REPO}/wiki/Home-zh-CN)`)) e.push('wiki link missing: 简体中文');
  const shown = assetImages(md);
  for (const f of generated) if (!shown.includes(f)) e.push(`image not shown in README: ${f}`);
  e.push(...imageErrors('README', md, generated));
  for (const c of LOCAL) if (!dev.includes(c)) e.push(`Development: does not show ${c}`);
  const drawn = /[\u2500-\u25ff]/.exec(md);
  if (drawn) e.push(`README: hand-drawn diagram glyph ${drawn[0]}; show render-svg output instead`);
  if (CTRL_O.test(md)) e.push('README: claims ctrl+o shows the source; document /mermaid-tty source instead');
  if (!supportedTypes(md).length) e.push('Supported diagrams: table between <!-- types:start/end --> is empty');
  e.push(...subsetErrors('README', md));
  return e;
}
const PIN = /^\s*(-\s+)?uses:\s*[\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d/;
const steps = (yml: string) => yml.split(/\n(?=\s+- )/);
const first = (s: string) => s.trim().split('\n')[0];
export const common = (name: string, yml: string) => [
  ...yml.split('\n').filter((l) => /^\s*(-\s+)?uses:/.test(l) && !PIN.test(l)).map((l) => `${name}: action not pinned by full SHA with a # version comment: ${l.trim()}`),
  ...steps(yml).filter((s) => /\brun:[\s\S]*\.sh\b/.test(s) && !/\bshell: bash\b/.test(s)).map((s) => `${name}: step runs a .sh script without shell: bash: ${first(s)}`),
  ...steps(yml).filter((s) => /\brun:[\s\S]*(scripts\/|gh release|claude plugin)/.test(s) && !/\bid: [\w-]+/.test(s)).map((s) => `${name}: check step has no stable id: ${first(s)}`)];
export const need = (name: string, yml: string, rules: [string, string | RegExp][]) => rules
  .filter(([, r]) => (typeof r === 'string' ? !yml.includes(r) : !r.test(yml))).map(([what]) => `${name}: missing ${what}`);
export const publishWikiErrors = (yml: string) => [...common('publish-wiki.yml', yml), ...need('publish-wiki.yml', yml, [
  ['push to main', 'on:\n  push:\n    branches: [main]\n'], ['workflow_dispatch', '\n  workflow_dispatch:\n'],
  ['read-only workflow token', '\npermissions:\n  contents: read\n'], ['job-scoped contents: write', '\n    permissions:\n      contents: write\n'],
  ['ubuntu runner', '    runs-on: ubuntu-latest\n'], ['publisher call', 'scripts/publish-wiki.sh wiki wiki-repo "$GITHUB_SHA"'],
  ['push-if-changed', "if: steps.mirror.outputs.changed == 'true'"]]),
  ...(/^\s*paths(-ignore)?:/m.test(yml) ? ['publish-wiki.yml: paths filter would skip merges; publish on every push to main'] : [])];
export function iconErrors(png: Uint8Array): string[] {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (png.length < 24 || sig.some((b, i) => png[i] !== b) || String.fromCharCode(...png.subarray(12, 16)) !== 'IHDR') return ['icon.png: not a PNG'];
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength), w = v.getUint32(16), h = v.getUint32(20);
  return [...(w === 512 && h === 512 ? [] : [`icon.png: ${w}×${h}, want 512×512`]), ...(png.length < 2_000_000 ? [] : [`icon.png: ${png.length} bytes, want under 2 MB`])];
}
````
````ts C6 — scripts/tests/doc-rules_test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { INSTALL, LOCAL, TAGLINE, iconErrors, imageErrors, publishWikiErrors, readmeErrors, subsetErrors, supportedTypes } from '../lib/doc-rules.ts';
const R = 'https://github.com/D0n9X1n/mermaid-tty', S = 'https://img.shields.io/github', SHA = 'a'.repeat(40), IMG = ['assets/readme/after.svg'];
const README = `<p align="center"><img src="assets/icon.svg" width="120" alt="logo"></p>\n\n**${TAGLINE}**\n\n` +
  `[![CI](${R}/actions/workflows/ci.yml/badge.svg)](${R}/actions/workflows/ci.yml) [![Release](${S}/v/release/D0n9X1n/mermaid-tty)](${R}/releases) ` +
  `[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![Stars](${S}/stars/D0n9X1n/mermaid-tty)](${R}/stargazers)\n\n` +
  `## Install\n\n\`\`\`sh\n${INSTALL.join('\n')}\n\`\`\`\n\n## Before and after\n\n![after](${IMG[0]})\n\n## Supported diagrams\n\n` +
  '<!-- types:start -->\n| Type | Header keywords |\n|---|---|\n| `flowchart` | `flowchart`, `graph` |\n<!-- types:end -->\n\n## Themes\n\n## Configuration\n\n' +
  '## FAQ\n\nIt falls back to the source when no layout fits the width; CJK labels count 2 columns. It runs in Windows Terminal, macOS Terminal, ' +
  'iTerm2, Ghostty and Linux terminals; 256-color terminals get the nearest colors; pick a font with box drawing. Run `/mermaid-tty source` or `/mermaid-tty diagram`; `/copy` copies the source.\n\n' +
  `## Development\n\n\`\`\`sh\n${LOCAL.join('\n')}\n\`\`\`\n\n[English](${R}/wiki) · [简体中文](${R}/wiki/Home-zh-CN)\n`;
const PIN = (a: string, v: string) => `      - uses: actions/${a}@${SHA} # ${v}\n`;
const WIKI = "on:\n  push:\n    branches: [main]\n  workflow_dispatch:\n\npermissions:\n  contents: read\n\njobs:\n  publish:\n    runs-on: ubuntu-latest\n" +
  `    permissions:\n      contents: write\n    steps:\n${PIN('checkout', 'v7.0.1')}      - id: mirror\n        shell: bash\n        run: scripts/publish-wiki.sh wiki wiki-repo "$GITHUB_SHA"\n` +
  "      - if: steps.mirror.outputs.changed == 'true'\n";
const png = (w: number, h: number) => { const b = new Uint8Array(33), v = new DataView(b.buffer);
  b.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]); v.setUint32(16, w); v.setUint32(20, h); return b; };
const rm = (s: string) => readmeErrors(s, IMG);
test('complete fixtures pass', () => {
  assert.deepEqual([rm(README), publishWikiErrors(WIKI), iconErrors(png(512, 512))], [[], [], []]);
  assert.deepEqual(supportedTypes(README), ['flowchart']);
});
const cases: [(s: string) => string[], string, string, string, string][] = [
  [rm, README, TAGLINE, 'A renderer', 'tagline'], [rm, README, '[![Stars]', '[![Fans]', 'stars badge'],
  [rm, README, INSTALL[1]!, 'claude plugin install mermaid-tty', 'install'], [rm, README, '## FAQ', '## Questions', '## FAQ'],
  [rm, README, 'CJK labels', 'Wide labels', 'CJK'], [rm, README, 'Ghostty', 'Kitty', 'Ghostty'], [rm, README, '256-color', 'basic', '256'],
  [rm, README, '[简体中文]', '[Chinese]', '简体中文'], [rm, README, IMG[0]!, 'assets/rogue.svg', 'displays assets/rogue.svg, which is neither'],
  [rm, README, '![after](assets/readme/after.svg)', '<!-- ![after](assets/readme/after.svg) -->', 'not shown in README'],
  [rm, README, '![after](', '\\![after](', 'backslash escape'], [rm, README, '![after](assets/readme/after.svg)', '\n    ![after](assets/readme/after.svg)', 'indented code block'],
  [rm, README, '![after](assets/readme/after.svg)', "<img src='assets/rogue.svg'>", 'not double-quoted'], [rm, README, '![after](assets/readme/after.svg)', '![x][ref]\n\n[ref]: assets/rogue.svg', 'reference-style'],
  [rm, README, '| `flowchart` |', '| flowchart |', 'table'], [rm, README, 'node scripts/e2e/run.ts', 'npm test', 'e2e/run.ts'],
  [rm, README, '## Themes', '──► A\n\n## Themes', 'hand-drawn'],
  [rm, README, '; `/copy` copies', '; it copies', '/copy'], [rm, README, '## Themes', 'ctrl+o shows the source.\n\n## Themes', 'ctrl+o'],
  [publishWikiErrors, WIKI, '  workflow_dispatch:\n', '', 'workflow_dispatch'], [publishWikiErrors, WIKI, 'contents: write', 'contents: read', 'job-scoped'],
  [publishWikiErrors, WIKI, 'ubuntu-latest', 'windows-latest', 'ubuntu'], [publishWikiErrors, WIKI, `@${SHA} # v7.0.1`, '@v7', 'pinned'],
  [publishWikiErrors, WIKI, '        shell: bash\n        run: scripts', '        run: scripts', 'without shell: bash'], [publishWikiErrors, WIKI, '[main]\n', '[main]\n    paths: [wiki/**]\n', 'paths'],
];
for (const [rule, base, from, to, want] of cases)
  test(`rejects: ${want}`, () => assert.ok(rule(base.replace(from, to)).some((e) => e.includes(want)), `${from} -> ${to}`));
test('Markdown subset: allowlisted forms pass; every other form fails', () => {
  assert.deepEqual(subsetErrors('x.md', '<p align="center"><img src="a.svg" width="9" alt="a"></p>\n\n[![b](c.svg)](d) ![e](f.svg) [g](h) `<i>`\n\n- a\n\n    b\n\n<!-- types:start -->\n| a |\n<!-- types:end -->\n\n```sh\n<b>\n```\n'), []);
  for (const [md, want] of [['<https://x.dev>', 'autolink'], ['see https://x.dev', 'bare URL'], ['![a][r]', 'reference-style'], ['[r]: x', 'reference-style'],
    ['\\[a](b)', 'backslash escape'], ['# h\n\n    x', 'indented code'], ["<img src='a'>", 'not double-quoted'], ['<a href=b>', 'not double-quoted'],
    ['<div align="center">', 'raw HTML'], ['<!-- c -->', 'HTML comment'], ['[[Page]]', 'bracket outside']]) assert.ok(subsetErrors('x.md', md).some((e) => e.includes(want)), want);
});
test('wiki images: rendered diagrams or allow-listed only', () => {
  assert.deepEqual(imageErrors('wiki/Home.md', '![d](https://raw.githubusercontent.com/D0n9X1n/mermaid-tty/main/assets/readme/after.svg) <img src="../assets/icon.svg">', IMG), []);
  assert.ok(imageErrors('wiki/Home.md', '![r](../assets/rogue.svg)', IMG)[0]!.includes('displays assets/rogue.svg'));
});
test('icon rule reads the IHDR size', () => {
  assert.ok(iconErrors(png(256, 256))[0]!.includes('want 512×512'));
  assert.deepEqual(iconErrors(new Uint8Array(40)), ['icon.png: not a PNG']);
});
````

### T4 — Wiki publisher, mirrored from SonicTerm
- **Files:** create `scripts/test-wiki-publish.sh`, `scripts/publish-wiki.sh` and `.github/workflows/publish-wiki.yml`. **Acceptance:** B3. **Depends on:** none. **Group:** G1.
- **Failing check:** derive the test (drop SonicTerm's workflow and guidance greps; `doc-rules.ts` owns the workflow rules), then append C7's first line, `printf 'wiki publish test: publisher ok\n'`:
  ```bash
  S=bf87f160b4bb861b26f0e844794997cad78ecd21; R=/Users/d0n9x1n/Workspace/fun-code/sonicterm
  git -C "$R" show "${S}:scripts/test-wiki-publish.sh" | sed -e '6s/check-wiki\.py/check-wiki.ts/' -e '7,8d' -e '16,17d' -e '61,$d' > scripts/test-wiki-publish.sh
  ```
  `chmod +x scripts/test-wiki-publish.sh && bash scripts/test-wiki-publish.sh` → FAIL `wiki publish test: publisher is missing or not executable`.
- **Implement:**
  ```bash
  git -C "$R" show "${S}:scripts/publish-wiki.sh" > scripts/publish-wiki.sh && chmod +x scripts/publish-wiki.sh
  git -C "$R" show "${S}:.github/workflows/publish-wiki.yml" > .github/workflows/publish-wiki.yml
  perl -0pi -e 's/(        id: mirror\n)/$1        shell: bash\n/' .github/workflows/publish-wiki.yml
  ```
- **Done when:** `bash scripts/test-wiki-publish.sh` ends with `wiki publish test: publisher ok`. **Commit:** `B: mirror SonicTerm's wiki publisher and workflow`

### T5 — Wiki checker
- **Files:** create `scripts/check-wiki.ts` (C8); append the rest of C7 to `scripts/test-wiki-publish.sh`. **Acceptance:** B2. **Depends on:** T1, T3, T4. **Group:** G3.
- **Failing check:** append the rest of C7; `bash scripts/test-wiki-publish.sh` → `publisher ok`, then FAIL `wiki publish test: checker is missing`.
- **Implement:** C8. **Done when:** → `wiki publish test: ok` (a valid fixture wiki passes; 21 mutations fail with their diagnostics), and `node scripts/check-wiki.ts` in the repo lists `wiki/: directory missing` and the 10 required pages until T13–T14. **Commit:** `B: wiki checker with pair, opener and per-unit language rules`
````ts C8 — scripts/check-wiki.ts
// B2 wiki rules, ported from SonicTerm scripts/check-wiki.py (pairs, nesting, heading parity, links) plus
// B2's exact openers, same-wiki absolute links counted as pages, per-unit language rules with no exemption, and the Markdown subset (D15). Exit 1 lists every failure.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CTRL_O, LOCAL, subsetErrors } from './lib/doc-rules.ts';
import { CJK, blocks, headings, links, prose } from './lib/markdown.ts';
const ZH = '-zh-CN', REQUIRED = ['Home', 'Usage', 'Configuration-and-Themes', 'Architecture', 'Development-and-Release'];
const dir = fileURLToPath(new URL('../wiki/', import.meta.url)), errors: string[] = [], pages = new Map<string, string>();
const twin = (p: string) => (p.endsWith(ZH) ? p.slice(0, -ZH.length) : p + ZH);
const local = (t: string) => !/^[a-z][a-z0-9+.-]*:|^#|^\/\//i.test(t);
const WIKI = /^https:\/\/github\.com\/D0n9X1n\/mermaid-tty\/wiki\/?([^?#]*)/i;
const pageOf = (t: string) => { const m = WIKI.exec(t); return m ? m[1] || 'Home' : local(t) ? t.split('#')[0]! : null; };
const units = (lines: string[]) => lines.reduce<string[]>((out, l) =>
  (/^\s*([-*+]|\d+[.)])\s|^\s*\|/.test(l) || !out.length ? out.push(l) : (out[out.length - 1] += ` ${l}`), out), []);
let names: string[] = [];
try { names = readdirSync(dir, { recursive: true }).map(String).filter((f) => f.endsWith('.md')); }
catch { errors.push('wiki/: directory missing'); }
for (const f of names) {
  if (/[\\/]/.test(f)) errors.push(`wiki/${f.replaceAll('\\', '/')}: nested pages are not allowed`);
  else pages.set(f.slice(0, -3), readFileSync(join(dir, f), 'utf8'));
}
for (const p of REQUIRED.flatMap((p) => [p, p + ZH])) if (!pages.has(p)) errors.push(`wiki/${p}.md: required page missing`);
for (const p of ['Usage', 'Usage-zh-CN']) for (const os of ['Windows', 'macOS', 'Linux', '/mermaid-tty source', '/mermaid-tty diagram', '/copy'])
  if (pages.has(p) && !pages.get(p)!.includes(os)) errors.push(`wiki/${p}.md: does not cover ${os}`);
for (const p of ['Development-and-Release', 'Development-and-Release-zh-CN']) for (const c of LOCAL)
  if (pages.has(p) && !pages.get(p)!.includes(c)) errors.push(`wiki/${p}.md: does not show ${c}`);
for (const [p, t] of pages) if (CTRL_O.test(t)) errors.push(`wiki/${p}.md: claims ctrl+o shows the source`);
for (const [page, text] of pages) {
  const f = `wiki/${page}.md`, zh = page.endsWith(ZH);
  errors.push(...subsetErrors(f, text));
  if (!pages.has(twin(page))) { errors.push(`${f}: missing language counterpart ${twin(page)}`); continue; }
  const bs = blocks(text), opener = bs[0]?.kind === 'heading' && bs[0].lines[0]!.startsWith('# ') ? bs[1] : bs[0];
  const want = zh ? `[英文版](${twin(page)})` : `[Chinese (Simplified)](${twin(page)})`;
  if (opener?.kind !== 'para' || opener.lines.join('\n').trim() !== want) errors.push(`${f}: must open with exactly ${want}`);
  let crossing = 0, chinese = 0;
  for (const l of links(text)) {
    const t = pageOf(l.target);
    if (t === null) continue;
    if (t.endsWith('.md')) errors.push(`${f}:${l.line}: link must omit .md: ${l.target}`);
    else if (!pages.has(t)) errors.push(`${f}:${l.line}: link target does not exist: ${l.target}`);
    else if (t.endsWith(ZH) !== zh) crossing++;
  }
  if (crossing > 1) errors.push(`${f}: ${crossing} cross-language links; only the opening twin link is allowed`);
  for (const b of bs) {
    if (b.kind === 'code') continue;
    for (const u of units(b.lines)) {
      const t = prose(u), has = CJK.test(t);
      if (zh && has && b.kind === 'para' && b !== opener) chinese++;
      if (zh && !has && /\p{L}/u.test(t)) errors.push(`${f}:${b.line}: untranslated, no CJK: ${u.trim().slice(0, 60)}`);
      if (!zh && has) errors.push(`${f}:${b.line}: CJK outside code: ${u.trim().slice(0, 60)}`);
    }
  }
  if (zh && !chinese) errors.push(`${f}: no Chinese prose`);
  const mine = headings(text).map((h) => h.depth).join(), theirs = headings(pages.get(twin(page))!).map((h) => h.depth).join();
  if (!zh && mine !== theirs) errors.push(`${f}: heading levels [${mine}] differ from ${twin(page)} [${theirs}]`);
}
for (const e of errors.sort()) console.error(`check-wiki: ${e}`);
if (errors.length) process.exit(1);
console.log(`check-wiki: ok (${pages.size} pages)`);
````
````bash C7 — scripts/test-wiki-publish.sh from line 57 (T4 appends the first line; T5 the rest)
printf 'wiki publish test: publisher ok\n'

# Checker (B2): a valid fixture wiki passes and each mutation fails with its diagnostic, in throwaway dirs.
[[ -f "$checker" ]] || fail "checker is missing"
base="$tmp/checker"; mkdir -p "$base/scripts/lib" "$base/wiki"
cp "$checker" "$base/scripts/"; cp "$root/scripts/lib/markdown.ts" "$root/scripts/lib/doc-rules.ts" "$base/scripts/lib/"
pair() { # pair STEM ENGLISH_TITLE CHINESE_TITLE
  printf '# %s\n\n[Chinese (Simplified)](%s-zh-CN)\n\n## Overview\n\nSee [Home](Home).\n\n```text\n中文 in code is fine\n```\n' "$2" "$1" > "$base/wiki/$1.md"
  printf '# %s\n\n[英文版](%s)\n\n## 概述\n\n参见[首页](Home-zh-CN)。\n\n```text\nEnglish in code is fine\n```\n' "$3" "$1" > "$base/wiki/$1-zh-CN.md"
}
pair Home Home 首页; pair Usage Usage 用法; pair Configuration-and-Themes Configuration 配置与主题
pair Architecture Architecture 架构; pair Development-and-Release Development 开发与发布
printf '\nWorks on Windows, macOS and Linux. Run `/mermaid-tty source` or `/mermaid-tty diagram`; `/copy` copies the source.\n' >> "$base/wiki/Usage.md"
printf '\n支持 Windows、macOS 和 Linux。用 `/mermaid-tty source` 或 `/mermaid-tty diagram` 切换，`/copy` 复制源码。\n' >> "$base/wiki/Usage-zh-CN.md"
for p in Development-and-Release Development-and-Release-zh-CN; do
  printf '\n```sh\nbash scripts/check.sh\nnpm ci --prefix scripts/e2e\nnode scripts/e2e/run.ts\nnode scripts/render-gallery.ts\nnode scripts/check-ci-coverage.ts\n```\n' >> "$base/wiki/$p.md"
done
(cd "$base" && node scripts/check-wiki.ts) >/dev/null || fail "checker rejected a valid wiki"
edit() { node -e 'const fs=require("fs"),[f,a,b]=process.argv.slice(1),s=fs.readFileSync(f,"utf8");if(!s.includes(a))process.exit(9);fs.writeFileSync(f,s.replace(a,b))' "$@"; }
rejects() { # rejects NAME EXPECTED MUTATION...
  local name="$1" expected="$2" fixture="$tmp/$1"; shift 2
  cp -R "$base" "$fixture"; (cd "$fixture" && "$@") || fail "mutation $name did not apply"
  if (cd "$fixture" && node scripts/check-wiki.ts >output 2>&1); then fail "checker accepted $name"; fi
  grep -Fq -- "$expected" "$fixture/output" || { cat "$fixture/output" >&2; fail "$name: expected '$expected'"; }
}
rejects missing-twin 'missing language counterpart Usage-zh-CN' rm wiki/Usage-zh-CN.md
rejects missing-page 'wiki/Architecture.md: required page missing' rm wiki/Architecture.md wiki/Architecture-zh-CN.md
rejects no-opener 'must open with exactly [Chinese (Simplified)](Usage-zh-CN)' edit wiki/Usage.md '[Chinese (Simplified)](Usage-zh-CN)' 'Read me.'
rejects second-twin-link 'cross-language links' edit wiki/Usage.md 'See [Home](Home).' 'See [Home](Home) and [Chinese](Usage-zh-CN).'
rejects cross-language 'cross-language links' edit wiki/Usage-zh-CN.md '](Home-zh-CN)' '](Home)'
rejects cjk-in-english 'CJK outside code' edit wiki/Usage.md 'See [Home](Home).' '参见 [Home](Home).'
rejects untranslated 'untranslated, no CJK' edit wiki/Usage-zh-CN.md $'[英文版](Usage)\n' $'[英文版](Usage)\n\n- Still English\n'
rejects no-chinese 'no Chinese prose' edit wiki/Architecture-zh-CN.md '参见[首页](Home-zh-CN)。' '`code only`'
rejects heading-levels 'heading levels' edit wiki/Usage.md '## Overview' '### Overview'
rejects md-link 'link must omit .md' edit wiki/Usage.md '](Home)' '](Home.md)'
rejects unknown-link 'link target does not exist' edit wiki/Usage.md '](Home)' '](Nowhere)'
rejects nested 'nested pages are not allowed' sh -c 'mkdir wiki/sub && cp wiki/Usage.md wiki/sub/'
rejects usage-os 'wiki/Usage.md: does not cover Windows' edit wiki/Usage.md 'Works on Windows, ' 'Works on '
rejects dev-commands 'does not show node scripts/e2e/run.ts' edit wiki/Development-and-Release.md 'node scripts/e2e/run.ts' 'node scripts/e2e/other.ts'
rejects usage-source 'wiki/Usage.md: does not cover /copy' edit wiki/Usage.md '; `/copy` copies the source' ''
rejects ctrl-o-claim 'claims ctrl+o shows the source' edit wiki/Usage.md 'See [Home](Home).' 'See [Home](Home). ctrl+o shows the source.'
rejects old-opener 'untranslated, no CJK: [English](Usage)' edit wiki/Usage-zh-CN.md '[英文版](Usage)' '[English](Usage)'
rejects absolute-cross-link 'cross-language links' edit wiki/Usage.md 'See [Home](Home).' 'See [Home](Home) and [Chinese page](https://github.com/D0n9X1n/mermaid-tty/wiki/Usage-zh-CN).'
rejects autolink 'autolink outside the Markdown subset' edit wiki/Usage.md 'See [Home](Home).' 'See [Home](Home) and <https://github.com/D0n9X1n/mermaid-tty/wiki/Usage-zh-CN>.'
rejects wiki-link 'bracket outside a link or image' edit wiki/Usage.md 'See [Home](Home).' 'See [Home](Home) and [[Usage-zh-CN]].'
rejects badge-cross-link 'cross-language links' edit wiki/Usage.md 'See [Home](Home).' 'See [Home](Home) and [![zh](../assets/icon.svg)](Usage-zh-CN).'
printf 'wiki publish test: ok\n'
````

### T6 — Image manifest and the check-docs runner
- **Files:** create `scripts/lib/images.ts` (C9) and `scripts/check-docs.ts` (C10; T8, T11 and T17 add their marked lines). **Acceptance:** B1, B3, B6. **Depends on:** T3. **Group:** G3.
- **Failing check:** `node scripts/check-docs.ts` before C10 exists → FAIL `Cannot find module …/scripts/check-docs.ts`.
- **Implement:** C9, C10. **Done when:** it exits 1 with one `check-docs:` line per missing item (hero, sections, images, `icon.png: missing`) and no stack trace. **Commit:** `B: check-docs runner`
````ts C9 — scripts/lib/images.ts
// README image manifest: which .mmd source renders to which SVG, at what width and theme. No core import.
export const THEMES = ['default', 'nord', 'dracula', 'gruvbox', 'solarized', 'mono'] as const;
export type Image = { file: string; source: string; columns: number; theme: (typeof THEMES)[number]; raw?: boolean };
export const IMAGES: Image[] = [
  { file: 'assets/readme/before.svg', source: 'assets/readme/src/hero.mmd', columns: 60, theme: 'default', raw: true },
  { file: 'assets/readme/after.svg', source: 'assets/readme/src/hero.mmd', columns: 60, theme: 'default' },
  { file: 'assets/readme/sequence.svg', source: 'assets/readme/src/sequence.mmd', columns: 72, theme: 'default' },
  { file: 'assets/readme/cjk.svg', source: 'assets/readme/src/cjk.mmd', columns: 60, theme: 'default' },
  ...THEMES.map((theme) => ({ file: `assets/readme/theme-${theme}.svg`, source: 'assets/readme/src/theme.mmd', columns: 44, theme })),
];
````
````ts C10 — scripts/check-docs.ts
// Runs the B1/B3/B4/B6 rules against the real files; exit 1 lists every failure. Same result on Linux, macOS and Windows.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetImages, iconErrors, imageErrors, publishWikiErrors, readmeErrors } from './lib/doc-rules.ts';
import { IMAGES } from './lib/images.ts';
const root = fileURLToPath(new URL('..', import.meta.url)), at = (p: string) => join(root, p);
const read = (p: string) => (existsSync(at(p)) ? readFileSync(at(p), 'utf8').replace(/\r\n/g, '\n') : '');
const md = read('README.md'), diagrams = IMAGES.map((i) => i.file);
const pages = existsSync(at('wiki')) ? readdirSync(at('wiki')).filter((f) => f.endsWith('.md')).map((f) => `wiki/${f}`) : [];
const errors = [...readmeErrors(md, diagrams), ...publishWikiErrors(read('.github/workflows/publish-wiki.yml')),
  ...pages.flatMap((p) => imageErrors(p, read(p), diagrams))];
for (const p of new Set([md, ...pages.map((p) => read(p))].flatMap((t) => assetImages(t)))) if (!existsSync(at(p))) errors.push(`${p} is displayed but does not exist`);
errors.push(...(existsSync(at('.claude-plugin/icon.png')) ? iconErrors(readFileSync(at('.claude-plugin/icon.png'))) : ['icon.png: missing']));
const listed = new Set(diagrams);
for (const f of existsSync(at('assets/readme')) ? readdirSync(at('assets/readme')) : [])
  if (f.endsWith('.svg') && !listed.has(`assets/readme/${f}`)) errors.push(`assets/readme/${f}: not in the image manifest`);
for (const e of errors) console.error(`check-docs: ${e}`);
if (errors.length) process.exit(1);
console.log(`check-docs: ok (README, ${IMAGES.length} images, 4 workflows, check.sh, icon)`);
````
