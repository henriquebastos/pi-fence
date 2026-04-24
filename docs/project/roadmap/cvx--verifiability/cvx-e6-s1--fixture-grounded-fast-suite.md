# CVx.E6.S1 — Fixture-grounded fast suite

**Status:** Ready

**Epic:** [CVx.E6 — Live-derived Fixtures](cvx-e6--live-derived-fixtures.md)
**Date:** 2026-04-24 (spec)

## Summary

The fast suite uses hand-crafted fake responses: 2-byte PNGs, synthetic error strings, invented shell output. These are good enough for testing wiring, but they can drift from what the real services return. The live suite verifies real I/O but is slow and needs Docker/network.

A fixture-replay layer bridges the gap: `pnpm refresh-fixtures` captures real responses from Kroki and graphviz-local, commits them as fixture files, and a new fast-suite test replays those fixtures through the processor fakes. The fast suite gains real-world grounding; the live suite stays the source of truth; drift between them becomes visible.

## Done criterion

1. `pnpm refresh-fixtures kroki` hits `https://kroki.io` for every tag in `KROKI_TEXT_LANGUAGES` and writes real PNG bytes to `tests/fixtures/live/kroki/<tag>.png`.
2. `pnpm refresh-fixtures graphviz` runs `dot -Tpng` via `DockerExecShellRunner` for the canonical DOT source and writes the PNG to `tests/fixtures/live/graphviz/graphviz.png`.
3. `pnpm refresh-fixtures` (no argument) refreshes all fixture sets.
4. A manifest file (`tests/fixtures/live/manifest.json`) records per-fixture metadata: tag, processor, byte count, SHA-256, refresh timestamp.
5. A fast-suite test (`tests/unit/fixture-replay.test.ts`) loads committed fixtures and replays each through its processor via the appropriate fake, asserting the render result matches the committed bytes.
6. The fixture-replay test is part of `pnpm test` (fast suite) and needs no Docker/network.
7. `pnpm refresh-fixtures` skips cleanly (exit 0 with a message) when prerequisites are absent (no network for Kroki, no container for graphviz).
8. Committed fixture files exist in the repo after the first refresh and are checked in.
9. `pnpm run feedback` stays green.

## Scope

**In scope:**

1. Implementing `refresh` in `scripts/refresh-fixtures.ts` for `kroki` and `graphviz` fixture sets.
2. Writing fixture files under `tests/fixtures/live/`.
3. A manifest recording metadata for each fixture.
4. A fast-suite fixture-replay test that loads committed fixtures and replays through fakes.
5. Committing the initial fixture set produced by the first live refresh.

**Out of scope:**

1. Fixtures for processors that produce text output (table, highlight, color, qr) — these are pure-logic processors with no I/O seam; their fast-suite tests are already grounded.
2. Fixtures for mermaid-local — requires `mmdc` installed; add when the pattern proves itself on kroki + graphviz.
3. Automatic fixture staleness detection (e.g., CI job that re-refreshes and fails on diff). Future story.
4. Wiring fixture-replay into `pnpm run inspect`. The test runs in `pnpm test` already; `inspect` inherits it.
5. Changing existing unit/contract tests to use live-derived fixtures. The replay test is additive.

## Plan

### Design

**Fixture layout:**

```text
tests/fixtures/live/
├── manifest.json
├── kroki/
│   ├── mermaid.png
│   ├── graphviz.png
│   ├── plantuml.png
│   └── ... (one per KROKI_TEXT_LANGUAGES entry)
└── graphviz/
    └── graphviz.png
```

**Manifest shape:**

```json
{
  "refreshedAt": "2026-04-24T...",
  "fixtures": [
    {
      "processor": "kroki",
      "tag": "mermaid",
      "file": "kroki/mermaid.png",
      "bytes": 1234,
      "sha256": "abc..."
    }
  ]
}
```

**Refresh logic:**

1. For `kroki`: iterate `KROKI_TEXT_LANGUAGES`, POST each source to `https://kroki.io/<tag>/png`, write the response body to `tests/fixtures/live/kroki/<tag>.png`.
2. For `graphviz`: run `dot -Tpng` via `DockerExecShellRunner` with the canonical DOT source, write stdout to `tests/fixtures/live/graphviz/graphviz.png`.
3. Build manifest from the written files.

**Replay logic:**

1. Read `manifest.json`.
2. For each fixture entry, load the PNG bytes from the committed file.
3. Program the appropriate fake (`FakeHttpClient` for kroki, `FakeShellRunner` for graphviz) with those bytes.
4. Call `processor.render(tag, source)` through the fake.
5. Assert `result.ok === true` and the result PNG matches the committed fixture bytes.

### Implementation order

| Step | Layer | What | Commit |
|------|-------|------|--------|
| 1 | spec | Add `CVx.E6` + this story, reopen CVx. | `spec CVx.E6.S1` |
| 2 | tooling + test | Implement `refresh-fixtures` for kroki and graphviz; add the fixture-replay fast-suite test. | `step 1: fixture capture and replay for kroki and graphviz` |
| 3 | fixtures | Run `pnpm refresh-fixtures`, commit the initial fixture set. | `step 2: commit initial live-derived fixtures` |
| 4 | close | Verify, close story + epic + CV. | `close CVx.E6.S1` |

## Tests

1. **Layers touched:**
   - **Unit** — new `tests/unit/fixture-replay.test.ts` replaying committed fixtures through fakes.
   - **Utilities** — `refresh-fixtures.ts` script logic.
2. **Events / interactions covered:**
   - Each committed kroki fixture replays through `FakeHttpClient` → `createKrokiProcessor` → `render()` → PNG bytes match fixture.
   - Each committed graphviz fixture replays through `FakeShellRunner` → `createGraphvizLocalProcessor` → `render()` → PNG bytes match fixture.
   - Manifest integrity: byte counts and SHA-256 match committed files.
3. **Fakes added:** none new — reuses `FakeHttpClient` and `FakeShellRunner`.
4. **Live tests added / updated:** none — `refresh-fixtures` is a manual/CI action, not a test.
5. **Deferred:** mermaid-local fixtures, automatic staleness detection.

## Verification

```bash
pnpm refresh-fixtures          # capture fixtures (needs network + Docker)
pnpm test                      # fast suite includes fixture-replay
pnpm run feedback              # full gate
```

## Key files

- `scripts/refresh-fixtures.ts`
- `tests/fixtures/live/manifest.json`
- `tests/fixtures/live/kroki/*.png`
- `tests/fixtures/live/graphviz/*.png`
- `tests/unit/fixture-replay.test.ts`
