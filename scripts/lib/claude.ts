import { spawnSync } from 'node:child_process'

// Runs the claude CLI and returns its exit code. On Windows it needs a shell,
// because an npm-installed claude is a .cmd shim that spawn cannot start.
export function claude(args: string[]): number {
  const r = spawnSync('claude', args, { stdio: 'inherit', shell: process.platform === 'win32' })
  if (r.error) console.error(r.error)
  return r.status ?? 1
}
