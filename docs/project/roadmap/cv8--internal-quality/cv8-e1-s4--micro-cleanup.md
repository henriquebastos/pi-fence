# CV8.E1.S4 — Micro cleanup

**Status:** Ready

**Epic:** [CV8.E1 — Duplication Removal](cv8-e1--resolution-trace-unification.md)
**Date:** 2026-04-25 (spec)

## Summary

Four small hygiene items that are each too minor for their own story but together reduce noise and misplacement in the codebase.

1. **`NULL_LOGGER` lives in `processor.ts`.** The interface definition module exports a concrete utility. Move to `io/logger.ts` where the `Logger` interface lives.
2. **Dead type aliases in `kroki.ts`.** `KrokiResult` and `KrokiProcessor` are exported but imported by nobody — zero consumers in production or tests.
3. **Duplicated JSDoc in `kroki.ts`.** `KROKI_SVG_ONLY_TAGS` has two consecutive doc comments; the first is a subset of the second.
4. **`NodeLogger` reads env on every log call.** `thresholdFromEnv()` hits `process.env.PI_FENCE_LOG_LEVEL` on every `.debug()`, `.info()`, etc. Cache at construction time.

## Done criterion

1. `NULL_LOGGER` is exported from `io/logger.ts`. `processor.ts` no longer exports it. All importers updated.
2. `KrokiResult` and `KrokiProcessor` type aliases are deleted from `kroki.ts`.
3. The duplicated JSDoc above `KROKI_SVG_ONLY_TAGS` is collapsed to one block.
4. `NodeLogger` reads the env threshold once at construction, not per call.
5. `pnpm run feedback` passes.

## Scope

**In scope:**

- Move `NULL_LOGGER` from `processor.ts` to `io/logger.ts`.
- Update imports in `kroki.ts`, `graphviz-local.ts`, `mermaid-local.ts`, `kroki-docker.ts`.
- Delete `KrokiResult` and `KrokiProcessor` from `kroki.ts`.
- Remove the duplicate JSDoc block above `KROKI_SVG_ONLY_TAGS`.
- Cache env threshold in `NodeLogger` constructor.

**Out of scope:**

- Changing log-level semantics or adding runtime log-level switching.
- Changing the `Logger` interface.

## Plan

| Step | Layer | What |
|------|-------|------|
| 1 | impl | Move `NULL_LOGGER` to `io/logger.ts`. Update 4 importers. |
| 2 | impl | Delete dead type aliases and duplicate JSDoc from `kroki.ts`. |
| 3 | impl | Cache env threshold in `NodeLogger` constructor. |
| 4 | refactor | `pnpm run feedback`. |

## Tests

- **Unit:** All existing tests pass unchanged. `NULL_LOGGER` move is import-only. Dead alias deletion has zero consumers. JSDoc is a comment. `NodeLogger` caching is a performance change with no behavioral difference — existing logger tests cover threshold behavior.
- **Fakes:** None new.
- **Live:** None affected.
- **Deleted:** None.

## Verification

`pnpm run feedback` — all five gates pass.

## Key files

**Modified:** `extensions/pi-fence/processor.ts` (remove `NULL_LOGGER`), `extensions/pi-fence/io/logger.ts` (add `NULL_LOGGER`, cache threshold), `extensions/pi-fence/kroki.ts` (delete aliases + JSDoc), `extensions/pi-fence/graphviz-local.ts`, `extensions/pi-fence/mermaid-local.ts`, `extensions/pi-fence/kroki-docker.ts` (update imports).
