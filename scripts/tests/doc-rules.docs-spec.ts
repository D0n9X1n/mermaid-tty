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
