# CVx.E3.S3 — Production-owned runtime seams

**Status:** Done

**Epic:** [CVx.E3 — Refactor Confidence](cvx-e3--refactor-confidence.md)
**Depends on:** [CVx.E3.S2 — Architecture map + hotspot inventory](cvx-e3-s2--architecture-map.md)
**Date:** 2026-04-22 (spec)

## Summary

`CVx.E3.S2` named the current architecture truthfully. The most important mismatch it surfaced is now explicit:

- the extension runtime already uses dependency injection at its environment boundaries,
- but the runtime seams it injects (`HttpClient`, `ShellRunner`, `Logger`) still live under `tests/utilities/`,
- and `extensions/pi-fence/config.ts` still mixes ambient Node reads with pure validation/merge logic.

That means the architecture is better than the repository layout suggests. The next step is not a broad redesign; it is to make ownership truthful.

S3 promotes the runtime seams into production-owned modules, leaves test fakes in `tests/utilities/` where they belong, and extracts the config file discovery/read path into an explicit edge-owned loader so the pure config logic can stay pure.

No user-visible behavior should change. The output is a cleaner boundary map that makes `S4`'s composition-root slimming smaller and safer.

## Done criterion

The extension runtime's environment boundaries are production-owned and visible at the edge.

1. `HttpClient`, `ShellRunner`, and `Logger` interfaces live under production code (`extensions/pi-fence/io/` or an equivalent production-owned path), alongside their production Node implementations.
2. Production modules under `extensions/pi-fence/` no longer import those seams from `tests/utilities/`.
3. Test fakes remain under `tests/utilities/`, but they implement/import the production-owned seam contracts instead of defining the seam home themselves.
4. Live-only test helpers stay test-owned. In particular, `DockerExecShellRunner` remains a test/live utility even if it imports the production-owned `ShellRunner` contract or `NodeShellRunner` implementation.
5. The ambient config-discovery/read path is explicit at the edge rather than mixed into the same module as pure config validation/merge logic.
   - `extensions/pi-fence/config.ts` (or an equivalent pure config module) owns defaults, validation, and merge behavior.
   - a production-owned loader module owns `fs`, `path`, `homedir()`, and `process.cwd()` reads.
6. The extension's behavior is unchanged:
   - same processor resolution,
   - same config precedence,
   - same logger output semantics,
   - same live/test behavior.
7. The fast gate is green, and the seam move is covered by the existing unit / contract / extension / live tests, plus any small targeted tests needed by the config split.
8. The architecture note stays truthful after the move.

## Scope

**In scope:**

- Production-owned seam modules for:
  1. `HttpClient`
  2. `ShellRunner`
  3. `Logger`
- Moving `NodeHttpClient`, `NodeShellRunner`, and `NodeLogger` to the production-owned seam home.
- Updating production imports to the new paths.
- Keeping `FakeHttpClient`, `FakeShellRunner`, and `FakeLogger` in `tests/utilities/`, rewritten as test implementations of the production contracts.
- Keeping live-only helpers (`DockerExecShellRunner`) in the test/live lane.
- Extracting the config file discovery/read path from the pure config validation/merge logic.
- Small test reshaping where needed to preserve clear ownership after the move.
- Architecture-note touch-up if the final paths differ from the draft map.

**Out of scope:**

- A generic filesystem abstraction for the whole repo.
- Splitting `extensions/pi-fence/index.ts` into focused orchestration modules — that is `CVx.E3.S4`.
- Internal API/naming polish beyond what the seam move requires — that is `CVx.E3.S5`.
- Moving repo-tooling helpers (`scripts/verify/**`) out of their current lane just because they import test utilities.
- New user-facing behavior, commands, processors, or config knobs.
- Changing logger format, env-var names, or Kroki/graphviz behavior.

## Approach

Move the seams, not the whole architecture.

S3 should be disciplined about three rules:

1. **Promote only real runtime seams.** `HttpClient`, `ShellRunner`, and `Logger` are already real boundaries. Pure modules like `parser.ts`, `resolve.ts`, and `list.ts` do not need new abstractions.
2. **Use a targeted config boundary, not a generic FS service.** The problem in `config.ts` is specific: file discovery/reads are mixed with pure config logic. Solve that directly instead of inventing a repo-wide filesystem layer.
3. **Keep tooling-lane helpers in the tooling lane unless a shared production API is actually earned.** `DockerExecShellRunner` and verifier helpers are not extension-runtime seams.

The guiding idea is ownership honesty:

- production contracts live in production code,
- production adapters import them from production code,
- tests implement or wrap them from tests,
- the composition root wires them at the edge.

## Plan

### Deliverables

#### 1. Production-owned seam modules under `extensions/pi-fence/io/`

Create production-owned seam modules, expected shape:

```text
extensions/pi-fence/io/
  http-client.ts
  shell-runner.ts
  logger.ts
```

Each module owns:

- the contract/interface,
- the production Node implementation,
- any small production-only helpers tightly coupled to that implementation.

Expected contents:

- `http-client.ts` — `HttpRequest`, `HttpResponse`, `HttpClient`, `NodeHttpClient`
- `shell-runner.ts` — `ShellResult`, `ShellRunOptions`, `ShellRunner`, `NodeShellRunner`
- `logger.ts` — `LogLevel`, `LogEntry`, `Logger`, `NodeLogger`, `shouldLog`

If a helper is only useful for tests/live tooling (`DockerExecShellRunner`), it stays out of this directory.

#### 2. Test utilities become test implementations of production contracts

Rewrite these files so they import the production seam contracts rather than acting as the seam home:

- `tests/utilities/http-client.ts`
- `tests/utilities/shell-runner.ts`
- `tests/utilities/logger.ts`

Expected target shape:

- `FakeHttpClient`, `FakeShellRunner`, `FakeLogger` stay in tests.
- `DockerExecShellRunner` stays in tests/live support.
- Shared type imports come from `extensions/pi-fence/io/*.ts`.

This preserves the repo's “fakes, not mocks” rule while making ownership truthful.

#### 3. Config loader split: pure config logic vs Node-side loader

Separate the mixed concerns currently inside `extensions/pi-fence/config.ts`.

Expected target shape:

1. **Pure config core** — defaults, validation, merge, maybe path-agnostic parsing helpers.
2. **Node-side loader** — file-path discovery + file reads + logging on bad files.

One acceptable shape:

```text
extensions/pi-fence/
  config.ts              # pure config defaults / validation / merge
extensions/pi-fence/io/
  config-loader.ts       # Node fs/path/os/cwd loader
```

Other equivalent shapes are fine if they preserve the rule: pure config behavior is callable without ambient reads; ambient reads stay at the edge.

Important constraint: do **not** invent a generic repo-wide `FileSystem` abstraction unless the implementation proves a truly reusable seam is needed. S3 earns a config loader, not a premature infrastructure layer.

#### 4. Production imports updated; runtime lane no longer imports seams from `tests/utilities/`

At story close, this should be true for the extension runtime:

```bash
rg -n 'from "\.\./\.\./tests/utilities/' extensions/pi-fence
```

Expected result: no matches.

Script-side matches may remain if they are tooling-lane and deliberately test-owned.

#### 5. Tests updated around ownership, not behavior churn

Existing tests already cover most runtime behavior. S3 should add only the targeted coverage the seam move actually needs.

Expected touches:

- config tests split or retargeted so pure config behavior stays unit-tested after the loader split,
- seam utility self-tests updated to import the production contracts,
- extension/runtime tests updated for new import paths only where necessary,
- live tests unchanged in behavior, except for import-path fallout.

#### 6. Architecture note refresh

Update `docs/project/architecture.md` only as needed so it remains truthful about:

- where the seams now live,
- what remains for `S4`,
- what remains intentionally in the tooling lane.

### Implementation order

Atomic green commits only.

| Step | Layer | What | Commit |
|------|-------|------|--------|
| 1 | spec | Create the S3 story file and link it from `cvx-e3--refactor-confidence.md`. | `spec CVx.E3.S3` |
| 2 | runtime seams | Promote `HttpClient`, `ShellRunner`, and `Logger` contracts + Node impls into production-owned modules; update production imports. Keep tests green. | `step 1: make runtime seam ownership truthful` |
| 3 | config boundary | Split the config file loader from pure config validation/merge logic without changing behavior. | `step 2: move config file I/O to the edge` |
| 4 | tests + docs | Rewrite test utilities around the new ownership, refresh the architecture note if needed, and keep the fast/live gates green. | `step 3: align tests and docs with the production seam move` |
| 5 | close | Mark S3 done in roadmap/worklog once the seam move is verified. | `close CVx.E3.S3` |

## Tests

1. **Layers touched:**
   - **Unit** — config-core behavior after the split; seam utility self-tests if their imports or helper shapes move.
   - **Contract** — existing processor contracts should stay green unchanged.
   - **Extension** — extension wiring still resolves/render/logs the same way after import-path and config-loader changes.
   - **Integration / live** — rerun because `HttpClient` / `ShellRunner` are runtime seams and `DockerExecShellRunner` depends on the shell seam shape.

2. **Events / interactions covered:**
   - production code imports runtime seams from production-owned paths,
   - test fakes still satisfy the same contracts,
   - config precedence and malformed-file tolerance are unchanged after the loader split,
   - logger behavior remains unchanged,
   - no behavior regressions in graphviz-local or Kroki flows.

3. **Fakes added:**
   - None expected.

4. **Live tests added / updated:**
   - No new live scenarios expected.
   - Existing live seam consumers should be rerun because the seam home changes.

5. **Deferred:**
   - Thinning `extensions/pi-fence/index.ts` into a smaller composition root (`S4`).
   - Internal API/naming polish (`S5`).
   - Tooling-lane helper promotion, if any, unless a real shared non-test API emerges.

## Verification

### Gate

Minimum close gate:

```bash
pnpm install
pnpm run verify:fast
pnpm test:live
```

Expected:

1. `pnpm run verify:fast` exits 0.
2. `pnpm test:live` stays green or skips cleanly under the existing dependency gates.
3. Production runtime files no longer import seam contracts from `tests/utilities/`.
4. Config behavior is unchanged from the user's perspective.

### Prerequisites

Normal contributor setup, plus the existing live-test prerequisites if running `pnpm test:live` end-to-end.

```bash
pnpm install
# optionally, for live tests:
pnpm live:up
```

### Automated tests

```bash
pnpm run verify:fast
pnpm test:live
```

Plus a structural grep during development:

```bash
rg -n 'from "\.\./\.\./tests/utilities/' extensions/pi-fence
```

Expected: no matches at close.

### Manual test script

#### 1. Production seam home is visible

```bash
find extensions/pi-fence/io -maxdepth 1 -type f | sort
```

Expect production-owned seam files for HTTP, shell, and logging.

#### 2. Extension runtime no longer imports seams from tests

```bash
rg -n 'from "\.\./\.\./tests/utilities/' extensions/pi-fence
```

Expect no matches.

#### 3. Test utilities still own the fakes

```bash
rg -n 'class Fake(HttpClient|ShellRunner|Logger)|class DockerExecShellRunner' tests/utilities -g '*.ts'
```

Expect the fake/live-only helpers to remain in `tests/utilities/`, now importing contracts from production-owned modules.

#### 4. Config boundary is explicit

Open the config-related production files and confirm:

- pure validation/default/merge logic is callable without `fs`, `homedir()`, or `process.cwd()`,
- file-path discovery and file reads are in the loader layer,
- `index.ts` wires that loader at the edge.

#### 5. Behavior stayed put

Run:

```bash
pnpm run verify:fast
pnpm test:live
```

Expect the same behavior surface as before the seam move: same `/fence list`, same Kroki + graphviz-local rendering behavior, same config precedence.

### Rollback

S3 is internal architecture work. If it regresses, revert the seam-move commits and the previous import layout returns.

```bash
git revert <sha>
```

No user-data migration or fixture refresh is required.

## Key files

**Modified:**

- `extensions/pi-fence/index.ts`
- `extensions/pi-fence/config.ts`
- `extensions/pi-fence/kroki.ts`
- `extensions/pi-fence/graphviz-local.ts`
- new production-owned seam files under `extensions/pi-fence/io/`
- `tests/utilities/http-client.ts`
- `tests/utilities/shell-runner.ts`
- `tests/utilities/logger.ts`
- `tests/unit/config.test.ts`
- `docs/project/architecture.md`
- roadmap/worklog files at close

**New (expected):**

- `extensions/pi-fence/io/http-client.ts`
- `extensions/pi-fence/io/shell-runner.ts`
- `extensions/pi-fence/io/logger.ts`
- one config-loader file under `extensions/pi-fence/io/` or an equivalent production-owned path

## Out of scope — explicitly

- Splitting `extensions/pi-fence/index.ts` beyond what the seam move strictly requires.
- Reworking processor resolution, parser behavior, renderer behavior, or config semantics.
- Generic repo-wide filesystem / env abstractions.
- Moving verifier/tooling helpers just to make the tree look symmetrical.
- User-visible docs changes beyond architecture/refactor documentation.
- New features.
