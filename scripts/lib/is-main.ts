// isMain(import.meta.url): whether node was given this module's file to run, rather than
// a test or another script importing it. Node's own main-module flag arrived in 24.2, and
// package.json allows 24.0, where a script guarded by it would skip its body and exit 0.
import { realpathSync, statSync } from 'node:fs'
import { posix, resolve, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'

// A Windows path's root: a drive letter (C:) or a UNC host (\\SERVER).
const WIN_ROOT = /^(?:[A-Za-z]:|[\\/]{2}[^\\/]+)/

// Whether a and b, two real paths, name the same file on platform. On Windows only the root
// ignores case: the drive letter, and the UNC host, which the module's URL gives in lower case
// while realpath keeps the host's own. The rest is compared exactly, since a directory can be
// case-sensitive (WSL interop) and hold both Main.ts and main.ts.
export function samePath(a: string, b: string, platform: string): boolean {
  if (platform !== 'win32') return a === b
  const ra = WIN_ROOT.exec(a)?.[0] ?? '', rb = WIN_ROOT.exec(b)?.[0] ?? ''
  return ra.toLowerCase() === rb.toLowerCase() && a.slice(ra.length) === b.slice(rb.length)
}

// Whether real paths a and b end in the same file name on platform. isMain asks only once their
// file IDs match, and on Windows the two may spell that file's name in different case.
export function sameName(a: string, b: string, platform: string): boolean {
  if (platform !== 'win32') return posix.basename(a) === posix.basename(b)
  return win32.basename(a).toLowerCase() === win32.basename(b).toLowerCase()
}

// The device and inode of the file at p, as bigints: a Windows file index can pass 2^53.
// undefined when p names no file, or when its filesystem reports inode 0, as some network
// filesystems do for every file.
function fileId(p: string): { dev: bigint; ino: bigint } | undefined {
  try {
    const { dev, ino } = statSync(p, { bigint: true })
    return ino === 0n ? undefined : { dev, ino }
  } catch { return undefined }
}

// argv[1] keeps the path node was given, which may reach the file through a symlink (macOS temp
// dirs: /var -> /private/var) or a hard link, while the module's URL is its real path. So isMain
// compares the files, by device and inode, and since a file ID can repeat (ReFS's 64-bit one is
// not unique), the names their real paths end in. Only when either side names no file (node -e
// code arg) or reports inode 0 does it compare the real paths, or a path that names no file as given.
export function isMain(metaUrl: string): boolean {
  const argv1 = process.argv[1]
  if (!argv1) return false
  const real = (p: string) => { try { return realpathSync(p) } catch { return p } }
  const a = real(resolve(argv1)), b = real(fileURLToPath(metaUrl))
  const ia = fileId(a), ib = fileId(b)
  if (ia && ib) return ia.dev === ib.dev && ia.ino === ib.ino && sameName(a, b, process.platform)
  return samePath(a, b, process.platform)
}
