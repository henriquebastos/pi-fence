[< Docs](README.md)

# Getting Started

> **Status:** `CV0.E1` has shipped its core user-visible stories ([S0](project/roadmap/cv0-it-works/cv0-e1-kroki-through-the-wire/cv0-e1-s0-testing-foundation/README.md)–[S3](project/roadmap/cv0-it-works/cv0-e1-kroki-through-the-wire/cv0-e1-s3-fence-list/README.md)) plus [CVx.E1.S1](project/roadmap/cvx-verifiability/cvx-e1-pi-tui-idiom/cvx-e1-s1-virtual-terminal-tests/README.md) (render-layer testing). The package is not yet published to npm; install from source today, `pi install npm:pi-fence` will work once the first release cuts. Local rendering, `/fence doctor`, and configuration are still on the [roadmap](project/roadmap/README.md).

## Install

From source (today):

```bash
git clone https://github.com/henriquebastos/pi-fence
cd pi-fence
corepack enable   # one-time
pnpm install
# Point pi at the local checkout; see the extension-loading section of the pi docs.
```

From npm (once published):

```bash
pi install npm:pi-fence
```

Then `/reload` inside pi, or restart.

## First test (once installed)

Ask the assistant for a diagram — any of these work today:

- *"Draw me a mermaid diagram of an OAuth 2.0 authorization code flow."*
- *"Sketch the module dependencies as a graphviz DOT graph."*
- *"Make a PlantUML sequence diagram of a checkout flow."*
- *"Render a d2 diagram of a three-service architecture."*

The assistant answers with the obvious fenced block (```` ```mermaid ````, ```` ```dot ````, ```` ```plantuml ````, ```` ```d2 ````). pi-fence intercepts it, renders via `https://kroki.io`, and the PNG appears inline in any terminal that supports inline images (Ghostty, Kitty, iTerm2, WezTerm).

Supported tags today: `mermaid`, `graphviz`, `dot`, `plantuml`, `puml`, `d2`.

Type `/fence list` to see every registered processor, its status, and the tags it accepts:

```text
Processors

kroki [registered] — mermaid, graphviz (dot), plantuml (puml), d2
```

The listing is offline — no network call happens when you type `/fence list`.

If you don't see an image, check:

- Your terminal supports inline images.
- You have network access (the processor uses [kroki.io](https://kroki.io)).

## Next

Future CVs expand this page with:

- Configuration examples (`pi-fence` config file under `~/.pi/agent/`) — CV1.E1.
- Offline setup via Docker Kroki — CV2.E2.
- Adding/removing processors — CV1.E1.
- Writing your own processor — CV4.E1.

Track progress in the [worklog](process/worklog.md).

---

## Development

How to work on pi-fence itself. You need this only if you're contributing; end users just `pi install` once S1 ships.

### Prerequisites

- **Node 22** or newer. Matches the base image used by the live-deps container.
- **pnpm 10.x**. `packageManager` is pinned in `package.json`; `corepack enable` once per machine lets Node resolve the right pnpm automatically.
- **Docker Desktop or the docker CLI**. Optional — only needed when running `pnpm test:live`. The fast suite (`pnpm test`) requires neither Docker nor network.
- **macOS or Linux** for the full test matrix. Windows contributors can run the fast suite without issue; live tests on Windows require Docker Desktop and are not yet verified in CI.

### Clone and install

```bash
git clone https://github.com/henriquebastos/pi-fence
cd pi-fence
corepack enable    # one-time
pnpm install
```

### Run the fast test suite

```bash
pnpm run check     # docs link + markdown lint
pnpm test          # unit, contract, extension, utility self-tests
```

Expect both green on a clean clone.

### Run the live test suite

The live suite exercises real dependencies — the Kroki HTTP service and (once S1 ships) a Docker container carrying local binaries. Skipped cleanly when those aren't available.

```bash
pnpm live:build    # build the pi-fence-live-deps image locally
pnpm live:up       # start the container (named pi-fence-live-deps)
pnpm live:status   # should print 'running'
pnpm test:live     # run the live suite
pnpm live:down     # stop and remove the container
```

Without Docker, `pnpm test:live` reports the live suite as **skipped** and exits 0. The fast suite is unaffected.

### Run everything

```bash
pnpm test:all      # fast + live (live suite skips when container absent)
```

### Watch mode

```bash
pnpm test:watch    # vitest --watch on the fast suite
```

### Scripts reference

| Script | Purpose |
|--------|---------|
| `pnpm test` | Fast suite (unit, contract, render, extension, utility). |
| `pnpm test:watch` | vitest in watch mode. |
| `pnpm test:live` | Integration + render-image live suites (Docker / network / Chromium). Each case skips cleanly when its prerequisite is absent. |
| `pnpm test:all` | Fast + live. |
| `pnpm render:verify` | Produces a PNG of a named pi-fence scenario via headless xterm.js + Kitty-graphics addon in Chromium. Output: `scripts/out/render-verify/<scenario>/render.png`. Flags: `--list`, `--scenario <name>`, `--update`. |
| `pnpm run check` | Link check + markdown lint. |
| `pnpm run check:links` | Link check only. |
| `pnpm run check:markdown` | Markdown lint only. |
| `pnpm run fix:markdown` | Auto-fix markdown lint issues. |
| `pnpm live:up` | Pull/start the live-deps container. |
| `pnpm live:down` | Stop and remove the container. |
| `pnpm live:status` | Print `running` / `stopped` / `absent`. |
| `pnpm live:exec -- <cmd>` | Run a command inside the container. |
| `pnpm live:build` | Build the live-deps image locally. |
| `pnpm refresh-fixtures <tag>` | Regenerate committed fixtures from live sources. |

### CI

Two GitHub Actions workflows are committed but dormant until the repo goes public:

- `.github/workflows/ci.yml` — fast suite on Ubuntu + macOS, triggered on push and PR to `main`.
- `.github/workflows/live.yml` — live suite on Ubuntu, runs nightly and on `workflow_dispatch`.

### Test layout

See [principles.md](product/principles.md#testing) for the architectural rules. Directory shape:

```text
tests/
├── unit/           pure-logic + render-layer tests (TUI painting into VirtualTerminal), no external I/O
├── contract/       interface-conformance tests
├── extension/      pi-SDK-level tests with fake LLM stream
├── integration/    live tests (Docker/network); skip cleanly when deps absent
├── render-image/   live tests that pixel-diff pi-fence's rendered PNG against a committed golden; skip without Chromium
├── utilities/      shared test fakes + harnesses (ShellRunner, HttpClient, Logger, ExtensionAPI, VirtualTerminal, forceCapabilities)
└── fixtures/       committed reference bytes (including fixtures/golden/ for render-image)
```
