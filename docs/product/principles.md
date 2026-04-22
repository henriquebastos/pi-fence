[< Docs](../README.md)

# Design Principles

Guidelines for building pi-fence. Read before contributing code.

---

## Product

**Interception should feel invisible.** When a fenced block renders well, the user shouldn't have to think about pi-fence. No extra commands, no mode switching, no ceremony. The LLM writes markdown, the terminal shows the visualization.

**Control stays with the user.** Every behavior pi-fence adds is configurable: enable/disable per processor, explicit per-tag processor binding, per-project overrides, global off-switch. A user who wants the raw fenced text should be able to get it back without a fork.

**Fenced blocks are a platform, not just diagrams.** Diagrams are the motivating use case, but the abstraction serves anything text-to-visual: tables, highlighted code, QR codes, math, music. Keep the core agnostic to what the processor does with the block.

**Third parties are first-class.** Other extensions can register their own processors through a stable plugin surface. A community processor is not less legitimate than a built-in one — they share the same interface, the same resolution rules, the same config shape.

---

## Code

**Small functions, clear names.** The code explains the "what"; comments only for the "why".

**One module, one responsibility.** The parser doesn't know about rendering. The registry doesn't know about HTTP. Each module does one thing.

**No premature abstraction.** Write direct code. Extract when repetition is real, not when it's hypothetical. Most early decisions we revisit were taken too early, not too late.

**Validate at the boundaries.** The fence processor interface is the boundary. Everything inside the processor can assume its input is well-formed. Everything outside must validate before calling.

**Lazy-load heavy dependencies.** If a processor needs mermaid's npm package (~40 MB) or a Chromium binary, that dependency loads only when the processor activates — never at extension startup.

**Every dependency on the environment is detected.** A processor that needs `dot` or Docker or network must expose an `available()` check, a clear reason when unavailable, and an install hint.

---

## Testing

**Test automation is non-negotiable.** Every story ends with its tests passing, executable via `pnpm test` with no manual steps. Manual verification (`curl`, opening a terminal and eyeballing output) is a tool during development; it never ships as "the test." If a behavior can't be tested automatically, that fact is documented explicitly in the story's plan alongside why.

**Test-first.** New behavior starts with a failing test. This isn't ceremony — the failing test proves the assertion is meaningful. Red-green-refactor is the loop. Exceptions (prototyping, spikes) are named in the plan as spikes, not smuggled in as production work.

**Layers are distinct and named.** Each test belongs to exactly one layer; the layers have different speeds, different dependencies, and different commands to run them.

| Layer | What it tests | Dependencies | Runner |
|-------|--------------|--------------|--------|
| **Unit** | Pure logic: parser, registry, config merge, info-string meta, renderer math | None | `pnpm test` |
| **Contract** | Any implementation of `FenceProcessor` satisfies the interface | None | `pnpm test` |
| **Render** | Real pi-tui components painting into a `VirtualTerminal`; asserts on the viewport grid + the raw write log (escape sequences xterm.js does not paint into the grid, like the Kitty graphics protocol) | pi-tui in-process + `@xterm/headless` (dev dep) | `pnpm test` |
| **Extension** | pi-fence running inside a real pi SDK `AgentSession` with a fake LLM stream | pi SDK in-process | `pnpm test` |
| **Integration (live)** | Real processors against real binaries or real HTTP | Docker container or network | `pnpm test:live` |
| **Render Image (live)** | Pixel-level PNG of pi-fence's rendered panel via xterm.js + `@xterm/addon-image` (Kitty graphics) in headless Chromium; `pixelmatch` diff against a committed golden. Catches visual regressions the byte-stream assertions alone cannot see. | Chromium (dev install via `npx playwright install chromium`) + `playwright-core`, `pngjs`, `pixelmatch` (dev deps) | `pnpm test:live` |

Test files live under `tests/<layer>/`. Fixtures under `tests/fixtures/`. Shared utilities under `tests/utilities/`.

**Fakes, not mocks.** Our stand-ins are real in-memory objects with capture arrays — `FakeHttpClient`, `FakeShellRunner`, `FakeLogger`, `FakeExtensionAPI`. Each implements the same interface as its production counterpart. We do not reach into real modules with `vi.mock()` to pretend they return something else — that couples tests to implementation details and hides real integration risk. Reserve the word "mock" for the bad sense.

**Live tests exist as parallel gates.** Every fake has a sibling live test that uses the real thing: the `FakeHttpClient` is paired with a live kroki test, the `FakeShellRunner` is paired with a live graphviz test, etc. Live tests run against a dedicated Docker image (`pi-fence-live-deps`) for local binaries and against `kroki.io` or a local Kroki container for HTTP. Fast CI runs only the fake-based suite; pre-release and nightly CI runs the live suite. Fixtures are refreshable via `pnpm run refresh-fixtures`.

**Dependency injection at every I/O seam.** Three interfaces are the main seams: `HttpClient` (for HTTP), `ShellRunner` (for subprocess), `Logger` (for diagnostics). Production wires node impls. Tests wire fakes that capture calls. Pure functions take their inputs as arguments and never reach out — no hidden disk or network.

**No test reaches the real filesystem outside `os.tmpdir()`.** No test reaches the real home directory. No test pollutes the developer's `~/.pi/agent/`. Temp dirs are created per-test and cleaned up in `afterEach`.

**Skip cleanly when deps are absent.** A contributor on a machine without Docker, without network, without the live-deps container running, should still be able to clone the repo and see `pnpm test` go green. Live tests self-check their preconditions and emit `describe.skipIf(...)` — not a failure — when the precondition isn't met.

**Every commit leaves the fast gate passing.**

**Docs are checked too.** Link integrity is verified by `pnpm run check:links`, which walks the `docs/` tree and validates that every relative markdown link resolves to a real file and every `#fragment` points to a real heading. Structural linting — list numbering, blank-line rules, heading increments, duplicate headings — is handled by `markdownlint-cli2` via `pnpm run check:markdown`. Auto-fix most issues with `pnpm run fix:markdown`. `pnpm run check` is the umbrella that runs both.

**Static typing is part of the fast gate.** `pnpm run typecheck` runs `tsc --noEmit` across production code, tests, and repo scripts. `pnpm run verify:fast` is the contributor-facing umbrella for the full local fast gate: `pnpm test`, `pnpm run check`, and `pnpm run typecheck`.

**Every story's plan.md has a mandatory `Tests` section** enumerating, at minimum:

1. Which test layers the story touches.
2. Which events / interactions / side effects are covered.
3. Which fakes are added to `tests/utilities/`.
4. Which live tests are added or updated.
5. Anything deferred and why.

Plans without a `Tests` section are incomplete and should not be approved.

---

## Process

**Design before code.** No code without a documented plan. The plan lives in the Story's `plan.md`. When it's wrong, update it before implementing around it.

**Small stories with immediate validation.** Each story ends with a verifiable "it works" moment — a test, a command, a visible result. Don't declare done without validation.

**Refactoring in cycle.** After implement + test, evaluate refactoring. Document what was refactored *and* what was evaluated but left as-is, with criteria for revisiting.

**Living documentation.** Roadmap, worklog, decisions, story docs are the map. They are updated at the end of each cycle, in a dedicated docs commit — never mixed into a feature commit, never predicting commits that do not yet exist. See `AGENTS.md` → *Worklog and CHANGELOG ordering* for the rule.

**Commits focus on "why".** Descriptive messages in English. Explain the reason for the change, not just what changed. No self-referential or AI-authorship language.

**Atomic commits where practical.** One independent change per commit.

---

## Conventions

**English everywhere in code and docs.** Variables, functions, comments, endpoints, config keys, docs. No exceptions inside the repo.

**Node ESM.** `"type": "module"` in every package. Import paths include extensions where required by tooling.

**TypeScript via pi's jiti loader.** No compile step for extensions themselves. Tests may compile to run under vitest.

**Test runner: vitest.** Fast, TypeScript-native, minimal config.

---

**See also:** [Briefing](../project/briefing.md) (architectural decisions) · [Roadmap](../project/roadmap/README.md) (what we're building)
