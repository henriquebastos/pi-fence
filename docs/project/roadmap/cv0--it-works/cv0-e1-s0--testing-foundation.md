# CV0.E1.S0 — Testing foundation

**Status:** Done

**Epic:** [CV0.E1 — Kroki Through The Wire](cv0-e1--kroki-through-the-wire.md)
**Date:** 2026-04-18

## Summary

The test architecture pi-fence will use for every story after this one. No feature code yet. Ships: vitest setup, `tests/` tree, the three I/O-seam interfaces with fakes (`ShellRunner`, `HttpClient`, `Logger`), a `FakeExtensionAPI`, a Docker image for live dependencies (graphviz-only at this point), and container-lifecycle scripts.

Every piece of infrastructure S0 delivers is exercised by its own self-test. Infra without its own test would ship unverified and violate the project's own rule.

## Done criterion

On a fresh clone on macOS or Linux:

1. `pnpm install` succeeds.
2. `pnpm test` runs the unit and extension self-tests to completion and exits green. No Docker required.
3. `pnpm live:up` pulls and starts the `pi-fence-live-deps` container; `pnpm live:status` reports it running.
4. `pnpm test:live` runs the integration self-test against the container and exits green.
5. `pnpm live:down` stops and removes the container cleanly.
6. A contributor reading `docs/product/principles.md` can point to where every guarantee in its Testing section is enforced in code.

## What counts as S0 being "done"

Not "the testing infrastructure is good." Good is subjective. **S0 is done when every interface, fake, runner, image, and script S0 introduces has at least one passing self-test that exercises it for real.** No dead code.

## What lands in S0 vs. later stories

| Concern | S0 delivers | Deferred to |
|---------|-------------|-------------|
| Test runner, `tests/` tree | ✅ | — |
| `ShellRunner` / `HttpClient` / `Logger` interfaces | ✅ | — |
| `Node*` and `Fake*` implementations | ✅ | — |
| `DockerExecShellRunner` | ✅ | — |
| `FakeExtensionAPI` | ✅ | — |
| `docker/Dockerfile` with graphviz | ✅ | — |
| `scripts/live-container.ts` | ✅ | — |
| `.github/workflows/` skeleton | ✅ | — |
| Self-tests for every piece above | ✅ | — |
| `FenceProcessor` interface | — | S1 |
| Parser, registry, renderer code | — | S1 |
| Kroki processor | — | S1 |
| Contract test for `FenceProcessor` | — | S1 |
| Real extension test with pi-fence code | — | S1 |
| Real integration test rendering a diagram | — | S1 |

The principle: infrastructure earns its place only with a test that actually uses it. Infrastructure for things that don't exist yet would be dead code.

## Scope

### In scope

See [Plan](#plan), especially Deliverables.

### Out of scope

- Any `FenceProcessor` interface, parser, registry, renderer (all S1).
- Any real processor (Kroki, graphviz) (S1+).
- Contract-layer tests (need `FenceProcessor` interface first).
- Refresh-fixtures logic (no fixtures to refresh yet).
- Windows-specific handling in `DockerExecShellRunner` (YAGNI; add when a Windows contributor hits it).
- `mmdc`, `d2`, `plantuml` in the Docker image (add with their processor stories).
- Publishing the Docker image to ghcr.io (needs public repo + credentials).
- Wiring GitHub Actions to a real remote (needs public repo).

## Approach

pi-fence has a testing architecture ready for every story that follows. vitest runs fast tests on every machine. Live tests run inside a dedicated Docker container on any host with Docker. Every piece of infrastructure S0 introduces is exercised by a self-test that proves the wiring works.

## Plan

### Deliverables

#### 1. vitest setup

`vitest.config.ts` at the repo root. Minimal config:

- `test.include: ["tests/**/*.test.ts"]`
- `test.environment: "node"` (default; no jsdom)
- `test.globals: false` — imports from `"vitest"` are explicit; no global `describe`/`it`.
- Workspace aware if we ever need it (not today).

`package.json` gains four scripts:

- `test` — `vitest run` (unit, contract, extension).
- `test:live` — `vitest run tests/integration` (integration layer only).
- `test:watch` — `vitest` (interactive).
- `test:all` — `pnpm test && pnpm test:live` (convenience; rarely used directly).

The `test` script must **not** include `tests/integration/`. Default `pnpm test` stays Docker-free and network-free.

#### 2. `tests/` tree

```text
tests/
├── unit/
│   └── example.test.ts                  # trivial unit test proving vitest runs
├── contract/                            # empty; first contract test ships with S1
│   └── .gitkeep
├── extension/
│   └── example.test.ts                  # pi SDK session + fake streamFn
├── integration/
│   └── example.live.test.ts             # docker exec self-test
├── utilities/
│   ├── shell-runner.ts
│   ├── shell-runner.test.ts
│   ├── http-client.ts
│   ├── http-client.test.ts
│   ├── logger.ts
│   ├── logger.test.ts
│   ├── extension-api.ts
│   ├── extension-api.test.ts
│   ├── live-deps.ts
│   ├── live-deps.test.ts
│   └── temp-dir.ts                      # thin wrapper: mkdtempSync + afterEach cleanup
└── fixtures/
    └── .gitkeep                         # grows as fixtures land
```

Utility tests live under `tests/utilities/` alongside the utility they exercise. Feature tests stay under their layer directory. This is the one exception to the "no co-location" rule, justified because utility self-tests are not feature tests.

#### 3. `ShellRunner` interface — three impls + self-tests

`tests/utilities/shell-runner.ts`:

```ts
export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ShellRunner {
  run(cmd: string, args: string[], opts?: { cwd?: string; input?: string; signal?: AbortSignal }): Promise<ShellResult>;
}
```

Three implementations:

- `NodeShellRunner` — thin wrapper over `node:child_process` `execFile`.
- `DockerExecShellRunner` — given a container name at construction, every `run()` becomes `execFile("docker", ["exec", "-i", containerName, cmd, ...args])` with stdin piping when `opts.input` is set.
- `FakeShellRunner` — captures every call into an array; returns canned results programmed via `.setResponse(cmd, result)` or a default.

`tests/utilities/shell-runner.test.ts`:

- `NodeShellRunner` runs `/bin/echo hi` (or `cmd /c echo hi` on Windows in a `skipIf`), asserts stdout matches.
- `FakeShellRunner` records calls and returns programmed responses; asserts capture/replay semantics.
- `DockerExecShellRunner`: only runs under `tests/integration/` because it requires a real Docker daemon. Its self-test is in deliverable 10 below.

#### 4. `HttpClient` interface — two impls + self-tests

`tests/utilities/http-client.ts`:

```ts
export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

export interface HttpClient {
  request(input: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: string | Buffer;
    signal?: AbortSignal;
  }): Promise<HttpResponse>;
}
```

- `NodeHttpClient` — thin wrapper over the global `fetch`. Returns `Buffer` for binary-safe bodies.
- `FakeHttpClient` — captures every request; returns canned responses programmed per (method, url).

Self-test (`http-client.test.ts`) exercises `FakeHttpClient` with capture/replay. `NodeHttpClient` is exercised live only (see deliverable 10), since unit-testing `fetch` wrapping buys us little.

#### 5. `Logger` interface — two impls + self-tests

`tests/utilities/logger.ts`:

```ts
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  subsystem: string;
  message: string;
  meta?: Record<string, unknown>;
  timestamp: number;
}

export interface Logger {
  debug(subsystem: string, message: string, meta?: Record<string, unknown>): void;
  info(subsystem: string, message: string, meta?: Record<string, unknown>): void;
  warn(subsystem: string, message: string, meta?: Record<string, unknown>): void;
  error(subsystem: string, message: string, meta?: Record<string, unknown>): void;
}
```

- `NodeLogger` — writes to `process.stderr`, prefixed `[pi-fence:<subsystem>] level: message`. Filtered by `PI_FENCE_LOG_LEVEL` env var (default `info`).
- `FakeLogger` — captures every call into a `LogEntry[]` accessible via `.entries`.

Self-test: `FakeLogger` capture/replay; `NodeLogger` writes expected lines (spy on `process.stderr.write`).

#### 6. `FakeExtensionAPI`

`tests/utilities/extension-api.ts`:

A minimal implementation of pi's `ExtensionAPI` surface sufficient for unit-like tests of pi-fence's hooks without spinning up a full pi SDK session. Captures calls to `sendMessage`, `sendUserMessage`, `registerMessageRenderer`, `registerCommand`, `registerTool`, `on`, and enough context shape to exercise our handlers.

This is a **test fake**, not a mock — it's a real object with a real data shape. It's not a substitute for the extension-level tests that use a real pi SDK session; it's a stepping-stone for quickly asserting hook behavior in isolation.

Self-test: register a fake handler for `agent_end`, invoke via the fake's dispatch helper, assert capture.

Scope note: pi's `ExtensionAPI` is large. The fake starts with just what pi-fence will actually use. Adding methods as new stories need them is routine maintenance.

#### 7. `requireContainer()` / live-deps helper

`tests/utilities/live-deps.ts`:

```ts
export async function hasContainer(name: string): Promise<boolean>;
export async function hasNetwork(target?: string): Promise<boolean>;
```

Used by integration tests:

```ts
const running = await hasContainer("pi-fence-live-deps");
describe.skipIf(!running)("graphviz via docker", () => { ... });
```

Self-test: `hasContainer("definitely-not-running")` returns false without throwing.

#### 8. `docker/Dockerfile` — graphviz only

Minimal image. `FROM node:22-slim`. Installs `graphviz` via apt. Does **not** install `mmdc`, `d2`, or `plantuml` — those land with their respective processor stories.

```dockerfile
FROM node:22-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       graphviz \
       ca-certificates \
    && rm -rf /var/lib/apt/lists/*

CMD ["sleep", "infinity"]
```

Tag: `ghcr.io/henriquebastos/pi-fence-live-deps:0.1.0`. The version is pinned in `scripts/live-container.ts` as a constant; bumping it is a deliberate act.

The image is built but not pushed in S0. Pushing to ghcr.io requires the public repo and credentials; we land the Dockerfile and local `docker build` workflow now, and wire the publish pipeline when the repo goes public.

#### 9. `scripts/live-container.ts` — lifecycle CLI

Subcommands:

- `pnpm live:up` — `docker pull` then `docker run -d --name pi-fence-live-deps <image>`. Idempotent; running twice prints "already running" and exits 0.
- `pnpm live:down` — `docker stop` then `docker rm`. Silent success on "not running".
- `pnpm live:status` — `running` / `stopped` / `absent` to stdout.
- `pnpm live:exec -- <cmd> [args...]` — shortcut for `docker exec pi-fence-live-deps <cmd>`; useful for debugging.
- `pnpm live:build` — `docker build -t <pinned-tag> docker/`.

Errors print actionable messages ("docker command not found — install Docker Desktop or the docker CLI and try again").

#### 10. Exemplar tests

Every piece of infrastructure above has a self-test under `tests/utilities/`. The four *exemplar* tests demonstrate the pattern for each layer:

**`tests/unit/example.test.ts`** — trivial pure-function sanity check. Proves vitest runs at all. ≤ 10 lines. Deleted by S1 when the parser test takes its place.

**`tests/extension/example.test.ts`** — stands up a real pi SDK `AgentSession`, overrides `session.agent.streamFn` to emit a canned assistant message (`"Hello from a fake LLM"`), calls `session.prompt("hi")`, and asserts the session reaches `agent_end` without throwing. No pi-fence code involved yet. Proves:

- The `createAgentSession` pattern works against the installed pi-coding-agent.
- `session.agent.streamFn` is a viable fake-LLM seam.
- A test can subscribe to `session.subscribe(...)` and assert lifecycle transitions.

Deleted by S1 when a real extension test replaces it.

**`tests/integration/example.live.test.ts`** — `describe.skipIf(!await hasContainer("pi-fence-live-deps"))`. Constructs a `DockerExecShellRunner`, runs `echo hello` inside the container, asserts stdout is `hello\n`. Proves:

- Docker daemon is reachable.
- The container is running.
- `DockerExecShellRunner` correctly shells out to `docker exec` and captures stdio.
- `skipIf` behaves cleanly when the container isn't running.

Deleted by S1 when the graphviz-live integration test replaces it.

**Contract tests are deferred.** No contract to test yet.

#### 11. `scripts/refresh-fixtures.ts` — skeleton

Empty-but-typed. Exports a `refresh(tag: string, manifestPath: string)` function. Body is `throw new Error("no fixtures to refresh yet")`. Future stories add real refresh logic as processors land.

Self-test: calling `refresh("mermaid", ...)` throws the expected error. Proves the entry point exists and the wiring to `package.json` works.

#### 12. GitHub Actions skeleton

Two workflow files, valid YAML, runnable but no remote to run them on yet:

- `.github/workflows/ci.yml` — runs on push + PR. `pnpm install`, `pnpm run check`, `pnpm test`. Ubuntu latest + macOS latest matrix.
- `.github/workflows/live.yml` — runs nightly + `workflow_dispatch`. `pnpm install`, `pnpm live:up`, `pnpm test:live`, `pnpm live:down`. Ubuntu latest only.

Committed dormant. When the repo goes public and has a remote, these activate automatically.

### Implementation order

Test-first at every step. Each step ends green (`pnpm test` passes).

| Step | What | Commit prefix |
|------|------|---------------|
| 1 | Install vitest, @types/node; write `vitest.config.ts`, `package.json` scripts; write `tests/unit/example.test.ts` (trivial passing test) | `wip(agent): vitest setup with trivial unit example` |
| 2 | `tests/utilities/temp-dir.ts` + self-test (tempdir created, cleaned up) | `wip(agent): temp-dir test utility` |
| 3 | `ShellRunner` interface; `FakeShellRunner` + self-test; `NodeShellRunner` + self-test | `wip(agent): ShellRunner with fake and node impls` |
| 4 | `HttpClient` interface; `FakeHttpClient` + self-test; `NodeHttpClient` stubbed (no self-test yet, exercised in integration) | `wip(agent): HttpClient interface with fake impl` |
| 5 | `Logger` interface; `FakeLogger` + self-test; `NodeLogger` + self-test | `wip(agent): Logger with fake and node impls` |
| 6 | `FakeExtensionAPI` + self-test | `wip(agent): FakeExtensionAPI test utility` |
| 7 | `tests/extension/example.test.ts` using real pi SDK `createAgentSession` + `streamFn` override | `wip(agent): extension-layer exemplar with fake LLM stream` |
| 8 | `docker/Dockerfile` with graphviz; can `docker build` locally | `wip(agent): docker image for live deps (graphviz only)` |
| 9 | `scripts/live-container.ts` up/down/status/exec/build; self-test for `hasContainer()` | `wip(agent): live-container lifecycle CLI` |
| 10 | `DockerExecShellRunner`; `tests/integration/example.live.test.ts` with `skipIf(!hasContainer)` | `wip(agent): DockerExecShellRunner with live exemplar` |
| 11 | `scripts/refresh-fixtures.ts` skeleton with self-test | `wip(agent): refresh-fixtures script skeleton` |
| 12 | `.github/workflows/ci.yml` + `live.yml` | `wip(agent): CI workflow skeletons (dormant)` |
| 13 | Update `docs/getting-started.md` with the new dev-setup dance (pnpm, live:up, test runs); update `CHANGELOG.md` | `wip(agent): document testing workflow in getting-started` |
| 14 | Update worklog and close S0 | `wip(agent): close CV0.E1.S0` |

Each step's self-test is written before its implementation. No step ships infra without a test proving the infra works.

## Tests

Since S0 *is* the testing foundation, this section is recursive: the tests land alongside their implementations. But to be explicit about what S0 commits to:

**Test layers touched by S0:**

- **Unit** (`tests/unit/`): one exemplar test. Deleted by S1.
- **Contract** (`tests/contract/`): empty at S0 end; first contract test ships with S1.
- **Extension** (`tests/extension/`): one exemplar using real pi SDK + fake LLM stream. Deleted by S1.
- **Integration (live)** (`tests/integration/`): one exemplar using `DockerExecShellRunner`. Deleted by S1.
- **Utility self-tests** (`tests/utilities/*.test.ts`): one per utility S0 introduces. Permanent.

**Events / interactions covered:**

- pi SDK `AgentSession` lifecycle (`message_update`, `message_end`, `agent_end`) observed via `session.subscribe`. Proves the subscribe path works for future pi-fence extension tests.
- `session.agent.streamFn` override. Proves the fake-LLM pattern.
- `docker exec` against a running container. Proves the live-deps container pattern.
- `describe.skipIf(...)` behavior when live deps absent. Proves CI stays green without Docker.

**Fakes added to `tests/utilities/`:**

`FakeShellRunner`, `FakeHttpClient`, `FakeLogger`, `FakeExtensionAPI`. Each with a self-test.

**Live tests added:**

`tests/integration/example.live.test.ts` — a `DockerExecShellRunner` running `echo hello`. Replaced in S1 by the real graphviz integration test (S1's Kroki path doesn't use the container, but S1 keeps a placeholder integration test ready for graphviz-local in CV0.E2).

**Deferred to future stories:**

- Contract test for `FenceProcessor` — the interface doesn't exist yet.
- Any test of a real processor (Kroki, graphviz) — processors don't exist yet.
- CI workflow execution — requires a public repo with a remote.
- Windows CI — requires validating `DockerExecShellRunner` on Windows hosts; deferred until someone actually uses pi-fence on Windows.

## Verification

### Gate

From a clean clone on macOS or Linux:

1. `pnpm install` — succeeds.
2. `pnpm run check` — docs link/markdown checks pass.
3. `pnpm test` — all unit, extension, and utility self-tests pass without Docker.
4. `pnpm live:build` — builds the image locally.
5. `pnpm live:up` — container starts.
6. `pnpm live:status` — prints `running`.
7. `pnpm test:live` — integration exemplar passes.
8. `pnpm live:down` — container gone.
9. After step 8, `pnpm test:live` again — integration exemplar `skipIf`s cleanly, vitest reports the suite as skipped (not failed).

CI skeleton:

1. `.github/workflows/ci.yml` — valid YAML, `actionlint` (if available) reports no errors.
2. `.github/workflows/live.yml` — same.

This guide verifies that the testing foundation itself works. It is not a test of pi-fence's features — pi-fence has no features yet at this point. It is a test of the infrastructure every later story will build on.

### Prerequisites

- Clean clone of the repo, or at minimum no uncommitted changes in `tests/`, `docker/`, or `scripts/`.
- Node 22+ (matches the Dockerfile base image).
- pnpm 10.x (matches `packageManager` pin).
- Docker Desktop or the Docker CLI for live-test steps. Skippable for fast-test steps.
- macOS or Linux. Windows can still run the fast tests; live tests require Docker Desktop.

### Automated tests

All automated tests are checked in. Running them:

```bash
pnpm install
pnpm run check          # docs lint (not part of this story; must stay green)
pnpm test               # unit + extension + utility self-tests
```

Expect: green, zero failures, all utilities' self-tests present.

If Docker is running and the container has been started:

```bash
pnpm live:up            # pulls/builds image, starts container
pnpm test:live          # integration exemplar
pnpm live:down          # clean up
```

Expect: integration exemplar passes.

Without Docker:

```bash
pnpm test:live          # should SKIP, not FAIL
```

Expect: vitest reports the suite as skipped with a clear message about the missing container.

### Manual test script

Run from the repo root.

#### 1. Fresh clone check

```bash
cd /tmp && git clone $YOUR_REPO pi-fence-test && cd pi-fence-test
pnpm install
pnpm test
```

Expect:

- `pnpm install` completes.
- `pnpm test` runs and exits 0.
- No warnings about missing peers, missing types, or unresolved imports.

#### 2. Fast-path completeness

```bash
pnpm test -- --reporter=verbose
```

Expect, in the output:

- `tests/unit/example.test.ts` — passes.
- `tests/extension/example.test.ts` — passes (a real pi SDK session ran with a fake LLM stream).
- `tests/utilities/shell-runner.test.ts` — passes (at least: `FakeShellRunner` capture/replay, `NodeShellRunner` runs a real binary).
- `tests/utilities/http-client.test.ts` — passes.
- `tests/utilities/logger.test.ts` — passes.
- `tests/utilities/extension-api.test.ts` — passes.
- `tests/utilities/live-deps.test.ts` — passes.
- `tests/integration/` — NOT in this run. The fast `test` script excludes it.

#### 3. Docker path (Linux or macOS with Docker running)

```bash
pnpm live:build       # first time only, unless pulling from ghcr
pnpm live:up
pnpm live:status
```

Expect: `running`.

```bash
pnpm live:exec -- dot -V
```

Expect: graphviz version string on stderr. Proves `dot` is inside the image and reachable via `docker exec`.

```bash
pnpm test:live
```

Expect:

- `tests/integration/example.live.test.ts` runs.
- `DockerExecShellRunner` executes `echo hello` inside the container.
- Assertion on stdout passes.
- Whole suite exits 0.

```bash
pnpm live:down
pnpm live:status
```

Expect: `absent` or `stopped`.

#### 4. Graceful skip when Docker is absent or container not running

```bash
pnpm live:down        # ensure container is gone
pnpm test:live
```

Expect:

- vitest starts.
- The integration describe block is marked `skipped`, not `failed`.
- Exit code is 0.
- The skip reason names the missing container.

#### 5. Temp-dir hygiene

Every test that uses the filesystem uses `tests/utilities/temp-dir.ts`, which creates a directory under `os.tmpdir()` and removes it in `afterEach`.

```bash
ls /tmp | grep pi-fence-
```

Expect: empty or only stale dirs from long-ago unclean exits. A just-completed `pnpm test` should leave no new `pi-fence-*` dirs behind.

If any directories persist after a clean test run, that's a real bug: some test isn't cleaning up. File it.

#### 6. No host-filesystem leakage

After running `pnpm test`:

```bash
ls ~/.pi/agent/              # pi's own dir
```

Expect: unchanged. No `pi-fence-*` files or directories; no modification of `settings.json`, `auth.json`, or session files.

Run:

```bash
ls ~/.pi-fence* 2>/dev/null ; ls ~/pi-fence* 2>/dev/null
```

Expect: nothing. pi-fence does not touch the user's home outside `os.tmpdir()`.

#### 7. Watch mode

```bash
pnpm test:watch
```

Edit a trivial `tests/unit/example.test.ts` — change an assertion. Expect: vitest re-runs automatically, shows the failure, then passing when reverted.

Ctrl+C to exit.

#### 8. CI workflow syntax

```bash
# if you have actionlint installed:
actionlint .github/workflows/*.yml
```

Expect: no errors. The workflows are valid YAML with a valid GitHub Actions schema, even though there's no remote yet.

If `actionlint` isn't installed: visual inspection should show the files parse as YAML and reference only valid Actions (`actions/checkout@v4`, `pnpm/action-setup@v4`, etc.).

### Troubleshooting

**`pnpm: command not found`** — run `corepack enable` then retry, or install pnpm 10.x directly.

**`docker: command not found`** — install Docker Desktop (macOS/Windows) or the docker package (Linux). Restart your shell so `docker` is in PATH.

**`pnpm live:up` hangs on pull** — ghcr may be slow; the first pull is several hundred MB. Subsequent runs use the local cache.

**`pnpm test:live` fails with "container not found"** — you ran it without `pnpm live:up` first, or the container died. Check `pnpm live:status`.

**`pnpm test:live` fails with a permission error on `docker exec`** — your user isn't in the `docker` group (Linux). Either add yourself and log out/in, or run with sudo (not recommended for daily work).

**A test creates files under `~/.pi/agent/`** — bug. All pi-fence tests must scope their filesystem work to `os.tmpdir()` via `tests/utilities/temp-dir.ts`.

**Watch mode misses a file change** — vitest's watcher occasionally misses changes on certain filesystems (network shares, some Docker volumes). Restart the watch.

## Key files

**New:**

- `vitest.config.ts`
- `tests/` (entire tree)
- `docker/Dockerfile`
- `scripts/live-container.ts`
- `scripts/refresh-fixtures.ts`
- `.github/workflows/ci.yml`
- `.github/workflows/live.yml`

**Changed:**

- `package.json` — adds vitest to devDependencies; adds `test`, `test:live`, `test:watch`, `test:all`, `live:up`, `live:down`, `live:status`, `live:exec`, `live:build`, `refresh-fixtures` scripts.
- `docs/getting-started.md` — documents dev setup with pnpm install + live:up + test.
- `CHANGELOG.md` — entries for infrastructure landings.
- `docs/process/worklog.md` — closing entry for S0.
