# CV9.E1.S1 — Placement precedence tracer bullet

**Status:** Done

**Epic:** [CV9.E1 — Policy-driven Resolution](cv9-e1--policy-driven-resolution.md)
**Date:** 2026-04-25 (spec)

## Summary

Introduce processor placement and `processorPrecedence` with a thin vertical slice from config file to real extension rendering. The first slice proves user policy, not registration order, chooses between host processors and remote processors.

Placements start as:

```typescript
type ProcessorPlacement = "embedded" | "host" | "sandbox" | "remote";
```

Initial target classifications and ids:

| Processor id | Placement | Reason |
|--------------|-----------|--------|
| `table-embedded` | `embedded` | parser/formatter runs inside pi-fence |
| `highlight-embedded` | `embedded` | ANSI formatter runs inside pi-fence |
| `qr-embedded` | `embedded` | QR rendering library runs inside pi-fence |
| `color-embedded` | `embedded` | ANSI swatches run inside pi-fence |
| `graphviz-host` | `host` | calls `dot` on host `PATH` |
| `mermaid-host` | `host` | calls `mmdc` on host `PATH` |
| `kroki-remote` | `remote` | calls an HTTP service pi-fence does not control |

No `sandbox` processor is introduced in this story; the placement is reserved so config and resolver semantics are stable before sandbox work.

## Done criterion

1. `FenceProcessor` has `readonly placement: ProcessorPlacement`.
2. All built-in processors declare the correct placement.
3. Built-in processor ids follow `<family>-<placement>[-variant]`.
4. Config validates and merges `processorPrecedence`.
5. Default precedence is `["embedded", "host", "sandbox", "remote"]`.
6. Omitting a placement disables processors in that placement for resolution.
7. Resolution selects by placement precedence instead of registration order across placements.
8. Same-placement multiple-candidate matches return an ambiguity result instead of selecting by registration order.
9. A full extension test proves a config file can force a different backend choice for a real fenced block.
10. Config and legacy-id edge cases fail closed rather than silently widening from local/embedded to host/remote trust boundaries.
11. `pnpm run feedback` passes.

## Scope

**In scope:**

1. `ProcessorPlacement` type and processor metadata.
2. Renaming current built-in processor ids to the target convention.
3. Config schema/validation/merge for `processorPrecedence`.
4. Resolver policy for placement allowlist + precedence.
5. Resolution trace outcomes for placement filtering and same-placement ambiguity.
6. Extension-layer tracer bullet showing config → resolver → render behavior.
7. Fail-closed handling for config errors and legacy processor ids where needed to keep the placement transition from re-enabling broader trust boundaries.

**Out of scope:**

1. Object binding redesign — S2.
2. Blocked tags/processors — S3.
3. Sandbox runtime control — S4.
4. Processor folder discovery — S7.
5. Broad migration for old config keys or old processor ids. This story only normalizes known legacy processor ids in `bindings`/`disabled` so privacy-oriented disabled configs do not fail open during the rename.

## Plan

### Tracer bullet

Carry this behavior end-to-end first:

```json
{
  "processorPrecedence": ["remote"]
}
```

Given `dot` is available on the host and a `dot` fenced block is emitted, pi-fence must skip `graphviz-host` because `host` is disabled and render via `kroki-remote`.

Then add the inverse proof:

```json
{
  "processorPrecedence": ["host"]
}
```

Given `dot` is available, pi-fence must render through `graphviz-host` and make zero Kroki HTTP calls.

### Implementation order

| Step | TDD phase | Layer | What | Commit |
|------|-----------|-------|------|--------|
| 1 | red | Unit | Add config tests for default precedence, valid custom precedence, invalid entries, and restrictive merge semantics. | `step 1: placement precedence config` |
| 2 | green/refactor | Unit | Add `ProcessorPlacement`, config parsing, and built-in processor placement fields. | same |
| 3 | red | Unit/contract | Add tests requiring the target processor id convention and valid placement on every processor. | `step 2: placement policy tracer bullet` |
| 4 | green/refactor | Unit/contract | Rename built-in processor ids and update contract/list expectations. | same |
| 5 | red | Unit | Add resolver tests proving placement allowlist, placement order swap, and same-placement ambiguity. | same |
| 6 | green/refactor | Unit | Rewrite resolver candidate selection around placement groups and explicit ambiguity. | same |
| 7 | red | Extension | Add the tracer-bullet extension tests for `remote`-only and `host`-only precedence on a `dot` block. | same |
| 8 | green/refactor | Extension | Thread `processorPrecedence` through `index.ts`, `agent-end.ts`, `/fence list`, logging, metrics, docs, and fixtures without widening trust boundaries. | same |
| 9 | verify | All fast/live | Run `pnpm run feedback`, `pnpm run inspect`, and live/render verification for the user-visible id changes. | same |

## Tests

1. **Layers touched:**
   - **Unit** — config validation/merge and resolver placement policy.
   - **Contract** — every processor declares a valid placement and target id.
   - **Extension** — full tracer bullet through `createPiFenceExtension` with config files, `FakeShellRunner`, and `FakeHttpClient`.
2. **Events / interactions covered:**
   - Config file precedence reaches runtime resolution.
   - `host` processors are skipped when `host` is omitted.
   - `remote` processors are skipped when `remote` is omitted.
   - Same-placement ambiguity produces no hidden first-registered winner.
3. **Fakes added:** none expected; existing `FakeShellRunner`, `FakeHttpClient`, and `FakeLogger` cover the tracer bullet.
4. **Live tests:** no new I/O seam. Run `pnpm test:live` because user-visible processor ids affect render-image goldens.
5. **Deferred:** object binding and blocking diagnostics are deferred to S2/S3.

## Verification

```bash
pnpm run feedback
pnpm run inspect
pnpm test:live
pnpm run render:verify
```
