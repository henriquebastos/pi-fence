# CV7 — Companion Backends

> Languages whose Kroki backend is unavailable on the public endpoint render when the user runs self-hosted Kroki with companion containers.

**Type:** `legibility`
**Status:** not started

Kroki's public endpoint at `kroki.io` does not wire bpmn, excalidraw, or diagramsnet — requests return ECONNREFUSED. These backends run as separate Node.js micro-services (companion containers) that the Kroki gateway proxies to. Users who run the full stack via Docker Compose get all three.

pi-fence already manages a single `yuzutech/kroki` container (`/fence kroki start`). This CV ships a Compose stack with companion containers and registers the three blocked tags.

This CV is done when every Story in its Epics is done.

## Epics

| Code | Epic | State |
|------|------|-------|
| [CV7.E1](cv7-e1--kroki-compose-stack.md) | **Kroki Compose Stack** | Not started |
| [CV7.E2](cv7-e2--blocked-backend-tags.md) | **Blocked Backend Tags** | Not started |
