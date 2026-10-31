// The e2e session's env recipe and seed files. The e2e harness runs a real Claude Code in that env, against the mock
// Messages API. Node built-ins only, so the main suite runs this with nothing installed.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeJson, sessionEnv, seedConfig, seedSettings } from '../../scripts/e2e/env.ts'

const E = (o: object) =>
  sessionEnv({
    home: '/h',
    config: '/h/.cfg',
    mockUrl: 'http://127.0.0.1:9',
    platform: 'darwin',
    color: 'truecolor',
    driver: 'pty',
    path: '/bin',
    ...o,
  })
test('A9.harness: a clean session env from the recipe; no inherited secrets', () => {
  const e = E({})
  assert.deepEqual(
    [
      e.HOME,
      e.CLAUDE_CONFIG_DIR,
      e.ANTHROPIC_API_KEY,
      e.ANTHROPIC_BASE_URL,
      e.COLORTERM,
      e.DISABLE_AUTOUPDATER,
      e.TMUX,
    ],
    ['/h', '/h/.cfg', 'dummy', 'http://127.0.0.1:9', 'truecolor', '1', undefined],
  )
  assert.equal(E({ color: '256' }).TMUX, 'e2e')
  assert.equal(E({ driver: 'tmux' }).CLAUDE_CODE_TMUX_TRUECOLOR, '1')
  assert.equal(E({ driver: 'tmux', color: '256' }).CLAUDE_CODE_TMUX_TRUECOLOR, undefined)
  const c = JSON.parse(seedConfig('/private/tmp/w', 'dummy', 'darwin'))
  assert.deepEqual(
    [c.hasCompletedOnboarding, c.customApiKeyResponses.approved, c.projects['/private/tmp/w'].hasTrustDialogAccepted],
    [true, ['dummy'], true],
  )
  assert.deepEqual(Object.keys(JSON.parse(seedSettings('nord')).pluginConfigs).sort(), [
    'mermaid-tty',
    'mermaid-tty@inline',
    'mermaid-tty@mermaid-tty',
  ])
})

// Variables a developer's or a CI runner's shell may hold. A session inherits none of them: the sessionEnv tests below
// set them on this process while they build their envs, so that an env built from process.env, rather than from
// nothing, fails.
const PARENT: Record<string, string> = {
  HOME: '/parent-home',
  USER: 'parent-user',
  SHELL: '/bin/parent-sh',
  TERM: 'parent-term',
  LANG: 'parent-lang',
  LC_ALL: 'parent-lc',
  TMUX: 'parent-tmux',
  COLORTERM: 'parent-colorterm',
  CLAUDE_CODE_TMUX_TRUECOLOR: 'parent-truecolor',
  CLAUDE_CONFIG_DIR: '/parent-config',
  ANTHROPIC_API_KEY: 'parent-key',
  ANTHROPIC_AUTH_TOKEN: 'parent-token',
  ANTHROPIC_BASE_URL: 'https://parent.example',
  ANTHROPIC_MODEL: 'parent-model',
  USERPROFILE: 'C:\\parent',
  APPDATA: 'C:\\parent\\AppData',
  MTTY_PARENT_CANARY: 'parent',
}
// f's result, computed with vars set on process.env, each undefined one deleted; process.env is restored after.
function withParent<T>(vars: Record<string, string | undefined>, f: () => T): T {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]))
  const put = (v: Record<string, string | undefined>) => {
    for (const [k, x] of Object.entries(v)) {
      if (x === undefined) {
        delete process.env[k]
      } else {
        process.env[k] = x
      }
    }
  }
  put(vars)
  try {
    return f()
  } finally {
    put(saved)
  }
}

// Every Linux and macOS session's variables, before its locale and its color keys.
const UNIX = {
  HOME: '/h',
  USER: 'e2e',
  PATH: '/bin',
  TERM: 'xterm-256color',
  SHELL: '/bin/bash',
  CLAUDE_CONFIG_DIR: '/h/.cfg',
  ANTHROPIC_API_KEY: 'dummy',
  ANTHROPIC_BASE_URL: 'http://127.0.0.1:9',
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  DISABLE_TELEMETRY: '1',
  DISABLE_AUTOUPDATER: '1',
}
test('A9.harness: on Linux and macOS the session env is exactly the recipe, its locale by OS and its color keys by color and driver', () => {
  const linux = { ...UNIX, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' }
  const mac = { ...UNIX, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' }
  const got = withParent(PARENT, () => [
    E({ platform: 'darwin' }),
    E({ platform: 'linux', color: '256' }),
    E({ platform: 'linux', driver: 'tmux' }),
    E({ platform: 'darwin', driver: 'tmux', color: '256' }),
  ])
  // truecolor: COLORTERM, and under tmux the override of Claude Code's tmux clamp. 256: neither, and under the PTY
  // driver TMUX=e2e, which turns that clamp on (E3).
  assert.deepEqual(got, [
    { ...mac, COLORTERM: 'truecolor' },
    { ...linux, TMUX: 'e2e' },
    { ...linux, COLORTERM: 'truecolor', CLAUDE_CODE_TMUX_TRUECOLOR: '1' },
    mac,
  ])
})

test('A9.harness: on Windows the session env adds USERPROFILE, APPDATA and LOCALAPPDATA under home and copies SystemRoot, ComSpec and PATHEXT from the parent; no SHELL, no locale', () => {
  const sys = { SystemRoot: 'C:\\Windows', ComSpec: 'C:\\Windows\\system32\\cmd.exe', PATHEXT: '.COM;.EXE;.BAT;.CMD' }
  const W = (o: object) => E({ platform: 'win32', home: 'C:\\h', config: 'C:\\h\\.cfg', path: 'C:\\bin', ...o })
  const win = {
    HOME: 'C:\\h',
    USERPROFILE: 'C:\\h',
    APPDATA: 'C:\\h\\AppData\\Roaming',
    LOCALAPPDATA: 'C:\\h\\AppData\\Local',
    USER: 'e2e',
    PATH: 'C:\\bin',
    TERM: 'xterm-256color',
    CLAUDE_CONFIG_DIR: 'C:\\h\\.cfg',
    ANTHROPIC_API_KEY: 'dummy',
    ANTHROPIC_BASE_URL: 'http://127.0.0.1:9',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    DISABLE_TELEMETRY: '1',
    DISABLE_AUTOUPDATER: '1',
  }
  assert.deepEqual(
    withParent({ ...PARENT, ...sys }, () => [W({}), W({ color: '256' })]),
    [
      { ...win, ...sys, COLORTERM: 'truecolor' },
      { ...win, ...sys, TMUX: 'e2e' },
    ],
  )
  // A parent without them: each is left out, never set to undefined.
  assert.deepEqual(
    withParent({ ...PARENT, SystemRoot: undefined, ComSpec: undefined, PATHEXT: undefined }, () => W({})),
    { ...win, COLORTERM: 'truecolor' },
  )
})

test("A9.harness: no session env, on any OS, color or driver, inherits a parent variable: its only ANTHROPIC_ keys are the recipe's, its HOME is home", () => {
  const envs = withParent(PARENT, () =>
    ['linux', 'darwin', 'win32'].flatMap((platform) =>
      ['truecolor', '256'].flatMap((color) => ['pty', 'tmux'].map((driver) => E({ platform, color, driver }))),
    ),
  )
  assert.equal(envs.length, 12)
  for (const e of envs) {
    assert.deepEqual(
      Object.entries(e)
        .filter(([k]) => k.startsWith('ANTHROPIC_'))
        .sort(),
      [
        ['ANTHROPIC_API_KEY', 'dummy'],
        ['ANTHROPIC_BASE_URL', 'http://127.0.0.1:9'],
      ],
    )
    assert.equal(e.HOME, '/h')
    assert.deepEqual(
      Object.entries(e).filter(([, v]) => v.includes('parent')),
      [],
    )
  }
})

test('A9.harness: seedConfig approves the key by its last 20 characters, trimmed, and trusts the real cwd, on Windows under its / form too (E2)', () => {
  const key = '  sk-ant-api03-0123456789abcdefghijXYZ\n'
  assert.deepEqual(JSON.parse(seedConfig('/private/tmp/w', key, 'darwin')), {
    hasCompletedOnboarding: true,
    customApiKeyResponses: { approved: ['3456789abcdefghijXYZ'], rejected: [] },
    projects: { '/private/tmp/w': { hasTrustDialogAccepted: true } },
  })
  assert.deepEqual(Object.keys(JSON.parse(seedConfig('/tmp/w', 'dummy', 'linux')).projects), ['/tmp/w'])
  assert.deepEqual(JSON.parse(seedConfig('C:\\Users\\e2e\\w', 'dummy', 'win32')).projects, {
    'C:\\Users\\e2e\\w': { hasTrustDialogAccepted: true },
    'C:/Users/e2e/w': { hasTrustDialogAccepted: true },
  })
})

test("A9.harness: seedSettings sets the theme under each of the three keys the plugin's options may be read from (E4)", () => {
  const each = (theme: string) => ({ options: { theme } })
  assert.deepEqual(JSON.parse(seedSettings('nord')), {
    pluginConfigs: {
      'mermaid-tty': each('nord'),
      'mermaid-tty@inline': each('nord'),
      'mermaid-tty@mermaid-tty': each('nord'),
    },
  })
  assert.deepEqual(JSON.parse(seedSettings('mono')).pluginConfigs['mermaid-tty@inline'], each('mono'))
})

test('A9.release: seeding an installed config adds keys and never drops one', () => {
  const m = JSON.parse(mergeJson('{"theme":"dark","pluginConfigs":{"x":{"options":{}}}}', seedSettings('nord')))
  assert.equal(m.theme, 'dark')
  assert.ok(m.pluginConfigs.x && m.pluginConfigs['mermaid-tty'])
})
