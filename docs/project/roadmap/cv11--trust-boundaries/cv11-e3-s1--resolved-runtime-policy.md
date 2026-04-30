# CV11.E3.S1 — Resolved runtime policy object

**Status:** Done

**Epic:** [CV11.E3 — Explicit Runtime Model](cv11-e3--explicit-runtime-model.md)
**Depends on:** [CV11.E2.S1 — Custom-message source retention spike](cv11-e2-s1--custom-message-source-retention-spike.md)
**Date:** 2026-04-29 (spec)

## Summary

Resolve raw `PiFenceConfig` into an operational policy object before runtime handlers use it. The runtime should not repeatedly derive `blockedProcessors`, `blockedTags`, default precedence, endpoints, source-retention behavior, and future render limits from optional config fields.

## Done criterion

1. A `ResolvedPiFencePolicy` or equivalent type exists.
2. It contains non-optional operational values for bindings, blocked processors, blocked tags, processor precedence, endpoint settings, sandbox config summary, source-retention behavior from CV11.E2, and render limits placeholder/defaults if E5 will fill them later.
3. `index.ts` resolves policy once after config load.
4. `agent-end.ts`, `command.ts`, and message/list helpers receive the resolved policy or focused sub-objects instead of many parallel config-derived arguments.
5. Existing behavior is unchanged.
6. Tests cover default policy, blocked policy, endpoint policy, and project/global merge implications.
7. `pnpm run feedback` passes.

## Scope

**In scope:**

1. New policy type and resolver in `config.ts` or a new `policy.ts` pure module.
2. Runtime wiring changes in `index.ts`, `agent-end.ts`, and `command.ts`.
3. Unit tests for policy resolution.
4. Minimal refactor of call signatures to reduce parallel arguments.

**Out of scope:**

1. Changing `FenceResult` / `FenceOutput` shape — S2.
2. Enforcing render limits — CV11.E5.
3. Changing config file syntax.

## Plan

1. **RED — policy defaults.** Add unit tests for `resolvePiFencePolicy(DEFAULT_CONFIG)`.
2. **GREEN — resolver.** Implement the pure resolver with non-optional runtime values.
3. **RED — merged behavior.** Add tests for blocked processors/tags, precedence, endpoint, and sandbox policy derived from merged configs.
4. **GREEN — thread policy.** Update runtime handlers to use the resolved policy.
5. **REFACTOR.** Keep raw config validation separate from runtime policy resolution.

## Tests

1. **Layers touched:** unit and extension tests.
2. **Events / interactions covered:** config-to-runtime policy derivation and existing render/list/doctor behavior under policy.
3. **Fakes added:** none.
4. **Live tests:** required when this story changes processor factory or I/O-seam wiring; run for the Kroki factory/live-runtime policy wiring.
5. **Deferred:** stricter optional-property compiler flag until CV11.E7.

## Verification

```bash
pnpm vitest run tests/unit/config.test.ts tests/unit/resolve.test.ts
pnpm vitest run tests/extension/pi-fence.test.ts --testNamePattern "blocked|precedence|endpoint|doctor"
pnpm run feedback
pnpm test:live
```

## Key files

- `extensions/pi-fence/config.ts`
- `extensions/pi-fence/policy.ts`
- `extensions/pi-fence/index.ts`
- `extensions/pi-fence/agent-end.ts`
- `extensions/pi-fence/command.ts`
- `extensions/pi-fence/messages.ts`
- `extensions/pi-fence/processor-factory.ts`
- `tests/unit/config.test.ts`
- `tests/extension/pi-fence.test.ts`
