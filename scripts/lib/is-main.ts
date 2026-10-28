// isMain(import.meta.url): whether node was given this module's file to run, rather than
// a test or another script importing it. Node's own main-module flag arrived in 24.2, and
// package.json allows 24.0, where a script guarded by it would skip its body and exit 0.
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Whether a and b, two real paths, name the same file on platform. Windows paths ignore case,
// and there the module's URL gives a UNC host in lower case while realpath keeps its own case.
export function samePath(a: string, b: string, platform: string): boolean {
  return platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

// argv[1] keeps the path node was given, which may pass through a symlink (macOS temp dirs:
// /var -> /private/var), while the module's URL is the real path, so both sides go through
// realpath. A path that names no file (node -e code arg) is compared as given.
export function isMain(metaUrl: string): boolean {
  const argv1 = process.argv[1]
  if (!argv1) return false
  const real = (p: string) => { try { return realpathSync(p) } catch { return p } }
  return samePath(real(resolve(argv1)), real(fileURLToPath(metaUrl)), process.platform)
}
