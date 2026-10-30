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
test('check-docs skips the cross-check locally without GH_TOKEN and fails without it in CI', async () => {
  const { spawnSync } = await import('node:child_process'), { fileURLToPath } = await import('node:url');
  const { GH_TOKEN: _, GITHUB_ACTIONS: __, ...env } = process.env, script = fileURLToPath(new URL('../check-docs.ts', import.meta.url));
  const run = (extra: Record<string, string>) => spawnSync(process.execPath, [script], { encoding: 'utf8', env: { ...env, ...extra } });
  const local = run({}), ci = run({ GITHUB_ACTIONS: 'true' });
  assert.match(local.stdout, /^check-docs: GitHub render cross-check skipped: no GH_TOKEN \(CI sets it\)$/m);
  assert.doesNotMatch(local.stderr, /GH_TOKEN/);
  assert.equal(ci.status, 1);
  assert.match(ci.stderr, /^check-docs: GitHub render cross-check: GH_TOKEN is not set in CI \(D15d\)$/m);
});
