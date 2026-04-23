# CV2.E2.S2 — Kroki auto-starts when the session starts (opt-in)

**Status:** Not done

**Epic:** [CV2.E2 — Kroki via Docker](cv2-e2--kroki-via-docker.md)
**Depends on:** [CV2.E2.S1](cv2-e2-s1--kroki-docker-commands.md)
**Date:** 2026-04-22 (stub — spec deferred until S1 ships)

## Summary

With `kroki.docker.autoStart: true` in the config, pi-fence starts the Docker Kroki container automatically on session init if it's not already running. Saves the user from typing `/fence kroki start` every session.
