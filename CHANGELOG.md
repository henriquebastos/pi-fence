# Changelog

All notable changes to this project will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed (CV11.E1.S2 — Kroki endpoint normalization)

- `kroki.endpoint` now fails closed unless it is a credential-free `http://` or `https://` URL with an explicit non-empty authority; endpoint paths are preserved, trailing slashes are normalized, and query strings, hash fragments, credentials, unsupported schemes, malformed authority forms, extra-slash repaired forms, dot-segment paths, raw spaces, backslashes, bare query/hash delimiters, credential delimiters, and whitespace/control-wrapped values are rejected.
- Kroki request URLs are now built with URL helpers so endpoint path prefixes, output formats, and `theme=dark` compose predictably.
- `/fence doctor` now warns when the active `kroki.endpoint` comes from project-local config because diagram source may be sent to that endpoint.

### Changed (CV11.E1.S1 — Package runtime assets)

- npm packages now include `docker/bundle/`, `docker/kroki/`, and `gondolin/bundle/`, so installed users receive the runtime assets for bundle image workflows and the managed Kroki Compose stack.
- The managed Kroki Compose lifecycle now invokes Docker with a package-resolved absolute `docker/kroki/compose.yaml` path instead of a user-cwd-relative path.

### Added (CV10.E1.S1 — Gondolin VM runtime for bundle-sandbox)

- Added `sandboxes.bundle.runtime: "gondolin-vm"` as an exec-sandbox runtime for `bundle-sandbox`, backed by `@earendil-works/gondolin`.
- Added a Gondolin `ExecSandboxEnvironment` that preserves bundle command execution, stdin/stdout capture, binary PNG output, abort signals, and guest temp workspaces without host VFS mounts or generic networking.
- `sandboxes.bundle.autoStart: true` now starts the Gondolin bundle VM during extension startup when `bundle-sandbox` is allowed by processor policy, the config supplies an explicit image, and the setting does not come from project-local config; `autoStart: false` leaves it stopped and unavailable.
- Added opt-in Gondolin bundle live tests for Graphviz and Mermaid, gated by `PI_FENCE_GONDOLIN_BUNDLE_IMAGE` and skipped cleanly when no VM image is configured.
- Added `gondolin/bundle/` and `pnpm run gondolin:bundle:build` to build the local `pi-fence-bundle:0.1.0` Gondolin image with Graphviz, Mermaid CLI, Chromium, `dot -c`, and the bundle manifest contract.

### Changed (CV10.E1.S1 — Gondolin VM runtime for bundle-sandbox)

- `bundle-sandbox` keeps the same processor id, tags, aliases, manifest probes, and placement semantics across Docker and Gondolin runtimes.
- Gondolin VM options now let explicit controller `start()` boot the VM while still disabling host VFS mounts and generic networking.
- Config validation accepts `gondolin-vm` only for `kind: "exec"` sandboxes and fails closed if it is used with `kind: "service"`, if `autoStart` has no explicit image, or if project-local config tries to auto-start a Gondolin image.

### Added (CV9.E1.S6 — Kroki sandbox processor)

- Added `kroki-sandbox`, a sandbox-placement processor for managed local Kroki services, distinct from unmanaged `kroki-remote` endpoints.
- `sandboxes.kroki.runtime: "docker-container"` can now select the trusted single-container Kroki service as `kroki-sandbox` when `sandbox` placement is allowed.
- `sandboxes.kroki.runtime: "docker-compose"` can now select a fixed Compose-backed Kroki stack from `docker/kroki/compose.yaml`, starting with Kroki core plus the Mermaid companion service.
- `processorPrecedence: ["sandbox", "remote"]` now prefers ready `kroki-sandbox` and falls back to `kroki-remote` when the managed service is unavailable.
- `/fence list` and `/fence doctor` now surface `kroki-sandbox` availability, including partial Compose component details.
- Added live tests for the single-container and Compose `kroki-sandbox` service paths; they skip cleanly when the managed Docker services are absent.

### Changed (CV9.E1.S6 — Kroki sandbox processor)

- Kroki Docker auto-start is now gated by `kroki-sandbox` policy (`sandbox` placement and sandbox blocks), not by `kroki-remote` policy.
- `kroki.endpoint` remains unmanaged `kroki-remote` configuration even when it points at localhost; sandbox ownership now requires a ready `sandboxes.kroki` controller.

### Added (CV9.E1 acceptance follow-up)

- Added `PI_FENCE_CONFIG=/path/to/pi-fence.config.json` as a process-local config override that loads one explicit file instead of the normal global/project config pair.

### Changed (CV9.E1 acceptance follow-up)

- `pnpm test:live` now defaults `PI_FENCE_CONFIG` to `tests/fixtures/live-config/kroki-sandbox.json`, starts the managed single-container Kroki sandbox when needed, and stops it only if the test run started it.
- Kroki live tests now compose processors through config, built-in factories, availability, and resolver policy, so the live suite can verify the managed local `kroki-sandbox` path without relying on public `kroki.io`.

### Added (CV9.E1.S5 — Bundle sandbox processor)

- Added `bundle-sandbox`, a sandbox-placement processor for `graphviz`/`dot` and `mermaid` backed by a labelled Docker exec container.
- Added the `pi-fence-bundle` image contract under `docker/bundle/`, with Graphviz, Mermaid CLI, Chromium runtime dependencies, a Puppeteer config, and `/opt/pi-fence-bundle/manifest.json`.
- `processorPrecedence: ["sandbox"]` can now render `dot` and `mermaid` through `bundle-sandbox` when the trusted `pi-fence-bundle` container is running, without host `dot`/`mmdc` binaries or Kroki HTTP.
- Added live tests for the real bundle container; they skip cleanly when Docker or the `pi-fence-bundle` container is unavailable.

### Changed (CV9.E1.S4 — Sandbox control contract)

- Config now accepts named sandbox controller policy under `sandboxes`, with default `bundle` and `kroki` entries. The default Kroki sandbox is a `service` using the existing single-container `docker-container` runtime; `docker-compose` is also supported for managed Kroki by CV9.E1.S6.
- `sandboxes.kroki.autoStart: true` with `runtime: "docker-container"` starts the existing Docker Kroki manager. Existing `kroki.docker.autoStart: true` configs remain supported as a compatibility alias.
- Docker Kroki lifecycle checks now require the expected `yuzutech/kroki` image and pi-fence ownership label before reporting readiness or running lifecycle commands; project sandbox `image` values are not executed by the current bridge.
- `/fence kroki stop` now reports non-zero `docker stop` / `docker rm` exits as errors with Docker's stderr and exit code instead of reporting success.
- `http://localhost:*` Kroki endpoints still resolve through `kroki-remote`; localhost alone does not make a processor sandbox-owned.

### Changed (CV9.E1.S3 — Blocked tags and processors)

- Config now accepts `blocked: { "tags": [], "processors": [] }` as the policy shape for explicit blocks.
- `blocked.processors` replaces the older top-level `disabled` config key; top-level `disabled` is no longer read or migrated.
- Project `blocked` policy replaces global `blocked` policy, while `processorPrecedence` remains restrictive across config layers.
- Resolver trace outcomes and binding issue reasons now use blocked-processor terminology for `blocked.processors`.
- Resolver policy now treats `blocked.tags` as canonical tag-family blocks, so aliases such as `dot` and canonical tags such as `graphviz` block the same family and override bindings.
- `/fence list`, `/fence doctor`, render logs, and extension rendering now receive blocked tag policy; blocked tags emit no render message and produce no processor I/O.
- `/fence list` shows blocked processors with `[blocked]`, includes a `Blocked tags` section, and reports bindings for blocked tags as `tag blocked` issues. `/fence doctor` includes blocked processors and tags in Issues.
- Processors whose advertised tag families are fully blocked are not probed at startup, preventing blocked host renderers from running availability shell commands.
- Startup binding diagnostics now classify bindings for blocked tags as `tag-blocked`, matching render-time and command diagnostics.
- Third-party processors registered after startup skip availability probes when all their advertised tag families are blocked.
- Kroki Docker auto-start is skipped when `kroki-remote` is fully tag-blocked.
- `/fence list` and `/fence doctor` report processors skipped by full tag-family blocks as `[blocked]`, not unavailable.

### Changed (CV9.E1.S2 — Object bindings and ambiguity)

- Tag bindings now use object selector values such as `{ "processor": "kroki-remote" }`; old string binding values are invalid and ignored with a config warning.
- Config validation accepts the CV9 binding selector shape and keeps processor-id normalization inside the explicit `processor` selector.
- Resolver binding policy now honors both exact processor selectors and placement selectors; exact processor selectors resolve same-placement ambiguity, while placement selectors preserve ambiguity when multiple processors in that placement match.
- `/fence list`, `/fence doctor`, and binding logs now report placement selector diagnostics, including disabled placements, no matching processor in the selected placement, and ambiguous placement matches. Unsatisfied bindings are grouped under `Binding issues`, and command diagnostics are computed from the current processor registry so dynamically registered processors are reflected.
- Binding dictionaries, legacy processor-id alias lookup, config privacy controls, selector fields, and processor aliases are hardened against prototype-chain data; resolver lookups only use own, validated binding entries.
- Unsatisfied object bindings now fail closed for that tag instead of falling through to another processor or placement.

### Changed (CV9.E1.S1 — Placement precedence tracer bullet)

- Built-in processor ids now include their trust/control placement: `table-embedded`, `highlight-embedded`, `qr-embedded`, `color-embedded`, `graphviz-host`, `mermaid-host`, and `kroki-remote`.
- Processor resolution now follows `processorPrecedence` (`embedded`, `host`, `sandbox`, `remote`) instead of registration order across placements. Omitting a placement disables that placement for resolution.
- Safety controls merge restrictively: higher-priority config can narrow placement policy and add disabled processors, but cannot widen lower-priority privacy settings. Known legacy processor ids in `bindings` and `disabled` are normalized to the new ids.
- Same-placement multi-candidate matches now produce an ambiguity result instead of silently selecting the first registered processor.

### Changed (CV8.E2.S1 — Shell processor render timeout)

- `graphviz-local` and `mermaid-local` renders now use the same 15-second default render timeout as Kroki, preventing hung local binaries from blocking the render loop indefinitely.

### Changed (CV8.E1.S2 — Shared render guards)

- Processor render guard logic is shared through `withSignalGuard` and `withRenderGuards`, removing duplicated abort and empty-input checks across the built-in processors.
- Abort errors now consistently report `Aborted before render`; aborts are treated as normal control flow and no longer emit processor warnings.

### Changed (CV8.E1.S1 — Resolution trace unification)

- `resolveProcessor` now returns structured resolution steps for every processor candidate and the agent-end pipeline logs them once per fenced block at debug level.
- Removed `/fence trace <tag>` and its separate trace algorithm. Use `PI_FENCE_LOG_LEVEL=debug` to inspect resolution diagnostics.

### Added (CV4.E2.S2 — Usage metrics)

- **`/fence stats`** shows per-session usage metrics: total renders, ok/error counts, and breakdowns by processor and by tag. Metrics accumulate from session start and reset on `/reload`.

### Added (CV4.E2.S1 — /fence trace)

- **`/fence trace <tag>`** shows step-by-step processor resolution for a given tag: which processors claim it, availability, bindings, disabled state, and which one wins. Useful for debugging why a block renders via one processor instead of another.

### Added (CV4.E1.S2 — "Write your own processor" guide)

- **[Write Your Own Processor](docs/guides/write-a-processor.md)** guide documents the `FenceProcessor` interface, event bus registration protocol, and a complete minimal example. Linked from getting-started.

### Added (CV4.E1.S1 — Third-party processor registration via event bus)

- **Third-party processor registration.** Other extensions can register processors with pi-fence by emitting `pi.events.emit("pi-fence:register", processorObject)`. No import of pi-fence code required — the event bus is the only coupling point.
- pi-fence validates the processor shape at the boundary, probes availability, and begins intercepting the new tags immediately.
- Confirmation event `pi-fence:registered` and rejection event `pi-fence:register-error` provide feedback to the registering extension.

### Added (CV3.E2.S2 — Color/palette swatch processor)

- **`color` processor** renders `color` and `palette` fenced blocks as ANSI truecolor swatches. Hex (#RGB, #RRGGBB, #RRGGBBAA), `rgb()`, `rgba()`, and 38 named CSS colors. Non-color lines pass through as labels. Each swatch is a colored filled block (██████) next to its value.
- Seven processors now ship: `graphviz-local`, `mermaid-local`, `table`, `highlight`, `qr`, `color`, `kroki`.

### Added (CV3.E2.S1 — QR code image processor)

- **`qr` processor** renders `qr` fenced blocks as QR code PNG images. The block content is the text to encode — URLs, Wi-Fi configs, arbitrary strings. Powered by the `qrcode` npm package, always available, no external service.
- Six processors now ship: `graphviz-local`, `mermaid-local`, `table`, `highlight`, `qr`, `kroki`.

### Added (CV3.E1.S2 — SQL/regex/jq syntax highlighting)

- **`highlight` processor** applies ANSI syntax highlighting to `sql`, `regex`, and `jq` fenced blocks. Hand-written tokenizers, standard 16-color ANSI codes, zero external dependencies.
- SQL: keywords, single-quoted strings, comments (`--` line, `/* */` block), numbers.
- regex: character classes, groups, quantifiers, anchors, escapes.
- jq: builtins, pipe/alt operators, dot accessors, strings, numbers, comments.
- Five processors now ship: `graphviz-local`, `mermaid-local`, `table`, `highlight`, `kroki`.

### Added (CV3.E1.S1 — CSV/JSONL table processor)

- **`table` processor** renders `csv` and `jsonl` fenced blocks as Unicode box-drawing tables in the terminal. First non-image processor — output is text, not PNG.
- **`FenceResult` text variant** — processors can now return `{ ok: true; text: string }` alongside the existing `{ ok: true; png: Buffer }`. Pipeline handles both automatically.
- CSV: comma-separated with RFC 4180 quoted fields, first row as headers.
- JSONL: union of all object keys as headers, missing keys → empty cells, non-primitive values → JSON-stringified.
- Four processors now ship: `graphviz-local`, `mermaid-local`, `table`, `kroki`.

### Added (CV2.E2.S2 — Docker Kroki auto-start)

- **`kroki.docker.autoStart: true`** in the config file starts the Docker Kroki container automatically on session init if it's not already running. The container stays running between sessions.

### Added (CV2.E2.S1 — Docker Kroki lifecycle commands)

- **`/fence kroki start`** pulls and starts a local `yuzutech/kroki` Docker container on port 8000. It manages the container only; set `kroki.endpoint` to `http://localhost:8000` to render through it.
- **`/fence kroki stop`** stops and removes the container. It does not rewrite `kroki.endpoint`.
- **`/fence kroki status`** reports running / stopped / absent.
- All three commands shell out to `docker` via the DI seam — no Docker SDK dependency.

### Added (CV2.E1.S1 — mermaid-local via mmdc)

- **`mermaid-local` processor** shells out to `mmdc` (@mermaid-js/mermaid-cli) for local mermaid rendering. Wins the `mermaid` tag when `mmdc` is on PATH; falls through to Kroki otherwise. Diagram source never leaves the host for this tag.
- Three processors now ship in the box: `graphviz-local`, `mermaid-local`, `kroki`.

### Added (CV1.E2.S2 — error follow-up to LLM)

- **Render errors are fed back to the LLM** via `deliverAs: "followUp"`. When a processor returns an error (Kroki 4xx, network failure, etc.), pi-fence sends a `pi-fence:error-followup` custom message so the LLM sees the error in the same turn and can self-correct. The follow-up is invisible to the user (`display: false`) — the red error panel from E2.S1 already shows the error.

### Added (CV1.E1.S3 — /fence doctor)

- **`/fence doctor`** prints a diagnostic summary: config file load status (loaded / not found / malformed), processor availability and status, effective bindings, and actionable issues. Surfaces install hints for unavailable processors and warns when disabled processors orphan tags.

### Added (CV1.E1.S2 — Kroki endpoint configuration)

Users can now point pi-fence at a local or self-hosted Kroki instance.

- **`kroki.endpoint`** in the config file (`~/.pi/agent/pi-fence.config.json` or `<cwd>/.pi/pi-fence.config.json`) sets the Kroki base URL. Default: `https://kroki.io`.
- **`/fence list`** shows the effective endpoint in parentheses next to the Kroki processor when it differs from the default.
- **Merge:** project `kroki.endpoint` overrides global when present; absent inherits.

### Added (CV1.E1.S1 — enable/disable processors)

Users can now disable processors by id in the config file.

- **`disabled: ["kroki"]`** in `~/.pi/agent/pi-fence.config.json` (global) or `<cwd>/.pi/pi-fence.config.json` (project) suppresses the named processor. Its tags fall through to the next available processor or produce no output if none remain.
- **Merge semantics:** project `disabled` replaces global entirely. An explicit empty array `[]` at project level re-enables everything the global config disabled. Absent key inherits from the lower-priority layer.
- **`/fence list`** shows disabled processors with a `[disabled]` badge, distinct from `[unavailable]`.
- **Bindings to disabled processors** are ignored with reason `processor-disabled`, shown in the `Ignored bindings` section of `/fence list`.

### Added (CV0.E1.S5 — Vega and Vega-Lite support)

Kroki's JSON-source visualisation languages now render through pi-fence.

- **`vega` and `vegalite` (alias `vega-lite`)** render inline via the same `text/plain` path as all other Kroki languages. Research against the public endpoint found that Kroki accepts raw JSON source without wrapping or content-type dispatch.
- **Excalidraw** moved to the SVG-only deferred set — the public endpoint refuses PNG for it (`400: Unsupported output format: png`).
- Live integration tests cover both new tags plus the `vega-lite` alias end-to-end.
- Canonical-source fixtures added for vega and vegalite with calibrated size floors.

### Added (CVx.E5.S1 — coverage and CRAP feedback)

Coverage and CRAP feedback now have two distinct loops, matching the repo's production-vs-broader-analysis split.

- **`pnpm test` now includes coverage for `extensions/**`** via Vitest's Istanbul provider. That same extension-focused coverage summary now appears inside `pnpm run verify:fast` because the fast gate still starts with `pnpm test`.
- **`pnpm run verify:fast` now prints a focused CRAP summary for `extensions/**`** before docs/type/dependency checks. It reuses `coverage/coverage-final.json` from `pnpm test` rather than rerunning the suite.
- **`pnpm run crap:ext`** exposes that same focused extension-only CRAP summary as a standalone command.
- **`pnpm run crap`** is the broader, non-blocking inspection pass. It reruns the non-live suite with coverage for `extensions/**`, `scripts/**`, `tests/unit/**`, `tests/contract/**`, `tests/extension/**`, and `tests/utilities/**`, then writes JSON + HTML reports under `crap-report/nonlive/`.
- **Provider choice is explicit: Istanbul, not V8.** Rationale: `crap-score` consumes Istanbul JSON directly and Istanbul matched function coverage correctly in this repo during evaluation.
- **Generated outputs are ignored**: `coverage/` and `crap-report/` stay local build artifacts.

### Added (CV0.E2.S2 — per-tag processor binding from settings)

CV0.E2's second and closing story. Users can now override pi-fence's default capability-based resolution per tag via a small config file, honouring D6 in the briefing at a minimum viable slice.

- **Two optional config files**, merged with project-over-global precedence:
  - Global: `~/.pi/agent/pi-fence.config.json`.
  - Project: `<cwd>/.pi/pi-fence.config.json`.
- **One config key for now** — `bindings`:

  ```json
  {
    "bindings": {
      "graphviz": "kroki",
      "dot": "kroki"
    }
  }
  ```

  Binding lookup is exact, not alias-aware — list both `graphviz` and `dot` if you want both routed through the same processor. Unknown top-level keys are tolerated silently (forward-compat with CV1.E1's future keys).
- **Bindings are preferences, not hard requirements**. A binding to an unavailable processor (e.g. `graphviz → graphviz-local` on a machine without `dot`) falls through to capability-based resolution; Kroki serves the block. `/fence list` shows the ignored binding in an `Ignored bindings` section with the reason (`processor unavailable` or `unknown processor`). Strict mode (respect unavailable, refuse fallback) defers to a follow-up story.
- **`/fence list` gains `Bindings` + `Ignored bindings` sections** when the config has any bindings. Empty config → same output as S1.
- **Inline `~50-LOC loader`** at `extensions/pi-fence/config.ts`. No new runtime deps. Every error path (missing file, malformed JSON, non-object top level, non-string values inside bindings) logs a warn and continues with defaults; a bad config can never take the extension down at startup. The briefing's D6 library adoption note (`@zenobius/pi-extension-config`) earns its reconsideration when CV1.E1 broadens the config surface.
- **`FenceProcessor` interface unchanged**. S2 touches `extensions/pi-fence/resolve.ts` only: `resolveProcessor` gains an optional `bindings` arg; new `resolveBindings` helper categorises each binding into effective / ignored with the reason for `/fence list`.

Test coverage grows by +40 cases (238 → 279 fast suite): 15 config-loader cases, 13 bindings-aware resolve + resolveBindings cases, 7 formatter section cases, 1 renderer viewport case, 5 extension-layer scenarios (global binding respected, project-overrides-global, unknown processor ignored, unavailable processor falls through, `/fence list` surfaces sections).

Docs: `README.md` (Processor registry section gains a binding paragraph + link to getting-started; Slash commands `/fence list` entry notes the Bindings section). `docs/getting-started.md` (new "Binding a tag to a specific processor" section with the canonical config shape + exact-lookup rule + preferences-not-requirements note + missing/malformed behaviour).

### Added (CV0.E2.S1 — local graphviz with capability-based resolution)

The second processor. pi-fence stops assuming a single processor and gains the registry pattern it has always pointed at. Behaviour delta:

- **`graphviz-local` processor**. Shells out to the local `dot` binary via `ShellRunner` (`dot -Tpng`, source on stdin). Claims the `graphviz` canonical tag + `dot` alias. On a machine with `graphviz` installed, DOT blocks render locally and zero HTTP traffic reaches `kroki.io` for that tag — privacy/offline work out of the box for DOT. On a machine without `graphviz`, `available()` returns `{ ok: false, reason, installHint }` and the extension falls through to Kroki for the same tag. Mermaid, PlantUML, blockdiag, and every other supported tag keep running through Kroki unchanged.
- **`FenceProcessor.available()` is now required**. Interface change in `extensions/pi-fence/processor.ts`. Kroki gets a trivial `{ ok: true }` impl (real endpoint-reachability probing lands with `/fence doctor`). Matches D4 in the briefing — every processor exposes its own capability check with a readable reason + optional install hint on the not-ok branch.
- **Capability-based resolution in registration order**. New `extensions/pi-fence/resolve.ts` module: `resolveProcessor(processors, availability, tag)` picks the first processor whose `available()` was ok and whose tags/aliases cover the tag. `probeAvailability(processors)` runs every probe once at wire time (catches thrown errors defensively so a contract-violating processor can't take the extension down at startup). `collectSupportedTags(processors)` derives the parser's fenced-block allowlist from the processor set — no more hand-maintained tag list. Registration order is the only piece of precedence CV0.E2 commits to; explicit per-tag user bindings from settings defer to CV0.E2.S2.
- **`/fence list` surfaces availability**. `ProcessorStatus` widens from `"registered"` to `"registered" | "unavailable"`. Unavailable processors render on two lines: the header with `[unavailable]` status bracket and an indented second line with the reason + install hint. On a machine without `graphviz`: `graphviz-local [unavailable] — graphviz (dot)` + `    dot binary not found on PATH. apt install graphviz · brew install graphviz · …` + `kroki [registered] — …`. The renderer paints the formatter's output verbatim — no new branch on kind.
- **`ShellResult.stdoutBuffer` (optional, binary-safe)**. `NodeShellRunner` switches to `encoding: "buffer"` and populates both `stdout` (UTF-8 decoded, lossy for binary) and `stdoutBuffer` (raw bytes, always set). `FakeShellRunner` leaves it unset; tests that assert on PNG bytes set it explicitly. graphviz-local reads PNGs out of `stdoutBuffer` with UTF-8 fallback for fakes. Option (b) from the S1 spec's deferred-decision list — widening the result rather than adding a sibling `runBinary()` method; ~30 LOC of plumbing, zero blast radius on existing callers.
- **Live integration test** at `tests/integration/graphviz-local.live.test.ts`. Runs real `dot` inside the `pi-fence-live-deps` container (which already ships `graphviz` from S0). Five cases: `available()` ok, happy-path PNG round-trip (magic bytes + size floor), `dot` alias round-trip, malformed-DOT error path, pre-aborted signal. Skips cleanly without Docker.
- **Test coverage grows from 181 to 239 fast-suite cases**. Breakdown: +2 contract shape assertions (Kroki contract picks them up automatically), +20 graphviz-local unit cases + 1 shell-runner self-test case, +9 graphviz-local contract cases (via the shared helper), +15 resolve/probe/collect-tags unit cases, +8 list/renderer unit cases for the status widening, +3 extension-layer cases for the two resolution branches + mermaid-unaffected sanity.
- **Default extension factory becomes async** — `createPiFenceExtension` awaits `probeAvailability` at wire time, and the production default export awaits the result. pi-coding-agent already supports async extension factories; existing test harnesses adopted `async` in a one-line edit.

Breaking change for downstream consumers who import `FenceProcessor` directly: every implementation must now provide `available()`. See `extensions/pi-fence/kroki.ts`'s one-liner for the trivial shape when capability detection is a no-op.

Docs: `README.md` ("What works today" grows the graphviz-local bullet + the processor registry section; "What does not work yet" drops local graphviz from the list), `docs/getting-started.md` (new "Going offline for DOT" section; `/fence list` sample updated to the two-processor shape), `docs/product/kroki-support.md` (graphviz row gains a "Local precedence" note).

### Added (post-CV0.E1.S4 follow-ups — shape-variation scenario + language gallery)

Two additions responding to the natural "now that we advertise 17 languages, what's the visual story?" question. Neither expands the per-language pixel-diff monitor; each targets a different real value without that cost.

- **`kroki-tall-image` render-verify scenario** (`29a95fc`). Trail composition with a visually-tall PNG (wireviz harness, ≥26 KB) + a long fenced YAML source in the assistant's reply. First *shape-variation* scenario — pressure-tests the trail layout at larger vertical extents than `mermaid-happy-path`'s near-square image. Fixture committed at `tests/fixtures/wireviz-harness.png`; default variant only (narrow deferred). Live suite 25 → 26 render-image cases; byte-identical across consecutive runs.
- **`pnpm render:gallery` entrypoint** (`9852937`). Renders one composition-level tile per canonical text-body Kroki language through the full trail, fetching fresh PNGs from `kroki.io` at runtime. Not a test gate: no goldens, no pixel-diff, no CI. Browsable HTML at `scripts/out/render-gallery/index.html`. Design-review / README-screenshot artefact. Uses a tall 120×140 viewport and post-render PNG cropping (via `pngjs`, already a dev dep) so every tile is as compact as its content allows (691–3041 px heights observed from a uniform 5160 px pre-crop). Documented in `docs/product/kroki-support.md` under a new "Browsing a live gallery" section.
- **Shared helpers promoted to `export`** — `buildTrail` and `PiFenceCustomMessage` in `scripts/verify/scenarios.ts`, reused by the gallery script. `renderGalleryHtml` gains an optional `{ title, emptyHint }` options bag so the gallery can set a bespoke document title without affecting `render:verify`'s default. Existing callers unchanged.
- **Why not 17 per-language render-verify scenarios?** The extended design discussion lives in `docs/process/worklog.md`'s corresponding 2026-04-20 entry. TL;DR: pi-fence's renderer doesn't branch on tag name, so 17 tag-dimension scenarios would mostly duplicate the composition signal with different image payloads and turn the Render Image test layer into a Kroki-content monitor. The shape-variation scenario + showcase gallery split those two values into the right shapes.

### Added (CV0.E1.S4 — full Kroki text coverage)

Every text-body language Kroki's public endpoint serves as PNG now renders through pi-fence, verified by a live integration test per language.

- **14 new canonical tags** accepted: `blockdiag`, `seqdiag`, `actdiag`, `nwdiag`, `packetdiag`, `rackdiag`, `c4plantuml`, `ditaa`, `erd`, `structurizr`, `symbolator`, `tikz`, `umlet`, `wireviz`. No new aliases — the research pass didn't turn up colloquial alternatives as established as `dot` / `puml` for any of the new languages; bespoke aliases ahead of real user demand would be guesses.
- **`tests/fixtures/kroki/canonical-sources.ts`** captures each supported language with a canonical minimal source, alias list, and a per-language `sizeFloorBytes` calibrated from the research-pass observations (catches Kroki's ~300-byte "error PNG" regression without over-constraining against version drift).
- **Live integration test refactored to data-drive from the fixture.** `tests/integration/kroki.live.test.ts` now iterates `KROKI_TEXT_LANGUAGES` instead of hardcoding per-language assertions. Adding a new language = edit the fixture. Live suite grew from 4 passing kroki cases to 25 (17 happy-path languages + 2 alias round-trips + error + cancellation + 4 unrelated pre-existing cases). Full live run ~17s on the calibration machine (dominated by `plantuml`, `c4plantuml`, `blockdiag`, `umlet` each in the 1–3s range).
- **`docs/product/kroki-support.md`** ships as the reference doc — tables for the 17 supported languages, the 8 SVG-only languages that are deliberately deferred, the 3 JSON-body languages scoped to CV0.E1.S5, and the 1 backend-unavailable language. README and `docs/getting-started.md` updated to link there rather than enumerating inline.
- **Extension test updated to derive from production constants.** The `/fence list` assertion in `tests/extension/pi-fence.test.ts` previously hardcoded a tag-list string; now imports `KROKI_CANONICAL_TAGS`, `KROKI_ALIASES`, and `formatProcessorLines` and asserts the listing reflects the live Kroki config. Future language additions no longer require updating this test.

### Removed (CV0.E1.S4 — breaking change from S2's allowlist surface)

- **`d2` dropped from `KROKI_CANONICAL_TAGS` / `SUPPORTED_TAGS`.** It was added in S2 but never had a live test — CV0.E1.S4's research pass turned up the reason: Kroki's public endpoint refuses PNG for d2 (`400: Unsupported output format: png for d2. Must be one of svg.`). Every user who wrote a ` ```d2 ` block was getting an error-kind `pi-fence:output` panel. Advertising a language that always errors is worse than not advertising it at all. Follow-up paths documented in `docs/product/kroki-support.md`: self-hosted Kroki (CV2.E2) or a future SVG→PNG rasterization story.

### Fixed (pi-fence:output — breathing row between header and content, sized per content kind)

The single `Spacer(1)` between the `Rendered <tag> via <processor>` / `Error rendering <tag> via <processor>` label and the content below produced a structurally-correct one-row blank at the cell grid, but the happy path's Kroki PNG has its own internal top margin — dark pixels indistinguishable from the terminal's black background — which visually absorbed that single blank row. The diagram boxes appeared to sit directly below the label with no breathing space.

- Fix, `extensions/pi-fence/renderer.ts`: peek at `message.content` up front to compute `hasImage`, and size the label→content spacer as `Spacer(hasImage ? 2 : 1)`. Image content (happy path) gets two blank cell-grid rows so one survives Kroki's PNG margin; text content (error path) keeps a single blank row — text glyphs paint from the first row of the content so one row is already plainly visible between the red header and the white body.
- The content-driven check is more robust than keying on `details.kind`: if someone ever sends text-only content with `kind: "ok"`, the spacing still matches the text reality.
- Shipped in two steps: first a uniform `Spacer(2)` bump across both paths, then tightened to the content-kind branch above after user feedback that the error path read as unnecessarily airy with two blank rows between header and body.
- Expanded-source path's internal `Spacer(1)` stays as-is (no scenario covers it today).
- Reported via a screenshot of `mermaid-happy-path / narrow` where the A/B/C boxes sat flush against the `Rendered mermaid via kroki` header. Another data point for the composition-level verifier surfacing issues that the isolated renderer would have hidden behind its tighter panel footprint.
- Goldens: happy/default, happy/narrow, error/default, error/narrow all recaptured; byte-identical across consecutive renders. Fast suite 181 → 181 (viewport assertions use `.includes()` on content substrings, not exact blank-row counts). Live suite 4 → 4 render-image cases.

### Fixed (pi-fence:output — error panel no longer duplicates its header phrase)

Every real pi user seeing a Kroki parse error saw two stacked lines:

```text
Error rendering mermaid via kroki              (red header)
Error rendering mermaid via kroki: <upstream>  (white body)
```

The renderer composes the red header from `details.{tag, processor, kind}` on its own — the text body passed through pi's custom message does not need to re-speak that prefix. The happy-path branch of `buildCustomMessage` in `extensions/pi-fence/index.ts` had already recognised this and dropped its fallback text item (the comment there reads: *"the renderer is authoritative … the fallback only produced the visible duplicate"*). The error branch was an oversight. Symmetric fix: emit just `result.error` as the body; comment made explicit so the invariant is harder to reintroduce.

- Reported by the user via a screenshot of the verifier's `mermaid-error-path` output — the composition-level scenario was producing a faithful rendering of pi-fence's production behaviour, and that fidelity exposed the latent redundancy. Exactly the kind of regression the composition-level framing is supposed to surface.
- `tests/unit/renderer.test.ts`'s error-path case tightens the fixture to just `'syntax'` as the body; existing assertions still pass because the `Error rendering mermaid via kroki` phrase comes from the renderer's header, not the body.
- `scripts/verify/scenarios.ts`'s `mermaid-error-path` scenario uses `'Parse error on line 1: unknown tag \'flowchrt\''` as the body — the raw upstream error with no prefix. Panel's red header and white body are now distinct rather than a duplicate. Goldens recaptured for both default and narrow; byte-stable across consecutive renders.
- Fast suite 181 → 181 (no count change; same assertions pass against the tightened fixtures). Live suite 4 → 4 render-image cases (goldens updated in place).

### Refined (test layer — composition-level Render Image scenarios across the board)

Post-close follow-up on CVx.E2.S4. S4 introduced the trail shape (user → assistant → pi-fence:output via pi-coding-agent's real interactive-mode components) on a single dedicated scenario; this refactor standardises *every* Render Image scenario on that shape.

- **Rationale.** The Render Image layer's job is "what does a pi user actually see?" — and a pi user never sees our renderer standalone, always wrapped inside a `CustomMessageComponent` below an `AssistantMessageComponent` and a `UserMessageComponent`. The isolated-renderer scenarios duplicated coverage the faster Render layer (`tests/unit/renderer.test.ts`, `tests/extension/pi-fence.test.ts`) already provides via `VirtualTerminal` byte-stream assertions, while missing the composition-level shape that catches bubble stacking, padding, theme-bleed, and custom-message-child regressions.
- **`scripts/verify/scenarios.ts`** gains `buildTrail(userText, assistantMarkdown, customMessage, variant)`. Both registered scenarios become thin wrappers: `mermaid-happy-path` (image content, Kitty APC present) and `mermaid-error-path` (text content, no APC, error-colored label + parse-error body). The `mermaid-user-agent-trail` scenario retires — its coverage folds into `mermaid-happy-path`, which is now the same composition. The `IDENTITY_THEME` stub is gone; scenarios use pi's real dark theme via `initTheme("dark")` inside the helper.
- **`mermaid-error-path` reflects the real user-visible shape.** User asks for a flowchart; assistant replies with a fenced block containing the `flowchrt` typo; pi-fence:output panel surfaces Kroki's parse error in the custom-message-wrapped error panel. Previously the error scenario rendered only pi-fence's error panel in isolation — the user never actually sees that without the surrounding turn.
- **Goldens recaptured** for all 4 combos (happy-path × [default, narrow], error-path × [default, narrow]) on the calibration machine (macOS 26.4.1 arm64, Chromium 1217). Byte-identical across two consecutive renders. The orphan `tests/fixtures/golden/mermaid-user-agent-trail/default.png` is deleted.
- **Teeth check.** Swapping the happy-path user text produces a 3901-pixel diff on both happy combos (budget=100); the error-path combos stay green (different user text). Reverting restores byte-identical output and all four combos return to green.
- **Fast suite 182 → 181** (-1 trail-specific invariant, superseded by `mermaid-happy-path` which IS now the trail). Live suite **5 → 4** render-image cases (-1 since the dedicated trail scenario retires; the two composition-level scenarios carry both width variants). Per-combo timings 143–263ms, ~20× under the 5000ms budget.
- **Narrow variant fit confirmed** for both scenarios — the trail stack + diagram / error panel both fit cleanly in 80×30.

### Refined (test layer — CVx.E2.S4 `mermaid-user-agent-trail` scenario)

Closes the last open CVx story by wiring a scenario that renders the full user → assistant → pi-fence:output visual through pi-coding-agent's real interactive-mode components, so the gallery and the pixel-diff gate catch regressions at the composition level (bubble stacking, padding, theme bleed) not just the pi-fence renderer in isolation.

- **New scenario `mermaid-user-agent-trail`** in `scripts/verify/scenarios.ts`. Composes pi-coding-agent's `UserMessageComponent` (prompt bubble), `AssistantMessageComponent` (assistant reply with a fenced mermaid block), and `CustomMessageComponent` wrapping pi-fence's own `createPiFenceMessageRenderer`. Root is a pi-tui `Container` painted through the existing `paintComponent` harness — same pipeline every other scenario uses; no new infrastructure.
- **Theme bootstrap via `initTheme("dark")`** inside `build`. Necessary because the pi-coding-agent components call `theme.fg` / `theme.bg` on pi's runtime theme singleton (a `Proxy` that throws `Theme not initialized.` if never initialised). Scenario-local, idempotent across repeated calls, no hidden test-runner setup. The builtin `dark` theme loads by name with no filesystem side-effect beyond pi-coding-agent's bundled `dark.json`.
- **Determinism pins.** `timestamp: 0` and zero `usage` on the synthetic `AssistantMessage` guard against drift if `AssistantMessageComponent` ever surfaces those fields in chrome. Two consecutive `pnpm render:verify --update` runs on the calibration machine produce byte-identical PNGs; three consecutive `pnpm test:live` runs report zero diff pixels on the new combo.
- **Single `default` variant (120×60).** Narrow variant deliberately deferred — S4's purpose is the composition-level shape, width variants on this scenario can follow if one proves bug-prone. Live suite case count 4 → 5 render-image cases.
- **Teeth check.** Swapping the user-prompt text produces a 4568-pixel diff against the committed golden, well above `DIFF_BUDGET=100`; reverting the text restores byte-identical output and the case returns to green. Confirms the new combo's diff gate actually bites, matching the S1 / S2 teeth-check pattern.
- **Golden calibration environment:** macOS 26.4.1 arm64, Chromium 1217 (playwright-core's pinned revision). Committed at `tests/fixtures/golden/mermaid-user-agent-trail/default.png`.
- **Fast suite 181 → 182** (+1 scenario-registry invariant: byte stream contains Kitty APC + single-`default` variant). Live suite 4 → 5 render-image cases, each asserting both pixel-diff and the 5000ms per-combo timing budget (new combo lands at ~421ms, ~12× under).
- **No new dev deps.** `pi-coding-agent` is already a peer dependency; the scenario uses its public exports only.

### Fixed (render-verify — image layer now overlays the text grid)

The "big gap between the label and the mermaid image" in `pnpm render:verify` output: `@xterm/addon-image` (beta ≥ 0.10) creates a canvas and appends it to `.xterm-screen` expecting it to overlay the text grid, but ships no CSS defining that positioning. The canvas inherits `position: static` and flows as a regular block element BELOW the screen in the page flow. Images drawn at buffer row 2 end up rendered at pixel row `screenHeight + (2 * cellHeight)` instead of `2 * cellHeight`.

- **Fix**: `tests/utilities/addon-image-overlay-fix.ts` exports `ADDON_IMAGE_OVERLAY_CSS`, a string constant containing the CSS that positions `.xterm-image-layer-*` absolute over `.xterm-screen`. `scripts/verify/pipeline.ts` injects it into the verifier's HTML `<style>` block. Fully client-side; no fork, no patch, no upstream dependency.
- **Recaptured goldens** for all four combos (happy/error × default/narrow) on the calibration environment (macOS arm64, Chromium 1217). Pixel-diff still zero across consecutive runs.
- **Found by** a user reviewing the rendered gallery; reported as "I see a big gap between the label and the diagram." DOM inspection showed the image canvas was at page y=925 while the xterm screen ended at y=900 — a 25-pixel gap plus the full screen height between them, which is exactly the symptom.
- **Upstream bug**: backlog entry at `~/me/mirror/backlog.md` for eventual report against `@xterm/addon-image`. The addon should either ship a stylesheet with the positioning rule or document it in its README as a required consumer-side rule.

### Refined (CVx post-close follow-ups)

Four of the eight follow-ups surfaced at CVx.E2.S3's close, batched into one block.

- **Spike scripts retired** (follow-up #7). `scripts/render-screenshot.ts`, `scripts/render-a11y-spike.ts`, `scripts/render-image-spike.ts` and the three matching `render:*-spike` package scripts are gone. Dev deps that only the a11y spike needed (`@wterm/dom`, `jsdom`, `@types/jsdom`) removed. `pnpm render:verify` is the one maintained entry point. Research history survives in git.
- **First real variant matrix** (follow-up #1). `NARROW_VARIANT` (80×30) exposed from `scripts/verify/scenarios.ts` alongside `DEFAULT_VARIANT` (120×60); both scenarios now declare both variants. `pnpm render:verify` runs 4 combos total. Goldens captured on the S1 calibration environment; the live suite gains 2 cases (6 → 8) each with the same pixel-diff + timing assertions.
- **Gallery polish** (follow-up #6). `GalleryCard` gains optional `goldenRelativePath`. Cards with a golden grow a `[data-showing]` toggle button that swaps the visible image between rendered and golden in place; the button label reads "Showing rendered — click for golden" and vice versa. All card images are click-to-zoom: a lightbox overlay opens full-size (respects the current toggle state), closes on click or `Escape`. Inline `<script>`, no external deps. `scripts/verify.ts` wires `tests/fixtures/golden/<scenario>/<variant>.png` into each card when the file exists. Fast suite: +2 gallery cases.
- **Live workflow activated for Render Image** (follow-up #4). `.github/workflows/live.yml` adds `npx playwright install --with-deps chromium` before the live test run so the Render Image suite has its browser. Workflow comments updated to name both live layers (integration + render-image) and flag the cross-OS `DIFF_BUDGET` carry-forward. Enabling PR / push triggers for the live workflow remains deliberately separate — Chromium + Docker per PR is ~3 extra CI minutes and warrants its own decision.
- **Fast suite**: 179 → 181 (gallery toggle / omit cases). **Live suite**: 6 → 8 (narrow variants). `pnpm run check` green throughout.
- Of the eight follow-ups from S3's close, four still stand: populate the theme matrix (only width variants added here), shrink `DIFF_BUDGET` based on cross-OS data, parallel combo rendering, `--watch` mode. Plus the upstream pi-mono PR at `~/me/mirror/backlog.md`.

### Refined (test layer — CVx.E2.S3 sentinel-based render readiness + timing budget)

Closes the CVx.E2 epic by dropping the pipeline's time-based wait in favour of deterministic observables and guarding the five-second-per-scenario budget in the live suite.

- **`scripts/verify/kitty.ts`** — `countKittyImages(bytes)` walks a byte stream counting Kitty graphics APC transmits (`a=T` / `a=t`). Query (`a=q`), delete (`a=d`), placement (`a=p`), and multi-chunk continuations (no `a=` param) do not count. Matches `@xterm/addon-image`'s internal "one `onImageAdded` per complete image" semantics. Unit-tested with 7 cases including real byte streams from both registered scenarios.
- **Pipeline sentinel wait.** `scripts/verify/pipeline.ts` no longer ends with `setTimeout(100)`. For each combo the pipeline counts expected images via `countKittyImages`, registers `ImageAddon.onImageAdded` (if images expected) and `Terminal.onRender` listeners BEFORE calling `term.write`, then `Promise.race`s the combined readiness against a 10-second hard bailout so a stuck pipeline surfaces as a slow-and-failing test rather than a hung process. Two trailing rAFs absorb residual layout settlement.
- **Timing instrumentation.** `RenderResult.durationMs` measures wall-clock from new browser context to screenshot flush. The CLI prints one `scenario / variant rendered in NNNms` line per combo and a `total: N combos in NNNms` summary. On the calibration machine, per-combo timings dropped from ~545ms to ~400–440ms (image-free scenarios especially, since the gone `setTimeout(100)` was the tail of their render).
- **Render-image timing budget.** `tests/render-image/verify.test.ts` asserts `result.durationMs < 5000` per combo. On this machine the two combos run at ~10x under budget; the assertion acts as a regression guard against accidental time-based waits creeping back in.
- **Determinism.** Three consecutive `pnpm test:live` runs after the sentinel change produce zero diff pixels on every combo. `DIFF_BUDGET` stays at 100 for CI-host headroom; the test file's comment explicitly names the S3 calibration run so a future reader sees both the current value and the observation that justifies shrinking further if needed.
- **Fast suite 172 → 179** (+7 kitty APC counter cases). Live suite count unchanged; the two existing render-image cases now carry a timing assertion in addition to the pixel-diff.
- **No new dev deps.** Everything is in-memory APC parsing and xterm.js/addon-image events.

### Refined (test layer — CVx.E2.S2 multi-scenario + gallery)

Widens S1's one-scenario verifier into a usable review surface.

- **Scenario registry** carries explicit `variants`. New `Variant { name, cols, rows }`. `build(variant)` replaces the dim-less `build()`; dimensions flow through pi-fence's `paintComponent` and xterm.js's viewport consistently. `DEFAULT_VARIANT` is the S1-era 120×60 shape.
- **New scenario: `mermaid-error-path`**. Exercises the error-rendering branch of `createPiFenceMessageRenderer`: text content (no image, so no Kitty APC in the byte stream), error label, synthetic parse-error body pinned for determinism. Previous `mermaid-happy-path` continues to exercise the happy-path image branch.
- **Pipeline** iterates `scenario × variant` combos. `expandCombos(scenarios)` flattens the product; `renderCombos(combos, outDir)` shares one Chromium across the batch. `RenderResult` gains `scenarioName` / `variantName` fields so gallery writers don't need to re-derive them. Output nests under `<outDir>/<scenario>/<variant>/render.png`.
- **`pnpm render:verify --variant <name>`** narrows a run to one combo. Without filter flags the CLI iterates every registered combo. `--update` walks every rendered combo, writing each PNG over `tests/fixtures/golden/<scenario>/<variant>.png`. Error cases (bad variant, variant without scenario) exit `1` with a message listing valid inputs.
- **HTML gallery** at `scripts/out/render-verify/index.html` after every run. Self-contained single-file document: dark-themed flex-wrapping grid of cards; each card shows the PNG, scenario and variant names, dimensions, and the monospaced relative path. No JS, no CDN, no external CSS.
- **Render Image test layer** iterates `expandCombos(listScenarios())` with the same `DIFF_BUDGET=100` / `threshold=0.1` S1 calibrated. Nested golden lookup at `tests/fixtures/golden/<scenario>/<variant>.png`. S1's existing golden migrated to `mermaid-happy-path/default.png` via `git mv` (content unchanged). `pnpm test:live` runs 2 render-image cases today (up from 1); each is green-skipped cleanly without Chromium.
- **No new deps.** `pngjs` / `pixelmatch` / Chromium from S1 still cover the whole story.
- **Spike 3 (`scripts/render-image-spike.ts`) picks `scenario.variants[0]`** so it keeps working through the variant refactor.
- **Theme / width matrix is not populated.** The plumbing (Variant shape, cross-product loop, nested golden layout, test iteration) is ready; each scenario ships exactly one variant today. A future story with real pressure can add terminal-theme or width variants without refactoring.

### Refined (test layer — CVx.E2.S1 headless image verifier)

Promotes the third CVx.E2 spike into a maintained verifier tool + its first live-suite test. The three spikes that preceded this (`2183665` live-Ghostty, `373a9e5` wterm + jsdom, `12e4e1d` xterm.js + Kitty + Chromium) mapped the tradeoff space; S1 picks the winner (spike 3's shape) and wires it into the project's test pyramid.

- **`pnpm render:verify`** — the maintained entry point. Flags: `--list`, `--scenario <name>`, `--update`, `--out <dir>`, `-h`/`--help`. Exit codes: `0` success, `1` bad args / unknown scenario, `2` pipeline failure. Output: `scripts/out/render-verify/<scenario>/render.png` + `render.bin` (captured byte stream alongside).
- **`scripts/verify/scenarios.ts`** — scenario registry with one entry today (`mermaid-happy-path`). Each scenario's `build()` produces a byte stream + terminal dimensions via the render-layer harness shared with the fast suite, preserving the "bytes verifier sees = bytes tests assert on" invariant across test layers.
- **`scripts/verify/pipeline.ts`** — headless xterm.js + `@xterm/addon-image` + `playwright-core` Chromium render + `page.screenshot()`. Chromium lifecycle is factored so `renderMany()` can amortise launch cost once S2 adds more scenarios.
- **Render Image test layer** — new `tests/render-image/verify.test.ts` runs under `pnpm test:live` alongside `tests/integration/`. For every registered scenario, pixel-matches the produced PNG against a committed golden at `tests/fixtures/golden/<scenario>.png`. `DIFF_BUDGET=100` pixels at `threshold=0.1`; calibrated against three consecutive byte-identical renders on the authoring machine (macOS arm64, Chromium revision 1217). On failure, writes a `diff.png` alongside the rendered PNG. Gated on Chromium availability so contributors without `npx playwright install chromium` green-skip rather than fail.
- **Committed golden** — `tests/fixtures/golden/mermaid-happy-path.png` (2560x2280, ~38 KB). Captured via `pnpm render:verify --update`. Future rolls of the Chromium revision or xterm.js metrics may require re-capture.
- **Dev dependencies** — `pngjs@^7`, `pixelmatch@^7` (both pure JS), plus `@types/pngjs`, `@types/pixelmatch`.
- **Principles Testing table** gains a `Render Image (live)` row between `Integration (live)` and the previous last entry, naming the exact dependency footprint and runner.
- **Spike 3 rewired** — `scripts/render-image-spike.ts` now drives the new library modules rather than carrying its own inline pipeline. The spike stays in the tree as a worked single-shot example; the maintained CLI is `pnpm render:verify`.
- **Fast suite guarded** — `pnpm test` now excludes `tests/render-image/**` in addition to the existing `tests/integration/**`, so the fast-suite runtime budget stays clean.

### Added (spike — CVx.E2 image render via xterm.js + Kitty graphics + headless Chromium)

Third pass at the CVx.E2 verification loop, closing the last gap the previous two spikes left open: actually seeing the rendered diagram as a real PNG, headlessly.

- **`scripts/render-image-spike.ts`** — drives a headless Chromium (via `playwright-core`) running xterm.js plus the `@xterm/addon-image` beta (which, unlike stable `0.9.x`, implements the **Kitty graphics protocol** that pi-fence emits). Playwright loads a tiny self-contained HTML host, injects xterm + the image addon from `node_modules/` via `addScriptTag`, writes our captured pi-tui byte stream into the terminal, waits for RAF-scheduled renders, then calls `page.screenshot()`. Output: `scripts/out/render-image.png` (ignored) + `scripts/out/render-image.bin` (the exact byte stream, alongside for inspection).
- **`pnpm --silent render:image-spike`** — entry point. One-time Chromium install via `npx playwright install chromium` (∼150 MB, cached globally at `~/Library/Caches/ms-playwright/`); subsequent runs reuse it.
- **Dev dependencies:** `@xterm/xterm@^6.1.0-beta.197`, `@xterm/addon-image@^0.10.0-beta.197`, `playwright-core@^1.59.1`. The addon's beta peer-depends on the beta xterm, so both are pinned to beta channel until the Kitty-graphics MVP lands in a stable release.
- **Test fixture:** `tests/fixtures/mermaid-flowchart.png` — a real Kroki-rendered mermaid diagram (324×70 px, ∼2 KB) fetched once via `curl https://kroki.io/mermaid/png?theme=dark`. The synthetic "magic + IHDR only" PNG the fast-suite tests use exercises pi-tui's dimension-parse path but has no IDAT chunk, so a real image decoder renders it as a placeholder; the spike uses a real PNG so the PNG-for-human-check actually shows the diagram.
- **Key invariant still holds:** the bytes the spike writes to xterm.js are produced by the same `paintComponent()` harness the fast suite uses, fed into a terminal emulator that shares its parser (xterm.js) with our `VirtualTerminal`-backed render-layer tests (via `@xterm/headless`). So: tests and screenshot paint from byte-identical streams, through parser-identical stacks, differing only in which renderer (headless grid vs. DOM + image addon) attaches.
- **Observed result (first run, inspecting `scripts/out/render-image.png`):** label "Rendered mermaid via kroki" lands at top with paddingX=1 indent; below it, with the vertical gap pi-tui's Image layout reserves, the mermaid diagram `A → B → C` renders in its full 324×70 resolution. Proves the byte stream's image-protocol half is correct end-to-end, not just the text-layout half the a11y spike covered.
- **Tradeoffs vs. the earlier spikes:** heavier than the a11y spike (Chromium download, no Kroki-free offline story), but produces a PNG (a11y spike did not) and is still headless + CI-compatible (live-terminal spike was neither). The three spikes together map the tradeoff space `CVx.E2.S1` will pick from.

### Added (spike — CVx.E2 wterm + a11y tree render verifier)

A second pass at the CVx.E2 dev-time-verify loop, taking a completely different tack from the live-terminal spike: feed pi-tui's byte stream into [wterm](https://github.com/vercel-labs/wterm) (Vercel Labs' new Zig+WASM web terminal emulator that renders to the DOM) inside jsdom, then read the rendered DOM directly to assert on "what a real VT terminal would display." No real Kitty window, no `screencapture`, no cursor-positioning racing against a shell prompt.

- **`scripts/render-a11y-spike.ts`** — sets up jsdom globals (ResizeObserver + requestAnimationFrame shims lifted verbatim from `@wterm/dom`'s own test setup upstream), captures pi-tui bytes via the shared `paintComponent()` harness, instantiates a `WTerm`, writes the bytes, lets the RAF-scheduled render fire, reads `.term-row` textContent per row, and dumps a JSON report on stdout + a human-readable summary on stderr.
- **`pnpm --silent render:a11y-spike`** — entry point. Stdout is pure JSON so snapshot-style tests can redirect to a file and diff.
- **Dev dependencies:** `@wterm/dom@^0.1.9` (and its transitive `@wterm/core` that ships a ~13 KB inlined WASM blob), `jsdom@^29.0.2`, `@types/jsdom`. No Chromium download; jsdom is a ~10 MB Node module. If a future story decides full browser a11y snapshots matter, the port from jsdom to Playwright is one `page.goto` + one `page.accessibility.snapshot`.
- **What the spike proves:** our byte stream parses correctly in a real VT100/xterm emulator — the "Rendered mermaid via kroki" label lands on row 0 of wterm's rendered grid, paddingX=1 indent intact. Automatable (exit 0, machine-readable report), offline, CI-friendly.
- **What the spike reveals:** wterm does not parse the Kitty graphics APC (`\x1b_G...\x1b\\`) — neither as a rendered image nor as an entry in `getUnhandledSequences()`. The APC payload leaks into the rendered grid as text on a subsequent row. Expected: wterm's README lists VT100/VT220/xterm parsing, not Kitty graphics. For text-layout verification this is fine; for image-rendering verification (the other half of CVx.E2), a different path is still needed (a Kitty-aware terminal emulator that also exposes an automation surface, or a real-browser + screencapture loop).
- **Comparison with the earlier live-terminal spike:** the live spike (`scripts/render-screenshot.ts`) failed in Ghostty because pi-tui's byte stream assumes it owns the terminal viewport; cursor positioning and stdin races fought against the surrounding shell. The a11y spike sidesteps both: pi-tui's stream enters a wterm instance with a clean 120×60 viewport and no interactive shell underneath, so the only failure modes are parser-level rather than lifecycle-level. That alone is a strong argument for making the a11y-tree approach the default in `CVx.E2.S1`'s eventual spec.

### Added (spike — CVx.E2 live-terminal render)

Minimal tracer for the dev-time screenshot loop that `CVx.E2` will formalise. Not a story, not a feature — a throwaway tool that de-risks the eventual spec by proving the path end-to-end.

- **`scripts/render-screenshot.ts`** — builds one canned pi-fence scenario (mermaid happy-path with a synthetic 1x1 PNG fixture), paints it through the same `paintComponent()` harness the fast suite uses, and writes the captured `LoggingVirtualTerminal` byte stream to `process.stdout`. Inside a Kitty-graphics-capable terminal (Kitty, Ghostty, WezTerm) the image renders inline; the user screenshots manually, then presses Enter to exit. Preamble goes to stderr so it doesn’t interleave with the captured bytes.
- **`pnpm --silent render:spike`** — entry point. `--silent` suppresses pnpm’s own script-preamble so stdout is purely pi-tui’s byte stream (useful for redirect-to-file captures). Without the flag the script still renders correctly; the preamble is just a text line above the panel.
- The spike’s key invariant: the bytes it emits to stdout are identical to the ones `tests/unit/renderer.test.ts` and `tests/extension/pi-fence.test.ts` assert on via `LoggingVirtualTerminal.getWrites()`. If the tests pass but the screenshot shows a broken render, the capture itself has a bug. If both pass, the fast suite’s assertions faithfully track what a real terminal paints.
- What is **not** in the spike: automated Kitty spawning, automated `screencapture`, multi-scenario gallery, sentinel-based readiness. Those are `CVx.E2.S1`–`S3` scope and will be specced once the spike informs the shape. For now, the tool answers the single question "is the test byte stream what the terminal actually paints?" — and leaves scenario multiplication, automation, and CI integration to the follow-up stories.

### Refined (test layer — CVx.E1.S1 render layer on `VirtualTerminal`)

The fast suite now asserts on real pi-tui emission instead of hand-rolled primitives. The eight post-S3 render-polish commits motivated the lane: each bug was caught by a human looking at a terminal, because the tests were asking our fakes if they were consistent with themselves. Replacing the fakes with real pi-tui components painting into `@xterm/headless` via `VirtualTerminal` closes that blind spot.

- **`tests/utilities/virtual-terminal.ts`** — vendored from `pi-mono@upstream/main aa1b587b` (source file last touched at `41377ee8`). Ships `VirtualTerminal` (xterm.js-headless-backed, implements pi-tui's `Terminal`) and a `LoggingVirtualTerminal` subclass that captures every write for byte-stream assertions. Header comment pins the source SHA and the re-sync policy (check once per CV). Imports `Terminal` from `@mariozechner/pi-tui`'s published surface; otherwise verbatim. When pi-tui exports `VirtualTerminal` from its entry point, the vendored file goes away.
- **`tests/utilities/force-capabilities.ts`** — thin wrapper over pi-tui's `setCapabilities` / `resetCapabilitiesCache`, pinning the cache to a Kitty-full shape so render-layer tests deterministically hit the image-protocol path regardless of the host terminal. Returns a disposer; self-test uses `detectCapabilities()` to prove the disposer isn't a no-op.
- **`tests/unit/renderer.test.ts`** rewritten. Hand-rolled `Box` / `Text` / `Spacer` / `Image` fake classes (~100 LOC) deleted. The five `createPiFenceMessageRenderer` / `createPiFenceListRenderer` cases now build the factory's tree with real pi-tui primitives, paint it through `TUI` into a `LoggingVirtualTerminal`, and assert on `getViewport()` + `getWrites()`. The happy-path case additionally asserts the Kitty graphics APC prefix (`\x1b_G`) lands in the write log — the teeth-check suggested by the plan's test guide (drop the `Image` child, observe the Kitty prefix disappear) passes. Pure-helper describe blocks (`formatLabel`, `hasSourceOverflow`, `clipSourceLines`) are unchanged.
- **`tests/extension/pi-fence.test.ts`** mermaid happy-path case extended. `buildSessionWithExtension` now wraps `pi.registerMessageRenderer` alongside `pi.sendMessage`, capturing the `pi-fence:output` renderer the extension registers against the real pi surface. The test paints the captured custom message through that renderer into a `LoggingVirtualTerminal` and asserts (1) the viewport shows `Rendered mermaid via kroki`, (2) `\x1b_G` appears in the write log, (3) the base64 payload inside that sequence decodes to exactly the fixture PNG bytes — end-to-end proof that the bytes flow FakeHttpClient → processor → custom message → registered renderer → pi-tui `Image` → Kitty encoder → terminal write stream, unchanged. No `AgentSession` terminal-injection seam was needed; the existing `ExtensionAPI` surface was sufficient.
- **`docs/product/principles.md`** Testing table gains a **Render** row between Extension and Integration (live), with `pi-tui in-process + @xterm/headless (dev dep)` as its dependency and `pnpm test` as its runner.
- **Dev dependency:** `@xterm/headless@^6.0.0`. pi-tui's own `devDependency`, not runtime, so it does not come transitively with the published package.
- Test count: 154 → 161 (+7 net: `virtual-terminal.test.ts` +5, `force-capabilities.test.ts` +2, `renderer.test.ts` unchanged at 17 while the render-layer half of it flipped from fake-composition to real viewport/write-log assertions, `pi-fence.test.ts` unchanged at 4 while the mermaid case grew three assertions).

### Added (docs — agent/contributor front door)

- `AGENTS.md` at the repo root. Short redirect-first guide that names the three authoritative sources (`docs/product/principles.md`, `docs/project/briefing.md`, worklog tail), the verification gate (`pnpm test`, `pnpm run check`, `pnpm test:live` when touching I/O seams), the story workflow (spec → implement → close), the commit-message conventions used in this repo (`spec <CODE>`, `step N: <why>`, `close <CODE>`, `wip(agent): <why>`), and the I/O-seam / fake / live-test discipline. Does not duplicate `principles.md`; redirects for anything substantive.

### Refined (post-CV0.E1.S3 render polish)

Eight small commits between S3's close and today tightening the rendered-diagram surface from "works" to "sits cleanly in the transcript." No new user-visible capability beyond what S1/S2/S3 already promised — this is refinement inside their territory.

- **Theme tracking.** Kroki request URL gains `?theme=dark` when pi's current theme name does not contain `light`, `latte`, or `day`. Heuristic catches `dark`, `tokyo-night`, `catppuccin-mocha`, `gruvbox-dark` without enumerating every theme. Theme is re-read at every turn, so switching themes mid-session takes effect on the next rendered block.
- **Tracing via env var.** `PI_FENCE_LOG_LEVEL` (default `info`, levels `debug|info|warn|error`) enables structured stderr logs on three channels: `[pi-fence:pi-fence]` for `agent_end` parsing, `[pi-fence:kroki]` for HTTP request/response/error, `[pi-fence:command]` for `/fence` dispatch. README's new **Tracing** section includes the `pi 2> /tmp/pi-fence.log` redirection recipe. User-facing `/fence trace` view still not built.
- **PNG actually renders inline.** The `pi-fence:output` renderer now reads the message's `content` array and composes `tui.Image` / `tui.Text` children per item. Before: chrome + details only, with the PNG hidden in `details`.
- **Width capped at 60 cells.** Matches pi-coding-agent's own `tool-execution` renderer convention. 80 swallowed the terminal on typical window sizes. Revisit when CV1.E1 ships user settings.
- **Chrome cleaned up.** Dropped the duplicate label text from the content stream (the renderer already draws the header); collapsed the bottom stripe caused by the Box's bottom padding; corrected the pi-tui `Box` constructor argument order (`paddingX, paddingY` — previous code used the wrong order and accidentally padded the wrong axis); dropped the `customMessageBg` closure from the Box so image rows blend with the terminal's native background instead of showing tinted seams around the PNG.

### Added (CV0.E1.S3 — `/fence list`)

- `/fence list` slash command: prints one readable line per registered processor (today only `kroki`), showing its status and accepted tags with aliases in parentheses, e.g. `kroki [registered] — mermaid, graphviz (dot), plantuml (puml), d2`. Offline, read-only; no network call.
- `/fence` dispatches on a first-token subcommand. `list` is the only subcommand today; unknown or empty subcommands surface a `ctx.ui.notify` warning naming the available ones.
- `extensions/pi-fence/list.ts` — pure `listProcessors(processors)` and `formatProcessorLines(listings)` helpers. Zero pi-SDK / pi-tui dependencies; shape scales to multiple processors.
- `extensions/pi-fence/renderer.ts` — new `createPiFenceListRenderer` factory for the `pi-fence:list` custom message type. Shares the `Box` + `Text` composition style with `pi-fence:output`. Expanded and collapsed render identically (no hidden detail today).
- `FenceProcessor` interface widened: every processor now declares `tags` (canonical names it handles) and `aliases` (alias → canonical map). Contract helper asserts every alias target appears in `tags`. Kroki exports `KROKI_CANONICAL_TAGS` and `KROKI_ALIASES` so `/fence list` reads them straight from the processor.
- `FakeExtensionAPI` gains a minimal `ui` field (captures `ctx.ui.notify` calls), an `invokeCommand(name, args)` helper, and six self-test cases covering them. First real consumer of `FakeExtensionAPI` beyond its own self-test: `tests/unit/fence-command.test.ts`.
- Extension-layer test dispatches `/fence list` through a real pi `AgentSession` (`session.prompt("/fence list")`) and asserts the `pi-fence:list` custom message reaches the transcript with no HTTP calls made.
- README gains a `Slash commands` section; the `What does not work yet` list drops `/fence list`.

### Added (CV0.E1.S2 — Other Kroki-supported diagrams)

- Extension accepts additional fenced-block tags: `graphviz`, `dot`, `plantuml`, `puml`, `d2`. `mermaid` continues to work.
- Kroki processor maps colloquial tags to canonical endpoints at request time (`dot` → `graphviz`, `puml` → `plantuml`). Canonical names (`graphviz`, `plantuml`) also work directly. Details panel and rendering label preserve the user's original tag — the alias is invisible to every surface except the outgoing URL.
- Four new unit cases in `tests/unit/kroki.test.ts` cover alias resolution.
- `tests/extension/pi-fence.test.ts` refactored: a `runExtensionWithAssistantText` helper removes the ~90 lines of per-case boilerplate. New case covers a `dot` block end-to-end (details.tag stays `dot` while the HTTP call hits `/graphviz/png`).
- `tests/integration/kroki.live.test.ts` gains a `dot` round-trip against real kroki.io.
- README and `docs/getting-started.md` updated to reflect the broader support.

### Added (CV0.E1.S1 — Mermaid via Kroki)

- `extensions/pi-fence/parser.ts` — pure `extractFencedBlocks(markdown, tags)`. CommonMark-narrowed: backtick and tilde fences, fence-length respect, up to 3 spaces leading indent, case-sensitive tag matching, info-string suffix preserved verbatim, CRLF normalised, unclosed fences ignored.
- `extensions/pi-fence/kroki.ts` — `createKrokiRenderer(http, endpoint?)` returning a `FenceProcessor`. HttpClient DI; 15-second internal timeout merged with caller's signal; 4xx/5xx bodies truncated to 500 chars in the error message; `AbortSignal.any` to merge signals.
- `extensions/pi-fence/renderer.ts` — custom message renderer for `customType: "pi-fence:output"`. Pure helpers (`formatLabel`, `hasSourceOverflow`, `clipSourceLines`) unit-tested; `createPiFenceMessageRenderer(tui)` composes pi-tui primitives around the image/error content pi already renders.
- `extensions/pi-fence/processor.ts` — `FenceProcessor` interface and `FenceResult` union. The first contract the project organises around. The registry arrives with CV0.E2 when a second processor lands.
- `extensions/pi-fence/index.ts` — default factory: production wiring with `NodeHttpClient` + `NodeLogger`. Exports `createPiFenceExtension(pi, deps)` as the test seam. Hooks `agent_end`, parses the assistant's text, renders up to 5 mermaid blocks per turn, emits `pi-fence:output` custom messages.
- `tests/contract/fence-processor.ts` — shareable contract helper `runFenceProcessorContract(label, factory, cases)`. Asserts id shape, Promise return, good-source success, bad-source structured error, pre-aborted signal safety.
- `tests/contract/kroki.contract.test.ts` — Kroki's conformance to the FenceProcessor contract via `FakeHttpClient`.
- `tests/extension/pi-fence.test.ts` — real-SDK pipeline test: `AgentSession` + `cannedAssistantStream` emits a mermaid block; asserts `pi-fence:output` is emitted with an image content item whose base64 decodes to the fixture PNG.
- `tests/integration/kroki.live.test.ts` — live integration against `https://kroki.io` via `NodeHttpClient`. PNG magic + size floor; error shape for malformed mermaid; AbortSignal safety mid-flight.
- `tests/unit/parser.test.ts`, `tests/unit/kroki.test.ts`, `tests/unit/renderer.test.ts` — unit suites for the three production modules.
- Three S0 exemplar tests removed as real S1 tests replaced them: `tests/unit/example.test.ts`, `tests/extension/example.test.ts`, `tests/integration/example.live.test.ts`.
- README and getting-started updated to describe the working happy path.


### Added
- Repository scaffold: docs structure, package metadata, extension entry point stub.
- pnpm as the package manager, pinned via `packageManager` field.
- `scripts/check-links.ts`: validates internal markdown links and heading fragments. Runs via `pnpm run check`.
- `markdownlint-cli2` with minimal config, covering structural markdown (headings, lists, code blocks, whitespace). Runs via `pnpm run check:markdown`. Auto-fix via `pnpm run fix:markdown`.
- Framework: `Verifiability` Community Value type capturing "correctness is provable by automation"; cross-cutting, earned tacitly by feature stories and explicitly by testing-infrastructure stories.
- Framework: mandatory `Tests` section in every story's `plan.md`.
- Spec: `CV0.E1.S0` — Testing foundation. Story docs (`README.md`, `plan.md`, `test-guide.md`) describing vitest setup, the four-layer `tests/` tree, `ShellRunner` / `HttpClient` / `Logger` with fake and node impls, `FakeExtensionAPI`, `docker/Dockerfile` (graphviz only), `scripts/live-container.ts`, GitHub Actions workflow skeletons, and exemplar tests at each layer.
- Spec: `CV0.E1.S1` — Mermaid via Kroki plan rewritten to be test-first throughout, with `HttpClient` injection for `kroki.ts`, a mandatory `Tests` section enumerating layers and coverage, and deletion of the S0 exemplar tests as they are replaced by real S1 tests.
- Implementation (CV0.E1.S0): vitest setup, `tests/` tree (`unit/`, `contract/`, `extension/`, `integration/`, `utilities/`, `fixtures/`), `temp-dir` helper enforcing `os.tmpdir()`-only writes, three I/O-seam interfaces with Node and Fake impls (`ShellRunner`, `HttpClient`, `Logger`), `FakeExtensionAPI` covering the `ExtensionAPI` slice pi-fence needs near-term, `DockerExecShellRunner` composing `NodeShellRunner`, `live-deps` detection helpers (`hasDocker`, `hasContainer`, `hasNetwork`).
- Implementation: `docker/Dockerfile` based on `node:22-slim` with graphviz only; `scripts/live-container.ts` with `up`/`down`/`status`/`exec`/`build` subcommands; pinned image tag `ghcr.io/henriquebastos/pi-fence-live-deps:0.1.0`.
- Implementation: `scripts/refresh-fixtures.ts` skeleton (throws until S1 implements it).
- Implementation: `.github/workflows/ci.yml` and `live.yml` — committed dormant, activate when the repo goes public.
- Implementation: exemplar tests at the unit, extension, and integration layers. All three are placeholders deleted by S1 when real tests replace them.
- Scripts: `test`, `test:watch`, `test:live`, `test:all`, `live:up`, `live:down`, `live:status`, `live:exec`, `live:build`, `refresh-fixtures`.
- Docs: `docs/getting-started.md` gains a full Development section with prerequisites, clone steps, fast/live test runners, watch mode, scripts reference, CI note, test layout.
