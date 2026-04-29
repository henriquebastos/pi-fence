# CV9.E1.S6 — Kroki sandbox processor

**Status:** Done

**Epic:** [CV9.E1 — Policy-driven Resolution](cv9-e1--policy-driven-resolution.md)
**Date:** 2026-04-28 (done)

## Summary

Ship `kroki-sandbox`: a managed service-sandbox processor distinct from `kroki-remote`. Both processors speak HTTP to a Kroki endpoint, but only `kroki-sandbox` is selected as `placement: "sandbox"` because pi-fence owns the runtime that provides that endpoint.

S6 validates both service sandbox runtimes from S4:

1. `docker-container` — the existing trusted single `yuzutech/kroki` container path.
2. `docker-compose` — a fixed multi-service stack path for Kroki companion backends.

`kroki.endpoint` remains unmanaged remote configuration. Pointing it at `http://localhost:*` does not make `kroki-remote` a sandbox; sandbox ownership comes only from a ready service sandbox controller.

## Done criterion

1. `kroki-remote` remains the unmanaged Kroki processor id with `placement: "remote"`, including when configured with a localhost endpoint.
2. `kroki-sandbox` is a distinct processor id with `placement: "sandbox"`.
3. `kroki-sandbox` uses the same Kroki request/render semantics as `kroki-remote`, including aliases, SVG rasterization, theme handling, timeouts, and structured render errors.
4. `kroki-sandbox` uses an endpoint only when the selected service sandbox controller reports `ready` with an endpoint.
5. `sandboxes.kroki.runtime: "docker-container"` starts, statuses, and stops the existing trusted single-container Kroki path through a service sandbox controller.
6. `sandboxes.kroki.runtime: "docker-compose"` starts, statuses, and stops a fixed Compose-backed Kroki stack through the same service sandbox contract.
7. `kroki-sandbox.available()` is ok only for `ready`; `partial`, `stopped`, `absent`, and `error` statuses are unavailable.
8. `partial` Compose status is unavailable for all tags in CV9 and is explained by `/fence doctor` with component details.
9. `processorPrecedence: ["sandbox", "remote"]` prefers `kroki-sandbox` over `kroki-remote` when the sandbox is ready.
10. `kroki-remote` remains the fallback when the sandbox is unavailable and `remote` placement is allowed.
11. If `bundle-sandbox` and `kroki-sandbox` both support a tag in `sandbox` placement, same-placement ambiguity requires a binding.
12. Live tests cover the single-container service path and the Compose service path when Docker is available, skipping cleanly otherwise.
13. `pnpm run feedback`, `pnpm run inspect`, and the relevant `pnpm test:live` lane pass or record an environment-only skip/blocker.

## Scope

**In scope:**

1. `kroki-sandbox` processor construction and availability.
2. Shared Kroki HTTP/render path for remote and sandbox processors.
3. Service sandbox controller use for `docker-container` and `docker-compose` runtimes.
4. Extension wiring for sandbox precedence, remote fallback, and auto-start.
5. `/fence list` and `/fence doctor` diagnostics for sandbox availability and Compose partial status.
6. Unit, extension, contract where useful, and live tests for both service runtimes.

**Out of scope:**

1. Registering CV7 companion-only tags (`bpmn`, `excalidraw`, `diagramsnet`).
2. Tag-specific partial availability for Compose components.
3. Non-Docker service runtimes.
4. Bundle exec sandbox changes beyond ambiguity tests with `kroki-sandbox`.
5. Running project-supplied service images or Compose files before source-aware trust semantics exist.

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

Keeping a manually configured local endpoint unmanaged:

```json
{
  "kroki": {
    "endpoint": "http://localhost:8000"
  },
  "processorPrecedence": ["remote"]
}
```

The last example still selects `kroki-remote`; no sandbox controller owns that endpoint.

## Plan

1. **Kroki processor split.** Keep `kroki-remote` as the unmanaged endpoint processor, add `kroki-sandbox` as a managed service processor, and share the existing Kroki HTTP/render behavior without sharing identity or placement.
2. **Single-container service runtime.** Route `sandboxes.kroki.runtime: "docker-container"` through the S4 service controller, preserve the trusted `yuzutech/kroki` image boundary, and make auto-start/lifecycle behavior target `kroki-sandbox` rather than remote policy.
3. **Compose service runtime.** Add a fixed Compose-backed Kroki service controller with component status and lifecycle operations. `ready` exposes one endpoint; `partial` carries component details but is unavailable for selection in CV9.
4. **Policy and diagnostics.** Wire both runtimes into the extension so sandbox precedence, remote fallback, exact bindings, blocked processors, placement allowlists, and same-placement ambiguity behave through the existing resolver rules. Surface unavailable and partial states in `/fence list` and `/fence doctor`.
5. **Live verification and docs.** Add live tests for both Kroki service runtimes with clean Docker/network skips, then update user-facing docs for the managed `kroki-sandbox` path.

## Tests

1. **Layers touched:**
   - **Unit** — Kroki processor metadata/render sharing, service controller lifecycle/status normalization, Compose component summarization, command/list/doctor formatting.
   - **Contract** — `kroki-sandbox` satisfies the shared `FenceProcessor` contract when backed by a ready fake service controller.
   - **Extension** — sandbox/remote precedence, auto-start, fallback, blocking, bindings, and bundle/Kroki sandbox ambiguity.
   - **Integration (live)** — real Docker single-container and Compose-backed Kroki service paths.
2. **Events / interactions covered:**
   - `kroki-remote` does not depend on sandbox config and stays remote for localhost endpoints.
   - `kroki-sandbox` is unavailable when controller status is not `ready` or lacks an endpoint.
   - Auto-start calls the selected service controller before availability probing when the sandbox config opts in.
   - Compose partial status explains component failures and does not select `kroki-sandbox`.
   - Same-placement ambiguity with `bundle-sandbox` is not resolved by registration order.
3. **Fakes added:** reuse `FakeShellRunner`, `FakeHttpClient`, and inline/focused fake service controllers unless implementation pressure proves a reusable `FakeSandboxController` is clearer.
4. **Live tests added:** Kroki service sandbox single-container render and Compose-backed render, skipped with `describe.skipIf(...)` when Docker or the service stack is unavailable.
5. **Deferred:** companion-only tags, tag-specific component availability, non-Docker runtimes, project-supplied service images, and project-supplied Compose files.

## Verification

```bash
pnpm run feedback
pnpm run inspect
pnpm test:live
```

## Ready decisions

1. **Controller ownership defines sandbox.** `kroki-sandbox` uses an endpoint reported by a ready service sandbox controller; `kroki.endpoint` remains `kroki-remote` configuration.
2. **Trusted service definitions only.** S6 uses the existing trusted single-container image and a repo-owned Compose stack. Project-provided images or Compose files remain out of scope until source-aware trust semantics exist.
3. **All-or-nothing availability for CV9.** A ready controller makes `kroki-sandbox` selectable for its advertised Kroki tags; a partial controller makes it unavailable for every tag. Per-tag component availability waits for CV7 companion work.
4. **No resolver special cases.** Sandbox preference, remote fallback, blocking, bindings, and ambiguity remain resolver policy behavior, not Kroki-specific tie-breakers.
