# CV10.E1.S1 — Gondolin VM runtime for bundle-sandbox

**Status:** Done

**Epic:** [CV10.E1 — Gondolin Bundle Runtime](cv10-e1--gondolin-bundle-runtime.md)
**Date:** 2026-04-29 (spec)

## Summary

Add `gondolin-vm` as an exec sandbox runtime for the existing `bundle-sandbox` processor.

Today `bundle-sandbox` renders through Docker:

```text
bundle-sandbox
  ExecSandboxEnvironment -> docker exec pi-fence-bundle dot -Tpng
  ExecSandboxEnvironment -> docker exec pi-fence-bundle mmdc ...
```

This story adds a Gondolin-backed `ExecSandboxEnvironment` with the same public behavior:

```text
bundle-sandbox
  ExecSandboxEnvironment -> Gondolin VM exec dot -Tpng
  ExecSandboxEnvironment -> Gondolin VM exec mmdc ...
```

The processor id, supported tags, aliases, manifest checks, and placement semantics do not change. Only the configured runtime behind the `bundle` sandbox changes.

This is valuable because fenced sources are untrusted input passed to large renderer stacks. Docker is still useful, but a VM gives users a stronger isolation boundary for local CLI rendering.

## Done criterion

1. `SandboxRuntime` includes `"gondolin-vm"`.
2. Config validation accepts `{ "kind": "exec", "runtime": "gondolin-vm" }` for `sandboxes.bundle`, and accepts `autoStart: true` only with an explicit image from a non-project config layer.
3. Config validation rejects `"gondolin-vm"` for `kind: "service"`, missing auto-start images, and project-local Gondolin auto-start with fail-closed behavior.
4. `@earendil-works/gondolin` is added as a production dependency.
5. A Gondolin bundle image contract exists with `dot`, `mmdc`, Chromium/runtime dependencies, and `/opt/pi-fence-bundle/manifest.json`.
6. The Gondolin bundle image can be selected by explicit config image id/path; a trusted pi-fence default is deferred until a published image exists.
7. A `GondolinExecSandboxEnvironment` implements `ExecSandboxEnvironment`.
8. `run(command, args, options)` executes inside the VM, supports stdin, cwd, abort signals, stdout/stderr capture, exit codes, and binary stdout.
9. `createWorkspace()` creates an isolated guest temp directory, supports `writeText`, `readBuffer`, `path`, and `dispose`, and rejects path traversal like the Docker workspace.
10. A Gondolin-backed sandbox controller reports `absent`/`stopped`/`ready`/`error` states clearly enough for `bundle-sandbox.available()`.
11. `autoStart: true` starts the Gondolin VM during extension startup only when the config supplies an explicit trusted image outside project-local config; `autoStart: false` leaves it stopped and unavailable.
12. Renderer execution uses no host directory mount and no generic network egress.
13. `bundle-sandbox.available()` works unchanged against the Gondolin environment: status check, manifest read, and required tool probes.
14. `processorPrecedence: ["sandbox"]` renders `dot` and `mermaid` through `bundle-sandbox` when `sandboxes.bundle.runtime` is `"gondolin-vm"`.
15. Docker-backed `bundle-sandbox` behavior and tests remain unchanged.
16. Live tests skip cleanly when QEMU/Gondolin guest assets or the Gondolin bundle image are unavailable.
17. `pnpm run feedback`, `pnpm run inspect`, and the relevant `pnpm test:live` lane pass or record an environment-only skip/blocker.

## Scope

**In scope:**

1. Config/runtime enum extension for `gondolin-vm`.
2. Gondolin dependency and runtime adapter modules.
3. A Gondolin exec sandbox controller for the named `bundle` sandbox.
4. A Gondolin implementation of `ExecSandboxEnvironment`.
5. Bundle image contract and manifest/probe compatibility with the existing `bundle-sandbox`.
6. Extension wiring so factory-created `bundle-sandbox` receives Docker or Gondolin based on `sandboxes.bundle.runtime`.
7. Fast tests using fakes for config, controller lifecycle, workspace behavior, and processor selection.
8. Live tests for Graphviz and Mermaid rendering through a real Gondolin VM.

**Out of scope:**

1. Replacing `kroki-sandbox` or Docker Compose service runtimes.
2. Running arbitrary user-provided VM images without trusted-image semantics.
3. Full VM memory snapshots or persistent installed packages.
4. Mounting project directories into the VM.
5. Allowing renderer network access.
6. Third-party sandbox controller plugin APIs.
7. Publishing the Gondolin bundle image to a registry if local build/run is enough for the first live gate.

## Runtime contract

The runtime value is explicit:

```typescript
type SandboxRuntime = "docker-container" | "docker-compose" | "gondolin-vm";
```

Allowed combinations:

| Sandbox id | Kind | Runtime | Meaning |
|------------|------|---------|---------|
| `bundle` | `exec` | `docker-container` | Existing hardened Docker exec container |
| `bundle` | `exec` | `gondolin-vm` | New Gondolin VM exec runtime |
| `kroki` | `service` | `docker-container` | Existing single-container Kroki service |
| `kroki` | `service` | `docker-compose` | Existing managed Compose service stack |

Invalid combinations fail closed. In particular, `gondolin-vm` is not a service runtime in this story.

## Image contract

The Gondolin VM must expose the same bundle contract as the Docker image:

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

Required guest tools:

1. Graphviz `dot`.
2. Node.js runtime needed by Mermaid CLI.
3. `@mermaid-js/mermaid-cli`.
4. Chromium and runtime dependencies required by `mmdc`.
5. `/opt/pi-fence-bundle/puppeteer-config.json` or an equivalent config path compatible with the existing Mermaid handler.

The first implementation uses an explicit local Gondolin image selector or guest asset path. If a published image is introduced later, the trusted default must be pinned in code and documented as the pi-fence-owned bundle image, not accepted from arbitrary project config by default.

## Isolation contract

The Gondolin bundle runtime is for local, untrusted renderer execution. Start strict:

1. No `RealFSProvider` mount of the project, home directory, or repo.
2. Workspace files live inside the VM temp filesystem and are copied through `vm.fs`/exec channels only.
3. Network policy blocks outbound HTTP/TLS/SSH/TCP unless a future story proves a renderer needs a specific allowlisted target.
4. The guest receives no ambient host env vars.
5. The VM is disposable; installed packages during a run are not relied on for persistence.

If Mermaid/Chromium forces a relaxation, the implementation must document the exact relaxation in code comments/tests and preserve a live Graphviz + Mermaid gate.

## Plan

1. **Config and controller selection.** Extend sandbox runtime validation with `gondolin-vm`, restrict it to `exec` sandboxes, and route `sandboxes.bundle.runtime` to either the existing Docker controller/environment or the new Gondolin controller/environment.
2. **Gondolin lifecycle.** Add a controller that verifies QEMU/Gondolin prerequisites, resolves the configured/trusted bundle image, starts a VM on demand or through `autoStart`, reports clear status, and closes the VM on stop/shutdown.
3. **Exec environment parity.** Implement `GondolinExecSandboxEnvironment` behind the existing seam. Preserve command result shape, stdin handling, abort behavior, binary stdout, and workspace path safety so `bundle-sandbox` does not gain runtime-specific branches.
4. **Image and probes.** Provide the Gondolin bundle image contract, manifest path, Puppeteer config path, and tool probes needed by `bundle-sandbox.available()`.
5. **Policy proof.** Prove `processorPrecedence: ["sandbox"]` with `runtime: "gondolin-vm"` renders `dot` and `mermaid` through `bundle-sandbox`, while Docker runtime tests remain green.
6. **Live verification and docs.** Add skip-clean live tests for QEMU/Gondolin availability and document the config shape and setup hints only after the behavior works.

## Tests

1. **Layers touched:**
   - **Unit** — config validation, runtime/kind compatibility, Gondolin controller status normalization, workspace path safety, environment command mapping with fakes.
   - **Contract** — `bundle-sandbox` still satisfies the `FenceProcessor` contract when backed by a fake Gondolin exec environment.
   - **Extension** — config with `sandboxes.bundle.runtime: "gondolin-vm"` creates `bundle-sandbox`, selects it through sandbox precedence, and does not create Docker exec calls.
   - **Integration (live)** — real Gondolin VM renders Graphviz and Mermaid through `bundle-sandbox`.
2. **Events / interactions covered:**
   - Missing QEMU/Gondolin assets report unavailable with a setup hint.
   - `autoStart: true` starts the VM and `autoStart: false` does not.
   - Manifest missing/malformed/tool-probe failures still make `bundle-sandbox.available()` false.
   - `dot` renders through stdin/stdout inside the VM.
   - `mmdc` renders through a VM temp workspace and returns the output PNG.
   - Abort/timeout closes the running command without leaving the sandbox environment wedged.
   - Stop closes the VM and subsequent status reports `stopped`.
   - Docker runtime behavior remains covered by existing Docker tests.
3. **Fakes added:** `FakeGondolinVM`/`FakeGondolinController` or equivalent local fakes if direct unit coverage cannot use the existing `FakeShellRunner`; no `vi.mock()`.
4. **Live tests added:** `bundle-sandbox` Graphviz and Mermaid through Gondolin, skipped with `describe.skipIf(...)` when QEMU, guest assets, or the bundle image are unavailable.
5. **Deferred:** service sandboxes in Gondolin, arbitrary images, renderer network allowlists, VM snapshot persistence, and third-party controller registration.

## Verification

```bash
pnpm run feedback
pnpm run inspect
pnpm test:live
```

Targeted commands during implementation:

```bash
pnpm vitest run tests/unit/config.test.ts tests/unit/sandbox.test.ts tests/unit/bundle-sandbox-environment.test.ts
pnpm vitest run tests/extension/pi-fence.test.ts --testNamePattern gondolin
pnpm vitest run tests/integration/bundle-sandbox.live.test.ts --testNamePattern gondolin
```

## Ready decisions

1. **Runtime, not processor id.** The processor remains `bundle-sandbox`; `gondolin-vm` is a sandbox runtime, not a new placement or processor id.
2. **Exec-only first.** Gondolin applies to the bundle exec sandbox in this story. Kroki remains Docker/Compose-backed.
3. **No host mounts.** Renderer inputs and outputs move through VM exec/fs channels, not mounted project directories.
4. **No network by default.** The bundle runtime should render offline. Any network exception needs a later story with a concrete renderer requirement.
5. **Image trust stays narrow.** This story requires an explicit non-project image selector/path for Gondolin auto-start. A pi-fence-owned default image can be added later once a published image exists; arbitrary project-configured images are not treated as trusted defaults.
