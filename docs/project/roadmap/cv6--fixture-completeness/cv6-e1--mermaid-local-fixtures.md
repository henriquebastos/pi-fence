# CV6.E1 — Mermaid-local Fixtures

**Roadmap:** [CV6](README.md)
**Last updated:** 2026-04-25 — spec

CVx.E6 established the fixture-capture-and-replay pattern for `kroki` and `graphviz-local`. The `mermaid-local` processor was explicitly deferred ("add when the pattern proves itself"). The pattern proved itself — this epic extends it to cover `mermaid-local`.

Prerequisites: `mmdc` must be available inside the `pi-fence-live-deps` Docker container. Today the image carries only `graphviz`.

## Stories

| Code | Story | Status |
|------|-------|--------|
| [S1](cv6-e1-s1--mermaid-local-live-gate.md) | **Mermaid-local live integration test** | Ready |
| [S2](cv6-e1-s2--mermaid-local-fixture-set.md) | **Mermaid-local fixture capture and replay** | Draft |

## Done criterion (epic-level)

1. The `pi-fence-live-deps` Docker image includes `mmdc` and renders Mermaid sources to PNG.
2. A live integration test verifies `mermaid-local` against `mmdc` in the container.
3. `pnpm refresh-fixtures mermaid-local` captures real `mmdc` output as committed fixtures.
4. The fast-suite fixture-replay test replays mermaid-local fixtures through `FakeShellRunner`.
