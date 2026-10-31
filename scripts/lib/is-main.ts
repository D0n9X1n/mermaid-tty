// isMain(import.meta): whether node was given this module's file to run, rather than a test or
// another script importing it. It defers to Node's own definition of the main module.
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// The real path of p, or p as given when it names no file (node -e code arg).
function realPath(p: string): string {
  try { return realpathSync(p) } catch { return p }
}

// From Node 24.2, import.meta.main is a boolean: Node's own, exact answer. Node 24.0 and 24.1,
// which package.json allows, lack it, so isMain falls back to Node's rule for the main entry:
// argv[1], resolved against the cwd and through realpath, as a file URL. Distinct files, hard
// links included, have distinct URLs; a symlink resolves as Node resolves it; and URL
// normalization, such as a UNC host's case, applies to both sides alike.
// Residual risks, accepted, on Node 24.0 and 24.1 only: --preserve-symlinks-main keeps the
// symlink in the main module's URL, so the fallback, which resolves it, may disagree with Node;
// and with --entry-url, argv[1] may be a file:// URL, so the fallback returns false and main()
// is skipped. That flag is experimental and is never used to run our dev scripts.
export function isMain(meta: { url: string; main?: boolean }): boolean {
  if (typeof meta.main === 'boolean') { return meta.main }
  const argv1 = process.argv[1]
  if (!argv1) { return false }
  return meta.url === pathToFileURL(realPath(resolve(argv1))).href
}
