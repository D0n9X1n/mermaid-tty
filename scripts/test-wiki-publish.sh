#!/usr/bin/env bash
set -euo pipefail
shopt -s nullglob

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
publisher="$root/scripts/publish-wiki.sh"
checker="$root/scripts/check-wiki.ts"

fail() {
  printf 'wiki publish test: %s\n' "$1" >&2
  exit 1
}

# After a publish the wiki must be clean, and its top-level pages, on disk and
# in HEAD, must be exactly the source's, byte for byte.
assert_mirrored() {
  local page name
  [[ -z "$(git -C "$wiki_repo" status --porcelain)" ]] || fail "$1 left uncommitted changes"
  [[ "$(cd "$wiki_repo" && printf '%s\n' *.md)" == "$(cd "$source_dir" && printf '%s\n' *.md)" ]] \
    || fail "$1 did not mirror the source page set"
  for page in "$wiki_repo"/*.md; do
    name="${page##*/}"
    cmp "$page" "$source_dir/$name" || fail "$1 did not mirror $name byte for byte"
    git -C "$wiki_repo" show "HEAD:$name" | cmp - "$source_dir/$name" || fail "$1 did not commit $name byte for byte"
  done
}

[[ -x "$publisher" ]] || fail "publisher is missing or not executable"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
# A space in both paths catches the publisher expanding either path unquoted.
source_dir="$tmp/with space/source"
wiki_repo="$tmp/with space/wiki"
mkdir -p "$source_dir"
git init -q -b master "$wiki_repo"
git -C "$wiki_repo" config user.name test
git -C "$wiki_repo" config user.email test@example.invalid
printf '# stale\n' > "$wiki_repo/Stale.md"
printf '# old\n' > "$wiki_repo/Keep.md"
git -C "$wiki_repo" add --all
git -C "$wiki_repo" commit -q -m seed

printf '# home\n' > "$source_dir/Home.md"
printf '# 首页\n' > "$source_dir/Home-zh-CN.md"
printf '# getting started\n' > "$source_dir/Getting Started.md"
printf '# current\n' > "$source_dir/Keep.md"
printf 'not a wiki page\n' > "$source_dir/ignored.txt"

first_output="$tmp/first-output"
GITHUB_OUTPUT="$first_output" "$publisher" "$source_dir" "$wiki_repo" 0123456789abcdef \
  || fail "first publish failed"
[[ "$(<"$first_output")" == "changed=true" ]] || fail "changed publish did not request a push"
[[ -d "$wiki_repo/.git" ]] || fail "publisher removed Git metadata"
[[ "$(git -C "$wiki_repo" branch --show-current)" == "master" ]] || fail "publisher changed branch"
[[ -f "$wiki_repo/Home.md" ]] || fail "publisher omitted a new page"
[[ -f "$wiki_repo/Home-zh-CN.md" ]] || fail "publisher omitted the Chinese page"
[[ "$(<"$wiki_repo/Keep.md")" == "# current" ]] || fail "publisher did not update a page"
[[ ! -e "$wiki_repo/Stale.md" ]] || fail "publisher retained a deleted page"
[[ ! -e "$wiki_repo/ignored.txt" ]] || fail "publisher copied a non-Markdown file"
assert_mirrored "first publish"
[[ "$(git -C "$wiki_repo" rev-list --count HEAD)" == "2" ]] || fail "first publish did not create one commit"
[[ "$(git -C "$wiki_repo" log -1 --pretty=%s)" == "Publish wiki from 0123456" ]] || fail "commit does not identify source SHA"

no_change_output="$tmp/no-change-output"
GITHUB_OUTPUT="$no_change_output" "$publisher" "$source_dir" "$wiki_repo" 0123456789abcdef \
  || fail "unchanged publish failed"
[[ "$(<"$no_change_output")" == "changed=false" ]] || fail "unchanged publish requested a push"
[[ "$(git -C "$wiki_repo" rev-list --count HEAD)" == "2" ]] || fail "unchanged publish created a commit"
assert_mirrored "unchanged publish"

rm "$source_dir/Keep.md"
printf '# renamed\n' > "$source_dir/Renamed.md"
"$publisher" "$source_dir" "$wiki_repo" fedcba9876543210 || fail "rename publish failed"
[[ ! -e "$wiki_repo/Keep.md" ]] || fail "rename retained the old page"
[[ -f "$wiki_repo/Renamed.md" ]] || fail "rename omitted the new page"
assert_mirrored "rename"
[[ "$(git -C "$wiki_repo" rev-list --count HEAD)" == "3" ]] || fail "rename did not create one commit"
printf 'wiki publish test: publisher ok\n'

# Checker (B2): the real checker passes a valid fixture wiki and fails each mutation with its diagnostic, in throwaway dirs.
[[ -f "$checker" ]] || fail "checker is missing"
base="$tmp/checker"; mkdir -p "$base/wiki"
pair() { # pair STEM ENGLISH_TITLE CHINESE_TITLE
  printf '# %s\n\n[Chinese (Simplified)](%s-zh-CN)\n\n## Overview\n\nSee [Home](Home).\n\n```text\n中文 in code is fine\n```\n' "$2" "$1" > "$base/wiki/$1.md"
  printf '# %s\n\n[英文版](%s)\n\n## 概述\n\n参见[首页](Home-zh-CN)。\n\n```text\nEnglish in code is fine\n```\n' "$3" "$1" > "$base/wiki/$1-zh-CN.md"
}
pair Home Home 首页; pair Usage Usage 用法; pair Configuration-and-Themes Configuration 配置与主题
pair Architecture Architecture 架构; pair Development-and-Release Development 开发与发布
printf '\nWorks on Windows, macOS and Linux. Run `/mermaid-tty source` or `/mermaid-tty diagram`; `/copy` copies the source.\n' >> "$base/wiki/Usage.md"
printf '\n支持 Windows、macOS 和 Linux。用 `/mermaid-tty source` 或 `/mermaid-tty diagram` 切换，`/copy` 复制源码。\n' >> "$base/wiki/Usage-zh-CN.md"
for p in Development-and-Release Development-and-Release-zh-CN; do
  printf '\n```sh\nbash scripts/check.sh\nnpm ci --prefix scripts/e2e\nnode scripts/e2e/run.ts\nnode scripts/render-gallery.ts\nnode scripts/check-ci-coverage.ts\n```\n' >> "$base/wiki/$p.md"
done
(cd "$base" && node "$checker" wiki) >/dev/null || fail "checker rejected a valid wiki"
edit() { node -e 'const fs=require("fs"),[f,a,b]=process.argv.slice(1),s=fs.readFileSync(f,"utf8");if(!s.includes(a))process.exit(9);fs.writeFileSync(f,s.replace(a,b))' "$@"; }
rejects() { # rejects NAME EXPECTED MUTATION...
  local name="$1" expected="$2" fixture="$tmp/$1"; shift 2
  cp -R "$base" "$fixture"; (cd "$fixture" && "$@") || fail "mutation $name did not apply"
  if (cd "$fixture" && node "$checker" wiki >output 2>&1); then fail "checker accepted $name"; fi
  grep -Fq -- "$expected" "$fixture/output" || { cat "$fixture/output" >&2; fail "$name: expected '$expected'"; }
}
rejects missing-twin 'missing language counterpart Usage-zh-CN' rm wiki/Usage-zh-CN.md
rejects missing-page 'wiki/Architecture.md: required page missing' rm wiki/Architecture.md wiki/Architecture-zh-CN.md
rejects no-opener 'must open with exactly [Chinese (Simplified)](Usage-zh-CN)' edit wiki/Usage.md '[Chinese (Simplified)](Usage-zh-CN)' 'Read me.'
rejects second-twin-link 'cross-language links' edit wiki/Usage.md 'See [Home](Home).' 'See [Home](Home) and [Chinese](Usage-zh-CN).'
rejects cross-language 'cross-language links' edit wiki/Usage-zh-CN.md '](Home-zh-CN)' '](Home)'
rejects cjk-in-english 'CJK outside code' edit wiki/Usage.md 'See [Home](Home).' '参见 [Home](Home).'
rejects untranslated 'untranslated, no CJK' edit wiki/Usage-zh-CN.md $'[英文版](Usage)\n' $'[英文版](Usage)\n\n- Still English\n'
rejects no-chinese 'no Chinese prose' edit wiki/Architecture-zh-CN.md '参见[首页](Home-zh-CN)。' '`code only`'
rejects heading-levels 'heading levels' edit wiki/Usage.md '## Overview' '### Overview'
rejects md-link 'link must omit .md' edit wiki/Usage.md '](Home)' '](Home.md)'
rejects unknown-link 'link target does not exist' edit wiki/Usage.md '](Home)' '](Nowhere)'
rejects nested 'nested pages are not allowed' sh -c 'mkdir wiki/sub && cp wiki/Usage.md wiki/sub/'
rejects usage-os 'wiki/Usage.md: does not cover Windows' edit wiki/Usage.md 'Works on Windows, ' 'Works on '
rejects dev-commands 'does not show node scripts/e2e/run.ts' edit wiki/Development-and-Release.md 'node scripts/e2e/run.ts' 'node scripts/e2e/other.ts'
rejects usage-source 'wiki/Usage.md: does not cover /copy' edit wiki/Usage.md '; `/copy` copies the source' ''
rejects ctrl-o-claim 'claims ctrl+o shows the source' edit wiki/Usage.md 'See [Home](Home).' 'See [Home](Home). ctrl+o shows the source.'
rejects old-opener 'untranslated, no CJK: [English](Usage)' edit wiki/Usage-zh-CN.md '[英文版](Usage)' '[English](Usage)'
rejects absolute-cross-link 'link target not allowed' edit wiki/Usage.md 'See [Home](Home).' 'See [Home](Home) and [Chinese page](https://github.com/D0n9X1n/mermaid-tty/wiki/Usage-zh-CN).'
rejects autolink 'autolink or bare URL' edit wiki/Usage.md 'See [Home](Home).' 'See [Home](Home) and <https://github.com/D0n9X1n/mermaid-tty/wiki/Usage-zh-CN>.'
rejects wiki-link '[[wiki link]]' edit wiki/Usage.md 'See [Home](Home).' 'See [Home](Home) and [[Usage-zh-CN]].'
rejects badge-cross-link 'cross-language links' edit wiki/Usage.md 'See [Home](Home).' 'See [Home](Home) and [![zh](../assets/icon.svg)](Usage-zh-CN).'
rejects html-anchor 'raw HTML' edit wiki/Usage.md 'See [Home](Home).' 'See [Home](Home) and <a href="Usage-zh-CN">x</a>.'
rejects invalid-fence 'cross-language links' edit wiki/Usage.md 'See [Home](Home).' $'See [Home](Home).\n\n``` `\n\nSee [Chinese](Usage-zh-CN).'
long=$(node -e 'process.stdout.write("`".repeat(1001))') # D15d: past cmark-gfm's 1,000-backtick code-span limit
rejects long-code-span 'backtick run longer than 3' edit wiki/Usage.md 'See [Home](Home).' "See [Home](Home). ${long}[Chinese](Usage-zh-CN)${long}"
printf 'wiki publish test: ok\n'
