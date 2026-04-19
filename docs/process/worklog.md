[< Docs](../README.md)

# Worklog

What was done, what's next. Updated each session. Dated entries are chronological — oldest first, newest appended at the bottom.

## Current focus

**[CV0.E1 — Kroki Through The Wire](../project/roadmap/cv0-it-works/cv0-e1-kroki-through-the-wire/README.md)**.

## Next

Implement [CV0.E1.S1 — Mermaid via Kroki](../project/roadmap/cv0-it-works/cv0-e1-kroki-through-the-wire/cv0-e1-s1-mermaid-via-kroki/plan.md) test-first against the infrastructure S0 provides.

Before S1 feature work begins, a Docker-capable machine must verify the live path end-to-end: `pnpm live:build`, `pnpm live:up`, `pnpm test:live` should turn 7 currently-skipped integration tests green. This has not yet been done on any machine — the development host used during S0 does not have Docker installed.

Follow each story’s plan step by step. Each step is its own commit. Tests pass on every commit.

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

- Docker path was never exercised end-to-end during S0 — the dev host has no Docker. All 7 integration tests report as skipped. The S1 kick-off must verify `pnpm live:up && pnpm test:live` on a Docker-capable host.
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
