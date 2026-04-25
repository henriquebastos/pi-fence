# CV7.E1 — Kroki Compose Stack

**Roadmap:** [CV7](README.md)
**Last updated:** 2026-04-25 — spec

Today `kroki-docker.ts` manages a single `yuzutech/kroki` container via `docker run`. That covers all PNG-direct and SVG-only tags the public endpoint serves, but not the three backends that need companion containers (bpmn, excalidraw, diagramsnet).

This epic ships a `docker-compose.yml` and extends the lifecycle commands to manage the full stack.

## Stories

| Code | Story | Status |
|------|-------|--------|
| [S1](cv7-e1-s1--compose-lifecycle.md) | **Compose-based Kroki lifecycle** | Ready |

## Done criterion (epic-level)

1. A committed `docker/kroki-compose.yml` defines the full Kroki stack: gateway + bpmn + excalidraw + diagramsnet.
2. `/fence kroki start --full` starts the compose stack; `/fence kroki stop` tears it down.
3. The existing single-container path (`/fence kroki start`) is unchanged for users who don't need companions.
4. `kroki.docker.companions: true` in the config file triggers compose mode on auto-start.
5. Unit tests cover the compose lifecycle via `FakeShellRunner`.
