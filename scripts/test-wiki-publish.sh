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
