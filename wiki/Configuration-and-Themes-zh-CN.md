# 配置与主题

[英文版](Configuration-and-Themes)

mermaid-tty 只有一个选项 `theme`，用于选择所有图表的颜色。本页列出可选值、各配色的颜色，以及主题着色的角色。

## theme 选项

该选项在 `.claude-plugin/plugin.json` 中定义为 `userConfig.theme`，可选值如下：

| 值 | 配色 |
|---|---|
| `default` | 跟随 Claude Code 主题：每个角色映射到一个 Claude Code 主题键。这是默认值。 |
| `nord` | 使用 Nord 配色。 |
| `dracula` | 使用 Dracula 配色。 |
| `gruvbox` | 使用 Gruvbox 配色。 |
| `solarized` | 使用 Solarized 配色。 |
| `mono` | 不使用颜色，靠端帽和字形区分角色。 |

在命令行中，将 JSON 对象通过管道传给 `claude plugin configure`：

```sh
echo '{"theme":"nord"}' | claude plugin configure mermaid-tty@mermaid-tty --values-stdin
```

使用 `--values-stdin` 时，未提供的选项保留原值。在 Claude Code 中，也可以用 `/plugin configure mermaid-tty@mermaid-tty` 设置。

不带 `--values-stdin` 可查看选项及其设置状态；加上 `--json` 可获得便于程序处理的输出：

```sh
claude plugin configure mermaid-tty@mermaid-tty
claude plugin configure mermaid-tty@mermaid-tty --json
```

mermaid-tty 只在加载时读取一次配置，因此修改后需要重启 Claude Code。未设置或未知的值都使用 `default`。

## 配色

`default` 将角色映射到 Claude Code 主题键，让图表跟随界面主题。四种精选配色使用各项目的官方十六进制颜色；`mono` 完全不使用颜色。

| 角色 | `default` | `nord` | `dracula` | `gruvbox` | `solarized` |
|---|---|---|---|---|---|
| 节点 `node` | `suggestion` | `#88C0D0` | `#8BE9FD` | `#83A598` | `#268BD2` |
| 判断 `decision` | `warning` | `#EBCB8B` | `#F1FA8C` | `#FABD2F` | `#B58900` |
| 连线 `edge` | `inactive` | `#D8DEE9` | `#F8F8F2` | `#928374` | `#93A1A1` |
| 箭头 `arrow` | `claude` | `#BF616A` | `#FF79C6` | `#FB4934` | `#CB4B16` |
| 标签 `label` | `text` | `#A3BE8C` | `#50FA7B` | `#B8BB26` | `#EEE8D5` |
| 边框 `frame` | `permission` | `#B48EAD` | `#BD93F9` | `#D3869B` | `#D33682` |
| 注释 `note` | `subtle` | `#5E81AC` | `#FFB86C` | `#FE8019` | `#2AA198` |
| 标题 `title` | `text` | `#D08770` | `#FF5555` | `#EBDBB2` | `#6C71C4` |
| 数值 `value` | `success` | `#81A1C1` | `#6272A4` | `#458588` | `#859900` |
| 填充节点框内的文字 | `inverseText` | `#2E3440` | `#282A36` | `#282828` | `#FDF6E3` |
| 背景 | 无 | `#2E3440` | `#282A36` | `#282828` | `#002B36` |
| 次背景（仅图片） | 无 | `#3B4252` | `#44475A` | `#3C3836` | `#073642` |

除 `mono` 外，节点框和判断框都带填充：标签及填充单元格使用角色颜色作为背景，文字使用“填充节点框内的文字”颜色。端帽仍使用角色颜色。`mono` 不填充背景。

文本绘图不会铺满配色中的背景色：它显示在终端自身的背景上，只有节点框带填充。图片则会铺满背景色（见下文“图片”）。`scripts/check-palettes.ts` 还检查每个次背景与背景足够接近又能看出区别，OKLab 距离在 0.03 到 0.2 之间。表中的背景色是各精选配色的校验基准：`scripts/check-palettes.ts` 要求每个角色与该背景的对比度至少为 3:1，任意两个角色颜色、任意两个系列颜色的 OKLab 距离至少为 0.08。因此，终端背景接近该配色背景时效果最好。`default` 和 `mono` 不参与此项检查。

泳道、分支、分区和数据系列等使用 `s1` 至 `s8`，按源码顺序循环取色：

| 系列 | `default` | `nord` | `dracula` | `gruvbox` | `solarized` |
|---|---|---|---|---|---|
| 系列 `s1` | `suggestion` | `#88C0D0` | `#8BE9FD` | `#83A598` | `#268BD2` |
| 系列 `s2` | `success` | `#A3BE8C` | `#50FA7B` | `#B8BB26` | `#859900` |
| 系列 `s3` | `warning` | `#EBCB8B` | `#F1FA8C` | `#FABD2F` | `#B58900` |
| 系列 `s4` | `error` | `#D08770` | `#FFB86C` | `#FE8019` | `#CB4B16` |
| 系列 `s5` | `merged` | `#B48EAD` | `#FF79C6` | `#FB4934` | `#93A1A1` |
| 系列 `s6` | `claude` | `#81A1C1` | `#BD93F9` | `#D3869B` | `#D33682` |
| 系列 `s7` | `permission` | `#BF616A` | `#FF5555` | `#458588` | `#6C71C4` |
| 系列 `s8` | `planMode` | `#5E81AC` | `#6272A4` | `#928374` | `#2AA198` |

## 图片

在能显示图片的终端里（见[使用](Usage-zh-CN)中的“图片”），每张图片都使用与文本绘图相同的主题：

- **精选配色**（`nord`、`dracula`、`gruvbox`、`solarized`）基于 Mermaid 的 `base` 主题绘制，每种颜色都取自配色，并铺满配色自己的背景。
  - 流程图节点依次使用系列颜色 `s1` 到 `s8`，每个节点有各自的文字颜色和更深的边框，使图片呈现整套配色。其他图表的节点和参与者用 `node` 填充，边框为其更深的色调。连线、线条和画布上的文字用 `edge`。注释用 `note`，时序图的激活条用 `decision`。
  - 连线标签是节点颜色的小块。子图、状态组和甘特图分段用次背景填充，用 `frame` 描边。
  - 饼图、git、旅程图、时间线、思维导图和图表系列依次使用 `s1` 到 `s8`。旅程图的分段颜色向背景色调和，使任务文字保持清晰。
- **`default`** 沿用 Mermaid 自身的深色或浅色主题，跟随你的 Claude Code 主题，背景透明。流程图节点、饼图、git、时间线、思维导图和图表使用 Claude Code 的颜色。
- **`mono`** 不绘制图片。

Mermaid 给流程图的判断节点和其他节点相同的填充色，时序图的箭头颜色与其连线相同，图片也一样。图表中写明的时序图 `rect` 或 `box` 颜色按原样绘制。

流程图的颜色来自 mermaid-tty 写入 Mermaid 配置本身的 CSS：只作用于流程图节点的选择器和 `#rrggbb` 颜色。图表源码本身仍不能设置任何样式。

`hooks/picture-theme.ts` 为每种外观生成 Mermaid 配置，`goldens/pictures/` 保存审阅过的结果。它选择的每种颜色都是 `#rrggbb`。它选择的每种文字和线条颜色，与其所在底色的对比度都至少为 3:1，与文本绘图的下限相同。若某个角色的颜色在某种填充上达不到这一要求（例如 dracula 次背景上的标题），文字改用配色中最清晰的颜色。`node scripts/render-picture-gallery.ts OUT_DIR [MMDC]` 在每种外观下各绘制一张内容丰富的各类图表，供人工审阅，并标出文字对比度低于 3:1 的图片。

## 角色

图表绘制的每个单元格都有角色，主题按角色着色。七个角色覆盖图的主要部分：

| 角色 | 着色对象 |
|---|---|
| `node` | 节点框及其端帽：流程图节点、时序图参与者。 |
| `decision` | 判断框：流程图中以 `{text}` 表示的菱形。 |
| `edge` | 连线：流程图的边、时序图的消息线。 |
| `arrow` | 连线端点：箭头 `►`、`◄`、`▲`、`▼`，圆端 `o`，叉端 `x`，以及时序图异步消息端点 `)`。 |
| `label` | 连线标签和消息标签。 |
| `frame` | 边框及标题：子图，时序图的 `alt`、`opt`、`loop`、`par`、`critical`、`break` 块，以及参与者分组框。 |
| `note` | 时序图注释、`rect` 块及生命线。 |

另外两个角色用于图外文字：

- `title`：图表标题，在所有主题中都加粗。
- `value`：显示的数值，例如甘特图任务的时间信息。

按系列着色的元素使用 `s1` 至 `s8`，而不是上述角色。详见前面的“配色”。

**单色主题。** `mono` 没有颜色，也不填充节点框，仅靠绘图本身区分角色：

- 各节点形状使用独有的端帽，与 Mermaid 的括号相呼应：`[ … ]` 矩形、`( … )` 圆角、`([ … ])` 体育场形、`[[ … ]]` 子程序、`[( … )]` 圆柱、`(( … ))` 圆形、`{ … }` 判断、`{{ … }}` 六边形、`/ … /` 和 `\ … \` 平行四边形、`/ … \` 和 `\ … /` 梯形，以及 `> … ]` 非对称形。端帽组合各不相同，所有主题都会绘制。
- 线条粗细和虚实表示连线类型：普通实线使用 `─`、`│`，粗线使用 `━`、`┃`，虚线使用 `┄`、`┆`。
- 端点靠字形而非颜色区分：`►`、`◄`、`▲`、`▼` 指向连接的节点，`o` 表示圆端，`x` 表示叉端。
- 时序图注释在所有主题中都有点线端帽 `┆ … ┆`，在 `mono` 下也能与消息标签区分。
- 标题加粗，边框标题位于上边框内。
