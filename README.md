<p align="center"><img src="assets/icon.svg" alt="mermaid-tty logo" width="120"></p>

# mermaid-tty

**Yet, just another Mermaid renderer for your terminal**

[![CI](https://github.com/D0n9X1n/mermaid-tty/actions/workflows/ci.yml/badge.svg)](https://github.com/D0n9X1n/mermaid-tty/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/D0n9X1n/mermaid-tty)](https://github.com/D0n9X1n/mermaid-tty/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Stars](https://img.shields.io/github/stars/D0n9X1n/mermaid-tty?style=flat)](https://github.com/D0n9X1n/mermaid-tty/stargazers)

A Claude Code plugin (mod) that redraws closed `mermaid` fences in Claude's replies as colored, flat, box-drawing diagrams sized to your terminal, with exact CJK widths. The transcript keeps the Mermaid source. If a diagram can't be drawn faithfully, you get the source—not an approximation.

## Install

```sh
claude plugin marketplace add D0n9X1n/mermaid-tty
claude plugin install mermaid-tty@mermaid-tty
```

Needs Claude Code 2.1.287 or later, on macOS, Linux or Windows. Start a new Claude Code session after installing. No build step or runtime dependencies.

## Before and after

| Before | After |
|---|---|
| ![A mermaid fence as Claude Code shows it today](assets/readme/before.svg) | ![The same fence drawn by mermaid-tty](assets/readme/after.svg) |

![A sequence diagram drawn by mermaid-tty](assets/readme/sequence.svg)

| | |
|---|---|
| ![A mindmap drawn by mermaid-tty](assets/readme/mindmap.svg) | ![A gitGraph drawn by mermaid-tty](assets/readme/gitgraph.svg) |
| ![A gantt chart drawn by mermaid-tty](assets/readme/gantt.svg) | ![A class diagram drawn by mermaid-tty](assets/readme/class.svg) |
| ![A pie chart drawn by mermaid-tty](assets/readme/pie.svg) | |

## Supported diagrams

v1.0.0 draws these 13 types, within each type's supported syntax:

| Type | Header keywords |
|---|---|
| `flowchart` | `flowchart`, `graph` |
| `sequence` | `sequenceDiagram` |
| `state` | `stateDiagram`, `stateDiagram-v2` |
| `class` | `classDiagram`, `classDiagram-v2` |
| `er` | `erDiagram` |
| `mindmap` | `mindmap` |
| `gantt` | `gantt` |
| `pie` | `pie` |
| `gitGraph` | `gitGraph` |
| `timeline` | `timeline` |
| `journey` | `journey` |
| `xychart` | `xychart-beta`, `xychart` |
| `quadrant` | `quadrantChart` |

Other types or unsupported statements leave the original fence unchanged for Claude Code to display. mermaid-tty never draws only part of a diagram.

## Themes

Diagrams follow your Claude Code theme by default. Pick a curated palette, or `mono` for no color.

| default | nord |
|---|---|
| ![default](assets/readme/theme-default.svg) | ![nord](assets/readme/theme-nord.svg) |
| **dracula** | **gruvbox** |
| ![dracula](assets/readme/theme-dracula.svg) | ![gruvbox](assets/readme/theme-gruvbox.svg) |
| **solarized** | **mono** |
| ![solarized](assets/readme/theme-solarized.svg) | ![mono](assets/readme/theme-mono.svg) |

## Configuration

| Option | Values | Default |
|---|---|---|
| `theme` | `default`, `nord`, `dracula`, `gruvbox`, `solarized`, `mono` | `default`: follow the Claude Code theme |

```sh
echo '{"theme":"nord"}' | claude plugin configure mermaid-tty@mermaid-tty --values-stdin
```

## FAQ

**Why do I sometimes see the Mermaid source?** mermaid-tty falls back to the original fence when it can't parse a diagram, doesn't support its syntax or type, or can't draw it faithfully within the available width. Unclosed fences stay as text. `claude --debug` logs fallback reasons.

**How wide are diagrams?** No drawn row exceeds the terminal's columns. Depending on the type, mermaid-tty tightens gaps, wraps labels, turns horizontal graphs vertical, or moves text into a keyed legend. If nothing fits, it shows the source.

**Do CJK labels line up?** Yes. Wide characters count as 2 columns and combining marks as 0. Characters with unreliable terminal widths fall back rather than break alignment.

![A flowchart with Chinese labels drawn by mermaid-tty](assets/readme/cjk.svg)

**How do I see the Mermaid source?** Run `/mermaid-tty source` to show diagrams as source, including replies already on screen. `/mermaid-tty diagram` draws them again; bare `/mermaid-tty` reports the current mode. `/copy` copies the exact Mermaid source in either mode.

**Which platforms and terminals work?** macOS, Linux and Windows, in any terminal Claude Code supports: Windows Terminal; macOS Terminal, iTerm2 and Ghostty; and Linux terminals. Truecolor terminals show the palettes exactly; 256-color terminals use their available colors. Use a monospaced font with box-drawing and geometric-shape glyphs, plus a CJK font for CJK labels. Keep ambiguous-width characters set to one column so lines meet.

## Development

Use Node 24 or later and Claude Code. No build step is needed. From the repository root:

```sh
bash scripts/check.sh                   # must-pass suite; CI uses Git Bash on Windows
npm ci --prefix scripts/e2e             # the end-to-end job's pinned tooling
node scripts/e2e/run.ts                 # real Claude Code against a mock API, all six themes
node scripts/render-gallery.ts gallery  # the visual-review gallery, as SVG
node scripts/check-ci-coverage.ts       # every acceptance check has a CI step
```

CI runs checks and end-to-end tests on Linux, macOS and Windows. It runs the Node and docs tests separately from `check.sh`:

```sh
node --test
npm ci --prefix scripts/docs
node --test 'scripts/tests/*.docs-spec.ts'
node scripts/check-docs.ts
```

More in the [English](https://github.com/D0n9X1n/mermaid-tty/wiki) and [简体中文](https://github.com/D0n9X1n/mermaid-tty/wiki/Home-zh-CN) wiki.

## License

[MIT](LICENSE)
