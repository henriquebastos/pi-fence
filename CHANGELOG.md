# Changelog

All notable changes to this project will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
