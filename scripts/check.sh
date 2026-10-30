#!/usr/bin/env bash
# scripts/check.sh: the single must-pass entry (CI: shell: bash; Git Bash on Windows).
# Sub-projects B and C add rows to CHECKS in scripts/check.ts, not lines here.
set -euo pipefail
cd "$(dirname "$0")/.."
claude plugin validate .
claude plugin test .
node scripts/check.ts all
