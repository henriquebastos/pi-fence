# CV4.E2.S1 — /fence trace — resolution trace

**Status:** Done

**Epic:** [CV4.E2 — Observability](cv4-e2--observability.md)
**Date:** 2026-04-23 (spec)

## Summary

`/fence trace <tag>` shows the step-by-step processor resolution for a given tag: which processors claim it, their availability, binding overrides, disabled state, and which one wins. Helps users and extension authors debug why a block renders via one processor instead of another.

## Done criterion

`/fence trace mermaid` outputs a human-readable resolution trace showing each candidate processor, its status, and why it was selected or skipped. Displayed via a `pi-fence:list` custom message (reusing the existing list renderer).

## Scope

**In scope:**

- New `trace.ts` module: `traceResolution(processors, availability, tag, bindings, disabled)` returns a structured trace.
- Each trace step: processor id, claims tag (yes/no), available (yes/no), disabled (yes/no), bound (yes/no), outcome (selected/skipped + reason).
- `formatTraceLines(trace)` renders the trace as human-readable text lines.
- `/fence trace <tag>` subcommand routed from the existing `/fence` command handler.
- Unit tests for `traceResolution` and `formatTraceLines`.
- Extension test: `/fence trace mermaid` emits a list message with trace lines.

**Out of scope:**

- Trace for every tag at once (batch trace). Future.
- Machine-readable trace output (JSON). Future.

## Plan

| Step | Layer | What |
|------|-------|------|
| 1 | unit + impl | `trace.ts`: traceResolution(), formatTraceLines() |
| 2 | impl + extension | Wire `/fence trace` subcommand; extension test |

## Tests

- **Unit (step 1):** Trace with one available processor (selected). Trace with multiple candidates (first available wins). Binding overrides. Disabled processor skipped. Unknown tag (no candidates).
- **Extension (step 2):** `/fence trace mermaid` emits a pi-fence:list message with trace text.
- **Fakes:** none.
- **Live:** none.

## Key files

**New:** `extensions/pi-fence/trace.ts`, `tests/unit/trace.test.ts`.

**Modified:** `extensions/pi-fence/command.ts` (subcommand routing), `tests/extension/pi-fence.test.ts`.
