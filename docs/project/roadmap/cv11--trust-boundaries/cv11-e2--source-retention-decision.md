# CV11.E2 — Source Retention Decision

**CV:** [CV11 — Trust Boundaries](README.md)
**Last updated:** 2026-04-29 — planned

## Summary

Decide, with evidence, whether pi-fence custom messages should keep the full fenced source in `details`, keep only a clipped preview, keep a hash/reference, or omit source entirely.

The current behavior duplicates raw fence source in the assistant text and in the custom message details so expanded renders can show copyable source. That may be correct, but the repo should not harden message/result types or render limits before knowing how pi persists and exposes custom message details.

## Stories

| Code | Story | Status |
|------|-------|--------|
| [S1](cv11-e2-s1--custom-message-source-retention-spike.md) | **Custom-message source retention spike** | Ready |

## Done criterion (epic-level)

1. The implementation reads pi source, not compiled `node_modules`, to determine how custom message `details` are stored, rendered, exported, and compacted.
2. The decision compares full source, clipped preview, hash/reference, and no-source approaches.
3. The chosen behavior is recorded in `docs/project/decisions.md` before implementation stories depend on it.
4. Follow-up implementation work is either confirmed as already-safe or added to CV11.E3/E5 scope.
5. `pnpm run lint:markdown` passes after any docs changes.
