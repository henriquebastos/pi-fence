# CV4.E2.S2 — Usage metrics

**Status:** Draft

**Epic:** [CV4.E2 — Observability](cv4-e2--observability.md)
**Date:** 2026-04-23 (spec)

## Summary

pi-fence tracks per-session usage metrics — render count, error count, per-processor and per-tag breakdowns — and surfaces them via `/fence stats`. Extension authors and users can see which processors are active and how they're performing.

## Done criterion

`/fence stats` outputs render count, error count, and per-processor/per-tag breakdowns for the current session. Metrics accumulate from session start and reset on `/reload`.

## Scope

**In scope:**

- New `metrics.ts` module: `MetricsCollector` class with `recordRender(processorId, tag, ok)` and `getSummary()`.
- `getSummary()` returns `{ total, ok, errors, byProcessor, byTag }`.
- `agent-end.ts` calls `recordRender()` after each render.
- `/fence stats` subcommand displays the summary.
- Unit tests for MetricsCollector.
- Extension test: render a block, then `/fence stats` shows the count.

**Out of scope:**

- Persistent metrics across sessions. Future.
- Cache hit tracking. Future (no cache exists yet).
- Timing metrics (render latency). Future.

## Plan

| Step | Layer | What |
|------|-------|------|
| 1 | unit + impl | `metrics.ts`: MetricsCollector class |
| 2 | impl + extension | Wire metrics into agent-end + /fence stats; extension test |

## Tests

- **Unit (step 1):** Record renders, check summary totals and breakdowns. Empty state.
- **Extension (step 2):** Render a block, `/fence stats` shows 1 render.
- **Fakes:** none.
- **Live:** none.

## Key files

**New:** `extensions/pi-fence/metrics.ts`, `tests/unit/metrics.test.ts`.

**Modified:** `extensions/pi-fence/agent-end.ts` (record), `extensions/pi-fence/command.ts` (/fence stats), `extensions/pi-fence/index.ts` (wire), `tests/extension/pi-fence.test.ts`.
