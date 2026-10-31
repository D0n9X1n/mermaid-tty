# CLAUDE.md

Working conventions for `mermaid-tty`. Read before writing code, opening a PR or cutting a release.

## Workflow

**Milestone → issue → PR → release.** This is the standard for all work.

1. **Milestone first.** Titled exactly like the release tag it ships in (`v1.1.2`). Create it before the issues that target it.
2. **Issue.** Every change gets one, on the milestone. Labels: `bug`, `enhancement`, `documentation`, `question`.
3. **PR.** Branch off `main`, with `Closes #N` in the commit body so the issue closes on merge. Put the PR on the milestone too. Give it a title that reads well in a list: release notes are made from PR and issue titles.
4. **Release.** Only when every issue on the milestone is closed by a merged PR. Bump `.claude-plugin/plugin.json` and `package.json` in a release PR titled `mermaid-tty vX.Y.Z`, wait for `publish-wiki` to succeed on the merged commit, then push the tag `vX.Y.Z`. Close the milestone once the release workflow passes.

Nothing lands on `main` without an issue and a PR, unless the owner asks for a direct push.

**Never release with an open issue.** Work the owner asked for in the session belongs on the milestone and gets done; don't park it as a follow-up to unblock a release. A release cut with an active issue open is deleted.

**Post-merge cleanup is required.** After a PR merges, remove its merged local and remote branches and temporary worktrees, prune stale remote-tracking refs, and return to an updated `main`. Never discard unmerged or uncommitted work.

## Releasing

Pushing a `v*` tag runs `.github/workflows/release.yml`. It checks the tag against `plugin.json`, generates the notes, requires a successful wiki publish for the tagged commit, creates the GitHub Release, installs the plugin from the marketplace into a fresh config, and runs the end-to-end tests against that copy. A tag is public the moment it is pushed.

**Release notes are generated, never written.** `scripts/release-notes.py` builds them from the issues and PRs in the range since the previous `v*` tag: the install block, resolved issues, merged PRs (release PRs left out). There is no changelog and no notes file in the repo. Preview with `python3 scripts/release-notes.py vX.Y.Z` once the tag exists locally.

Run the full gate on the exact commit you tag; a green PR is not the same tree as the release commit.

## Documentation

**`wiki/` is the only documentation, and the source of the GitHub Wiki tab.** There is no `docs/`; `check-docs` fails if one appears. Two trees meant the same fact written twice and drifting.

The wiki explains the project as it is now, for humans and coding agents: how it works, its architecture, configuration, development and release. Name source paths and symbols, not line numbers. No per-feature specs, plans or decision records: git history keeps them, and decisions live in issues and PRs.

- **English and 中文 stay in sync.** Every page has its `-zh-CN` twin with the same structure and equivalent content. `node scripts/check-wiki.ts` enforces the pairs, openers, links and grammar.
- **A user-visible change is incomplete until the wiki says so**, in both languages, in the same PR.
- **A wiki change is incomplete until it is published.** `publish-wiki` runs on merge; check it succeeded and the live tab shows the change.

The README follows `scripts/lib/doc-rules.ts`: its images are rendered from source (`node scripts/render-svg.ts --readme`), never hand-edited.

## Code style

Write for the next human reader. The style follows copilot-relay's rules and the major TypeScript guides (Google, Airbnb, StandardJS): one house style, formatted by a tool, never argued by hand.

```sh
npm ci --prefix scripts/style       # once: pins Prettier 3.6.2, nothing else
node scripts/style/run.ts --write   # format: Prettier, then layout.ts, then Prettier
node scripts/style/run.ts           # check: Prettier, check-style and its tests (CI runs this on all three OSes)
```

Run `--write` before every commit. CI fails on any difference.

**Formatted by Prettier** (`.prettierrc.json`): single quotes, no semicolons, two-space indent, 120 columns, trailing commas. Generated tables, goldens and fixtures are left alone (`.prettierignore`).

**Checked by `scripts/style/check-style.ts`**, with the closest ESLint rule:

| Rule | Closest ESLint rule |
|---|---|
| Every `if`, `else`, `for`, `while` and `do` body is a braced block; only `else if` is exempt | `curly: all` |
| `===` and `!==`; `== null` only to match both `null` and `undefined` | `eqeqeq`, null ignored |
| No ternary inside a ternary: use `if`/`else`, an early return or a lookup | `no-nested-ternary` |
| One variable per `const` or `let`; loop headers excepted | `one-var: never` |
| A blank line after each multi-line block statement | `padding-line-between-statements` |
| At most one blank line in a row, in comments too | `no-multiple-empty-lines` |
| No line over 120 columns, unless a string, template, regex or URL crosses it | `max-len` |
| No file over 1000 lines: split it by topic | `max-lines` |
| No issue or PR number in a comment or test name, and no issue or PR link in any string | project rule |

Python scripts: one statement per line, no compound one-line statements, the same line, file and citation limits (`scripts/style/check_py.py`).

**Reviewed, not enforced:**

- **Comments say why.** State how the code works and why: the Mermaid behavior it mirrors, the terminal fact it depends on, the invariant it keeps. Don't restate the next line.
- **Code states how it works today, never its history.** No issue or PR numbers, no spec files, no story of how a bug was found. That belongs in commits, PRs and the wiki; a reader must not need the issue tracker to understand the code.
- Names say what a value is or does; booleans read as predicates.
- Guard clauses over deep nesting; blank lines between a function's logical steps.
- Tests separate arrange, act and assert, and name the behavior they check.
- Keep formatting-only commits apart from logic changes, so a reviewer can confirm they behave the same.

## Tests

```sh
bash scripts/check.sh                       # must-pass suite
node --test                                 # unit and integration tests
npm ci --prefix scripts/docs && node --test 'scripts/tests/*.docs-spec.ts'
python3 -m unittest scripts/release-issues_tests.py scripts/release-notes_tests.py bin/claude-tmux_tests.py
node scripts/e2e/run.ts                     # real Claude Code against a mock API (npm ci --prefix scripts/e2e first)
```

- Write the failing test first, watch it fail, then make it pass.
- Goldens (`goldens/**`) change only on purpose: regenerate with `UPDATE_GOLDEN=1`, then review every changed drawing.
- `core/` and `hooks/` run in Claude Code's module sandbox: no Node globals, no DOM, relative `.ts` imports only. `scripts/check-portable.ts` enforces it.
- No build step and no runtime dependency. Tooling that needs packages gets its own folder and lockfile, as `scripts/docs/` and `scripts/e2e/` do; default tests must not import them.
- CI runs on Linux, macOS and Windows; all must pass.

## Rendering

**Faithful or nothing.** A diagram draws whole, as Mermaid shows it, and passes the validator, or the original source is shown. Never draw part of a diagram or an approximation. When Mermaid's behavior is in doubt, check it in Chrome under `securityLevel: strict` rather than assuming.
