# CV11.E7.S2 — Staged exactOptionalPropertyTypes adoption

**Status:** Ready

**Epic:** [CV11.E7 — Staged Strict TypeScript](cv11-e7--strict-typescript.md)
**Depends on:** [CV11.E7.S1 — Staged noUncheckedIndexedAccess adoption](cv11-e7-s1--staged-no-unchecked-indexed-access.md)
**Date:** 2026-04-29 (spec)

## Summary

Adopt `exactOptionalPropertyTypes` after the resolved-policy work has reduced optional-field churn. The flag should make absence explicit: omit fields that are absent, and only type `| undefined` when `undefined` itself is meaningful.

## Done criterion

1. A staged command runs `tsc --noEmit --exactOptionalPropertyTypes --pretty false` or combines both strict-next flags once S1 is clean.
2. Production code omits absent optional fields instead of passing `prop: undefined`.
3. Runtime option objects for `signal`, `input`, `headers`, `endpoints`, `metrics`, `image`, and `dashboardUrl` are cleaned up.
4. Test utilities and fakes model optional properties accurately.
5. `exactOptionalPropertyTypes: true` is promoted to `tsconfig.json` only after the staged command is clean.
6. `pnpm run feedback` passes after promotion.

## Scope

**In scope:**

1. Optional-property cleanup across `extensions`, `scripts`, and `tests`.
2. Helper builders for option objects where repeated spread patterns would be noisy.
3. Type adjustments only where `undefined` is a real value distinct from absence.

**Out of scope:**

1. Reverting `noUncheckedIndexedAccess`.
2. Changing public config file syntax.
3. Behavior changes beyond omitting absent fields.

## Plan

1. **RED — staged command.** Add or update `lint:types:strict-next` to include exact optional properties and capture diagnostics.
2. **GREEN — production options.** Fix runtime option object construction by using conditional spreads or helper builders.
3. **GREEN — policy/config types.** Ensure `ResolvedPiFencePolicy` keeps runtime fields non-optional and raw config fields accurately optional.
4. **GREEN — scripts/tests.** Clean fakes and test captured-message shapes by omitting absent optional fields.
5. **PROMOTE.** Add `exactOptionalPropertyTypes: true` to `tsconfig.json` after the staged command is clean.
6. **REFACTOR.** Remove temporary script complexity if both strict flags are now normal typecheck behavior.

## Tests

1. **Layers touched:** type lint plus existing tests as affected.
2. **Events / interactions covered:** compile-time optional-field hygiene only.
3. **Fakes added:** none.
4. **Live tests:** none.
5. **Deferred:** none; this closes CV11's strict TypeScript lane.

## Verification

```bash
pnpm run lint:types:strict-next
pnpm run lint:types
pnpm run feedback
```

## Key files

- `package.json`
- `tsconfig.json`
- `extensions/pi-fence/**/*.ts`
- `scripts/**/*.ts`
- `tests/**/*.ts`
