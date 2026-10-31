// A9.stored (R6): what the stored transcript and /copy hold. Pure, with no packages: run.ts's stored scenario reads
// $CLAUDE_CONFIG_DIR/projects/**/*.jsonl with findReply, and stubs the OS clipboard command with clipboardStubs so
// /copy's text lands in a file it compares with fenceBody.
import { splitFences } from '../../hooks/fences.ts'

// Whether some line of the transcript is a message whose text blocks, joined, are reply byte for byte.
export function findReply(jsonl: string, reply: string): boolean {
  return jsonl.split('\n').some((line) => {
    let content: unknown
    try {
      content = JSON.parse(line)?.message?.content
    } catch {
      return false
    }

    if (typeof content === 'string') {
      return content === reply
    }

    if (!Array.isArray(content)) {
      return false
    }

    return (
      content
        .filter((b) => b?.type === 'text')
        .map((b) => b.text)
        .join('') === reply
    )
  })
}

// The body of reply's first closed mermaid fence; '' when it has none.
export function fenceBody(reply: string): string {
  const fence = splitFences(reply).find((s) => s.kind === 'mermaid')
  return fence?.kind === 'mermaid' ? fence.body : ''
}

// The clipboard commands Claude Code tries on each platform other than Windows.
const CLIPBOARD_COMMANDS = new Map([
  ['darwin', ['pbcopy']],
  ['linux', ['wl-copy', 'xclip', 'xsel']],
])

// Stand-ins for the platform's clipboard commands, by file name: each writes its stdin to out. On Windows,
// clip.cmd, which Claude Code runs as clip.
export function clipboardStubs(platform: string, out: string): Record<string, string> {
  if (platform === 'win32') {
    const ps = out.replaceAll("'", "''")
    return {
      'clip.cmd': `@powershell -NoProfile -Command "[Console]::In.ReadToEnd() | Set-Content -NoNewline -Encoding utf8 '${ps}'"\r\n`,
    }
  }

  const sh = `#!/bin/sh\ncat > '${out.replaceAll("'", "'\\''")}'\n`
  const names = CLIPBOARD_COMMANDS.get(platform) ?? []
  return Object.fromEntries(names.map((n) => [n, sh]))
}
