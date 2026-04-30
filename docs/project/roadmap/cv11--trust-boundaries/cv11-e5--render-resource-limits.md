# CV11.E5 — Render Resource Limits

**CV:** [CV11 — Trust Boundaries](README.md)
**Last updated:** 2026-04-30 — S1 done

## Summary

Add source and output limits so a hostile or accidental large fenced block cannot turn count-limited rendering into unbounded memory or CPU work.

`MAX_BLOCKS_PER_TURN` limits block count, not bytes. This epic adds resolved render limits, visible oversize errors, capped HTTP/output handling, and per-processor expansion guards where needed.

## Stories

| Code | Story | Status |
|------|-------|--------|
| [S1](cv11-e5-s1--fence-source-and-output-limits.md) | **Fence source and output limits** | Done |
| [S2](cv11-e5-s2--processor-specific-expansion-limits.md) | **Processor-specific expansion limits** | Ready |

## Done criterion (epic-level)

1. Oversized fence source is rejected before processor invocation.
2. Oversized output is rejected with a visible pi-fence error rather than buffered or rendered unboundedly.
3. HTTP/Kroki response handling has a cap or a documented cap-enforcement point.
4. QR, table/JSONL, SVG rasterization, Mermaid, Graphviz, and bundle-sandbox expansion risks are either capped or explicitly deferred with reasons.
5. Limits are part of the resolved runtime policy from CV11.E3.
6. Metrics record limit failures if metrics are available.
7. Tests prove processors are not called on oversized input.
8. `pnpm run feedback` passes.
