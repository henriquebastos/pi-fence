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
    "graphviz": { "processor": "kroki-remote" },
    "dot": { "processor": "kroki-remote" }
  }
}
```

pi-fence reads two optional files and merges them:

1. **Global** — `~/.pi/agent/pi-fence.config.json`.
2. **Project** — `<cwd>/.pi/pi-fence.config.json`.

Project bindings override global bindings. Project `blocked` policy replaces global `blocked` policy; project `processorPrecedence` can only remove or reorder placements already allowed globally.

For one process, set `PI_FENCE_CONFIG` to load one explicit config file instead of the global/project pair:

```bash
PI_FENCE_CONFIG=/path/to/pi-fence.config.json pi
```

The explicit file is merged with defaults and uses the same fail-closed validation rules as normal config files. Because it replaces discovery for that process, it is useful for reproducible diagnostics, demos, and live verification runs such as selecting a local sandbox without editing your personal config.

Binding values must be selector objects. Use `{ "processor": "..." }` to choose one processor, or `{ "placement": "host" }` to limit the tag to eligible processors in that placement. If multiple processors in that placement match, pi-fence reports ambiguity instead of choosing one. Old string values such as `"graphviz": "kroki-remote"` are ignored with a config warning.

`/reload` inside pi after editing. `/fence list` then shows a `Bindings` section:

```text
Bindings

  graphviz → kroki-remote
  dot → kroki-remote
```

**Binding lookup is exact**, not alias-aware. If you want both `graphviz` and `dot` blocks to route through the same processor, list both keys — see the example above. This matches how most config formats work (one key per tag) and keeps the semantics predictable.

**Bindings are constraints, not preferences.** If you bind `graphviz → graphviz-host` on a machine where `dot` isn't installed, pi-fence does not fall through to Kroki for that tag. `/fence list` shows the binding in a `Binding issues` section with the reason:

```text
Binding issues

  graphviz → graphviz-host (processor unavailable)
```

Same for bindings that point to an unknown processor id — typos are noted in the `Binding issues` section and the tag has no selected processor until the config is fixed.

## Restricting processor placements

Use `processorPrecedence` to control both placement allowlist and order:

```json
{
  "processorPrecedence": ["embedded", "host"]
}
```

Omitting a placement disables every processor in that placement for resolution. With the example above, `kroki-remote` is skipped even when it is available. To intentionally prefer remote rendering for a project, the global config must also allow `remote`; project config cannot widen a global privacy policy.

## Running Graphviz and Mermaid in the bundle sandbox

`bundle-sandbox` renders `graphviz`/`dot` and `mermaid` inside an isolated exec runtime instead of using host binaries or remote Kroki. The default runtime is the labelled Docker exec container. CV10 also supports an opt-in Gondolin VM runtime for a stronger isolation boundary. `bundle-sandbox` is selected when `sandbox` placement is allowed and wins placement policy for the tag, for example:

```json
{
  "processorPrecedence": ["sandbox"]
}
```

For the Docker runtime, start the bundle container manually before `/reload`:

```bash
docker build -t ghcr.io/henriquebastos/pi-fence-bundle:0.1.0 docker/bundle
docker run -d \
  --name pi-fence-bundle \
  --label pi-fence.sandbox=bundle \
  --network none \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --tmpfs /tmp \
  ghcr.io/henriquebastos/pi-fence-bundle:0.1.0
```

`bundle-sandbox.available()` verifies the runtime is ready, exposes `/opt/pi-fence-bundle/manifest.json`, and passes `dot -V` plus `mmdc --version` inside the sandbox. The Docker controller also verifies the container is running, matches the trusted image, has the `pi-fence.sandbox=bundle` label, exposes no ports, and uses no host mounts. Mermaid input/output files live in the sandbox's `/tmp` workspace.

For the Gondolin VM runtime, configure the bundle sandbox explicitly:

```json
{
  "processorPrecedence": ["sandbox"],
  "sandboxes": {
    "bundle": {
      "kind": "exec",
      "runtime": "gondolin-vm",
      "image": "pi-fence-bundle:0.1.0",
      "autoStart": true
    }
  }
}
```

`image` is a Gondolin image selector or local guest asset path that contains the same bundle contract as the Docker image: Graphviz `dot`, Mermaid CLI `mmdc`, Chromium runtime dependencies, `/opt/pi-fence-bundle/manifest.json`, and the Puppeteer config path used by the Mermaid handler. `autoStart: true` is accepted only when an explicit image is supplied by a non-project config layer; project-local config cannot auto-start Gondolin images. The VM options disable host VFS mounts, ambient env vars, and generic networking. If `autoStart` is false or omitted, the VM remains stopped and `bundle-sandbox` is unavailable until a future lifecycle command starts it.

Build a local Gondolin bundle image with `pnpm run gondolin:bundle:build`; the source lives under `gondolin/bundle/`. The live gate for this runtime is opt-in: set `PI_FENCE_GONDOLIN_BUNDLE_IMAGE=<image-selector-or-asset-path>` before `pnpm test:live`. Without that variable, the Gondolin live tests skip cleanly.

S5 did not add `/fence bundle start|stop`; CV10 adds auto-start only for `gondolin-vm`.

### Missing / malformed config files

- If neither file exists, the defaults apply (`embedded`, `host`, `sandbox`, `remote`).
- If a config file is unreadable, malformed JSON, or has the wrong top-level shape, that layer contributes an embedded-only policy until the file is fixed; lower-priority policies can still make the final effective policy stricter.
- If a nested safety field such as `blocked`, `processorPrecedence`, or `kroki.endpoint` has the wrong shape, pi-fence logs a warning and fails closed for placement resolution.
- Unknown top-level keys are tolerated silently so future config surface doesn't break existing files.

If you don't see an image, check:

- Your terminal supports inline images.
- For `kroki-remote` tags served by kroki.io: you have network access.
- For `dot` tags selected by `graphviz-host`: `graphviz` is on your PATH (`dot -V` should print a version).
- For `dot` or `mermaid` tags selected by Docker-backed `bundle-sandbox`: the `pi-fence-bundle` Docker container is running, labelled, and built from the trusted bundle image.
- For `dot` or `mermaid` tags selected by Gondolin-backed `bundle-sandbox`: `sandboxes.bundle.runtime` is `gondolin-vm`, the configured image selector or asset path is available to Gondolin, and `autoStart` has started the VM.
- For tags selected by `kroki-sandbox`: the configured `sandboxes.kroki` service runtime is ready and reports `http://localhost:8000`.

## Configuring the Kroki endpoint

By default, diagram tags that resolve to `kroki-remote` post sources to the public `https://kroki.io` endpoint. To use a local or self-hosted Kroki instance instead:

```json
{
  "kroki": {
    "endpoint": "http://localhost:8000"
  }
}
```

After `/reload`, every Kroki-rendered tag that resolves to `kroki-remote` hits your local instance. `/fence list` shows the effective endpoint next to the processor:

```text
kroki-remote [registered] (http://localhost:8000) — mermaid, graphviz (dot), …
```

Removing the `kroki` key (or omitting `endpoint`) restores the public endpoint. A global `kroki.endpoint` is treated as a privacy setting and cannot be replaced by project config. If no global endpoint is set, a project can point its own sessions at a local Docker Kroki.

`kroki.endpoint` is always unmanaged `kroki-remote` configuration. A localhost URL alone does not make the processor sandbox-owned; use `sandboxes.kroki` to select `kroki-sandbox`.

**Quick local Kroki via Docker:**

```bash
docker run -d -p 127.0.0.1:8000:8000 yuzutech/kroki
```

That manual command is enough when you only want to point `kroki.endpoint` at a local service. pi-fence's lifecycle commands manage their own named, labelled container; use `/fence kroki start` when you want pi-fence to own start/stop/status.

## Running Kroki locally via managed sandbox

Instead of sending diagram source to `kroki.io`, you can let pi-fence select a managed local Kroki service as `kroki-sandbox`.

The legacy slash commands still manage the trusted single-container Docker runtime:

```text
/fence kroki start    → pulls and starts a local Kroki container on 127.0.0.1:8000
/fence kroki status   → reports running / stopped / absent
/fence kroki stop     → stops and removes the container
```

To render through the managed container, allow `sandbox` placement:

```json
{
  "processorPrecedence": ["sandbox", "remote"],
  "sandboxes": {
    "bundle": {
      "kind": "exec",
      "runtime": "docker-container"
    },
    "kroki": {
      "kind": "service",
      "runtime": "docker-container"
    }
  }
}
```

`kroki-sandbox` wins over `kroki-remote` when the container is ready; if it is unavailable and `remote` remains allowed, pi-fence falls back to `kroki-remote`.

**Auto-start (opt-in):** to have pi-fence start the single-container Docker Kroki sandbox automatically on every session, add `autoStart`:

```json
{
  "sandboxes": {
    "bundle": {
      "kind": "exec",
      "runtime": "docker-container"
    },
    "kroki": {
      "kind": "service",
      "runtime": "docker-container",
      "autoStart": true
    }
  }
}
```

`sandboxes` maps replace by layer, so include any default sandbox entries you still want active when overriding this section. Existing configs that use `kroki.docker.autoStart: true` still work as a single-container compatibility alias.

For the Compose-backed Kroki stack, start it manually from a source checkout. The packaged Compose file also publishes only `127.0.0.1:8000:8000`:

```bash
docker compose -f docker/kroki/compose.yaml -p pi-fence-kroki up -d
```

or let pi-fence auto-start it:

```json
{
  "processorPrecedence": ["sandbox", "remote"],
  "sandboxes": {
    "bundle": {
      "kind": "exec",
      "runtime": "docker-container"
    },
    "kroki": {
      "kind": "service",
      "runtime": "docker-compose",
      "autoStart": true
    }
  }
}
```

Auto-start follows sandbox processor policy: if `kroki-sandbox` is blocked, fully tag-blocked, or `sandbox` placement is omitted from `processorPrecedence`, pi-fence skips Docker startup. When it does start, the runtime stays running between sessions — subsequent starts are no-ops. The single-container lifecycle uses the trusted default `yuzutech/kroki` image even if project config contains a sandbox `image` value; `stop` reports non-zero `docker stop` or `docker rm` exits with Docker's stderr instead of hiding them behind a success message.

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
bundle-sandbox [unavailable] — graphviz (dot), mermaid
    bundle sandbox is absent: Container pi-fence-bundle not found.
kroki-sandbox [unavailable] — mermaid, graphviz (dot), plantuml (puml), …
    Kroki sandbox is absent: Container pi-fence-kroki not found.
kroki-remote [registered] — mermaid, graphviz (dot), plantuml (puml), …

Issues
  - graphviz-host is unavailable: brew install graphviz
```

The output shows which config files pi-fence loaded, the status of every processor, effective bindings, and any actionable issues. It's the `/fence list` output plus config-file status and an issues summary.

## Blocking tags and processors

To suppress a processor entirely — say, to stop Kroki from sending diagram source over the network — add `blocked.processors`:

```json
{
  "blocked": {
    "processors": ["kroki-remote"]
  }
}
```

After `/reload`, every Kroki-only tag (`mermaid`, `plantuml`, …) produces no rendered output. Tags that another processor also claims (like `graphviz`/`dot` via `graphviz-host`) still render through that processor.

To suppress a whole tag family, add `blocked.tags`:

```json
{
  "blocked": {
    "tags": ["graphviz"]
  }
}
```

Tag blocks are family-level. Blocking `graphviz` also blocks its `dot` alias, and blocking `dot` also blocks `graphviz`. A tag block wins over bindings; the LLM cannot route around it with fenced metadata or a configured binding.

`/fence list` shows blocked processors with a `[blocked]` badge and blocked tag families in a `Blocked tags` section. `/fence doctor` includes both in its Issues summary.

Project config replaces the global `blocked` object. Omit `blocked` in the project config to inherit global blocks, or set explicit empty arrays to clear them for that project.

## Next

Related controls on this page:

- [Running Graphviz and Mermaid in the bundle sandbox](#running-graphviz-and-mermaid-in-the-bundle-sandbox).
- [Configuring the Kroki endpoint](#configuring-the-kroki-endpoint).
- [Blocking tags and processors](#blocking-tags-and-processors).
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

By default, `pnpm test:live` sets `PI_FENCE_CONFIG` to `tests/fixtures/live-config/kroki-sandbox.json`, so Kroki coverage prefers the managed local sandbox instead of public `kroki.io`. The test runner starts `pi-fence-kroki` when the configured single-container sandbox is absent, and stops/removes it at the end only if that run started it. If `pi-fence-kroki` was already running, the test runner leaves it running.

Gondolin bundle live tests are opt-in because they require QEMU/Gondolin guest assets and a bundle VM image. Set `PI_FENCE_GONDOLIN_BUNDLE_IMAGE=<image-selector-or-asset-path>` to enable them; otherwise they skip cleanly.

Run the live suite:

```bash
pnpm live:build    # build the pi-fence-live-deps image locally
pnpm live:up       # start the container (named pi-fence-live-deps)
pnpm live:status   # should print 'running'
pnpm test:live     # starts/stops pi-fence-kroki if needed, then runs the live suite
pnpm live:down     # stop and remove the pi-fence-live-deps container
```

To test another config, set `PI_FENCE_CONFIG` explicitly; the package script preserves your value:

```bash
PI_FENCE_CONFIG=/path/to/pi-fence.config.json pnpm test:live
```

Without Docker, `pnpm test:live` reports Docker-dependent live cases as **skipped** and exits 0. The fast gate is unaffected.

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
