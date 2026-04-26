# CV9.E1.S3 — Blocked tags and processors

**Status:** Ready

**Epic:** [CV9.E1 — Policy-driven Resolution](cv9-e1--policy-driven-resolution.md)
**Date:** 2026-04-25 (spec)

## Summary

Add explicit block policy for tag families and processor ids. Blocking is stronger than precedence, bindings, and any future LLM-authored fenced metadata.

Config shape:

```json
{
  "blocked": {
    "tags": ["qr", "graphviz"],
    "processors": ["kroki-remote"]
  }
}
```

`blocked.processors` replaces the older top-level `disabled` concept. No migration/backward compatibility is required.

## Done criterion

1. Config validates and merges `blocked.tags` and `blocked.processors`.
2. Top-level `disabled` is no longer part of the documented config model.
3. A blocked processor id is never eligible, even if a binding names it.
4. A blocked tag family is never rendered, even if a binding names an eligible processor.
5. `blocked.tags` accepts canonical or alias tag names and blocks the canonical family.
6. Blocking `graphviz` blocks both `graphviz` and `dot`; blocking `dot` also blocks the `graphviz` family.
7. There is no raw-tag-only blocking in this story.
8. `/fence list` and `/fence doctor` surface blocked processors/tags and ignored bindings caused by blocking.
9. Extension tests prove blocked tags leave the raw fence alone and produce no render message.
10. `pnpm run feedback` passes.

## Scope

**In scope:**

1. `blocked` config validation/merge/defaults.
2. Resolver filtering and trace outcomes for blocked tag and blocked processor.
3. Canonical tag-family normalization using registered processor aliases.
4. Command/list/doctor diagnostics.
5. Replacement of existing `disabled` terminology in production code and docs touched by this story.

**Out of scope:**

1. Raw tag-only block semantics such as blocking `dot` while allowing `graphviz`.
2. Per-project migration of old `disabled` config.
3. Sandbox-specific block controls.
4. Processor factory discovery.

## Plan

| Step | TDD phase | Layer | What | Commit |
|------|-----------|-------|------|--------|
| 1 | red | Unit | Add config tests for default empty `blocked`, valid arrays, invalid values, and merge replacement semantics. | `step 1: blocked config` |
| 2 | green/refactor | Unit | Add `blocked` config model and remove production use of top-level `disabled`. | same |
| 3 | red | Unit | Add resolver tests for blocked processor, blocked canonical tag, blocked alias tag, and binding-to-blocked-processor diagnostics. | `step 2: blocked resolver policy` |
| 4 | green/refactor | Unit | Apply block policy before binding constraints and placement selection; add canonical tag-family helper. | same |
| 5 | red | Extension/command | Add extension tests proving blocked tag emits no `pi-fence:output`; add `/fence list` or `/fence doctor` assertions for blocked policy. | `step 3: blocked diagnostics` |
| 6 | green/refactor | Extension/render | Thread blocked policy through `index.ts`, `agent-end.ts`, command details, and renderer lines. | same |
| 7 | verify | All fast | Run `pnpm run feedback`, then `pnpm run inspect`. | same |

## Tests

1. **Layers touched:**
   - **Unit** — config validation, tag canonicalization, resolver block filtering, diagnostics.
   - **Extension** — blocked tag/processor behavior with real config files.
   - **Render** — only if visible `/fence list`/doctor output changes require viewport assertions.
2. **Events / interactions covered:**
   - Processor block overrides exact processor binding.
   - Tag block overrides exact processor binding.
   - Alias and canonical tag names block the same family.
   - Blocked tags produce no render message and no HTTP/shell call.
3. **Fakes added:** none expected.
4. **Live tests:** none; no processor I/O seam changes.
5. **Deferred:** raw-tag-only blocking remains out of scope until a user asks for it.

## Verification

```bash
pnpm run feedback
pnpm run inspect
```
