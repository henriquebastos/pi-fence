# CV11.E5.S1 — Fence source and output limits

**Status:** Ready

**Epic:** [CV11.E5 — Render Resource Limits](cv11-e5--render-resource-limits.md)
**Depends on:** [CV11.E3.S1 — Resolved runtime policy object](cv11-e3-s1--resolved-runtime-policy.md), [CV11.E3.S2 — Explicit fence output and sandbox status variants](cv11-e3-s2--explicit-fence-output-and-sandbox-status.md)
**Date:** 2026-04-29 (spec)

## Summary

Add first-class render limits for fence source bytes, rendered output bytes, and block count. Oversized input should be rejected before processor invocation. Oversized output should produce visible pi-fence error output instead of flowing into image/text rendering or persisted message details.

## Done criterion

1. Resolved runtime policy includes default render limits.
2. Config validation accepts safe numeric limit overrides if the story chooses to expose them; otherwise defaults remain code-only and documented as internal.
3. `agent_end` rejects oversized fence source before calling `resolveProcessor()` / `processor.render()`.
4. Oversize rejection sends a normal pi-fence error output message.
5. Metrics record oversize failure when metrics are available.
6. Output-size checks run before custom message content is built.
7. Custom message details retain only a bounded source preview, clipped before `pi.sendMessage()`.
8. HTTP/Kroki response handling has a cap or a clearly tested cap point.
9. Tests prove processors are not invoked for oversized source.
10. `pnpm run feedback` passes.

## Scope

**In scope:**

1. `RenderLimits` in resolved policy.
2. Source-byte check in `agent-end.ts`.
3. Output-byte check in message/output normalization path.
4. Source-preview byte/line cap in message details, per the CV11.E2 decision.
5. Kroki/HTTP response cap behavior.
6. Unit and extension tests for rejection paths.

**Out of scope:**

1. Processor-specific CPU/expansion caps — S2.
2. Streaming renderer cancellation if pi does not expose a signal yet.
3. User-facing config docs unless limits are exposed in config.

## Plan

1. **RED — limits in policy.** Add config/policy tests for default limits.
2. **GREEN — `RenderLimits`.** Add non-optional runtime defaults.
3. **RED — oversized source.** Extension test: emit a huge fenced block and assert no processor call plus visible error output.
4. **GREEN — pre-render check.** Enforce source limit in `agent-end.ts`.
5. **RED — oversized output.** Unit/extension test: processor returns image/text above cap and pi-fence emits controlled error.
6. **GREEN — output check.** Normalize/cap output before message construction.
7. **RED — HTTP cap.** Add Kroki/HTTP test for response over cap.
8. **GREEN — response cap.** Implement cap in `HttpRequest` or Kroki-specific path.

## Tests

1. **Layers touched:** unit and extension.
2. **Events / interactions covered:** oversize source, oversize image output, oversize text output, bounded source-preview retention, Kroki response cap, metrics on failure.
3. **Fakes added:** none expected.
4. **Live tests:** run `pnpm test:live` when the implementation changes `HttpClient` or another I/O seam for Kroki/HTTP caps.
5. **Deferred:** per-processor expansion-specific controls.

## Verification

```bash
pnpm vitest run tests/unit/config.test.ts tests/unit/kroki.test.ts tests/unit/messages.test.ts tests/unit/renderer.test.ts
pnpm vitest run tests/extension/pi-fence.test.ts --testNamePattern "limit|oversize|large"
pnpm run feedback
pnpm test:live
```

## Key files

- `extensions/pi-fence/config.ts`
- `extensions/pi-fence/agent-end.ts`
- `extensions/pi-fence/messages.ts`
- `extensions/pi-fence/io/http-client.ts`
- `extensions/pi-fence/kroki.ts`
- `extensions/pi-fence/metrics.ts`
