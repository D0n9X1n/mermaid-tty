# mermaid-cli

Colored Mermaid diagrams inside AI coding CLIs. It draws the ```mermaid
fences in Claude Code and GitHub Copilot CLI replies as box-drawing diagrams,
right in the terminal, while the conversation keeps the Mermaid source.

> Not affiliated with [mermaid-js/mermaid-cli](https://github.com/mermaid-js/mermaid-cli)
> (`mmdc`), which exports Mermaid diagrams to SVG, PNG and PDF.

## Status

Early design; nothing to install yet. Planned:

- **Claude Code**: a mod that redraws each mermaid fence in a reply as a
  colored diagram sized to the terminal, falling back to the source when a
  diagram can't be drawn.
- **GitHub Copilot CLI**: the integration is being researched.
- **Rendering**: [termaid](https://github.com/fasouto/termaid), which keeps
  CJK labels aligned and draws subgraphs.

## License

[MIT](LICENSE)
