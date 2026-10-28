# mermaid-tty v1 design: docs, wiki pipeline, CI and release (sub-project B)

**Goal:** make mermaid-tty easy to find, install and trust, with a polished README, a bilingual wiki published automatically the way SonicTerm's is, green CI, and a `v0.1.0` release.

**Approval:** PM waiver under `/goal` autonomy, 2026-10-27. Depends on sub-project A, `2026-10-27-mermaid-tty-v1-design.md`.

## Requirements (must pass)

1. **README.md**
   - **Hero:** a centered logo, the tagline "Yet, just another Mermaid renderer for your terminal", and badges for CI, release, license and stars.
   - **Install:** both commands, `claude plugin marketplace add D0n9X1n/mermaid-tty` and `claude plugin install mermaid-tty@mermaid-tty`, in one copyable block.
   - **Content:** before-and-after images, a theme gallery, configuration, a FAQ covering fallback, width and CJK, and links to the English and 简体中文 wiki.
   - **Images:** SVGs that `scripts/render-svg.ts` generates from `core/`, so every image is real renderer output. Each glyph sits at its own cell's x position, so CJK alignment doesn't depend on the viewer's fonts.
2. **wiki/**
   - **Pages:** pairs `<Page>.md` and `<Page>-zh-CN.md` for Home, Usage, Configuration-and-Themes, Architecture and Development-and-Release.
   - **Language:** each page is written only in its file's language, and the two pages of a pair have the same headings.
3. **Publishing**
   - **Workflow:** `.github/workflows/publish-wiki.yml` runs on every push to `main` and on `workflow_dispatch`, with a job-scoped `contents: write`.
   - **Script:** `scripts/publish-wiki.sh SOURCE WIKI_REPO SHA` mirrors the pages and commits only when something changed. Both the workflow and the script mirror SonicTerm's.
   - **Tests:** `scripts/test-wiki-publish.sh` runs in throwaway Git repos. It checks mirroring and no-op runs, that every page has its zh-CN twin, that the twins' headings match, and that no link crosses languages.
4. **CI:** `.github/workflows/ci.yml` runs on pushes and pull requests and executes `scripts/check.sh`.
   - The runner has Node 22 and Claude Code installed from npm, for `validate` and `test`.
   - Actions are pinned by SHA.
5. **Release:**
   - Tag `v0.1.0` and publish a GitHub Release whose notes include the install commands.
   - Verify that installing from the marketplace works, in a scratch session.
6. **Icon:** `.claude-plugin/icon.png`, square, 512 px, under 2 MB, converted from a checked-in SVG.

## Known constraint

GitHub creates a wiki's Git repo only after its first page is saved in the web UI. If `publish-wiki` cannot clone it, the owner gets a one-click task, and the workflow is re-run afterwards.

## Test strategy

`scripts/check.sh` includes:
- `scripts/test-wiki-publish.sh`
- a check that every relative link and image path in README and `wiki/` exists
- a check that the committed SVGs match a fresh `render-svg` run

CI must pass on the pull request.

## Decisions (self-answered)

- README images are generated SVGs rather than screenshots, so they stay reproducible.
- Release notes are written by hand.
