# CV11.E3.S2 — Explicit fence output and sandbox status variants

**Status:** Ready

**Epic:** [CV11.E3 — Explicit Runtime Model](cv11-e3--explicit-runtime-model.md)
**Depends on:** [CV11.E3.S1 — Resolved runtime policy object](cv11-e3-s1--resolved-runtime-policy.md)
**Date:** 2026-04-29 (spec)

## Summary

Make render output and sandbox lifecycle state explicit domain unions. Today `FenceResult` uses `ok` plus field-presence checks (`png` vs `text`), and `SandboxStatus` allows optional `endpoint` on any state. This story introduces clearer discriminants and exhaustive handling while preserving user-visible behavior.

## Done criterion

1. Fence output is represented as explicit variants for image, text, and error.
2. Message building uses exhaustive variant handling instead of field-presence checks.
3. Sandbox status distinguishes ready service endpoints from ready exec runtimes, or otherwise makes endpoint availability impossible to misuse.
4. Kroki sandbox endpoint extraction no longer has to handle `ready` without endpoint as a normal state unless that state is explicitly represented as an error.
5. Existing processor contract tests are updated to the new shape.
6. Existing user-visible rendering remains unchanged unless CV11.E2 decided to change source retention.
7. `pnpm run feedback` passes.

## Scope

**In scope:**

1. `extensions/pi-fence/processor.ts` output type changes.
2. Output conversion helpers if a staged migration is safer.
3. Updates to all built-in processors and contract tests.
4. `extensions/pi-fence/messages.ts` and `renderer.ts` tests.
5. `extensions/pi-fence/sandbox.ts` status type changes and Kroki/bundle call sites.

**Out of scope:**

1. Third-party processor runtime normalization — CV11.E4.S2.
2. Render resource limits — CV11.E5.
3. Changing image/text UI layout.

## Plan

1. **RED — output normalizer/exhaustiveness.** Add tests for image/text/error output variants and message building.
2. **GREEN — `FenceOutput`.** Introduce the explicit union. If needed, keep a temporary legacy normalizer to reduce churn.
3. **RED — processor contracts.** Update contract helper expectations.
4. **GREEN — processors.** Migrate processors one group at a time: embedded, host, sandbox, remote.
5. **RED — sandbox status.** Add tests proving ready service status carries endpoint and ready exec status does not pretend to.
6. **GREEN — sandbox union.** Update controllers and Kroki endpoint extraction.
7. **REFACTOR.** Add `assertNever` or equivalent where exhaustive switches matter.

## Tests

1. **Layers touched:** unit, contract, extension.
2. **Events / interactions covered:** successful image output, successful text output, error output/follow-up, service sandbox readiness, exec sandbox readiness.
3. **Fakes added:** none expected.
4. **Live tests:** not required for the type refactor; existing live tests can be run later for confidence.
5. **Deferred:** third-party bad-result normalization.

## Verification

```bash
pnpm vitest run tests/unit/processor.test.ts tests/unit/messages.test.ts tests/unit/renderer.test.ts tests/unit/sandbox.test.ts
pnpm vitest run tests/contract/*.test.ts
pnpm vitest run tests/extension/pi-fence.test.ts
pnpm run feedback
```

## Key files

- `extensions/pi-fence/processor.ts`
- `extensions/pi-fence/messages.ts`
- `extensions/pi-fence/renderer.ts`
- `extensions/pi-fence/sandbox.ts`
- `extensions/pi-fence/kroki.ts`
- `extensions/pi-fence/bundle-sandbox.ts`
- `tests/contract/fence-processor.ts`
