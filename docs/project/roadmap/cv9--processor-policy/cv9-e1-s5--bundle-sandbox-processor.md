# CV9.E1.S5 — Bundle sandbox processor

**Status:** Draft

**Epic:** [CV9.E1 — Policy-driven Resolution](cv9-e1--policy-driven-resolution.md)
**Date:** 2026-04-25 (spec)

## Summary

Ship `bundle-sandbox`: one sandbox processor backed by a single Docker container containing every command-line renderer pi-fence knows how to call at this point. It starts with the host-command processors we already ship: Graphviz `dot` and Mermaid `mmdc`.

The bundle is one processor, not a collection of per-tool processors:

```text
bundle-sandbox
  graphviz handler -> dot -Tpng
  mermaid handler  -> mmdc -i input.mmd -o output.png
```

Internal handlers are private implementation details. The registry sees one processor with placement `sandbox` and many supported tags.

## Done criterion

1. A committed bundle Docker image definition installs `dot` and `mmdc` plus required runtime dependencies.
2. The image includes a machine-readable manifest listing installed tools and version commands.
3. `bundle-sandbox` is registered as one `FenceProcessor` with placement `sandbox`.
4. `bundle-sandbox` supports at least `graphviz`/`dot` and `mermaid`.
5. `bundle-sandbox.available()` checks the sandbox controller status and required tool probes.
6. `bundle-sandbox.render("dot", ...)` renders via `dot` inside the container.
7. `bundle-sandbox.render("mermaid", ...)` renders via `mmdc` inside the container.
8. `processorPrecedence: ["sandbox"]` can render `dot` and `mermaid` through `bundle-sandbox` without host binaries or remote Kroki.
9. If `bundle-sandbox` and another sandbox processor both support a tag, resolution is ambiguous until a binding selects one.
10. The bundle container runs without exposed ports and without host mounts.
11. Live tests skip cleanly when Docker or the bundle container is unavailable.
12. `pnpm run feedback`, `pnpm run inspect`, and the relevant `pnpm test:live` lane pass.

## Scope

**In scope:**

1. Bundle Dockerfile/image definition for pi-fence command renderers.
2. Bundle manifest format and probe logic.
3. Docker exec controller/workspace implementation for the bundle.
4. One `bundle-sandbox` processor with internal tool handlers.
5. Graphviz and Mermaid rendering through the bundle.
6. Unit, extension, and live tests for the bundle path.

**Out of scope:**

1. Registering every future renderer now; the bundle contains every host-command renderer pi-fence ships at this point.
2. Kroki service sandbox — S6.
3. Podman or non-Docker bundle runtimes.
4. Splitting bundle handlers into separate registered processors.
5. CV7 companion backend tags.

## Bundle image contract

Initial image contents:

1. `dot` from Graphviz.
2. `mmdc` from `@mermaid-js/mermaid-cli`.
3. Chromium/runtime dependencies required by `mmdc`.
4. A manifest file, for example `/opt/pi-fence-bundle/manifest.json`:

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

Security posture for the container should start strict and relax only with tested evidence:

```bash
docker run -d \
  --name pi-fence-bundle \
  --network none \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --tmpfs /tmp \
  ghcr.io/henriquebastos/pi-fence-bundle:0.1.0
```

If `mmdc`/Chromium requires a relaxation, the story documents the exact flag and a live test proves rendering still works.

## Processor shape

```typescript
interface BundleToolHandler {
  readonly id: string;
  readonly tags: readonly string[];
  readonly aliases: Readonly<Record<string, string>>;
  probe(env: ExecSandboxEnvironment): Promise<Availability>;
  render(env: ExecSandboxEnvironment, tag: string, source: string, signal?: AbortSignal): Promise<FenceResult>;
}
```

`bundle-sandbox` composes handlers internally:

1. Public `tags` is the union of handler canonical tags.
2. Public `aliases` is the union of handler aliases.
3. `available()` checks the controller and handler probes.
4. `render()` dispatches to the handler that claims the tag.

## Plan

This story stays Draft until S4 lands. Once ready, implement with TDD:

| Step | TDD phase | Layer | What | Commit |
|------|-----------|-------|------|--------|
| 1 | red | Unit | Add tests for bundle manifest parsing and tool probe aggregation. | `step 1: bundle manifest and probes` |
| 2 | green/refactor | Unit | Add manifest reader/probe helpers behind the exec sandbox seam. | same |
| 3 | red | Unit | Add tests for `bundle-sandbox` tags, aliases, placement, and handler dispatch for `dot` and `mermaid`. | `step 2: bundle processor contract` |
| 4 | green/refactor | Unit | Implement one `bundle-sandbox` processor with private Graphviz and Mermaid handlers using fake exec environment. | same |
| 5 | red | Extension | Add tracer-bullet tests for `processorPrecedence: ["sandbox"]` rendering `dot` and `mermaid` through `bundle-sandbox`. | `step 3: bundle extension tracer bullet` |
| 6 | green/refactor | Extension | Wire bundle sandbox config/controller construction into the extension. | same |
| 7 | red | Integration (live) | Add live tests that render Graphviz and Mermaid through the real bundle container. | `step 4: bundle live gate` |
| 8 | green/refactor | Integration (live) | Add/update Docker image, live scripts, and clean skip behavior. | same |
| 9 | verify | All | Run `pnpm run feedback`, `pnpm run inspect`, and targeted `pnpm test:live`. | same |

## Tests

1. **Layers touched:**
   - **Unit** — manifest parsing, handler dispatch, availability aggregation, workspace behavior with fakes.
   - **Extension** — config selects sandbox-only processing through `bundle-sandbox`.
   - **Integration (live)** — real Docker bundle renders Graphviz and Mermaid.
2. **Events / interactions covered:**
   - Bundle container absent/unavailable reports unavailable.
   - Tool missing in manifest or probe failure reports unavailable with an install/build hint.
   - `dot` uses stdin/stdout rendering inside the container.
   - `mmdc` uses workspace files inside the container.
   - No host `dot`/`mmdc` calls are made in sandbox-only mode.
3. **Fakes added:** likely `FakeExecSandboxEnvironment` and `FakeExecSandboxWorkspace` if the interface is reused across tests.
4. **Live tests added:** bundle Graphviz and Mermaid render tests.
5. **Deferred:** adding future tools to the bundle is done when those processors land.

## Verification

```bash
pnpm run feedback
pnpm run inspect
pnpm test:live
```
