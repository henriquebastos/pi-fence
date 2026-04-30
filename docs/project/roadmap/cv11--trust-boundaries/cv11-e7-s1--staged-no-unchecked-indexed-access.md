# CV11.E7.S1 — Staged noUncheckedIndexedAccess adoption

**Status:** Ready

**Epic:** [CV11.E7 — Staged Strict TypeScript](cv11-e7--strict-typescript.md)
**Depends on:** [CV11.E6 — Tooling Quality](cv11-e6--tooling-quality.md)
**Date:** 2026-04-29 (spec)

## Summary

Adopt `noUncheckedIndexedAccess` through a staged script, then clear production, tests, and tooling without scattering non-null assertions. The review trial showed useful diagnostics in parser/string/array-heavy code.

## Done criterion

1. `package.json` exposes `lint:types:strict-next` or equivalent.
2. The staged command initially runs `tsc --noEmit --noUncheckedIndexedAccess --pretty false` and is documented as staged, not part of `feedback` until clean.
3. Production runtime files pass the flag.
4. Tests and tooling pass the flag.
5. Test helper assertions localize unavoidable indexed access assumptions.
6. After clean, `noUncheckedIndexedAccess` is promoted to `tsconfig.json` and `lint:types:strict-next` is removed or repurposed.
7. `pnpm run feedback` passes after promotion.

## Scope

**In scope:**

1. Parser, color, highlight, table, resolve, config, and tooling diagnostics from the flag.
2. Small helper functions such as `firstOrThrow()` or test-only `only()` where helpful.
3. Type-safe regex group and array access patterns.

**Out of scope:**

1. `exactOptionalPropertyTypes` — S2.
2. Broad behavior changes.
3. Large parser rewrites unless the flag exposes a real bug requiring one.

## Plan

1. **RED — add staged script.** Add the script and run it to capture current diagnostics.
2. **GREEN — production modules.** Fix production diagnostics first: regex groups, line indexing, array first-element assumptions, and map lookups.
3. **GREEN — tests/tooling.** Add localized test assertion helpers rather than many `!` operators.
4. **REFACTOR.** Keep helpers domain-specific; avoid making every array access noisy.
5. **PROMOTE.** Once the staged command is clean, add `noUncheckedIndexedAccess: true` to `tsconfig.json`.

## Tests

1. **Layers touched:** type lint plus existing unit/extension suites as affected.
2. **Events / interactions covered:** compile-time safety only; behavior should stay unchanged.
3. **Fakes added:** none.
4. **Live tests:** none.
5. **Deferred:** exact optional properties.

## Verification

```bash
pnpm run lint:types:strict-next
pnpm run lint:types
pnpm run feedback
```

## Key files

- `package.json`
- `tsconfig.json`
- `extensions/pi-fence/parser.ts`
- `extensions/pi-fence/color.ts`
- `extensions/pi-fence/highlight.ts`
- `extensions/pi-fence/table.ts`
- `extensions/pi-fence/resolve.ts`
- `tests/**/*.ts`
- `scripts/**/*.ts`
