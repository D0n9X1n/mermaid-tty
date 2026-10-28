# mermaid-tty v1 A — tasks T33–T39 (e2e, parity, type check)

**Depends on:** the main plan (§3 platforms, §6, §9 check commands, §10 review record, §13–§14) and A2–A4 (T0–T32). The e2e tasks T33–T37 build on the coordinator's spike recipe (F11) and resolve E1–E7.
**Conventions:** as in A2. Only `scripts/e2e/` imports packages (node-pty, @xterm/headless); its package-using tests are named `*.e2etest.ts`, so neither `node --test` on a fresh clone nor `check.sh` loads them. The stable names plan B depends on are listed in A4's header.

### T33: E2E package and the mock Messages API
**Group** P2 · **Deps** T0 · **Covers** A9.harness (mock and reply), F11, E7
**Files:** create `scripts/e2e/package.json`, `scripts/e2e/package-lock.json`, `scripts/e2e/CLAUDE_VERSION`, `scripts/e2e/reply.ts`, `scripts/e2e/mock.ts`. Test: `tests/scripts/e2e-mock_test.ts` (node built-ins only, so it runs in the main suite).
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { startMock } from '../../scripts/e2e/mock.ts'; import { REPLY, REPLY_LEAD } from '../../scripts/e2e/reply.ts'
const text = (sse: string) => [...sse.matchAll(/"text":"((?:[^"\\]|\\.)*)"/g)].map(m => JSON.parse(`"${m[1]}"`)).join('')
test('A9.harness: the mock streams REPLY to every concurrent POST /v1/messages; other paths 404', async () => {
  const m = await startMock()
  try {
    const post = () => fetch(`${m.url}/v1/messages`, { method: 'POST', body: JSON.stringify({ stream: true, messages: [] }) }).then(r => r.text())
    for (const s of await Promise.all([post(), post()])) { assert.equal(text(s), REPLY); assert.match(s, /event: message_stop/) }
    assert.equal(text(await fetch(`${m.url}/v1/messages`, { method: 'POST', body: JSON.stringify({ stream: true, messages: [{ role: 'user', content: 'lead' }] }) }).then(r => r.text())), REPLY_LEAD)
    assert.equal((await fetch(`${m.url}/v1/other`)).status, 404)
  } finally { await m.stop() }
})
test('A9.harness: REPLY has prose, a CJK flowchart, a sequence, an unsupported diagram and an unclosed fence', () => {
  for (const s of ['读取配置文件', 'sequenceDiagram', 'flowchart-elk TD']) assert.ok(REPLY.includes(s), s)
  assert.match(REPLY, /`{3}mermaid\nflowchart TD\nA --> B\n?$/)
})
```
- [ ] **Run** `node --test tests/scripts/e2e-mock_test.ts` → FAIL: `Cannot find module …/e2e/mock.ts`.
- [ ] **Implement:**
  - **`package.json`:** `{"name":"mermaid-tty-e2e","private":true,"type":"module"}`. In `scripts/e2e/`, run `npm install --save-exact node-pty @xterm/headless` and commit the lockfile. If node-pty's prebuilds fail on a runner (E7), use `@homebridge/node-pty-prebuilt-multiarch`.
  - **`CLAUDE_VERSION`:** `2.1.308`.
  - **`reply.ts`:** `export const REPLY` holds, in order:
    1. The prose `Here is the config flow:`, then a fence holding `flowchart LR`, `A[读取配置文件] -->|成功| B{完成?}` and `B --> C([结束])`.
    2. The prose `And the handshake:`, then a fence holding `sequenceDiagram`, `participant U as User`, `U->>S: ping` and `S-->>U: pong`.
    3. The prose `This one stays source:`, then a fence holding `flowchart-elk TD` and `X --> Y`.
    4. The prose `Unclosed:`, then an unclosed fence holding `flowchart TD` and `A --> B`.
    - `REPLY_LEAD` (D5): a fence holding `flowchart TD` and `S[开始] --> E[结束]`, then the prose `After the diagram.`
  - **`mock.ts`:** `startMock(): Promise<{ url: string; stop(): Promise<void> }>`, listening on `127.0.0.1:0`.
    - Every `POST /v1/messages` (the main turn and the side request, F11) answers REPLY, or REPLY_LEAD when the last user message contains `lead`.
    - With `stream: true` it sends SSE: `message_start`, `content_block_start`, one `content_block_delta` (`text_delta`) per 64 chars, `content_block_stop`, `message_delta` (`stop_reason: end_turn`) and `message_stop`. Otherwise it sends one JSON message.
    - Other paths return 404, and `server.on('connect', (_r, s) => s.destroy())` refuses CONNECT.
- [ ] **Done when:** `node --test tests/scripts/e2e-mock_test.ts` passes and `npm ci --prefix scripts/e2e` installs.
- [ ] **Commit:** `git commit -m "Add the e2e package and the mock Messages API"`

### T34: Session env, PTY driver and screen reader
**Group** P3 · **Deps** T33 · **Covers** A9.harness (driver, screen), E1, E2, E3, E4
**Files:** create `scripts/e2e/env.ts` (no packages), `scripts/e2e/screen.ts`, `scripts/e2e/driver.ts`. Tests: `tests/scripts/e2e-env_test.ts` (main suite) and `scripts/e2e/screen.e2etest.ts` (e2e job only).
- [ ] **Failing tests:**
```ts
// tests/scripts/e2e-env_test.ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { sessionEnv, seedConfig, seedSettings } from '../../scripts/e2e/env.ts'
const E = (o: object) => sessionEnv({ home: '/h', config: '/h/.cfg', mockUrl: 'http://127.0.0.1:9', platform: 'darwin', color: 'truecolor', driver: 'pty', path: '/bin', ...o })
test('A9.harness: a clean session env from the recipe; no inherited secrets', () => {
  const e = E({}); assert.deepEqual([e.HOME, e.CLAUDE_CONFIG_DIR, e.ANTHROPIC_API_KEY, e.ANTHROPIC_BASE_URL, e.COLORTERM, e.DISABLE_AUTOUPDATER, e.TMUX],
    ['/h', '/h/.cfg', 'dummy', 'http://127.0.0.1:9', 'truecolor', '1', undefined])
  assert.equal(E({ color: '256' }).TMUX, 'e2e'); assert.equal(E({ driver: 'tmux' }).CLAUDE_CODE_TMUX_TRUECOLOR, '1')
  assert.equal(E({ driver: 'tmux', color: '256' }).CLAUDE_CODE_TMUX_TRUECOLOR, undefined)
  const c = JSON.parse(seedConfig('/private/tmp/w', 'dummy', 'darwin'))
  assert.deepEqual([c.hasCompletedOnboarding, c.customApiKeyResponses.approved, c.projects['/private/tmp/w'].hasTrustDialogAccepted], [true, ['dummy'], true])
  assert.deepEqual(Object.keys(JSON.parse(seedSettings('nord')).pluginConfigs).sort(), ['mermaid-tty', 'mermaid-tty@inline', 'mermaid-tty@mermaid-tty'])
})
// scripts/e2e/screen.e2etest.ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { createScreen } from './screen.ts'
test('A9.harness: the screen reader keeps truecolor, 256 colors, widths and OSC 52', async () => {
  const s = createScreen(20, 3); await s.write('\x1b[38;2;236;239;244m\x1b[48;2;94;129;172m读a\x1b[0m \x1b[38;5;110mb\x1b[0m\x1b]52;c;aGk=\x07')
  const r = s.cells()[0]!
  assert.deepEqual([r[0]!.ch, r[0]!.width, r[0]!.fg, r[0]!.bg], ['读', 2, { mode: 'rgb', value: 0xeceff4 }, { mode: 'rgb', value: 0x5e81ac }])
  assert.deepEqual([r[2]!.ch, r[4]!.fg], ['a', { mode: 'p256', value: 110 }]); assert.equal(s.clipboard(), 'hi')
})
```
- [ ] **Run** `node --test tests/scripts/e2e-env_test.ts` → FAIL: `Cannot find module …/e2e/env.ts`. Then `npm ci --prefix scripts/e2e && node --test scripts/e2e/screen.e2etest.ts` → FAIL: `Cannot find module …/e2e/screen.ts`.
- [ ] **Implement:**
  - **`sessionEnv`:** builds the env from nothing (F11), with no inherited variables:
    - always: HOME, USER=e2e, PATH, TERM=xterm-256color, `CLAUDE_CONFIG_DIR`, `ANTHROPIC_API_KEY=dummy`, `ANTHROPIC_BASE_URL`, and `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, `DISABLE_TELEMETRY` and `DISABLE_AUTOUPDATER`, each `1`;
    - not on win32: `SHELL=/bin/bash`. Locale: `LANG` and `LC_ALL` are `C.UTF-8` on Linux and `en_US.UTF-8` on macOS;
    - win32: `USERPROFILE`, plus `APPDATA` and `LOCALAPPDATA` under home, and `SystemRoot`, `ComSpec` and `PATHEXT` copied from the parent;
    - by color mode: truecolor sets `COLORTERM=truecolor`, plus `CLAUDE_CODE_TMUX_TRUECOLOR=1` under tmux. 256 omits both, and the pty driver also sets `TMUX=e2e`, which gives the clamp (E3).
  - **Seed files:** `seedConfig(realCwd, key, platform)` is the F11 `.claude.json`, with key `key.trim().slice(-20)`; on win32 it adds the `/`-separated project key (E2). `seedSettings(theme)` writes `settings.json` with `pluginConfigs` under all three keys (E4), each `{ "options": { "theme": … } }`.
  - **`createScreen(cols, rows)`:** wraps `@xterm/headless` `Terminal` (`allowProposedApi`).
    - `write` resolves in the write callback.
    - `cells()` reads `buffer.active` lines as `{ ch, width, fg, bg }`, each color `{ mode: 'default' | 'p16' | 'p256' | 'rgb', value }`. Colors come from the cells, never from the byte stream (ConPTY re-encodes them).
    - `text()` returns the screen text. `clipboard()` returns the decoded OSC 52 payload from `parser.registerOscHandler(52, …)`.
  - **`startSession({ driver, argv, cwd, env })`:** a 100×40 session with `type(text)`, `key('enter' | 'ctrl-o' | 'escape')` (sends `\r`, `\x0f`, `\x1b`), `waitFor(re, ms)`, `cells()`, `text()`, `clipboard()` and `stop()`.
    - **pty:** node-pty `spawn` with `name: 'xterm-256color'` feeds `createScreen`. On win32 it runs the `.cmd` shim through `cmd.exe /d /s /c` (E2).
    - **tmux:** `env -i` with the recipe's variables, then `tmux -L mtty-<pid> -f /dev/null new-session -d -s mtty-e2e -x 100 -y 40`, with `window-size manual` and `default-size 100x40`. Each read feeds `capture-pane -p -e` into a fresh screen. This is the E1 fallback on Linux and macOS.
    - `waitFor` polls every 100 ms; on timeout it throws with the last screen text.
- [ ] **Done when:** `node --test tests/scripts/e2e-env_test.ts` passes, then `npm ci --prefix scripts/e2e && node --test scripts/e2e/screen.e2etest.ts` passes.
- [ ] **Commit:** `git commit -m "Add the e2e session env, PTY and tmux drivers, and the screen reader"`

### T35: E2E scenarios: themes, 256 colors, source view
**Group** P9 · **Deps** T22, T25, T34 · **Covers** A9.harness, A6.in-claude-code, A3 (mono has no color), A7 (on screen), D5 (lead), the runtime proof
**Files:** create `scripts/e2e/assert.ts` (type-only import of `Cell`) and `scripts/e2e/run.ts`. Test: `tests/scripts/e2e-assert_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { checkDiagramScreen } from '../../scripts/e2e/assert.ts'
const D = { mode: 'default', value: 0 }, rgb = (v: number) => ({ mode: 'rgb', value: v }), p256 = (v: number) => ({ mode: 'p256', value: v })
const row = (s: string, fg: object = D, bg: object = D) => [...s].map(ch => ({ ch, width: 1, fg, bg }))
const screen = (pill: object, msg: object) => [row('Here is the config flow:'), row(' 读取配置文件 ', D, pill), row(' ping ', msg)]
const E = { labels: { '读取配置文件': 'node', ping: 'label' }, prose: ['Here is the config flow:'] } as const, HEX = { node: 0x88c0d0, label: 0xa3be8c }
test('A9.harness: labels are checked by role: node background on node labels, role foreground elsewhere, no color under mono', () => {
  assert.deepEqual(checkDiagramScreen(screen(rgb(0x88c0d0), rgb(0xa3be8c)) as never, { ...E, color: 'truecolor', hex: HEX }), [])
  assert.match(checkDiagramScreen(screen(rgb(0x88c0d0), D) as never, { ...E, color: 'truecolor', hex: HEX })[0]!, /ping: expected label foreground/)
  assert.deepEqual(checkDiagramScreen(screen(p256(110), p256(150)) as never, { ...E, color: '256' }), [])
  assert.deepEqual(checkDiagramScreen(screen(D, D) as never, { ...E, color: 'none' }), [])
  assert.match(checkDiagramScreen(screen(rgb(0x88c0d0), D) as never, { ...E, color: 'none' })[0]!, /读取配置文件: expected no color/)
})
```
- [ ] **Run** `node --test tests/scripts/e2e-assert_test.ts` → FAIL: `Cannot find module …/e2e/assert.ts`.
- [ ] **Implement:**
  - **`checkDiagramScreen(cells, { labels, prose, color, hex? })`:** `labels` maps each label to its role. For each label it finds the row whose joined `ch` contains it, mapping each character back to its cell (a W/F cell is followed by an empty one); with none, it reports `<label>: not drawn`. Then it checks the label's own cells:
    - **node and decision labels (pills):** the background is `rgb` (truecolor; equal to `hex[role]` when given) or `p256` (256). Else `<label>: expected <role> background`.
    - **every other label:** the foreground, checked the same way. Else `<label>: expected <role> foreground`.
    - **none (mono, A3):** every cell of the label's row has a `default` fg and bg. Else `<label>: expected no color`.
  - **Prose:** each prose line appears exactly once in the screen text; else `<line>: prose`.
  - **`run.ts` flags:**
    - `--claude-version V`, default `scripts/e2e/CLAUDE_VERSION`.
    - `--installed CONFIG_DIR` (T37).
    - `--theme default|nord|dracula|gruvbox|solarized|mono|all`, default `all`.
    - `--color truecolor|256`; by default, truecolor for each theme plus one 256 run under nord.
    - `--driver pty|tmux`, default `pty`.
    - `--scenario harness|source-view|stored|lead|all`, default `all`.
    - `--keep`.
  - **Each run:**
    1. Install CC once per version: `npm install --prefix <tmpdir>/mtty-cc-<V> @anthropic-ai/claude-code@<V>`; the binary is `node_modules/.bin/claude` (`.cmd` on win32).
    2. Create mkdtemp home, config and cwd (realpath), and start the mock. Write `seedConfig` to `$CONFIG/.claude.json` and `seedSettings(theme)` to `$CONFIG/settings.json`.
    3. `startSession` with `[claude, '--plugin-dir', repoRoot]`. Wait for `❯` (15 s), type `Show the diagrams`, press enter, wait for `Unclosed:` (30 s), then settle 500 ms.
  - **harness:**
    - Run `checkDiagramScreen` with the labels `{ 读取配置文件: 'node', '完成?': 'decision', 结束: 'node', User: 'node', ping: 'label' }` and REPLY's four prose lines.
    - Color mode: `none` for mono, `256` for the 256 run, otherwise `truecolor`. For a curated theme, `hex` holds the palette's role colors as numbers; the default mapping goes through the user's theme, so only the color mode is checked.
    - The screen shows `flowchart-elk TD` and `X --> Y` (unsupported) and `A --> B` (unclosed) as source. It does not show `A[读取配置文件] -->|成功| B{完成?}` (that one is drawn).
  - **source-view:**
    - Type `/mermaid-tty source` and wait for `flowchart LR`. The screen now holds `A[读取配置文件] -->|成功| B{完成?}` and `U->>S: ping`, and no drawn rows.
    - Press ctrl-o: the detailed view shows the same source. Press ctrl-o again.
    - `/mermaid-tty diagram` brings the drawn rows back, on the messages already on screen too.
  - **lead (D5):** type `lead`, press enter and wait for `After the diagram.`. No screen row between the prompt line and the first diagram row may hold only the reply bullet. If one does, the empty prose drew an extra row: T21 drops the empty `next()` (no bullet) and re-pins its hook test (R6).
  - **Report:** one line per run, `PASS|FAIL <os> <theme> <color> <scenario>`, plus the problems; exit 1 on any FAIL. `--keep` keeps the temp dirs, writes `screen.ansi` (the pty stream, or `capture-pane -e`), and prints the tmux attach command.
- [ ] **Done when:**
  - `node --test tests/scripts/e2e-assert_test.ts` passes.
  - `npm ci --prefix scripts/e2e && node scripts/e2e/run.ts` passes on the Mac.
  - `--driver tmux --theme nord --keep` gives the PM's runtime proof (main §14).
- [ ] **Commit:** `git commit -m "Add the e2e scenarios: themes, 256 colors, source view"`

### T36: Stored transcript and `/copy`
**Group** P10 · **Deps** T35 · **Covers** A9.stored, R6 (the stored reply keeps the exact source; `/copy` copies it), E5, E6
**Files:** create `scripts/e2e/stored.ts` (no packages; it imports the pure `hooks/fences.ts`); modify `scripts/e2e/run.ts` (`--scenario stored`). Test: `tests/scripts/e2e-stored_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'
import { findReply, fenceBody, clipboardStubs } from '../../scripts/e2e/stored.ts'; import { REPLY } from '../../scripts/e2e/reply.ts'
const line = (text: string) => JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } })
test('A9.stored: the transcript holds the reply byte for byte; /copy gets the exact fence body', () => {
  assert.equal(findReply([line('hi'), line(REPLY)].join('\n'), REPLY), true); assert.equal(findReply(line(REPLY.replace('读取', '读')), REPLY), false)
  assert.equal(fenceBody(REPLY), 'flowchart LR\nA[读取配置文件] -->|成功| B{完成?}\nB --> C([结束])')
  assert.deepEqual(Object.keys(clipboardStubs('linux', '/t/c.txt')).sort(), ['wl-copy', 'xclip', 'xsel'])
  assert.deepEqual([Object.keys(clipboardStubs('darwin', '/t/c.txt')), Object.keys(clipboardStubs('win32', 'C:\\t\\c.txt'))], [['pbcopy'], ['clip.cmd']])
})
```
- [ ] **Run** `node --test tests/scripts/e2e-stored_test.ts` → FAIL: `Cannot find module …/e2e/stored.ts`.
- [ ] **Implement:**
  - **`stored.ts`:**
    - `findReply(jsonl, reply)` is true when some line parses with `message.content` whose text blocks, joined, equal `reply` exactly.
    - `fenceBody(reply)` is the body of the first closed mermaid fence (`splitFences`).
    - `clipboardStubs(platform, out)` returns `{ name: script }`. POSIX stubs are `#!/bin/sh\ncat > '<out>'\n`: `pbcopy` on darwin, and `wl-copy`, `xclip` and `xsel` on linux. On win32, `clip.cmd` is `@powershell -NoProfile -Command "[Console]::In.ReadToEnd() | Set-Content -NoNewline -Encoding utf8 '<out>'"`.
  - **`run.ts --scenario stored`:**
    1. Write the stubs, executable, to `<tmp>/bin`, first on the session PATH.
    2. After the harness reply, require `findReply` over every `$CLAUDE_CONFIG_DIR/projects/**/*.jsonl`.
    3. Type `/copy` and press enter. If a code-block picker appears, choose the entry showing `flowchart LR` (E6).
    4. Within 5 s, the stub's file or the OSC 52 payload (`clipboard()`) must equal `fenceBody(REPLY)`, with one trailing newline allowed.
    5. Print `stored: ran on <os> via <stub|osc52>`, or `stored: not run on <os>: <reason>` when that OS's clipboard command cannot be stubbed (E5).
- [ ] **Done when:** the test passes and `node scripts/e2e/run.ts --scenario stored` passes on the Mac.
- [ ] **Commit:** `git commit -m "Check the stored transcript and /copy in e2e"`

### T37: The installed copy
**Group** P11 · **Deps** T36 · **Covers** A9.release, R4. B owns per-version selection (`scripts/lib/cc-versions.ts`) and runs `run.ts --claude-version V` for each new version.
**Files:** modify `scripts/e2e/env.ts` (`mergeJson`) and `scripts/e2e/run.ts` (`--installed CONFIG_DIR`). Test: append to `tests/scripts/e2e-env_test.ts`.
- [ ] **Failing test:**
```ts
// tests/scripts/e2e-env_test.ts: add mergeJson to the env.ts import
test('A9.release: seeding an installed config adds keys and never drops one', () => {
  const m = JSON.parse(mergeJson('{"theme":"dark","pluginConfigs":{"x":{"options":{}}}}', seedSettings('nord')))
  assert.equal(m.theme, 'dark'); assert.ok(m.pluginConfigs.x && m.pluginConfigs['mermaid-tty'])
})
```
- [ ] **Run** `node --test tests/scripts/e2e-env_test.ts` → FAIL: `does not provide an export named 'mergeJson'`.
- [ ] **Implement:** `mergeJson(existing, seed)` deep-merges objects: the seed wins on a scalar clash, and no existing key is dropped. `run.ts --installed CONFIG_DIR` uses that dir as `CLAUDE_CONFIG_DIR`. B's release.yml has already run `claude plugin marketplace add D0n9X1n/mermaid-tty` and `claude plugin install mermaid-tty@mermaid-tty` there. It merges `seedConfig` into `.claude.json` and `seedSettings(theme)` into `settings.json`, then starts the session without `--plugin-dir`.
- [ ] **Done when:** the test passes, and in B's release job `node scripts/e2e/run.ts --installed "$CLAUDE_CONFIG_DIR"` passes.
- [ ] **Commit:** `git commit -m "Run e2e against the installed copy"`

### T38: Check-ID parity and a green gate
**Group** P12 · **Deps** every task · **Covers** B7 binding (§9), the 48 check IDs, the must-pass gate
**Files:** modify `scripts/check.ts`, only when a row is missing. Never edit the acceptance doc.
- [ ] **Failing test:** `node scripts/check-ids.ts` against the amended acceptance doc → FAIL, listing `missing:` or `extra:` IDs until every A and VR ID has its §9 row.
- [ ] **Implement:**
  - Add or rename `CHECKS` rows until `diffIds` is empty. A owns 31 of the 48 IDs (B2's `IDS48`); B checks the other 17 with `check-ci-coverage.ts` against `ci/coverage.json`.
  - A doc ID with no test behind it is reported to the coordinator as a new task; it is never stubbed.
- [ ] **Done when:** `node scripts/check-ids.ts` exits 0, and `bash scripts/check.sh` exits 0 on the Mac once the PM has recorded the VR verdict. Until then only `VR.reviewers` and `VR.passes` fail (`--require-pass`, the merge gate). B's CI runs the same `check.sh` on ubuntu, macos and windows.
- [ ] **Commit:** `git commit -m "Close check-ID parity; check.sh green"`

### T39: CI type check (PM decision D2)
**Group** P2 · **Deps** T0 · **Covers** PM decision D2 (a CI step; no acceptance ID)
**Files:** create `scripts/typecheck.ts`, `scripts/TS_VERSION`. Test: `tests/scripts/typecheck_test.ts`.
- [ ] **Failing test:**
```ts
import test from 'node:test'; import assert from 'node:assert/strict'; import { tsconfigFor } from '../../scripts/typecheck.ts'
test('typecheck (no check ID): core alone; hooks only when the engine types exist', () => {
  const c = tsconfigFor('/r', false), h = tsconfigFor('/r', true)
  assert.deepEqual(c.include, ['/r/core/**/*.ts']); assert.equal(c.compilerOptions.erasableSyntaxOnly, true)
  assert.deepEqual(h.include, ['/r/core/**/*.ts', '/r/hooks/**/*.ts', '/r/hooks/**/*.tsx', '/r/types/**/*.d.ts'])
  assert.deepEqual(h.compilerOptions.typeRoots, ['/r/.claude-plugin/types'])
})
```
- [ ] **Run** `node --test tests/scripts/typecheck_test.ts` → FAIL: `Cannot find module …/scripts/typecheck.ts`.
- [ ] **Implement:**
  - **`tsconfigFor(root, hooks)`:** `compilerOptions` is `{ target: 'es2023', lib: ['es2023'], module: 'esnext', moduleResolution: 'bundler', strict: true, noUncheckedIndexedAccess: true, noEmit: true, skipLibCheck: true, allowImportingTsExtensions: true, verbatimModuleSyntax: true, erasableSyntaxOnly: true, types: [] }`. With `hooks` it adds `jsx: 'react'`, `jsxFactory: 'h'`, `jsxFragmentFactory: 'Fragment'`, `typeRoots: [<root>/.claude-plugin/types]` and `types: ['claude-code']`. `include` lists absolute, `/`-separated globs.
  - **CLI:** `hooks = existsSync('.claude-plugin/types/claude-code')`. It writes the config to `<mkdtempSync(join(tmpdir(), 'mtty-tsc-'))>/tsconfig.json`, runs `npx --yes -p typescript@<TS_VERSION> tsc -p <that file>` with `cwd` = that dir (`shell: true` on win32), exits with its status, and removes the dir in `finally`. Nothing is installed in the repo.
  - **`TS_VERSION`:** the exact version `npm view typescript version` prints when the task runs (≥ 5.8, for `erasableSyntaxOnly`). Bumps are deliberate.
- [ ] **Done when:** the test passes, and `node scripts/typecheck.ts` exits 0 on the Mac with and without `.claude-plugin/types/`. B binds a CI step to it (main §9).
- [ ] **Commit:** `git commit -m "Add the pinned-TypeScript CI type check"`
