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

Two kinds of automated tests, each with a clear purpose.

**Unit tests** — pure logic in isolation: fence parsing, registry resolution, config merging. No disk, no network, no mocks for business logic. Fast.

**Smoke tests** — end-to-end against a real processor (Kroki public, or a local binary when available). Slower, can be gated behind an env var. Catch integration regressions.

**Skip a smoke test cleanly when its dependency isn't available.** A developer on a machine without Docker or Graphviz should still be able to run `pnpm test` and see green.

**Every commit leaves tests passing.**

**Docs are checked too.** Link integrity is verified by `pnpm run check:links`, which walks the `docs/` tree and validates that every relative markdown link resolves to a real file and every `#fragment` points to a real heading. Structural linting — list numbering, blank-line rules, heading increments, duplicate headings — is handled by `markdownlint-cli2` via `pnpm run check:markdown`. Auto-fix most issues with `pnpm run fix:markdown`. `pnpm run check` is the umbrella that runs both.

---

## Process

**Design before code.** No code without a documented plan. The plan lives in the Story's `plan.md`. When it's wrong, update it before implementing around it.

**Small stories with immediate validation.** Each story ends with a verifiable "it works" moment — a test, a command, a visible result. Don't declare done without validation.

**Refactoring in cycle.** After implement + test, evaluate refactoring. Document what was refactored *and* what was evaluated but left as-is, with criteria for revisiting.

**Living documentation.** Roadmap, worklog, decisions, story docs are updated every cycle. They are the map.

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
