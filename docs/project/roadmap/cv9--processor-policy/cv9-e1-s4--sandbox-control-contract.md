# CV9.E1.S4 — Sandbox control contract

**Status:** Ready

**Epic:** [CV9.E1 — Policy-driven Resolution](cv9-e1--policy-driven-resolution.md)
**Date:** 2026-04-27 (ready)

## Summary

Make `sandbox` precise before adding sandbox processors. A sandbox processor is not merely an HTTP endpoint on `localhost`; it is backed by an isolated runtime that pi-fence can identify, probe, and optionally start/stop through a controller.

Accepted design direction:

1. Do **not** assume Docker forever in the domain model.
2. Do use Docker-backed controllers for the first implementation because existing Kroki lifecycle code already shells out to Docker.
3. Keep the resolver generic: it sees only `placement: "sandbox"` and availability, not Docker commands.
4. Keep sandbox ownership explicit: an arbitrary configured endpoint remains `remote` unless a sandbox controller owns it.
5. Split sandbox use cases by kind:
   - `exec` sandbox — pi-fence runs commands inside the sandbox, such as `dot` and `mmdc`.
   - `service` sandbox — pi-fence calls a managed service endpoint, such as Kroki.
6. Split Kroki by trust boundary: `kroki-sandbox` and `kroki-remote` are separate processor ids.
7. Model the bundle as one multi-tag processor, `bundle-sandbox`, not one processor per bundled binary.

## Proposed model

```typescript
type ProcessorPlacement = "embedded" | "host" | "sandbox" | "remote";
type SandboxKind = "exec" | "service";
type SandboxRuntime = "docker-container" | "docker-compose";

interface SandboxConfig {
  kind: SandboxKind;
  runtime: SandboxRuntime;
  autoStart?: boolean;
  image?: string;
}

interface SandboxController {
  readonly id: string;
  readonly kind: SandboxKind;
  readonly runtime: SandboxRuntime;
  status(): Promise<SandboxStatus>;
  start(): Promise<SandboxStartResult>;
  stop(): Promise<SandboxStopResult>;
}
```

Config shape:

```json
{
  "sandboxes": {
    "bundle": {
      "kind": "exec",
      "runtime": "docker-container",
      "image": "ghcr.io/henriquebastos/pi-fence-bundle:0.1.0",
      "autoStart": true
    },
    "kroki": {
      "kind": "service",
      "runtime": "docker-container",
      "autoStart": true
    }
  },
  "processorPrecedence": ["embedded", "host", "sandbox", "remote"]
}
```

Processor ids stay placement-oriented:

| Processor id | Placement | Sandbox id | Kind |
|--------------|-----------|------------|------|
| `bundle-sandbox` | `sandbox` | `bundle` | `exec` |
| `kroki-sandbox` | `sandbox` | `kroki` | `service` |
| `kroki-remote` | `remote` | none | none |

`bundle-sandbox` and `kroki-sandbox` may both support the same tag. That is a same-placement ambiguity unless the user binds the tag to one processor.

## Status model

A single container and a Compose stack need the same status vocabulary:

```typescript
type SandboxState = "ready" | "partial" | "stopped" | "absent" | "error";

interface SandboxComponentStatus {
  id: string;
  state: SandboxState;
  message?: string;
}

interface SandboxStatus {
  state: SandboxState;
  endpoint?: string;
  message: string;
  components?: readonly SandboxComponentStatus[];
}
```

Rules:

1. `ready` means the processor can use the sandbox now.
2. `partial` means a multi-component sandbox exists but at least one component is not ready.
3. Processor availability is `ok` only for `ready` in CV9; partial tag-specific availability can wait for CV7 companion tags.
4. `/fence doctor` explains `partial` with component details.

## Exec sandbox seam

`bundle-sandbox` needs more than plain `ShellRunner` because some tools use stdin/stdout and others require files. The controller should expose an exec environment or workspace abstraction:

```typescript
interface ExecSandboxEnvironment {
  run(command: string, args: readonly string[], options?: RunOptions): Promise<RunResult>;
  createWorkspace(): Promise<ExecSandboxWorkspace>;
}

interface ExecSandboxWorkspace {
  path(name: string): string;
  writeText(name: string, contents: string): Promise<void>;
  readBuffer(name: string): Promise<Buffer>;
  dispose(): Promise<void>;
}
```

`bundle-sandbox` is one processor with internal handlers:

```text
bundle-sandbox
  graphviz handler -> dot -Tpng
  mermaid handler  -> mmdc -i input.mmd -o output.png
```

Those handlers are not registered processors; they are private implementation details of the bundle processor.

## Naming rule

Sandbox processor ids follow `<family>-sandbox[-variant]`:

1. Use `bundle-sandbox` for the bundled exec backend.
2. Use `kroki-sandbox` for the managed Kroki service backend.
3. Add a variant only when multiple same-family sandbox processors can coexist, such as `graphviz-sandbox-docker` and `graphviz-sandbox-podman`.
4. Keep runtime names in `sandboxes.*.runtime` unless they are needed to disambiguate simultaneously registered processors.

## Done criterion

1. The final story spec clearly defines what `sandbox` means and what it does not mean.
2. The config model has an explicit `sandboxes` section with `bundle` and `kroki` as the first sandbox ids.
3. Sandbox kind is represented as `exec` or `service`.
4. Sandbox runtime is represented by an enum/union, initially Docker-backed but not named simply `docker` in domain code where container vs compose matters.
5. The existing Kroki Docker lifecycle can be represented behind a sandbox controller interface.
6. The bundle exec workflow can be represented without registering one processor per bundled binary.
7. `kroki-remote` remains remote even when pointed at `http://localhost:*`.
8. Auto-start is owned by sandbox controllers, not by the resolver; during the transition, `sandboxes.kroki.autoStart` with `runtime: "docker-container"` is bridged to the existing single-container Kroki Docker manager, while `kroki.docker.autoStart` remains a legacy alias.
9. Resolver tests prove `sandbox` participates in precedence like any other placement.
10. Unit tests cover controller status normalization with `FakeShellRunner` for one-container and multi-component cases.
11. `pnpm run feedback` and `pnpm run inspect` pass.

## Scope

**In scope:**

1. Sandbox terms, types, config shape, and status model.
2. Controller interface for `exec` and `service` sandboxes.
3. Workspace/exec seam needed by `bundle-sandbox`.
4. Design constraints for `bundle-sandbox`, `kroki-sandbox`, and `kroki-remote`.
5. Tests for status normalization and resolver participation using `FakeShellRunner` and inline fake processors.

**Out of scope:**

1. Building the bundle image — S5.
2. Implementing `bundle-sandbox` — S5.
3. Implementing `kroki-sandbox` — S6.
4. Podman, Kubernetes, devcontainers, or arbitrary process supervisors.
5. A general plugin API for third-party sandbox controllers.
6. Companion backend tag registration from CV7.E2.

## Plan

1. **Config contract.** Add named `sandboxes` config for `bundle` and `kroki`, with explicit `kind`, `runtime`, optional `image`, and opt-in `autoStart`. Invalid sandbox policy fails closed. `sandboxes.kroki.autoStart` is wired only for the existing `docker-container` Kroki manager until the S6 `docker-compose` service controller exists.
2. **Controller contract.** Add sandbox status/lifecycle interfaces, exec workspace interfaces, Docker-backed status normalization for one-container and multi-component runtimes, and an adapter shape for the existing Kroki Docker lifecycle.
3. **Resolution contract.** Prove fake sandbox processors participate in placement precedence and same-placement ambiguity without introducing concrete sandbox processors.
4. **Verification.** Run the fast feedback gate, completion inspection, and the live-gate decision required by any new ShellRunner-backed seam.

## Tests

1. **Layers touched:**
   - **Unit** — config, controller/status normalization, resolver precedence with sandbox processors.
2. **Events / interactions covered:**
   - `autoStart` is config accepted by controllers, not by the resolver.
   - `sandboxes.kroki.autoStart` with `runtime: "docker-container"` starts the current single-container Kroki manager; `kroki.docker.autoStart` remains supported for compatibility.
   - `partial` status is unavailable for processor selection in CV9.
   - `bundle-sandbox` and `kroki-sandbox` create same-placement ambiguity when both support a tag.
   - Remote endpoint config alone does not make a processor `sandbox`.
3. **Fakes added:** no new fake class; controller status tests use existing `FakeShellRunner`, and resolver tests use inline fake processors.
4. **Live tests:** concrete sandbox live gates land in S5/S6; S4 records the live-gate decision for the new ShellRunner-backed status seam.
5. **Deferred:** non-Docker runtimes and third-party sandbox controller registration.

## Verification

```bash
pnpm run feedback
pnpm run inspect
```

## Ready decisions

1. Sandbox images are always configurable on the named sandbox config, with defaults supplied by production code when a controller needs them.
2. S4 accepts the generic `docker-container` and `docker-compose` runtime values in the domain model. The default config names `bundle` as `exec` + `docker-container` and `kroki` as `service` + `docker-container`; only the Kroki single-container bridge has runtime behavior in S4. The `bundle-sandbox` processor lands with S5, and the `docker-compose` Kroki controller lands with S6.
3. Sandbox lifecycle commands stay out of S4. User-facing commands can land with the concrete sandbox processors in S5/S6.
