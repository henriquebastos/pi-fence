# CV8.E2.S1 — Shell processor render timeout

**Status:** Ready

**Epic:** [CV8.E2 — Robustness](cv8-e2--robustness.md)
**Date:** 2026-04-25 (spec)

## Summary

Kroki imposes a 15-second render timeout via `AbortSignal.timeout`. `graphviz-local` and `mermaid-local` have no timeout — if `dot` or `mmdc` hangs, the render blocks indefinitely (or until the caller's signal fires, which `agent-end.ts` never passes). Add a default render timeout to both shell processors, matching Kroki's pattern.

## Done criterion

1. `graphviz-local` and `mermaid-local` merge a `DEFAULT_RENDER_TIMEOUT_MS` signal with the caller's signal before spawning.
2. A hanging render aborts after the timeout and returns `{ ok: false, error }`.
3. All three timeout-using processors (kroki, graphviz-local, mermaid-local) share the same constant and `mergeSignals` helper from `processor.ts`.
4. `pnpm run feedback` passes.

## Design decisions

**One shared constant.** `DEFAULT_RENDER_TIMEOUT_MS = 15_000` in `processor.ts`, used by all three I/O processors. Kroki's network + server rendering and shell processors' local binary execution are conceptually different, but 15 seconds is generous for both — a render that hasn't finished is hung, not slow. Split when the use cases actually diverge.

**`mergeSignals` in `processor.ts`.** Already the shared interface file. A separate `signals.ts` for ~10 lines is premature. Kroki, graphviz-local, and mermaid-local all import from `processor.ts` already.

**Remove the `AbortSignal.any` polyfill.** The fallback for pre-Node 20 is dead code — pi requires Node 20+. The extracted `mergeSignals` uses `AbortSignal.any` directly with no fallback.

**Inline test fake for hanging shell.** The "never resolves until signal fires" behavior is a single test scenario, not a reusable pattern. A local stub in the test listens to the abort signal and rejects — no change to `FakeShellRunner`.

## Scope

**In scope:**

- Extract `mergeSignals` from `kroki.ts` to `processor.ts`. Remove the `AbortSignal.any` polyfill.
- Extract `DEFAULT_RENDER_TIMEOUT_MS` to `processor.ts`. Remove Kroki's private `DEFAULT_TIMEOUT_MS`.
- Update `kroki.ts` to import both from `processor.ts`.
- Add timeout to `graphviz-local` and `mermaid-local`: merge `AbortSignal.timeout(DEFAULT_RENDER_TIMEOUT_MS)` with the caller's signal before spawning.
- Unit tests with an inline never-resolving shell runner stub.

**Out of scope:**

- Configurable per-processor timeouts. Future.
- Timeout for pure-logic processors (synchronous computation, not I/O).

## Plan

| Step | Layer | What |
|------|-------|------|
| 1 | impl | Extract `mergeSignals` (without polyfill) and `DEFAULT_RENDER_TIMEOUT_MS` to `processor.ts`. Update `kroki.ts` imports. Existing kroki tests pass. |
| 2 | unit + impl | Add timeout to `graphviz-local`: merge signals before `shell.run`. Unit test with inline hanging stub — assert error after timeout. |
| 3 | unit + impl | Add timeout to `mermaid-local`: merge signals before `shell.run`. Same test pattern. |
| 4 | refactor | `pnpm run feedback`. `pnpm run inspect`. |

## Tests

- **Unit (steps 2–3):** Inline stub: `run: (_, __, opts) => new Promise((_, reject) => { opts?.signal?.addEventListener("abort", () => reject(...)) })`. Assert the processor returns `{ ok: false }` with an abort/timeout error. Use a short timeout override or `vi.useFakeTimers` to avoid 15-second waits in the test suite.
- **Unit (step 1):** Existing kroki tests pass unchanged after the import move.
- **Fakes:** No changes to `FakeShellRunner`.
- **Live:** Existing live tests unaffected — real `dot`/`mmdc` complete well within 15 seconds.
- **Deleted:** None.

## Verification

`pnpm run feedback` — all five gates pass. `pnpm run inspect` — no new CRAP regressions.

## Key files

**Modified:** `extensions/pi-fence/processor.ts` (add `mergeSignals` + `DEFAULT_RENDER_TIMEOUT_MS`), `extensions/pi-fence/kroki.ts` (remove private `mergeSignals`/`DEFAULT_TIMEOUT_MS`, import shared), `extensions/pi-fence/graphviz-local.ts` (add timeout), `extensions/pi-fence/mermaid-local.ts` (add timeout), `tests/unit/graphviz-local.test.ts`, `tests/unit/mermaid-local.test.ts` (new timeout tests).
