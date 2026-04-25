# CV8.E1.S2 — Shared render guards

**Status:** In progress

**Epic:** [CV8.E1 — Duplication Removal](cv8-e1--resolution-trace-unification.md)
**Date:** 2026-04-25 (spec)

## Summary

All 7 processors copy-paste the same abort-signal check. The 4 pure-logic processors (`highlight`, `table`, `color`, `qr`) additionally copy-paste trim + empty-input guards. Extract two composable higher-order functions: `withSignalGuard` (layer 1, all 7 processors) and `withRenderGuards` (layer 2, composes layer 1, adds trim + empty — 4 pure-logic processors). Layer 2 calls layer 1 internally, so the signal check is defined exactly once.

## Done criterion

1. `withSignalGuard(fn)` exists in `processor.ts`. Wraps the abort check. Used by all 7 processors.
2. `withRenderGuards(fn)` exists in `processor.ts`. Composes `withSignalGuard`, adds trim + empty guard. Used by `highlight`, `table`, `color`, `qr`.
3. No processor's `render` method contains a manual `signal?.aborted` check or a trim+empty guard.
4. Behavior is identical: same trim semantics, same abort paths.
5. `pnpm run feedback` passes.

## Design decisions

**Normalize abort message.** Pure-logic processors said `"Aborted before render"`, shell/HTTP said `"Aborted before request"`. Unified to `"Aborted before render"` — the distinction was an implementation detail. Tests assert `toContain("Aborted")` so no test breakage.

**No logging in the guard.** Shell/HTTP processors previously `logger.warn`'d on abort. Removed — abort is normal control flow initiated by the caller, not a degraded state. Callers that care can check the result.

**Hardcoded empty-input message.** `withRenderGuards` produces `` `${tag}: empty input` ``. All 4 pure-logic processors use this exact template today. Parameterizing for hypothetical future variation is premature abstraction.

## Scope

**In scope:**

- `withSignalGuard(fn)`: checks `signal?.aborted`, returns `{ ok: false, error: "Aborted before render" }`. No logging.
- `withRenderGuards(fn)`: composes `withSignalGuard`, trims source, rejects empty with `${tag}: empty input`, delegates to `fn` with trimmed source.
- Migrate all 7 processors to use the appropriate layer.

**Out of scope:**

- Changing error messages beyond the abort normalization.
- Adding new guards (e.g. max source length). Future.
- Render timeouts for shell processors (separate concern).

## Plan

| Step | Layer | What |
|------|-------|------|
| 1 | unit + impl | Add `withSignalGuard` and `withRenderGuards` to `processor.ts`. Unit test both: signal abort, empty input, trimmed passthrough, composition. |
| 2 | impl | Migrate `highlight`, `table`, `color`, `qr` to `withRenderGuards`. Run their existing tests — behavior unchanged. |
| 3 | impl | Migrate `graphviz-local`, `mermaid-local`, `kroki` to `withSignalGuard`. Run their existing tests — behavior unchanged. |
| 4 | refactor | `pnpm run feedback`. `pnpm run inspect`. |

## Tests

- **Unit (step 1):** `withSignalGuard`: aborted signal returns error, non-aborted delegates. `withRenderGuards`: aborted signal returns error (via composed signal guard), empty source returns error, whitespace-only source returns error, non-empty source delegates with trimmed input.
- **Unit (steps 2–3):** All existing processor tests pass unchanged — behavior preserved.
- **Fakes:** None new.
- **Live:** None affected.
- **Deleted:** None. Existing tests verify the same behavior through the new path.

## Verification

`pnpm run feedback` — all five gates pass. `pnpm run inspect` — no new CRAP regressions.

## Key files

**Modified:** `extensions/pi-fence/processor.ts` (add guards), `extensions/pi-fence/highlight.ts`, `extensions/pi-fence/table.ts`, `extensions/pi-fence/color.ts`, `extensions/pi-fence/qr.ts`, `extensions/pi-fence/graphviz-local.ts`, `extensions/pi-fence/mermaid-local.ts`, `extensions/pi-fence/kroki.ts`.
