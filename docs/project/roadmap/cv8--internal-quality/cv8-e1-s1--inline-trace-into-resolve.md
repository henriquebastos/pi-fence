# CV8.E1.S1 — Inline trace into resolveProcessor

**Status:** In progress

**Epic:** [CV8.E1 — Duplication Removal](cv8-e1--resolution-trace-unification.md)
**Date:** 2026-04-25 (spec)

## Summary

`trace.ts` duplicates the binding → disabled → unavailable → capability resolution logic from `resolve.ts`, adding step tracking as a parallel implementation. If one changes, the other silently diverges. Eliminate the duplication: `resolveProcessor` always builds and returns structured trace steps alongside the processor result. Delete `trace.ts` and the `/fence trace` command. The trace becomes a property of every resolution — always available to callers, zero conditional overhead in the algorithm.

## Done criterion

1. `resolveProcessor` returns `{ processor: FenceProcessor | null, steps: TraceStep[] }`.
2. `TraceStep` uses a discriminated `StepOutcome` type — no booleans, no free-form reason string.
3. `resolveProcessor` uses a single-pass design (no binding shortcut + linear scan split).
4. `trace.ts` is deleted. No separate trace algorithm exists.
5. `/fence trace` subcommand is removed from `command.ts`.
6. `agent-end.ts` destructures the result and logs steps at debug level (one log call per resolution, steps as structured meta).
7. All existing resolve-test scenarios also assert on the returned steps.
8. `pnpm run feedback` passes.

## Design decisions

**Single pass, not two-phase.** The current `resolveProcessor` has a binding shortcut (`processors.find`) then a linear scan. `traceResolution` walks every processor once. The unified version adopts the single-pass approach — simpler, naturally produces one step per processor, eliminates the structural divergence.

**Discriminated outcome, not booleans + reason.** Each processor exits evaluation at exactly one terminal state. A `StepOutcome` union type replaces the `claimsTag`/`available`/`disabled`/`boundByConfig` booleans and the free-form `reason` string:

```ts
type StepOutcome =
  | "selected-by-binding"
  | "selected-first-available"
  | "skipped-already-resolved"
  | "skipped-disabled"
  | "skipped-no-claim"
  | "skipped-unavailable"
  | "skipped-binding-prefers-other";

interface TraceStep {
  id: string;
  outcome: StepOutcome;
}
```

**No LLM follow-up.** The trace is for debug logging and test assertions. The `/fence doctor` command already surfaces processor state for the user and/or the LLM — no need to inject trace data into the LLM session.

## Scope

**In scope:**

- Change `resolveProcessor` to single-pass, returning `{ processor, steps }`.
- Define `StepOutcome` and `TraceStep` in `resolve.ts`.
- Update `agent-end.ts`: destructure result, log steps at debug level (one call, structured meta).
- Remove `/fence trace` subcommand from `command.ts` and `FENCE_SUBCOMMANDS`.
- Delete `trace.ts`.
- Delete `tests/unit/trace.test.ts`.
- Remove `/fence trace` extension test from `tests/extension/pi-fence.test.ts`.
- Expand `tests/unit/resolve.test.ts` to assert on returned steps.

**Out of scope:**

- Changing the resolution algorithm itself (binding priority, disabled semantics). Behavior is preserved.
- Changing `resolveBindings` — it has a different purpose (per-binding status for `/fence list`) and does not duplicate the resolution algorithm.
- LLM follow-up messages on resolution failure.

## Plan

| Step | Layer | What |
|------|-------|------|
| 1 | unit + impl | Define `StepOutcome` and `TraceStep` in `resolve.ts`. Rewrite `resolveProcessor` as single-pass returning `{ processor, steps }`. Update every existing test in `resolve.test.ts` to destructure `.processor` and add step assertions. |
| 2 | impl | Update `agent-end.ts`: destructure `{ processor, steps }`, log steps at debug. |
| 3 | impl | Remove `/fence trace` from `command.ts`. Delete `trace.ts`. Remove trace tests from `tests/unit/trace.test.ts` and `tests/extension/pi-fence.test.ts`. |
| 4 | refactor | Run `pnpm run feedback`. Clean up dead imports. Run `pnpm run inspect`. |

## Tests

- **Unit (step 1):** Every existing `resolveProcessor` test in `resolve.test.ts` gains step assertions: correct step count, correct `outcome` per processor. New dedicated tests: binding-selected step has outcome `selected-by-binding`, disabled step has outcome `skipped-disabled`, null resolution returns steps explaining why every candidate was skipped.
- **Extension (step 3):** Remove the `/fence trace mermaid` extension test. The agent-end debug logging is covered by existing extension tests that exercise resolution (check FakeLogger captures).
- **Fakes:** No new fakes.
- **Live:** No live tests affected — resolution is pure logic.
- **Deleted:** `tests/unit/trace.test.ts` (all scenarios migrated to `resolve.test.ts` step assertions).

## Verification

`pnpm run feedback` — all five gates pass. `pnpm run inspect` — no new CRAP regressions.

## Key files

**Deleted:** `extensions/pi-fence/trace.ts`, `tests/unit/trace.test.ts`.

**Modified:** `extensions/pi-fence/resolve.ts` (return type + StepOutcome + TraceStep + single-pass), `extensions/pi-fence/agent-end.ts` (destructure + debug log), `extensions/pi-fence/command.ts` (remove trace subcommand), `tests/unit/resolve.test.ts` (step assertions), `tests/extension/pi-fence.test.ts` (remove trace test).
