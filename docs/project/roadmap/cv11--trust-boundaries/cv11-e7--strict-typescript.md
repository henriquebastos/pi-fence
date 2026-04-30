# CV11.E7 — Staged Strict TypeScript

**CV:** [CV11 — Trust Boundaries](README.md)
**Last updated:** 2026-04-29 — planned

## Summary

Adopt `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` through staged gates instead of flipping both directly into the fast lane.

The read-only review showed both flags find useful issues. They also produce many diagnostics today. This epic turns the flags into an ordered cleanup path: production indexing first, optional-property hygiene after the resolved policy work, then promotion to the normal type gate only when clean.

## Stories

| Code | Story | Status |
|------|-------|--------|
| [S1](cv11-e7-s1--staged-no-unchecked-indexed-access.md) | **Staged noUncheckedIndexedAccess adoption** | Ready |
| [S2](cv11-e7-s2--staged-exact-optional-property-types.md) | **Staged exactOptionalPropertyTypes adoption** | Ready |

## Done criterion (epic-level)

1. `lint:types:strict-next` or equivalent exposes staged strict checks before they enter `feedback`.
2. Production modules pass `noUncheckedIndexedAccess` without broad non-null assertion scatter.
3. Tests and tooling pass `noUncheckedIndexedAccess` with localized assertion helpers where needed.
4. Optional-property diagnostics are resolved by omitting absent fields or changing types only where `undefined` is semantically real.
5. Both flags are promoted into the normal type gate only after the staged command is clean.
6. `pnpm run feedback` passes after promotion.
