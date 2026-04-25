# CV6.E1.S2 — Mermaid-local fixture capture and replay

**Status:** Draft

**Epic:** [CV6.E1 — Mermaid-local Fixtures](cv6-e1--mermaid-local-fixtures.md)
**Date:** 2026-04-25 (spec)

## Summary

S1 proves `mmdc` works inside the Docker container. This story adds `mermaid-local` as a fixture set in `refresh-fixtures.ts`, captures real `mmdc` output as committed PNG fixtures, and extends the fast-suite fixture-replay test to replay them through `FakeShellRunner`.

Follows the exact pattern CVx.E6.S1 established for `kroki` and `graphviz`.

## Done criterion

1. `pnpm refresh-fixtures mermaid-local` runs `mmdc` via `DockerExecShellRunner` for the canonical Mermaid source and writes the PNG to `tests/fixtures/live/mermaid-local/mermaid.png`.
2. `pnpm refresh-fixtures` (no argument) includes `mermaid-local` alongside `kroki` and `graphviz`.
3. The manifest gains a `mermaid-local` entry with `processor`, `tag`, `file`, `bytes`, `sha256`.
4. `tests/unit/fixture-replay.test.ts` gains a `mermaid-local fixture replay` section that programs `FakeShellRunner` with the committed PNG and asserts `createMermaidLocalProcessor` passes it through.
5. Committed fixture files exist after the first refresh.
6. `pnpm refresh-fixtures mermaid-local` skips cleanly (exit 0) when the container is not running.
7. `pnpm run feedback` stays green.

## Scope

**In scope:**

1. Adding a `refreshMermaidLocal()` function to `scripts/refresh-fixtures.ts`.
2. Registering `mermaid-local` in `KNOWN_SETS`.
3. Writing fixtures to `tests/fixtures/live/mermaid-local/`.
4. Extending `fixture-replay.test.ts` with mermaid-local replay cases.
5. Committing the initial fixture set.

**Out of scope:**

1. Multiple Mermaid diagram types — one canonical flowchart is enough. The fast suite covers wiring; the fixture grounds it in real output.
2. Staleness detection — that's E2.

## Plan

### Design

**Refresh logic:**

```typescript
async function refreshMermaidLocal(): Promise<FixtureEntry[]> {
  const containerRunning = await hasContainer(CONTAINER);
  if (!containerRunning) {
    process.stderr.write("  mermaid-local: SKIP (container not running)\n");
    return [];
  }

  const shell = new DockerExecShellRunner(CONTAINER);
  // Write source → docker exec mmdc → read PNG
  // Same file-dance as the live test in S1
}
```

**Fixture layout:**

```text
tests/fixtures/live/
├── manifest.json
├── kroki/          (existing)
├── graphviz/       (existing)
└── mermaid-local/
    └── mermaid.png
```

**Replay logic:** Same as the graphviz replay — program `FakeShellRunner` with the committed PNG bytes, call `createMermaidLocalProcessor(shell).render("mermaid", source)`, assert exact byte match.

### Implementation order

| Step | Layer | What | Commit |
|------|-------|------|--------|
| 1 | tooling + test | Extend `refresh-fixtures.ts` + `fixture-replay.test.ts`. | `step 1: mermaid-local fixture capture and replay` |
| 2 | fixtures | Run `pnpm refresh-fixtures mermaid-local`, commit fixtures. | `step 2: commit mermaid-local fixtures` |
| 3 | close | Verify, close story + epic. | `close CV6.E1.S2` |

## Tests

1. **Layers touched:**
   - **Unit** — extended `tests/unit/fixture-replay.test.ts`.
2. **Events / interactions covered:**
   - Committed mermaid-local fixture replays through `FakeShellRunner` → `createMermaidLocalProcessor` → `render()` → PNG bytes match.
   - Manifest integrity for the new entry (bytes, SHA-256).
3. **Fakes added:** none new — reuses `FakeShellRunner`.
4. **Live tests added:** none — the live gate is S1; fixture capture is a manual/CI action.
5. **Deferred:** multiple diagram types, staleness detection (E2).

## Verification

```bash
pnpm live:up                       # ensure container running
pnpm refresh-fixtures mermaid-local
pnpm test                          # fixture-replay includes mermaid-local
pnpm run feedback
```

## Key files

- `scripts/refresh-fixtures.ts`
- `tests/fixtures/live/manifest.json`
- `tests/fixtures/live/mermaid-local/mermaid.png` (new)
- `tests/unit/fixture-replay.test.ts`
