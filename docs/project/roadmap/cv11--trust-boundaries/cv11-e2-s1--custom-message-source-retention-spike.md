# CV11.E2.S1 — Custom-message source retention spike

**Status:** Done

**Epic:** [CV11.E2 — Source Retention Decision](cv11-e2--source-retention-decision.md)
**Depends on:** [CV11.E1 — Installed Runtime Trust](cv11-e1--installed-runtime-trust.md)
**Date:** 2026-04-29 (spec)

## Summary

Decide whether pi-fence should keep full raw fence source in custom message `details`. Current behavior supports expanded copy/paste but duplicates data that may already exist in the assistant turn. Before changing message/result types or render limits, inspect pi's real persistence/rendering behavior and record a decision.

## Done criterion

1. Read pi source from `~/me/oss/pi-mono` on `upstream/main`, not compiled `node_modules`.
2. Record the `upstream/main` SHA read.
3. Determine whether custom message `details` are persisted, logged, exported, compacted, or otherwise exposed differently from normal assistant text.
4. Compare four options: full source, clipped preview, hash/reference, and no source.
5. Record the chosen behavior in `docs/project/decisions.md` with rationale and rejected alternatives.
6. Create or update follow-up CV11 story scope if the decision changes implementation requirements.
7. `pnpm run lint:markdown` passes.

## Scope

**In scope:**

1. Source reading and analysis only.
2. A decision entry in `docs/project/decisions.md`.
3. Minimal roadmap adjustment if the decision changes CV11.E3/E5 assumptions.

**Out of scope:**

1. Changing `messages.ts` or `renderer.ts` implementation in this spike.
2. Changing persistence behavior in pi itself.
3. Adding render limits.

## Plan

1. Fetch pi source:

   ```bash
   cd ~/me/oss/pi-mono && git fetch --all && git rev-parse upstream/main
   ```

2. Search source:

   ```bash
   git grep -n "customType\|details\|sendMessage\|CustomMessage" upstream/main -- packages/pi-coding-agent packages/pi-tui
   ```

3. Read the relevant files fully enough to answer:
   - where `details` are stored;
   - whether `details` reach session JSONL/logs/export;
   - whether compacted messages preserve details;
   - whether a renderer can access original assistant text without details.
4. Compare options in a short decision matrix.
5. Write the decision entry.

## Tests

1. **Layers touched:** docs/process only.
2. **Events / interactions covered:** none; this is a spike.
3. **Fakes added:** none.
4. **Live tests:** none.
5. **Deferred:** implementation of the chosen retention behavior.

## Verification

```bash
pnpm run lint:markdown
```

## Key files

- `docs/project/decisions.md`
- `extensions/pi-fence/messages.ts` (read only during spike)
- `extensions/pi-fence/renderer.ts` (read only during spike)
- `~/me/oss/pi-mono/packages/pi-coding-agent/...` (read only)
- `~/me/oss/pi-mono/packages/pi-tui/...` (read only)
