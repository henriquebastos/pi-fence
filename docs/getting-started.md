[< Docs](README.md)

# Getting Started

> **Status:** `CV0.E1` closed with full Kroki text coverage; `CV0.E2` closed with local graphviz + user-level per-tag bindings. Full render-layer testing via [CVx.E1.S1](project/roadmap/cvx--verifiability/cvx-e1-s1--virtual-terminal-tests.md). The package is not yet published to npm; install from source today, `pi install npm:pi-fence` will work once the first release cuts. `/fence doctor`, richer per-processor configuration, and the error-feedback loop to the LLM are still on the [roadmap](project/roadmap/README.md).

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
- *"Render a blockdiag showing three services calling a database."*
- *"Draw a wireviz harness for a D-Sub to barrel-jack cable."*

The assistant answers with the obvious fenced block (```` ```mermaid ````, ```` ```dot ````, ```` ```plantuml ````, ```` ```blockdiag ````, ```` ```wireviz ````, …). pi-fence intercepts it, renders via `https://kroki.io`, and the PNG appears inline in any terminal that supports inline images (Ghostty, Kitty, iTerm2, WezTerm).

Supported tags today: every text-body Kroki language the public endpoint serves as PNG — `mermaid`, `graphviz` (alias `dot`), `plantuml` (alias `puml`), `blockdiag`, `seqdiag`, `actdiag`, `nwdiag`, `packetdiag`, `rackdiag`, `c4plantuml`, `ditaa`, `erd`, `structurizr`, `symbolator`, `tikz`, `umlet`, `wireviz`. Full reference with minimal source examples, per-language quirks, and a list of languages pi-fence deliberately does *not* advertise yet: [docs/product/kroki-support.md](product/kroki-support.md).

Type `/fence list` to see every registered processor, its availability, and the tags it accepts:

```text
Processors

graphviz-local [registered] — graphviz (dot)
kroki [registered] — mermaid, graphviz (dot), plantuml (puml), blockdiag, seqdiag, actdiag, nwdiag, packetdiag, rackdiag, c4plantuml, ditaa, erd, structurizr, symbolator, tikz, umlet, wireviz
```

On a machine without `graphviz` installed, the first line becomes two:

```text
graphviz-local [unavailable] — graphviz (dot)
    dot binary not found on PATH (…). Install graphviz — apt install graphviz (Debian/Ubuntu) · brew install graphviz (macOS) · https://graphviz.org/download/
kroki [registered] — mermaid, graphviz (dot), plantuml (puml), …
```

The listing is offline — no network call happens when you type `/fence list`.

## Going offline for DOT

With `graphviz` installed locally, every ```` ```dot ```` or ```` ```graphviz ```` block the assistant writes renders via the local `dot` binary rather than `kroki.io`. The diagram source never leaves your machine for that tag. Install:

```bash
sudo apt install graphviz        # Debian / Ubuntu
brew install graphviz            # macOS
# Other platforms: https://graphviz.org/download/
```

Then `/reload` inside pi (pi-fence probes `dot -V` once per session, at startup; new installs are picked up on the next reload). `/fence list` should now show `graphviz-local [registered]`.

Mermaid, PlantUML, blockdiag, and every other tag still hit `kroki.io`. Local rendering for those languages is on the [roadmap](project/roadmap/README.md) (CV2.E1 for mermaid via `mmdc`).

## Binding a tag to a specific processor

The default resolution rule picks the first available processor that claims a tag in registration order — local-first for `graphviz`/`dot`, Kroki for everything else. If you want a different pairing (say, Kroki for `dot` even though you have `graphviz` installed), write a small config file:

```json
{
  "bindings": {
    "graphviz": "kroki",
    "dot": "kroki"
  }
}
```

pi-fence reads two optional files and merges them (project overrides global):

1. **Global** — `~/.pi/agent/pi-fence.config.json`.
2. **Project** — `<cwd>/.pi/pi-fence.config.json`.

`/reload` inside pi after editing. `/fence list` then shows a `Bindings` section:

```text
Bindings

  graphviz → kroki
  dot → kroki
```

**Binding lookup is exact**, not alias-aware. If you want both `graphviz` and `dot` blocks to route through the same processor, list both keys — see the example above. This matches how most config formats work (one key per tag) and keeps the semantics predictable.

**Bindings are preferences, not hard requirements.** If you bind `graphviz → graphviz-local` on a machine where `dot` isn't installed, pi-fence falls back to capability-based resolution (Kroki serves the block) and logs the fallback at warn level. `/fence list` shows the ignored binding in an `Ignored bindings` section with the reason:

```text
Ignored bindings

  graphviz → graphviz-local (processor unavailable)
```

Same for bindings that point to an unknown processor id — typos are noted in the `Ignored bindings` section rather than silently breaking.

### Missing / malformed config files

- If neither file exists, the defaults apply (capability-based resolution only).
- If a file is malformed JSON or its shape is wrong, pi-fence logs one warn line and continues with the remaining valid config — a bad config must never take the extension down.
- Unknown top-level keys are tolerated silently so future config surface (endpoint overrides, processor enable flags — CV1.E1) doesn't break existing files.

If you don't see an image, check:

- Your terminal supports inline images.
- For kroki.io-served tags: you have network access.
- For `dot` tags: `graphviz` is on your PATH (`dot -V` should print a version).

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
- **Docker Desktop or the docker CLI**. Optional — only needed when running `pnpm test:live`. The fast gate (`pnpm run verify:fast`) requires neither Docker nor network.
- **macOS or Linux** for the full test matrix. Windows contributors can run the fast suite without issue; live tests on Windows require Docker Desktop and are not yet verified in CI.

### Clone and install

```bash
git clone https://github.com/henriquebastos/pi-fence
cd pi-fence
corepack enable    # one-time
pnpm install
```

### Run the fast verification gate

```bash
pnpm run verify:fast   # pnpm test + pnpm run check + pnpm run typecheck + pnpm run typecheck:deps
```

Equivalent individual commands:

```bash
pnpm test              # unit, contract, extension, utility self-tests
pnpm run check         # docs link + markdown lint
pnpm run typecheck     # tsc --noEmit across extensions, tests, and scripts
pnpm run typecheck:deps # dependency-cruiser architectural boundaries
```

Expect all green on a clean clone.

### Run the live test suite

The live suite exercises real dependencies — the Kroki HTTP service and (once S1 ships) a Docker container carrying local binaries. Skipped cleanly when those aren't available.

```bash
pnpm live:build    # build the pi-fence-live-deps image locally
pnpm live:up       # start the container (named pi-fence-live-deps)
pnpm live:status   # should print 'running'
pnpm test:live     # run the live suite
pnpm live:down     # stop and remove the container
```

Without Docker, `pnpm test:live` reports the live suite as **skipped** and exits 0. The fast gate is unaffected.

### Run everything

```bash
pnpm test:all      # fast + live (live suite skips when container absent)
```

### Watch mode

```bash
pnpm test:watch    # vitest --watch on the fast suite
```

### SonarQube experiment

`CVx.E4.S2` treats SonarQube as a non-blocking experiment. It is **not** part of the fast gate.

Local setup with Docker:

```bash
docker run -d --name pi-fence-sonarqube -p 9000:9000 sonarqube:community
```

Then open <http://localhost:9000>, sign in with the local default admin account, create a user token, and run:

```bash
export SONAR_HOST_URL=http://localhost:9000
export SONAR_TOKEN=<your-token>
pnpm run sonar
```

`pnpm run sonar` is the convenience command: it runs the repo-pinned scanner and then generates a local report bundle under `scripts/out/sonar/latest/`. Low-level commands remain available when needed:

```bash
pnpm run sonar:scan    # scanner only
pnpm run sonar:report  # report only, reusing the latest .scannerwork/report-task.txt
```

This experiment is intentionally separate from `pnpm run verify:fast` so generic Sonar findings do not block normal commits. The repo also exposes a manual GitHub Actions workflow, `sonarqube-experiment`, for teams that want to point the same scan at a configured server without making it a required CI gate.

### Scripts reference

| Script | Purpose |
|--------|---------|
| `pnpm test` | Fast suite (unit, contract, render, extension, utility). |
| `pnpm run typecheck` | Static TypeScript gate (`tsc --noEmit`) across production code, tests, and scripts. |
| `pnpm run verify:fast` | Umbrella fast gate: `pnpm test` + `pnpm run check` + `pnpm run typecheck` + `pnpm run typecheck:deps`. |
| `pnpm test:watch` | vitest in watch mode. |
| `pnpm test:live` | Integration + render-image live suites (Docker / network / Chromium). Each case skips cleanly when its prerequisite is absent. |
| `pnpm test:all` | Fast + live. |
| `pnpm render:verify` | Produces PNGs + an HTML gallery of pi-fence scenarios via headless xterm.js + Kitty-graphics addon in Chromium. Output: `scripts/out/render-verify/<scenario>/<variant>/render.png` + `scripts/out/render-verify/index.html`. Flags: `--list`, `--scenario <name>`, `--variant <name>`, `--update`. |
| `pnpm run check` | Link check + markdown lint. |
| `pnpm run sonar` | Run the non-blocking SonarQube experiment end-to-end: scan, wait for CE completion, and write a report bundle under `scripts/out/sonar/latest/`. |
| `pnpm run sonar:scan` | Run the SonarQube scanner only against `SONAR_HOST_URL` with `SONAR_TOKEN`, using `sonar-project.properties`. |
| `pnpm run sonar:report` | Generate report artifacts from the latest Sonar scan recorded in `.scannerwork/report-task.txt`. |
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

- `.github/workflows/ci.yml` — the fast gate (`pnpm run check`, `pnpm run typecheck`, `pnpm test`) on Ubuntu + macOS, triggered on push and PR to `main`.
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
