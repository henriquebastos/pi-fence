# pi-fence

> A [pi coding agent](https://pi.dev/) extension that processes fenced code blocks — so a ```` ```mermaid ```` block becomes a rendered diagram, a ```` ```csv ```` block becomes a formatted table, and so on. Pluggable processor registry: start with what's built in, plug in anything else you need.

**Status:** first Kroki slice working. `mermaid`, `graphviz`/`dot`, `plantuml`/`puml`, and `d2` fenced blocks in the assistant's output are rendered as inline PNGs via [kroki.io](https://kroki.io). Local rendering, configuration, and the rest of the [roadmap](docs/project/roadmap/README.md) are next.

---

## The idea

When the LLM writes this:

````markdown
```mermaid
flowchart LR
  A --> B --> C
```
````

…you shouldn't have to copy/paste it somewhere to see what it means. pi-fence intercepts the fenced block, runs it through a processor (Kroki, Graphviz, mmdc, your own plugin), and shows the rendered image inline in the terminal.

The same mechanism works for anything text-to-visual: syntax-highlighted code, formatted tables from CSV, QR codes, math, music notation. The core is a registry of **fence processors**; diagrams are just the first application.

## What works today

After installing pi-fence into pi:

1. Ask the assistant for any diagram — mermaid, graphviz DOT, PlantUML, or d2.
2. The assistant writes the natural fenced block: ```` ```mermaid ````, ```` ```dot ````, ```` ```plantuml ````, ```` ```d2 ````, etc.
3. pi-fence intercepts `agent_end`, posts the source to `https://kroki.io`, and emits a custom message below the assistant's text containing the rendered PNG.
4. Your terminal displays the PNG inline (Ghostty, Kitty, iTerm2, WezTerm).

**Supported tags**: `mermaid`, `graphviz`, `dot`, `plantuml`, `puml`, `d2`. Others (nomnoml, wavedrom, vega-lite, ...) are on the roadmap; each arrives with its own story when a user asks.

On expansion (ctrl+o on the rendered message) pi-fence also shows the original mermaid source in a code block for copy-paste.

**Slash commands**:

- `/fence list` — prints the registered processors and the tags each accepts. Offline, read-only. Today it shows one row (`kroki`); future Epics add more processors.

What does **not** work yet:

- Local rendering without network (CV0.E2, CV2.E1).
- `/fence doctor` (health probing) and configuration via `~/.pi/agent/pi-fence.config.json` (CV1.E1).
- Error feedback loop to the LLM (CV1.E2).
- Every CV past that (see [roadmap](docs/project/roadmap/README.md)).

## Docs

- **[Docs index](docs/README.md)** — start here
- **[Getting started](docs/getting-started.md)** — install and quick test (once there's something to install)
- **[Roadmap](docs/project/roadmap/README.md)** — what we're building and the order
- **[Briefing](docs/project/briefing.md)** — foundational architectural decisions
- **[Principles](docs/product/principles.md)** — how we build and test
- **[Worklog](docs/process/worklog.md)** — what was done, what's next

## Install (once published)

```bash
pi install npm:pi-fence
```

Then `/reload` inside pi, or restart.

pi-fence makes a single HTTP request to `https://kroki.io` per fenced block. Privacy-sensitive users can configure a self-hosted Kroki once CV1.E1 lands; until then the public endpoint is the only path.

## Development

This project uses [pnpm](https://pnpm.io). The `packageManager` field in `package.json` pins the version; use corepack to avoid global installs:

```bash
corepack enable          # one time, once per machine
pnpm install
pnpm test                # fast suite — no Docker, no network
pnpm test:live           # live suite — needs network for kroki.io
                         #   Docker for container-binary tests (CV0.E2+)
```

Without corepack, `pnpm install` works as long as you have pnpm 10.x available on PATH. See [getting-started](docs/getting-started.md#development) for the full dev workflow.

## License

MIT © 2026 Henrique Bastos
