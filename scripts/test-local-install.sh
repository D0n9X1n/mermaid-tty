#!/usr/bin/env bash
# B5, every PR: install the plugin from this checkout's marketplace into a throwaway config. Offline; no account.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# The throwaway dir, from an explicit template under TMPDIR, since without one macOS ignores TMPDIR. On exit, remove that path
# itself, never the cygpath -w form of it handed to claude.
tmp="$(mktemp -d "${TMPDIR:-/tmp}/mtty-install.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT
config="$tmp"
if command -v cygpath >/dev/null 2>&1; then config="$(cygpath -w "$tmp")"; fi # Git Bash: give claude.exe a Windows path
export CLAUDE_CONFIG_DIR="$config"
version="$(node -p 'require("./.claude-plugin/plugin.json").version')"
claude plugin marketplace add ./
claude plugin install mermaid-tty@mermaid-tty --config theme=default
list="$(claude plugin list)"
grep -Fq 'mermaid-tty@mermaid-tty' <<<"$list" || { printf '%s\n' "$list" >&2; printf 'local install: mermaid-tty is not installed\n' >&2; exit 1; }
# The Version line of this plugin's own entry, which a blank line ends (CRs dropped first, in case of CRLF output).
installed="$(awk '{ sub(/\r$/, "") } $NF == "mermaid-tty@mermaid-tty" { f = 1; next } f && NF == 0 { exit } f && $1 == "Version:" { print $2; exit }' <<<"$list")"
[[ "$installed" == "$version" ]] || { printf 'local install: installed version is %s, not %s\n' "${installed:-none}" "$version" >&2; exit 1; }
printf 'local install: ok (mermaid-tty %s)\n' "$version"
