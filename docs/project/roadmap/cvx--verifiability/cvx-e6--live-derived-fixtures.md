# CVx.E6 — Live-derived Fixtures

**Roadmap:** [CVx](../README.md)
**Last updated:** 2026-04-24 — S1 Done

The fast suite uses hand-crafted fake responses. The live suite verifies real I/O but needs Docker/network. This Epic bridges the gap: capture real responses as committed fixtures and replay them in the fast suite so `pnpm test` has real-world grounding without external dependencies.

## Stories

| Code | Story | Status |
|------|-------|--------|
| [S1](cvx-e6-s1--fixture-grounded-fast-suite.md) | **Fixture capture and replay for kroki and graphviz-local** | ✅ Done |

## Done criterion (epic-level)

1. `pnpm refresh-fixtures` captures real PNG responses from Kroki and graphviz-local into committed fixture files.
2. A fast-suite test replays committed fixtures through processor fakes, catching drift without Docker/network.
3. The manifest records fixture metadata (bytes, SHA-256, timestamp) so staleness is inspectable.
