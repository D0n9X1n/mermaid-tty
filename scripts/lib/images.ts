// README image manifest: which .mmd source renders to which SVG, at what width and theme. No core import.
export const THEMES = ['default', 'nord', 'dracula', 'gruvbox', 'solarized', 'mono'] as const;
export type Image = { file: string; source: string; columns: number; theme: (typeof THEMES)[number]; raw?: boolean; reply?: boolean; picture?: string };
export const IMAGES: Image[] = [
  // The hero preview: a Claude Code reply, its prose as written and its mermaid fence drawn by core.
  { file: 'assets/readme/preview.svg', source: 'assets/readme/src/preview.md', columns: 72, theme: 'nord', reply: true },
  // Image mode: the same reply in kitty or Ghostty, its fence shown as Mermaid's own picture. The PNG is mmdc's, made
  // with the plugin's own flags by scripts/render-picture.ts; this embeds it at the cells the plugin gives it.
  { file: 'assets/readme/picture.svg', source: 'assets/readme/src/preview.md', columns: 100, theme: 'nord', reply: true, picture: 'assets/readme/src/preview.png' },
  { file: 'assets/readme/before.svg', source: 'assets/readme/src/hero.mmd', columns: 60, theme: 'default', raw: true },
  { file: 'assets/readme/after.svg', source: 'assets/readme/src/hero.mmd', columns: 60, theme: 'default' },
  { file: 'assets/readme/sequence.svg', source: 'assets/readme/src/sequence.mmd', columns: 72, theme: 'default' },
  { file: 'assets/readme/cjk.svg', source: 'assets/readme/src/cjk.mmd', columns: 60, theme: 'default' },
  // A showcase of the other types, one each, drawn by core like the rest.
  ...['mindmap', 'gitgraph', 'gantt', 'class', 'pie'].map((t) => ({ file: `assets/readme/${t}.svg`, source: `assets/readme/src/${t}.mmd`, columns: 60, theme: 'default' as const })),
  ...THEMES.map((theme) => ({ file: `assets/readme/theme-${theme}.svg`, source: 'assets/readme/src/theme.mmd', columns: 44, theme })),
];
