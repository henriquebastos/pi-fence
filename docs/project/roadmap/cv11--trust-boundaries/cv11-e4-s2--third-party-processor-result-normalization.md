# CV11.E4.S2 — Third-party processor result normalization

**Status:** Done

**Epic:** [CV11.E4 — Semi-trusted Processors](cv11-e4--semi-trusted-processors.md)
**Depends on:** [CV11.E4.S1 — Processor registration shape validation](cv11-e4-s1--processor-registration-shape-validation.md)
**Date:** 2026-04-29 (spec)

## Summary

Wrap third-party processor functions so thrown exceptions and malformed return values become controlled pi-fence diagnostics. A registered processor should not be able to make `/fence list`, `/fence doctor`, `agent_end`, or custom message building crash by returning a bad `Availability` or render result shape.

## Done criterion

1. `available()` exceptions become `{ ok: false, reason: "available() threw: ..." }` or equivalent.
2. Malformed `available()` returns become unavailable diagnostics.
3. `render()` exceptions become explicit pi-fence error output.
4. Malformed `render()` returns become explicit pi-fence error output.
5. Bad third-party output still records metrics/follow-up behavior consistently with normal processor errors.
6. Built-in processors remain unaffected except through shared normalizer helpers.
7. Tests cover thrown and malformed availability/render paths through both unit helpers and extension event-bus registration.
8. `pnpm run feedback` passes.

## Scope

**In scope:**

1. Runtime wrappers in `extensions/pi-fence/register.ts` or a focused helper module.
2. `Availability` and `FenceOutput` validation/normalization helpers.
3. Unit tests for helper behavior.
4. Extension tests for a third-party processor that misbehaves after registration.

**Out of scope:**

1. Sandboxing third-party code.
2. Timeouts for processor functions beyond existing render timeout stories.
3. Registration shape validation already handled by S1.

## Plan

1. **RED — availability throws.** Add a test where a third-party `available()` throws during registration/probe and the registry stores an unavailable result.
2. **GREEN — availability wrapper.** Normalize throw and result shapes.
3. **RED — malformed availability.** Add tests for `undefined`, `{ ok: false }`, `{ ok: true, reason: "x" }`, and non-object returns.
4. **GREEN — strict availability parser.** Return clear reasons for malformed values.
5. **RED — render throws/malformed.** Add extension tests proving a bad render returns an error custom message and optional follow-up instead of crashing.
6. **GREEN — render wrapper.** Normalize render results to the explicit output type from CV11.E3.S2.
7. **REFACTOR.** Keep wrappers small and pure where possible; avoid coupling to pi SDK.

## Tests

1. **Layers touched:** unit and extension.
2. **Events / interactions covered:** event-bus registration, availability probing, render invocation, error message/follow-up path.
3. **Fakes added:** none expected.
4. **Live tests:** none.
5. **Deferred:** processor execution timeout/cancellation if not already present.

## Verification

```bash
pnpm vitest run tests/unit/register.test.ts tests/unit/processor.test.ts
pnpm vitest run tests/extension/pi-fence.test.ts --testNamePattern "third-party|register|malformed"
pnpm run feedback
```

## Key files

- `extensions/pi-fence/register.ts`
- `extensions/pi-fence/processor.ts`
- `extensions/pi-fence/agent-end.ts`
- `extensions/pi-fence/messages.ts`
- `tests/unit/register.test.ts`
- `tests/unit/processor.test.ts`
- `tests/extension/pi-fence.test.ts`
