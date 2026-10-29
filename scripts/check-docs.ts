// Runs the B1/B3/B4/B6 rules against the real files; exit 1 lists every failure. Same result on Linux, macOS and Windows.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishWikiErrors } from './docs/workflow-tree.ts';
import { assetImages, iconErrors, imageErrors, readmeErrors } from './lib/doc-rules.ts';
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
