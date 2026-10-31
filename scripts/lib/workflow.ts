// Workflow constants with no dependencies, so the release and version jobs need no docs tooling (D15c). The workflow
// rules run on the
// parsed YAML tree in docs/workflow-tree.ts.
export const INSTALL = [
  'claude plugin marketplace add D0n9X1n/mermaid-tty',
  'claude plugin install mermaid-tty@mermaid-tty --config theme=default',
]
