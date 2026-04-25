# CV7.E1.S1 — Compose-based Kroki lifecycle

**Status:** Ready

**Epic:** [CV7.E1 — Kroki Compose Stack](cv7-e1--kroki-compose-stack.md)
**Date:** 2026-04-25 (spec)

## Summary

Ship a `docker-compose.yml` for the full Kroki stack and extend the lifecycle management so users can start/stop it from pi-fence. The single-container path stays the default; compose mode activates explicitly via `/fence kroki start --full` or the config flag `kroki.docker.companions`.

Kroki's architecture: the gateway (`yuzutech/kroki`) proxies to companion micro-services via `KROKI_<LANG>_HOST` env vars. The compose file wires:

| Service | Image | Internal port |
|---------|-------|---------------|
| core | `yuzutech/kroki` | 8000 (published) |
| bpmn | `yuzutech/kroki-bpmn` | 8003 |
| excalidraw | `yuzutech/kroki-excalidraw` | 8004 |
| diagramsnet | `yuzutech/kroki-diagramsnet` | 8005 |

## Done criterion

1. `docker/kroki-compose.yml` defines the four services with the gateway published on port 8000.
2. A new `kroki-compose.ts` module (or extension of `kroki-docker.ts`) manages the compose stack via `docker compose -f <file> up -d` / `down`.
3. `/fence kroki start --full` starts the compose stack; `/fence kroki start` remains the single-container path.
4. `/fence kroki stop` detects which mode is active (compose vs. single container) and tears down the right one.
5. `/fence kroki status` reports whether the stack or the single container is running.
6. Config: `kroki.docker.companions: true` causes auto-start to use compose mode instead of single container.
7. The compose stack sets `KROKI_BPMN_HOST`, `KROKI_EXCALIDRAW_HOST`, `KROKI_DIAGRAMSNET_HOST` on the gateway service.
8. Unit tests exercise start/stop/status for compose mode via `FakeShellRunner`.
9. `pnpm run feedback` stays green.

## Scope

**In scope:**

1. `docker/kroki-compose.yml`.
2. Compose lifecycle module (`kroki-compose.ts`).
3. Extending `/fence kroki` subcommands to support `--full`.
4. Config schema extension: `kroki.docker.companions?: boolean`.
5. Unit tests for compose lifecycle via `FakeShellRunner`.

**Out of scope:**

1. Registering the new tags — that's E2.
2. Custom port mapping or service selection (start only bpmn, not excalidraw). Ship all-or-nothing; refine later if users ask.
3. Companion containers for mermaid — the public endpoint already serves mermaid; including `kroki-mermaid` in the compose file adds startup time with no new capability for public-endpoint users. Defer unless self-hosted-only users surface a need.

## Plan

### Design

**Compose file (`docker/kroki-compose.yml`):**

```yaml
services:
  core:
    image: yuzutech/kroki
    environment:
      - KROKI_BPMN_HOST=bpmn
      - KROKI_EXCALIDRAW_HOST=excalidraw
      - KROKI_DIAGRAMSNET_HOST=diagramsnet
    ports:
      - "8000:8000"
  bpmn:
    image: yuzutech/kroki-bpmn
    expose:
      - "8003"
  excalidraw:
    image: yuzutech/kroki-excalidraw
    expose:
      - "8004"
  diagramsnet:
    image: yuzutech/kroki-diagramsnet
    expose:
      - "8005"
```

**`kroki-compose.ts` — lifecycle module:**

Same interface shape as `kroki-docker.ts` (`start`, `stop`, `status`) but shells out to `docker compose` instead of `docker run`:

```typescript
export function createKrokiComposeManager(
  shell: ShellRunner,
  composePath: string,  // resolved path to kroki-compose.yml
  logger: Logger = NULL_LOGGER,
) {
  async function start(): Promise<KrokiDockerResult> {
    const result = await shell.run("docker", [
      "compose", "-f", composePath, "up", "-d",
    ]);
    // ...
  }
  async function stop(): Promise<KrokiDockerResult> {
    await shell.run("docker", [
      "compose", "-f", composePath, "down",
    ]);
    // ...
  }
  async function status(): Promise<KrokiDockerResult> {
    // docker compose -f <file> ps --format json
    // parse running services, report which companions are up
  }
  return { start, stop, status };
}
```

**Command dispatch change:**

```text
/fence kroki start          → single container (existing)
/fence kroki start --full   → compose stack
/fence kroki stop           → detect mode, tear down
/fence kroki status         → detect mode, report
```

Detection: check if `docker compose -f <path> ps` returns running services. If yes, compose mode is active. Otherwise check the single container.

**Config extension:**

```typescript
kroki?: {
  endpoint?: string;
  docker?: {
    autoStart?: boolean;
    companions?: boolean;  // NEW: true → compose mode on auto-start
  };
};
```

### Implementation order

| Step | Layer | What | Commit |
|------|-------|------|--------|
| 1 | spec | CV7 roadmap artifacts. | `spec CV7.E1.S1` |
| 2 | core | Compose file + `kroki-compose.ts` + config extension + command dispatch + unit tests. | `step 1: Kroki compose stack lifecycle` |
| 3 | close | Verify, close story. | `close CV7.E1.S1` |

## Tests

1. **Layers touched:**
   - **Unit** — `kroki-compose.ts` lifecycle via `FakeShellRunner`: start (compose up), stop (compose down), status (compose ps parsing), already-running idempotency.
   - **Unit** — config parsing for `kroki.docker.companions`.
   - **Unit** — command dispatch routes `--full` to compose manager.
2. **Events / interactions covered:**
   - `docker compose up -d` called with correct `-f` path and succeeds.
   - `docker compose down` tears down the stack.
   - `docker compose ps --format json` parsed to determine running state.
   - Auto-start with `companions: true` uses compose instead of single container.
   - Fallback: `docker compose` binary not available → clear error with install hint.
3. **Fakes added:** none new — reuses `FakeShellRunner`.
4. **Live tests added:** none in this story. E2 adds live tests against the compose stack.
5. **Deferred:** live verification of the compose stack (E2), selective companion startup, port customization.

## Verification

```bash
pnpm test                      # unit tests for compose lifecycle
pnpm run feedback              # full fast gate
# Manual: docker compose -f docker/kroki-compose.yml up -d
# Manual: curl http://localhost:8000/bpmn/svg -d '<bpmn source>'
```

## Key files

- `docker/kroki-compose.yml` (new)
- `extensions/pi-fence/kroki-compose.ts` (new)
- `extensions/pi-fence/kroki-docker.ts` (existing, unchanged)
- `extensions/pi-fence/command.ts` (extended)
- `extensions/pi-fence/config.ts` (extended)
- `extensions/pi-fence/index.ts` (auto-start routing)
- `tests/unit/kroki-compose.test.ts` (new)
