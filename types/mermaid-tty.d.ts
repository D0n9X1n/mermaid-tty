declare module 'claude-code' {
  interface PluginState {
    'mermaid-tty': {
      source: boolean | 'text' // true: source mode; 'text': text mode; else diagram
      images: 'auto' | 'on' | 'off' // the picture setting, mirrored from $.store; unset: not yet read
      // the theme drawn in; unset: the configured one
      theme: 'default' | 'nord' | 'dracula' | 'gruvbox' | 'solarized' | 'mono'
      // the flowchart direction the prompt asks for; unset: the configured one
      direction: 'LR' | 'TB' | 'off'
      untold: boolean // true while this conversation is owed a direction note that was refused
      btw: { question: string; text: string } // the latest /btw answered in the btw pane, where no row can be placed
      // the newest /btw answers, each drawn in the transcript row placed under its id, and how many rows were placed
      btwRows: { seq: number; rows: { id: string; question: string; text: string }[] }
      // whether crossing edges are colored apart; unset: the configured setting
      crossings: 'on' | 'off'
      // how large a diagram's picture is shown; unset: the configured size
      size: 'full' | 'compact'
    }
  }
}
