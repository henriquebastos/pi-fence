# CVx.E3.S5 — Internal API polish

**Status:** Done

**Epic:** [CVx.E3 — Refactor Confidence](cvx-e3--refactor-confidence.md)
**Depends on:** [CVx.E3.S4 — Thin composition root](cvx-e3-s4--thin-composition-root.md)
**Date:** 2026-04-22 (spec)

## Summary

After `S3` and `S4`, the architecture is in the right shape but some names still speak the old shape.

Examples:

1. processor factories still use `Renderer` language even though `processor.ts` defines the boundary contract and the architecture note now talks about processors
2. the entrypoint dependency bag is still named `PiFenceDeps`, which hides that these are runtime-edge dependencies
3. a few extracted helper names can now be tightened because their responsibilities are explicit

S5 spends the structural confidence earned in the previous stories on small naming/API cleanup only. No behavior change, no new abstractions, no feature work.

## Done criterion

1. Internal production names align with the architecture vocabulary:
   - processor factories/types use `Processor` wording,
   - the entrypoint dependency bag names runtime-edge ownership clearly.
2. Imports across production code and tests read naturally after the S4 extraction.
3. No user-visible behavior changes.
4. `pnpm run verify:fast` and `pnpm test:live` stay green.
5. `CVx.E3` can close with no vague “polish later” note left for this lane.

## Scope

**In scope:**

1. Renaming internal production exports/types/functions where the new architecture made the better name obvious.
2. Updating test imports and helper names to match.
3. Small doc touch-ups where the old names were spelled out.

**Out of scope:**

1. New abstractions or new modules whose only job is to host renamed symbols.
2. Feature work.
3. Revisiting the architecture map again beyond keeping it truthful.
4. Generic repo-wide naming cleanup outside the pi-fence runtime lane.

## Plan

### Deliverables

#### 1. Processor vocabulary wins over renderer vocabulary

Expected target examples:

1. `createKrokiProcessor`
2. `createGraphvizLocalProcessor`
3. any associated type aliases updated to match

If a compatibility alias is cheap and reduces churn, it is acceptable, but the internal call sites and tests should prefer the processor names.

#### 2. Entrypoint dependency bag names runtime-edge ownership clearly

Expected target:

- `PiFenceRuntimeDeps` (or equivalent) replaces `PiFenceDeps`

The name should tell a reader that these are concrete runtime seams provided at the edge.

#### 3. Small helper-name cleanup only where it lowers cognitive load

Examples allowed:

1. helper names in extracted S4 modules if the post-split responsibility is now obvious
2. comments/docstrings updated to match the new names

No broad sweep beyond that.

### Implementation order

| Step | Layer | What | Commit |
|------|-------|------|--------|
| 1 | spec | Create the S5 story file and link it from `cvx-e3--refactor-confidence.md`. | `spec CVx.E3.S5` |
| 2 | code | Rename internal processor/entrypoint APIs to match the boundary vocabulary. | `step 1: align internal names with the processor architecture` |
| 3 | docs | Refresh any architecture/story wording that spells the old names explicitly. | `step 2: keep the docs aligned with the renamed APIs` |
| 4 | close | Mark S5 done and close CVx.E3 if all stories are now complete. | `close CVx.E3.S5` |

## Tests

1. **Layers touched:**
   - **Unit** / **Contract** / **Extension** — import fallout only; behavior coverage should stay the same.
   - **Integration / live** — rerun because the renamed factories are still the live entrypoints.
2. **Events / interactions covered:** same as before; naming only.
3. **Fakes added:** none.
4. **Live tests added / updated:** none expected.
5. **Deferred:** none for `CVx.E3`; this is the cleanup story that spends the remaining polish budget.

## Verification

```bash
pnpm run verify:fast
pnpm test:live
```

## Key files

- `extensions/pi-fence/index.ts`
- `extensions/pi-fence/kroki.ts`
- `extensions/pi-fence/graphviz-local.ts`
- extracted S4 modules as needed
- tests importing those symbols
- roadmap/worklog files at close
