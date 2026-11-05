declare module 'claude-code' {
  interface PluginState {
    'mermaid-tty': {
      source: boolean | 'text' // true: source mode; 'text': text mode; else diagram
      images: 'auto' | 'on' | 'off' // the picture setting, mirrored from $.store; unset: not yet read
      // the theme drawn in; unset: the configured one
      theme: 'default' | 'nord' | 'dracula' | 'gruvbox' | 'solarized' | 'mono'
    }
  }
}
