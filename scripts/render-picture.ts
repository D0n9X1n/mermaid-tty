// node scripts/render-picture.ts: remakes each README picture's PNG (images.ts, `picture`) with mermaid-cli, as the
// plugin's image mode would in kitty or Ghostty: its own mmdc flags, Mermaid's dark look, at the image's columns.
// Needs mmdc 11 or 12 on PATH. Then run node scripts/render-svg.ts --readme to embed the new PNGs.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mermaidConfig, mmdcArgs, pngSize, puppeteerConfig } from '../hooks/image.ts'
import { IMAGES } from './lib/images.ts'
import { ROOT } from './lib/render-image.ts'

const version = spawnSync('mmdc', ['--version'], { encoding: 'utf8' })
const major = Number(/^(\d+)\./.exec(version.stdout ?? '')?.[1])
if (version.status !== 0 || !(major >= 11)) { console.error('render-picture: needs mmdc 11 or 12 on PATH'); process.exit(1) }
const dir = mkdtempSync(join(tmpdir(), 'mtty-picture-'))
try {
  for (const img of IMAGES.filter((i) => i.picture)) {
    const fence = /^```mermaid\r?\n([\s\S]*?)^```\r?$/m.exec(readFileSync(join(ROOT, img.source), 'utf8'))?.[1]
    if (!fence) throw new Error(`${img.source}: no mermaid fence`)
    const config = join(dir, 'config.json'), puppeteer = join(dir, 'puppeteer.json')
    writeFileSync(config, JSON.stringify(mermaidConfig('dark')))
    writeFileSync(puppeteer, JSON.stringify(puppeteerConfig(img.columns)))
    const [cmd, ...args] = mmdcArgs({ out: join(ROOT, img.picture!), format: 'png', look: 'dark', config, puppeteer, columns: img.columns, major })
    const r = spawnSync(cmd!, args, { input: fence, encoding: 'utf8' })
    if (r.status !== 0) throw new Error(`mmdc exited ${r.status}: ${r.stderr}`)
    // The plugin keeps text for a picture Mermaid shrank to fit its page (hooks/image.ts, FULL): so must the README.
    const size = pngSize(readFileSync(join(ROOT, img.picture!)).toString('base64'))
    if (!size || size.width > img.columns * 12 * 2 * 0.9) throw new Error(`${img.picture}: ${size?.width} px is too wide for ${img.columns} columns; the plugin would keep text`)
    console.log(`render-picture: wrote ${img.picture}`)
  }
} finally { rmSync(dir, { recursive: true, force: true }) }
