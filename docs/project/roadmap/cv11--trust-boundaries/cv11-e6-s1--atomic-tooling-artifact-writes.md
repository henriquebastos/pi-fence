# CV11.E6.S1 — Atomic tooling artifact writes

**Status:** Ready

**Epic:** [CV11.E6 — Tooling Quality](cv11-e6--tooling-quality.md)
**Depends on:** [CV11.E5 — Render Resource Limits](cv11-e5--render-resource-limits.md)
**Date:** 2026-04-29 (spec)

## Summary

Make tooling writes robust against interruption by writing repo artifacts through sibling temporary files and atomic rename where practical. This protects fixture manifests, fixture PNGs, render verifier galleries, and golden updates from partial writes.

## Done criterion

1. A small atomic write helper exists for text and binary data.
2. Fixture PNG writes use the helper.
3. Fixture manifest writes use the helper.
4. Render verifier gallery writes use the helper.
5. Golden image updates use an atomic copy/write-then-rename path.
6. Render gallery HTML/PNG writes use the helper where practical.
7. Tests cover helper success and failure cleanup behavior.
8. `pnpm run feedback` passes.

## Scope

**In scope:**

1. New helper under `scripts/` or `scripts/io/`.
2. Updates to `scripts/refresh-fixtures.ts`, `scripts/render-verify.ts`, and `scripts/render-gallery.ts`.
3. Unit tests for helper behavior in `os.tmpdir()`.

**Out of scope:**

1. Production extension persistence.
2. Adding fsync durability guarantees unless the implementation chooses it cheaply and tests it portably.
3. Refactoring CLI argument parsing — S2.

## Plan

1. **RED — helper tests.** Add `tests/unit/atomic-write.test.ts` covering write, replace, binary data, and temp cleanup on injected failure if dependency injection is used.
2. **GREEN — helper.** Implement `writeFileAtomic(path, data)` with sibling temp path and `rename()`.
3. **RED — script integration seam.** Add targeted tests or refactor functions so writes can be verified without running live services.
4. **GREEN — replace direct writes.** Update fixture, manifest, gallery, golden, and render-gallery writes.
5. **REFACTOR.** Keep helper script-lane only unless runtime persistence later needs its own seam.

## Tests

1. **Layers touched:** unit/tooling.
2. **Events / interactions covered:** atomic writes and existing script output paths.
3. **Fakes added:** possibly a small injected fs adapter for failure-path tests; keep it local to tooling tests.
4. **Live tests:** none.
5. **Deferred:** production durable state; pi-fence currently has no append-only runtime persistence.

## Verification

```bash
pnpm vitest run tests/unit/atomic-write.test.ts tests/unit/refresh-fixtures.test.ts tests/unit/verify-gallery.test.ts
pnpm run feedback
```

## Key files

- `scripts/refresh-fixtures.ts`
- `scripts/render-verify.ts`
- `scripts/render-gallery.ts`
- `scripts/io/atomic-write.ts` or equivalent
- `tests/unit/atomic-write.test.ts`
