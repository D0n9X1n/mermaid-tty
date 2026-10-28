// Themes: the color of each drawing role and chart series. `default` maps roles to
// Claude Code theme keys, so it follows the user's CC theme; the curated palettes
// use their projects' official hex colors; `mono` has no color and tells roles
// apart by glyphs and caps.
export type Role = 'node' | 'decision' | 'edge' | 'arrow' | 'label' | 'frame' | 'note' | 'title' | 'value'
export type SeriesKey = 's1' | 's2' | 's3' | 's4' | 's5' | 's6' | 's7' | 's8'
export type Ink = Role | SeriesKey
export type ThemeName = 'default' | 'nord' | 'dracula' | 'gruvbox' | 'solarized' | 'mono'
export type Color = string                                 // a CC ThemeKey ('suggestion') or '#rrggbb'
export type Palette = {
  name: ThemeName
  background: Color | null                                 // the palette's canvas; null = the terminal's (default, mono)
  roles: Readonly<Record<Role, Color | null>>              // null = no color (mono)
  onFill: Color | null                                     // label text on a role-filled pill
  series: Readonly<Record<SeriesKey, Color | null>>        // mono: all null
  fill: boolean                                            // false in mono: no backgrounds
  dim: readonly Role[]                                     // [] in every theme
}

// No theme dims a role: CC's dimColor is itself a color, and mono must carry none.
export const THEMES: Readonly<Record<ThemeName, Palette>> = {
  default: {
    name: 'default', background: null, onFill: 'inverseText', fill: true, dim: [],
    roles: { node: 'suggestion', decision: 'warning', edge: 'inactive', arrow: 'claude', label: 'text', frame: 'permission', note: 'subtle', title: 'text', value: 'success' },
    series: { s1: 'suggestion', s2: 'success', s3: 'warning', s4: 'error', s5: 'merged', s6: 'claude', s7: 'permission', s8: 'planMode' },
  },
  nord: {
    name: 'nord', background: '#2E3440', onFill: '#2E3440', fill: true, dim: [],
    roles: { node: '#88C0D0', decision: '#EBCB8B', edge: '#D8DEE9', arrow: '#BF616A', label: '#A3BE8C', frame: '#B48EAD', note: '#5E81AC', title: '#D08770', value: '#81A1C1' },
    series: { s1: '#88C0D0', s2: '#A3BE8C', s3: '#EBCB8B', s4: '#D08770', s5: '#B48EAD', s6: '#81A1C1', s7: '#BF616A', s8: '#5E81AC' },
  },
  dracula: {
    name: 'dracula', background: '#282A36', onFill: '#282A36', fill: true, dim: [],
    roles: { node: '#8BE9FD', decision: '#F1FA8C', edge: '#F8F8F2', arrow: '#FF79C6', label: '#50FA7B', frame: '#BD93F9', note: '#FFB86C', title: '#FF5555', value: '#6272A4' },
    series: { s1: '#8BE9FD', s2: '#50FA7B', s3: '#F1FA8C', s4: '#FFB86C', s5: '#FF79C6', s6: '#BD93F9', s7: '#FF5555', s8: '#6272A4' },
  },
  gruvbox: {
    name: 'gruvbox', background: '#282828', onFill: '#282828', fill: true, dim: [],
    roles: { node: '#83A598', decision: '#FABD2F', edge: '#928374', arrow: '#FB4934', label: '#B8BB26', frame: '#D3869B', note: '#FE8019', title: '#EBDBB2', value: '#458588' },
    series: { s1: '#83A598', s2: '#B8BB26', s3: '#FABD2F', s4: '#FE8019', s5: '#FB4934', s6: '#D3869B', s7: '#458588', s8: '#928374' },
  },
  solarized: {
    name: 'solarized', background: '#002B36', onFill: '#FDF6E3', fill: true, dim: [],
    roles: { node: '#268BD2', decision: '#B58900', edge: '#93A1A1', arrow: '#CB4B16', label: '#EEE8D5', frame: '#D33682', note: '#2AA198', title: '#6C71C4', value: '#859900' },
    series: { s1: '#268BD2', s2: '#859900', s3: '#B58900', s4: '#CB4B16', s5: '#93A1A1', s6: '#D33682', s7: '#6C71C4', s8: '#2AA198' },
  },
  mono: {
    name: 'mono', background: null, onFill: null, fill: false, dim: [],
    roles: { node: null, decision: null, edge: null, arrow: null, label: null, frame: null, note: null, title: null, value: null },
    series: { s1: null, s2: null, s3: null, s4: null, s5: null, s6: null, s7: null, s8: null },
  },
}

// Object.hasOwn, not `in` or a bare lookup: every object inherits names like
// `constructor`, and those must fall back to default like any unknown name.
export function palette(name: string): Palette { return Object.hasOwn(THEMES, name) ? THEMES[name as ThemeName] : THEMES.default }
