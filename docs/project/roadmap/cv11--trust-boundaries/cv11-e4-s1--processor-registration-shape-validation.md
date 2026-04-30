# CV11.E4.S1 — Processor registration shape validation

**Status:** Done

**Epic:** [CV11.E4 — Semi-trusted Processors](cv11-e4--semi-trusted-processors.md)
**Depends on:** [CV11.E3.S2 — Explicit fence output and sandbox status variants](cv11-e3-s2--explicit-fence-output-and-sandbox-status.md)
**Date:** 2026-04-29 (spec)

## Summary

Harden the `pi-fence:register` event-bus boundary. A third-party processor is semi-trusted: pi-fence can call its functions, but should not accept malformed ids, tags, aliases, or precedence metadata into resolver/list state.

## Done criterion

1. `validateProcessor()` rejects unsafe or empty processor ids.
2. `validateProcessor()` rejects unsafe or empty tags.
3. `validateProcessor()` rejects invalid placements.
4. `validateProcessor()` rejects alias maps whose keys/values are not safe strings.
5. Alias targets must exist in canonical `tags`.
6. Alias output uses a null-prototype object or equivalent prototype-pollution-safe representation.
7. Existing forbidden factory/processor metadata such as `order`, `priority`, and `processorPrecedence` remains rejected where applicable.
8. Tests cover `__proto__`, inherited properties, path-like ids/tags, whitespace/control characters, and invalid alias targets.
9. `pnpm run feedback` passes.

## Scope

**In scope:**

1. Shape validation in `extensions/pi-fence/register.ts`.
2. Unit tests in `tests/unit/register.test.ts`.
3. Extension event-bus rejection tests where useful.
4. Processor author docs for valid id/tag/alias shapes.

**Out of scope:**

1. Calling or normalizing `available()` / `render()` results — S2.
2. Sandboxing third-party extension code.
3. Changing built-in processor ids.

## Plan

1. **RED — id/tag safety.** Add register tests for empty strings, whitespace, slashes, `..`, control characters, and maximum-length behavior if a max is chosen.
2. **GREEN — safe name helpers.** Add conservative validation helpers, e.g. safe id/tag regexes.
3. **RED — alias safety.** Add tests for invalid alias maps, inherited alias keys, `__proto__`, non-string targets, and targets not present in tags.
4. **GREEN — alias validator.** Build a safe aliases object from own entries only.
5. **RED — event-bus rejection.** Add one extension test proving a bad third-party registration emits `pi-fence:register-error` and does not mutate the registry.
6. **GREEN — wire diagnostics.** Ensure existing listener surfaces the validation error.
7. **Docs.** Update processor guide.

## Tests

1. **Layers touched:** unit and small extension event-bus test.
2. **Events / interactions covered:** bad processor registration rejection and good processor acceptance.
3. **Fakes added:** none.
4. **Live tests:** none.
5. **Deferred:** runtime result normalization.

## Verification

```bash
pnpm vitest run tests/unit/register.test.ts
pnpm vitest run tests/extension/pi-fence.test.ts --testNamePattern "register|third-party"
pnpm run feedback
```

## Key files

- `extensions/pi-fence/register.ts`
- `extensions/pi-fence/processor.ts`
- `tests/unit/register.test.ts`
- `tests/extension/pi-fence.test.ts`
- `docs/guides/write-a-processor.md`
