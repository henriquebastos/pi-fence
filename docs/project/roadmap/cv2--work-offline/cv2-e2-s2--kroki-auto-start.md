# CV2.E2.S2 — Kroki auto-starts when the session starts (opt-in)

**Status:** In progress

**Epic:** [CV2.E2 — Kroki via Docker](cv2-e2--kroki-via-docker.md)
**Depends on:** [CV2.E2.S1](cv2-e2-s1--kroki-docker-commands.md)
**Date:** 2026-04-22 (spec)

## Summary

With `kroki.docker.autoStart: true` in the config, pi-fence starts the Docker Kroki container automatically on session init if it's not already running. Saves the user from typing `/fence kroki start` every session.

## Done criterion

The user adds `{"kroki": {"docker": {"autoStart": true}}}` to their config. On session start, if the `pi-fence-kroki` container is not running, pi-fence calls `dockerMgr.start()` and sets the endpoint to `http://localhost:8000`. If already running, no-op. If Docker is absent, logs a warn and continues.

## Scope

**In scope:**

- Config key `kroki.docker.autoStart?: boolean`. Default: `false`.
- On extension init (`createPiFenceExtension`), if `autoStart` is true, check status and start if needed.
- Unit test for config validation.
- Extension test: autoStart true → container started; autoStart false → no docker calls.

**Out of scope:**

- Auto-stop on session end (container stays running for the next session).
- Custom image/port.

## Plan

| Step | Layer | What |
|------|-------|------|
| 1 | unit + impl | Config: `kroki.docker.autoStart` validation |
| 2 | unit + impl | Wire auto-start in `createPiFenceExtension` |
| 3 | docs | getting-started, CHANGELOG |

## Tests

- **Unit** (`config.test.ts`): validation of `kroki.docker.autoStart`.
- **Unit** (`fence-command.test.ts` or inline): auto-start calls docker manager when config is true.
- **Extension**: auto-start true → docker inspect + run called.

## Key files

**Modified:** `extensions/pi-fence/config.ts`, `extensions/pi-fence/index.ts`, tests, docs.
