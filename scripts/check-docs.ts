// Runs the B1/B3/B4/B6 rules against the real files; exit 1 lists every failure. Same result on Linux, macOS and
// Windows.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { width } from '../core/width.ts' // a glyph's width in terminal cells
import { publishWikiErrors } from './docs/workflow-tree.ts'
import { ciErrors, releaseErrors } from './docs/ci-rules.ts' // the CI and release workflow rules
import { checkShErrors } from './lib/ci-rules.ts' // the check.sh rule
import { assetImages, docsFolderErrors, iconErrors, imageErrors, readmeErrors } from './lib/doc-rules.ts'
import { versionsErrors } from './docs/ci-rules.ts' // the Claude Code versions workflow rule
import { IMAGES } from './lib/images.ts'
import { githubHtml, renderErrors } from './lib/github-render.ts' // GitHub's render against the GFM tree
import { renderImage } from './lib/render-image.ts' // a fresh render of a README image
import { misplaced } from './lib/svg.ts' // the glyphs off their cell in an SVG
const root = fileURLToPath(new URL('..', import.meta.url))
const at = (p: string) => join(root, p)
const read = (p: string) => (existsSync(at(p)) ? readFileSync(at(p), 'utf8').replace(/\r\n/g, '\n') : '')
const md = read('README.md')
const diagrams = IMAGES.map((i) => i.file)
const pages = existsSync(at('wiki'))
  ? readdirSync(at('wiki'))
      .filter((f) => f.endsWith('.md'))
      .map((f) => `wiki/${f}`)
  : []
const errors = [
  ...readmeErrors(md, diagrams),
  ...publishWikiErrors(read('.github/workflows/publish-wiki.yml')),
  ...pages.flatMap((p) => imageErrors(p, read(p), diagrams)),
]
errors.push(
  ...ciErrors(read('.github/workflows/ci.yml')),
  ...releaseErrors(read('.github/workflows/release.yml')),
  ...checkShErrors(read('scripts/check.sh')),
) // the CI, release and check.sh rules
errors.push(...versionsErrors(read('.github/workflows/claude-code-versions.yml'))) // the versions workflow rule
for (const p of new Set(['assets/icon.svg', ...[md, ...pages.map((p) => read(p))].flatMap((t) => assetImages(t))])) {
  if (!existsSync(at(p))) {
    errors.push(`${p} is displayed but does not exist`)
  }
}

errors.push(...docsFolderErrors(existsSync(at('docs'))))
errors.push(
  ...(existsSync(at('.claude-plugin/icon.png'))
    ? iconErrors(readFileSync(at('.claude-plugin/icon.png')))
    : ['icon.png: missing']),
)
// README images begin: each README SVG equals a fresh render, and every glyph sits at col × CELL.
for (const img of IMAGES) {
  try {
    const { svg, rows } = renderImage(img)
    const file = read(img.file)
    if (file !== svg) {
      errors.push(`${img.file}: stale; run node scripts/render-svg.ts --readme`)
    }

    for (const m of misplaced(file, rows, width)) {
      errors.push(`${img.file}: glyph off its cell: ${m}`)
    }
  } catch (err) {
    errors.push(`${img.file}: ${(err as Error).message}`)
  }
}
// README images end
const listed = new Set(diagrams)
for (const f of existsSync(at('assets/readme')) ? readdirSync(at('assets/readme')) : []) {
  if (f.endsWith('.svg') && !listed.has(`assets/readme/${f}`)) {
    errors.push(`assets/readme/${f}: not in the image manifest`)
  }
}
// GitHub render cross-check begin: GitHub's render of each page must show the tree's links and images; CI passes
// GH_TOKEN, and a local run without it skips.
if (process.env.GH_TOKEN) {
  for (const p of ['README.md', ...pages]) {
    try {
      errors.push(...renderErrors(p, read(p), githubHtml(p, root)))
    } catch (e) {
      errors.push(`${p}: ${(e as Error).message}`)
    }
  }
} else if (process.env.GITHUB_ACTIONS === 'true') {
  errors.push('GitHub render cross-check: GH_TOKEN is not set in CI (D15d)')
} else {
  console.log('check-docs: GitHub render cross-check skipped: no GH_TOKEN (CI sets it)')
}
// GitHub render cross-check end
for (const e of errors) {
  console.error(`check-docs: ${e}`)
}

if (errors.length) {
  process.exit(1)
}

console.log(`check-docs: ok (README, ${IMAGES.length} images, 4 workflows, check.sh, icon)`)
