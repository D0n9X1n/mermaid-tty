# Configuration and Themes

[Chinese (Simplified)](Configuration-and-Themes-zh-CN)

mermaid-tty has four options: `theme`, which picks the colors of every diagram; `direction`, which sets the flowchart direction Claude is asked to write; `crossings`, which sets whether crossing lines are colored apart; and `size`, which sets how large a diagram's picture is shown. One environment variable, `MERMAID_TTY_BTW_STATUS`, sets where the cue shown while a `/btw` is answered goes. This page lists their values, shows each palette's colors, explains the roles a theme colors, and how crossing lines are colored apart.

## The theme option

The option is `userConfig.theme` in `.claude-plugin/plugin.json`. Its values:

| Value | Colors |
|---|---|
| `default` | Follows your Claude Code theme: each role maps to a Claude Code theme key. |
| `nord` | The Nord palette. This is the default. |
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

mermaid-tty reads the option when it loads, so restart Claude Code after a change made with `claude plugin configure`. An unset or unknown value draws with `nord`.

To switch while Claude Code runs, use `/mermaid-tty theme <name>`. The replies on screen are drawn again at once, and the new value is saved as the `theme` option, as if you had picked it in `/config`, so later sessions keep it. If the option can't be saved, for example because a managed setting owns it, the switch lasts for this session and the reply says so. `/mermaid-tty theme` reports the theme in force. Each time mermaid-tty loads, it starts from the saved option.

## The direction option

`userConfig.direction` sets the direction Claude is asked to write flowcharts in. A terminal is wider than it is tall, so a flowchart that runs left to right uses the screen better than one that runs down it.

| Value | What Claude is asked |
|---|---|
| `LR` | Open each flowchart with `flowchart LR`, left to right. This is the default. |
| `TB` | Open each flowchart with `flowchart TB`, top to bottom. |
| `off` | Nothing: Claude picks the direction. |

The option only shapes what Claude writes: it never changes how a diagram is drawn. A diagram you write, or a direction you ask for, is kept. mermaid-tty still draws a left-to-right flowchart top to bottom when it is too wide for the window, as for any `LR` source (see Usage). With `LR` or `TB`, mermaid-tty adds a section to the system prompt, `mermaid-tty:flowchart-direction`, in sessions that draw in a terminal. `off` adds nothing.

Set it like `theme`, for example `echo '{"direction":"TB"}' | claude plugin configure mermaid-tty@mermaid-tty --values-stdin`, or while Claude Code runs with `/mermaid-tty direction LR|TB|off`, which saves the option the same way `/mermaid-tty theme` does. `/mermaid-tty direction` reports the setting in force. A conversation's system prompt stays as it was first sent, so a change made during a conversation also adds a short note that Claude reads; a new conversation gets the new section. If that note is refused, the reply says Claude was not told, and running the same command again retries it.

## The crossings option

`userConfig.crossings` sets whether each edge that crosses another is drawn in a color of its own, so a line can be followed past the crossing. See Crossing lines below.

| Value | Crossing lines |
|---|---|
| `on` | Each crossing edge takes a color of its own. This is the default. |
| `off` | Every cell keeps its theme's own color, as before crossing lines were colored. |

Set it like `theme`, for example `echo '{"crossings":"off"}' | claude plugin configure mermaid-tty@mermaid-tty --values-stdin`, or while Claude Code runs with `/mermaid-tty crossings on|off`. The command redraws the replies on screen and the `/btw` pane at once, and saves the option the same way `/mermaid-tty theme` does; a save that is refused lasts for the session, and the reply says so. `/mermaid-tty crossings` reports the setting in force. An unset or unknown value is `on`.

## The size option

`userConfig.size` sets how large a diagram's picture is shown, where the terminal shows pictures (see Pictures in [Usage](Usage)). Text drawings keep their size.

| Value | Pictures |
|---|---|
| `compact` | About three quarters of full: 21.6 of the picture's pixels to a column, the most mermaid-tty fits in a column and still reads clearly, the same limit past which it shows a picture too wide to read as text instead. This is the default. |
| `full` | The picture's natural size: 16 of its pixels to a column. |

Either way a picture is never wider than the window: a wide one is narrowed to fit, as before, and keeps its proportions, and one too wide to read even at the `compact` density is shown as text. In `compact` a picture is never denser than that; `full` rounds to the nearest column as it always has, so a picture only a column wide may come out a little denser. The size only sets the box the picture is shown in, so the pictures already rendered are shown again at the new size. Saving the option reloads mermaid-tty, as any option change does, and it renders the pictures again after that. A tiny picture, a column or two wide, may come out a column wider in `compact`, since its columns round up so it is never too dense.

Set it like `theme`, for example `echo '{"size":"full"}' | claude plugin configure mermaid-tty@mermaid-tty --values-stdin`, or while Claude Code runs with `/mermaid-tty size full|compact`. The command redraws the pictures on screen at once and saves the option the same way `/mermaid-tty theme` does; a save that is refused lasts for the session, and the reply says so. `/mermaid-tty size` reports the setting in force. An unset or unknown value is `compact`.

## The /btw cue

While mermaid-tty answers a `/btw`, it shows a cue. The environment variable `MERMAID_TTY_BTW_STATUS` sets where:

| Value | Cue |
|---|---|
| unset, or anything but `file` | A status row under the prompt: `mermaid-tty: answering /btw…`. This is the default. |
| `file` | No row: a marker file a custom status line reads, at `$HOME/.cache/mermaid-tty/btw-<session_id>`. Ignored on Windows, where the row is the cue. |

Set it where Claude Code's status line command inherits it too, such as the `env` block of `settings.json`. The marker's contents, its staleness and the refresh a status line needs are in Side questions in [Usage](Usage).

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
| surface (pictures only) | none | `#3B4252` | `#44475A` | `#3C3836` | `#073642` |

In every palette but `mono`, node and decision pills are filled: a pill's label and fill cells take the role's color as their background, and the "text on a filled pill" color as their text. Its end caps keep the role's color. `mono` fills nothing.

A text drawing doesn't paint a palette's background. It sits on your terminal's own background, and only pills are filled. A picture does paint it (see Pictures below). `scripts/check-palettes.ts` also checks that each surface sits close to its background but visibly apart from it, between 0.03 and 0.2 in OKLab. The background row is the color each curated palette is checked against: `scripts/check-palettes.ts` asserts that every role has a contrast ratio of at least 3:1 against it, and that every pair of roles, and every pair of series colors, is at least 0.08 apart in OKLab. So a curated palette reads best on a terminal background close to its own. `default` and `mono` are exempt from the check.

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

## Pictures

Where the terminal shows pictures (see Pictures in [Usage](Usage)), each one is drawn in the same theme as the text drawings:

- **Curated palettes** (`nord`, `dracula`, `gruvbox`, `solarized`) draw on Mermaid's `base` theme, with every color taken from the palette, on the palette's own background.
  - Flowchart nodes take the series colors `s1` to `s8` in turn, each with its own label color and a darker rim, so a picture shows the whole palette. Other diagrams' nodes and actors are filled in `node`, rimmed in a darker shade of it. Edges, lines and canvas text use `edge`. Notes use `note`, and sequence activations `decision`.
  - Edge labels are chips in the node color. Subgraphs, state groups and gantt bands are filled with the surface and framed in `frame`.
  - Pie, git, journey, timeline, mindmap and chart series cycle through `s1` to `s8`. Journey sections are toned toward the background, so its task text stays readable.
- **`default`** keeps Mermaid's own dark or light theme, following your Claude Code theme, on a transparent background. Its flowchart nodes, pie, git, timeline, mindmap and chart colors are Claude Code's.
- **`mono`** draws no picture.

Mermaid fills a flowchart decision like any other node, and colors a sequence arrowhead like its line, so a picture does too. A sequence `rect` or `box` color written in the diagram is drawn as written.

The flowchart colors come from CSS mermaid-tty writes into the Mermaid config itself: selectors that reach only flowchart nodes, and `#rrggbb` colors. A diagram's own source still can't style anything.

`hooks/picture-theme.ts` builds each look's Mermaid config, and `goldens/pictures/` keeps the reviewed result. Every color it chooses is `#rrggbb`. Every text and line color it chooses has a contrast of at least 3:1 against what it is drawn on, the same floor the text drawings meet. Where a role's own color can't meet that on a fill, such as a title on dracula's surface, the text takes the palette color that reads best. `node scripts/render-picture-gallery.ts OUT_DIR [MMDC]` draws one rich diagram of each type in every look, for review by eye, and flags any picture whose text falls under 3:1.

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
- Sequence notes have dotted end caps `┆ … ┆` in every theme, so they stay distinct from message labels in `mono`.
- The title is bold, and a frame's title sits in its top border.

## Crossing lines

When edges cross in a flowchart, state, class or ER diagram, each edge that crosses another is drawn in a color of its own, arrowhead included. A line can then be followed past the `┼` from its source to its target. Other drawings keep the colors above, and so does every drawing with the `crossings` option `off`.

- **Which cells.** An edge's own lines and its end, an arrowhead or a class marker such as `△` or `◆`, take its color. A cell that several edges draw keeps the `edge` or `arrow` color: the `┼` itself, a trunk where edges from one node merge, and an end edges share. Labels and cardinality, ER and class alike, keep their roles' colors.
- **Which colors.** While colors last, each crossing edge takes a new one, in the order the source lists the edges. When there are more crossing edges than colors, a color comes round again, but never to an edge that crosses or touches one in that color. An edge with no such color left keeps the `edge` color.
- **Palettes.** Each theme has its own line colors. Every one is set apart from the `node`, `label`, `edge` and `arrow` colors, so a colored line still reads as a line, and `scripts/check-palettes.ts` checks them like the roles:

| Theme | Line colors |
|---|---|
| `default` | `merged`, `success`, `ide`, `planMode` |
| `nord` | `#EBCB8B`, `#B48EAD`, `#D08770` |
| `dracula` | `#F1FA8C`, `#BD93F9`, `#FFB86C`, `#FF5555` |
| `gruvbox` | `#FABD2F`, `#D3869B`, `#FE8019` |
| `solarized` | `#B58900`, `#D33682`, `#6C71C4`, `#2AA198` |
| `mono` | none: every line stays colorless |

Only the color changes: the layout, the glyphs and which diagrams draw are the same as before. Pictures in kitty, Ghostty and SonicTerm are Mermaid's own and keep its colors.
