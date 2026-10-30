#!/usr/bin/env bash
# scripts/check.sh: the single must-pass entry (CI: shell: bash; Git Bash on Windows).
# Sub-projects B and C add rows to CHECKS in scripts/check.ts, not lines here.
set -euo pipefail
cd "$(dirname "$0")/.."
claude plugin validate .
claude plugin test .
node scripts/check.ts all
# Sub-project B: docs, wiki, install and CI coverage
[[ -d scripts/docs/node_modules ]] || npm ci --prefix scripts/docs  # D15c: install the pinned parser once
node --test 'scripts/tests/*_test.ts' 'scripts/tests/*.docs-spec.ts'
node scripts/check-docs.ts
node scripts/check-wiki.ts
bash scripts/test-wiki-publish.sh
bash scripts/test-local-install.sh
node scripts/check-ci-coverage.ts
