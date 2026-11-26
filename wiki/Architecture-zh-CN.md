# 架构

[英文版](Architecture)

mermaid-tty 分为两部分。`core/` 是渲染器：不依赖宿主、无依赖的 TypeScript，将 Mermaid 源码转换为带颜色的文本行，或返回回退原因。`hooks/` 是 Claude Code mod：找到回复中的图表，请 `core/` 绘制，其余内容仍交给 Claude Code。

## 流水线

```mermaid
flowchart TD
  A[回复文本] --> B[splitFences 拆分围栏]
  B -->|正文| P[Claude Code 显示]
  B -->|已闭合的 mermaid 块| C[readSource 读取源码]
  C --> D[lookup 查找类型] --> E[parse 解析]
  subgraph G[fitLadder 逐级尝试]
    L[layout 布局] --> R[route 布线] --> W[draw 绘制] --> V{validate 校验}
  end
  E --> L
  V -->|拒绝并尝试下一步| L
  V -->|通过| T[toRows 生成文本行] --> H[钩子显示文本行]
  C -->|失败| F[原样保留代码块]
  D -->|失败| F
  E -->|失败| F
  G -->|所有步骤均未通过| F
```

1. **围栏。** `splitFences`（`hooks/fences.ts`）按已闭合的 `mermaid` 代码块拆分回复。各片段重新拼接后与原回复完全相同，正文仍交给 Claude Code。
2. **源码。** `readSource`（`core/source.ts`）统一换行符和 HTML 属性引号，读取 frontmatter 标题和配置的严格子集，检查指令和词法敏感空白，移除空行及 `%%` 注释行。它返回首行、带类型的配置标量，以及保留源码行号的正文行。随后 `explain` 检查标题的文本规则。
3. **查找。** `lookup`（`core/registry.ts`）取首行第一个词，去掉末尾的 `:`，返回对应类型的模块；否则返回 `unknown-type`、`fallback:<keyword>`、`disabled:<type>` 或 `unregistered:<type>`。
4. **解析。** 类型模块将各行解析为模型。任何语句无法完整读取，整个代码块就会失败。
5. **逐级适配。** `fitLadder`（`core/fit.ts`）按顺序执行该类型的步骤。每一步按终端宽度布局并绘图；流程图依次执行布局、布线和绘制。`validate` 检查结果，第一个通过的绘图胜出；`validate` 先检查行宽，所以超出终端宽度的步骤在更耗时的检查之前就被拒绝。全部失败时，返回第一个与宽度无关的原因（宽度原因为 `too-wide`、`row-too-wide` 和 `word-too-wide`），使调试日志说明是什么让一个宽度合适的绘图没能显示；只有宽度失败时，返回最后一步的原因。只有所有步骤都失败后，图类型（流程图、状态图、类图、ER 图）才会按相同顺序、在相同检查下，用其 `rescue` 布局把各步骤再执行一遍，并采用它画出的第一个绘图。整个补救轮在所有步骤、换行宽度、间隔和搜索之间共享 `RESCUE_WORK`（50,000）次路径搜索扩展，用完即停止，因此补救也画不出的图只多花有限的工作量就会回退。这一轮仍画不出时，第二轮补救以同样方式运行，使用自己的 `RESCUE_WORK`，并开启拆线重布：搜索布线器把上次卡住的边放到最前，重新布线。补救也画不出时，仍返回各步骤的原因。由于补救最后才运行，步骤能找到的绘图永远不会改变。
6. **文本行。** `toRows`（`core/render.ts`）按主题配色，将绘图转换为由带样式片段组成的文本行。
7. **钩子。** `ui.render` 将每行显示为 Claude Code 的 `Text`，使用 `wrap="truncate-end"`，放在前后正文之间。

阶段接口返回包含简短原因的 `Fail`。部分解析器内部用 `stop()` 抛出 `Fail`，再在公开接口边界捕获。源码和解析失败会终止当前代码块；布局失败则进入下一适配步骤。`explain`（`core/render.ts`）将越过这些边界的意外异常转换为 `internal-error`。

## 模块

**渲染器 `core/`。** 同时支持 Claude Code 加载器和 Node 类型剥离，无需构建。

| 文件 | 职责 |
|---|---|
| `render.ts` | 入口：`explain`、`renderMermaid`、`toRows`，以及供钩子使用的缓存渲染器 `createRenderer`。 |
| `source.ts` | `readSource`：读取代码块首行、frontmatter 标题和正文行。 |
| `registry.ts` | 首行关键字与类型映射、`ENABLED`、`register` 和 `lookup`。 |
| `fit.ts` | `fitLadder`：逐步尝试，直到 `validate` 接受绘图；全部失败时，再对每一步尝试类型的 `rescue` 布局。 |
| `validate.ts` | 校验器：布局到屏幕之间的保守校验关卡。 |
| `canvas.ts` | 单元格网格：字形、角色、所有者、写入策略及冲突记录。 |
| `glyphs.ts` | `GLYPHS` 字形允许列表，以及按单元格连接方向选择制表符号。 |
| `box-table.ts` | 由 `scripts/gen-box-table.ts` 生成，按连接方向列出 80 个轻重线条制表符号。 |
| `width.ts` | 统一宽度函数 `width` 和字符检查函数 `unsupported`。 |
| `width-table.ts` | 由 `scripts/gen-width-table.ts` 生成的东亚宽字符与全角字符范围。 |
| `text.ts` | `drawable` 执行各字段的实体、HTML、Markdown、图标、公式和换行规则；`labelLines` 拆分支持的换行；`wrap` 将行折为片段。 |
| `caps.ts` | 节点形状的端帽，以及 `@{ shape: … }` 名称。 |
| `themes.ts` | 六种主题中各角色和系列的颜色。 |
| `color.ts` | 供 `scripts/check-palettes.ts` 使用的 WCAG 对比度与 OKLab 距离。 |
| `lru.ts` | 最近最少使用缓存。 |
| `fail.ts` | 统一的回退结果 `Fail`。 |

**图布局 `core/graph/`。** 流程图、状态图、类图和 ER 图共享的逐级适配、分层布局与布线器。

| 文件 | 职责 |
|---|---|
| `model.ts` | 图模型：节点、边和簇，仅包含类型。 |
| `layered.ts` | 将图放在单元格网格上的分层布局，每个簇使用一个边框。它把每条回边的折点和标签移入其通道，标签靠近连线起点，除非两者之间隔着边框；只有在不挤占其他框、也不越过边框时，才把标签或折点移向连线端点。 |
| `place.ts` | 单层放置：层级和链、条带间隔、排序，再计算横轴和主轴。 |
| `ranks.ts` | 打破环，并按最长路径确定各单元的层级。 |
| `chains.ts` | 层内元素：对应层级的单元、带标签连线中途的标签节点，以及跨层连线在其他层上的虚拟节点。 |
| `clusters.ts` | 簇树，以及没有连线穿过边界的封闭簇。 |
| `strips.ts` | 簇条带及防止其他元素进入的间隔。 |
| `order.ts` | 层内重心扫描排序，选择交叉最少的结果。 |
| `nest.ts` | 同层排序，保持各条带内元素相邻。 |
| `sides.ts` | `keepSides`：条带边框在其跨越的层上是一堵墙，因此每条连线在框外的标签、折点和可移动的端点都留在同一侧：条带包含一个端点时，留在外侧端点所在的一侧；否则，共享节点的一组连线留在多数元素所在的一侧。在外侧通道中绘制的回边，其端点留在通道一侧。 |
| `cross.ts` | 横轴位置：紧凑排列各层，再向中位位置靠拢。 |
| `main-axis.ts` | 主轴位置：各层占用的带状区域及层间间隔。分支同时进入和绕过条带时，紧邻条带之前的标签或折点通向条带内时，或前一层的连线从条带上方经过或出发时，在条带起始边框外预留两个单元格供转弯和箭头直线段使用；进入条带的通道仍留在框内。条带最后一层上的自环会在边框前获得转弯空间。 |
| `sizes.ts` | 节点框尺寸：最宽标签片段、内边距和端帽。 |
| `gaps.ts` | 读取层间间隔，供布线器使用。 |
| `route.ts` | 布线器入口：决定哪些回边走外侧通道，其余连线先交给通道布线器，再交给搜索布线器。共享端点的回边无法通过外侧通道布线时，或在补救中外侧通道被端点旁的节点挡住时，使用有预算限制的通用搜索尝试其他连接槽位，同时保留标签和途经点。从下到上或从右到左的布局若都无法布线，就翻转后布线（`mirror.ts`）。 |
| `channels.ts` | 通道布线器，最先尝试：每条连线沿层间间隔前进，并在该间隔中属于自己的轨道上横向转弯。任何冲突都会把整张图交给搜索布线器。 |
| `search.ts` | 搜索布线器：逐条连线使用共享预算的加权曼哈顿搜索（`find-path.ts`），经过其标签和折点。它在其他每个框周围留出一格空隙，为每个箭头保留其所在面前方的一行作为直线段，不让连线进入不包含其任何端点的边框，并让只包含一个端点的边框只被穿过一次：路径的每一段都留在该边框的同一侧。补救中，每次路径搜索还会消耗补救轮共享的工作量；第一条耗尽预算的边会获得一次补充，并重新尝试它的起点槽位。每个槽位平分剩余预算，这份额度限制该槽位运行的每一次路径搜索，使一个连不到任何终点的槽位不会耗光其他槽位所需的预算。一次搜索最多花费两倍预算。在第二轮补救中，它最多重新布线四次，每次把卡住的边放到最前。 |
| `lanes.ts` | 外侧通道布线器：带标签或折点的回边，在已放置的路径之外，绘制在本层所有内容之外的通道中。 |
| `mirror.ts` | 将从下到上或从右到左的布局翻转为从上到下或从左到右，并把路径翻转回来。 |
| `route-base.ts` | 各布线器共用的部分：路径、墙、围栏、标签墨迹和穿越边框检查。 |
| `compact.ts` | 去掉绘图中的冗余：只包含 `│` 的连续行和只包含 `─` 的连续列会被缩短。 |
| `find-path.ts` | 各布线器共用的网格路径搜索：在单元格和方向上进行加权曼哈顿搜索。 |
| `draw.ts` | 将放置和布线后的节点、边框、路径与标签画到画布上。 |
| `ladder.ts` | 共享 `natural`、`tight`、`wrap`、有条件的 `lrToTd` 和 `keyed` 步骤，并增大间隔重试布线。开启补救的 `drawAt` 在每次尝试中都打开路由器的补救，它就是图类型的 `rescue` 布局。 |
| `members.ts` | 带所有者 id 和固定换行的类成员行与 ER 属性列。 |
| `notes.ts` | 侧边注释，或横向图中由虚线连接的独立注释节点。 |

**图表组件 `core/charts/`。** `decimal.ts` 进行精确有理数运算；`scale.ts` 将数值映射到单元格；`bars.ts` 绘制八分之一单元格精度的条形；`axis.ts` 绘制刻度；`sheet.ts` 叠放标题和绘图；`legend.ts` 将短键绑定到完整文本。

**图表类型 `core/diagrams/`。** 每种类型有自己的目录，如 `core/diagrams/flowchart/` 和 `core/diagrams/sequence/`。`parse.ts` 将代码块读成模型，`layout.ts` 定义适配步骤及各步布局。导入 `layout.ts` 时会注册模块。`core/render.ts` 直接导入流程图和时序图，再通过 `core/diagrams/all.ts` 加载其余十一种类型；13 种全部启用。

**钩子 `hooks/`。** Claude Code mod 的接入部分。

| 文件 | 职责 |
|---|---|
| `hooks.json` | 加载 `register.tsx`。 |
| `register.tsx` | 注册 `/mermaid-tty` 命令、接管 `/btw` 的钩子和 `ui.render` 钩子，将模式保存在 `$.state` 中。 |
| `fences.ts` | `splitFences`：拆分回复正文和已闭合的 `mermaid` 代码块。 |
| `mode.ts` | 决定何时原样传递回复，以及解析命令参数和生成反馈。 |
| `btw.ts` | 决定 mermaid-tty 何时回答 `/btw`（`takesBtw`）、分叉收到的旁支提问提示（`forkPrompt`）、所存回答的结构，以及回答期间的提示：状态行文字（`BTW_STATUS`）、标记文件路径（`markerPath`），以及何时使用标记（`usesMarker`、`isWindows`）。 |
| `btw-history.ts` | 无可分叉时旁支提问自己的请求：它的系统提示（`SIDE_SYSTEM`）、以 JSON 放在 `<conversation_history>` 中的对话及其后的问题（`historyPrompt`，保留最新的轮次，最多 `HISTORY_CHARS`，每个工具调用截短到 `TOOL_CHARS`），以及达到 `ANSWER_TOKENS` 而被截断的回答所附的说明（`answerText`）。没有对话时，使用它自己的系统提示（`QUESTION_SYSTEM`），只发送问题本身（`questionPrompt`）。 |

`types/mermaid-tty.d.ts` 声明插件状态：`mermaid-tty.source`，取值为 `true`、`'text'` 或未设置；`mermaid-tty.images`，取值为 `'auto'`、`'on'` 或 `'off'`；以及其他状态，例如 `mermaid-tty.btw`，即最新的 `/btw` 问题和回答。

## 校验与回退

`validate`（`core/validate.ts`）是布局到屏幕之间的保守校验关卡。每个布局通过 `Expect` 声明绘图必须包含什么，按所有者 id 识别，必要时指定精确位置。校验内容包括：

1. **标签只出现一次。** 每个非空标签在空白归一化后必须与其所有者的文本一致，且只出现一次；空标签不绘制文字。不同所有者可使用相同文字（`label-missing`、`label-dup`）。
2. **连线与箭头。** 每条边连接自己的端点。端点标记的字形和位置正确；方向箭头指向节点而非分叉处（`edge-disconnected`、`end-misplaced`、`head-extra`、`head-on-junction`）。
3. **连线不误导。** 不允许悬空线段、有歧义的交叉，或暗示不存在连接的合并主干。线条字形必须匹配记录的连接方向和粗细，且每条边的线条单元格都按该边自身的线型绘制（实线、粗线或虚线；不可见的边不绘制任何单元格）（`line-dangling`、`crossing-ambiguous`、`line-glyph`、`merge-ambiguous`）。
4. **无覆盖且宽度正确。** 画布不能有冲突，输出的每行都不超出指定列数（`overwrite`、`row-too-wide`）。
5. **标签与边框。** 连线标签必须靠近自身路径；边框保持闭合；同一框内节点之间的边不得越出边框；连线只有在边框恰好包含其一端时才穿过该边框，且只穿过一次。端点标签必须无歧义地指向自己的连线端点（`label-not-adjacent`、`frame-broken`、`edge-outside-frame`、`edge-crosses-frame`、`end-label`）。
6. **图表与成员结构。** 条形的八分之一单元格长度和位置必须正确。类成员及 ER 属性列属于自己的节点框，并位于声明的行列。短键在原位及自身图例文字旁各出现一次；同类可替换项要么全部用短键，要么都不用。
7. **有意义的位置。** 事件顺序、语义字形及位置、坐标轴和类别标签、行标签、侧边注释、生命线和节点框内的文字都必须保持与正确对象绑定。仅仅保留文字还不够。

完整原因分组见[用法](Usage-zh-CN)中的“绘图会产生误导”。包括 `tests/core/validate_mutation_fuzz_test.ts` 在内的变异模糊测试，会在不改变预期声明的前提下修改真实测试样例的绘图，要求校验器拒绝产生误导的变异。这些测试随 `node --test` 在三个操作系统的 CI 中运行。

`fitLadder` 还会拒绝声明列数与实际输入不同的绘图（`columns-mismatch`）。最终得到 `Fail` 时，钩子会将原始代码块原样保留在周围正文中，并写入调试日志 `mermaid-tty fallback: <reason>`；界面上不额外显示错误。

**字形允许列表。** 除源码文字外，绘制字形均来自 `core/glyphs.ts` 的 `GLYPHS`：可打印 ASCII、制表符号区块（U+2500 至 U+257F）、`►◄▲▼◇●◉`、条形字形 `▏▎▍▌▋▊▉█▁▂▃▄▅▆▇` 和图表标记 `✓▸◆·■○△□▷◁▽«»⊗◎↑↓`。其中非 ASCII 字形均无 Unicode `Emoji` 属性，以免被终端显示为宽表情。水平箭头使用 `►` 和 `◄`，而非 `▶` 和 `◀`。测试固定允许列表，并检查渲染器输出。

## 宽度

`width`（`core/width.ts`）是唯一的宽度函数，逐码点累加列数：

- 东亚宽字符或全角字符计 2 列，通过二分查找 `core/width-table.ts` 判断；
- 组合标记（Mn、Me）及零宽字符 U+200B、U+200C、U+2060、U+FEFF 计 0 列；
- 其余字符计 1 列，包括制表符号等东亚宽度不明确的字符。

`scripts/gen-width-table.ts` 从仓库中的 Unicode 16.0.0 文件 `scripts/data/EastAsianWidth-16.0.0.txt` 生成表格；测试固定该数据文件的 SHA-256。

`unsupported` 返回第一个在不同终端上宽度可能不同的码点：零宽连接符、变体选择符、区域指示符、表情修饰符、控制字符，以及受支持零宽字符以外的格式字符。`readSource` 检查 frontmatter 标题，各类型解析器检查自己要显示的文字。独立的 `drawable` 规则还会拒绝 Mermaid 会变换的文字，而不只是宽度不确定的文字。

所有测量都经过 `width`：

- 节点框尺寸取决于最宽标签片段（`core/graph/sizes.ts`）。
- `wrap`（`core/text.ts`）只在空格或相邻的两个宽字符之间断行，不拆分拉丁字母词。
- 画布上的宽字符占两个单元格，第二个为 `cont`，由 `toRows` 跳过。
- 校验器按 `toRows` 的实际输出方式测量每行。

因此，只要终端遵循东亚宽度表，并将宽度不明确的字符显示为一列，通过校验的行就与测量宽度一致。

## 钩子与缓存

`hooks/hooks.json` 加载 `hooks/register.tsx`，后者注册以下钩子：

- **`session.start`** 注册 `/mermaid-tty` 命令，并将图片设置从 `$.store` 复制到 `$.state` 的 `mermaid-tty.images`；未设置、无法识别或读取失败时为 `auto`。它还将 `mermaid-tty.theme` 设为配置的主题、`mermaid-tty.direction` 设为配置的方向，使每次加载都从已保存的选项开始。若会话中的某次加载发现已设置了另一个方向（例如在 `/config` 中修改后），会用 `$.session.append` 为模型追加一条说明。它开始时不带 `/btw` 提示：清除状态行；当 `$.fs.exists` 发现本会话的标记时将其清空，无论 `MERMAID_TTY_BTW_STATUS` 如何设置。
- **`session.end`** 在提示显示的位置撤下 `/btw` 提示。`/clear` 会结束对话，并以新的会话 id 继续，但不会触发 `session.start`，因此它不会留下提示。在终端会话中，它随后删除图片临时目录。
- **`command.run`** 解析命令参数，将模式存为 `$.state` 中的 `mermaid-tty.source`，并使 `ui.render` 失效，让已显示的回复按新模式重绘。`images auto|on|off` 将设置写入 `$.state` 和 `$.store`，使其在之后的会话中同样有效，并以同样方式使 `ui.render` 失效；存储失败时仍在本次会话中生效，并在回复中说明。`theme <name>` 写入 `mermaid-tty.theme`，使 `ui.render` 失效，并通过 `$.config.set` 将名称保存到插件自己的 `theme` 行；保存被拒绝或失败时仍在本次会话中生效，并在回复中说明。`direction <LR|TB|off>` 以同样方式处理 `mermaid-tty.direction` 和 `direction` 行，并追加一条用户消息告知模型，因为对话的系统提示词保持首次发送时的内容。对保存被拒绝的主题或方向再次发出同一请求时，会重试保存；对说明被拒绝的方向，会重试说明。
- **`command.run`** 处理 `btw`：在终端会话中、非源码模式下回答旁支问题。它以问题加一段简短的旁支提问前言（`hooks/btw.ts`）等待 `$.model.fork`，分叉基于本会话自己的对话运行，所有工具都被拒绝。分叉返回 `nothing-to-fork` 时，例如刚恢复的会话或第一轮尚未完成的会话，主线程没有可共享的请求，钩子改为调用 `$.model.complete`：使用 `$.session.model()`、`SIDE_SYSTEM`，以及基于 `$.session.messages()` 的 `historyPrompt`（这些消息是从上一次压缩开始的对话），并传入 `next.signal`，因此 Esc 可以中止它。对话中没有可发送的内容（既无文字也无工具调用）时，改用 `QUESTION_SYSTEM` 和 `questionPrompt`，只发送问题本身。会话刚启动、Claude Code 尚未加载插件钩子时发出的 `/btw` 不会到达此钩子，由 Claude Code 自己回答。有回答时，将 `{ question, text }` 保存为 `mermaid-tty.btw`，用 `$.ui.open` 打开 `btw` 窗格（获得焦点，按 Esc 关闭），并返回 `{}`，因此不会有输出行或上下文进入对话。模块内的计数器会丢弃在更新的 `/btw` 之后才到达的回答。其他情况都通过 `next(e)` 把命令交给 Claude Code：没有问题、源码模式、不在终端、分叉或补全抛错或没有回答，以及窗格未被放置（窗格会再次关闭）。被取消的分叉或补全返回 `{}`。在它接手的最新 `/btw` 回答期间，它会显示提示：`$.ui.status(BTW_STATUS)`；在设置了 `MERMAID_TTY_BTW_STATUS=file` 且不在 Windows 上时，改为用 `$.fs.write` 向 `markerPath($HOME, 会话 id)` 写入 `1`，写入失败则改为显示状态行。提示的状态保存在模块中（`Cues`）：它所代表的 `/btw` 的编号、显示位置，以及它的写入。这些写入由 `syncCue` 逐个执行，每次都显示或隐藏提示，直到与最新的 `/btw` 一致。把命令交出去的 `/btw` 会先撤下提示；离开的 `/btw` 只有在提示仍代表它时才会撤下提示。由于引擎不能删除文件，标记会被清空而不是删除。状态行是尽力而为的。mermaid-tty 按提示所需的顺序发出状态行调用，且不等待其中任何一次，因此某个钩子永远不放行的调用不会拖住任何 `/btw`。`$.ui.status` 会在其下的钩子运行之前返回，也不告知它们何时应用调用，因此另一个插件的钩子若扣住其中一次调用，可能在更晚的调用之后才应用它，状态行就可能在不该显示时显示，或在该显示时消失。每个 `/btw` 结束时以及每次 `session.end` 时，只要没有 `/btw` 正在回答，就会再清除一次状态行。没有这类钩子时，状态行与提示一致，端到端测试在真实屏幕上验证了这一点。标记没有这一限制：每次写入都会在下一次之前完成，因此状态栏按顺序读到它。`session.end` 同时撤下提示并删除图片临时目录，因此较慢的标记写入不会占用留给图片清理的时间。
- **`ui.render`** 处理请求 id 为 `btw` 的 `Pane`，在终端上绘制所存的回答：先是变暗的问题，再以窗格正文宽度像回复一样规划回答（`safePlan`），绘出的代码块显示为行或图片，正文显示为 `Markdown`。没有绘出任何图、规划失败或处于源码模式时，整个回答作为一个 `Markdown` 显示。在其他界面或没有所存回答时，调用 `next(e)`。
- **`prompt.compose`** 在引擎各节之后、缓存边界的会话一侧添加 `mermaid-tty:flowchart-direction` 一节，要求 Claude 编写的流程图以 `flowchart LR` 或 `flowchart TB` 开头。方向为 `off` 或会话不在终端绘图时不添加；出错时原样返回引擎的各节。
- **`ui.render`** 处理 `AssistantMessage`。视口未提供宽度、界面不是终端、处于源码模式或消息标记为展开时，回复原样传递。否则，钩子拆分回复，渲染每个 `mermaid` 块，将回退块拼回周围正文。若没有绘出任何图，整个回复原样交给 Claude Code；否则返回由正文与图表行组成的纵向布局，正文仍由 Claude Code 显示。回复以图表开头时，先交给 Claude Code 一个空块，以保留回复前的项目符号。

绘图使用的主题是 `mermaid-tty.theme`，在绘制时读取，因此修改后立即重绘。未设置时使用插件的 `theme` 选项；该选项未设置或无法识别时使用 `nord`。

**缓存。** 钩子创建一个带 64 条容量 LRU 缓存的渲染器，以代码块正文、终端列数和主题为键：

- 未命中时渲染并保存文本行或 `Fail`。
- 命中时返回缓存结果，并将条目标记为最近使用。
- 加入第 65 条时，淘汰最近最少使用的条目。
- `Fail` 只在未命中时记录原因，因此在条目仍被缓存期间只记录一次。
- 列数不是正的安全整数时，在进入缓存前返回 `bad-columns`，确保键能精确表示输入。
