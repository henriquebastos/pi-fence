[< S1](README.md)

# Plan: CV0.E2.S1 — Local graphviz processor with capability-based resolution

**Story:** [README.md](README.md)
**Epic:** [CV0.E2 — Graphviz Local](../README.md)
**Depends on:** [CV0.E1.S3 — `/fence list`](../../cv0-e1-kroki-through-the-wire/cv0-e1-s3-fence-list/README.md), [CV0.E1.S0 — Testing foundation](../../cv0-e1-kroki-through-the-wire/cv0-e1-s0-testing-foundation/README.md) (`ShellRunner`, `pi-fence-live-deps` container).
**Date:** 2026-04-20 (spec)

## Goal

A user with `graphviz` installed sees ```` ```dot ```` blocks rendered locally — no HTTP to `kroki.io` for that tag — while every other language Kroki handles continues through Kroki unchanged. A user without `graphviz` sees exactly the CV0.E1 behaviour. `/fence list` tells both users which processor handled which tag.

This is the first story where pi-fence's code stops assuming a single processor. The registry pattern appears here, minimally: a `FenceProcessor[]` and a `resolve(tag)` function. Explicit per-tag user overrides defer to S2.

---

## Deliverables

### 1. `FenceProcessor.available()` on the interface

`extensions/pi-fence/processor.ts` gains:

```ts
export type Availability =
  | { ok: true }
  | { ok: false; reason: string; installHint?: string };

export interface FenceProcessor {
  readonly id: string;
  readonly tags: readonly string[];
  readonly aliases: Readonly<Record<string, string>>;
  /**
   * One-shot capability probe. Called once at wire time by the extension;
   * the result is memoised for the session. A processor whose
   * availability changes mid-session is not visible until `/reload`.
   */
  available(): Promise<Availability>;
  render(tag: string, source: string, signal?: AbortSignal): Promise<FenceResult>;
}
```

The contract helper (`tests/contract/fence-processor.ts`) gains one assertion: `available()` returns a promise resolving to `{ ok: true }` or `{ ok: false, reason: <non-empty string>, installHint?: <string> }`. Shape-only; contract tests do not know whether a given processor *should* be available on the test machine.

Kroki's implementation is the one-liner `available: async () => ({ ok: true })`. Real endpoint-reachability probing defers to `/fence doctor` (not yet placed).

### 2. `graphviz-local` processor

New module `extensions/pi-fence/graphviz-local.ts`. Exports:

```ts
export const GRAPHVIZ_LOCAL_CANONICAL_TAGS: readonly string[] = ["graphviz"];
export const GRAPHVIZ_LOCAL_ALIASES: Readonly<Record<string, string>> = {
  dot: "graphviz",
};

export function createGraphvizLocalRenderer(
  shell: ShellRunner,
  logger?: Logger,
): FenceProcessor;
```

Behaviour:

- `id: "graphviz-local"`, `tags: GRAPHVIZ_LOCAL_CANONICAL_TAGS`, `aliases: GRAPHVIZ_LOCAL_ALIASES`.
- `available()`: `shell.run("dot", ["-V"])`. `exitCode === 0` → `{ ok: true }`. Any other result → `{ ok: false, reason: "dot binary not found on PATH", installHint: "Install via: apt install graphviz (Debian/Ubuntu) · brew install graphviz (macOS) · https://graphviz.org/download/" }`. A thrown error from the shell runner (spawn failure; `ENOENT`) is caught and mapped to the same `ok: false` result — never propagates.
- `render(tag, source, signal)`: `shell.run("dot", ["-Tpng"], { input: source, signal })`.
  - `exitCode === 0`: `{ ok: true, png: Buffer.from(result.stdout, "binary") }` — subtle: `ShellRunner.run` currently returns `stdout` as a UTF-8 string, which corrupts binary PNG bytes. S1 promotes `ShellResult.stdout` to an optional binary form, OR graphviz-local calls a new `shell.runBinary(...)` method. **Decision deferred to step 3** — implement whichever is smaller after reading `ShellRunner`'s current shape.
  - Non-zero exit: `{ ok: false, error: result.stderr.slice(0, 500) || "dot exited ${exitCode}" }`.
  - Pre-aborted signal: early `{ ok: false, error: "Aborted before request" }` without shelling out. Matches the Kroki contract.
- Logs: `debug` on request (`shelling out to dot`, byte counts), `info` on success, `warn` on non-zero exit. Same subsystem pattern as `kroki.ts` — subsystem name `"graphviz-local"`.

**Binary stdout decision (step 3 resolution ahead of implementation):** the simplest path is to widen `ShellResult` to carry `stdout` and `stderr` as both string (lossy) and `stdoutBuffer` (lossless). `NodeShellRunner` and `DockerExecShellRunner` already receive `Buffer` from `execFile` under the hood; the encoding step is the only change. `FakeShellRunner` gains a buffer-aware programming shape (`setResponse` accepts `Buffer` or `string`). If this turns out bigger than one step's worth of work during implementation, we add `runBinary(...)` as a sibling method instead and leave `run(...)` untouched. Track as a plan deviation in the close entry.

### 3. Resolution logic

In `extensions/pi-fence/index.ts`, replace the single-processor wiring with:

```ts
const processors: FenceProcessor[] = [
  createGraphvizLocalRenderer(shell, logger),
  createKrokiRenderer(http, undefined, logger, appearanceResolver),
];

// Probe once at wire time. The map holds Availability per processor id.
const availability = new Map<string, Availability>();
for (const p of processors) {
  availability.set(p.id, await p.available());
}

function resolve(tag: string): FenceProcessor | null {
  for (const p of processors) {
    if (availability.get(p.id)?.ok !== true) continue;
    if (p.tags.includes(tag) || p.aliases[tag] !== undefined) return p;
  }
  return null;
}
```

The `agent_end` handler calls `resolve(block.tag)` per block. A `null` resolution today means no registered processor claims the tag, which in practice cannot happen because `SUPPORTED_TAGS` is derived from the same processor set — the parser would have rejected the block. Belt and braces: if it ever happens, log a `warn` and skip the block.

`createPiFenceExtension` becomes `async` because `available()` is probed at wire time. Production callers already `await` extension factories via pi; the extension test's `runExtensionWithAssistantText` helper needs one small adjustment to `await createPiFenceExtension(...)`.

**Alternative considered and rejected:** probe `available()` lazily on first use of a tag. Rejected because `/fence list` needs availability up front to show the `[unavailable]` status, and a user who types `/fence list` before any assistant turn would see every processor as `[registered]` until they actually used one. Wire-time probing is one extra `await`; simpler and visibly correct.

### 4. `/fence list` status widening

`extensions/pi-fence/list.ts`:

```ts
export type ProcessorStatus = "registered" | "unavailable";

export interface ProcessorListing {
  id: string;
  status: ProcessorStatus;
  tags: readonly string[];
  aliases: Readonly<Record<string, string>>;
  unavailableReason?: string;   // present iff status === "unavailable"
  installHint?: string;          // present iff status === "unavailable" and the processor provided one
}

export function listProcessors(
  processors: readonly FenceProcessor[],
  availability: ReadonlyMap<string, Availability>,
): ProcessorListing[];
```

Signature change: `listProcessors` now takes the wire-time availability map alongside the processor list. The alternative — re-calling `available()` from `listProcessors` — would make the function impure and hit the shell every time a user runs `/fence list`. The map-argument approach keeps `list.ts` pure.

`formatProcessorLines(listings)` grows to emit, for each `unavailable` listing, a second line indented by four spaces with `reason`, plus `. ${installHint}` when present:

```text
graphviz-local [unavailable] — graphviz (dot)
    dot binary not found on PATH. Install via: apt install graphviz (Debian/Ubuntu) · brew install graphviz (macOS) · …
```

No column alignment across processors' status brackets — single-row shape stays per-processor-self-contained, matches S3's formatting decision.

### 5. Renderer

`extensions/pi-fence/renderer.ts`'s list renderer does not branch on status. The formatter output already includes the reason line; the renderer paints the array of strings verbatim. The only code change is a visual one: the `[unavailable]` token is rendered with the same muted colour as `[registered]` today — no red, because a processor being unavailable is *information*, not an error. Add a unit-test case that asserts the rendered byte stream contains both the status bracket and the reason line for the unavailable branch.

### 6. Extension wiring

`extensions/pi-fence/index.ts` additions on top of step 3's resolution:

- `FakeHttpClient` / `NodeHttpClient` and `FakeShellRunner` / `NodeShellRunner` are both wired now. The production `default` export passes `NodeShellRunner` alongside the existing `NodeHttpClient`.
- `PiFenceDeps` gains a required `shell: ShellRunner` field. Existing callers in tests (there is one, in `tests/extension/pi-fence.test.ts`) gain a `shell: new FakeShellRunner({ exitCode: 1, stdout: "", stderr: "dot: not found" })` by default for the Kroki-only scenarios, and a programmed `FakeShellRunner` for the local-available scenario.
- The `processor?: FenceProcessor` test-only override becomes `processors?: FenceProcessor[]` — tests that want to pin the processor set (contract-style tests, extension tests for deterministic resolution) pass an explicit array; production callers pass `undefined` and get the default `[graphviz-local, kroki]` pair.

### 7. Live integration test

`tests/integration/graphviz-local.live.test.ts`. Uses `DockerExecShellRunner` against the `pi-fence-live-deps` container (the S0 plan already lists graphviz as the first binary in the image, and `shell-runner.live.test.ts` already verifies `dot -V` responds). One `describe.skipIf(!containerRunning)` block with:

- **`available()` returns ok** — the container has `dot` installed.
- **Happy-path PNG round-trip** — `dot -Tpng` on a minimal source (`digraph { A -> B }`) returns PNG magic + size floor (~1 KB). Floor calibrated on the calibration machine during implementation.
- **Error path** — malformed DOT (`digraph { A -> }`) returns `{ ok: false, error }` with a truncated stderr body.
- **Cancellation** — pre-aborted signal yields `{ ok: false, error }` without spawning. Mirrors Kroki's live test shape.

### 8. Documentation

- `README.md` — "What works today" grows a graphviz-local bullet; "What does not work yet" drops "local rendering without network (CV0.E2, CV2.E1)" down to just "CV2.E1" for non-graphviz languages. The installed-dependencies table gains a `graphviz` row flagged as optional.
- `docs/getting-started.md` — new short section "Going offline for DOT" pointing at graphviz's install steps and what `/fence list` shows on the two branches.
- `docs/product/kroki-support.md` — add a sentence to the `graphviz` row noting that local rendering takes precedence when `dot` is available.
- `CHANGELOG.md` — `[Unreleased]` entry with the Epic + story identifier.
- `docs/process/worklog.md` — placeholder entry at spec time; fleshed out on close.
- Roadmap top + Epic + story READMEs: status flips on close.

---

## Implementation order

Test-first per numbered step. Each step leaves `pnpm test` green.

| Step | Layer | What | Commit |
|------|-------|------|--------|
| 1 | contract | Add `available()` to `FenceProcessor`; extend contract helper; Kroki impl returns `{ ok: true }`; contract test green | `wip(agent): FenceProcessor exposes available() (S1 step 1)` |
| 2 | unit | New `tests/unit/graphviz-local.test.ts` — `available()` ok + not-ok branches, `render()` happy/error/abort paths against a `FakeShellRunner` | `wip(agent): graphviz-local unit tests (S1 step 2)` |
| 3 | feature | Implement `extensions/pi-fence/graphviz-local.ts`; resolve the `ShellResult` binary-stdout decision; any `ShellRunner` change carries its own self-test update | `wip(agent): graphviz-local processor (S1 step 3)` |
| 4 | contract | `tests/contract/graphviz-local.contract.test.ts` — runs the shared contract against a factory wired to a canned-good `FakeShellRunner` | `wip(agent): graphviz-local satisfies the processor contract (S1 step 4)` |
| 5 | unit | Resolution logic: a small `resolve(tag)` test exercising the happy and fallback branches against fake processors with scripted `available()` responses. Placement TBD in step — either standalone `tests/unit/resolve.test.ts` or expansion of `tests/unit/fence-command.test.ts`; decide on the smaller footprint during implementation | `wip(agent): capability-based processor resolution (S1 step 5)` |
| 6 | unit | `/fence list` status widening — extend `tests/unit/list.test.ts` with the `unavailable` branch (reason + install hint rendering); update `tests/unit/renderer.test.ts` for the second-line paint | `wip(agent): /fence list surfaces processor availability (S1 step 6)` |
| 7 | extension | Two new extension-layer cases in `tests/extension/pi-fence.test.ts` — (a) `dot` available → graphviz-local serves `dot` block, `FakeHttpClient` captures zero calls; (b) `dot` unavailable → Kroki serves the same block, behaviour matches CV0.E1 | `wip(agent): extension test — graphviz-local wins then falls back (S1 step 7)` |
| 8 | integration (live) | `tests/integration/graphviz-local.live.test.ts` — four live cases inside the `pi-fence-live-deps` container | `wip(agent): live integration for graphviz-local (S1 step 8)` |
| 9 | docs | README, CHANGELOG, getting-started, kroki-support note; worklog placeholder | `wip(agent): document graphviz-local (S1 step 9)` |
| 10 | close | Worklog entry + status flips (roadmap top, Epic README, story README) | `close CV0.E2.S1` |

Steps 1 and 3 are the two points where the test-first loop has a visible gap: step 1 adds the interface assertion without a production consumer to satisfy it, and step 3 adds the production consumer. If step 1's contract assertion goes green against Kroki's one-liner impl and the graphviz-local work in step 3 re-runs the contract under a different factory, both commits leave tests passing in isolation.

---

## Tests

**Test layers touched:**

- **Contract** (`tests/contract/fence-processor.ts`, `tests/contract/kroki.contract.test.ts`, `tests/contract/graphviz-local.contract.test.ts`): `available()` shape assertion; graphviz-local added as a second processor running the shared contract under a `FakeShellRunner`.
- **Unit** (`tests/unit/graphviz-local.test.ts`, `tests/unit/resolve.test.ts` *or* `tests/unit/fence-command.test.ts` expansion, `tests/unit/list.test.ts`, `tests/unit/renderer.test.ts`, `tests/unit/kroki.test.ts`): per-module unit coverage as itemised above. `kroki.test.ts` picks up the new `available()` assertion through its use of the contract helper; no behavioural Kroki changes.
- **Extension** (`tests/extension/pi-fence.test.ts`): two new cases for the two resolution branches.
- **Integration (live)** (`tests/integration/graphviz-local.live.test.ts`): four cases against the live container.
- **Render Image**: unchanged. The rendering pipeline does not know which processor served a PNG; the composition-level scenarios already cover "panel paints a PNG". Adding a graphviz-local-specific scenario would be vanity coverage (same rationale the post-S4 refactor captured).

**Events / interactions covered:**

- `FenceProcessor.available()` contract (shape + both ok/not-ok paths).
- `createGraphvizLocalRenderer`'s happy/error/abort branches against a fake shell.
- `resolve(tag)` picking the first available processor.
- `/fence list` surfacing status + reason + install hint.
- Real `dot -Tpng` round-trip inside the live container.
- Extension end-to-end via `AgentSession` with both branches of the resolution map.

**Fakes added:**

- None net-new at the class level. `FakeShellRunner` already exists from S0. Small test-local helpers (`makeFakeProcessor(id, tags, aliases, availability)`) may appear inline in the resolution unit test; not promoted to `tests/utilities/` until a second consumer exists.

**Live tests added:**

- Four cases in `tests/integration/graphviz-local.live.test.ts`. All skip cleanly when the container is not running.

**Deferred:**

- JSON-body languages — CV0.E1.S5.
- Theme-aware DOT rendering.
- `/fence doctor` and real endpoint-health probing.
- Per-tag user override (S2).
- Cache of rendered PNGs.
- Moving `ShellRunner` out of `tests/utilities/` into `extensions/pi-fence/io/`. The import path shift is a later cleanup.

---

## Verification

1. `pnpm run check` — docs links and markdown pass; the new Epic + story folders are reachable and every internal link resolves.
2. `pnpm test` — fast suite green. Expected test-count delta: ~+12 (6 in `graphviz-local.test.ts`, 2 in the resolution test, 2 in `list.test.ts`, 1 in `renderer.test.ts`, 2 in `pi-fence.test.ts`; contract tests of graphviz-local add 7 from the shared helper).
3. `pnpm live:up && pnpm test:live` — integration suite green; the four new graphviz-local cases pass against the live container, and the existing Kroki cases are unaffected.
4. Manual test from [test-guide.md](test-guide.md) on a machine with `graphviz` installed and one without (or with `PATH` scrubbed of `dot`).
5. A reader of `/fence list` can explain which processor served the most recent rendered block without running `PI_FENCE_LOG_LEVEL=debug`.

---

## Key files

**Modified:**

- `extensions/pi-fence/processor.ts` — `FenceProcessor` gains `available()`; new `Availability` type.
- `extensions/pi-fence/kroki.ts` — trivial `available()` impl.
- `extensions/pi-fence/index.ts` — `processors: FenceProcessor[]`, wire-time `available()` probing, `resolve(tag)`, shell wiring, `processors?` test override.
- `extensions/pi-fence/list.ts` — `ProcessorStatus` union widens; `listProcessors` takes an availability map; `formatProcessorLines` emits the second line for unavailable rows.
- `extensions/pi-fence/renderer.ts` — pi-fence:list paint gains a second line when the formatter emits one; no new branch on kind.
- `tests/contract/fence-processor.ts` — `available()` assertion.
- `tests/contract/kroki.contract.test.ts` — picks up the new contract.
- `tests/utilities/shell-runner.ts` — binary stdout support (`stdoutBuffer` or `runBinary`, decided during step 3); self-test updated alongside.
- `tests/unit/graphviz-local.test.ts` — new file.
- `tests/unit/kroki.test.ts`, `tests/unit/list.test.ts`, `tests/unit/renderer.test.ts`, `tests/unit/fence-command.test.ts` — adjusted for the new contract + listing shape.
- `tests/extension/pi-fence.test.ts` — two new cases; `runExtensionWithAssistantText` helper awaits the factory + plumbs a `FakeShellRunner`.
- `tests/contract/graphviz-local.contract.test.ts` — new file.
- `tests/integration/graphviz-local.live.test.ts` — new file.
- `README.md`, `docs/getting-started.md`, `docs/product/kroki-support.md`, `CHANGELOG.md`.
- `docs/process/worklog.md`, status flips in roadmap/Epic/story READMEs.

**New:**

- `extensions/pi-fence/graphviz-local.ts`.
- `docs/project/roadmap/cv0-it-works/cv0-e2-graphviz-local/` (this folder, its Epic README, and this story's three files).

---

## Out of scope — explicitly

- User-facing per-tag processor bindings. Covered by CV0.E2.S2.
- Theme-aware graphviz-local output.
- SVG output from `dot`.
- `/fence doctor` and real endpoint-health probing.
- Mid-session availability refresh.
- Cache of rendered PNGs.
- Promoting `ShellRunner` / `HttpClient` / `Logger` out of `tests/utilities/`. Planned since S0; still not this story.
- `ConfigLoader` / `@zenobius/pi-extension-config` wiring. First reader ships with S2.

---

**See also:** [Test Guide](test-guide.md) · [Story README](README.md) · [Epic README](../README.md) · [CV0.E1.S3 plan](../../cv0-e1-kroki-through-the-wire/cv0-e1-s3-fence-list/plan.md) · [Principles — Testing](../../../../../product/principles.md#testing)
