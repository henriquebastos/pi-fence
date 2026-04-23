# CV2.E2.S1 — Start/stop Kroki in Docker through pi-fence commands

**Status:** Draft

**Epic:** [CV2.E2 — Kroki via Docker](cv2-e2--kroki-via-docker.md)
**Date:** 2026-04-22 (spec)

## Summary

`/fence kroki start` pulls and starts a local Kroki Docker container. `/fence kroki stop` stops and removes it. The user gets a fully offline Kroki with two commands — no manual Docker wrangling.

## Done criterion

1. `/fence kroki start` → runs `docker run -d --name pi-fence-kroki -p 8000:8000 yuzutech/kroki`, sets `kroki.endpoint` to `http://localhost:8000` for the session, and confirms with a notification.
2. `/fence kroki stop` → runs `docker stop pi-fence-kroki && docker rm pi-fence-kroki` and reverts the endpoint.
3. `/fence kroki status` → reports running/stopped/absent.
4. All three are offline — they shell out to the `docker` CLI, no HTTP.

## Scope

**In scope:**

- Three new subcommands on `/fence`: `kroki start`, `kroki stop`, `kroki status`.
- Shell out to `docker` via the `ShellRunner` DI seam.
- Container name: `pi-fence-kroki`. Port: 8000. Image: `yuzutech/kroki`.
- On `start`: auto-set `kroki.endpoint` for the current session (in-memory, not persisted to config file).
- On `stop`: revert endpoint to config-file value or default.
- Unit tests with FakeShellRunner for the docker commands.
- Extension test through AgentSession.

**Out of scope:**

- Persisting the endpoint change to config file. This is a session-scoped override.
- Custom port/image configuration. Future story.
- Docker Compose for multi-backend Kroki (needed for SVG-only languages). Future.
- Health-check / wait-for-ready after `docker run`. The container starts fast; first render surfaces any startup delay as a transient error.

## Plan

| Step | Layer | What |
|------|-------|------|
| 1 | unit + impl | Docker Kroki manager: start/stop/status via ShellRunner |
| 2 | unit + impl | `/fence kroki` subcommand routing |
| 3 | extension | Extension test: start/stop/status through AgentSession |
| 4 | docs | getting-started, CHANGELOG |

## Tests

- **Unit**: Docker manager start/stop/status with FakeShellRunner.
- **Extension**: `/fence kroki start` → notification + endpoint override; `/fence kroki stop` → revert.
- **Live**: None (would require Docker-in-Docker; not worth the complexity).

## Key files

**New:** `extensions/pi-fence/kroki-docker.ts`.
**Modified:** `extensions/pi-fence/command.ts`, `extensions/pi-fence/index.ts`, tests, docs.
