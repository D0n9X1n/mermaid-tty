import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gallery } from '../../scripts/render-gallery.ts'
import { TIER1, supportTable } from '../../core/registry.ts'
import { explain } from '../../core/render.ts'
import { requirePass } from '../../scripts/check-review-hashes.ts'
test('VR.gallery: every Tier 1 ok fixture at 80 and 60, a CJK sheet per type, the palette sheet; every glyph at col × cell', () => {
  const out = mkdtempSync(join(tmpdir(), 'mtty-galc-'))
  try {
    assert.deepEqual(gallery(out).problems, [])
    const files = new Set(readdirSync(out))
    for (const t of TIER1) {
      for (const f of readdirSync(`fixtures/${t}`)
        .sort()
        .filter((f) => f.includes('-ok-'))) {
        for (const w of [80, 60]) {
          assert.ok(files.has(f.replace('.mmd', `@${w}.svg`)), `${f}@${w}`)
        }
      }
    }

    for (const t of TIER1) {
      assert.ok(files.has(`cjk-${t}.svg`), `cjk-${t}`)
    }

    assert.ok(files.has('palettes.svg'))
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
})
test('VR.tangled: check-tangle passes over every Tier 1 type and reports each', () => {
  const r = spawnSync(process.execPath, ['scripts/check-tangle.ts'], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  for (const t of TIER1) {
    assert.match(r.stdout, new RegExp(`^${t}: \\d+ ok$`, 'm'), t)
  }
})
test('VR.reviewers: each Tier 1 type has its own review scope over its goldens and the themes', () => {
  const req = JSON.parse(readFileSync('ci/reviews/required.json', 'utf8'))
  for (const t of TIER1) {
    assert.deepEqual(req[`vr-C-${t}`], [`goldens/${t}/**`, 'core/themes.ts'], t)
  }
})
// The README's Supported diagrams table is the registry's, so a new or renamed type can't leave it stale.
test("B1: the README's Supported diagrams table is exactly supportTable()", () =>
  assert.equal(
    readFileSync('README.md', 'utf8')
      .split('## Supported diagrams')[1]!
      .split('\n## ')[0]!
      .split('\n')
      .filter((l) => l.startsWith('| '))
      .join('\n'),
    supportTable()
      .split('\n')
      .filter((l) => !l.startsWith('|---'))
      .join('\n'),
  ))
test('VR.passes: with no records, the release gate reports every Tier 1 review scope', () => {
  const req = JSON.parse(readFileSync('ci/reviews/required.json', 'utf8'))
  for (const t of TIER1) {
    assert.ok(
      requirePass([], req).some((p) => p.startsWith(`vr-C-${t}: `)),
      t,
    )
  }
})
test('A4: no Tier 1 module is a stub: each ok-01 fixture renders', () => {
  for (const t of TIER1) {
    assert.ok(!('reason' in explain(readFileSync(`fixtures/${t}/${t}-ok-01.mmd`, 'utf8'), { columns: 120 })), t)
  }
})

// the stub module is gone, and no source names it.
test('A4: core/diagrams/stub.ts is deleted and no .ts file imports it', () => {
  assert.ok(!existsSync('core/diagrams/stub.ts'))
  // The repo's own files: a node_modules, or a local worktree under .claude/, is not the repo. No git call, so the test
  // runs in A8's fresh copy, which is not a repository.
  const ts = readdirSync('.', { recursive: true, withFileTypes: true })
    .filter(
      (e) => e.isFile() && e.name.endsWith('.ts') && !/(^|[\\/])(node_modules|\.claude)([\\/]|$)/.test(e.parentPath),
    )
    .map((e) => join(e.parentPath, e.name))
  assert.deepEqual(
    ts.filter((f) => /from '[^']*diagrams\/stub(\.ts)?'/.test(readFileSync(f, 'utf8'))),
    [],
  )
})
