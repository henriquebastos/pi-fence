[< S0](README.md)

# Test Guide: CV0.E1.S0 — Testing foundation

**Plan:** [plan.md](plan.md)
**Story:** [README.md](README.md)
**Epic:** [CV0.E1 — Kroki Through The Wire](../README.md)

This guide verifies that the testing foundation itself works. It is not a test of pi-fence's features — pi-fence has no features yet at this point. It is a test of the infrastructure every later story will build on.

---

## Prerequisites

- Clean clone of the repo, or at minimum no uncommitted changes in `tests/`, `docker/`, or `scripts/`.
- Node 22+ (matches the Dockerfile base image).
- pnpm 10.x (matches `packageManager` pin).
- Docker Desktop or the Docker CLI for live-test steps. Skippable for fast-test steps.
- macOS or Linux. Windows can still run the fast tests; live tests require Docker Desktop.

---

## Automated tests

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

---

## Manual test script

Run from the repo root.

### 1. Fresh clone check

```bash
cd /tmp && git clone $YOUR_REPO pi-fence-test && cd pi-fence-test
pnpm install
pnpm test
```

Expect:

- `pnpm install` completes.
- `pnpm test` runs and exits 0.
- No warnings about missing peers, missing types, or unresolved imports.

### 2. Fast-path completeness

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

### 3. Docker path (Linux or macOS with Docker running)

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

### 4. Graceful skip when Docker is absent or container not running

```bash
pnpm live:down        # ensure container is gone
pnpm test:live
```

Expect:

- vitest starts.
- The integration describe block is marked `skipped`, not `failed`.
- Exit code is 0.
- The skip reason names the missing container.

### 5. Temp-dir hygiene

Every test that uses the filesystem uses `tests/utilities/temp-dir.ts`, which creates a directory under `os.tmpdir()` and removes it in `afterEach`.

```bash
ls /tmp | grep pi-fence-
```

Expect: empty or only stale dirs from long-ago unclean exits. A just-completed `pnpm test` should leave no new `pi-fence-*` dirs behind.

If any directories persist after a clean test run, that's a real bug: some test isn't cleaning up. File it.

### 6. No host-filesystem leakage

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

### 7. Watch mode

```bash
pnpm test:watch
```

Edit a trivial `tests/unit/example.test.ts` — change an assertion. Expect: vitest re-runs automatically, shows the failure, then passing when reverted.

Ctrl+C to exit.

### 8. CI workflow syntax

```bash
# if you have actionlint installed:
actionlint .github/workflows/*.yml
```

Expect: no errors. The workflows are valid YAML with a valid GitHub Actions schema, even though there's no remote yet.

If `actionlint` isn't installed: visual inspection should show the files parse as YAML and reference only valid Actions (`actions/checkout@v4`, `pnpm/action-setup@v4`, etc.).

---

## Troubleshooting

**`pnpm: command not found`** — run `corepack enable` then retry, or install pnpm 10.x directly.

**`docker: command not found`** — install Docker Desktop (macOS/Windows) or the docker package (Linux). Restart your shell so `docker` is in PATH.

**`pnpm live:up` hangs on pull** — ghcr may be slow; the first pull is several hundred MB. Subsequent runs use the local cache.

**`pnpm test:live` fails with "container not found"** — you ran it without `pnpm live:up` first, or the container died. Check `pnpm live:status`.

**`pnpm test:live` fails with a permission error on `docker exec`** — your user isn't in the `docker` group (Linux). Either add yourself and log out/in, or run with sudo (not recommended for daily work).

**A test creates files under `~/.pi/agent/`** — bug. All pi-fence tests must scope their filesystem work to `os.tmpdir()` via `tests/utilities/temp-dir.ts`.

**Watch mode misses a file change** — vitest's watcher occasionally misses changes on certain filesystems (network shares, some Docker volumes). Restart the watch.

---

**See also:** [Plan](plan.md) · [Story](README.md) · [Principles — Testing](../../../../../product/principles.md#testing)
