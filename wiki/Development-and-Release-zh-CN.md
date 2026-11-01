# 开发与发布

[英文版](Development-and-Release)

本页介绍仓库结构、提交拉取请求前的检查、CI、README 图片与图标的生成、百科发布，以及版本发布流程。

## 仓库

仓库根目录也是插件根目录：`.claude-plugin/marketplace.json` 中的市场条目使用 `source: "./"`。

| 路径 | 内容 |
|---|---|
| `.claude-plugin/` | 定义 `theme` 选项的 `plugin.json`，以及 `marketplace.json` 和 `icon.png`。 |
| `core/` | 不依赖宿主、无依赖的 TypeScript 渲染器，详见[架构](Architecture-zh-CN)。 |
| `hooks/` | Claude Code mod：`hooks.json`、`register.tsx` 及辅助模块。 |
| `types/` | 插件状态类型。 |
| `tests/` | 名为 `*_test.ts` 的 Node 测试，以及由 `claude plugin test .` 运行的 `*.test.tsx` mods kit 测试。 |
| `fixtures/` | 测试和脚本使用的 Mermaid 源码样例。 |
| `scripts/` | 检查、生成器、端到端测试框架及文档工具。 |
| `assets/` | `icon.svg` 和 README 图片。 |
| `ci/` | `coverage.json` 把每个检查 ID 对应到 CI 步骤。评审记录在各自的 PR 中，不放进仓库。 |
| `CLAUDE.md` | 给编程智能体的工作规则：工作流程、发布、文档、代码风格和测试。 |
| `wiki/` | 本百科的源文件，也是唯一的文档。仓库中没有 `docs/` 目录，一旦出现，`check-docs` 会失败。 |
| `.github/workflows/` | CI、百科发布和版本发布工作流。 |

没有构建步骤，也没有运行时依赖。根目录 `package.json` 无依赖，Claude Code 和 Node 24 或更高版本直接运行 TypeScript。只有文档工具（`scripts/docs/`）和端到端框架（`scripts/e2e/`）需要安装包，分别使用自己的锁文件。

`scripts/check-portable.ts` 确保 `core/` 和 `hooks/` 可以在没有 Node 和 DOM 的引擎模块沙箱内运行。除仅类型的 `claude-code` 导入外，导入路径必须是相对的 `.ts` 或 `.tsx`。扫描器拒绝字面量和注释之外的 `process`、`Buffer`、`document`、`window`、`globalThis`、`Reflect`、`require`、`eval`、`Function`、`constructor`、动态 `import()` 和 Unicode 转义。`package.json` 出现 `dependencies` 键也会导致检查失败。

无需安装即可试用当前检出版本：在仓库根目录加载一次会话：

```sh
claude --plugin-dir .
```

如果通过 `claude plugin marketplace add ./` 将检出目录添加为本地插件市场，Claude Code 会从该目录读取插件。修改在下次会话开始或执行 `/reload-plugins` 后生效。

## 本地检查

提交拉取请求前运行：

```sh
bash scripts/check.sh
npm ci --prefix scripts/e2e
node scripts/e2e/run.ts
node scripts/render-gallery.ts
node scripts/check-ci-coverage.ts
```

- `bash scripts/check.sh` 是必须通过的检查入口，使用 `set -euo pipefail`。依次运行 `claude plugin validate .`、`claude plugin test .`（mods kit 测试）及 `node scripts/check.ts all`：所有 `tests/**/*_test.ts`，再执行可移植性、性能上限、全新克隆、语料、图库、连线纠缠、配色检查。它不发现 `scripts/tests/` 或文档测试；CI 会单独运行。
- `npm ci --prefix scripts/e2e` 安装端到端框架的固定版本依赖。`node scripts/e2e/run.ts` 在伪终端中运行真实 Claude Code，连接模拟 Messages API，不需要账号或密钥。
- `node scripts/render-gallery.ts` 将每种图表类型的所有非拒绝类样例（`fixtures/` 下除 `corpus` 外的每个目录）按 60、80 列及 `nord` 主题生成 SVG，并为每种类型生成 CJK 合辑，另有六主题合辑，供视觉评审。
- `node scripts/check-ci-coverage.ts` 在验收检查没有对应 CI 步骤时失败。

需要更快的开发反馈时，可选用以下命令：

| 命令 | 用途 |
|---|---|
| `node --test` | 运行自动发现的全部 Node 测试，包括 `scripts/tests/*_test.ts`，无需安装依赖；文档测试使用单独命令。 |
| `node scripts/typecheck.ts` | 使用固定版本 TypeScript 检查 `core/`；存在生成的 Claude Code 类型时也检查钩子。使用 npx 缓存，不是构建步骤。 |
| `node --test 'scripts/tests/*.docs-spec.ts'` | 安装 `scripts/docs` 依赖后运行文档工具测试。 |
| `node scripts/check.ts <ID>` | 运行一个验收检查的步骤，例如 `A4` 或 `A8.portability`。 |
| `node scripts/explain.ts FILE COLS` | 查看 `FILE` 中图表按 `COLS` 列适配的步骤及结果，或回退原因。 |
| `node scripts/smoke.ts` | 用 `nord` 主题按 80 列绘制一个流程图样例。 |
| `npm ci --prefix scripts/docs` | 安装文档检查使用的固定版本 Markdown 和 YAML 解析器。 |
| `node scripts/check-docs.ts` | 检查 README 及图片、百科工作流和图标。 |
| `node scripts/check-wiki.ts` | 检查百科页面，详见下方“百科”。 |

## 代码风格

代码要写给下一位读者看。风格遵循 copilot-relay 的规则和主流 TypeScript 指南（Google、Airbnb、StandardJS）：一种统一的风格，由工具格式化，不靠人工争论。

```sh
npm ci --prefix scripts/style
node scripts/style/run.ts --write
node scripts/style/run.ts
```

- `npm ci --prefix scripts/style` 安装 Prettier 3.6.2，版本固定在独立的 lockfile 中；根目录不依赖它。
- `node scripts/style/run.ts --write` 负责格式化：先运行 Prettier，再用 `scripts/style/layout.ts` 处理 Prettier 不管的部分（多行代码块后空一行、注释在 120 列处换行），最后再运行一次 Prettier。
- `node scripts/style/run.ts` 负责检查：`prettier --check`、`scripts/style/check-style.ts` 及检查器自身的测试。CI 在 Linux、macOS 和 Windows 上运行它。

Prettier（`.prettierrc.json`）使用单引号、不加分号、两个空格缩进、120 列和尾随逗号。`.prettierignore` 排除生成的表格、golden 文件、样例以及所有非 TypeScript 文件。

`check-style.ts` 用 Prettier 自带的 TypeScript 解析器解析每个文件，检查 Prettier 不负责的规则：

| 规则 | 最接近的 ESLint 规则 |
|---|---|
| 每个 `if`、`else`、`for`、`while` 和 `do` 的主体都用花括号包起来；只有 `else if` 例外 | `curly: all` |
| 使用 `===` 和 `!==`；只有同时匹配 `null` 和 `undefined` 时才用 `== null` | `eqeqeq`，忽略 null |
| 三元表达式中不再嵌套三元表达式 | `no-nested-ternary` |
| 每个 `const` 或 `let` 只声明一个变量；循环头除外 | `one-var: never` |
| 每个多行代码块语句之后空一行 | `padding-line-between-statements` |
| 连续空行最多一行，注释中也一样 | `no-multiple-empty-lines` |
| 每行不超过 120 列，除非是字符串、模板、正则或 URL 越过了限制 | `max-len` |
| 每个文件不超过 1000 行 | `max-lines` |
| 注释和测试名中不出现 issue 或 PR 编号，任何字符串中不出现 issue 或 PR 链接 | 本项目规则 |

对于 Python 发布脚本，`scripts/style/check_py.py` 用 Python 的分词器读取每个文件，要求一行一条语句、不写单行复合语句，并适用同样的行宽、文件长度和编号限制。发布说明的测试把真实 issue 编号当作数据，因此不受编号规则约束。

需要评审、不由工具检查的规则：注释说明原因（所对应的 Mermaid 行为、所依赖的终端事实、所维持的不变量），不复述下一行代码；代码只描述当前如何工作，不讲历史；命名说明值是什么；用卫语句代替深层嵌套；测试分开准备、执行和断言三个步骤。只改格式的提交与改逻辑的提交分开，方便评审者确认行为不变。

## 持续集成

`.github/workflows/ci.yml` 在每次 push 和 pull request 时运行。`check` 和 `e2e` 使用 `ubuntu-latest`、`macos-latest`、`windows-latest`，配置 Node 24，并从 npm 安装 Claude Code 2.1.308。

- **check** 在三个系统上运行：代码风格检查（`node scripts/style/run.ts`）、裸 `node --test`、类型检查、文档工具测试、百科发布测试、本地市场安装测试、`scripts/check.sh` 和文档检查。安装测试在全新配置中添加本地市场并安装 `mermaid-tty@mermaid-tty`，然后核验版本。在 Linux 上还会运行发布说明测试（Python，使用真实的 Git 历史和模拟的 `gh`）。
- **e2e** 在三个系统上运行真实 Claude Code 框架，使用 `--scenario all`，覆盖源码视图、存储文本、包括 `mono` 的主题和 256 色输出。Windows 使用 ConPTY，macOS 和 Linux 使用 tmux。
- **gallery** 仅在 Ubuntu 上运行：渲染 SVG 图库并上传为构建产物，供视觉评审。
- **claude-code-versions** 每四小时运行一次：针对每个新发布的 Claude Code 版本运行 A9 端到端框架，新版本一旦破坏插件，几小时内即可发现。

所有运行 `.sh` 脚本的步骤都使用 `shell: bash`，在 Windows 上即 Git Bash；脚本使用 `set -euo pipefail`。任一命令失败都会使作业失败，包括 Windows 原生的 `claude plugin validate .` 和 `claude plugin test .`。Actions 均固定到提交 SHA。

`.github/workflows/release.yml` 在 `v*` 标签上运行发布检查，详见下方“发布”。

## 发布说明

`scripts/release-notes.py` 根据一次发布所交付的 issue 和 pull request 生成发布说明，因此仓库中不保存变更日志。其溯源代码 `scripts/release-issues.py` 及其测试来自 SonicTerm，经 copilot-relay 引入（MIT 许可，见 `scripts/LICENSE-SonicTerm`）。

- **范围：** 从上一个 `v*` 标签到本标签；上一个标签由 `git describe --match 'v*'` 在本标签的父提交上查找。需要完整历史，浅克隆会失败。
- **已解决的 issue：** 若范围内的提交，或合并提交位于范围内的已合并 PR 关闭了某个 issue（通过提交中的 `Fixes #N` 或 PR 的关闭引用），该 issue 即被列出。在范围期间被手动关闭的 issue 单独列出，并标为未经核实。
- **Pull request：** 列出合并提交位于范围内的每个已合并 PR，标题为 `mermaid-tty v<version>` 的发布 PR 除外。
- **回滚：** 标准的 `This reverts commit <sha>` 会抵消其目标提交；再回滚该回滚则恢复目标。含有被回滚提交的 PR 不会列出，它关闭的 issue 也不会列出。
- **失败：** 任何 Git 或 GitHub 错误、标签与 `plugin.json` 不符，或找不到上一个标签时，脚本不输出任何内容并以 1 退出，因此发布会中止，而不会发布不完整的说明。

## 图片与图标

README 图表是 `scripts/render-svg.ts` 从 `core/` 渲染的 SVG，而不是截图。“before” 图片显示原始 Mermaid 源码。影响图片的修改完成后，重新生成：

```sh
node scripts/render-svg.ts --readme
```

`scripts/lib/images.ts` 是图片清单，记录各图的 Mermaid 源码、宽度和主题。它包括前后对比图、时序图、CJK 图，以及每个主题各一张图。SVG 中每个字形都有独立的 `<text>`，横坐标为 `x = column × cell width`，因此 CJK 对齐不依赖查看者的字体。如果 README 缺少清单中的图片、引用不存在的图片，或 `assets/readme/` 中有清单未列出的 SVG，`scripts/check-docs.ts` 会失败。

其中 `picture.svg` 展示图片模式：首页那条回复，其 fence 显示为 Mermaid 自己的图片。它的 PNG `assets/readme/src/preview.png` 由 mermaid-cli 按插件自己的参数生成，因此重新生成前，先在 PATH 上装好 `mmdc` 11 或 12，再运行：

```sh
node scripts/render-picture.ts
```

插件图标 `.claude-plugin/icon.png` 由 `assets/icon.svg` 生成：

```sh
bash scripts/make-icon.sh
```

该脚本在 Mac 上运行，需要 `librsvg` 提供的 `rsvg-convert` 和 `sips`。脚本检查 PNG 为 512×512 且小于 2 MB；`scripts/check-docs.ts` 还会读取 PNG 文件头再次核验。

## 百科

本仓库的 `wiki/` 是 GitHub 百科唯一的内容来源。请在这里通过拉取请求修改；直接在 GitHub 百科上修改的内容会在下次发布时被覆盖。

```mermaid
flowchart LR
  E[在拉取请求中编辑百科页面] --> M[合并到 main]
  M --> W[publish-wiki.yml 工作流]
  W --> S[publish-wiki.sh 脚本]
  S --> G[GitHub 百科]
```

`.github/workflows/publish-wiki.yml` 在每次推送到 `main` 或触发 `workflow_dispatch` 时运行。它克隆百科仓库，执行 `scripts/publish-wiki.sh wiki wiki-repo "$GITHUB_SHA"`：删除百科顶层 Markdown 页面，复制 `wiki/*.md`，仅在内容变化时提交。工作流仅在产生提交时推送。默认令牌权限只读，只有发布作业获得写权限。

`scripts/test-wiki-publish.sh` 在临时 Git 仓库中测试首次发布、无变化发布、重命名和旧页面删除；还会对有效百科样例及其损坏副本运行检查器。

`node scripts/check-wiki.ts` 检查以下规则：

- Home、Usage、Configuration-and-Themes、Architecture、Development-and-Release 均有英文 `<Page>.md` 和简体中文 `<Page>-zh-CN.md`。同一对页面的标题层级及顺序一致。
- 每页以一级标题开头，空一行后放唯一的语言对应链接：英文页使用 `[Chinese (Simplified)](<Page>-zh-CN)`，中文页使用 `[英文版](<Page>)`。除此之外不得有跨语言链接。
- 英文页在代码之外不含 CJK；中文页中包含字母的每个标题、段落和表格行都必须含 CJK。
- 不允许 HTML 或图片，用 `mermaid` 代码块绘图。链接目标为页面名，如 `[Usage](Usage)`，或允许的 `https://` 主机：`github.com`、`mermaid.js.org`、`docs.anthropic.com`。
- 用法页须涵盖 Windows、macOS、Linux、`/mermaid-tty source`、`/mermaid-tty diagram` 和 `/copy`；本页须展示所有本地检查命令。

## 发布

1. 确认 `main` 在三个系统上的 CI 均通过，`.claude-plugin/plugin.json` 的 `version` 与待发布版本一致，且 `bash scripts/check.sh` 通过。
2. 不要手写发布说明：标签工作流会自动生成。每项改动都通过 PR 合并，PR 标题要适合放进列表，提交正文为它解决的每个 issue 写上 `Fixes #N`。发布 PR 的标题为 `mermaid-tty v<version>`，只更新版本号，不会出现在说明中。可用 `python3 scripts/release-notes.py v<version>` 预览某个标签的说明（设置 `PREVIOUS_TAG` 可与另一个标签比较）。

3. **先发布百科。** 等待待打标签的那个 `main` 提交完成 `publish-wiki`，并确认发布的页面。GitHub 只有在网页界面保存第一个百科页面后才创建百科仓库；若克隆失败，先保存一页，再重跑工作流。
4. 在该提交上推送等于 `v` 加插件版本的标签，如 `v1.0.0`。不要手动创建 GitHub Release，标签工作流会创建。
5. `.github/workflows/release.yml` 检查标签，生成发布说明并检查它，要求该 SHA 的百科发布成功，并比较已发布百科与 `wiki/`。全部通过后才创建 GitHub Release，再检查发布后的说明。
6. 工作流从 GitHub 插件市场安装到全新配置，核验列出的版本，再针对该副本运行 A9，使用 `--installed`、`--claude-version 2.1.308` 和 `--scenario all`。Release 已发布不代表最后的验证一定通过。

不要使用 `claude plugin tag` 创建发布标签：它生成 `mermaid-tty--v1.0.0` 这样的名称，不以 `v` 开头，因此不会触发 `release.yml`。
