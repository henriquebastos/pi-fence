# CVx.E3 — Refactor Confidence

**Roadmap:** [CVx](../README.md)
**Last updated:** 2026-04-22 — S3–S5 Done

CVx.E1 and CVx.E2 proved what pi-fence renders. The next missing confidence rung is structural: can we clean the code up without guessing, drifting, or breaking hidden contracts? This Epic makes refactoring deliberate.

Internal-first on purpose: no new end-user behavior, no new processors, no visual polish. The delivery is a stronger fast gate, clearer architectural boundaries, production-owned runtime seams, and a codebase whose composability comes from **dependency injection at runtime boundaries** rather than ambient reads and oversized orchestration modules.

## Stories

| Code | Story | Status |
|------|-------|--------|
| [S1](cvx-e3-s1--static-confidence-gate.md) | **I can trust the fast gate before starting a cleanup pass** | ✅ Done |
| [S2](cvx-e3-s2--architecture-map.md) | **The architecture map names pure modules, adapters, runtime seams, composition root, and hotspots before code moves** | ✅ Done |
| [S3](cvx-e3-s3--production-owned-runtime-seams.md) | **Runtime seams are production-owned and injected at the edge, not imported from `tests/utilities/`** | ✅ Done |
| [S4](cvx-e3-s4--thin-composition-root.md) | **The extension entrypoint becomes a thin composition root over focused modules and policies** | ✅ Done |
| [S5](cvx-e3-s5--internal-api-polish.md) | **Internal module APIs and naming make the boundary-injected architecture easy to compose** | ✅ Done |

The sequence is intentional and mirrors the product decision behind this Epic: **safer refactoring first, architecture clarity second, API polish third**.

Current map: [Architecture map](../../architecture.md).

1. `S1` closes the most dangerous blind spot: the fast gate currently proves tests and docs structure, but not static type health.
2. `S2` turns the current "ambient cleanup backlog" into an explicit map of responsibilities, hotspots, and architectural vocabulary: which modules are pure, which are adapters, which are runtime seams, and where the composition root begins and ends.
3. `S3` makes the repository hierarchy predictable by promoting runtime seams into production-owned interfaces and wiring them by injection at the edge.
4. `S4` reduces orchestration complexity by shrinking `extensions/pi-fence/index.ts` into the composition root over focused modules and explicit policies.
5. `S5` spends the confidence earned above on internal API shape, naming, and low-cognitive-load boundaries so the DI-first architecture reads naturally instead of ceremonially.

## Deliverable vision (epic scope)

A contributor returns to pi-fence after a few weeks away and can orient quickly.

1. `pnpm run verify:fast` tells them whether the repo is safe to change.
2. An [architecture note](../../architecture.md) explains which module owns parsing, resolution, config, commands, rendering, runtime seams, adapters, and the composition root.
3. Production code reads production dependencies from production paths, and inner modules receive those dependencies explicitly rather than reaching into ambient process state.
4. The extension entrypoint is small enough to scan in one pass because it primarily wires concrete implementations to boundary interfaces.
5. Naming and internal module APIs make intent obvious enough that cleanup can be incremental instead of heroic.

The point is not "perfect code in one sweep." The point is that each cleanup step becomes a small, reviewable, verifiable move.

## Architectural stance

This Epic treats dependency injection as a **boundary discipline**, not a universal style.

1. **Inject runtime boundaries.** Filesystem, env, cwd/home discovery, HTTP, subprocesses, logging, and similar environment-dependent concerns enter through explicit seams.
2. **Keep pure modules direct.** Parsers, formatters, mappers, and other pure logic stay concrete unless a real seam is needed. We are not injecting everything for symmetry.
3. **Make the composition root obvious.** `extensions/pi-fence/index.ts` should be where concrete implementations are chosen and wired together by default.
4. **Name the architecture plainly.** The repo should be able to say "pure module", "adapter", "runtime seam", and "composition root" without hand-waving.

That is the composability target: predictable assembly at the edge, low-cognitive-load logic in the middle.

## Linting posture

This Epic does **not** begin by adopting a generic code-style lint stack. `CVx.E3.S1` is about making the fast gate truthful, not about introducing broad cosmetic churn before the architecture is clarified.

If linting is added later in this Epic, it should primarily enforce the boundary/composability model rather than formatting taste. Examples of useful future rules:

1. **Boundary rule:** production code must not import from `tests/**`.
2. **Ambient-access rule:** inner modules must not reach directly into `process.env`, `fs`, `process.cwd()`, `os.homedir()`, or similar environment reads when an explicit runtime seam should be used instead.
3. **Composition-root rule:** concrete Node adapters are wired at the edge; inner modules depend on interfaces/values, not concrete runtime implementations.
4. **Accidental-coupling rule:** catch dead imports and dependency edges that pull unrelated modules together without a deliberate boundary.

That keeps linting complementary to the DI-first architecture instead of becoming a separate style crusade.

### Future code-quality analyzers — when earned

These are candidates for later `CVx.E3` stories once the architecture is explicit enough to encode without noise:

1. **`typescript-eslint` with type-aware correctness rules** — after `S1` lands and `tsc --noEmit` is green. Useful for promise misuse, unnecessary assertions, and other typed correctness drift.
2. **`dependency-cruiser`** — after `S2` names the architecture and `S3`/`S4` stabilize the boundary direction. Useful for enforcing "no production imports from `tests/**`", layering, and cycle detection.
3. **`knip`** — after the seam moves and entrypoint split settle. Useful for finding unused exports, files, and dependencies after cleanup work.
4. **`semgrep` / `ast-grep`** — only if the lighter tools above cannot express the architectural rules we actually want. Useful for custom rules such as forbidding ambient env/filesystem reads outside adapters.

None of these are committed to as part of `S1`; they are references for the right later moment, not premature scope growth.

## Why this Epic is earned now

Three signals justify doing this work before another cleanup pass:

1. The current fast gate is incomplete for refactoring: `pnpm test` is green, but static type drift can still exist outside that gate.
2. Production code still imports runtime seams from `tests/utilities/`, which makes the repository hierarchy harder to reason about than it needs to be.
3. `extensions/pi-fence/index.ts` has become a many-jobs orchestration file, which raises cognitive load every time a contributor touches wiring, commands, config, or message composition.

Those are not aesthetic nits. They are the kinds of structural ambiguities that make a beautification pass feel safe right up until it isn't.

## Coverage posture for this Epic

This Epic does **not** adopt a blanket whole-repo "100% coverage or bust" ratchet. The target is narrower and more useful for refactoring:

1. Touched cleanup code stays fully covered.
2. Hotspot modules called out in `S2` get explicit coverage expectations and named deferrals.
3. Any gap we knowingly leave is documented in the story plan instead of being accidental.

That keeps the standard high without turning the Epic into a tooling treadmill.

## Out of scope — explicitly (epic-level)

- New user-facing commands, processors, or rendering features.
- Rewriting modules for style alone before the safety/docs groundwork is in place.
- A compile/build step for extension code. pi-fence remains jiti-loaded TypeScript.
- Whole-repo line coverage ratcheted to 100% as a release gate.
- Replacing the existing test layers. This Epic strengthens the confidence surface around them.
- Broad style-only lint adoption as the opening move. If linting lands in this Epic, it should enforce architecture and composability boundaries first.

## Done criterion (epic-level)

The Epic is done when the following are true together:

1. The documented fast gate includes static type checking and runs green.
2. The intended architecture and hotspot inventory are written down and kept adjacent to the roadmap, including the vocabulary of pure modules, adapters, runtime seams, and composition root.
3. `HttpClient`, `ShellRunner`, and `Logger` live under production code and are imported from there by production modules as explicit runtime seams.
4. `extensions/pi-fence/index.ts` is a thin composition root rather than the home of every orchestration concern.
5. Inner modules no longer depend on ambient environment access where an explicit boundary should exist.
6. Remaining cleanup work is an explicit backlog, not a vague feeling that the code should be prettier someday.
