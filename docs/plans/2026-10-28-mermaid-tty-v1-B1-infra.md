# mermaid-tty v1 B1: independent infrastructure (T1, T3–T6)

Part of [plan B](2026-10-28-mermaid-tty-v1-B-docs-release.md), which holds the design check, component map, traceability, runbook and reconciliation. Each task adds its failing check, then the code under it, then runs its done-when command. The code ran on 2026-10-28 in a scratch tree against stub `core/` modules. A **Waits on A** interface is an assumption (D3): confirm it against plan A. Commits: one per task on `feat/v1`, each ending with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

**Needs:** nothing from B2 or B3; npm and network for T1's one install. **Unblocks:** B2's T8 and T17 (T3, T6); B3's T7 (T6), T11 (T6), T13 (T5) and T18 (T1, T6). T2 and T7 sit in B3 to keep this file under 500 lines.

### T1 — GFM parser (D15c)
- **Files:** create `scripts/docs/package.json` (C0), `scripts/docs/package-lock.json` (generated), `scripts/docs/markdown.ts` (C1), `scripts/tests/markdown.docs-spec.ts` (C2) and `scripts/tests/no-install_test.ts` (C14); add `scripts/docs/node_modules/` to `.gitignore`. Tests that need `scripts/docs` are named `*.docs-spec.ts`, which Node's default `--test` discovery never matches (D17). **Acceptance:** B1, B2, A8 no-install. **Depends on:** none. **Group:** G1.
- **Failing check:** add C2 and C14; `node --test scripts/tests/markdown.docs-spec.ts scripts/tests/no-install_test.ts` → FAIL `ERR_MODULE_NOT_FOUND … scripts/docs/markdown.ts`.
- **Implement:** C0; `npm install --prefix scripts/docs --before=2026-10-14` writes the lockfile, so every package, transitive ones included, was released at least 2 weeks before 2026-10-28 (`mdast-util-from-markdown` 2.1.0 on 2026-10-03, `mdast-util-gfm` 3.1.0 on 2025-02-10, `micromark-extension-gfm` 3.0.0 on 2023-06-26); then C1. **Done when:** `rm -rf scripts/docs/node_modules && npm ci --prefix scripts/docs` succeeds; the same command → `ℹ pass 5`, `ℹ fail 0`, so bare `node --test` in a fresh copy discovers no `.docs-spec.ts` (C14); `git check-ignore scripts/docs/node_modules` prints the path. **Commit:** `B: pinned CommonMark+GFM parser for the docs checks`
````json C0 — scripts/docs/package.json
{
  "name": "mermaid-tty-docs-tooling",
  "private": true,
  "description": "Pinned parser for the docs checks (D15c); not part of the plugin. The root package.json keeps no dependencies.",
  "type": "module",
  "dependencies": {
    "mdast-util-from-markdown": "2.1.0",
    "mdast-util-gfm": "3.1.0",
    "micromark-extension-gfm": "3.0.0"
  }
}
````
````ts C1 — scripts/docs/markdown.ts
// Markdown as GitHub renders it (D15c): a spec-compliant CommonMark + GFM tree, so every docs rule reads what the renderer reads.
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';
type Point = { line: number; offset: number };
export type Node = { type: string; value?: string; url?: string; alt?: string; depth?: number; children?: Node[]; parent?: Node; position?: { start: Point; end: Point } };
export function parse(md: string): Node {
  const tree = fromMarkdown(md, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] }) as unknown as Node;
  const link = (n: Node): void => n.children?.forEach((c) => { c.parent = n; link(c); });
  link(tree);
  return tree;
}
export const all = (n: Node, type: string): Node[] => [...(n.type === type ? [n] : []), ...(n.children ?? []).flatMap((c) => all(c, type))];
export const within = (n: Node, type: string): boolean => !!n.parent && (n.parent.type === type || within(n.parent, type));
// Visible text: code, inline code and raw HTML count as a space.
export const text = (n: Node): string => (['code', 'inlineCode', 'html'].includes(n.type) ? ' ' : n.value ?? (n.children ?? []).map(text).join(''));
export const headings = (md: string) => all(parse(md), 'heading').map((h) => ({ depth: h.depth!, text: text(h), line: h.position!.start.line }));
export const links = (md: string) => all(parse(md), 'link').map((l) => ({ line: l.position!.start.line, label: text(l), target: l.url! }));
// The raw text of a level-2 section, from the line after its heading to the next h1 or h2.
export function section(md: string, title: string): string | null {
  const hs = all(parse(md), 'heading').filter((h) => h.depth! <= 2), i = hs.findIndex((h) => h.depth === 2 && text(h) === title);
  if (i < 0) return null;
  const nl = md.indexOf('\n', hs[i]!.position!.start.offset);
  return md.slice(nl < 0 ? md.length : nl + 1, hs[i + 1]?.position!.start.offset ?? md.length);
}
const R = [[0x3040, 0x30ff], [0x3400, 0x4dbf], [0x4e00, 0x9fff], [0xac00, 0xd7af], [0xf900, 0xfaff]];
export const CJK = new RegExp(`[${R.map(([a, b]) => `${String.fromCharCode(a!)}-${String.fromCharCode(b!)}`).join('')}]`);
````
````ts C2 — scripts/tests/markdown.docs-spec.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { CJK, all, headings, links, parse, section, text } from '../docs/markdown.ts';
const md = '# T\n\n[中文](Home-zh-CN)\n\n```sh\n# not a heading [x](Fake)\n```\n\n## A\n`[c](Code)` and [Usage](Usage) ![i](a.svg)\n\n### A1\n\n## B\n';
test('the GFM tree: fenced and inline code hold no headings, links or images', () => {
  assert.deepEqual(headings(md).map((h) => h.depth), [1, 2, 3, 2]);
  assert.deepEqual(links(md).map((l) => l.target), ['Home-zh-CN', 'Usage']);
  assert.deepEqual(all(parse(md), 'image').map((i) => i.url), ['a.svg']);
});
test('what the old scanner got wrong: an invalid fence opener, a double-backtick span, HTML continuation', () => {
  assert.equal(all(parse('``` `\n\n![x](a.svg)'), 'image').length, 1);
  assert.equal(all(parse('``![x](a.svg)``'), 'image').length, 0);
  assert.equal(all(parse('<p align="center"></p>\n![x](a.svg)'), 'image').length, 0);
});
test('section runs to the next h1/h2; text drops code; CJK', () => {
  assert.equal(section(md, 'A'), '`[c](Code)` and [Usage](Usage) ![i](a.svg)\n\n### A1\n\n');
  assert.equal(section(md, 'Missing'), null);
  assert.equal(text(parse('`x` [甲](Y) z')).trim(), '甲 z');
  assert.ok(CJK.test('中') && CJK.test('한') && !CJK.test('─►é'));
});
````
````ts C14 — scripts/tests/no-install_test.ts
// A8 no-install: bare `node --test` in a fresh clone, with nothing installed, must discover no test that needs the docs parser.
// Those tests are named *.docs-spec.ts, outside Node's default patterns; check.sh runs them after `npm ci --prefix scripts/docs`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(new URL('.', import.meta.url)), docs = resolve(here, '../docs') + sep;
const reaches = (f: string, seen = new Set<string>()): boolean => !seen.has(f) && !!seen.add(f) &&
  [...readFileSync(f, 'utf8').matchAll(/from '(\.[^']+)'/g)].map((m) => resolve(dirname(f), m[1]!)).some((p) => p.startsWith(docs) || reaches(p, seen));
const files = readdirSync(here), specs = files.filter((f) => f.endsWith('.docs-spec.ts'));
test('no-install: every test that reaches scripts/docs is a .docs-spec.ts, and no *_test.ts does', () => {
  assert.deepEqual(files.filter((f) => f.endsWith('_test.ts') && reaches(join(here, f))), []);
  assert.ok(specs.length > 0 && specs.every((f) => reaches(join(here, f))), specs.join());
});
// A child of a test run inherits NODE_TEST_CONTEXT and reports to its parent instead of running; drop it, as in a fresh shell.
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'NODE_TEST_CONTEXT'));
test('no-install: bare node --test in a fresh copy with nothing installed discovers no .docs-spec.ts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mtty-fresh-')), run = () => spawnSync(process.execPath, ['--test'], { cwd: dir, encoding: 'utf8', env });
  try {
    writeFileSync(join(dir, 'probe_test.ts'), "import test from 'node:test';\ntest('probe', () => {});\n");
    for (const f of specs) copyFileSync(join(here, f), join(dir, f));
    const clean = run();
    assert.equal(clean.status, 0, clean.stdout + clean.stderr);
    assert.match(clean.stdout, /probe/);
    renameSync(join(dir, specs[0]!), join(dir, 'renamed_test.ts')); // the mutation: a default name is discovered, and it fails
    assert.notEqual(run().status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
````

### T3 — Acceptance rules
- **Files:** create `scripts/lib/workflow.ts` (C13), `scripts/lib/doc-rules.ts` (C5) and `scripts/tests/doc-rules.docs-spec.ts` (C6). **Acceptance:** B1, B3, B6, and the workflow helpers B2 reuses (C13 holds no Markdown, so the release and version jobs need no docs tooling). **Depends on:** T1. **Group:** G2.
- **Failing check:** add C6; `node --test scripts/tests/doc-rules.docs-spec.ts` → FAIL `ERR_MODULE_NOT_FOUND … scripts/lib/doc-rules.ts`.
- **Implement:** C13, C5. **Done when:** → `ℹ pass 35`, `ℹ fail 0`; each D15c repro (an invalid fence opener, an image in a double-backtick code span, an image in an extra table cell, an image on the line after the hero) and D15d's 1,001-backtick code span are failing fixtures. **Commit:** `B: acceptance rules on the GFM tree for README, publish-wiki and icon`
````ts C13 — scripts/lib/workflow.ts
// Workflow YAML helpers shared by doc-rules.ts, ci-rules.ts and cc-versions.ts; no Markdown, so the release and version jobs need no docs tooling (D15c).
export const INSTALL = ['claude plugin marketplace add D0n9X1n/mermaid-tty', 'claude plugin install mermaid-tty@mermaid-tty'];
const PIN = /^\s*(-\s+)?uses:\s*[\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d/;
const steps = (yml: string) => yml.split(/\n(?=\s+- )/);
const first = (s: string) => s.trim().split('\n')[0];
export const common = (name: string, yml: string) => [
  ...yml.split('\n').filter((l) => /^\s*(-\s+)?uses:/.test(l) && !PIN.test(l)).map((l) => `${name}: action not pinned by full SHA with a # version comment: ${l.trim()}`),
  ...steps(yml).filter((s) => /\brun:[\s\S]*\.sh\b/.test(s) && !/\bshell: bash\b/.test(s)).map((s) => `${name}: step runs a .sh script without shell: bash: ${first(s)}`),
  ...steps(yml).filter((s) => /\brun:[\s\S]*(scripts\/|gh release|claude plugin)/.test(s) && !/\bid: [\w-]+/.test(s)).map((s) => `${name}: check step has no stable id: ${first(s)}`)];
export const need = (name: string, yml: string, rules: [string, string | RegExp][]) => rules
  .filter(([, r]) => (typeof r === 'string' ? !yml.includes(r) : !r.test(yml))).map(([what]) => `${name}: missing ${what}`);
````
````ts C5 — scripts/lib/doc-rules.ts
// Pure acceptance rules on the GFM tree (D15c): B1 README, B3 publish-wiki.yml, B6 icon. The workflow helpers live in ci-rules.ts.
import { type Node, all, parse, section, text, within } from '../docs/markdown.ts';
import { INSTALL, common, need } from './workflow.ts';
export { INSTALL };
export const TAGLINE = 'Yet, just another Mermaid renderer for your terminal';
export const LOCAL = ['bash scripts/check.sh', 'npm ci --prefix scripts/e2e', 'node scripts/e2e/run.ts', 'node scripts/render-gallery.ts', 'node scripts/check-ci-coverage.ts'];
export const CTRL_O = /ctrl\+o (shows|reveals|displays)/i;
const REPO = 'https://github.com/D0n9X1n/mermaid-tty', SHIELDS = 'img\\.shields\\.io\\/github';
const BADGES: [string, RegExp][] = [['CI', /\[!\[CI\]\([^)]*\/actions\/workflows\/ci\.yml\/badge\.svg\)\]/],
  ['release', new RegExp(`\\[!\\[Release\\]\\([^)]*${SHIELDS}\\/v\\/release\\/D0n9X1n\\/mermaid-tty[^)]*\\)\\]`)],
  ['license', /\[!\[License[^\]]*\]\([^)]*license[^)]*\)\]/i],
  ['stars', new RegExp(`\\[!\\[Stars\\]\\([^)]*${SHIELDS}\\/stars\\/D0n9X1n\\/mermaid-tty[^)]*\\)\\]`)]];
const SECTIONS = ['Install', 'Before and after', 'Supported diagrams', 'Themes', 'Configuration', 'FAQ', 'Development'];
const FAQ = [/falls? ?back/i, /width|columns/i, /CJK/, /Windows Terminal/, /macOS Terminal/, /iTerm2/, /Ghostty/, /Linux/, /256-colou?r/, /fonts?\b/i, /\/mermaid-tty source/, /\/mermaid-tty diagram/, /\/copy\b/];
export const supportedTypes = (md: string) => [...(section(md, 'Supported diagrams') ?? '').matchAll(/^\| `([\w-]+)` \|/gm)].map((m) => m[1]!);
// B1 images: only what renders counts; each displayed assets/ image is a rendered diagram or on this short non-diagram list.
export const NON_DIAGRAM = ['assets/icon.svg'];
export const assetImages = (md: string) => all(parse(md), 'image').map((i) => i.url!.replace(/^.*?(?=assets\/)/, '')).filter((p) => p.startsWith('assets/'));
export const imageErrors = (where: string, md: string, diagrams: string[]) => assetImages(md)
  .filter((p) => !diagrams.includes(p) && !NON_DIAGRAM.includes(p)).map((p) => `${where}: displays ${p}, which is neither a rendered diagram nor allow-listed`);
// D15b, read from the GFM tree (D15c): every accepted image is displayed and every link target is known.
// README: one HTML node, the hero, before the first ##; images are inline or badges; links go to its two wiki URLs, LICENSE or allowlisted https hosts.
// Wiki: no HTML and no images; links go to page names or allowlisted https hosts. Autolinks, reference forms, footnotes, extra table cells and [[wiki links]] fail.
export const HERO = /^<p align="center"><img src="assets\/icon\.svg" alt="[^"<>]*" width="\d+"><\/p>$/;
const SRC = /^assets\/[a-z0-9/_-]+\.svg$/, PAGE = /^[A-Za-z0-9-]+$/;
const REFS = ['linkReference', 'imageReference', 'definition', 'footnoteReference', 'footnoteDefinition'];
const BADGE_HOSTS = ['https://img.shields.io/', 'https://github.com/D0n9X1n/mermaid-tty/actions/'], LINK_HOSTS = ['github.com', 'mermaid.js.org', 'docs.anthropic.com'];
function linkOk(t: string, readme: boolean): boolean {
  if (readme ? [`${REPO}/wiki`, `${REPO}/wiki/Home-zh-CN`, 'LICENSE'].includes(t) : PAGE.test(t)) return true;
  const host = /^https:\/\/([^/]+)/.exec(t)?.[1];
  return !!host && LINK_HOSTS.includes(host) && !/[%&\\]|\/\/|\/wiki/i.test(t.slice(8));
}
const firstH2 = (tree: Node, md: string) => all(tree, 'heading').find((h) => h.depth === 2)?.position!.start.offset ?? md.length;
export function grammarErrors(where: string, md: string, readme: boolean): string[] {
  const e: string[] = [], tree = parse(md), h2 = firstH2(tree, md), at = (n: Node, what: string) => e.push(`${where}:${n.position!.start.line}: ${what} (D15b)`);
  all(tree, 'html').forEach((n, i) => {
    if (!readme) at(n, 'raw HTML; the wiki allows none');
    else if (i > 0 || !HERO.test(n.value!) || n.position!.start.offset > h2) at(n, 'raw HTML other than the one hero line');
  });
  for (const n of all(tree, 'image')) {
    const badge = n.parent!.type === 'link' && n.parent!.children!.length === 1;
    if (!readme) at(n, 'image in a wiki page; draw it with a mermaid fence');
    else if (badge && !BADGE_HOSTS.some((h) => n.url!.startsWith(h))) at(n, `badge image host not allowed: ${n.url}`);
    else if (!badge && !SRC.test(n.url!)) at(n, `image src must match ^assets/[a-z0-9/_-]+.svg$: ${n.url}`);
    if (within(n, 'listItem')) at(n, 'image in a list item');
  }
  for (const n of all(tree, 'link')) {
    if (md[n.position!.start.offset] !== '[') at(n, `autolink or bare URL; write [label](url): ${n.url}`);
    else if (!linkOk(n.url!, readme)) at(n, n.url!.endsWith('.md') ? `link must omit .md: ${n.url}` : `link target not allowed: ${n.url}`);
  }
  for (const n of REFS.flatMap((t) => all(tree, t))) at(n, 'reference-style link, image, definition or footnote');
  for (const t of all(tree, 'table')) for (const r of t.children!.slice(1))
    if (r.children!.length > t.children![0]!.children!.length) at(r, 'table row has more cells than its header; GitHub drops them');
  for (const n of all(tree, 'text')) if (n.value!.includes('[[')) at(n, '[[wiki link]]; link by page name: [Label](Page)');
  // Defense in depth (D15d): cmark-gfm ends code spans at 1,000 backticks and micromark does not, so long runs fail on the raw text.
  md.split('\n').forEach((l, i) => {
    const w = `${where}:${i + 1}`, fence = /^ {0,3}(`{3,})[^`]*$/.exec(l);
    if (fence && fence[1]!.length > 5) e.push(`${w}: fence longer than 5 backticks (D15d)`);
    else if (!fence && /`{4,}/.test(l)) e.push(`${w}: backtick run longer than 3 outside a fence delimiter (D15d)`);
  });
  return e;
}
export function readmeErrors(md: string, generated: string[]): string[] {
  const e: string[] = [], tree = parse(md), h2 = firstH2(tree, md), faq = section(md, 'FAQ') ?? '', dev = section(md, 'Development') ?? '';
  const top = tree.children!.filter((n) => n.position!.start.offset < h2);
  if (!all(tree, 'html').some((n) => HERO.test(n.value!) && n.position!.start.offset < h2)) e.push('hero: logo <img src="assets/icon.svg"> missing');
  if (!top.map(text).join('\n').includes(TAGLINE)) e.push('hero: tagline missing');
  const badges = top.flatMap((n) => all(n, 'link')).filter((l) => l.children!.length === 1 && l.children![0]!.type === 'image')
    .map((l) => `[![${l.children![0]!.alt}](${l.children![0]!.url})](${l.url})`).join('\n');
  for (const [name, re] of BADGES) if (!re.test(badges)) e.push(`hero: ${name} badge missing`);
  if (!all(tree, 'code').some((c) => c.value === INSTALL.join('\n'))) e.push('install: no code block holding exactly the two install commands');
  for (const s of SECTIONS) if (section(md, s) === null) e.push(`section missing: ## ${s}`);
  for (const re of FAQ) if (!re.test(faq)) e.push(`FAQ: no answer matching /${re.source}/`);
  const wiki = all(tree, 'link').map((l) => `${text(l)} ${l.url}`);
  if (!wiki.includes(`English ${REPO}/wiki`)) e.push('wiki link missing: English');
  if (!wiki.includes(`简体中文 ${REPO}/wiki/Home-zh-CN`)) e.push('wiki link missing: 简体中文');
  const shown = assetImages(md);
  for (const f of generated) if (!shown.includes(f)) e.push(`image not shown in README: ${f}`);
  e.push(...imageErrors('README', md, generated));
  for (const c of LOCAL) if (!dev.includes(c)) e.push(`Development: does not show ${c}`);
  const drawn = /[\u2500-\u25ff]/.exec(md);
  if (drawn) e.push(`README: hand-drawn diagram glyph ${drawn[0]}; show render-svg output instead`);
  if (CTRL_O.test(md)) e.push('README: claims ctrl+o shows the source; document /mermaid-tty source instead');
  if (!supportedTypes(md).length) e.push('Supported diagrams: the table is empty');
  e.push(...grammarErrors('README', md, true));
  return e;
}
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
````ts C6 — scripts/tests/doc-rules.docs-spec.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { INSTALL, LOCAL, TAGLINE, iconErrors, imageErrors, publishWikiErrors, readmeErrors, grammarErrors, supportedTypes } from '../lib/doc-rules.ts';
const R = 'https://github.com/D0n9X1n/mermaid-tty', S = 'https://img.shields.io/github', SHA = 'a'.repeat(40), IMG = ['assets/readme/after.svg'];
const README = `<p align="center"><img src="assets/icon.svg" alt="logo" width="120"></p>\n\n**${TAGLINE}**\n\n` +
  `[![CI](${R}/actions/workflows/ci.yml/badge.svg)](${R}/actions/workflows/ci.yml) [![Release](${S}/v/release/D0n9X1n/mermaid-tty)](${R}/releases) ` +
  `[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![Stars](${S}/stars/D0n9X1n/mermaid-tty)](${R}/stargazers)\n\n` +
  `## Install\n\n\`\`\`sh\n${INSTALL.join('\n')}\n\`\`\`\n\n## Before and after\n\n![after](${IMG[0]})\n\n## Supported diagrams\n\n` +
  '| Type | Header keywords |\n|---|---|\n| `flowchart` | `flowchart`, `graph` |\n\n## Themes\n\n## Configuration\n\n' +
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
const LONG = '`'.repeat(1001); // past cmark-gfm's 1,000-backtick code-span limit (D15d)
const cases: [(s: string) => string[], string, string, string, string][] = [
  [rm, README, TAGLINE, 'A renderer', 'tagline'], [rm, README, '[![Stars]', '[![Fans]', 'stars badge'],
  [rm, README, INSTALL[1]!, 'claude plugin install mermaid-tty', 'install'], [rm, README, '## FAQ', '## Questions', '## FAQ'],
  [rm, README, 'CJK labels', 'Wide labels', 'CJK'], [rm, README, 'Ghostty', 'Kitty', 'Ghostty'], [rm, README, '256-color', 'basic', '256'],
  [rm, README, '[简体中文]', '[Chinese]', '简体中文'], [rm, README, IMG[0]!, 'assets/rogue.svg', 'displays assets/rogue.svg, which is neither'],
  [rm, README, '![after](assets/readme/after.svg)', '<!-- ![after](assets/readme/after.svg) -->', 'not shown in README'],
  [rm, README, '![after](', '\\![after](', 'not shown in README'], [rm, README, '![after](assets/readme/after.svg)', '\n    ![after](assets/readme/after.svg)', 'not shown in README'],
  [rm, README, '![after](assets/readme/after.svg)', "<img src='assets/rogue.svg'>", 'raw HTML'], [rm, README, '![after](assets/readme/after.svg)', '![x][ref]\n\n[ref]: assets/rogue.svg', 'reference-style'],
  [rm, README, '![after](assets/readme/after.svg)', '``![after](assets/readme/after.svg)``', 'not shown in README'],
  [rm, README, '![after](assets/readme/after.svg)', '- item\n\n      ![after](assets/readme/after.svg)', 'not shown in README'],
  [rm, README, '## Before and after\n\n', '## Before and after\n\n``` `\n\n![x](assets/rogue.svg)\n\n', 'displays assets/rogue.svg'],
  [rm, README, '| `flowchart` | `flowchart`, `graph` |', '| `flowchart` | `flowchart`, `graph` | ![x](assets/rogue.svg) |', 'more cells than its header'],
  [rm, README.replace('![after](assets/readme/after.svg)', ''), '</p>\n\n', '</p>\n![after](assets/readme/after.svg)\n\n', 'not shown in README'],
  [rm, README, '![after](assets/readme/after.svg)', LONG + '![after](assets/readme/after.svg)' + LONG, 'backtick run longer than 3'],
  [rm, README, '| `flowchart` |', '| flowchart |', 'table'], [rm, README, 'node scripts/e2e/run.ts', 'npm test', 'e2e/run.ts'],
  [rm, README, '## Themes', '──► A\n\n## Themes', 'hand-drawn'],
  [rm, README, '; `/copy` copies', '; it copies', '/copy'], [rm, README, '## Themes', 'ctrl+o shows the source.\n\n## Themes', 'ctrl+o'],
  [publishWikiErrors, WIKI, '  workflow_dispatch:\n', '', 'workflow_dispatch'], [publishWikiErrors, WIKI, 'contents: write', 'contents: read', 'job-scoped'],
  [publishWikiErrors, WIKI, 'ubuntu-latest', 'windows-latest', 'ubuntu'], [publishWikiErrors, WIKI, `@${SHA} # v7.0.1`, '@v7', 'pinned'],
  [publishWikiErrors, WIKI, '        shell: bash\n        run: scripts', '        run: scripts', 'without shell: bash'], [publishWikiErrors, WIKI, '[main]\n', '[main]\n    paths: [wiki/**]\n', 'paths'],
];
for (const [rule, base, from, to, want] of cases)
  test(`rejects: ${want}`, () => assert.ok(rule(base.replace(from, to)).some((e) => e.includes(want)), `${from} -> ${to}`));
test('D15b on the GFM tree (D15c): only the hero is HTML, every accepted image is displayed, every link target is known', () => {
  const H = '<p align="center"><img src="assets/icon.svg" alt="logo" width="120"></p>', G = (md: string, readme = true) => grammarErrors('x.md', md, readme);
  const F = (rest: string) => '``` `\n' + rest; // an invalid fence opener: a backtick info string is not a fence
  assert.deepEqual(G(H + '\n\n[![b](https://img.shields.io/b)](https://github.com/D0n9X1n/mermaid-tty/releases) [w](https://github.com/D0n9X1n/mermaid-tty/wiki) [l](LICENSE)\n\n' +
    '| ![d](assets/readme/a.svg) |\n|---|\n\nx `<b>` y ``![c](x)`` ![u][none]\n\n```sh\n<b> [[x]]\n```\n\n    <i>\n\n````md\n```sh\nx\n```\n````\n'), []);
  assert.deepEqual(G('[Usage](Usage) [m](https://mermaid.js.org/syntax/flowchart.html)\n\n- a\n\n  b', false), []);
  for (const [md, want, readme] of [
    // cycle 1: HTML anchors, scheme and entity tricks, protocol-relative and .md links
    ['<a href="//github.com/D0n9X1n/mermaid-tty/wiki/Usage-zh-CN">x</a>', 'raw HTML', false], ['[x](http://github.com/D0n9X1n/mermaid-tty/wiki/Usage-zh-CN)', 'link target not allowed', false],
    ['[x](https://github&#46;com/D0n9X1n/mermaid-tty/wiki/Usage-zh-CN)', 'link target not allowed', false], ['[x](//github.com/a)', 'link target not allowed', false],
    ['<a data-href="Home" href="Usage-zh-CN">x</a>', 'raw HTML', false], ['[x](Home.md)', 'omit .md', false],
    // cycle 2: HTML image forms, list items, image and badge hosts, encoded paths
    ['<source srcset="assets/readme/after.svg">', 'raw HTML other than', true], ['<img data-src="x" src="assets/icon.svg">', 'raw HTML other than', true],
    ['<picture><source srcset="x assets/rogue.svg 2x"></picture>', 'raw HTML other than', true], ['<img src="assets/icon.svg" srcset="assets/rogue.svg 2x">', 'raw HTML other than', true],
    ['[<img src="assets/rogue.svg">](Home)', 'raw HTML', false], ['- ![x](assets/readme/after.svg)', 'image in a list item', true], ['![x](assets/readme/after.svg)', 'image in a wiki page', false],
    ['![x](https://example.com/a.svg)', 'src must match', true], ['[![b](https://evil.dev/b.svg)](https://github.com/D0n9X1n/mermaid-tty)', 'badge image host', true],
    ['[x](https://github.com/D0n9X1n/mermaid-tty/blob/a%2Fb)', 'link target not allowed', true],
    // cycle 3: a second or late HTML block, comments, bare URLs and autolinks, reference forms, footnotes, escapes, [[wiki links]]
    [H + '\n\n' + H, 'raw HTML other than', true], ['## h\n\n' + H, 'raw HTML other than', true], ['<!-- c -->', 'raw HTML other than', true],
    ['see https://x.dev', 'autolink or bare URL', false], ['<https://github.com/D0n9X1n>', 'autolink or bare URL', true],
    ['![a][r]\n\n[r]: assets/rogue.svg', 'reference-style', true], ['[r]: x', 'reference-style', false], ['a[^1]\n\n[^1]: b', 'footnote', true],
    ['\\![a](assets/readme/after.svg)', 'link target not allowed', true], ['[[Page]]', '[[wiki link]]', false],
    // D15c: where the old scanner and GitHub disagreed
    [F('![x](https://evil.dev/a.svg)'), 'src must match', true], [F('[y](https://evil.dev)'), 'link target not allowed', true],
    ['| a |\n|---|\n| b | ![x](assets/rogue.svg) |', 'more cells than its header', true], [H + '\n![x](assets/readme/after.svg)', 'raw HTML other than', true],
    // D15d: past cmark-gfm's 1,000-backtick code-span limit, and over-long fences
    [LONG + '[c](Usage-zh-CN)' + LONG, 'backtick run longer than 3', false], ['``````sh\nx\n``````', 'fence longer than 5', true]] as const)
    assert.ok(G(md, readme).some((e) => e.includes(want)), want);
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
- **Implement:** C8. **Done when:** → `wiki publish test: ok` (a valid fixture wiki passes; 24 mutations fail with their diagnostics, D15c's invalid fence opener and D15d's 1,001-backtick code span included; the fixture runs the real checker as `node scripts/check-wiki.ts DIR`), and `node scripts/check-wiki.ts` in the repo lists `wiki/: directory missing` and the 10 required pages until T13–T14. **Commit:** `B: wiki checker with pair, opener and per-unit language rules`
````ts C8 — scripts/check-wiki.ts
// B2 wiki rules on the GFM tree (D15c), ported from SonicTerm scripts/check-wiki.py (pairs, nesting, heading parity, links) plus
// B2's exact openers, page-name links only, per-unit language rules with no exemption, and the wiki grammar (D15b). Exit 1 lists every failure.
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CTRL_O, LOCAL, grammarErrors } from './lib/doc-rules.ts';
import { type Node, CJK, all, parse, text } from './docs/markdown.ts';
const ZH = '-zh-CN', REQUIRED = ['Home', 'Usage', 'Configuration-and-Themes', 'Architecture', 'Development-and-Release'];
const dir = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('../wiki/', import.meta.url));
const errors: string[] = [], pages = new Map<string, string>();
const twin = (p: string) => (p.endsWith(ZH) ? p.slice(0, -ZH.length) : p + ZH);
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
const trees = new Map([...pages].map(([p, t]) => [p, parse(t)]));
const src = (md: string, n: Node) => md.slice(n.position!.start.offset, n.position!.end.offset);
const levels = (p: string) => all(trees.get(p)!, 'heading').map((h) => h.depth).join();
for (const [page, md] of pages) {
  const f = `wiki/${page}.md`, zh = page.endsWith(ZH), tree = trees.get(page)!;
  errors.push(...grammarErrors(f, md, false));
  if (!pages.has(twin(page))) { errors.push(`${f}: missing language counterpart ${twin(page)}`); continue; }
  const [h1, second] = tree.children!, opener = h1?.type === 'heading' && h1.depth === 1 ? second : h1;
  const want = zh ? `[英文版](${twin(page)})` : `[Chinese (Simplified)](${twin(page)})`;
  if (opener?.type !== 'paragraph' || src(md, opener) !== want) errors.push(`${f}: must open with exactly ${want}`);
  let crossing = 0, chinese = 0;
  for (const l of all(tree, 'link')) {
    if (!/^[A-Za-z0-9-]+$/.test(l.url!)) continue; // any other target is checked by grammarErrors (D15b)
    if (!pages.has(l.url!)) errors.push(`${f}:${l.position!.start.line}: link target does not exist: ${l.url}`);
    else if (l.url!.endsWith(ZH) !== zh) crossing++;
  }
  if (crossing > 1) errors.push(`${f}: ${crossing} cross-language links; only the opening twin link is allowed`);
  // Language units, outside code: each heading, paragraph (list items hold paragraphs) and table row.
  for (const u of ['heading', 'paragraph', 'tableRow'].flatMap((t) => all(tree, t))) {
    const t = text(u), has = CJK.test(t), at = `${f}:${u.position!.start.line}`, shown = src(md, u).trim().slice(0, 60);
    if (zh && has && u.type === 'paragraph' && u !== opener) chinese++;
    if (zh && !has && /\p{L}/u.test(t)) errors.push(`${at}: untranslated, no CJK: ${shown}`);
    if (!zh && has) errors.push(`${at}: CJK outside code: ${shown}`);
  }
  if (zh && !chinese) errors.push(`${f}: no Chinese prose`);
  if (!zh && levels(page) !== levels(twin(page))) errors.push(`${f}: heading levels [${levels(page)}] differ from ${twin(page)} [${levels(twin(page))}]`);
}
for (const e of errors.sort()) console.error(`check-wiki: ${e}`);
if (errors.length) process.exit(1);
console.log(`check-wiki: ok (${pages.size} pages)`);
````
````bash C7 — scripts/test-wiki-publish.sh from line 57 (T4 appends the first line; T5 the rest)
printf 'wiki publish test: publisher ok\n'

# Checker (B2): the real checker passes a valid fixture wiki and fails each mutation with its diagnostic, in throwaway dirs.
[[ -f "$checker" ]] || fail "checker is missing"
base="$tmp/checker"; mkdir -p "$base/wiki"
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
(cd "$base" && node "$checker" wiki) >/dev/null || fail "checker rejected a valid wiki"
edit() { node -e 'const fs=require("fs"),[f,a,b]=process.argv.slice(1),s=fs.readFileSync(f,"utf8");if(!s.includes(a))process.exit(9);fs.writeFileSync(f,s.replace(a,b))' "$@"; }
rejects() { # rejects NAME EXPECTED MUTATION...
  local name="$1" expected="$2" fixture="$tmp/$1"; shift 2
  cp -R "$base" "$fixture"; (cd "$fixture" && "$@") || fail "mutation $name did not apply"
  if (cd "$fixture" && node "$checker" wiki >output 2>&1); then fail "checker accepted $name"; fi
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
rejects absolute-cross-link 'link target not allowed' edit wiki/Usage.md 'See [Home](Home).' 'See [Home](Home) and [Chinese page](https://github.com/D0n9X1n/mermaid-tty/wiki/Usage-zh-CN).'
rejects autolink 'autolink or bare URL' edit wiki/Usage.md 'See [Home](Home).' 'See [Home](Home) and <https://github.com/D0n9X1n/mermaid-tty/wiki/Usage-zh-CN>.'
rejects wiki-link '[[wiki link]]' edit wiki/Usage.md 'See [Home](Home).' 'See [Home](Home) and [[Usage-zh-CN]].'
rejects badge-cross-link 'cross-language links' edit wiki/Usage.md 'See [Home](Home).' 'See [Home](Home) and [![zh](../assets/icon.svg)](Usage-zh-CN).'
rejects html-anchor 'raw HTML' edit wiki/Usage.md 'See [Home](Home).' 'See [Home](Home) and <a href="Usage-zh-CN">x</a>.'
rejects invalid-fence 'cross-language links' edit wiki/Usage.md 'See [Home](Home).' $'See [Home](Home).\n\n``` `\n\nSee [Chinese](Usage-zh-CN).'
long=$(node -e 'process.stdout.write("`".repeat(1001))') # D15d: past cmark-gfm's 1,000-backtick code-span limit
rejects long-code-span 'backtick run longer than 3' edit wiki/Usage.md 'See [Home](Home).' "See [Home](Home). ${long}[Chinese](Usage-zh-CN)${long}"
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
for (const p of new Set(['assets/icon.svg', ...[md, ...pages.map((p) => read(p))].flatMap((t) => assetImages(t))])) if (!existsSync(at(p))) errors.push(`${p} is displayed but does not exist`);
errors.push(...(existsSync(at('.claude-plugin/icon.png')) ? iconErrors(readFileSync(at('.claude-plugin/icon.png'))) : ['icon.png: missing']));
const listed = new Set(diagrams);
for (const f of existsSync(at('assets/readme')) ? readdirSync(at('assets/readme')) : [])
  if (f.endsWith('.svg') && !listed.has(`assets/readme/${f}`)) errors.push(`assets/readme/${f}: not in the image manifest`);
for (const e of errors) console.error(`check-docs: ${e}`);
if (errors.length) process.exit(1);
console.log(`check-docs: ok (README, ${IMAGES.length} images, 4 workflows, check.sh, icon)`);
````
