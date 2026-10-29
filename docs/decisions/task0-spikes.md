# Task 0 spikes

Observed on 2026-10-28 on macOS with Claude Code 2.1.308 and Node v26.12.1, while building the T0 scaffold. Probes marked throwaway were run once and deleted before the commit.

## S2: does bare `node --test` include `*_test.ts`?

- **Outcome:** yes so far. This closes on the first CI run on Node 24.
- **Node 24 docs** (`api/test.html`, default patterns): "Unless `--no-strip-types` is supplied, the following additional patterns are also matched", and that list includes `**/*_test.{cts,mts,ts}`.
- **Local probe (throwaway):** an `s2probe_test.ts` at the repo root ran under bare `node --test` (`tests 1`, `pass 1`, exit 0). `tests/hooks/loader.test.tsx` did not run, because no default pattern matches `.tsx`.
- **Naming:** kit tests stay `*.test.tsx`. A kit test named `*.test.ts` would also match bare `node --test` and fail there on `claude-code/testing`.
- **Fallback, if CI disagrees:** `check.ts` passes explicit file lists.

## S4: the `@{ shape }` names that flowchart.md documents

- **Source:** `docs/syntax/flowchart.md` at mermaid-js/mermaid `1fb7869866dd619168d840291c9c54b4f129758b`, in the table "Complete List of New Shapes". The local mermaid 12.2.0 source dump has neither flowchart.md nor `shapes.ts`, so the list comes from the pinned file.
- **Size:** 53 rows, although the prose above the table says "30 new shapes". That gives 140 distinct names: 53 short names and 87 other aliases.
- **Cross-check:** every `shape:` name in the doc's examples is in the table. The ten that are not short names (`comment`, `das`, `diamond`, `framed-circle`, `manual-file`, `manual-input`, `paper-tape`, `processes`, `procs`, `subproc`) are in its alias column.
- **For T4:** a name missing from the alias list draws rectangle caps. A miss changes the caps, never the correctness.

The rows follow the doc's order, which is by semantic name. The doc lists a few short names among their own aliases.

| Short name | Shape | Aliases |
| --- | --- | --- |
| `bang` | Bang | `bang` |
| `browser` | Browser | |
| `bucket` | Bucket | |
| `notch-rect` | Notched Rectangle | `card`, `notched-rectangle` |
| `cloud` | Cloud | `cloud` |
| `hourglass` | Hourglass | `collate`, `hourglass` |
| `bolt` | Lightning Bolt | `com-link`, `lightning-bolt` |
| `brace` | Curly Brace | `brace-l`, `comment` |
| `brace-r` | Curly Brace | |
| `braces` | Curly Braces | |
| `console` | Console (terminal window) | |
| `lean-r` | Lean Right | `in-out`, `lean-right` |
| `lean-l` | Lean Left | `lean-left`, `out-in` |
| `datastore` | Data Store | `data-store` |
| `cyl` | Cylinder | `cylinder`, `database`, `db` |
| `diam` | Diamond | `decision`, `diamond`, `question` |
| `delay` | Half-Rounded Rectangle | `half-rounded-rectangle` |
| `h-cyl` | Horizontal Cylinder | `das`, `horizontal-cylinder` |
| `lin-cyl` | Lined Cylinder | `disk`, `lined-cylinder` |
| `curv-trap` | Curved Trapezoid | `curved-trapezoid`, `display` |
| `div-rect` | Divided Rectangle | `div-proc`, `divided-process`, `divided-rectangle` |
| `doc` | Document | `doc`, `document` |
| `rounded` | Rounded Rectangle | `event` |
| `tri` | Triangle | `extract`, `triangle` |
| `folder` | Folder | `directory` |
| `fork` | Filled Rectangle | `join` |
| `win-pane` | Window Pane | `internal-storage`, `window-pane` |
| `f-circ` | Filled Circle | `filled-circle`, `junction` |
| `lin-doc` | Lined Document | `lined-document` |
| `lin-rect` | Lined Rectangle | `lin-proc`, `lined-process`, `lined-rectangle`, `shaded-process` |
| `notch-pent` | Trapezoidal Pentagon | `loop-limit`, `notched-pentagon` |
| `flip-tri` | Flipped Triangle | `flipped-triangle`, `manual-file` |
| `sl-rect` | Sloped Rectangle | `manual-input`, `sloped-rectangle` |
| `trap-t` | Trapezoid Base Top | `inv-trapezoid`, `manual`, `trapezoid-top` |
| `docs` | Stacked Document | `documents`, `st-doc`, `stacked-document` |
| `st-rect` | Stacked Rectangle | `processes`, `procs`, `stacked-rectangle` |
| `odd` | Odd | |
| `flag` | Flag | `paper-tape` |
| `person` | Person | |
| `hex` | Hexagon | `hexagon`, `prepare` |
| `trap-b` | Trapezoid Base Bottom | `priority`, `trapezoid`, `trapezoid-bottom` |
| `rect` | Rectangle | `proc`, `process`, `rectangle` |
| `circle` | Circle | `circ` |
| `sm-circ` | Small Circle | `small-circle`, `start` |
| `dbl-circ` | Double Circle | `double-circle` |
| `fr-circ` | Framed Circle | `framed-circle`, `stop` |
| `bow-rect` | Bow Tie Rectangle | `bow-tie-rectangle`, `stored-data` |
| `fr-rect` | Framed Rectangle | `framed-rectangle`, `subproc`, `subprocess`, `subroutine` |
| `cross-circ` | Crossed Circle | `crossed-circle`, `summary` |
| `tag-doc` | Tagged Document | `tag-doc`, `tagged-document` |
| `tag-rect` | Tagged Rectangle | `tag-proc`, `tagged-process`, `tagged-rectangle` |
| `stadium` | Stadium | `pill`, `terminal` |
| `text` | Text Block | |

## S6: does the engine accept the hyphenated `$.state` key?

- **Outcome:** yes, so the primary path holds. `PluginState['mermaid-tty']` and `SOURCE = { plugin: 'mermaid-tty', key: 'source' }` stay. The `mermaidTty` fallback is not needed.
- **Get and set:** `tests/hooks/loader.test.tsx` reads `probe:false:false` before `/mermaid-tty source` and `probe:false:true` after it. So `$.state.set(SOURCE, true)` was accepted, and `$.state.get(SOURCE)` read the value back.
- **Validate:** `claude plugin validate .` reports `types ./types/mermaid-tty.d.ts declares state: mermaid-tty.source`. For `./register.tsx` it reports `state writes: mermaid-tty.source` and `state reads: mermaid-tty.source`.
- **Not covered:** the kit answers `$.state` from memory beneath the plugins, so a real session's store first meets the key in A9's run. No `tsc` was on PATH, so the contract's type check waits for T39.

## S7: does a kit test's `$.command.run` reach the registered command?

- **Outcome:** the primary path holds, with a caveat. `$.command.run({ command: 'mermaid-tty', args })` reaches the mod's `command.run` hook, and `loader.test.tsx` relies on that. The fallback is not needed; it would have the test set the state itself and test the handler in `mode_test.ts`.
- **Caveat:** reaching the hook does not show that `session.start` registered the command. Throwaway probes showed four things:
  - The kit does not raise `session.start` when a test starts. The test's own `on('session.start', …)` had not fired by the end of the test.
  - `$.command.run` reaches a hook even for a name that nobody registered. An inline plugin's `command.run` hook on `mtty-unreg` answered `{"text":"answered"}`.
  - A name that no hook answers rejects with `no implementation for command.run`. That comes from the bottom of the chain, not from a registry check.
  - The test's `$.command` has `run` and `describe`, but no `list`.
- **Testing registration in the kit:** the test answers `session.start` and `command.register` beneath the plugins, then raises `session.start` itself. This probe resolved `{"cwd":"/"}` and recorded `{"name":"mermaid-tty","description":"Show mermaid diagrams as drawings or as their source"}`. Without the `command.register` hook, the engine skips the mod's `session.start` hook with `mermaid-tty: no implementation for command.register`.

  ```tsx
  test('…', async ($, on) => {
    const registered: string[] = []
    on('session.start', async (_$, e) => ({ cwd: e.cwd }))
    on('command.register', async (_$, e) => { registered.push(JSON.stringify(e)); return { value: { command: e.name } } })
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  })
  ```

- **When `args` is left out:** `$.command.run({ command })` hands the hook `e.args === undefined`, not `""`. An inline hook echoed `args=undefined`, and `args=""` when given `args: ''`. When a run that no hook answers left `args` out, it rejected with `mermaid-tty: next() passed an argument with no { args } (a string)` instead of `no implementation for command.run`. So kit tests pass `args` explicitly, using `args: ''` for a bare `/mermaid-tty`.
- **In a real session,** the evidence for registration is the F10 spike and A9's run. `claude plugin validate .` also lists `$.command.register` among the module's calls.
