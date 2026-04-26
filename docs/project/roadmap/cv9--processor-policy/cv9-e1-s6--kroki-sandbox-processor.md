# CV9.E1.S6 — Kroki sandbox processor

**Status:** Draft

**Epic:** [CV9.E1 — Policy-driven Resolution](cv9-e1--policy-driven-resolution.md)
**Date:** 2026-04-25 (spec)

## Summary

Ship `kroki-sandbox`: a managed service-sandbox processor distinct from `kroki-remote`. The processor speaks HTTP to a Kroki endpoint, but its placement is `sandbox` because pi-fence controls the runtime that provides that endpoint.

This story deliberately supports both service sandbox runtimes to validate the abstraction:

1. `docker-container` — current single `yuzutech/kroki` container path.
2. `docker-compose` — multi-service stack path needed by CV7 companion backends.

## Done criterion

1. `kroki-remote` replaces the current unmanaged Kroki processor id.
2. `kroki-sandbox` is a distinct processor id with placement `sandbox`.
3. `kroki-remote` remains placement `remote`, even for `http://localhost:*` endpoints not owned by a sandbox controller.
4. `sandboxes.kroki.runtime: "docker-container"` starts/statuses/stops the existing single-container Kroki path through a service sandbox controller.
5. `sandboxes.kroki.runtime: "docker-compose"` starts/statuses/stops a Compose-backed Kroki stack through the same service sandbox contract.
6. `kroki-sandbox.available()` is ok only when the selected controller reports `ready`.
7. `partial` Compose status makes `kroki-sandbox` unavailable in CV9 and is explained by `/fence doctor`.
8. `processorPrecedence: ["sandbox", "remote"]` prefers `kroki-sandbox` over `kroki-remote` when the sandbox is ready.
9. If `bundle-sandbox` and `kroki-sandbox` both support a tag, same-placement ambiguity requires a binding.
10. Live tests cover the single-container service path and the Compose service path when Docker is available, skipping cleanly otherwise.
11. `pnpm run feedback`, `pnpm run inspect`, and `pnpm test:live` pass.

## Scope

**In scope:**

1. Rename/split current Kroki processor identity into `kroki-remote` and `kroki-sandbox`.
2. Service sandbox controller for `docker-container` using the existing `kroki-docker.ts` behavior.
3. Service sandbox controller for `docker-compose` with component status.
4. Kroki sandbox processor construction and availability.
5. Unit, extension, and live tests for both service runtimes.

**Out of scope:**

1. Registering CV7 companion-only tags (`bpmn`, `excalidraw`, `diagramsnet`).
2. Tag-specific partial availability for Compose components.
3. Non-Docker service runtimes.
4. Bundle exec sandbox — S5.

## Config examples

Single-container service sandbox:

```json
{
  "sandboxes": {
    "kroki": {
      "kind": "service",
      "runtime": "docker-container",
      "autoStart": true
    }
  },
  "processorPrecedence": ["sandbox", "remote"]
}
```

Compose service sandbox:

```json
{
  "sandboxes": {
    "kroki": {
      "kind": "service",
      "runtime": "docker-compose",
      "autoStart": true
    }
  },
  "processorPrecedence": ["sandbox", "remote"]
}
```

Binding to managed Kroki:

```json
{
  "bindings": {
    "mermaid": { "processor": "kroki-sandbox" }
  }
}
```

Binding to unmanaged Kroki:

```json
{
  "bindings": {
    "mermaid": { "processor": "kroki-remote" }
  }
}
```

## Plan

This story stays Draft until S4 lands. It should run after S5 unless we explicitly decide service sandboxes are a higher priority than the bundle. Once ready, implement with TDD:

| Step | TDD phase | Layer | What | Commit |
|------|-----------|-------|------|--------|
| 1 | red | Unit | Add tests for Kroki processor ids/placements: `kroki-remote` and `kroki-sandbox`. | `step 1: split kroki identities` |
| 2 | green/refactor | Unit | Rename current Kroki processor to `kroki-remote` and add a sandbox constructor shape. | same |
| 3 | red | Unit | Add service controller tests for `docker-container`: status/start/stop/endpoint using `FakeShellRunner`. | `step 2: kroki container service controller` |
| 4 | green/refactor | Unit | Refactor existing Kroki Docker lifecycle behind the service sandbox controller contract. | same |
| 5 | red | Unit | Add service controller tests for `docker-compose`: ready, partial, absent, stopped, and error states. | `step 3: kroki compose service controller` |
| 6 | green/refactor | Unit | Add Compose command/status implementation and component normalization. | same |
| 7 | red | Extension | Add tracer-bullet tests proving sandbox precedence selects `kroki-sandbox`, remote fallback selects `kroki-remote`, and bundle/Kroki sandbox ambiguity requires binding. | `step 4: kroki sandbox extension path` |
| 8 | green/refactor | Extension | Wire sandbox Kroki controller construction, auto-start, availability, and diagnostics. | same |
| 9 | red | Integration (live) | Add live tests for `docker-container` and `docker-compose` Kroki sandbox paths. | `step 5: kroki sandbox live gate` |
| 10 | green/refactor | Integration (live) | Add/update compose file and clean skip behavior. | same |
| 11 | verify | All | Run `pnpm run feedback`, `pnpm run inspect`, and `pnpm test:live`. | same |

## Tests

1. **Layers touched:**
   - **Unit** — Kroki processor metadata, container controller, Compose controller, status normalization.
   - **Extension** — sandbox/remote precedence and ambiguity behavior.
   - **Integration (live)** — real Docker container and Compose service paths.
2. **Events / interactions covered:**
   - `kroki-remote` does not depend on sandbox config.
   - `kroki-sandbox` is unavailable when controller status is not `ready`.
   - Auto-start calls the selected service controller before availability probing.
   - Compose partial status explains component failures.
   - Same-placement ambiguity with `bundle-sandbox` is not resolved by order.
3. **Fakes added:** reuse or add service-specific fake controller if S4 does not already provide one.
4. **Live tests added:** Kroki service sandbox single-container and Compose paths.
5. **Deferred:** companion-only tags and tag-specific component availability.

## Verification

```bash
pnpm run feedback
pnpm run inspect
pnpm test:live
```
