[< Docs](README.md)

# Getting Started

> **Status:** pi-fence has local/embedded processors, Kroki endpoint controls, `/fence doctor`, render-layer tests, and placement policy controls. The package is not yet published to npm; install from source today, `pi install npm:pi-fence` will work once the first release cuts.

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
- *"Sketch a Vega-Lite bar chart of quarterly revenue: Q1 120k, Q2 145k, Q3 98k, Q4 160k."*

The assistant answers with the obvious fenced block (```` ```mermaid ````, ```` ```dot ````, ```` ```plantuml ````, ```` ```blockdiag ````, ```` ```wireviz ````, …). pi-fence intercepts it, resolves the best allowed processor, and the output appears inline in any terminal that supports inline images/ANSI text (Ghostty, Kitty, iTerm2, WezTerm).

Supported diagram tags include Kroki PNG languages plus SVG→PNG rasterized Kroki languages: `mermaid`, `graphviz` (alias `dot`), `plantuml` (alias `puml`), `blockdiag`, `seqdiag`, `actdiag`, `nwdiag`, `packetdiag`, `rackdiag`, `c4plantuml`, `ditaa`, `erd`, `structurizr`, `symbolator`, `tikz`, `umlet`, `wireviz`, `vega`, `vegalite` (alias `vega-lite`), `d2`, `bytefield`, `dbml`, `nomnoml`, `pikchr`, `svgbob`, `wavedrom`. Embedded non-diagram tags are covered below. Full reference with minimal source examples, per-language quirks, and a list of languages pi-fence deliberately does *not* advertise yet: [docs/product/kroki-support.md](product/kroki-support.md).

## Structured data (CSV / JSONL)

pi-fence also renders structured data as formatted tables. Ask for CSV or JSONL output:

- *"Show me the top 5 npm packages by weekly downloads as CSV."*
- *"List the running containers as JSONL."*

When the assistant emits a ```` ```csv ```` or ```` ```jsonl ```` block, pi-fence formats it as a Unicode box-drawing table — no image, no external service, pure local rendering.

## Color swatches

Ask the assistant to list colors in a ```` ```color ```` or ```` ```palette ```` block. pi-fence renders each color as an ANSI truecolor swatch — a filled block of the color next to its value. Supports hex (`#RGB`, `#RRGGBB`), `rgb()`, `rgba()`, and named CSS colors. Non-color lines pass through as labels.

## QR codes

Ask the assistant to put a URL, Wi-Fi config, or any text in a ```` ```qr ```` block and pi-fence renders it as an inline QR code image. No external service — the QR code is generated locally.

## Syntax highlighting (SQL / regex / jq)

pi-fence applies ANSI syntax highlighting to `sql`, `regex`, and `jq` blocks. Keywords, strings, comments, operators, and other tokens get distinct colors for readability. No external tools required — pure local rendering with standard terminal colors.

Type `/fence list` to see every registered processor, its availability, and the tags it accepts:

```text
graphviz-host [registered] — graphviz (dot)
mermaid-host [unavailable] — mermaid
    mmdc binary not found on PATH. Install @mermaid-js/mermaid-cli — npm i -g @mermaid-js/mermaid-cli
table-embedded [registered] — csv, jsonl
highlight-embedded [registered] — sql, regex, jq
qr-embedded [registered] — qr
color-embedded [registered] — color, palette
kroki-remote [registered] — mermaid, graphviz (dot), plantuml (puml), blockdiag, seqdiag, actdiag, nwdiag, packetdiag, rackdiag, c4plantuml, ditaa, erd, structurizr, symbolator, tikz, umlet, wireviz, vega, vegalite (vega-lite), d2, bytefield, dbml, nomnoml, pikchr, svgbob, wavedrom
```

On a machine without `graphviz` installed, the Graphviz row shows an unavailable detail line:

```text
graphviz-host [unavailable] — graphviz (dot)
    dot binary not found on PATH (…). Install graphviz — apt install graphviz (Debian/Ubuntu) · brew install graphviz (macOS) · https://graphviz.org/download/
mermaid-host [unavailable] — mermaid
    mmdc binary not found on PATH. Install @mermaid-js/mermaid-cli — npm i -g @mermaid-js/mermaid-cli
kroki-remote [registered] — mermaid, graphviz (dot), plantuml (puml), …
```

The listing is offline — no network call happens when you type `/fence list`.

## Going offline for DOT

With `graphviz` installed locally and `host` placement allowed, ```` ```dot ```` and ```` ```graphviz ```` blocks render via the local `dot` binary rather than `kroki.io` unless a binding or precedence config chooses another processor. The diagram source never leaves your machine for that tag when `graphviz-host` is selected. Install:

```bash
sudo apt install graphviz        # Debian / Ubuntu
brew install graphviz            # macOS
# Other platforms: https://graphviz.org/download/
```

Then `/reload` inside pi (pi-fence probes `dot -V` once per session, at startup; new installs are picked up on the next reload). `/fence list` should now show `graphviz-host [registered]`.

With `@mermaid-js/mermaid-cli` installed, mermaid blocks also render locally:

```bash
npm i -g @mermaid-js/mermaid-cli
```

`/reload` inside pi. `/fence list` should now show `mermaid-host [registered]` ahead of `kroki-remote`. Mermaid diagram source never leaves your machine when `mermaid-host` is selected (`mmdc` is available, `host` placement is allowed, and no binding/precedence config chooses remote).

PlantUML, blockdiag, and every other non-graphviz/non-mermaid diagram tag still hit `kroki.io`. Local rendering for those languages is on the [roadmap](project/roadmap/README.md).

## Binding a tag to a specific processor

The default resolution rule uses placement precedence: `embedded` first, then `host`, then `sandbox`, then `remote`. If you want a different pairing (say, Kroki for `dot` even though you have `graphviz` installed), write a small config file:

```json
{
  "bindings": {
    "graphviz": "kroki-remote",
    "dot": "kroki-remote"
  }
}
```

pi-fence reads two optional files and merges them:

1. **Global** — `~/.pi/agent/pi-fence.config.json`.
2. **Project** — `<cwd>/.pi/pi-fence.config.json`.

Project bindings override global bindings. Safety controls are restrictive: project `disabled` adds to global `disabled`, and project `processorPrecedence` can only remove or reorder placements already allowed globally.

`/reload` inside pi after editing. `/fence list` then shows a `Bindings` section:

```text
Bindings

  graphviz → kroki-remote
  dot → kroki-remote
```

**Binding lookup is exact**, not alias-aware. If you want both `graphviz` and `dot` blocks to route through the same processor, list both keys — see the example above. This matches how most config formats work (one key per tag) and keeps the semantics predictable.

**Bindings are preferences, not hard requirements.** If you bind `graphviz → graphviz-host` on a machine where `dot` isn't installed, pi-fence falls back to placement-policy resolution (Kroki serves the block when `remote` is allowed) and logs the fallback at warn level. `/fence list` shows the ignored binding in an `Ignored bindings` section with the reason:

```text
Ignored bindings

  graphviz → graphviz-host (processor unavailable)
```

Same for bindings that point to an unknown processor id — typos are noted in the `Ignored bindings` section rather than silently breaking.

## Restricting processor placements

Use `processorPrecedence` to control both placement allowlist and order:

```json
{
  "processorPrecedence": ["embedded", "host"]
}
```

Omitting a placement disables every processor in that placement for resolution. With the example above, `kroki-remote` is skipped even when it is available. To intentionally prefer remote rendering for a project, the global config must also allow `remote`; project config cannot widen a global privacy policy.

### Missing / malformed config files

- If neither file exists, the defaults apply (`embedded`, `host`, `sandbox`, `remote`).
- If a config file is unreadable, malformed JSON, or has the wrong top-level shape, that layer contributes an embedded-only policy until the file is fixed; lower-priority policies can still make the final effective policy stricter.
- If a nested safety field such as `disabled`, `processorPrecedence`, or `kroki.endpoint` has the wrong shape, pi-fence logs a warning and fails closed for placement resolution. Compatibility exception: `"disabled": "kroki"` is accepted as shorthand for a single disabled processor id.
- Unknown top-level keys are tolerated silently so future config surface doesn't break existing files.

If you don't see an image, check:

- Your terminal supports inline images.
- For kroki.io-served tags: you have network access.
- For `dot` tags: `graphviz` is on your PATH (`dot -V` should print a version).

## Configuring the Kroki endpoint

By default, diagram tags that resolve to `kroki-remote` post sources to the public `https://kroki.io` endpoint. To use a local or self-hosted Kroki instance instead:

```json
{
  "kroki": {
    "endpoint": "http://localhost:8000"
  }
}
```

After `/reload`, every Kroki-rendered tag hits your local instance. `/fence list` shows the effective endpoint next to the processor:

```text
kroki-remote [registered] (http://localhost:8000) — mermaid, graphviz (dot), …
```

Removing the `kroki` key (or omitting `endpoint`) restores the public endpoint. A global `kroki.endpoint` is treated as a privacy setting and cannot be replaced by project config. If no global endpoint is set, a project can point its own sessions at a local Docker Kroki.

**Quick local Kroki via Docker:**

```bash
docker run -d -p 8000:8000 yuzutech/kroki
```

## Running Kroki locally via Docker

Instead of sending diagram source to `kroki.io`, you can run Kroki locally. pi-fence manages the Docker container for you:

```text
/fence kroki start    → pulls and starts a local Kroki container on port 8000
/fence kroki status   → reports running / stopped / absent
/fence kroki stop     → stops and removes the container
```

`/fence kroki start` only manages the container; it does not change the active processor endpoint. To use the local container, set `kroki.endpoint` to `http://localhost:8000` in your config file and `/reload` — see [Configuring the Kroki endpoint](#configuring-the-kroki-endpoint) above.

**Auto-start (opt-in):** to have pi-fence start the Docker container automatically on every session, add to your config:

```json
{
  "kroki": {
    "docker": { "autoStart": true }
  }
}
```

Auto-start follows processor policy: if `kroki-remote` is disabled or `remote` placement is omitted from `processorPrecedence`, pi-fence skips Docker startup. When it does start, the container stays running between sessions — subsequent starts are no-ops.

## Diagnosing the setup

Type `/fence doctor` for a full diagnostic summary:

```text
Config
  global: ~/.pi/agent/pi-fence.config.json (loaded)
  project: .pi/pi-fence.config.json (not found)

graphviz-host [unavailable] — graphviz (dot)
    dot binary not found on PATH. Install graphviz — brew install graphviz (macOS)
mermaid-host [unavailable] — mermaid
    mmdc binary not found on PATH. Install @mermaid-js/mermaid-cli — npm i -g @mermaid-js/mermaid-cli
kroki-remote [registered] — mermaid, graphviz (dot), plantuml (puml), …

Issues
  - graphviz-host is unavailable: brew install graphviz
```

The output shows which config files pi-fence loaded, the status of every processor, effective bindings, and any actionable issues. It's the `/fence list` output plus config-file status and an issues summary.

## Disabling a processor

To suppress a processor entirely — say, to stop Kroki from sending diagram source over the network — add a `disabled` array:

```json
{
  "disabled": ["kroki-remote"]
}
```

After `/reload`, every Kroki-only tag (`mermaid`, `plantuml`, …) produces no rendered output. Tags that another processor also claims (like `graphviz`/`dot` via `graphviz-host`) still render through that processor.

`/fence list` shows the disabled processor with a `[disabled]` badge.

**Compatibility note:** older examples used the processor id `kroki`. pi-fence normalizes known legacy ids in `bindings` and `disabled`, but new config should use placement-aware ids such as `kroki-remote`.

Project config cannot re-enable a globally disabled processor. Remove the id from the global config if you want a project to allow it, then use project `processorPrecedence` or bindings to make that project more specific.

## Next

Related controls on this page:

- [Configuring the Kroki endpoint](#configuring-the-kroki-endpoint).
- [Disabling a processor](#disabling-a-processor).
- [`/fence doctor`](#diagnosing-the-setup).
- [Writing your own processor](guides/write-a-processor.md).

Track progress in the [worklog](process/worklog.md).

---

## Development

How to work on pi-fence itself. You need this only if you're contributing; end users just `pi install` once S1 ships.

### Prerequisites

- **Node 22** or newer. Matches the base image used by the live-deps container.
- **pnpm 10.x**. `packageManager` is pinned in `package.json`; `corepack enable` once per machine lets Node resolve the right pnpm automatically.
- **Docker Desktop or the docker CLI**. Optional — only needed when running `pnpm test:live`. The implementation loop (`pnpm run feedback`) requires neither Docker nor network.
- **macOS or Linux** for the full test matrix. Windows contributors can run the fast suite without issue; live tests on Windows require Docker Desktop and are not yet verified in CI.

### Clone and install

```bash
git clone https://github.com/henriquebastos/pi-fence
cd pi-fence
corepack enable    # one-time
pnpm install
```

### Testing levels

| Level | Command | When | Needs Docker/network |
|-------|---------|------|---------------------|
| TDD loop | `pnpm run feedback` | Every commit | No |
| Completion | `pnpm run inspect` | TDD session feels done | No |
| Live I/O | `pnpm test:live` | New/changed processor or I/O seam | Yes |
| Acceptance | `pnpm test:live` + `pnpm run render:verify` | Before closing an epic | Yes |

No level requires human review. The sections below detail each level.

### Run the TDD loops

Red / green while iterating:

```bash
pnpm test:watch    # vitest --watch on the fast suite
```

Fast refactor loop:

```bash
pnpm run feedback   # pnpm test + pnpm run inspect:crap:ext + pnpm run lint:markdown + pnpm run lint:types + pnpm run lint:deps
```

Equivalent individual commands:

```bash
pnpm test                 # unit, contract, extension, utility self-tests + extension-focused coverage + 90/90/90/75 thresholds
pnpm run inspect:crap:ext # focused CRAP summary for extensions/**
pnpm run lint            # docs link + markdown checks
pnpm run lint:types      # tsc --noEmit across extensions, tests, and scripts
pnpm run lint:deps       # dependency-cruiser architectural boundaries
```

Expect all green on a clean clone.

### Run the live test suite

Run when adding or changing a processor, touching an I/O seam, or refreshing fixtures. The live suite exercises real dependencies — Kroki HTTP, local binaries via Docker, and headless Chromium for render-image pixel-diff. Skipped cleanly when dependencies aren’t available.

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

### Coverage + CRAP feedback

```bash
pnpm test                 # fast suite + coverage focused on extensions/**
pnpm run inspect:crap:ext # focused CRAP summary for extensions/**
pnpm run inspect:crap     # broader CRAP report over extensions/, scripts/, and non-live tests/
```

`pnpm test` uses Vitest's Istanbul provider because it is the coverage input shape `crap-score` consumes directly and it matched function coverage correctly in this repo during evaluation. The fast-suite coverage summary is intentionally scoped to `extensions/**` so the normal loop answers the production-lane question first. The current fast-gate minimums are statements `90`, lines `90`, functions `90`, branches `75`.

`pnpm run feedback` reuses the `coverage/coverage-final.json` produced by `pnpm test` and adds a focused extension-only CRAP summary on stdout before `lint:markdown`, `lint:types`, and `lint:deps`. That keeps the implementation loop focused on shipped extension code without rerunning the suite.

`pnpm run inspect:crap` is separate and non-blocking: it reruns the fast suite with a broader coverage include set (`extensions/**`, `scripts/**`, `tests/unit/**`, `tests/contract/**`, `tests/extension/**`, `tests/utilities/**`) and then writes JSON + HTML reports under `crap-report/nonlive/`.

### Completion inspection pass

When the change feels done, run the broader inspection pass before you decide the refactor is finished:

```bash
pnpm run inspect
```

`pnpm run inspect` always runs `pnpm run inspect:crap`. If `SONAR_HOST_URL` and `SONAR_TOKEN` are set, it also runs `pnpm run inspect:sonar`; otherwise it prints a clear skip and exits green. After `inspect` surfaces issues or simplification opportunities, refactor again and rerun `pnpm run feedback`.

Current completion-pass targets:

1. keep focused extension CRAP (`inspect:crap:ext`) at or below `25`
2. try to drive Sonar to `0` open issues

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
pnpm run inspect:sonar
```

`pnpm run inspect:sonar` is the convenience command: it runs the repo-pinned scanner and then generates a local report bundle under `scripts/out/sonar/latest/`. Low-level commands remain available when needed:

```bash
pnpm run inspect:sonar:scan    # scanner only
pnpm run inspect:sonar:report  # report only, reusing the latest .scannerwork/report-task.txt
```

This experiment is intentionally separate from `pnpm run feedback` so generic Sonar findings do not block normal commits. The repo also exposes a manual GitHub Actions workflow, `sonarqube-experiment`, for teams that want to point the same scan at a configured server without making it a required CI gate.

### Scripts reference

| Script | Purpose |
|--------|---------|
| `pnpm run feedback` | Canonical fast refactor loop: `pnpm run feedback:fast`. |
| `pnpm run feedback:fast` | Fast refactor loop: `pnpm test` + `pnpm run inspect:crap:ext` + `pnpm run lint:markdown` + `pnpm run lint:types` + `pnpm run lint:deps`. |
| `pnpm test` | Fast suite (unit, contract, render, extension, utility) with coverage focused on `extensions/**` and minimum thresholds of statements `90`, lines `90`, functions `90`, branches `75`. |
| `pnpm test:watch` | vitest in watch mode on the fast suite. |
| `pnpm test:live` | Integration + render-image live suites (Docker / network / Chromium). Each case skips cleanly when its prerequisite is absent. |
| `pnpm test:all` | Fast + live. |
| `pnpm run lint` | Convenience wrapper for `pnpm run lint:markdown`. |
| `pnpm run lint:types` | Static TypeScript gate (`tsc --noEmit`) across production code, tests, and scripts. |
| `pnpm run lint:deps` | dependency-cruiser architectural boundary check. |
| `pnpm run lint:markdown:fix` | Auto-fix markdown body issues with `markdownlint-cli2 --fix`. |
| `pnpm run lint:markdown` | Run both markdown link checks and markdown body checks. |
| `pnpm run lint:markdown:links` | Markdown link + heading-fragment validation. |
| `pnpm run lint:markdown:body` | Markdown body checks via `markdownlint-cli2`. |
| `pnpm run inspect` | Completion inspection pass: always runs `inspect:crap`; also runs `inspect:sonar` when `SONAR_HOST_URL` + `SONAR_TOKEN` are set, otherwise skips Sonar clearly. Use it to keep focused extension CRAP at or below `25` and to try to drive Sonar to `0` open issues. |
| `pnpm run inspect:coverage:nonlive` | Broader non-live coverage pass for `extensions/**`, `scripts/**`, and non-live `tests/**`; used as the input to the broader CRAP report. |
| `pnpm run inspect:crap:ext` | Focused CRAP summary for `extensions/**`, built from the coverage output produced by `pnpm test` and printed to stdout. |
| `pnpm run inspect:crap` | Broader CRAP report flow: `pnpm run inspect:coverage:nonlive` + `pnpm run inspect:crap:nonlive`. |
| `pnpm run inspect:crap:nonlive` | Write JSON + HTML CRAP reports under `crap-report/nonlive/` from `coverage/nonlive/coverage-final.json`. |
| `pnpm run inspect:sonar` | Run the non-blocking SonarQube experiment end-to-end: scan, wait for CE completion, and write a report bundle under `scripts/out/sonar/latest/`. |
| `pnpm run inspect:sonar:scan` | Run the SonarQube scanner only against `SONAR_HOST_URL` with `SONAR_TOKEN`, using `sonar-project.properties`. |
| `pnpm run inspect:sonar:report` | Generate report artifacts from the latest Sonar scan recorded in `.scannerwork/report-task.txt`. |
| `pnpm render:verify` | Produce PNGs + an HTML gallery of pi-fence scenarios via headless xterm.js + Kitty-graphics addon in Chromium. Output: `scripts/out/render-verify/<scenario>/<variant>/render.png` + `scripts/out/render-verify/index.html`. Flags: `--list`, `--scenario <name>`, `--variant <name>`, `--update`. |
| `pnpm render:gallery` | Render the user-facing gallery HTML under `scripts/out/render-gallery/`. |
| `pnpm live:up` | Pull/start the live-deps container. |
| `pnpm live:down` | Stop and remove the container. |
| `pnpm live:status` | Print `running` / `stopped` / `absent`. |
| `pnpm live:exec -- <cmd>` | Run a command inside the container. |
| `pnpm live:build` | Build the live-deps image locally. |
| `pnpm refresh-fixtures <tag>` | Fixture-refresh entrypoint. Currently a tagged skeleton that exits with a not-yet-implemented error until the first real refresh path lands. |

The command surface is intentionally single-vocabulary: use the names shown above in scripts, docs, and contributor workflow.

### CI

## Writing your own processor

pi-fence is extensible — any pi extension can register its own processor via the event bus. See the [Write Your Own Processor](guides/write-a-processor.md) guide for the full walkthrough and a minimal working example.

## CI workflows

Two GitHub Actions workflows are committed but dormant until the repo goes public:

- `.github/workflows/ci.yml` — the fast gate (`pnpm run lint:markdown`, `pnpm run lint:types`, `pnpm run lint:deps`, `pnpm test`) on Ubuntu + macOS, triggered on push and PR to `main`.
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
