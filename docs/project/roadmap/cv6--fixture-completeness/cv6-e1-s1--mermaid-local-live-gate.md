# CV6.E1.S1 — Mermaid-local live integration test

**Status:** Ready

**Epic:** [CV6.E1 — Mermaid-local Fixtures](cv6-e1--mermaid-local-fixtures.md)
**Date:** 2026-04-25 (spec)

## Summary

The `mermaid-local` processor has unit and contract tests via `FakeShellRunner`, but no live integration test with a real `mmdc` binary. Every fake must have a sibling live test (principles.md). This story closes that gap: install `mmdc` in the `pi-fence-live-deps` Docker image and add a live test that renders a canonical Mermaid source through the real binary.

## Done criterion

1. The `pi-fence-live-deps` Docker image includes `@mermaid-js/mermaid-cli` (`mmdc`) and its Chromium runtime dependencies.
2. `pnpm live:build` builds the updated image.
3. `tests/integration/mermaid-local.live.test.ts` renders at least one canonical Mermaid source via `DockerExecShellRunner` → `mmdc` → PNG.
4. The live test asserts valid PNG (magic bytes, non-trivial byte count).
5. The live test skips cleanly when the container is not running.
6. `pnpm test:live` includes the new test and passes.
7. `pnpm run feedback` stays green (the new test is live-only, fast suite unaffected).

## Scope

**In scope:**

1. Updating `docker/Dockerfile` to install `@mermaid-js/mermaid-cli` and Chromium headless dependencies.
2. Writing `tests/integration/mermaid-local.live.test.ts`.
3. Reusing `DockerExecShellRunner` and `hasContainer` from `tests/utilities/`.

**Out of scope:**

1. Fixture capture and replay — that's S2.
2. Multiple Mermaid diagram types in the live test — one canonical source is enough for the live gate. The fast suite already covers wiring through the fake.
3. Puppeteer configuration tuning — `mmdc` ships its own bundled/managed Chromium.

## Plan

### Design

**Docker image change:**

```dockerfile
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       graphviz \
       ca-certificates \
       # Chromium headless deps for mermaid-cli
       chromium \
    && npm install -g @mermaid-js/mermaid-cli \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
```

`mmdc` uses Puppeteer internally. Setting `PUPPETEER_EXECUTABLE_PATH` to the system Chromium avoids a second download inside the container.

**Live test shape:**

```typescript
describe.skipIf(!containerRunning)("mermaid-local — live", () => {
  it("renders a flowchart to valid PNG via mmdc", async () => {
    const shell = new DockerExecShellRunner(CONTAINER);
    const proc = createMermaidLocalProcessor(shell);

    const avail = await proc.available();
    expect(avail.ok).toBe(true);

    const result = await proc.render("mermaid", CANONICAL_SOURCE);
    expect(result.ok).toBe(true);
    // ... assert PNG magic bytes, non-trivial size
  });
});
```

The test reuses the same `createMermaidLocalProcessor` factory as unit tests, just wired to the real shell runner. The canonical source is a minimal flowchart (`flowchart LR\n  A --> B`).

**Temp-file concern:** `mermaid-local.ts` writes a temp `.mmd` file and reads the output `.png` from `os.tmpdir()`. Inside the Docker container, this maps to `/tmp` which is writable. `DockerExecShellRunner` needs to handle the file-based workflow — the existing graphviz live test uses stdin/stdout piping, but `mmdc` requires files. Two options:

1. **Write source via `docker exec sh -c 'cat > /tmp/in.mmd'` + run `mmdc` + read output via `docker exec cat /tmp/out.png`.** Explicit, no processor change needed.
2. **Extend `DockerExecShellRunner`** to support the `input` option (stdin piping) that `mmdc` doesn't use anyway — not helpful here.

Option 1 is simpler. The live test orchestrates the file dance directly rather than going through `createMermaidLocalProcessor`, which assumes local filesystem access. This is the same pattern as a shell integration test: verify the binary works, not the processor's temp-file wiring (which the unit test already covers via `FakeShellRunner`).

### Implementation order

| Step | Layer | What | Commit |
|------|-------|------|--------|
| 1 | spec | CV6 roadmap artifacts. | `spec CV6.E1.S1` |
| 2 | infra + test | Update Dockerfile, add live test. | `step 1: mermaid-local live integration test` |
| 3 | close | Verify, close story. | `close CV6.E1.S1` |

## Tests

1. **Layers touched:**
   - **Integration (live)** — new `tests/integration/mermaid-local.live.test.ts`.
2. **Events / interactions covered:**
   - `mmdc --version` returns a version string (availability probe).
   - `mmdc -i <file> -o <file> -b transparent` produces valid PNG from canonical Mermaid source.
   - Container-absent path skips cleanly.
3. **Fakes added:** none — this is the live gate.
4. **Live tests added:** `tests/integration/mermaid-local.live.test.ts`.
5. **Deferred:** multiple diagram types in the live test; fixture capture (S2).

## Verification

```bash
pnpm live:build                # rebuild Docker image with mmdc
pnpm live:up                   # start container
pnpm test:live                 # includes new mermaid-local live test
pnpm run feedback              # fast gate unaffected
```

## Key files

- `docker/Dockerfile`
- `tests/integration/mermaid-local.live.test.ts` (new)
- `tests/utilities/shell-runner.ts` (existing `DockerExecShellRunner`)
- `tests/utilities/live-deps.ts` (existing `hasContainer`)
