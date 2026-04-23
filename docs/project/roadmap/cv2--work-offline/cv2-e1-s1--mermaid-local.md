# CV2.E1.S1 — Mermaid local via mmdc

**Status:** Done

**Epic:** [CV2.E1 — Mermaid Local](cv2-e1--mermaid-local.md)
**Date:** 2026-04-22 (spec)

## Summary

A new `mermaid-local` processor shells out to `mmdc` (the Mermaid CLI, `@mermaid-js/mermaid-cli`). When `mmdc` is on PATH, `mermaid` blocks render locally — diagram source never leaves the host. When `mmdc` is absent, the extension falls through to Kroki as before.

## Done criterion

With `mmdc` installed (`npm i -g @mermaid-js/mermaid-cli`), a mermaid block renders via the local binary. `/fence list` shows `mermaid-local [registered]` ahead of `kroki`. Without `mmdc`, `/fence list` shows `mermaid-local [unavailable]` and mermaid blocks still render via Kroki.

## Scope

**In scope:**

- New `mermaid-local.ts` processor implementing `FenceProcessor`.
- `available()`: `mmdc --version` exits 0 → ok; otherwise → unavailable with install hint.
- `render(tag, source, signal)`: writes source to a temp file, runs `mmdc -i <tmp>.mmd -o <tmp>.png -b transparent`, reads the output PNG. Temp files cleaned up after render.
- Registration order: `graphviz-local`, `mermaid-local`, `kroki`. Mermaid-local wins `mermaid` when available; Kroki still covers every other tag.
- Tags: `["mermaid"]`, aliases: `{}`.
- Contract test for the processor.
- Unit tests with FakeShellRunner.
- Live test with real `mmdc` (skips when absent).

**Out of scope:**

- Theme-aware rendering (Mermaid's `--theme dark`). Future story.
- Config for mmdc path or arguments. Future.
- Puppeteer/Chromium management. `mmdc` handles that internally.

## Plan

| Step | Layer | What |
|------|-------|------|
| 1 | unit + impl | `mermaid-local.ts`: processor factory, available(), render() |
| 2 | contract | Contract test with FakeShellRunner |
| 3 | extension | Full pipeline: mermaid-local wins mermaid when available |
| 4 | integration | Live test with real mmdc (skipIf absent) |
| 5 | docs | getting-started, kroki-support, CHANGELOG |

## Tests

- **Unit**: available() probe, render happy/error/abort paths via FakeShellRunner.
- **Contract**: `runFenceProcessorContract` with canned shell responses.
- **Extension**: mermaid block → mermaid-local when mmdc on PATH, fallback to Kroki when not.
- **Live**: real mmdc rendering (skips cleanly when absent).

## Key files

**New:** `extensions/pi-fence/mermaid-local.ts`, `tests/contract/mermaid-local.contract.test.ts`, `tests/integration/mermaid-local.live.test.ts`.

**Modified:** `extensions/pi-fence/index.ts` (register processor), `tests/unit/` (new test file or inline), `tests/extension/pi-fence.test.ts`, docs.
