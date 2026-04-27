# CV9.E1.S2 — Object bindings and ambiguity

**Status:** In progress

**Epic:** [CV9.E1 — Policy-driven Resolution](cv9-e1--policy-driven-resolution.md)
**Date:** 2026-04-25 (spec)

## Summary

Replace string tag bindings with object-shaped selector constraints. A binding narrows eligible processors; it never bypasses `processorPrecedence` or future block policy.

New binding shape:

```typescript
type TagBinding =
  | { processor: string }
  | { placement: ProcessorPlacement };
```

Example config:

```json
{
  "processorPrecedence": ["embedded", "host", "sandbox", "remote"],
  "bindings": {
    "graphviz": { "processor": "graphviz-host" },
    "mermaid": { "placement": "host" },
    "sql": { "placement": "embedded" }
  }
}
```

No backward compatibility is required for old string bindings.

## Done criterion

1. `bindings` validates as `Record<string, TagBinding>`.
2. String binding values are invalid and ignored with a warning.
3. A binding must contain exactly one selector: `processor` or `placement`.
4. `{ "processor": "..." }` selects that processor only if it is otherwise eligible.
5. `{ "placement": "..." }` selects processors in that placement only if that placement is allowed by `processorPrecedence`.
6. Bindings never re-enable a placement omitted from `processorPrecedence`.
7. Same-placement ambiguity is resolved by `{ "processor": "..." }`.
8. Same-placement ambiguity remains ambiguous under `{ "placement": "..." }` when multiple processors in that placement match.
9. `/fence list` and `/fence doctor` describe effective bindings and binding issues with placement-aware reasons.
10. `pnpm run feedback` passes.

## Scope

**In scope:**

1. Config type/validation changes for object-only bindings.
2. Resolver support for processor and placement selector constraints.
3. Binding diagnostics for unknown processor, disallowed placement, unavailable processor, no matching placement, and ambiguous binding result.
4. Extension tests for config bindings affecting real render choices.

**Out of scope:**

1. Blocked tags/processors — S3.
2. Fenced info-string `processor=` policy changes unless existing behavior already routes through config bindings.
3. Sandbox-specific binding fields such as `sandbox` — S4 decides whether they are needed.
4. Migration support for old string bindings.

## Plan

| Step | TDD phase | Layer | What | Commit |
|------|-----------|-------|------|--------|
| 1a | red → green → refactor | Unit | Validate `{ "processor": "kroki-remote" }` and introduce the `TagBinding` type with the smallest caller updates needed for green. | `step 1: object binding config` |
| 1b | red → green → refactor | Unit | Validate `{ "placement": "host" }`. | same |
| 1c | red → green → refactor | Unit | Reject old string binding values with a warning. | same |
| 1d | red → green → refactor | Unit | Reject binding objects with both selectors. | same |
| 1e | red → green → refactor | Unit | Reject binding objects with neither selector. | same |
| 1f | red → green → refactor | Unit | Reject invalid placement selector values. | same |
| 2a | red → green → refactor | Unit | Resolve `{ "processor": "..." }` inside `processorPrecedence`. | `step 2: selector binding resolver` |
| 2b | red → green → refactor | Unit | Keep `{ "processor": "..." }` from selecting outside `processorPrecedence`. | same |
| 2c | red → green → refactor | Unit | Resolve `{ "placement": "..." }` as a placement constraint. | same |
| 2d | red → green → refactor | Unit | Resolve same-placement ambiguity only with an exact processor binding. | same |
| 2e | red → green → refactor | Unit | Keep same-placement ambiguity under a placement binding. | same |
| 3a | red → green → refactor | Extension | Prove real config can bind `graphviz` to `graphviz-host` only when `host` is allowed. | `step 3: binding diagnostics and extension path` |
| 3b | red → green → refactor | Extension | Prove real config can bind `graphviz` to `kroki-remote` only when `remote` is allowed. | same |
| 3c | red → green → refactor | Unit/Extension | Update `/fence list`, `/fence doctor`, logging, and trace formatting one diagnostic reason at a time. | same |
| 4 | verify | All fast | Run `pnpm run feedback`, then `pnpm run inspect`. | same |

## Tests

1. **Layers touched:**
   - **Unit** — config validation/merge, resolver binding constraints, binding diagnostic formatter.
   - **Extension** — real config file drives processor selection and binding issue diagnostics.
   - **Render** — only if `/fence list` or `/fence doctor` message details/lines change enough to need renderer assertions.
2. **Events / interactions covered:**
   - Exact processor binding narrows candidates.
   - Placement binding narrows candidates.
   - Binding cannot use a processor outside `processorPrecedence`.
   - Exact processor binding resolves a same-placement ambiguity.
   - Placement binding does not resolve same-placement ambiguity.
3. **Fakes added:** none expected.
4. **Live tests:** none; no processor I/O seam changes.
5. **Deferred:** block policy reasons land in S3; sandbox-specific selectors land only after S4 decides they are needed.

## Verification

```bash
pnpm run feedback
pnpm run inspect
```
