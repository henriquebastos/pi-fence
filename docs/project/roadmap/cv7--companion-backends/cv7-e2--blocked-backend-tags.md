# CV7.E2 — Blocked Backend Tags

**Roadmap:** [CV7](README.md)
**Last updated:** 2026-04-25 — spec

With the compose stack from E1, the Kroki gateway can reach the bpmn, excalidraw, and diagramsnet companion services. This epic registers the three tags, verifies their output format, and wires them into the test infrastructure.

## Stories

| Code | Story | Status |
|------|-------|--------|
| [S1](cv7-e2-s1--register-companion-tags.md) | **Register bpmn, excalidraw, and diagramsnet tags** | Draft |

## Done criterion (epic-level)

1. `bpmn`, `excalidraw`, and `diagramsnet` appear in `KROKI_CANONICAL_TAGS` and render via the compose stack.
2. Each tag has a canonical source in `tests/fixtures/kroki/canonical-sources.ts`.
3. Live tests verify all three tags against the compose stack.
4. `kroki-support.md` moves the tags from "backend unavailable" to "requires self-hosted Kroki with companions".
5. `/fence list` shows the tags (available only when endpoint serves them).
