import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { width } from '../../core/width.ts';
import { toSvg } from '../lib/svg.ts';
import { IMAGES, THEMES } from '../lib/images.ts';
import { ROOT, renderImage, styledRows } from '../lib/render-image.ts';
const HEX = /^#[0-9a-f]{6}$/i;
test('every span resolves to hex colors under every theme', () => {
  for (const theme of THEMES) { for (const row of styledRows('flowchart TD\n  A[a] --> B[b]', 60, theme)!) { for (const s of row) {
    assert.match(s.fg, HEX, `${theme} fg`);
    if (s.bg) { assert.match(s.bg, HEX, `${theme} bg`); }
  } } }
});
test('every README image renders through core without falling back', () => {
  for (const img of IMAGES) { assert.ok(renderImage(img).svg.startsWith('<svg '), img.file); }
});
test('--readme writes exactly the ten manifest images from core, independent of cwd', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'mtty-readme-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const p of ['package.json', 'core', 'hooks', 'scripts/render-svg.ts', 'scripts/lib', 'assets/readme/src'])
    { cpSync(join(ROOT, p), join(root, p), { recursive: true }); }
  const r = spawnSync(process.execPath, [join(root, 'scripts/render-svg.ts'), '--readme'], { cwd: tmpdir(), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '');
  assert.equal(r.stdout, 'render-svg: wrote 17 images\n');
  assert.deepEqual(readdirSync(join(root, 'assets/readme')).filter((f) => f.endsWith('.svg')).sort(),
    IMAGES.map((img) => img.file.split('/').at(-1)).sort());
  for (const img of IMAGES) { assert.equal(readFileSync(join(root, img.file), 'utf8'), renderImage(img).svg, img.file); }
});
test('--stdout without a source prints usage and exits 2', () => {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/render-svg.ts'), '--stdout'], { encoding: 'utf8' });
  assert.equal(r.status, 2, r.stderr);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, 'usage: node scripts/render-svg.ts --stdout FILE [COLUMNS] [THEME]\n');
});
test('--stdout exits 3 with no SVG when core falls back', () => {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/render-svg.ts'), '--stdout', join(ROOT, 'assets/readme/src/hero.mmd'), '1'], { encoding: 'utf8' });
  assert.equal(r.status, 3, r.stderr);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /render-svg: core fell back for .*hero\.mmd at 1 columns/);
});
test('--stdout prints adapter SVG with default or explicit width and theme', () => {
  const file = join(ROOT, 'assets/readme/src/theme.mmd')
const  source = readFileSync(file, 'utf8');
  for (const args of [[], ['60'], ['60', 'dracula']]) {
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts/render-svg.ts'), '--stdout', file, ...args], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, '');
    assert.equal(r.stdout, toSvg(styledRows(source, Number(args[0] ?? '80'), args[1] ?? 'default')!, width, basename(file)));
  }
});
test('a picture reply draws its prose and puts the fence\'s PNG where the text drawing would be', () => {
  const img = IMAGES.find((i) => i.picture)!;
  assert.ok(img, 'the manifest has a picture image');
  const { svg, rows } = renderImage(img)
const  png = readFileSync(join(ROOT, img.picture!)).toString('base64');
  assert.equal((svg.match(/<image /g) ?? []).length, 1);
  assert.ok(svg.includes(`href="data:image/png;base64,${png}"`));
  assert.ok(!rows.flat().some((s) => /[─-╿]/.test(s.text)), 'no box-drawing glyphs: the fence is a picture');
});
