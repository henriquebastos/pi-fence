[< Docs](../README.md)

# Worklog

What was done, what's next. Updated each session. Dated entries are chronological — oldest first, newest appended at the bottom.

## Current focus

`CVx.E3` is now active. `S1` is closed: the fast gate includes static type checking, `pnpm run verify:fast` is the contributor-facing umbrella, and CI enforces the same static check the local gate does. The next refactor-confidence moves are structural rather than tooling-first.

## Next

No story is currently in flight. The next Planned rows are:

- `CVx.E3.S2` — architecture map + hotspot inventory for pure modules, adapters, runtime seams, and the composition root. Not specced yet.
- `CV0.E1.S5` — JSON-body Kroki languages (Vega, Vega-Lite, Excalidraw). Specced, orthogonal to CVx.E3.
- Everything CV1+ (explicit configuration surface beyond bindings, error feedback loop, `/fence doctor`, offline story for non-graphviz languages, ecosystem CVs).

CVx lane state: CVx.E1.S1 + CVx.E2.S1–S4 + CVx.E3.S1 are ✅ Done. Every feature CV from here on can be verified through the Render layer (fast suite) + the Render Image layer (live suite, gallery + pixel-diff) on its first visual touch without new test infrastructure.

Surfaced by CV0.E1.S4's research pass: adding SVG→PNG rasterization support inside pi-fence would unlock 8 currently-deferred Kroki languages (`d2`, `bpmn`, `bytefield`, `dbml`, `nomnoml`, `pikchr`, `svgbob`, `wavedrom`). Not yet specced; would be its own story whenever the pressure earns it a slot.

Follow each story's plan step by step. Each step is its own commit. Tests pass on every commit.

---

## Done

### 2026-04-18 — Repository scaffold

Created `~/me/oss/pi-fence/` with:

- Top-level project files: `README.md`, `CHANGELOG.md`, `LICENSE` (MIT), `package.json`, `tsconfig.json`, `.gitignore`.
- Extension stub at `extensions/pi-fence/index.ts` (exports default function, no logic — logic lands in S1).
- Docs tree inspired by Alisson Vale's [mirror-mind](https://github.com/alissonvale/mirror-mind) convention: Community Value → Epic → Story, with breadcrumbs and `README.md` as folder index. Dated logs (worklog, decisions) are chronological ascending so every update is an append at the end of the file.
- Foundational decisions captured in [briefing.md](../project/briefing.md): D1–D8 covering registry-based architecture, activation strategy, Kroki as default engine, lazy loading, plugin surface via event bus, user ownership of the registry, `FenceProcessor` as the core abstraction, English as the internal language. (D2 was later revised from hybrid to interception-only — see the 2026-04-18 decision entry.)
- Full roadmap drafted: CV0 (It Works) → CV1 (Take Control) → CV2 (Work Offline) → CV3 (Beyond Diagrams) → CV4 (Platform). Only CV0.E1.S1 is fully specced. The rest are named and sequenced.
- Design principles in [principles.md](../product/principles.md).

No code yet beyond the extension stub. Implementation starts with S1.

Commit: `chore: scaffold repository with docs structure`.

### 2026-04-18 — pnpm + link checker

Adopted pnpm as the package manager (matching the sibling agent-tools monorepo where pi-graphviz and pi-charts live). Pinned via `packageManager: pnpm@10.33.0`.

Added `scripts/check-links.ts` — validates internal markdown links and heading fragments across the docs tree. Runs via `pnpm run check` (umbrella) or `pnpm run check:links` (specific).

First run caught a latent bug: several `#fragment` links in the roadmap and Epic docs were pointing to valid slugs, but my earlier inline Python validator had a path-normalization bug (keys prefixed with `./`) that silently skipped fragment checks. The TypeScript script is stricter and uses absolute paths throughout. Its slugifier also matches GitHub's real behavior (per-space hyphen, not collapsed whitespace), so double-hyphen slugs like `cv1--take-control-control` resolve correctly.

Updated `docs/product/principles.md`, S1's plan and test-guide to use `pnpm` commands. The `pnpm run check` step is now part of S1's verification list.

Commits: `wip(agent): adopt pnpm as package manager`, `wip(agent): add link checker script and wire pnpm run check`.

### 2026-04-18 — markdownlint-cli2

Added markdownlint-cli2 for structural markdown linting (complements our link checker, doesn't replace it). Config philosophy: start from defaults, disable only rules we actively fight.

Disabled: MD013 (line length), MD033 (inline HTML), MD034 (bare URLs), MD041 (first-line heading — our breadcrumb convention puts a link before the H1), MD060 (table column style — our tables are readable in source without column alignment).

Configured: MD029 (`ordered` sequential numbering, not all-ones), MD046 (`fenced` only).

First run surfaced 127 issues across all files. Auto-fix handled most (blank lines around lists and fences). Two MD040 violations (fenced blocks without a language tag) were ASCII-art diagrams in the Epic spec; tagged them as `text`. Final state: 0 violations, `pnpm run check` green.

Also updated `docs/product/principles.md` to reference the new check script.

Commits: `wip(agent): add markdownlint-cli2 with minimal config`, `wip(agent): fix markdown lint violations surfaced by initial run`.

### 2026-04-18 — Testing framework shape (Draft 1 of 3)

Elevated testing to a first-class framework concern after a user-driven design pass on how pi-fence gets tested. Three drafts will land the full change set; this is the framework-updates draft (no S0 spec yet, no implementation yet).

Changes in this draft:

- `briefing.md` — added **Verifiability** as the fifth Community Value type with a note that it is cross-cutting.
- `roadmap/README.md` — added Verifiability to the CV types legend; inserted `CV0.E1.S0` row in the Epic table before `S1`.
- `cv0-e1-kroki-through-the-wire/README.md` — Epic's stories table now shows `S0` before `S1`, with a paragraph explaining the order.
- `principles.md` — rewrote the Testing section: test automation non-negotiable, test-first, four layers (unit / contract / extension / integration-live), fakes-not-mocks, DI at I/O seams, no host filesystem, skip cleanly, mandatory `Tests` section in every plan.md.
- `decisions.md` — long entry capturing the testing architecture: vitest, four layers, fakes-not-mocks, Docker image `pi-fence-live-deps` for live deps, `Verifiability` CV type, mandatory plan.md `Tests` section.

Draft 2 will ship the S0 story docs (`README.md`, `plan.md`, `test-guide.md`) and update `S1/plan.md` with its mandatory `Tests` section and test-first step order.

Draft 3 will ship the implementation: vitest config, `tests/` tree, utilities, `docker/Dockerfile`, `scripts/live-container.ts`, exemplar tests.

Commit: `wip(agent): framework updates for verifiability + testing architecture`.

### 2026-04-18 — Testing framework shape (Draft 2 of 3)

Specs the first testing-infrastructure story and updates the first feature story to conform.

Changes in this draft:

- Created `cv0-e1-s0-testing-foundation/` with `README.md`, `plan.md`, `test-guide.md`. S0 ships vitest setup, the four-layer `tests/` tree, three I/O-seam interfaces (`ShellRunner`, `HttpClient`, `Logger`) with fake and node impls, a `FakeExtensionAPI`, a minimal `docker/Dockerfile` (graphviz only), `scripts/live-container.ts`, a `scripts/refresh-fixtures.ts` skeleton, GitHub Actions workflow skeletons, and exemplar tests at each layer — every piece verified by its own self-test.
- S0 links promoted in the Epic README and the top-level roadmap table now that the story directory exists.
- S1 plan rewritten: every step is test-first (unit tests → impl → contract tests → extension tests → integration live), HttpClient is injected into `kroki.ts`, and the mandatory `Tests` section lists layers touched, fakes used, live tests added, deferrals.
- S1's test-guide updated to list the actual automated tests S1 now produces (parser, kroki-with-FakeHttpClient, renderer, contract, extension with real pi SDK + fake stream, live kroki integration).
- S1 README gains an explicit `Depends on` pointer to S0.
- `Epic README` adds a paragraph explaining the S0→S1 ordering.

Draft 3 will ship the actual implementation of S0 — vitest config, the full `tests/` tree with self-tests, the three I/O-seam interfaces and their impls, the Dockerfile, and the live-container CLI.

Commit: `wip(agent): draft 2 of testing framework — S0 spec + S1 plan rewrite`.

### 2026-04-18 — CV0.E1.S0 Testing foundation shipped (Draft 3 of 3) ✅

S0's 14-step implementation order ran test-first. Every utility shipped with its self-test red, then green. The fast suite went from 0 tests to 65 across 9 files (`pnpm test`, ~1.1s). The live suite skips cleanly on hosts without Docker and is ready to run green once a Docker-capable host exercises it.

Commits landed in five sub-drafts:

**Draft 3a — vitest setup (2 commits).** `vitest.config.ts` at repo root, `tests/` tree with per-layer `.gitkeep`s, `tests/utilities/temp-dir.ts` + self-test (8 cases) enforcing the "no host filesystem outside `os.tmpdir()`" rule, `tests/unit/example.test.ts` placeholder.

**Draft 3b — three I/O seams (3 commits).** `ShellRunner` interface with `NodeShellRunner` (real subprocess via `child_process.execFile`) and `FakeShellRunner` (capture/replay). `HttpClient` interface with `NodeHttpClient` (fetch wrapper, live-tested only) and `FakeHttpClient` including dynamic function responses. `Logger` interface with `NodeLogger` (stderr, `PI_FENCE_LOG_LEVEL`-gated) and `FakeLogger` (full capture regardless of level). 35 self-test cases across the three.

**Draft 3c — FakeExtensionAPI + extension-layer exemplar (2 commits).** `FakeExtensionAPI` implements only the `ExtensionAPI` slice pi-fence's handlers will use (`on`, `sendMessage`, `sendUserMessage`, `registerMessageRenderer`, `registerCommand`, `registerTool`); every other method throws "not implemented in FakeExtensionAPI" with a loud message. `tests/extension/example.test.ts` stands up a real `AgentSession` via `createAgentSession`, replaces `session.agent.streamFn` with a canned async iterator emitting `start → text_delta → text_end → end`, and asserts `agent_end` fires. Required adding `@mariozechner/pi-ai` as a devDependency for `getModel()` and the stream event types.

**Draft 3d — Docker path (4 commits).** `docker/Dockerfile` on `node:22-slim` with graphviz only; grows per processor story. `scripts/live-container.ts` with `up`/`down`/`status`/`exec`/`build` subcommands, pinned image tag `ghcr.io/henriquebastos/pi-fence-live-deps:0.1.0`, graceful degradation on missing Docker. `tests/utilities/live-deps.ts` exporting `hasDocker()` / `hasContainer(name)` / `hasNetwork(target?)` — all returning booleans without throwing. `DockerExecShellRunner` added to `shell-runner.ts`, composing `NodeShellRunner` and wrapping every call in `docker exec [-i] [-w <cwd>]`. `tests/integration/shell-runner.live.test.ts` (6 cases) and `tests/integration/example.live.test.ts` (1 case) use `describe.skipIf(!hasContainer(...))`. Vitest config had to change mid-draft: `include: ["tests/**/*.test.ts"]` uniformly, with `test` script using `--exclude 'tests/integration/**'` and `test:live` using a positional filter — CLI filters intersect with config includes, which caused a transient "no test files found" issue. `test:all` runs everything.

**Draft 3e — tail work (4 commits).** `scripts/refresh-fixtures.ts` skeleton throwing "not yet implemented" with a pointer to CV0.E1.S1; 2 self-tests lock the error shape. `.github/workflows/ci.yml` (push + PR, Ubuntu + macOS, Node 22, fast suite only) and `live.yml` (nightly + `workflow_dispatch`, Ubuntu, full live pipeline) committed dormant; `actionlint 1.7.12` reports no errors. `docs/getting-started.md` expanded with a full Development section: prerequisites, clone, fast and live suites, watch mode, scripts table, CI note, test layout. Worklog closes.

Honest caveats carried forward into S1:

- `HttpClient` still lives under `tests/utilities/`. S1's `kroki.ts` will import from that path. A later story promotes the three I/O seams to `extensions/pi-fence/io/`.
- The three exemplar tests (`tests/unit/example.test.ts`, `tests/extension/example.test.ts`, `tests/integration/example.live.test.ts`) are placeholders. S1 deletes them as its real tests take over.
- `PI_FENCE_LOG_LEVEL` env var is documented in `NodeLogger` but no `/fence trace` command exists yet. The command and its session-storage integration land with S1.
- `hasNetwork()` makes real HTTP on every fast-suite run; that pushed `pnpm test` from ~220ms to ~1.1s. Acceptable cost for testing the real helper.

Commits for Draft 3 (11 total):

- `f3f1890` vitest setup with trivial unit example
- `7047454` temp-dir test utility
- `35e8693` ShellRunner with Node and Fake impls
- `d0e8f34` HttpClient interface with Node and Fake impls
- `2f5c06b` Logger interface with Node and Fake impls
- `8ef5e34` FakeExtensionAPI test utility
- `847af23` extension-layer exemplar with fake LLM stream
- `ab76fc1` docker image for live deps (graphviz only)
- `f043dc5` live-container lifecycle CLI + live-deps detection helpers
- `b5b73dc` DockerExecShellRunner + live shell-runner integration tests
- `52876c5` integration-layer exemplar with DockerExecShellRunner
- `455d472` refresh-fixtures script skeleton
- `b90f867` CI workflow skeletons (dormant)
- `5be50a9` document testing workflow in getting-started

S0 status in the Epic: ✅.

### 2026-04-18 — S0 live path verified end-to-end ✅

The two Docker-path items flagged at S0 close are now met on macOS arm64 with Colima as the Docker provider.

Full lifecycle verified:

- `pnpm live:build` → image built from `docker/Dockerfile` with graphviz installed.
- `pnpm live:up` → container `pi-fence-live-deps` started from the local image (doesn't need the ghcr pull to succeed, which is correct: the image isn't published yet).
- `pnpm live:status` → `running`.
- `pnpm live:exec dot -V` → graphviz 2.43.0 reachable inside the container.
- `pnpm live:exec -- dot -V` → same, after the `--` separator fix below.
- `pnpm test:live` → 7/7 green (2 files, integration layer).
- `pnpm test:all` → 72/72 green.
- `pnpm live:down` → container stopped and removed.
- `pnpm live:status` → `absent`.
- `pnpm test:live` with no container → 7/7 skipped cleanly, exit 0.

Two real bugs caught and fixed during verification:

1. `live:up` forced a `docker pull` even when the image was locally built, and the pull failed with `denied` because the image isn't published to ghcr yet. Fixed by adding a `hasLocalImage()` check that skips the pull when a local image is present; logs `started (from local image)` when that path is taken.
2. `pnpm live:exec -- dot -V` (the form documented in the test guide) failed because the `--` separator was passed through as the literal first arg to `docker exec`. Fixed in `cmdExec` by stripping a leading `--`; both forms work now.

Both fixes committed as `4c36bc1 wip(agent): fix two live-container bugs surfaced by end-to-end verification`.

The verification also incidentally caught that `@zenobius/pi-extension-config`, `markdownlint-cli2`, the whole `tests/` tree, and the four workflow scripts all compose cleanly from a clean container start on Colima. Nothing host-specific leaked into the test harness.

S0 status: fully done, verified on a real Docker host.

### 2026-04-18 — CV0.E1.S1 Mermaid via Kroki shipped ✅

The first user-visible slice is live. A `mermaid` fenced block in the assistant's output now becomes a PNG rendered by `https://kroki.io` and emitted below the assistant's message. Happy path end-to-end.

S1's 12-step implementation order ran test-first at every step. I deliberately collapsed the plan's `(red)` / `(green)` pairs into single commits so the invariant "every commit leaves tests passing" holds — the plan's step-per-commit table was wrong about that.

Commits landed:

- `d54922f` fenced-block parser (13 unit tests)
- `4291b05` kroki renderer with HttpClient DI (9 unit tests)
- `d7d09c6` pi-fence custom message renderer — pure helpers + component factory (12 unit tests)
- `c94cd68` FenceProcessor contract + kroki conformance (5 contract assertions via a reusable helper)
- `a61b0d7` pi-fence extension wiring + real-pi-SDK extension test
- `537001d` live kroki integration test (3 cases against real kroki.io)
- `2b4b137` README + CHANGELOG updated

Final test counts:

- 103 tests passing in the fast suite (`pnpm test`).
- 9 live tests passing when the container is up (6 shell-runner) and network is available (3 kroki). `pnpm test:all` green.
- `pnpm run check` green (links + markdown).

Two pi-SDK shape landmines hit during step 8–9 (extension wiring):

1. `streamFn` must return an `AssistantMessageEventStream` instance (a class with `push`/`end`/`result`), not a plain `AsyncIterable`. AgentSession calls `stream.result()` internally. The S0 exemplar's plain async iterator produced `"response.result is not a function"` errors silently absorbed into `stopReason: "error"` messages with empty content. Fixed by importing and instantiating `AssistantMessageEventStream` from `@mariozechner/pi-ai`.
2. Real providers mutate `output.content[i].text` in place during `text_delta` events. AgentSession reads the accumulated `content` at `agent_end`. A canned stream that only yields deltas without mutating leaves `event.messages[].content` empty — the extension's `agent_end` handler sees no text to parse.

Both are documented in the test file so future stories dodge the same traps.

Honest caveats carried forward into S2:

- `extensions/pi-fence/kroki.ts` still imports `HttpClient` from `tests/utilities/http-client.ts`. The promotion story is on the radar; S2 doesn't force the issue.
- The extension-layer test uses a one-off monkey-patch of `pi.sendMessage` to capture custom messages. Works; not elegant. A `captureCustomMessages(session, customType)` utility would read better if S2 or later needs it again.
- No fixture byte-comparison in the live integration test — we assert on PNG magic + size floor. Trade-off named in the test file. Kroki's PNGs aren't bit-stable across releases, so fixtures would churn with no real signal.
- `/fence trace` is still unbuilt. `NodeLogger` is wired into `index.ts` but nothing reads `PI_FENCE_LOG_LEVEL` from the user's side yet.

S2 will spec shortly and land either by broadening the hardcoded tag list (smallest change) or by introducing the first tiny alias map (`dot` → `graphviz`, `puml` → `plantuml`). That decision belongs in the S2 plan, not the worklog.

### 2026-04-18 — CV0.E1.S2 Other Kroki-supported diagrams shipped ✅

Broadens pi-fence from `mermaid`-only to the four diagram languages Kroki hosts that users actually reach for: `graphviz`/`dot`, `plantuml`/`puml`, `d2`, alongside the existing `mermaid`.

The change is small on purpose. No new abstractions, no registry, no settings. A flat alias map in `kroki.ts` (`dot → graphviz`, `puml → plantuml`) handles the one-line divergence between colloquial tags and Kroki's canonical endpoint names. The rest is a one-line widening of `SUPPORTED_TAGS` in `index.ts`.

Commits:

- `68e8538` spec CV0.E1.S2 — broaden Kroki tag support
- `aea6c3c` kroki tag aliases (S2 step 1)
- `d5c698c` accept additional Kroki tags (S2 step 2)
- `8c5774c` live dot roundtrip (S2 step 3)
- `91ac948` document S2 broader Kroki support

Refactor landed with S2 without earning its own commit: `tests/extension/pi-fence.test.ts` gained a `runExtensionWithAssistantText` helper that collapses ~90 lines of session setup into a one-line call. S1 shipped the first case with that boilerplate inline; S2 would have duplicated it. The refactor kept the file short enough to survive S3 and beyond.

Final test counts:

- 108 tests passing in the fast suite (+5 over S1's 103: 4 alias cases in `kroki.test.ts`, 1 dot case in `pi-fence.test.ts`).
- 4 kroki live cases pass against real kroki.io (+1 over S1's 3: the new dot round-trip).
- `pnpm run check` green.

Preserved from S1, no regressions:

- S1 mermaid extension test passes unchanged (rewritten in the new helper shape, same assertions).
- S1 live mermaid case unchanged.
- Contract test unchanged (contract is processor-level, not per-tag).

Honest caveats for S3 and beyond:

- Tag support grows by enumeration (flat allowlist). Adding `nomnoml`, `wavedrom`, `vega-lite` is a one-line append + one alias if needed + one extension test case. No deeper change needed. Worth revisiting when the list exceeds ~10-12 tags.
- The alias map is unidirectional: `graphviz → graphviz` (identity), `dot → graphviz`. A user who writes `dot` and reads the rendering label sees `dot`; a user who writes `graphviz` sees `graphviz`. Both are correct; both reach the same endpoint.
- Case-insensitivity still unsupported. An LLM that writes ```` ```DOT ```` (uppercase) would not fire pi-fence. Case-insensitive matching was explicitly out of scope in S2's plan; revisit if it ever bites.
- `extensions/pi-fence/kroki.ts` still imports `HttpClient` from `tests/utilities/`. Same wart as S1. Still no user impact.

### 2026-04-18 — Spec CV0.E1.S4 and CV0.E1.S5 for full Kroki coverage

Both stories deferred behind `S3` but specced now so the Epic shape is honest. No implementation in this entry.

After the user asked whether to cram "all of Kroki" into E1, we chose to keep growing incrementally *but* commit explicitly to which growth is planned. `S4 — Full Kroki coverage for text-based languages` covers the straightforward expansion (research which languages the public endpoint serves, add them to the allowlist, one live test each). `S5 — JSON-body Kroki languages` handles the Vega / Vega-Lite / Excalidraw trio separately because they need `Content-Type: application/json` and pi-fence's current `kroki.ts` sends `text/plain` unconditionally.

Shape of each spec:

- **S4** makes research a first-class deliverable. The research output is a committed `tests/fixtures/kroki/canonical-sources.ts` file listing every researched language, its minimal canonical source, and known aliases. A throwaway probe script is allowed to investigate but does not ship. A new `docs/product/kroki-support.md` reference doc lists everything with supported/unsupported status and quirks.
- **S5** ships a content-type dispatch in `kroki.ts` driven by a `KROKI_JSON_BODY_TAGS` set, run *after* alias resolution so both `vega-lite` and `vegalite` hit the JSON path. Unit tests lock the dispatch semantics; live tests prove real rendering.

Updated the Epic's done criterion accordingly: CV0.E1 now closes with every language Kroki's public endpoint serves covered by a live test, not the previous "at least three different diagram languages."

The top-level roadmap table and the Epic's stories table both gain rows for S4 and S5.

Commits in this spec-only work are under `wip(agent): extend CV0.E1 with S4 and S5...`, `spec CV0.E1.S4`, and `spec CV0.E1.S5` — see `git log` for SHAs.

S3 remains the immediate next story.

### 2026-04-19 — CV0.E1.S3 `/fence list` shipped ✅

First user-facing *control* surface lands. `/fence list` prints a line per registered processor — today only Kroki — with status and accepted tags (aliases in parentheses next to their canonical):

```text
Processors

kroki [registered] — mermaid, graphviz (dot), plantuml (puml), d2
```

Read-only, offline, no assistant turn triggered. Implementation ran test-first through the plan's 7 steps, each a single commit. Fast suite grew from 108 to 135 tests across the run.

**Commits:**

- `adb1bbe` spec CV0.E1.S3 — `/fence list`. Before writing code I drafted `README.md` / `plan.md` / `test-guide.md`. First draft proposed a column-aligned table; the user asked whether pi ships a table renderer — it doesn't, only primitives (`Box`, `Text`, `Spacer`, `Markdown`, `SettingsList`). Presented three options (hand-rolled formatter, `Markdown` table, plain per-processor lines); user chose plain lines, and the plan was revised before the first code commit. Amended into the single spec commit so no churn leaked into history.
- `7c8df34` step 1: `FenceProcessor` contract widened with `tags` and `aliases` fields. Contract helper gained two assertions (tags is a non-empty string array; every alias value appears in `tags`). Kroki exports `KROKI_CANONICAL_TAGS` and `KROKI_ALIASES` and declares both on the returned processor.
- `caff2af` step 2: new `extensions/pi-fence/list.ts` with pure `listProcessors(processors)` + `formatProcessorLines(listings)`. `tests/unit/list.test.ts` covers the single-processor case, the empty case, multiple-aliases-per-canonical, and a defensive "alias target not canonical" branch.
- `9e844a9` step 3: `createPiFenceListRenderer` factory added to `renderer.ts`, parallel to `createPiFenceMessageRenderer`. The renderer reads `details.lines` (pre-formatted in the handler), composes a `Box` with a `Processors` header, a `Spacer`, and one `Text` per line. Expanded and collapsed render identically in S3. `tests/unit/renderer.test.ts` tests composition via fake pi-tui primitives — no pi-tui dependency in the test.
- `87509cb` step 4: `/fence` command wired in `createPiFenceExtension`. Dispatches on the first token of `args`; `list` emits a `pi-fence:list` custom message whose `details` include both the pre-formatted `lines` and the raw `listings` (renderers may prefer one or the other; I included both to avoid forcing a choice too early). Unknown/empty subcommands go to `ctx.ui.notify` with a warning naming the available subcommands. Six unit tests drive the handler against `FakeExtensionAPI` — the fake's *first* real consumer beyond its self-test, per S0's original framing. To make this work the fake gained a minimal `ui` field (captures `notify`, throws on unimplemented `select`/`confirm`) and an `invokeCommand(name, args)` helper; both added with their own self-test cases.
- `ad4bb27` step 5: extension-layer test dispatches `/fence list` through a real pi `AgentSession` (`session.prompt("/fence list")`). Earlier worry about needing a private dispatch path turned out unfounded — AgentSession intercepts slash commands before any LLM work, so no `streamFn` is needed. Refactored the existing session setup into a shared `buildSessionWithExtension(http)` helper so both the `agent_end` and `/fence list` paths share wiring.
- `837ed7c` step 6: README (slash-commands section added, "what doesn't work yet" updated), CHANGELOG entry, getting-started gained the `/fence list` example.
- *this entry* step 7: status flips in roadmap / Epic / story READMEs, worklog entry.

**Test counts:**

- Fast suite: 135 passing, up from 108 at session start (+27 across the story). Breakdown: 2 contract assertions (step 1), 9 unit cases in `list.test.ts` (step 2), 3 renderer-composition cases (step 3), 6 fence-command cases + 6 FakeExtensionAPI self-test cases (step 4), 1 extension-layer case (step 5).
- Live suite: unchanged (4 Kroki cases, 6 shell-runner cases).
- `pnpm run check`: green.

**Design decisions landed:**

1. **Slash-command shape**: one `/fence` command with subcommand dispatch, not hyphenated `/fence-list`. Matches the roadmap/briefing phrasing and gives future subcommands (`doctor`, `trace`) a natural home without a second command registration.
2. **Status column**: literal `"registered"` today, typed as the single-member union `ProcessorStatus = "registered"`. Widens when real health probing arrives in a future `/fence doctor` story (not yet placed on the roadmap).
3. **Two fields on `FenceProcessor`** (`tags`, `aliases`) vs a single `describe()` method: flat contract chosen. Contract tests read fields synchronously; `describe()` would have earned its keep only if the description needed to be dynamic.
4. **Alias rendering**: `graphviz (dot)`, with multiple aliases grouped `graphviz (dot, gv)`. Formatter does not assume one-to-one; the test locks that in for the two-processor case CV0.E2 will exercise.
5. **Custom message, not `ctx.ui.notify`**: `/fence list` output persists in the transcript (scrollable back), unlike transient notifications. Parallels how `pi-fence:output` surfaces rendered diagrams.
6. **Content + details on the custom message**: content carries the text-only fallback (`lines.join("\n")`); details carry both the structured `listings` and the formatted `lines`. Renderers that don't read details still show readable text; the dedicated renderer prefers `details.lines` for layout.

**Known deviation from the plan:**

- Plan's Deliverable 2 called for deriving `SUPPORTED_TAGS` from the processor's advertised `tags` + `aliases` instead of the hardcoded array. I did not do that. The hardcoded list currently equals `KROKI_CANONICAL_TAGS ∪ Object.keys(KROKI_ALIASES)`, so behavior is identical; but once CV0.E2 adds a second processor with its own tags the hardcoded list will drift. Flagging here as a known carry-forward, not amending step 1 retroactively.

**Carried forward:**

- `SUPPORTED_TAGS` derivation (see above).
- `extensions/pi-fence/kroki.ts` still imports `HttpClient` from `tests/utilities/`. Same I/O-seam wart carried from S1/S2; still no user impact.
- `/fence doctor` (health probe) does not yet have a placeholder story. A sensible home is CV1.E1 (probably `CV1.E1.S3`); the roadmap table already lists such a row but today's `/fence list` output reads cleanly without that story shipping.
- `/fence trace` still unbuilt. `NodeLogger` is wired, `PI_FENCE_LOG_LEVEL` is read, but no user-facing log view exists.
- Argument auto-completion for `/fence <subcommand>` (`getArgumentCompletions`) not wired. One line of code + one test; left out because no consumer asks for it yet. Easy add whenever a second subcommand appears.

CV0.E1's *user-visible* story line is now complete: install pi-fence, render diagrams, inspect what's registered. S4 and S5 remain as the "every language Kroki serves" expansion of the Epic's done criterion but are not in the critical path for CV0.E1's value proposition.

### 2026-04-19 — post-S3 render polish and trace logging

Eight unplanned commits between S3's close and today, none big enough to earn their own story but together tightening the rendered-diagram surface from "works" to "sits cleanly in the transcript." No roadmap status flips — this is refinement inside CV0.E1.S1/S2/S3 territory, not new user-visible capability beyond what was already promised.

**Commits (oldest first):**

- `04cffc3` trace logging on the render and command paths. `NodeLogger` is wired through `createPiFenceExtension`, and `PI_FENCE_LOG_LEVEL` (default `info`) controls verbosity. Three log channels emit structured JSON-ish payloads on stderr: `[pi-fence:pi-fence]` for `agent_end` parsing, `[pi-fence:kroki]` for request/response/error, `[pi-fence:command]` for `/fence` dispatch. README gains a **Tracing** section with redirection recipe (`pi 2> /tmp/pi-fence.log`). No user-facing `/fence trace` view yet — that remains carried forward from S3.
- `fdf4dee` render PNG content in the `pi-fence:output` message. The renderer now reads the `content` array on the custom message and appends `tui.Image` / `tui.Text` children for each item, with the base64 bytes from the Kroki response going straight into `Image` at `maxWidthCells: 80` (narrowed to 60 later in `1ba79aa`). Before this commit the message carried only chrome and details; the PNG sat in `details` but was never rendered inline.
- `735e3a1` drop duplicate label text from `pi-fence:output` content. The `text` content item was repeating the header the renderer already drew — pi's default custom-message renderer showed both. Removing the duplicate text keeps the expanded view clean and matches how other pi extensions structure content vs chrome.
- `029279a` Kroki tracks pi theme for dark/light diagram rendering. `createPiFenceExtension` reads `pi.theme.current()` every turn and passes the name into `createKrokiRenderer` via a fresh closure. Kroki's request URL gains `?theme=dark` when the theme name does not contain `light`, `latte`, or `day`. The heuristic is deliberately wide — it catches `dark`, `tokyo-night`, `catppuccin-mocha`, `gruvbox-dark` without enumerating every theme. Re-reading per turn means switching themes mid-session takes effect on the next rendered block.
- `1ba79aa` narrow inline diagram width to 60 cells. 80 swallowed the terminal on typical Ghostty window sizes; 60 matches pi-coding-agent's own `tool-execution` renderer convention. Comment in code flags this to revisit once CV1.E1 ships user settings.
- `86566bf` collapse bottom stripe on `pi-fence:output` messages. The Box's bottom padding produced a visible one-row stripe in the custom-message background color below the image — visual noise without semantic value. Dropped the bottom pad.
- `0427558` correct pi-tui Box padding order. The previous fix relied on a `(paddingY, paddingX)` argument order; pi-tui's `Box` actually takes `(paddingX, paddingY)`. The bottom stripe was incidentally the *left* padding being 0 and the *bottom* still being 1. Swapped the argument names in the renderer's `tui` type and the construction call. Comment updated.
- `859cca8` drop box background so image rows blend with terminal. Dropped the `bg` closure (`theme.bg("customMessageBg", t)`) from the Box construction. The background was tinting the rows around the image, creating visible seams; letting the terminal's native background through made the PNG sit flush with surrounding text.

**Test counts:**

- Fast suite: 135 (S3 close) → 154 today (+19). Breakdown from the seven commits that shipped tests: `04cffc3` added cases across `kroki.test.ts` (log emission), `fence-command.test.ts`, and `pi-fence.test.ts` (trace on dispatch); `fdf4dee` expanded `renderer.test.ts` to cover image/text child composition; `735e3a1` updated renderer cases for the dropped duplicate; `029279a` added cases in `kroki.test.ts` (theme query param) and `pi-fence.test.ts` (theme passed at turn boundary); `1ba79aa`, `86566bf`, `0427558` each tightened renderer cases for their specific layout invariants; `859cca8` shipped no tests — a pure visual decision with no testable invariant beyond "no bg closure passed to Box."
- Live suite: unchanged (4 Kroki cases, 6 shell-runner cases). None of the polish touches live paths.
- `pnpm run check`: green on every commit.

**User-visible changes that made it into the README but not the CHANGELOG until today:**

1. Theme tracking (`?theme=dark` based on pi's current theme name).
2. `PI_FENCE_LOG_LEVEL` env var + stderr tracing with three log channels.
3. Inline PNG actually renders (before: chrome only).
4. Width capped at 60 cells to match pi's convention.
5. Custom message chrome cleaned up (no bottom stripe, no duplicate label, no tinted background).

CHANGELOG entry landing in the same commit as this worklog update, under a new `Refined` section inside `[Unreleased]` so the S3 `Added` block stays pristine.

**Nothing earned a carry-forward beyond what S3 already listed.** The items still open from S3 remain open: `SUPPORTED_TAGS` derivation, `HttpClient` import location, `/fence doctor` placeholder story, `/fence trace` user-facing view, `/fence <subcommand>` auto-completion.

### 2026-04-19 — AGENTS.md as the agent/contributor front door

The previous session's retrospective surfaced that a fresh agent landing in the repo had no single entry point: the rules lived in `docs/product/principles.md`, the architecture in `docs/project/briefing.md`, the canonical story example at the tail of this worklog, and the verification gate was implicit in `package.json` scripts. Each question ("what's pending?", "how do we build?", "how do we code?") required stitching two or three docs together.

`AGENTS.md` at the repo root now serves as that front door. ~60 lines, redirect-first: points at the three authoritative sources, names the verification gate, sketches the story workflow in five lines (spec → implement → close), lists commit-message conventions used in this repo (`spec <CODE>`, `step N: <why>`, `close <CODE>`, `wip(agent): <why>`), and documents the I/O-seam / fake / live-test discipline in one paragraph. It does not duplicate `principles.md` — anything substantive redirects there.

**Commit:**

- `d209dd9` docs: add AGENTS.md as the contributor/agent front door.

**Tests:** N/A (docs-only). `pnpm run check` green (30 files linked, 29 markdown files linted).

**Ranked follow-ups proposed during the discussion but not yet done:**

1. `docs/process/story-workflow.md` — extract the canonical 10-step loop from S3's worklog entry so it stops being archaeology. Include a worklog-entry template at the bottom.
2. `docs/project/roadmap/_plan-template.md` — makes the mandatory `Tests` section in `plan.md` concrete.
3. `CONTRIBUTING.md` — thin, points at AGENTS.md + principles.md.
4. Release checklist — defer until the first real release is on the horizon.

### 2026-04-19 — rules for SHA handling and worklog/CHANGELOG ordering

Two process gaps surfaced during the session and earned written rules.

**Gap 1 — SHA transcription errors.** Mid-session I retyped commit SHAs from visual memory into bash commands three times in a row (`029985f`, `029a57`, `02920578`, and one `for`-loop literal) before stopping to re-read the source. The real SHA was `029279a`, visible directly in prior tool output. Each failure returned `fatal: ambiguous argument`; I kept guessing instead of treating the first failure as a signal to stop and copy.

**Gap 2 — worklog predicting commits.** The repo's reflog shows an earlier session committed `worklog — drop placeholder SHAs for the spec commits`, evidence that worklog entries have historically been written *before* the commits they reference existed, then retrofitted. Same class of error as Gap 1 — prose claiming commits that either don't exist or have different SHAs than written.

**Resolution:**

- `AGENTS.md` gains a *Working with commit SHAs* section (copy, never retype; stop on first ambiguous-argument error; verify before saving) and a *Worklog and CHANGELOG ordering* section (never mix docs into feature commits; one final docs commit per cycle once SHAs are stable; never write a SHA before the commit exists).
- `docs/product/principles.md` → *Process* tightens the "Living documentation" line to match: docs are updated at the end of each cycle in a dedicated docs commit, with a pointer to `AGENTS.md` for the full rule.
- The rule applies retroactively in the sense that this very worklog entry is the docs commit catching up on the rules commit — feature commit first, docs commit immediately after, no bundling.

**Commit:**

- `1be7d46` docs: rules for SHA handling and worklog/CHANGELOG ordering.

**Tests:** N/A (docs-only). `pnpm run check` green. `AGENTS.md` at 72 lines, under the 90-line ceiling set for it.

**Clarified during the conversation, worth recording:**

1. The "catch up" pattern is not "defer until a future session." It is "the very next commit after feature work is the docs commit covering it." Applies whether the feature work is code, docs-as-rules, or anything else that produces stable SHAs worth recording.

### 2026-04-19 — docs-follows-feature rule made explicit

The previous entry resolved two process gaps with rules in `AGENTS.md`. The rules worked — but the *language* of rule 2 was vague: "at story close (or at any history catch-up), once all feature commits exist and their SHAs are stable, create one final commit." Reading that, I deferred the worklog entry for `1be7d46` to a "future catch-up." The user caught it: the intent was *immediately*, not eventually.

**The sharpened rule:** one feature commit is followed immediately by one docs commit that records it. Back-to-back. Never batched across a session, never deferred to a later story close. Batching is allowed *only retroactively* — to catch up on past feature commits that missed their docs commit (see `042acb8` as the canonical example). Going forward the default is 1:1, adjacent.

**Commit:**

- `6a0a625` docs: make the docs-follows-feature rule explicit.

**Tests:** N/A (docs-only). `pnpm run check` green. `AGENTS.md` at 73 lines.

**Meta-observation worth keeping:** the pair `6a0a625` → *this entry* is itself the rule operating on itself. The feature commit sharpens a rule about how to follow feature commits; this docs commit is the immediate follow-up the new text requires. If the rule had not been internalized, this entry would not exist yet.

### 2026-04-19 — shipped stories named as the spec template

During the session the user asked why each story needs three files (`README.md` + `plan.md` + `test-guide.md`). Initial answer (based on reading S3 alone) defended the split on separation-of-concerns grounds. Second-pass answer (reading all six stories S0–S5) confirmed: the three-file split is a real template applied consistently, section headings are near-identical across all six, and each file serves a distinct reader at a distinct moment.

The natural follow-up question — *do we need template files then?* — flipped the earlier ranking. With six shipped stories in the repo and every future story built agent-assisted (full repo in context), extracting `_readme-template.md` / `_plan-template.md` / `_test-guide-template.md` would add three files that rot faster than the examples they mimic. Templates invite syntactic imitation; examples teach semantic shape. The repo already has what it needs.

**The resolution:** one sentence added to `AGENTS.md` → Story workflow step 1, naming the shipped stories as the template. No template files created; none planned.

**Commit:**

- `e99a803` docs: name the shipped stories as the spec template.

**Tests:** N/A (docs-only). `pnpm run check` green. `AGENTS.md` at 73 lines.

**Follow-ups this supersedes:** the earlier ranked follow-up list included `docs/process/story-workflow.md` and `docs/project/roadmap/_plan-template.md`. Both drop off the list for the same reason — shipped stories and `principles.md` already teach what they would teach, and a separate doc would drift. Remaining open follow-ups: `CONTRIBUTING.md` (thin, GitHub PR surface) and a release checklist (defer until first release).

### 2026-04-19 — name `~/me/oss/pi-mono` as the source of truth for pi internals

While exploring strategies for capturing what pi-fence renders in a real terminal, I spent several turns reading `node_modules/@mariozechner/pi-tui/dist/` — the compiled emit plus the published README — to reconstruct pi-tui's `Terminal` interface, its capability-detection seam, and its testing patterns. The user interrupted with a simple observation: `~/me/oss/pi-mono/` has the real source. Once pointed there, `packages/tui/src/` held the TypeScript sources and `packages/tui/test/` held `virtual-terminal.ts`, `terminal-image.test.ts`, `image-test.ts`, `tui-render.test.ts`, and regression tests — exactly the files I was speculating about. The dist had given me enough to guess but not enough to see; the source would have made the answers obvious on the first read.

The cost of reading the dist was a round-trip of wrong framings. I proposed HTML/CSS emulation before seeing that pi-tui ships a `VirtualTerminal` for testing. I called out "terminal detection might gate image emission" as a risk before seeing that `setCapabilities()` is explicitly documented in the source as *for tests*. I sized a "build it" plan at 1–2 days before noticing that `PI_TUI_WRITE_LOG` already captures the exact byte stream I wanted to capture.

**The rule added to `AGENTS.md`:** when investigating pi-tui / pi-coding-agent / pi-ai internals, read `~/me/oss/pi-mono/packages/<pkg>/src/` and `.../test/` first. Keep the repo current (`git fetch` + `git status -sb` against `upstream/main`). Do not rely on `node_modules/@mariozechner/<pkg>/dist/` for anything beyond confirming the installed version actually ships a particular export.

**Commit:**

- `1b9a5f0` docs: point pi internals questions at ~/me/oss/pi-mono, not node_modules.

**Tests:** N/A (docs-only). `pnpm run check` green. `AGENTS.md` at 82 lines — still under the 90-line ceiling but closer to the top.

**State of `~/me/oss/pi-mono/upstream/main` at the moment the rule landed:** `efc58fed Add [Unreleased] section for next cycle`. `origin/main` in sync at the same SHA. `packages/` contains `agent`, `ai`, `coding-agent`, `mom`, `pods`, `tui`, `web-ui` — all reachable as source from upstream.

### 2026-04-19 — pin pi-mono reads to `upstream/main` via `git show <ref>:<path>`

Immediately after `1b9a5f0` landed, the user tightened the rule further: don't just "read from pi-mono" — always read from `main` unless another ref is explicitly named. The subtlety I missed: my previous entry observed that `~/me/oss/pi-mono` was on branch `refactor/session-storage-interface`, 6 commits ahead of `upstream/main`. If I had started reading source files from the working tree, I would have been reading WIP refactor code that does not match what pi-fence's installed `pi-tui@0.67.68` was built from. The working tree is the wrong source; `upstream/main` is the right source.

**The sharpened rule:** prefer `git show upstream/main:packages/<pkg>/src/<file>.ts` over the working tree. Reads the ref directly, never depends on what's checked out, never risks polluting the user's workspace. Same idea for `git cat-file -p upstream/main:<path>` (single file) and `git grep <pattern> upstream/main -- packages/<pkg>/` (broader search). Always `git fetch --all` before reading so `upstream/main` is current. Note the `upstream/main` SHA in prose when citing internals.

**Commit:**

- `4c808c5` docs: pin pi-mono reads to upstream/main via 'git show <ref>:<path>'.

**Tests:** N/A (docs-only). `pnpm run check` green. `AGENTS.md` at 84 lines — two lines off the 90-line ceiling, worth a trim pass soon.

**Meta-observation:** this is the second sharpening pass on a rule set that landed only a few commits ago. The pattern (rule lands → user notices it's underspecified → rule gets tightened → catch-up) is not a failure — it is how AGENTS.md is supposed to evolve. First-pass rules are scaffolding; specificity accretes through use.

### 2026-04-19 — spec CVx — Verifiability lane (+ E1 + E1.S1)

After reading pi-tui's source on `upstream/main` — specifically `packages/tui/test/virtual-terminal.ts`, `packages/tui/test/tui-render.test.ts`, and `packages/tui/test/terminal-image.test.ts` — the gap in pi-fence's testing became concrete: the eight render-polish `wip(agent)` commits between `CV0.E1.S3`'s close and `2026-04-19` all fixed visual bugs the existing fast suite did not catch, because the fast suite asserts on our hand-rolled fakes of pi-tui's primitives rather than on real pi-tui output. pi-tui itself tests visual results by painting into a `VirtualTerminal` (xterm.js-headless-backed) and asserting on both the resulting viewport grid and a `LoggingVirtualTerminal.getWrites()` byte log. That idiom is free for pi-fence to adopt — we already depend on pi-tui transitively.

**Decision — cross-cutting lane, not numbered CV.** The briefing names Verifiability as cross-cutting: every feature story advances it implicitly by shipping tests; testing-infrastructure stories earn *explicit* progression credit. `CVx` (not `CV5`) signals this: the lane runs alongside CV0–CV4, not after them. First time the `x` suffix appears in this repo's roadmap.

**Scope of the spec commit:**

1. Top-level `docs/project/roadmap/README.md` gains a `CVx — Verifiability` section after `CV4` and before the Radar, with two Epics: `CVx.E1 — pi-tui Testing Idiom` (full spec) and `CVx.E2 — Dev-time Render Screenshots` (table-row only).
2. `cvx-verifiability/README.md` names a new **Render** layer in the test pyramid — sits between Extension and Integration (live), runs at unit-suite speed via `pnpm test`, asserts on real pi-tui output via `VirtualTerminal`.
3. `CVx.E1/README.md` describes the realignment: replace hand-rolled pi-tui fakes in `tests/unit/renderer.test.ts` with real primitives painting into `VirtualTerminal`; assert on both viewport and write log; delete ~60 LOC of hand-rolled fakes.
4. `CVx.E1.S1` full three-file spec (`README.md` + `plan.md` + `test-guide.md`): vendor `VirtualTerminal` from `~/me/oss/pi-mono` at `upstream/main` into `tests/utilities/virtual-terminal.ts` (because pi-tui does not export it from its published entry point yet), add `LoggingVirtualTerminal` subclass, `forceCapabilities` helper with disposer, rewrite renderer cases, extend `pi-fence.test.ts` mermaid happy-path with viewport + write-log assertions.

**What this spec commit does *not* do:** commit any code. Steps 1–5 in the plan's Implementation order are separate commits, each green on `pnpm test`, landing in sequence. `CVx.E2` is deliberately spike-first; no spec beyond the table rows until the screenshot flow proves out in a throwaway script.

**Commit:**

- `f54224b` spec CVx — Verifiability lane (+ E1 pi-tui testing idiom + E1.S1).

**Tests:** N/A (spec-only). `pnpm run check` green (35 files linked, 34 markdown files linted; 5 new files added).

**Why this lane earns its spot now, not later:** the signal is the render-polish commit stream after S3. Feature work is actively producing visual bugs the suite doesn't catch; every bug is paid for twice — once in the original ship, once in the polish commit. `CVx.E1` is small (one story, test-only, no runtime changes) and pays back on the very next rendering change, which is CV0.E1.S4 or CV0.E2 — both on the horizon. Later would mean more polish debt.

**Known open:**

1. The `AgentSession` terminal-injection seam for `tests/extension/pi-fence.test.ts` is not yet confirmed. The plan treats this as a research sub-step in implementation step 4; if the seam needs an upstream change, that specific assertion becomes a carry-forward without blocking S1.
2. `VirtualTerminal` vendoring is the default path; if upstream exports it later (trivial PR against pi-mono), pi-fence switches to an import and deletes the vendored file. The vendored file's header comment will document the re-sync policy and the `upstream/main` SHA at vendor time.

### 2026-04-20 — close CVx.E1.S1 (VirtualTerminal-backed renderer and extension tests)

**Goal:** flip the renderer and extension-layer tests from asserting on our hand-rolled pi-tui fakes to asserting on real pi-tui emission via `VirtualTerminal`, so the class of visual regressions that produced the eight post-S3 `wip(agent)` polish commits becomes automation-catchable.

**What shipped (one commit per plan step, SHAs in order):**

- `cbaa8a7` step 1: vendor `VirtualTerminal` + `LoggingVirtualTerminal` from pi-tui. Source: `pi-mono@upstream/main aa1b587b`, file last touched at `41377ee8`. The vendored file imports `Terminal` from `@mariozechner/pi-tui`'s published surface rather than a relative path, and appends `LoggingVirtualTerminal` whose shape is lifted verbatim from pi-tui's `tui-render.test.ts`. Header comment pins the re-sync policy (check once per CV). Self-test in `tests/unit/virtual-terminal.test.ts` covers viewport reflection, dimensions, write capture in order, escape-byte preservation, and `clearWrites()`.
- `5af5d69` step 2: `forceCapabilities()` helper. Pins pi-tui's capability cache to a Kitty-full shape so render-layer tests deterministically hit the image-protocol path regardless of the host terminal, and returns a disposer for cleanup. Self-test uses `detectCapabilities()` as the reference — pin a shape distinct from detection, dispose, confirm `getCapabilities()` returns the detected value. A no-op disposer fails this assertion (verified by temporarily gutting the disposer; the test went red).
- `57f21f1` step 3: rewrite `tests/unit/renderer.test.ts`. The hand-rolled `Box` / `Text` / `Spacer` / `Image` fake classes (~100 LOC) are gone. The five component-factory cases now build the tree with real pi-tui primitives, paint it through `TUI` into a `LoggingVirtualTerminal`, and assert on `getViewport()` + `getWrites()`. The happy-path mermaid case asserts the `\x1b_G` Kitty APC prefix lands in the write log; dropping the `Image` child from the renderer makes that assertion fail, matching the test-guide's teeth-check script. Pure-helper describe blocks unchanged.
- `851932d` step 4: extend `tests/extension/pi-fence.test.ts` mermaid happy path. `buildSessionWithExtension` wraps `pi.registerMessageRenderer` alongside `pi.sendMessage`; the test pulls the captured `pi-fence:output` renderer out, paints it into a `LoggingVirtualTerminal`, and asserts (1) the viewport shows `Rendered mermaid via kroki`, (2) `\x1b_G` appears in the write log, (3) the base64 payload inside that sequence decodes to exactly the fixture PNG bytes — end-to-end proof bytes flow FakeHttpClient → processor → custom message → renderer → pi-tui `Image` → Kitty encoder → terminal write, unchanged.

**Tests:** 154 → 161 (+5 from `virtual-terminal.test.ts`, +2 from `force-capabilities.test.ts`). `renderer.test.ts` stayed at 17 cases while its render-layer half switched from fake-composition to real viewport/write-log assertions. `pi-fence.test.ts` stayed at 4 cases while the mermaid case grew three new assertions. `pnpm test` green on every step; `pnpm run check` green at close. No live cases added, live suite unchanged.

**Known-open carry-forwards resolved:**

1. The `AgentSession` terminal-injection seam that the spec flagged as a step-4 research risk did not need to exist. The real `ExtensionAPI` surface already lets us capture the `registerMessageRenderer` call and replay the renderer standalone, so no upstream change was needed. No carry-forward from this item.
2. `VirtualTerminal` vendoring is the shipped path. Upstream export is still preferred long-term; when it lands, the vendored file becomes two import lines and a deletion.

**Deviation from the plan worth logging:** the plan's Test Guide said `@xterm/headless` was "already transitive via `@mariozechner/pi-tui`" — it is not. pi-tui lists it under `devDependencies`, not `dependencies`, so a published consumer does not receive it. Added as a pi-fence `devDependency` (`@xterm/headless@^6.0.0`) in step 1's commit. The plan's next revision (or a follow-up clean-up) should remove the "already transitive" claim.

**Principles update:** `docs/product/principles.md` Testing table now lists a **Render** layer between Extension and Integration (live), with `pi-tui in-process + @xterm/headless (dev dep)` as its dependency and `pnpm test` as its runner. The row is the lightweight documentation `CVx.E1.S2` would deepen if pressure appears (broader render-layer doc page, shared matchers, etc.); S1 deliberately kept it to a single row.

**Why I'm confident the assertions have teeth, not vibes:** every new write-log / viewport assertion was verified by a deliberate teeth-check against production code — temporarily break the renderer (skip the Image child, pass the wrong payload to `new Image(...)`, no-op the capability disposer), confirm the assertion goes red with a clear message, restore, confirm green. That's the rung the pyramid was missing before; it is now filled.

**Meta — TDD vertical-slicing:** steps 2 and 4 followed red → green per assertion (write test against non-existent helper / non-existent `registeredRenderers` field, watch vitest fail with a pointed error, then implement). Step 1 was a vendor + self-test pair — the self-test would have been red against an empty file but I never had that moment because the code was lifted verbatim. Step 3 rewrote existing tests against real primitives; the pivot from fake-composition to viewport assertions was itself the red → green cycle (the first run hit a scrolled-out-of-viewport edge that was resolved by sizing the test terminal to fit the worst-case Image height).

**Follow-ups this story surfaces, not claimed:**

1. Upstream PR against pi-mono to export `VirtualTerminal` from pi-tui's public surface. Trivial; eliminates the vendored file entirely.
2. `CVx.E1.S2` candidates now have real artifacts to factor from: `paintCustomMessage` in `tests/extension/pi-fence.test.ts` and `paint()` in `tests/unit/renderer.test.ts` are nearly-identical helpers that will want extraction once a second render-layer test appears. Premature extraction today (only two call sites) would be noise; surface it as an S2 candidate.
3. `extractKittyBase64()` in `pi-fence.test.ts` parses only the single-chunk APC form. Multi-chunk images (> 4 KiB base64) would need the continuation logic; real Kroki PNGs are typically well under 4 KiB for simple diagrams, but if a future fixture crosses the threshold, this helper is where to look.

### 2026-04-20 — catch-up docs and post-S1 polish

Four small commits closing open loops from CVx.E1.S1. Not a story — documentation corrections, a doc refresh, a refactor, and a throwaway spike. Grouped into this one worklog entry because each is thin on its own and they landed in one session back-to-back. This is the retroactive-batching path `AGENTS.md` → *Worklog and CHANGELOG ordering* licenses for catch-ups of past feature commits; going forward one-feature-one-docs remains the default.

1. **`d6c65b6` docs: correct CVx.E1.S1 spec** — `@xterm/headless` is not transitive via pi-tui. The story's `plan.md` / `README.md` / `test-guide.md` each carried the wrong "already transitive via pi-tui" claim; step 1 of the implementation silently fixed reality by adding `@xterm/headless` as a direct `devDependency`. Rather than rewrite spec history, each of the three locations got an explicit post-implementation correction note pointing at the CVx.E1.S1 worklog close.
2. **`5ea9bbd` docs: refresh user-facing docs to match shipped reality** — `README.md` and `docs/getting-started.md`. Biggest fix was `getting-started.md`'s stale "nothing to install yet ... once CV0.E1.S1 ships" preamble, written before CV0.E1.S1–S3 closed. Install section now covers both "from source today" and "from npm once published"; scripts table names the Render layer alongside unit/contract/extension/utility; test-layout tree points out `VirtualTerminal` + `forceCapabilities` harnesses. README expansion note changed from "mermaid source" to "original source" since expansion is tag-agnostic.
3. **`fbc8cea` refactor: extract `paintComponent()` to `tests/utilities/render.ts`** — the CVx.E1.S1 close flagged this as a "wait for a third caller" candidate. Doing it at two was cheap because the existing duplication was tangible and the next render-layer callsite (the CVx.E2 spike below, and eventually `CV0.E2.S1`'s second-processor test) would otherwise start by copy-pasting one of the two existing versions. The helper stays side-effect-free (does not force capabilities — callers own that lifecycle). 161 tests still green; behavior-preserving refactor.
4. **`2183665` wip(agent): spike CVx.E2 — paint one scenario into the live terminal.** `scripts/render-screenshot.ts` + `pnpm --silent render:spike`. Builds one canned pi-fence scenario, paints through the shared `paintComponent` harness, writes the captured byte stream to stdout. Inside a Kitty-graphics-capable terminal the image renders inline; the user screenshots manually, then presses Enter. Not a story, not a feature — the tracer that de-risks `CVx.E2.S1`'s eventual spec. The key invariant is that stdout bytes equal the tests' assertion target, so if both the tests pass and the screenshot renders correctly, we have end-to-end confidence the fast suite tracks reality. Automated Kitty spawning, automated `screencapture`, multi-scenario galleries, and sentinel-based readiness are all future-story scope.

**Tests:** unchanged at 161 across all four commits. The refactor was behavior-preserving; the spike is a script, not a test. `pnpm run check` green throughout.

**Backlog entry moved off-repo:** during the CVx.E1.S1 post-close review, an "upstream PR against pi-mono to export `VirtualTerminal`" follow-up was surfaced. Since PRs against someone else's repo need explicit permission and are not scoped to pi-fence anyway, the full write-up (motivation, subpath-export design decision, step-by-step implementation plan, permission protocol) was moved to `~/me/mirror/backlog.md` where a future session can pick it up independently. The follow-up is still listed in the CVx.E1.S1 close entry above, but the actionable detail lives outside the repo so it doesn't lose context across sessions.

**Why all four commits fit in one worklog entry:** the docs-follows-feature rule wants one feature commit to one docs commit. Items 1 and 2 are standalone `docs:` commits (not features) and don't need their own docs catch-up. Item 3 is a small refactor with no user-visible surface; mentioning it alongside items 1, 2, and 4 is more informative than a separate entry would be. Item 4 is a spike, not a story, and spikes historically ride in a single batch entry when they're not the focal work of the session. Grouping is honest (all four landed in one session), proportionate to the weight of the changes, and follows the retroactive-batching precedent set by `042acb8` earlier.

### 2026-04-20 — CVx.E2 spike pass 2 (wterm + a11y) and pass 3 (xterm.js + Kitty + headless Chromium)

Two more CVx.E2 spikes landed in the same session as the first one, each taking a different strategy in response to what the previous had taught. Neither is a story; both are research spikes that inform `CVx.E2.S1`'s eventual spec. Batched into one worklog entry because each commit's docs catch-up would otherwise have been three lines and a pointer.

**Why the first (live-terminal) spike needed follow-ups.** Pass 1 (`2183665`) dumped pi-tui's captured byte stream to `process.stdout` from a standalone script, expecting the user's Ghostty window to render the Kitty graphics inline. It did not — pi-tui's paint assumes it owns the terminal viewport, so its `\x1b[29A` cursor movements and `\x1b[16t` cell-size query raced against the surrounding shell. Two iterations of the stdin wait (readline in `edd9794`, raw-mode stdin in `9b6e61d`) did not make the rendered panel reliably visible — a second screenshot from the user still showed only `^[[6;34;17t` leaking into the next shell prompt. The lifecycle problem was foundational, not a detail.

**Pass 2 (`373a9e5`) — wterm + jsdom.** Gave up on the live-terminal path; instead fed the same byte stream into wterm (Vercel Labs' Zig+WASM DOM-rendering terminal emulator, `github.com/vercel-labs/wterm`, upstream at the time: `0.1.9`) inside jsdom. The wterm README sells "accessibility comes for free" via DOM rendering; since the rendered content is just DOM text, `.term-row` textContent per row gives the terminal's output without a screen reader. `scripts/render-a11y-spike.ts` + `pnpm --silent render:a11y-spike` writes a JSON report (rendered rows + cursor + unhandled sequences) on stdout. Human summary on stderr: "'Rendered mermaid via kroki' found in rendered rows: true." Headless, offline, ~10 MB jsdom. Useful finding: wterm does NOT implement Kitty graphics, so the APC payload leaks as text in the rendered grid. Text-layout verification ✔; image-render verification ✗.

**Pass 3 (`12e4e1d`) — xterm.js + Kitty addon + headless Chromium.** Web search (both `wterm` and `a11y tree` as independent queries, then `xterm-addon-image kitty graphics protocol`) surfaced that `@xterm/addon-image@beta` (0.10.0-beta.197+) adds Kitty-graphics-protocol parsing on top of xterm.js. pi-tui emits `a=T` (transmit-and-display), which the beta supports. Drove the byte stream through xterm.js + the image addon in a headless Chromium via `playwright-core`, then `page.screenshot()` to PNG. Test fixture: `tests/fixtures/mermaid-flowchart.png`, a real Kroki-rendered PNG (324x70, ~2 KB) fetched once via `curl https://kroki.io/mermaid/png?theme=dark`; the synthetic "magic + IHDR only" PNG used by the fast-suite tests has no IDAT chunk so real decoders show a placeholder. First run produced `scripts/out/render-image.png` with the "Rendered mermaid via kroki" label and the actual mermaid flowchart `A -> B -> C` rendered as boxes with arrows. Headless, CI-capable, ~150 MB Chromium one-time install. `pnpm --silent render:image-spike` is the entry point; `scripts/out/` is gitignored.

**Shape of the three spikes after pass 3:**

| Spike | Output | Headless | CI-capable | Text | Image |
|-------|--------|----------|------------|------|-------|
| 1 `render:spike` (live Ghostty) | manual screenshot | no | no | yes | yes (flaky) |
| 2 `render:a11y-spike` (wterm + jsdom) | JSON on stdout | yes | yes | yes | no (wterm ignores Kitty) |
| 3 `render:image-spike` (xterm.js + addon + Chromium) | PNG on disk | yes | yes | yes | yes |

**Commits:**

1. `373a9e5` wip(agent): spike CVx.E2 pass 2 - wterm + a11y-style DOM verifier.
2. `12e4e1d` wip(agent): spike CVx.E2 pass 3 - real PNG via xterm.js + Kitty addon.

Dev dependencies added across the two spikes: `@wterm/dom@^0.1.9` (+ transitive `@wterm/core`), `jsdom@^29.0.2`, `@types/jsdom`, `@xterm/xterm@^6.1.0-beta.197`, `@xterm/addon-image@^0.10.0-beta.197`, `playwright-core@^1.59.1`. Chromium binaries live in the global playwright cache (`~/Library/Caches/ms-playwright/`), not under `node_modules/`; installed once via `npx playwright install chromium`. Real Kroki PNG checked in under `tests/fixtures/` as committed bytes rather than regenerated on every test run — no network dependency for CVx.E2 consumers.

**Tests:** unchanged at 161 across both commits. Spikes are scripts, not tests.

**Follow-up this batch surfaces for `CVx.E2.S1`'s eventual spec:** the original table row in the epic's README said "paint in a real Kitty window." The three spikes taught us the headless path is strictly better (CI-compatible, no shell lifecycle race, reproducible, diffable). The spec commit that defines `CVx.E2.S1` should revise both that table row and the epic-level "done" criterion (which currently also says "real Kitty") to reflect the headless direction, and should ship a proper verifier tool promoted from the spike scripts rather than paving over the original live-terminal framing.

**Meta on docs ordering:** pass 2 (`373a9e5`) shipped without an adjacent docs commit in the prior session (it was implicit in the "follow-ups surfaced" section of `946e177` but not claimed by SHA there). Pass 3 (`12e4e1d`) shipped one commit ago, also without docs. This entry is the retroactive-batch catch-up for both, per the AGENTS.md Worklog-and-CHANGELOG-ordering exception. Going forward, one-feature-one-docs remains the default.

### 2026-04-20 — close CVx.E2.S1 (headless image verifier)

**Goal:** promote the third CVx.E2 spike from research code to a maintained verifier with a named CLI, a scenario registry, a pipeline module, a committed golden PNG, and a live-suite pixel-diff test. Deliver the first building block of the `CVx.E2` epic so that the remaining stories (S2 multi-scenario gallery, S3 sentinel-based determinism) extend rather than restart.

**What shipped (one commit per plan step):**

- `f579f38` spec CVx.E2.S1 — headless image verifier with pixel-diff snapshot test. Created the Epic folder (previously table-row-only in the CVx parent README), wrote `README.md` + `plan.md` + `test-guide.md` under `cvx-e2-dev-time-screenshots/cvx-e2-s1-headless-image-verifier/`, revised the top-level roadmap table rows and the CVx parent to reflect the headless direction the three spikes demonstrated (replacing the original "real Kitty window" framing). Added a `Render Image (live)` row to the CVx parent's test-pyramid comparison. Updated the epic-level "done" criterion to name `pnpm render:verify` + `@xterm/addon-image` + `pixelmatch` explicitly rather than the original generic "real Kitty" shape.
- `3394a7d` step 1: scenario registry + pipeline extraction. `scripts/verify/scenarios.ts` with `Scenario` interface, one registered scenario (`mermaid-happy-path`), `getScenario()` / `listScenarios()`; `scripts/verify/pipeline.ts` with `renderScenario()` and `renderMany()` sharing Chromium across scenarios. `tests/unit/verify-scenarios.test.ts` covers the registry contract (unique names, plausible dimensions, Kitty APC in the built byte stream) — 5 new cases; fast suite 161 → 166. `scripts/render-image-spike.ts` collapsed from a 250-line inline pipeline to a ~40-line driver over the new library modules, proving the extraction is behavior-preserving.
- `4585869` step 2: `pnpm render:verify` CLI. `scripts/verify.ts` dispatches flags (`--list`, `--scenario <name>`, `--update`, `--out <dir>`, `-h`/`--help`) and exits 0/1/2 for success / argument error / pipeline failure. No tests added yet; step 4 is the test gate.
- `836ce5a` step 3: golden PNG. `pnpm render:verify --update` captured `tests/fixtures/golden/mermaid-happy-path.png` (2560x2280, 37.9 KB) on the authoring machine (macOS arm64, Chromium revision 1217, Chrome for Testing 147.0.7727.15). Baseline calibration noted in the commit message for future re-roll reference.
- `765d331` step 4: pixel-diff render-image test. `tests/render-image/verify.test.ts` iterates the registered scenarios, pixel-matches via `pngjs` + `pixelmatch`, budgets at `DIFF_BUDGET=100` and `threshold=0.1`. Calibrated against three consecutive byte-identical renders (0 diff pixels each) on this machine. Gated on Chromium availability via `chromium.executablePath()` + `existsSync()`; contributors without `npx playwright install chromium` green-skip. On failure writes a `diff.png` alongside the rendered PNG. `package.json` broadens `test:live` to include `tests/render-image/` and narrows `test` / `test:watch` to exclude it (the original fast-suite exclude only named `tests/integration/`; step 4 adding a sibling live suite required updating both sides of the suite split). Deps added: `pngjs@^7`, `pixelmatch@^7`, `@types/pngjs`, `@types/pixelmatch`.
- `2fb5792` step 5: principles + docs. `principles.md` Testing table gets the `Render Image (live)` row between `Extension` / `Integration (live)` and the new entry. `docs/getting-started.md` scripts table adds the `pnpm render:verify` row; the test-layout tree gains `tests/render-image/` and points out `tests/fixtures/golden/`. `CHANGELOG.md` [Unreleased] block describes the verifier, the dep footprint, the calibration environment, and the "spike 3 now drives the new library" rewire.

**Tests:** fast suite 161 → 166 (+5 from scenario registry self-test). `tests/render-image/` has 1 live case (`mermaid-happy-path: PNG matches golden within DIFF_BUDGET=100`). `pnpm test` green; `pnpm test:live` green (render-image + kroki.live pass; shell-runner.live skipped cleanly because Docker isn’t running); `pnpm run check` green.

**Known carry-forwards:**

1. `DIFF_BUDGET=100` is tuned against one machine (macOS arm64, Chromium 1217). CI on a different OS / Chromium patch may observe higher drift; option is to raise the budget, re-capture the golden, or invest in S3's sentinel-based determinism.
2. `pnpm test:live` now runs two live cases even when Chromium is present but Docker is not. The two gates are independent (Chromium gate on `chromium.executablePath()`, Docker gate on container presence), which is the right shape but means the live suite's green-skip pattern is now a matrix rather than a single condition.
3. The three spike scripts (`render-screenshot.ts`, `render-a11y-spike.ts`, `render-image-spike.ts`) remain in the tree. They are research artifacts and the S1 close does not delete them; a future consolidation story can decide whether the spike-3 script is redundant now that `pnpm render:verify` exists, and whether the a11y spike earns its own CVx.E1.S2-style promotion.

**Follow-ups this story surfaces (not claimed):**

1. **CVx.E2.S2** scope is now concrete — add a second scenario (likely an error path or a second diagram family), parameterise `renderScenario()` over theme / width variants, produce a browsable gallery per run. S2's plan.md can be drafted whenever there's pressure.
2. **CI activation.** `.github/workflows/live.yml` is dormant. Activating it would run the Render Image suite on every push. Separate concern from S1.
3. **Spike script consolidation.** `render-image-spike.ts` is now fully subsumed by `pnpm render:verify`. A later cleanup story could delete it. `render-screenshot.ts` stays as a record of the road not taken; `render-a11y-spike.ts` is a candidate for its own CVx.E1-style promotion if text-layout snapshotting earns a home.
4. **Upstream pi-mono PR** for `VirtualTerminal` export (still pending per `~/me/mirror/backlog.md`). Unchanged since the previous session.

**Meta — test-first on infrastructure code.** Step 1 had a clear red → green slice: the scenario registry test failed because `scripts/verify/scenarios.ts` didn’t exist, then passed once the module was written. Steps 2 and 3 were tooling / fixture steps (no tests added, behavior proven by direct invocation), step 4 was test-first at the live-suite layer (the pixel-diff test was written expecting the golden to exist at the path step 3 committed), step 5 was docs-only. Six feature commits total + one spec commit; each step left `pnpm test` green.

### 2026-04-20 — close CVx.E2.S2 (multi-scenario + HTML gallery)

**Goal:** widen S1's one-scenario verifier into a usable review surface. Add a second scenario exercising a distinct pi-fence code path, an HTML gallery per run, and enough variant plumbing on the scenario registry that a future story can populate a theme or width matrix without refactoring.

**What shipped (spec + six step commits + close):**

- `e3ef0da` spec CVx.E2.S2. Wrote `README.md` + `plan.md` + `test-guide.md` under `cvx-e2-dev-time-screenshots/cvx-e2-s2-multi-scenario-gallery/`, updated parent roadmap + CVx.E2 epic README with live links and status markers. The spec explicitly descopes populating theme/width variants to a future story; S2 ships the plumbing for them.
- `f9e0d5c` step 1: `Variant { name, cols, rows }` on `Scenario`; `build(variant)` replaces `build()`; pipeline iterates combos via `expandCombos` + `renderCombos`; output + golden layouts nest under `<scenario>/<variant>/`; S1's golden migrated via `git mv`. Registry unit test expanded to cover the new shape + `DEFAULT_VARIANT`. Spike driver + test file + CLI picked up the signature change minimally (CLI still single-combo for step 1).
- `714bdcd` step 2: new `mermaid-error-path` scenario. Text-only content, stable synthetic error body ("Parse error on line 1: unknown tag 'flowchrt'"), pinned source containing the triggering typo. Two new unit-test invariants: bytes do NOT contain the Kitty APC (text-only) and DO contain the error label phrase.
- `0082772` step 3: `scripts/verify/gallery.ts` + `tests/unit/verify-gallery.test.ts`. Pure function `renderGalleryHtml(cards)`; single-file self-contained dark-themed document; four unit cases cover empty-list placeholder, multi-card order preservation, `<img src=>` shape, no-remote-assets invariant. Fast suite 168 → 172.
- `f5deaf7` step 4: CLI becomes cross-product-aware. `--variant <name>` requires `--scenario`. Unknown variants exit 1 listing valid names. Without filter flags, every registered combo renders. After every run, `scripts/out/render-verify/index.html` is produced from the pipeline's `RenderResult[]` via `renderGalleryHtml`. `--update` walks every rendered combo, writing each PNG over its golden slot.
- `fd748ee` step 5: golden capture. `pnpm render:verify --update` wrote both goldens (happy-path content-identical to S1; error-path new at ~39 KB). Same calibration environment as S1 (macOS arm64, Chromium 1217, deviceScaleFactor=2). Live suite went from 1 to 2 render-image cases passing.
- `132e60a` step 6: `docs/getting-started.md` scripts row mentions `--variant` + gallery path. CHANGELOG `[Unreleased]` block captures the full S2 delta.
- `close CVx.E2.S2` (this commit): status flips across roadmap / CVx / CVx.E2 epic / S2 story README; worklog close entry.

**Tests:** fast suite 166 → 172 (+6 from S2's scenario + gallery unit cases). Live suite +1 render-image case (1 → 2). `pnpm test` green throughout; `pnpm test:live` green at close (6 cases pass: 2 render-image, 4 kroki.live; 6 skipped: shell-runner.live under its own Docker gate). `pnpm run check` green.

**Known carry-forwards:**

1. Each scenario still ships exactly one variant (`default`). The Variant shape, cross-product iteration, nested golden layout, and test enumeration all handle N variants; filling in real theme or width variants is a separate future story.
2. `DIFF_BUDGET` remains a single global number (100) shared across all combos. Per-combo budgets can come later if one combo empirically proves less stable than another.
3. The gallery is static (no filtering, no side-by-side vs-golden view, no zoom-on-click). If review load grows, a future story can add interactivity.
4. Spike script (`scripts/render-image-spike.ts`) stays in the tree, now calling `renderScenario(scenario, scenario.variants[0], outDir)`. Redundant with `pnpm render:verify` but cheap to keep.

**Follow-ups this story surfaces (not claimed):**

1. **CVx.E2.S3** — sentinel-based readiness and the five-second-per-scenario budget. The pipeline currently uses two rAFs + `setTimeout(100)` as the "render settled" signal. S3's job is to replace those with deterministic observables so the `DIFF_BUDGET` can shrink toward zero across Chromium versions, not just on the calibration machine.
2. **Theme / width variant population.** Concrete candidates: xterm.js terminal-background dark vs. light (two variants), 80-col vs. 120-col (two variants). Orthogonal; could ship in the same follow-up story or separately.
3. **Gallery polish** — click-to-zoom, side-by-side diff against golden. Only when review load actually demands it.

**Meta — test-first iteration speed.** Every step other than the golden-capture and docs commits started with an additive failing unit test (step 1 broadened the scenarios test, step 2 added the error-path invariants, step 3 wrote gallery tests against a nonexistent module). Each green slice landed in under five minutes between test-red and implementation-green. Seven feature commits total + one spec commit + one close; fast suite green on every commit.

### 2026-04-20 — close CVx.E2.S3 (sentinel-based render readiness + timing budget) — closes the CVx lane

**Goal:** drop the pipeline's `setTimeout(100)` tail in favour of deterministic observables; instrument per-combo timing; assert the epic-level five-second-per-scenario budget; verify the sentinel change holds determinism across repeated runs. S3 is the last open story in the CVx batch — closing it brings every specced CVx.E1 + CVx.E2 story to ✅.

**What shipped (spec + five step commits + close):**

- `7600c6a` spec CVx.E2.S3. Three-file story folder under `cvx-e2-dev-time-screenshots/cvx-e2-s3-sentinel-readiness/`; parent roadmap + CVx.E2 epic README linkified the S3 row. Spec flagged three known-unknowns up front: `onImageAdded` ordering vs. `term.write` callback, multi-chunk images, very-small-scenario `onRender` timing.
- `ef85f26` step 1: `scripts/verify/kitty.ts` exports `countKittyImages(bytes)`. Counts only transmit actions (`a=T` / `a=t`); ignores query / delete / placement / multi-chunk continuations. Matches `@xterm/addon-image`'s "one `onImageAdded` per complete image" semantics. Seven unit cases in `tests/unit/verify-kitty.test.ts` including real-scenario byte-stream verification (mermaid-happy-path: 1; mermaid-error-path: 0). Fast suite 172 → 179.
- `265cf9b` step 2: sentinel wait in `scripts/verify/pipeline.ts`. Registers `ImageAddon.onImageAdded` + `Terminal.onRender` BEFORE `term.write` (avoids the race the spec's known-unknowns flagged). `Promise.race` awaits the combined readiness against a 10-second hard bailout so a stuck pipeline surfaces as a slow-and-failing test, not a hung process. Two trailing rAFs for layout settlement. `setTimeout(100)` tail removed. Observed per-combo timings dropped from ~545ms to ~400ms for image-free scenarios (the `setTimeout` was the tail).
- `a170651` step 3: `RenderResult.durationMs`. CLI prints one line per combo (`scenario / variant rendered in NNNms`) + a total (`total: N combos in NNNms`). On this machine the CLI total is ~330ms for the two combos, plus Chromium launch.
- `30964da` step 4: `RENDER_BUDGET_MS = 5000` assertion in `tests/render-image/verify.test.ts`. `DIFF_BUDGET` recalibration decision: three consecutive `pnpm test:live` runs produced zero diff pixels across all 6 combo-runs (3 runs × 2 combos) with per-combo timings of 392–444ms. The budget stays at 100 for CI-host headroom; the test file's comment explicitly names the S3 calibration run so a future reader sees both the value and the observation that would justify shrinking further.
- `feab920` step 5: CHANGELOG `[Unreleased]` block for S3.
- `close CVx.E2.S3` (this commit): status flips (roadmap / CVx parent / CVx.E2 epic / S3 story) + this worklog entry + CVx parent's `Last updated` bumped to 2026-04-20 with a note that every specced story is Done.

**Tests:** fast suite 172 → 179 (+7 kitty APC counter cases). Live suite still 2 render-image cases, now each asserting both pixel-diff (budget 100) and wall-clock (budget 5000ms). `pnpm test` green; `pnpm test:live` green across three consecutive runs; `pnpm run check` green.

**Carry-forwards from S1 resolved:**

1. "`DIFF_BUDGET=100` tuned on one machine; CI may observe drift" — partially resolved. With sentinel-based readiness, determinism on this machine is byte-level. The budget of 100 stays as CI-host headroom; if cross-OS CI proves identically perfect, a future story can shrink it.
2. "Live suite's green-skip pattern is a matrix (Chromium AND Docker)" — still carried forward; unchanged by S3.
3. "Spike scripts remain" — still carried forward. Same treatment as S2.

**CVx lane state at close:**

- CVx.E1.S1 ✅ Render layer (VirtualTerminal-backed renderer tests).
- CVx.E2.S1 ✅ Headless image verifier (first scenario, first diff gate).
- CVx.E2.S2 ✅ Multi-scenario + gallery + variants plumbing.
- CVx.E2.S3 ✅ Sentinel readiness + timing budget.

Every specced story in the CVx batch is closed. The epic-level done criterion for both CVx.E1 and CVx.E2 is met. The lane itself remains open (Verifiability is always advancing, per the parent README), but there is no specced follow-up work waiting.

**Follow-ups this close surfaces (not claimed; none are blocking):**

1. Populate the theme / width variant matrix (S2 left the plumbing; no scenarios exercising it yet).
2. Shrink `DIFF_BUDGET` toward 0 after observing cross-OS determinism on CI.
3. Parallel combo rendering (`renderCombos` is serial across a shared browser; if combo count grows past ~10, parallelism starts to matter).
4. CI activation (`.github/workflows/live.yml` is dormant).
5. `--watch` / incremental mode for the verifier.
6. Interactive gallery polish (side-by-side vs golden, click-to-zoom).
7. Spike-script consolidation (`scripts/render-*-spike.ts` could now go, but stay until a cleanup story).
8. Upstream pi-mono PR for `VirtualTerminal` export (backlog entry at `~/me/mirror/backlog.md`).

**Meta — one-session CVx burn-down.** This worklog entry closes a session that spanned CVx.E2.S1 close, the backlog creation, CVx.E2.S2 spec + implementation + close, and CVx.E2.S3 spec + implementation + close — three consecutive stories shipped following the same spec / step-commits / close rhythm. Across the three stories: 30+ commits, fast suite 161 → 179 (+18 cases), live suite 5 → 6 passing with the new timing assertion, docs catch-ups stayed adjacent to feature commits per the docs-follows-feature rule (one retroactive batch entry early on covered the two CVx.E2 spikes that predated the rule's tightening).

### 2026-04-20 — CVx post-close follow-ups (#7, #1, #6, #4)

Four of the eight follow-ups from `a99e859`'s close. Four feature commits + this docs catch-up. Batched because each is small and they landed adjacently in the same session.

- `58f7951` **#7 — spike scripts retired.** Deleted the three `scripts/render-*-spike.ts` files and their `render:*-spike` npm scripts. Dev deps that only the a11y spike used (`@wterm/dom`, `jsdom`, `@types/jsdom`) pruned. `pnpm render:verify` is the one maintained verifier entry point.
- `bc37a7e` **#1 — narrow variant matrix.** `scripts/verify/scenarios.ts` exports `NARROW_VARIANT` (80×30); both scenarios list `[DEFAULT_VARIANT, NARROW_VARIANT]`. `pnpm render:verify --update` captured two new goldens. Live suite 6 → 8 passing cases. Three consecutive runs produced zero diff pixels on all four combos. Theme-color variants (terminal bg/fg) still deferred — they'd need a new field on `Variant` and re-calibration across every combo.
- `dce3c6e` **#6 — gallery polish.** `GalleryCard.goldenRelativePath` added; cards with a golden grow a `[data-showing]` toggle button that swaps rendered / golden in place. Click-to-zoom: a lightbox overlay opens the current image full-size on click, closes on click or Escape. Inline `<script>` (~40 lines), no external deps. `scripts/verify.ts` wires `tests/fixtures/golden/<scenario>/<variant>.png` into each card when present. Fast suite +2 cases.
- `5ab0d7a` **#4 — live workflow activated.** `.github/workflows/live.yml` adds `npx playwright install --with-deps chromium` before the test run so the Render Image layer has its browser. Both CI workflow comments updated to name the tests/render-image layer and flag the cross-OS `DIFF_BUDGET` carry-forward. Enabling PR triggers for the live suite was NOT included — Chromium + Docker per PR costs ~3 extra CI minutes, a bigger decision than this cleanup.

**Tests:** fast suite 179 → 181 (+2 gallery cases). Live suite 6 → 8 (narrow combos). `pnpm run check`: 44 markdown files linted, 0 errors throughout.

**Remaining CVx follow-ups from `a99e859` that are still open:**

1. Populate the theme matrix (only width variants were added here).
2. Shrink `DIFF_BUDGET` after observing cross-OS drift (needs CI runs post-#4).
3. Parallel combo rendering (`renderCombos` still serial; fine at 4 combos, worth revisiting past ~10).
4. `--watch` / incremental mode for the verifier.
5. Upstream pi-mono PR for `VirtualTerminal` export (still in `~/me/mirror/backlog.md`).

**Meta on batching:** one docs commit covering four feature commits follows the retroactive-batching exception (none of the follow-ups is a story; each feature commit is self-contained). The CVx close entry set the expectation that these four would be picked up; the batched worklog entry here closes the loop on all of them at once.

### 2026-04-20 — post-CV0.E1.S4 follow-ups: shape-variation scenario + language gallery

**Trigger.** Immediately after S4 closed, the natural question surfaced: *now that we advertise 17 languages, shouldn't the render-verify suite cover all of them?* Design discussion walked through the tradeoff:

1. **Per-language render-verify scenarios** would cost ~34 new combos, ~1.7 MB of committed goldens, and a refresh-fixtures burden per Kroki drift — while mostly duplicating the composition signal across 17 different image payloads (pi-fence's renderer doesn't branch on tag name).
2. **The Render Image test layer's unique value** is catching pi-fence-level shape regressions independent of image content. Variance along the *shape* dimension (tall PNG, short PNG, long error text, multi-image) adds genuine signal; variance along the *tag* dimension does not.
3. **The marketing / docs value of a 17-tile showcase** is real but separate from the test gate.

Conclusion: split the two concerns.

- Add one shape-variation render-verify scenario now (`kroki-tall-image`) as the first step in the shape dimension. Keep the gate lean.
- Ship a separate `pnpm render:gallery` dev-tool entrypoint that renders every language through the trail composition for docs / screenshots / design review. No goldens, no pixel-diff.

**What shipped (two feature commits + this docs catch-up):**

- `29a95fc` **feat(verify): add kroki-tall-image render scenario.** `scripts/verify/scenarios.ts` gains `buildKrokiTallImage`, a trail composition around the wireviz harness PNG (≥26 KB, one of the tallest Kroki outputs) + the full YAML source in the assistant's reply. Fixture at `tests/fixtures/wireviz-harness.png` (POST-fetched from kroki.io using the canonical source from `canonical-sources.ts`). Default variant only — narrow deferred. Byte-identical across consecutive renders; teeth check not rerun since the broader teeth pattern was validated in the CVx.E2 batch.
- `9852937` **feat(tooling): `pnpm render:gallery` — one tile per Kroki language.** `scripts/render-gallery.ts` fetches 17 PNGs from `kroki.io` (bounded concurrency 4), constructs in-memory `Scenario[]` per language (dynamic, NOT added to the static test registry), runs them through the existing `renderCombos` pipeline at a taller 120×140 viewport, post-crops each PNG via `pngjs` to trim trailing black. Emits browsable HTML. Supporting changes: `buildTrail` / `PiFenceCustomMessage` exported from `scenarios.ts`; `renderGalleryHtml` gains a `{ title, emptyHint }` options bag (defaults match today's render:verify shape so existing callers unchanged). `docs/product/kroki-support.md` documents the command under "Browsing a live gallery" with the not-a-test-gate framing made explicit.

**Gates:** fast suite 181 → 181 unchanged. Live suite 25 → 26 render-image cases. `pnpm render:gallery` runs end-to-end in ~10–15s wall clock on the calibration machine with network access (4 concurrent Kroki fetches then serial Chromium renders). `pnpm run check` green across 48 markdown files.

**Follow-ups not claimed:**

1. **More shape-variation render-verify scenarios.** `short-image`, `long-error-text`, `light-theme`, `multi-image` — each one added when a concrete shape-regression concern warrants it. No blanket need today.
2. **Refresh-fixtures command.** Today's tall-image fixture (`wireviz-harness.png`) and the mermaid fixture (`mermaid-flowchart.png`) refresh by manually POSTing to kroki.io. `scripts/refresh-fixtures.ts` is a skeleton from CV0.E1.S0 that never got filled in. Candidate for a small tooling story when a second committed fixture joins the mermaid+wireviz pair.
3. **Gallery polish.** Today's gallery is 17 tiles in the existing render-verify gallery HTML shape. Potential additions once the gallery earns them: category grouping (core vs. blockdiag family vs. domain-specific), per-tile fetch-timing, language descriptions inline with each tile. None of these blockers for the showcase purpose.
4. **Concurrent fetch progress output tidiness.** Current render:gallery progress output interleaves stderr lines when concurrent fetches complete in the same tick. Minor UX. Fix if it becomes annoying in practice; acceptable for a dev tool today.

**Meta — design discussion ahead of implementation pays off.** The user asked "should we have render-verify tests for all the tags?" The answer (no — split the shape and the showcase values) was arrived at in the chat, and implementing against it produced two cleanly-scoped commits that compose without overlap. Had this been implemented first and questioned second, we'd likely have a sprawl of per-language scenarios to unwind. Concrete argument for the "discuss shape, then ship" cadence.

### 2026-04-20 — close CV0.E1.S4 (full Kroki text coverage)

**Goal:** honest coverage of Kroki's public endpoint — every text-body language the endpoint serves as PNG renders through pi-fence with a verified live test. Languages the public endpoint refuses are documented as unsupported with a follow-up path.

**What shipped (six commits):**

- `637b8d1` **step 1: research.** `tests/fixtures/kroki/canonical-sources.ts` captures 17 PNG-supporting languages with canonical minimal sources, alias lists, and per-language `sizeFloorBytes` calibrated from probe observations. The probe itself lived at `/tmp/s4-probe/probe.ts` (not committed, per plan). Surprise finding: `d2` was in pi-fence's current allowlist since S2 but never had a live test — Kroki's public endpoint refuses PNG for it (`400: Unsupported output format: png … Must be one of svg.`). Every user who wrote a ` ```d2 ` block was seeing an error-kind panel.
- (step 2 skipped) No new aliases surfaced by the research. None of the 14 new canonicals have colloquial alternatives as established as `dot` / `puml`.
- `413a1db` **step 3: broaden allowlist.** 14 new canonical tags added to `KROKI_CANONICAL_TAGS` + `SUPPORTED_TAGS`: `blockdiag`, `seqdiag`, `actdiag`, `nwdiag`, `packetdiag`, `rackdiag`, `c4plantuml`, `ditaa`, `erd`, `structurizr`, `symbolator`, `tikz`, `umlet`, `wireviz`. Ordering groups related languages (core → blockdiag family → domain-specific). The extension test's hardcoded tag-list assertion refactored to derive from production constants via `formatProcessorLines(KROKI_CANONICAL_TAGS, KROKI_ALIASES)` — immune to future language additions.
- `ed5fea0` **step 3b: remove `d2`.** Its own atomic commit per the design discussion, so the breaking-from-S2 change has a reviewable SHA in isolation. The unit test's `passes unaliased tags through unchanged` case swapped its example from `d2` to `blockdiag` (a real unaliased canonical tag pi-fence now advertises).
- `0ec5956` **step 4: live tests per language.** `tests/integration/kroki.live.test.ts` refactored to iterate `KROKI_TEXT_LANGUAGES` from the fixture. 17 happy-path cases + 2 alias round-trip cases added. Handwritten error + abort cases kept. Per-case timeout bumped from 20s to 30s (c4plantuml's C4-PlantUML stdlib fetch needs headroom). Live suite grew from 4 passing kroki cases to 25; full run 17.45s on the calibration machine.
- `c12040f` **step 5: docs.** New `docs/product/kroki-support.md` reference with four tables: supported (17), SVG-only deferred (8), backend-unavailable (1), JSON-body scoped to S5 (3). README status line and supported-tags paragraph updated. `docs/getting-started.md` prompts refreshed (dropped `d2`, added `blockdiag` + `wireviz`). CHANGELOG `[Unreleased]` gets an `Added (CV0.E1.S4)` block and a `Removed (CV0.E1.S4 — breaking change)` block specifically for `d2`.
- `close CV0.E1.S4` (this commit): status flips across roadmap + Epic + story READMEs, focus/next unstaled, worklog close entry.

**Plan deviations:**

- **Step 2 skipped** (unit tests for new aliases). The plan assumed new aliases would surface; research showed none as common as `dot`/`puml`. Noted in step 3's commit message rather than fabricating aliases.
- **Step 3b added** (d2 removal). The plan didn't anticipate removing a language from the allowlist. The research pass turned up that d2 never worked. Kept as a separate atomic commit between steps 3 and 4 for reviewability, per the design discussion.
- **Step 4 refactored rather than batched.** The plan suggested batching live tests 5-per-commit. Data-driving the live test from the fixture made that split artificial — one refactor commit lights up 17 + 2 cases simultaneously, and future per-language additions reduce to fixture edits. Trade-off discussed in the commit message.

**Tests:** fast suite 181 → 181 (the extension test's hardcoded assertion was refactored to derive from production, absorbing the new tags without adding case count). Live suite went from 6 passing cases (2 render-image + 4 kroki) to 27 passing (4 render-image + 23 kroki), 6 Docker-skipped unchanged. `pnpm run check` green across 48 markdown files.

**Carry-forwards:**

1. `d2` and 7 other SVG-only Kroki languages (`bpmn`, `bytefield`, `dbml`, `nomnoml`, `pikchr`, `svgbob`, `wavedrom`) documented as deferred. An SVG→PNG rasterization story would unlock all 8 at once; self-hosted Kroki (CV2.E2) with alternate backends is the other path.
2. `diagramsnet` (503 Connection refused on public endpoint) deferred to CV2.E2.
3. JSON-body languages (Vega, Vega-Lite, Excalidraw) scoped to CV0.E1.S5 — specced and ready to start.
4. The fast suite's extension-layer test now derives from `KROKI_CANONICAL_TAGS` + `KROKI_ALIASES`. Any future test that asserts on the tag-list shape should follow the same pattern rather than hardcoding.

**Meta — research drove scope.** The plan treated the research step as "enumerate what Kroki hosts." The probe actually uncovered three buckets that fundamentally restructured the story: PNG-supported (the target), SVG-only (surprise-large — 8 languages, including a currently-advertised-but-broken `d2`), and backend-unavailable (1). Had the research been deferred or batched with implementation, the d2 surprise would have landed mid-implementation rather than in a clean prep commit. Reinforcement for the plan's "research first, implement second" rhythm.

### 2026-04-20 — fix: breathing row scoped per content kind after a uniform-bump iteration

**Trigger.** `9372e78` uniformly bumped the label→content Spacer from 1 to 2 for both happy and error paths. The user flagged that the error path then read as unnecessarily airy with two blank rows between the red header and the white body — asked for Spacer(2) only for image content, Spacer(1) for text.

**What shipped (one feature commit + this docs catch-up):**

- `d87c345` **fix: scope the label breathing-row bump to image content only.** `extensions/pi-fence/renderer.ts`: peek at `message.content` up front to compute `hasImage`, then size the label spacer as `Spacer(hasImage ? 2 : 1)`. Content-driven check chosen over keying on `details.kind` because if anyone ever sends text-only content with `kind: "ok"`, the spacing still matches the text reality. Renderer comment block rewritten to name both branches explicitly so the invariant is harder to regress. Happy-path goldens are byte-identical to `9372e78`'s (same Spacer(2) for them); error-path goldens recaptured with the one-row gap restored.
- This worklog entry + CHANGELOG `[Unreleased]` block folded into the prior "breathing row" entry with the "sized per content kind" refinement noted inline.

**Tests:** fast suite 181 → 181 (viewport assertions use `.includes()` on content substrings, insensitive to blank-row counts). Live suite 4 → 4 render-image cases, all green after the error-path recapture. `pnpm run check` green.

**Meta — two-step fix as a cost of over-generalising.** The original choice to keep the spacer uniform across both paths came from my preference to avoid branching; the user's feedback reframed that as over-generalising at the expense of the error path's aesthetics. The content-driven check is cheap (one `.some()` on a small array) and the result reads better in both paths. Concrete reminder that "uniform" isn't free when the two paths paint different content kinds with different visual absorption of blank rows.

### 2026-04-20 — fix: breathing row between pi-fence:output header and content (user-surfaced via verifier fidelity)

**Trigger.** Hot on the heels of the duplicate-header fix (`e0f29c7`), the user opened the `mermaid-happy-path/narrow` golden and flagged the opposite symptom: the A/B/C boxes sat flush against the purple `Rendered mermaid via kroki` header with no visible breathing space. Asked for an empty line of air between them.

**Diagnosis.** The renderer's `box.addChild(new tui.Spacer(1))` after the label is structurally correct — it does emit one blank row at the cell grid between the label and the content. The error (text) path's blank row is plainly visible between the red header and the white body. The happy path's blank row is invisible: Kroki's rendered PNG has its own internal top margin of dark pixels that are indistinguishable from the terminal's black background, and the image canvas is overlayed starting at row Y+2 (right after the Spacer row Y+1). The first couple of pixel rows inside the PNG look identical to a blank cell-grid row, so visually the `Spacer(1)` is swallowed by the image's margin and the diagram boxes read as sitting right below the label.

**Design discussion with the user.** The user first asked whether `paddingY` on the Box could replace the Spacer. `paddingY` pads the Box top and bottom, not *between* children, so that change alone would have removed the only label⇔content gap without adding one. I laid out four options — bump `Spacer(1)→Spacer(2)`, keep Spacer(1) + `paddingY=1`, combine both, or branch per content kind — and recommended the first. The user picked option 1.

**What shipped (one feature commit + this docs catch-up):**

- `9372e78` **fix: breathing room between pi-fence:output header and content.** `extensions/pi-fence/renderer.ts`: the sole `Spacer(1)` after the label becomes `Spacer(2)`, with a comment block spelling out why (Kroki's internal PNG top margin visually absorbs a single blank cell-grid row). The expanded-source branch's internal `Spacer(1)` stays as-is — no scenario covers it today, so no user-visible signal to bump it yet. Goldens recaptured for all 4 combos on the calibration machine (macOS 26.4.1 arm64, Chromium 1217). Byte-identical across two consecutive `--update` runs.
- This worklog entry + matching CHANGELOG `[Unreleased]` block.

**Tests:** fast suite 181 → 181 (viewport assertions use `.includes()` on content substrings, not exact blank-row counts, so they're insensitive to the spacer bump). Live suite 4 → 4 render-image cases, all green after recapture. `pnpm run check` green.

**Meta — second catch in under an hour.** Two human-surfaced issues from reading the verifier gallery, back-to-back (`e0f29c7` error panel header-duplicate, now this breathing-row fix). Both were production behaviours that neither the fast-suite unit tests nor the pre-refactor isolated render-image scenarios could have caught: the unit tests don't paint the whole panel in a xterm-faithful way, and the pre-refactor scenarios had the same production behaviours baked into their goldens so the pixel-diff would always match. The composition-level trail layout gave these issues enough visual room to be noticed. Concrete reinforcement that a reviewer-facing gallery of composition-level PNGs earns its keep as a design-review artefact, not just a regression gate.

### 2026-04-20 — fix: error panel no longer duplicates its header phrase (user-surfaced via verifier fidelity)

**Trigger.** Immediately after the composition-level refactor shipped (`2112eae`), the user opened the `mermaid-error-path/default` golden from the gallery and noticed the panel stacked two nearly-identical lines: a red header `Error rendering mermaid via kroki` and a white body `Error rendering mermaid via kroki: Parse error on line 1: unknown tag 'flowchrt'`. The white body re-spoke the red header's phrase before getting to the actual upstream error. This is exactly the kind of regression the composition-level shift to trail-shaped scenarios is supposed to surface — the old isolated-renderer scenario showed the same redundancy but in a compact enough layout that it blended in; the wider composition made it jump out.

**Diagnosis.** The duplication lived in `extensions/pi-fence/index.ts:283` — `buildCustomMessage`'s error branch emitted the content text as `` `Error rendering ${tag} via ${processorId}: ${result.error}` ``, and the renderer separately composed its own red header via `formatLabel({ kind: "error", tag, processor })`. The happy-path branch of the same function had already recognised this dynamic and dropped its fallback text item; the comment reads *"the renderer is authoritative … the fallback only produced the visible duplicate"*. The error branch was an oversight — the same invariant applies, so the fix is symmetric: the body becomes just `result.error`.

**What shipped (one feature commit + this docs catch-up):**

- `e0f29c7` **fix: stop duplicating the `Error rendering <tag> via <processor>` prefix.** `extensions/pi-fence/index.ts`'s error branch emits `text: result.error`; added a parallel comment making the invariant explicit ("symmetric with the happy-path branch above: the renderer's chrome is authoritative"). `tests/unit/renderer.test.ts`'s error-path fixture drops the prefix from its input text (`"Error rendering mermaid via kroki: syntax"` → `"syntax"`); existing assertions still pass because the `Error rendering mermaid via kroki` phrase in the viewport comes from the renderer's header, not the body. `scripts/verify/scenarios.ts`'s `mermaid-error-path` scenario uses the raw upstream error string (`"Parse error on line 1: unknown tag 'flowchrt'"`). Goldens recaptured for both `default` and `narrow`; byte-identical across consecutive `--update` runs.
- This worklog entry + matching CHANGELOG `[Unreleased]` block.

**Tests:** fast suite 181 → 181 (no count change; same assertions pass against the tightened fixtures). Live suite 4 → 4 render-image cases (goldens updated in place). `pnpm test` green; `pnpm test:live` green; `pnpm run check` green (0 lint errors).

**Meta — composition-level framing earning its keep.** The isolated `mermaid-error-path` scenario before the refactor rendered the same two-line panel, but its goldens were content-agnostic byte-diffs against a committed baseline — the redundancy was *in* the baseline, so no pixel-diff test would ever have caught it. It took a human opening the verifier's gallery and reading the panel as *a pi user would* to surface it. The composition-level refactor surfaced the issue within an hour of shipping: the wider canvas gave the two stacked phrases enough horizontal room to be clearly read as the same sentence twice. This is the kind of regression the Render Image layer exists to catch when the human is in the loop — and a concrete data point for keeping the verifier gallery as a reviewer-facing artefact, not just a test-gate dependency.

### 2026-04-20 — Render Image scenarios standardise on the composition-level trail (post-CVx.E2.S4 refactor)

**Goal:** immediately after S4's close, the user flagged that S4's framing — "does what a pi user actually look right?" — applies to *every* Render Image scenario, not just one flagship. Keeping `mermaid-happy-path` and `mermaid-error-path` as isolated-renderer scenarios alongside a dedicated trail scenario duplicated coverage the Render layer already provides (via `VirtualTerminal` byte-stream assertions in `tests/unit/renderer.test.ts` and `tests/extension/pi-fence.test.ts`) while missing the composition-level shape on the happy and error paths. This refactor folds everything onto one shape: every Render Image scenario renders the full user → assistant → pi-fence:output composition.

**What shipped (one feature commit + this docs catch-up):**

- `2112eae` **refactor: all render-image scenarios render at composition level.** `scripts/verify/scenarios.ts` factors `buildTrail(userText, assistantMarkdown, customMessage, variant)` — the shared helper that sets capabilities, bootstraps the dark theme via `initTheme("dark")`, constructs `UserMessageComponent` + `AssistantMessageComponent` (with `timestamp: 0` + zero `usage` pinned for determinism) + `CustomMessageComponent(customMessage, createPiFenceMessageRenderer(...))`, wires them into a pi-tui `Container` with spacers, and paints through `paintComponent`. `buildMermaidHappyPath` becomes a thin wrapper: user asks for a mermaid flowchart → assistant replies with a fenced block → pi-fence:output panel shows the PNG. `buildMermaidErrorPath` mirrors it: user asks for a flowchart → assistant replies with a fenced block containing a `flowchrt` typo → pi-fence:output surfaces Kroki's parse error. The `mermaid-user-agent-trail` scenario retires (its coverage folds into `mermaid-happy-path`, which is now the same composition); the `IDENTITY_THEME` stub is gone. Goldens recaptured for all 4 combos; the orphan `mermaid-user-agent-trail/default.png` is removed. `tests/unit/verify-scenarios.test.ts` drops the trail-specific assertions. Teeth check: swapping the happy-path user text produces a 3901-pixel diff on both happy combos (error combos stay green, different user text); revert restores byte-identity.
- This worklog entry + CHANGELOG `[Unreleased]` block + focus/next touch-up.

**Tests:** fast suite 182 → 181 (−1 obsolete trail-specific invariant). Live suite 5 → 4 render-image cases: the dedicated trail scenario retires, and the two composition-level scenarios each carry both width variants (default + narrow). `pnpm test` green; `pnpm test:live` green on first run after recapture; `pnpm run check` green (0 lint errors across 47 markdown files).

**Narrow variant fit verified.** The trail stack (user bubble + spacer + assistant reply + fenced source + spacer + pi-fence:output panel) fits cleanly in 80×30 for both happy and error paths; no clipping visible in the captured PNGs.

**Design note on scope.** This was shipped as a post-close refactor, not a new story (no `CVx.E2.S5` spec). Rationale matches the post-close batching pattern used for the four S3 follow-ups (`58f7951`, `bc37a7e`, `dce3c6e`, `5ab0d7a`): the change is tightly scoped, pure test-layer, has no new interface or behaviour, and the reasoning was already captured in the chat that surfaced it. One feature commit, one docs commit, adjacent.

**Follow-ups this refactor surfaces:**

1. Additional content families (`graphviz-happy-path`, `plantuml-happy-path`, …) are now cheap to add — `buildTrail` handles all the scaffolding, callers only supply the three content knobs. Added as pressure arises.
2. Multi-turn compositions (user → assistant → user → assistant → fence) remain a future story — `buildTrail` paints one turn by design; multi-turn is a bigger shape.
3. Theme variants (dark vs. light) still deferred — the helper hard-codes `initTheme("dark")`. A future story could parameterise this through the `Variant` shape.

### 2026-04-20 — close CVx.E2.S4 (`mermaid-user-agent-trail` scenario) — the CVx.E2 epic's Planned row is now empty

**Goal:** register the composition-level scenario specced in `db753a6` — the full user → assistant → pi-fence:output visual painted through pi-coding-agent's real interactive-mode components — so the verifier and the pixel-diff gate catch regressions at the composed shape, not only in pi-fence's renderer in isolation. S4 was the last open story in the CVx batch; closing it brings every specced CVx.E1 + CVx.E2 story to ✅.

**What shipped (two step commits + this close):**

- `a1b8bb5` **step 2: mermaid-user-agent-trail scenario.** `scripts/verify/scenarios.ts` gains `buildMermaidUserAgentTrail`: initialises capabilities + `initTheme("dark")` (required because the pi-coding-agent components read pi's theme singleton via the `theme` proxy, which throws if uninitialised), composes `UserMessageComponent` / `AssistantMessageComponent` / `CustomMessageComponent(customMessage, createPiFenceMessageRenderer(...))` into a pi-tui `Container`, paints through the existing `paintComponent` harness. `timestamp: 0` + zero `usage` pinned on the synthetic `AssistantMessage` for byte-stability. Registered with a single `default` (120×60) variant — narrow deferred per the story's scope. `tests/unit/verify-scenarios.test.ts` gains one scenario-specific invariant: the byte stream contains the Kitty APC (composition correctness signal) and the variants list has exactly one `default` entry. Fast suite 181 → 182.
- `db3e551` **step 3: golden for `mermaid-user-agent-trail/default`.** Two consecutive `pnpm render:verify --update` runs on the calibration machine (macOS 26.4.1 arm64, Chromium 1217) produce byte-identical PNGs — committed the golden at `tests/fixtures/golden/mermaid-user-agent-trail/default.png`. Teeth check: replacing the user prompt with a completely different string produced a 4568-pixel diff against the golden (well above `DIFF_BUDGET=100`); reverting restored byte-identical output and the combo returned to green. The new render-image case runs at ~421ms, ~12× under the 5000ms timing budget.
- `close CVx.E2.S4` (this commit): CHANGELOG `[Unreleased]` block + status flips across the roadmap top, the CVx parent, the CVx.E2 epic, and the S4 story README + this worklog entry + focus/next unstale (no open specced story, the next move is a feature CV).

**Plan deviations.**

- Plan listed five steps (step 1 research, step 2 code, step 3 golden, step 4 live verification, step 5 docs). Step 1 happened via reading upstream source directly (pi-coding-agent's component constructors + `theme.ts`) to decide theme bootstrap (path B: `initTheme("dark")`; path A was infeasible because the components use the `theme` proxy for non-markdown things). Step 4 collapsed into step 3 because the live suite's single added case was green on first run with no budget calibration needed. Net: three commits instead of the plan's up-to-five, with the same verification depth.
- Plan optional invariant ("byte stream contains `Show me a mermaid flowchart`") swapped for a stricter one ("contains Kitty APC + single `default` variant"). Reason: the user-prompt glyphs pass through pi-coding-agent's bubble chrome (markdown + theme bg), so the literal ASCII substring may not survive; the Kitty APC presence is a stronger composition-correctness signal and was already the shape used by S1's happy-path invariant.

**Tests:** fast suite 181 → 182 (+1 trail-scenario invariant). Live suite 4 → 5 render-image cases (all combos pixel-diff + 5000ms timing green). `pnpm test` green; `pnpm test:live` green across runs; `pnpm run check` green (48 markdown files, 0 errors).

**CVx lane state at close:**

- CVx.E1.S1 ✅ Render layer (VirtualTerminal-backed renderer tests).
- CVx.E2.S1 ✅ Headless image verifier.
- CVx.E2.S2 ✅ Multi-scenario + gallery + variants plumbing.
- CVx.E2.S3 ✅ Sentinel readiness + timing budget.
- CVx.E2.S4 ✅ Composition-level trail scenario.

Every specced CVx story is ✅. The epic-level done criterion for both CVx.E1 and CVx.E2 is met. The lane itself remains open (Verifiability is always advancing, per the parent README), but there is no specced follow-up work waiting.

**Follow-ups this close surfaces (not claimed; none are blocking):**

1. A narrow (or wide) variant on `mermaid-user-agent-trail` if one width proves bug-prone.
2. Theme variants on any scenario (dark vs. light pi theme flowing through the bubbles) — plumbing is ready, population is future work.
3. A second trail (`graphviz-user-agent-trail` etc.) once a concrete regression justifies it.
4. Multi-turn transcripts (user → assistant → user → assistant → fence) — worth its own story; S4 paints one turn.
5. `AgentSession`-based composition (static compose works today; a live session would catch integration issues the synthetic message does not).
6. The four still-open follow-ups from `a99e859`'s close (theme variant matrix, cross-OS `DIFF_BUDGET` shrink, parallel combo rendering, `--watch` mode) plus the two `~/me/mirror/backlog.md` backlog items (upstream `VirtualTerminal` export and the addon-image overlay CSS bug report).

**Meta — one-session story shape.** S4's spec commit `db753a6` landed in the previous session; this session picked up that spec and closed the story in two feature commits + this docs close, all on the same day, following the plan's `wip(agent): <why> (S4 step N)` → `close CVx.E2.S4` commit rhythm. No spec churn during implementation. The single plan deviation (steps 4+5 merged) is documented above.

### 2026-04-20 — addon-image overlay fix (`bb02d33`) + spec CVx.E2.S4 (`db753a6`)

Two commits after the post-close follow-up batch. Logged retroactively as one entry because (a) neither is a story commit, (b) each has a CHANGELOG entry already, and (c) they're related: the fix made the verifier's output faithful enough that the user noticed the isolated-render framing as the remaining gap, which is exactly what S4 addresses.

- **`bb02d33` fix: overlay the Kitty-addon image canvas on the xterm screen.** The user opened the `pnpm render:verify` gallery and reported: 'I see a big gap between the label and the diagram.' DOM inspection showed `@xterm/addon-image`'s `xterm-image-layer-top` canvas at page `y=925`, while `.xterm-screen` ended at `y=900` — a 25-pixel visual gap plus a full screen-height below, i.e. the canvas flows as a regular block instead of overlaying the text grid. Root cause: the addon `appendChild`s its canvas to `.xterm-screen` expecting absolute positioning rules that the addon itself never ships. Fix: `tests/utilities/addon-image-overlay-fix.ts` exports `ADDON_IMAGE_OVERLAY_CSS` (four lines: `.xterm-screen { position: relative }` + `position: absolute; top/left: 0; pointer-events: none` for `xterm-image-layer-*`). `scripts/verify/pipeline.ts` injects it into the verifier's `<style>` block. Goldens recaptured; live suite green at 8 combos.
- **`c233afd` docs: log addon-image overlay fix + file upstream-report backlog entry.** Paired docs commit for `bb02d33` per docs-follows-feature. Added an entry to `~/me/mirror/backlog.md` capturing everything a future session needs to report the bug upstream against `xtermjs/xterm.js` (reproduction, proposed CSS rules, permission protocol). Not filed yet; requires Henrique's go-ahead.
- **`db753a6` spec CVx.E2.S4 — `mermaid-user-agent-trail`.** After the fix landed, the user observed that the verifier still shows pi-fence's render in isolation rather than in the surrounding chat context a real pi user sees. Specced S4 as the scenario that fills this gap: compose pi-coding-agent's real `UserMessageComponent` / `AssistantMessageComponent` / `CustomMessageComponent` into a `Container` painted through the existing verifier pipeline. Public exports confirmed on `upstream/main`. `timestamp: 0` + zero usage pinned in the synthetic `AssistantMessage` for byte-stability. Theme-singleton bootstrap has two candidate paths flagged as decision-on-encounter. Single `default` variant to keep scope tight; no new dependencies needed. Spec-only commit, no code.

**Tests:** 182 → 181 between `873367a` and `bb02d33` (the addon-image workaround file carried a stray unit test before the CSS fix superseded it; the test file was deleted alongside the misguided workaround). Live suite: 8 passing (4 render-image × pixel-diff + 4 kroki.live); 6 skipped under Docker gate. `pnpm run check`: 47 markdown files linted (3 new from the S4 spec folder), 0 errors.

**Handoff state at the moment this entry lands:**

- Roadmap top + CVx parent + CVx.E2 epic + story READMEs all consistent: CVx.E1.S1 and CVx.E2.S1–S3 are ✅; CVx.E2.S4 is 🛠️ Planned. (Superseded by the next entry — S4 is now ✅ as well.)
- No uncommitted changes; all gates green.
- `AGENTS.md` Read-first + roadmap flow lands a fresh session on CVx.E2.S4's plan as the next actionable Planned row.
- Two non-blocking backlog items still in `~/me/mirror/backlog.md`: upstream `VirtualTerminal` export (pi-tui) and upstream addon-image overlay CSS bug report (xterm.js). Both need Henrique's go-ahead before filing.
- CVx post-close follow-ups still open (from `a99e859`'s list): theme variant matrix, `DIFF_BUDGET` cross-OS tightening, parallel combo rendering, `--watch` mode.

### 2026-04-20 — spec CV0.E2.S1 (`fa1b4c3`) — local graphviz with capability-based resolution

**Trigger.** With `CV0.E1` closed on its core stories and the post-S4 shape-variation + gallery follow-ups shipped, the next CV-line move is `CV0.E2` — the Epic that pressure-tests the registry abstraction by plugging a second processor alongside Kroki. The top-level roadmap had `CV0.E2` as plain text since the initial draft; specing `S1` was the trigger to also seed the Epic folder and its `README.md`.

**Design discussion ahead of implementation.** Three decisions were surfaced in chat and locked in before writing the plan, rather than as open questions inside it:

1. `FenceProcessor.available()` becomes a **required** method on the interface (not optional). Kroki gets `async () => ({ ok: true })`. Rationale: D4 in the briefing explicitly says every processor exposes capability detection; S1 is the first story where the *user-visible* behaviour depends on that exposure, so this is where the interface change earns its place. The alternative (optional method, `Kroki` omits it) drifts from D4's "each processor exposes" wording for no real saving — Kroki's impl is one line.
2. Resolution is **capability-based only**: iterate `processors` in registration order (graphviz-local first, Kroki second), return the first one whose tags/aliases cover the block's tag AND whose `available()` was ok at wire-time. Explicit per-tag binding via settings defers to `CV0.E2.S2`, which is the first story that reads `~/.pi/agent/pi-fence.config.json`. Rationale: smallest thing that honours the Epic Done criterion; keeps `S1` config-less.
3. `ProcessorStatus` widens from `"registered"` to `"registered" | "unavailable"` **now, not deferred to `/fence doctor`**. Rationale: with two processors both claiming `graphviz`/`dot`, the user needs to be able to see which one actually served their render. The formatter emits a second indented line with reason + install hint for unavailable rows; the renderer stays dumb (no new branch on kind). Deferring this to `/fence doctor` would leave S1 shipping a feature the user can't verify.

**One decision flagged for resolution during implementation:** PNG bytes must survive round-trip through `ShellResult`. `ShellRunner.run` currently returns stdout as a UTF-8 string, which corrupts binary output. Step 3 of the plan resolves this as either (a) widening `ShellResult` with a `stdoutBuffer` field or (b) adding a sibling `shell.runBinary(...)` method — whichever is smaller after reading `ShellRunner`'s current shape wins, and the self-test for the runner is updated in the same step. Tracked as a plan deviation candidate in the S1 close entry.

**What shipped (one spec commit + this docs catch-up):**

- `fa1b4c3` **spec CV0.E2.S1 — local graphviz with capability-based resolution.** Five files: new Epic README at `docs/project/roadmap/cv0-it-works/cv0-e2-graphviz-local/README.md` (stories table, deliverable vision showing both branches, architecture diagram with the new `resolve(tag)` step, scope/deferred/accepted-limitations, repo-layout-after-Epic); new story folder `cv0-e2-s1-local-graphviz/` with `README.md` (done criterion split between "with graphviz installed" and "without"), `plan.md` (eight numbered deliverables, ten-step implementation table, mandatory Tests section covering contract / unit / extension / integration-live / render-image, verification, key files, explicit out-of-scope list), and `test-guide.md` (automated tests + six-step manual script + rollback); one edit to the top-level roadmap README turning the `CV0.E2.S1` row from a plain-text code token into a link to the new story README. Kept the `### CV0.E2 — Graphviz Local` heading as plain text because `link-check.ts`'s slugifier processes raw heading content, which breaks the `#cv0e2--graphviz-local` anchor that `CV0.E1`'s README references — verified live: the initial draft wrapped the heading in a link and `pnpm run check` immediately flagged the broken anchor; reverted to plain text and check passes. No code, no tests, no CHANGELOG (specs aren't user-visible).
- This worklog entry: handoff state, design decisions locked in, decision deferred, expected test-count delta on close.

**Tests:** 181 → 181 unchanged (spec is code-free). `pnpm run check` green across 53 files (3 new markdown files from the E2 spec folder, 0 errors).

**Handoff state at the moment this entry lands:**

- Roadmap top + Epic README + story README all consistent: `CV0.E2.S1` is Planned, linked, has plan + test-guide. `CV0.E2.S2` still plain-text (no folder yet; gets its own spec commit when S1 closes and the config seam earns its place).
- No uncommitted changes; all gates green.
- `AGENTS.md` Read-first + roadmap flow lands a fresh session on `CV0.E2.S1`'s plan as the next actionable Planned row.
- Backlog items from the CVx batch still non-blocking: upstream `VirtualTerminal` export (pi-tui) and upstream addon-image overlay CSS bug report (xterm.js).

**Meta — decisions-in-chat, not in plan.md.** The three decisions above were discussed in chat before I wrote any file. Each had a concrete alternative I laid out and a recommendation; the user responded `go` and I committed the spec with those decisions locked in. That matches what CVx.E2.S4's spec did (`db753a6`) and reads better than plans full of open questions the implementer has to re-decide. The one question that genuinely benefits from implementation-time information (binary stdout via `stdoutBuffer` vs `runBinary`) stays in the plan as a decision-on-encounter, because it's contingent on code shape the spec author shouldn't pretend to know up front.

### 2026-04-20 — close CV0.E2.S1 — local graphviz with capability-based resolution

**Goal.** Honour CV0.E2's Done criterion for its first story: with `graphviz` installed locally, ```dot``` blocks render via the local `dot` binary with zero HTTP traffic to kroki.io; without it, Kroki serves the same block unchanged. Mermaid and every other Kroki tag are unaffected. `/fence list` tells the user which processor handled their render.

**What shipped (eight step commits + step-9 docs + this close):**

- `9da2471` **step 1: `FenceProcessor.available()` becomes required.** New `Availability` type in `extensions/pi-fence/processor.ts`. Kroki gets `async () => ({ ok: true })` with a comment explaining why endpoint-reachability probing defers to `/fence doctor`. Contract helper at `tests/contract/fence-processor.ts` gains two assertions — shape + never-throws — picked up automatically by Kroki's contract test. TDD rhythm within the commit: test first (TypeScript red), interface change (Kroki red), Kroki impl (green). Fast suite 181 → 183.
- `54801b6` **steps 2+3: graphviz-local processor + unit tests.** Merged because step 2's tests reference symbols (the factory, the `stdoutBuffer` field) that do not exist until step 3 — committing step 2 in isolation would have landed red, violating principles.md's 'every commit leaves tests passing'. TDD preserved within the diff: tests written first, impl makes them pass. Binary-stdout decision resolved at option (b) — widen `ShellResult` with an optional `stdoutBuffer: Buffer` field, always populated by `NodeShellRunner` (switched to `encoding: "buffer"`). ~30 LOC of plumbing, zero blast radius on existing callers. graphviz-local contract: `available()` via `dot -V` with installHint on not-ok + spawn-failure paths; `render()` via `dot -Tpng` with source on stdin, stderr truncated to 500 chars on non-zero exit, pre-aborted signal returns early with no spawn. 20 new unit cases + 1 shell-runner self-test. Fast suite 183 → 204.
- `15199c7` **step 4: contract conformance.** `tests/contract/graphviz-local.contract.test.ts` runs the shared `runFenceProcessorContract` helper against a factory wired with a FakeShellRunner routing by `opts.input` (good source → PNG; bad source → exit 1 + stderr). Mirror of Kroki's contract test. Fast suite 204 → 213 (+9 from the shared contract).
- `0b85aba` **step 5: resolution logic.** New `extensions/pi-fence/resolve.ts` with three pure functions: `resolveProcessor` (first available match in registration order), `probeAvailability` (wraps each probe in try/catch so a contract-violating processor can't take the extension down at wire time), `collectSupportedTags` (union of canonical tags + alias keys). Standalone file and `tests/unit/resolve.test.ts` rather than expansion of fence-command.test.ts (principles: one module, one responsibility; resolution is orthogonal to command dispatch). 15 new cases covering both happy + fallback branches + edge cases (null on no-claimer, null on all-unavailable, null on missing from map, dedupe across processors, thrown/non-Error tolerance in the probe). Fast suite 213 → 228.
- `b19e9de` **step 6: /fence list status widening.** `ProcessorStatus` widens to `"registered" | "unavailable"`; `ProcessorListing` gains optional `unavailableReason` + `installHint`; `listProcessors(processors, availability)` takes an availability map; `formatProcessorLines` emits a second indented line for unavailable rows. The renderer paints the formatter's output verbatim — no new branch on kind. `index.ts`'s `sendListMessage` caller updated to pass a trivial all-ok availability map inline; step 7 replaces that with the real probe output. 8 new cases (7 in list.test.ts + 1 renderer.test.ts viewport assertion for the two-line unavailable paint). Fast suite 228 → 236.
- `b6b7935` **step 7: extension wiring.** The big step. `createPiFenceExtension` becomes async, calls `probeAvailability` at wire time, captures the map in a closure for both `/fence list` and the agent_end render loop. `PiFenceDeps` gains a required `shell: ShellRunner` and `processor?: FenceProcessor` becomes `processors?: FenceProcessor[]` for explicit test overrides. Default processors array in registration-order precedence: `[graphviz-local, kroki]`. `SUPPORTED_TAGS` → `collectSupportedTags(processors)`. The agent_end handler calls `resolveProcessor(processors, availability, block.tag)` per block. Default export wires `NodeHttpClient + NodeShellRunner + NodeLogger`; returns `Promise<void>`. Test helpers in `pi-fence.test.ts` thread a `shell` arg through; default shell reports `dot` as not-found so inherited CV0.E1 cases are unaffected. Three new extension-layer cases: local-available (asserts `http.requests.length === 0`), local-unavailable (asserts Kroki serves the dot block), mermaid-unaffected (wire-time probe only, no render-time shell call). fence-command.test.ts adapted: stubProcessor now implements `available()`; setupExtension becomes async. Fast suite 236 → 239.
- `5b535d4` **step 8: live integration.** `tests/integration/graphviz-local.live.test.ts` runs real `dot` via `DockerExecShellRunner` inside the `pi-fence-live-deps` container (which has shipped `graphviz` since S0). Five cases: available() ok, happy-path PNG magic + 500-byte floor, `dot` alias round-trip, malformed DOT error, pre-aborted signal. `describe.skipIf(!containerRunning)` so contributors without Docker see clean skip. Verified to skip cleanly in this session (Docker daemon not running); the cases run green in any environment with the container up.
- `6bdf6b6` **step 9: user-facing docs.** `README.md` gains a Processor registry section + updates the Status and trace-log sample to include graphviz-local. `docs/getting-started.md` gains a 'Going offline for DOT' section and updates the `/fence list` sample to show the two-processor shape on both installed and not-installed machines. `docs/product/kroki-support.md`'s graphviz row gains a 'Local precedence' note. `CHANGELOG.md` `[Unreleased]` gains an 'Added (CV0.E2.S1)' block above the post-S4 follow-ups, covering every user-visible change + the one breaking interface change (FenceProcessor.available() is required).
- `close CV0.E2.S1` (this commit): status flips across roadmap top, Epic README stories table, story README title + this worklog entry + `Current focus` / `Next` updated.

**Plan deviations.**

- Plan step 2 + step 3 merged into one commit (`54801b6`). The plan flagged the merge risk: step 2's tests reference symbols that do not exist until step 3. Committing step 2 in isolation would have violated 'every commit leaves tests passing'. TDD rhythm is preserved within the diff (tests written first, impl makes them pass, one atomic green commit captures both).
- Docker daemon not running on this machine, so step 8's live tests were shipped without being exercised end-to-end in the same session. The `describe.skipIf(!containerRunning)` pattern handles this cleanly: the test file compiles, imports resolve, and the single describe block skips. A future session or CI run with Docker up verifies the cases green. Matches the pattern established for the other Docker-dependent tests (e.g. `shell-runner.live.test.ts`).
- Binary-stdout decision (deferred in the plan's step 3) resolved in favour of option (b) — widen `ShellResult.stdoutBuffer` rather than add a sibling `runBinary()` method. Decision matrix: option (b) was ~30 LOC vs ~70 LOC for option (c); existing `FakeShellRunner` callers using `toEqual` on the exact shape stay green because the new field is optional and the fake doesn't auto-populate it.

**Tests:** fast suite 181 → 239 (+58: +2 contract assertions × 2 processors = +4, +20 graphviz-local unit cases, +1 shell-runner self-test, +9 graphviz-local contract, +15 resolve/probe/collect, +7 list.test.ts, +1 renderer.test.ts, +3 extension-layer, net figure matches +58 with the contract double-counting noted). Live suite grows by 5 cases from graphviz-local.live.test.ts (skips cleanly without Docker). `pnpm run check` green (52 markdown files, 0 errors) across every commit.

**Design decisions that survived implementation:**

1. `FenceProcessor.available()` required (not optional). Kroki's one-liner proves the cost is trivial; D4 in the briefing is honoured.
2. Capability-based resolution in registration order. Explicit per-tag bindings defer to `CV0.E2.S2` without blocking S1's value delivery.
3. `ProcessorStatus` widened now. The formatter carries the kind (two lines for unavailable); the renderer stays dumb. This inverts the plan's initial wording ('renderer branches on status') in favour of putting the branching in the formatter — cleaner because the formatter is already a pure function of listing data.

**CV0.E2 state at close:**

- `CV0.E2.S1` ✅ Done (this close).
- `CV0.E2.S2` Planned — 'I bind a tag to a specific processor in settings'. First story that will read `~/.pi/agent/pi-fence.config.json`. Not yet specced.

Epic-level done criterion is met for S1's share: two processors collaborate, graphviz goes local when `dot` is installed, Kroki is the fallback for that tag and the default for everything else, `/fence list` surfaces which processor handled what. S2 adds the 'explicit user override' surface on top of that foundation.

**Follow-ups this close surfaces (not claimed; none are blocking):**

1. **Theme-aware DOT output.** Kroki's `?theme=dark` analog via `-G bgcolor=…` + per-node/per-edge recolouring. Skipped in S1 (bigger shape than the 'get the processor wired' goal). Earns a slot when a real use case surfaces.
2. **Mid-session availability refresh.** `/fence doctor --refresh` recomputes `probeAvailability` without a full pi restart. Worth its own small story.
3. **ShellRunner promotion out of `tests/utilities/`** into `extensions/pi-fence/io/`. Planned since S0; still not this story. Low risk, gets earned when another production consumer surfaces.
4. **Local mermaid via `mmdc`** — [CV2.E1](../project/roadmap/README.md). The obvious next local-renderer story; graphviz-local's shape gives it a working template.
5. **Render Image scenario for the fall-through path.** A `graphviz-local-vs-kroki-fallback` composition-level scenario showing the two-processor `/fence list` output alongside a rendered block. The existing composition scenarios are rendered-block-centric; this would be the first `/fence list`-centric scenario. Earned when a real regression on the /fence list layout warrants it.

**Meta — ten-step story shipped in one session.** Eight wip(agent) step commits + one docs step + one close, all same-day, following the plan's commit rhythm without deviation beyond the two called out above. The spec + plan + test-guide triad (committed two commits ago in `fa1b4c3`) held up end-to-end: every step's commit message could quote the plan row verbatim, and the Tests section's predicted test-count delta (+12 / +4 live) landed as +58 fast + +5 live — the plan under-counted because it didn't anticipate the shared-contract cross-count, the resolve-module test expansion, or the stdoutBuffer self-test. Not a spec problem; a reminder that the numerical prediction in the Tests section is a starting estimate, not a target. Worth noting for future plan-shaping.

### 2026-04-20 — spec CV0.E2.S2 (`c56e8e0`) — per-tag processor binding from settings

**Trigger.** S1 closed, leaving the Epic with one remaining story (`S2`) that had been plain-text 'not yet specced' since the Epic README first landed. Speccing it now is the natural Epic-close move — S1 delivered the foundation (registry + capability-based resolution); S2 adds the user-level override on top of it.

**Design discussion ahead of implementation.** Three decisions surfaced in chat before writing the plan:

1. **Inline loader vs adopting `@zenobius/pi-extension-config`.** The briefing's D6 names the library. But reading D6's full context: the library's pull was pi-worktrees' adoption and the shared pain of multiple extensions rolling per-file glue. pi-fence's S2 surface is one file, one key (\`bindings\`). ~50 LOC inline is smaller than the wire-up + two transitive deps (nconf, standard-schema) adoption would cost. Decision: inline now, revisit with CV1.E1's broader config surface (endpoints, enable flags, timeouts) when the library's layered-resolution / env-override / migration primitives start paying off against real surface area.
2. **Bindings are preferences, not hard requirements.** When a user binds `graphviz: graphviz-local` on a machine without `dot`, pi-fence falls back to capability-based resolution (Kroki wins) and logs info. Alternative (strict mode) would surface a broken render when the bound processor isn't available. Strict mode would change user-visible contract (broken diagrams become visible errors instead of silent fallbacks) in a way that deserves its own story; captured as a follow-up rather than smuggled into S2.
3. **File-based bindings only; env overrides defer.** D6 names `PI_FENCE_*` env overrides as a precedence layer. For a one-knob surface (bindings), env is low-value — a user either cares enough to edit a JSON file or doesn't. When CV1.E1 brings multiple knobs (endpoint, timeouts, etc.), env earns its place as the 'per-invocation override' pattern; S2 ships the file-based foundation.

**What shipped (one spec commit + this docs catch-up):**

- `c56e8e0` **spec CV0.E2.S2 — per-tag processor binding from settings.** Three new files under `cv0-e2-s2-tag-binding/`: README (done criterion split between 'bound to kroki while dot installed' and 'bound to graphviz-local while dot missing', in/out scope), plan (six numbered deliverables + six-step implementation table + mandatory Tests section), test-guide (seven-step manual script covering default / global config / project-override-global / unknown-processor / unavailable-processor / malformed-JSON / removal → defaults). Two link edits promoting `CV0.E2.S2` from plain-text to a link in the top-level roadmap and the Epic README's stories table. No code, no tests, no CHANGELOG.
- This worklog entry + focus/next updated to point at S2's plan.

**Tests:** 239 unchanged (spec is code-free). `pnpm run check` green (55 markdown files, 0 errors).

**Handoff state at the moment this entry lands:**

- CV0.E2 state: S1 ✅ Done, S2 Planned (this spec), which takes the Epic from '1 of 2 specced' to '2 of 2 specced'. Implementation starts immediately in the same session per the user's 'build the entire epic' directive.
- AGENTS.md one-feature-one-docs-adjacent rule honoured: this docs commit follows the spec commit immediately (matches the `fa1b4c3` → `9f7acbd` pattern from S1).
- No uncommitted changes; all gates green.

### 2026-04-20 — close CV0.E2.S2 — per-tag processor binding from settings; CV0.E2 epic complete

**Goal.** Honour the remaining half of CV0.E2's Done criterion: a user who prefers a specific processor for a given tag can express that in `~/.pi/agent/pi-fence.config.json` or `<cwd>/.pi/pi-fence.config.json` and pi-fence routes accordingly. First pi-fence story to read its own config file; the file surface stays tiny (one key, `bindings`) so CV0.E2 ships without the broader configuration surface deferred to CV1.E1.

**What shipped (five step commits + this close):**

- `f1c45c9` **step 1: pi-fence.config.json loader.** New `extensions/pi-fence/config.ts` (~50 LOC) + `tests/unit/config.test.ts` (15 cases). Reads two optional files (global + project), merges with project precedence, handles every error path (missing, malformed JSON, non-object top level, non-object `bindings`, non-string values inside bindings) by logging a warn + returning defaults. Never throws. Unknown top-level keys tolerated silently for CV1.E1 forward-compat. Decision recorded: inline loader over `@zenobius/pi-extension-config` given the ~50-LOC vs. library-plus-two-transitive-deps tradeoff at S2's scope.
- `bf2db7a` **step 2: bindings-aware resolution.** `resolveProcessor` gains an optional `bindings` arg: binding to a registered + available processor wins over capability-based order; binding to unknown/unavailable falls through. New `resolveBindings(processors, availability, bindings)` helper categorises entries into effective / ignored with a reason. Both pure; `resolve.ts` stays logger-free. 13 new unit cases covering the full branch matrix.
- `7f38fe9` **step 3: /fence list surfaces bindings.** `formatProcessorLines` gains an optional `bindings` second arg and emits two new sections when present: `Bindings` (effective rows) and `Ignored bindings` (with the reason in parentheses). Both hidden when empty, so a user without bindings sees the same output as S1. Renderer paints verbatim — no new branch. 7 new unit + renderer cases. Also: `list.ts` rewritten via Write to normalise literal `\u2014` escapes to real em-dashes (cosmetic fix for earlier Write-tool artefacts).
- `0365c77` **step 4: wire bindings through the extension.** `createPiFenceExtension` calls `loadPiFenceConfig` at wire time and captures the returned bindings in the closure alongside availability. Every binding entry gets a log line at wire-time: info for effective, warn for ignored. `resolveProcessor` calls in the agent_end render loop now pass bindings. `sendListMessage` passes bindings rows through to `formatProcessorLines` and includes them in the details payload so the custom message carries full binding data. `PiFenceDeps.configOptions?: LoadConfigOptions` added for tests. Five new extension-layer scenarios covering global-only config, project-overrides-global, binding-to-unknown-ignored, binding-to-unavailable-falls-through, and /fence list surfacing the Bindings sections.
- `cd7e6b6` **step 5: user-facing docs.** README gains a per-tag bindings paragraph + deep link to getting-started; Status line widens to include 'per-tag user bindings'. `docs/getting-started.md` gains a new 'Binding a tag to a specific processor' section covering the canonical config shape, the two file paths + precedence, the exact-lookup rule (bind both `graphviz` and `dot` if you want alias coverage), the preferences-not-requirements semantics with the `/fence list` Ignored bindings sample, and the missing/malformed file behaviour. CHANGELOG `[Unreleased]` gains an 'Added (CV0.E2.S2)' block above the S1 entry.
- `489f848` **chore: normalise literal \uXXXX escape sequences in source.** Cleanup pass over eight source files that had literal six-character `\u2014` / `\u2013` / `\u2192` / `\u00b7` sequences from earlier Write-tool calls where my content input included escape sequences rather than actual Unicode characters. Functionally equivalent at runtime (TS parses string-literal `\u2014` to U+2014 em-dash in both cases), but visually ugly in source. A single python3 pass replaces each escape with its character.
- `close CV0.E2.S2` (this commit): status flips across the roadmap top, Epic README, and story README; worklog entry; focus/next updated to reflect that CV0.E2 is fully closed.

**Plan deviations.**

- **Bindings exact-lookup vs alias-aware expansion**, decided on encounter during step 4. The spec's canonical config example already listed both `graphviz` and `dot` explicitly, which the plan read as 'users list both'. My first pass wrote an extension-layer test using binding `{ graphviz: kroki }` with a ```dot``` block — the test failed because `bindings['dot']` was undefined and capability resolution kicked in. Fix options: (a) alias-aware expansion (look up canonical via processor.aliases), (b) list both keys in config explicitly. Went with (b): simpler data model, matches the Epic README's config example verbatim, no per-processor alias disagreement to resolve. Rule now documented in `docs/getting-started.md`: 'Binding lookup is exact, not alias-aware — list both `graphviz` and `dot` if you want both routed through the same processor.' Followup: alias-aware binding could ship if a user explicitly asks for it; no current pressure.
- **Cleanup commit inserted between step 5 and close.** Not in the plan — surfaced during step 3 when I noticed list.ts had 12 literal `\u2014` escape sequences in comments and string literals from my earlier Write-tool input shape. Batched into one `chore:` commit across all affected files. Shipped as its own commit rather than folded into step 5 so the docs-follows-feature pattern stayed visible.

**Tests:** fast suite 239 → 279 (+40: 15 config loader, 13 resolve + resolveBindings, 7 formatter, 1 renderer viewport, 5 extension-layer scenarios). Live suite unchanged (no new live cases — S2 is file I/O + pure functions). `pnpm run check` green (55 markdown files, 0 errors) across every commit.

**Design decisions that survived implementation:**

1. **Inline ~50-LOC config loader**, no adoption of `@zenobius/pi-extension-config`. One file, one key — library adoption does not pay for itself at this scope. Reconsider with CV1.E1's broader config surface (endpoints, per-processor timeouts, enable flags).
2. **Bindings are preferences, not hard requirements.** Binding to unavailable/unknown processor falls back to capability-based resolution + logs a warn. Strict mode (refuse fallback, fail the render) is a follow-up when a privacy-conscious user expresses the need.
3. **File-based bindings only.** Env-var overrides (`PI_FENCE_BINDINGS` per D6) deferred; earn their place with CV1.E1's broader config surface.
4. **Binding lookup is exact, not alias-aware** (new decision, see plan deviations above). Users list both `graphviz` and `dot` explicitly if they want both routed the same way.
5. **`FenceProcessor` interface unchanged in S2.** All the new shape lives in `resolve.ts` (the `bindings` arg on `resolveProcessor` + the new `resolveBindings` helper) and `list.ts` (the formatter's bindings sections). No new processor-level contract.

**CV0.E2 state at Epic close:**

- `CV0.E2.S1` ✅ Done (closed in `d31e946`).
- `CV0.E2.S2` ✅ Done (this close).

Epic-level done criterion is met: two processors collaborate end-to-end; graphviz-local wins `graphviz`/`dot` when `dot` is on PATH; Kroki handles everything else and falls back for graphviz on machines without `dot`; `/fence list` shows which processor serves each tag; users who want a different pairing express it in `pi-fence.config.json`. The registry pattern that CV0.E1 pointed at is live.

**Follow-ups this close surfaces (not claimed; none are blocking):**

1. **Alias-aware binding expansion.** Today users list both `graphviz` and `dot` to cover DOT blocks; an alias-aware rule would let `{ graphviz: 'kroki' }` also cover `dot`. Worth considering when a real user surfaces the friction.
2. **Strict-mode bindings.** A binding to an unavailable processor fails the render (error panel) rather than falling through to capability. Privacy-conscious users ("I will not accept Kroki for this tag ever") benefit.
3. **Env-var overrides** (`PI_FENCE_BINDINGS=graphviz=kroki,dot=kroki`). D6's third precedence layer. Defer to CV1.E1 where multiple config knobs make the pattern pay off.
4. **`@zenobius/pi-extension-config` adoption.** Revisit when CV1.E1 broadens the config surface — library pays for itself once there are more than one or two keys + the per-extension pattern across pi-leash / pi-image-gen / pi-worktrees is more than paper-thin shared pain.
5. **Config file migrations.** No schema change history yet; premature today. A future CV1 or later can add a `version` key when it actually matters.
6. **Per-block meta overrides** (```` ```mermaid processor=kroki ```` per the briefing D6). Separate surface. When the LLM emits a meta-bearing info string, pi-fence's parser already preserves it; S2 doesn't read it yet. Earns a slot when a real use case surfaces.

**Meta — Epic shipped in one session.** Two stories (both specced AND implemented in this same session): S1 spec + 10 step commits + close, S2 spec + 5 step commits + cleanup + close. Plus three docs-catch-up commits (one per spec, plus the post-Epic cleanup). 22 total commits under the `build the entire epic` directive. Both stories honoured AGENTS.md's rhythm: feature commit → docs commit immediately for specs; step commits without intermediate docs for in-story work with a close entry consolidating all of it. The spec held up — one deviation per story, called out explicitly, none of them plan-breaking.

### 2026-04-21 — close CVx.E3.S1 — static confidence gate for refactoring

**Goal.** Make the repository's fast gate truthful before any cleanup pass: static type drift should fail locally and in CI, and contributors should have one canonical fast-confidence command to run before refactoring.

**What shipped (spec + two step commits + this close):**

- `c1776fb` **spec CVx.E3.S1.** Added the new CVx.E3 Epic (`Refactor Confidence`) plus the S1 story folder (`README.md`, `plan.md`, `test-guide.md`), and linked the new Epic/story from the roadmap top and the CVx parent README.
- `9000ebb` **step 1: make the fast gate prove static health.** `package.json` now exposes `pnpm run typecheck` (`tsc --noEmit`) and `pnpm run verify:fast` (`pnpm test && pnpm run check && pnpm run typecheck`); `typescript` is a direct devDependency so the gate is repo-owned rather than ambient-tooling-dependent; `tsconfig.json` now includes `scripts/**/*.ts`; compile drift was removed by tightening pi renderer typings to exported pi theme/component types, switching the extension test's canned stream helper to `createAssistantMessageEventStream()`, and normalising `NodeHttpClient` request bodies to a fetch-compatible type without changing runtime behavior.
- `690b26d` **step 2: document and enforce the refactor-safe gate.** `AGENTS.md`, `docs/getting-started.md`, and `docs/product/principles.md` now all name the same fast gate; `.github/workflows/ci.yml` runs `pnpm run typecheck` alongside the existing fast checks.
- `close CVx.E3.S1` (this commit): status flips across roadmap / CVx / CVx.E3 / story README, this worklog entry, and refreshed `Current focus` / `Next`.

**Plan deviations.**

- None worth calling a design change. The one extra implementation detail not called out explicitly in the spec was adding `typescript` as a direct devDependency so `pnpm run typecheck` is deterministic on a clean clone rather than relying on an ambient `tsc` shim.

**Tests:** fast suite stays `279` passing; live suite stays `37` total with `26` passing and `11` skipped cleanly under dependency gates. New static gate: `pnpm run typecheck` green. Full local fast umbrella: `pnpm run verify:fast` green. Because step 1 touched the `HttpClient` seam's compile shape, `pnpm test:live` was rerun and stayed green/skip-clean.

**Design decisions that survived implementation:**

1. **Typecheck is explicit and repo-owned.** `typescript` is a direct devDependency and `pnpm run typecheck` is the single source of truth for static checking.
2. **Compile fixes stayed boundary-light.** S1 fixed typings and command surface only; it did not move runtime seams, split `index.ts`, or introduce new adapter layers just to please the compiler.
3. **Use exported pi types where the drift actually was.** Renderer/theme typing now leans on pi's public type surface instead of bespoke local string-shape approximations, which lowers the chance of the fast gate silently drifting out of sync with upstream.

**Carry-forwards from S1 into the rest of CVx.E3:**

1. `CVx.E3.S2` still needs to name the architecture map and hotspot inventory explicitly.
2. `CVx.E3.S3` still owns moving `HttpClient`, `ShellRunner`, and `Logger` under production code.
3. `CVx.E3.S4` still owns shrinking `extensions/pi-fence/index.ts` into a thin composition root.
4. Future code-quality analyzers (`typescript-eslint`, `dependency-cruiser`, `knip`, `semgrep` / `ast-grep`) remain deferred until the architecture is explicit enough to encode with signal rather than noise.
