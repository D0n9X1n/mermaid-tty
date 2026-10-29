# Configuration and Themes

[Chinese (Simplified)](Configuration-and-Themes-zh-CN)

mermaid-tty has one option, `theme`, which picks the colors of every diagram. This page lists its values, shows each palette's colors, and explains the roles a theme colors.

## The theme option

The option is `userConfig.theme` in `.claude-plugin/plugin.json`. Its values:

| Value | Colors |
|---|---|
| `default` | Follows your Claude Code theme: each role maps to a Claude Code theme key. This is the default. |
| `nord` | The Nord palette. |
| `dracula` | The Dracula palette. |
| `gruvbox` | The Gruvbox palette. |
| `solarized` | The Solarized palette. |
| `mono` | No color. End caps and glyphs tell the roles apart. |

Set it from the command line by piping a JSON object to `claude plugin configure`:

```sh
echo '{"theme":"nord"}' | claude plugin configure mermaid-tty@mermaid-tty --values-stdin
```

With `--values-stdin`, options you leave out keep their values. Inside Claude Code, `/plugin configure mermaid-tty@mermaid-tty` sets it too.

To see the option and whether it is set, leave out `--values-stdin`. Add `--json` for machine-readable output:

```sh
claude plugin configure mermaid-tty@mermaid-tty
claude plugin configure mermaid-tty@mermaid-tty --json
```

mermaid-tty reads the option once, when it loads, so restart Claude Code after a change. An unset or unknown value draws with `default`.

## Palettes

`default` maps each role to a Claude Code theme key, so your diagrams follow your Claude Code theme. The four curated palettes use their projects' official hex colors. `mono` has no colors at all.

| Role | `default` | `nord` | `dracula` | `gruvbox` | `solarized` |
|---|---|---|---|---|---|
| `node` | `suggestion` | `#88C0D0` | `#8BE9FD` | `#83A598` | `#268BD2` |
| `decision` | `warning` | `#EBCB8B` | `#F1FA8C` | `#FABD2F` | `#B58900` |
| `edge` | `inactive` | `#D8DEE9` | `#F8F8F2` | `#928374` | `#93A1A1` |
| `arrow` | `claude` | `#BF616A` | `#FF79C6` | `#FB4934` | `#CB4B16` |
| `label` | `text` | `#A3BE8C` | `#50FA7B` | `#B8BB26` | `#EEE8D5` |
| `frame` | `permission` | `#B48EAD` | `#BD93F9` | `#D3869B` | `#D33682` |
| `note` | `subtle` | `#5E81AC` | `#FFB86C` | `#FE8019` | `#2AA198` |
| `title` | `text` | `#D08770` | `#FF5555` | `#EBDBB2` | `#6C71C4` |
| `value` | `success` | `#81A1C1` | `#6272A4` | `#458588` | `#859900` |
| text on a filled pill | `inverseText` | `#2E3440` | `#282A36` | `#282828` | `#FDF6E3` |
| background | none | `#2E3440` | `#282A36` | `#282828` | `#002B36` |

In every palette but `mono`, node and decision pills are filled: a pill's label and fill cells take the role's color as their background, and the "text on a filled pill" color as their text. Its end caps keep the role's color. `mono` fills nothing.

mermaid-tty doesn't paint a palette's background. A diagram sits on your terminal's own background, and only pills are filled. The background row is the color each curated palette is checked against: `scripts/check-palettes.ts` asserts that every role has a contrast ratio of at least 3:1 against it, and that every pair of roles, and every pair of series colors, is at least 0.08 apart in OKLab. So a curated palette reads best on a terminal background close to its own. `default` and `mono` are exempt from the check.

Series-colored items, such as lanes, branches, sections and chart series, take the series colors `s1` to `s8`, cycling through them in source order:

| Series | `default` | `nord` | `dracula` | `gruvbox` | `solarized` |
|---|---|---|---|---|---|
| `s1` | `suggestion` | `#88C0D0` | `#8BE9FD` | `#83A598` | `#268BD2` |
| `s2` | `success` | `#A3BE8C` | `#50FA7B` | `#B8BB26` | `#859900` |
| `s3` | `warning` | `#EBCB8B` | `#F1FA8C` | `#FABD2F` | `#B58900` |
| `s4` | `error` | `#D08770` | `#FFB86C` | `#FE8019` | `#CB4B16` |
| `s5` | `merged` | `#B48EAD` | `#FF79C6` | `#FB4934` | `#93A1A1` |
| `s6` | `claude` | `#81A1C1` | `#BD93F9` | `#D3869B` | `#D33682` |
| `s7` | `permission` | `#BF616A` | `#FF5555` | `#458588` | `#6C71C4` |
| `s8` | `planMode` | `#5E81AC` | `#6272A4` | `#928374` | `#2AA198` |

## Roles

Each cell a diagram draws has a role, and the theme colors the cell by its role. Seven roles cover the graph:

| Role | What it colors |
|---|---|
| `node` | Node pills, with their end caps: flowchart nodes and sequence participants. |
| `decision` | Decision pills: flowchart diamonds, written `{text}`. |
| `edge` | Lines: flowchart edges and sequence messages. |
| `arrow` | Edge ends: the heads `►`, `◄`, `▲` and `▼`, the circle end `o`, the cross end `x`, and a sequence message's async end `)`. |
| `label` | Edge labels and message labels. |
| `frame` | Frames and their titles: subgraphs; sequence `alt`, `opt`, `loop`, `par`, `critical` and `break` blocks; and participant boxes. |
| `note` | Sequence notes, `rect` blocks and lifelines. |

Two more roles color text outside the graph:

- `title`: the diagram's title. It is bold in every theme.
- `value`: printed values, such as a gantt task's timing.

Series-colored items take `s1` to `s8` instead of a role. See Palettes above.

**Mono.** `mono` has no color and fills no pill, so the drawing alone tells the roles apart:

- Each node shape has its own pair of end caps, which echo Mermaid's brackets: `[ … ]` rectangle, `( … )` round, `([ … ])` stadium, `[[ … ]]` subroutine, `[( … )]` cylinder, `(( … ))` circle, `{ … }` decision, `{{ … }}` hexagon, `/ … /` and `\ … \` parallelograms, `/ … \` and `\ … /` trapezoids, and `> … ]` asymmetric. No two shapes share a pair, and every theme draws them.
- Line weight shows the edge kind: a solid edge draws light lines, `─` and `│`; a thick edge heavy lines, `━` and `┃`; a dotted edge `┄` and `┆`.
- Edge ends are glyphs, not colors: `►`, `◄`, `▲` and `▼` point at the node they reach, `o` is a circle end, and `x` a cross end.
- The title is bold, and a frame's title sits in its top border.
