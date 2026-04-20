# Changelog

All notable changes to this project will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
