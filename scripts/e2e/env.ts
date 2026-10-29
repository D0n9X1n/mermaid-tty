// The e2e session's recipe: the env the harness runs a real Claude Code in, built from nothing, and the seed files of its
// config dir. Node built-ins only, so the main suite tests it with nothing installed.
import { win32 } from 'node:path'

export type Color = 'truecolor' | '256'
export type Driver = 'pty' | 'tmux'
// home and config are the session's HOME and CLAUDE_CONFIG_DIR, mockUrl the mock Messages API's, path its whole PATH.
export type Recipe = { home: string; config: string; mockUrl: string; platform: string; color: Color; driver: Driver; path: string }

// The session's env. It inherits no variable of this process's but, on Windows, SystemRoot, ComSpec and PATHEXT, which a
// program needs to start there.
export function sessionEnv(r: Recipe): Record<string, string> {
  const env: Record<string, string> = {
    HOME: r.home, USER: 'e2e', PATH: r.path, TERM: 'xterm-256color', CLAUDE_CONFIG_DIR: r.config,
    ANTHROPIC_API_KEY: 'dummy', ANTHROPIC_BASE_URL: r.mockUrl,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_TELEMETRY: '1', DISABLE_AUTOUPDATER: '1',
  }
  if (r.platform === 'win32') {
    Object.assign(env, { USERPROFILE: r.home, APPDATA: win32.join(r.home, 'AppData', 'Roaming'), LOCALAPPDATA: win32.join(r.home, 'AppData', 'Local') })
    for (const k of ['SystemRoot', 'ComSpec', 'PATHEXT']) {
      const v = process.env[k]
      if (v !== undefined) env[k] = v
    }
  } else {
    const locale = r.platform === 'darwin' ? 'en_US.UTF-8' : 'C.UTF-8'
    Object.assign(env, { SHELL: '/bin/bash', LANG: locale, LC_ALL: locale })
  }
  // truecolor: COLORTERM, and under tmux the override of Claude Code's tmux clamp. 256: neither; under the PTY driver,
  // TMUX turns that clamp on (E3). Under the tmux driver, tmux sets TMUX itself.
  if (r.color === 'truecolor') {
    env.COLORTERM = 'truecolor'
    if (r.driver === 'tmux') env.CLAUDE_CODE_TMUX_TRUECOLOR = '1'
  } else if (r.driver === 'pty') env.TMUX = 'e2e'
  return env
}

// The config dir's .claude.json: onboarding done, the key approved as Claude Code records an approval, by its last 20
// characters, trimmed, and realCwd's trust dialog accepted, so that no first-run dialog stands before the prompt. On
// Windows, Claude Code may key the project by its /-separated path (E2), so both forms are trusted.
export function seedConfig(realCwd: string, key: string, platform: string): string {
  const projects: Record<string, { hasTrustDialogAccepted: true }> = { [realCwd]: { hasTrustDialogAccepted: true } }
  if (platform === 'win32') projects[realCwd.replaceAll('\\', '/')] = { hasTrustDialogAccepted: true }
  return JSON.stringify({ hasCompletedOnboarding: true, customApiKeyResponses: { approved: [key.trim().slice(-20)], rejected: [] }, projects }, null, 2)
}

// The config dir's settings.json: the plugin's theme, under each of the three keys Claude Code may read its options from (E4).
export function seedSettings(theme: string): string {
  const keys = ['mermaid-tty', 'mermaid-tty@inline', 'mermaid-tty@mermaid-tty']
  return JSON.stringify({ pluginConfigs: Object.fromEntries(keys.map(k => [k, { options: { theme } }])) }, null, 2)
}
