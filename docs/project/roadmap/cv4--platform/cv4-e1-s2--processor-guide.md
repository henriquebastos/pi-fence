# CV4.E1.S2 — "Write your own processor" guide

**Status:** Done

**Epic:** [CV4.E1 — Third-party Processors](cv4-e1--third-party-processors.md)
**Date:** 2026-04-23 (spec)

## Summary

A documented guide with a minimal working example shows how to write a third-party processor extension that registers with pi-fence via the event bus. The guide lives in `docs/guides/write-a-processor.md` and covers the FenceProcessor interface, the event bus protocol, and a complete example.

## Done criterion

`docs/guides/write-a-processor.md` exists, is linked from the getting-started page and the docs index, and contains a minimal working example that a reader can copy into a pi extension and run.

## Scope

**In scope:**

- New `docs/guides/write-a-processor.md` with:
  - The `FenceProcessor` interface (id, tags, aliases, available, render).
  - The `FenceResult` type (image and text variants).
  - The event bus registration protocol (`pi-fence:register`, `pi-fence:registered`, `pi-fence:register-error`).
  - A complete minimal example: an `uppercase` processor that uppercases its input.
  - Notes on availability probes and install hints.
  - Notes on registration timing (factory vs session_start).
- Link from `docs/getting-started.md` and `docs/README.md`.

**Out of scope:**

- Published npm package template. Future.
- TypeBox schema for the registration payload. Simple shape check is sufficient.

## Plan

| Step | Layer | What |
|------|-------|------|
| 1 | docs | Write the guide |
| 2 | docs | Link from getting-started and docs index |

## Tests

- **Docs only** — `pnpm run lint:markdown` verifies links and body.
- No code changes.

## Key files

**New:** `docs/guides/write-a-processor.md`.

**Modified:** `docs/getting-started.md`, `docs/README.md`.
