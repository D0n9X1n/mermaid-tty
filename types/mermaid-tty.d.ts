declare module 'claude-code' {
  interface PluginState {
    'mermaid-tty': { source: boolean | 'text' } // true: source mode; 'text': text mode; else diagram
  }
}
