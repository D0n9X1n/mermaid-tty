// Pure acceptance rules on the GFM tree (D15c): B1 README and B6 icon. B3's publish-wiki.yml rules run on the parsed YAML tree in docs/workflow-tree.ts.
import { type Node, all, lineOf, parse, section, text, within } from '../docs/markdown.ts';
import { INSTALL } from './workflow.ts';
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
  const e: string[] = [], tree = parse(md), h2 = firstH2(tree, md), at = (n: Node, what: string) => e.push(`${where}:${lineOf(n)}: ${what} (D15b)`);
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
  // A literal autolink the GFM transform makes has no position (see lineOf); it is an autolink all the same.
  for (const n of all(tree, 'link')) {
    if (!n.position || md[n.position.start.offset] !== '[') at(n, `autolink or bare URL; write [label](url): ${n.url}`);
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
// The wiki is the only documentation: a docs/ folder at the repo root would be a second copy that drifts from it.
export const docsFolderErrors = (hasDocs: boolean) => hasDocs ? ['docs/: documentation lives in wiki/; there is no docs/ folder'] : [];
export function iconErrors(png: Uint8Array): string[] {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (png.length < 24 || sig.some((b, i) => png[i] !== b) || String.fromCharCode(...png.subarray(12, 16)) !== 'IHDR') return ['icon.png: not a PNG'];
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength), w = v.getUint32(16), h = v.getUint32(20);
  return [...(w === 512 && h === 512 ? [] : [`icon.png: ${w}×${h}, want 512×512`]), ...(png.length < 2_000_000 ? [] : [`icon.png: ${png.length} bytes, want under 2 MB`])];
}
