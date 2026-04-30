# CV11.E3 — Explicit Runtime Model

**CV:** [CV11 — Trust Boundaries](README.md)
**Last updated:** 2026-04-29 — planned

## Summary

Replace optional-field runtime bags and implicit result shapes with explicit operational objects and exhaustively handled domain unions.

This epic prepares later trust-boundary work. A resolved policy object makes render limits and config provenance easier to thread. Explicit `FenceOutput` and sandbox status variants make third-party result normalization and service/exec lifecycle checks safer.

## Stories

| Code | Story | Status |
|------|-------|--------|
| [S1](cv11-e3-s1--resolved-runtime-policy.md) | **Resolved runtime policy object** | Ready |
| [S2](cv11-e3-s2--explicit-fence-output-and-sandbox-status.md) | **Explicit fence output and sandbox status variants** | Ready |

## Done criterion (epic-level)

1. Runtime handlers receive a resolved policy object instead of many parallel config-derived arguments.
2. Optional raw config fields do not leak into normal render/command paths.
3. Fence output handling is explicit and exhaustive across image, text, and error variants.
4. Sandbox status distinguishes ready service endpoints from ready exec runtimes without optional-field ambiguity.
5. Public behavior stays unchanged except where the CV11.E2 source-retention decision requires a user-visible change.
6. `pnpm run feedback` passes.
