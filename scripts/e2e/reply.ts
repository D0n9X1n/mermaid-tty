// The scripted replies the mock Messages API sends; the e2e scenarios check how mermaid-tty draws their fences. REPLY:
// prose, then a CJK flowchart, a sequence diagram, a diagram type mermaid-tty leaves as source, and last a mermaid
// fence that never closes.
export const REPLY = [
  'Here is the config flow:',
  '',
  '```mermaid',
  'flowchart LR',
  'A[读取配置文件] -->|成功| B{完成?}',
  'B --> C([结束])',
  '```',
  '',
  'And the handshake:',
  '',
  '```mermaid',
  'sequenceDiagram',
  'participant U as User',
  'U->>S: ping',
  'S-->>U: pong',
  '```',
  '',
  'This one stays source:',
  '',
  '```mermaid',
  'flowchart-elk TD',
  'X --> Y',
  '```',
  '',
  'Unclosed:',
  '',
  '```mermaid',
  'flowchart TD',
  'A --> B',
].join('\n')

// REPLY_LEAD: a reply that opens with its diagram, prose after it.
export const REPLY_LEAD = ['```mermaid', 'flowchart TD', 'S[开始] --> E[结束]', '```', '', 'After the diagram.'].join(
  '\n',
)
