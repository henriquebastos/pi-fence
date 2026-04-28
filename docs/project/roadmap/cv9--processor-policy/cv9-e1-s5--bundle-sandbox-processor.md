# CV9.E1.S5 — Bundle sandbox processor

**Status:** Ready

**Epic:** [CV9.E1 — Policy-driven Resolution](cv9-e1--policy-driven-resolution.md)
**Date:** 2026-04-28 (ready)

## Summary

Ship `bundle-sandbox`: one sandbox processor backed by a Docker exec container that contains every command-line renderer pi-fence knows how to call at this point. The first bundle covers the host-command processors pi-fence already ships: Graphviz `dot` and Mermaid `mmdc`.

The bundle is one processor, not a collection of per-tool processors:

```text
bundle-sandbox
  graphviz handler -> dot -Tpng
  mermaid handler  -> mmdc -i input.mmd -o output.png
```

Internal handlers are private implementation details. The registry sees one `FenceProcessor` with placement `sandbox` and many supported tags.

## Done criterion

1. A committed bundle Docker image definition installs `dot`, `mmdc`, and the Chromium/runtime dependencies required by Mermaid CLI.
2. The image includes a machine-readable manifest listing installed tools and their version commands.
3. Runtime bundle artifacts are separate from the existing `pi-fence-live-deps` test image.
4. pi-fence has a Docker exec sandbox environment that can run commands in a controlled container and create temporary workspaces inside that container without host mounts.
5. `bundle-sandbox` is registered as one `FenceProcessor` with `placement: "sandbox"`.
6. `bundle-sandbox` supports `graphviz`/`dot` and `mermaid` through private handlers.
7. `bundle-sandbox.available()` checks the bundle sandbox controller status, reads the manifest, and probes required tools before reporting `ok:true`.
8. `bundle-sandbox.render("dot", ...)` renders via `dot` inside the bundle container.
9. `bundle-sandbox.render("mermaid", ...)` renders via `mmdc` inside the bundle container workspace.
10. `processorPrecedence: ["sandbox"]` can render `dot` and `mermaid` through `bundle-sandbox` without host binaries or remote Kroki.
11. If `bundle-sandbox` and another sandbox processor both support a tag, resolution is ambiguous until a binding selects one.
12. The bundle container contract uses no exposed ports and no host mounts.
13. Live tests skip cleanly when Docker or the bundle container is unavailable.
14. `pnpm run feedback`, `pnpm run inspect`, and the relevant `pnpm test:live` lane pass or record an environment-only skip/blocker.

## Scope

**In scope:**

1. Product bundle Dockerfile/image definition and manifest file.
2. Bundle manifest parsing and probe aggregation.
3. Docker exec environment/workspace implementation for the bundle sandbox.
4. One `bundle-sandbox` processor with private Graphviz and Mermaid handlers.
5. Default extension wiring for the configured `bundle` sandbox.
6. Resolver/extension coverage for sandbox-only precedence and same-placement ambiguity.
7. Unit, extension, contract where applicable, and live tests for the bundle path.

**Out of scope:**

1. Registering future renderers before those processors exist.
2. Kroki service sandbox — S6.
3. Podman, Kubernetes, devcontainers, or non-Docker bundle runtimes.
4. Splitting bundle handlers into separate registered processors.
5. CV7 companion backend tags.
6. User-facing `/fence bundle start|stop` commands.
7. Executing arbitrary project-configured bundle images before source-aware image trust semantics exist.

## Bundle image contract

Initial image contents:

1. `dot` from Graphviz.
2. `mmdc` from `@mermaid-js/mermaid-cli`.
3. Chromium/runtime dependencies required by `mmdc`.
4. A manifest file at `/opt/pi-fence-bundle/manifest.json`:

   ```json
   {
     "name": "pi-fence-bundle",
     "version": "0.1.0",
     "tools": {
       "dot": {
         "command": "dot",
         "versionCommand": ["dot", "-V"]
       },
       "mmdc": {
         "command": "mmdc",
         "versionCommand": ["mmdc", "--version"]
       }
     }
   }
   ```

Security posture for the container starts strict and relaxes only with tested evidence:

```bash
docker run -d \
  --name pi-fence-bundle \
  --label pi-fence.sandbox=bundle \
  --network none \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --tmpfs /tmp \
  ghcr.io/henriquebastos/pi-fence-bundle:0.1.0
```

If `mmdc`/Chromium requires a relaxation, the implementation must document the exact flag and prove Graphviz and Mermaid still render through live tests.

## Processor shape

```typescript
interface BundleToolHandler {
  readonly id: string;
  readonly tags: readonly string[];
  readonly aliases: Readonly<Record<string, string>>;
  probe(env: ExecSandboxEnvironment, manifest: BundleManifest): Promise<Availability>;
  render(env: ExecSandboxEnvironment, tag: string, source: string, signal?: AbortSignal): Promise<FenceResult>;
}
```

`bundle-sandbox` composes handlers internally:

1. Public `tags` is the union of handler canonical tags.
2. Public `aliases` is the union of handler aliases.
3. `available()` succeeds only when the sandbox status is `ready`, the manifest is readable and valid, and every required handler probe succeeds.
4. `render()` dispatches to the handler that claims the canonical or alias tag.
5. Graphviz renders through stdin/stdout; Mermaid renders through a temporary workspace because `mmdc` requires input/output paths.

## Plan

1. **Bundle image and manifest contract.** Commit the product bundle image definition separately from `pi-fence-live-deps`, install Graphviz and Mermaid CLI dependencies, and make the image self-describing through `/opt/pi-fence-bundle/manifest.json`.
2. **Exec sandbox environment.** Add a Docker exec environment/workspace behind the S4 `ExecSandboxEnvironment` seam. It wraps commands in `docker exec`, writes/reads files inside container temp space, and disposes workspaces without requiring host mounts.
3. **Availability and probes.** Add manifest parsing and handler probe aggregation so `bundle-sandbox` is unavailable when the controller is not `ready`, the manifest is missing/malformed, or either required tool probe fails.
4. **Processor rendering.** Implement one `bundle-sandbox` processor with private Graphviz and Mermaid handlers. `dot` uses stdin/stdout; `mmdc` uses workspace files.
5. **Policy integration.** Wire the bundle processor into the default extension only for the configured `bundle` exec sandbox, prove `processorPrecedence: ["sandbox"]` renders Graphviz and Mermaid without host binaries or remote HTTP, and preserve same-placement ambiguity until a binding selects one processor.
6. **Live verification and docs.** Add live tests for the real bundle container, keep them skip-clean when Docker or the container is absent, and update user-facing docs when the bundle path becomes visible.

## Tests

1. **Layers touched:**
   - **Unit** — manifest parsing, Docker exec environment command wrapping, workspace behavior with fakes, handler dispatch, and availability aggregation.
   - **Contract** — `bundle-sandbox` satisfies the shared `FenceProcessor` contract if a fake exec environment can cover the contract paths cleanly.
   - **Extension** — config selects sandbox-only processing through `bundle-sandbox` for `dot` and `mermaid`, with no host `dot`/`mmdc` calls and no Kroki HTTP.
   - **Integration (live)** — real Docker bundle renders Graphviz and Mermaid.
2. **Events / interactions covered:**
   - Bundle container absent, stopped, wrong image, wrong label, or Docker-unavailable states report unavailable.
   - Missing/malformed manifest and tool probe failures report unavailable with a build/start hint.
   - `dot` uses stdin/stdout rendering inside the container.
   - `mmdc` uses a container workspace and reads the output PNG from that workspace.
   - `processorPrecedence: ["sandbox"]` suppresses host and remote renderers while still rendering bundle-supported tags.
   - Same-placement sandbox conflicts stay ambiguous until a binding selects `bundle-sandbox` or the other sandbox processor.
3. **Fakes added:** `FakeExecSandboxEnvironment` and `FakeExecSandboxWorkspace` if production interfaces are exercised directly; otherwise extend `FakeShellRunner` only when exact Docker command programming is sufficient.
4. **Live tests added:** bundle Graphviz and Mermaid render tests, skipped with `describe.skipIf(...)` when Docker or the `pi-fence-bundle` container is unavailable.
5. **Deferred:** future tools, service sandboxes, bundle lifecycle slash commands, Podman/non-Docker runtimes, and arbitrary project-configured executable images.

## Verification

```bash
pnpm run feedback
pnpm run inspect
pnpm test:live
```

## Ready decisions

1. **Separate runtime image.** `pi-fence-live-deps` remains test infrastructure; `pi-fence-bundle` is the product sandbox image.
2. **No host mounts.** Mermaid workspace files live inside the container's temp space; pi-fence communicates through `docker exec`, stdin/stdout, and controlled read/write commands.
3. **No auto-start in this story.** S5 can check and use a running bundle container, and live/dev helpers may document how to start it. User-facing lifecycle commands and automatic start semantics can land later with explicit image-trust rules.
4. **Default image is trusted.** S5 does not execute arbitrary project-configured bundle images. Any relaxation needs source-aware trust semantics and tests.
5. **One registry processor.** Graphviz and Mermaid handlers are private implementation details; ambiguity and bindings operate on `bundle-sandbox`, not on per-tool sandbox processor ids.
