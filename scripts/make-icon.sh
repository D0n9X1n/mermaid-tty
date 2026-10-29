#!/usr/bin/env bash
# B6 (dev Mac): assets/icon.svg -> .claude-plugin/icon.png, 512×512, under 2 MB, confirmed by sips. CI re-reads the PNG header in check-docs.ts.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
command -v rsvg-convert >/dev/null || { printf 'make-icon: needs rsvg-convert (brew install librsvg)\n' >&2; exit 1; }
rsvg-convert -w 512 -h 512 assets/icon.svg -o .claude-plugin/icon.png
read -r w h < <(sips -g pixelWidth -g pixelHeight .claude-plugin/icon.png | awk '/pixel/ {print $2}' | paste -s -d ' ' -)
bytes=$(( $(wc -c < .claude-plugin/icon.png) ))
[[ "$w" == 512 && "$h" == 512 ]] || { printf 'make-icon: %sx%s, want 512x512\n' "$w" "$h" >&2; exit 1; }
(( bytes < 2000000 )) || { printf 'make-icon: %s bytes, want under 2 MB\n' "$bytes" >&2; exit 1; }
printf 'make-icon: .claude-plugin/icon.png 512x512, %s bytes (sips)\n' "$bytes"
