[< S2](README.md)

# Plan: CV0.E2.S2 — Per-tag processor binding from settings

**Story:** [README.md](README.md)
**Epic:** [CV0.E2 — Graphviz Local](../README.md)
**Depends on:** [CV0.E2.S1 — Local graphviz](../cv0-e2-s1-local-graphviz/README.md) (processor registry + `resolveProcessor`).
**Date:** 2026-04-20 (spec)

## Goal

A user edits `~/.pi/agent/pi-fence.config.json` or `<cwd>/.pi/pi-fence.config.json`, adds a `bindings` map, and pi-fence routes the named tags through the named processor on the next `/reload`. Invalid bindings degrade gracefully; `/fence list` shows what resolved.

This is the first story that reads pi-fence's own config file. The scope stays one key deep (`bindings`) so the loader shape is trivial; richer config (endpoint, enabled, etc.) earns its place in CV1.E1 when real use pressure materialises.

---

## Deliverables

### 1. Config shape + loader

New module `extensions/pi-fence/config.ts`. Exports:

```ts
export interface PiFenceConfig {
  bindings: Record<string, string>;   // tag → processor id
}

export interface LoadConfigOptions {
  globalConfigPath?: string;   // defaults to ~/.pi/agent/pi-fence.config.json
  projectConfigPath?: string;  // defaults to <cwd>/.pi/pi-fence.config.json
  cwd?: string;                // defaults to process.cwd()
  home?: string;               // defaults to os.homedir()
  logger?: Logger;
}

export async function loadPiFenceConfig(opts?: LoadConfigOptions): Promise<PiFenceConfig>;
```

Behaviour:

- Reads both files, tolerating missing files (common case) and malformed JSON (log warn, continue with defaults).
- Merges project over global. Inside `bindings`, shallow merge: a key in project overrides the same key in global; keys only in global remain.
- Returns `{ bindings: {} }` when both files are absent.
- Does not throw. Every error path logs and continues.
- Validation: only keys/values that are strings are accepted; non-string values in `bindings` are logged as warnings and dropped.
- Config file schema is deliberately flat. Nested sections (e.g. `processors.<id>.endpoint`) defer to CV1.E1.

Implementation is ~50 LOC: two `fs.readFile` calls wrapped in try/catch, one `JSON.parse`, one shallow merge. No new deps.

### 2. `resolveProcessor` widens for bindings

`extensions/pi-fence/resolve.ts` gains an optional fourth argument:

```ts
export function resolveProcessor(
  processors: readonly FenceProcessor[],
  availability: ReadonlyMap<string, Availability>,
  tag: string,
  bindings?: Readonly<Record<string, string>>,
): FenceProcessor | null;
```

New behaviour:

- If `bindings[tag]` is defined AND names an existing processor AND that processor's availability is ok, return that processor. Takes precedence over capability-based order.
- If `bindings[tag]` is defined but points to an unknown processor id, fall back to the existing capability-based rule (log the miss via the caller's logger, but `resolve.ts` itself stays logger-free to keep it pure — the caller logs once at wire time).
- If `bindings[tag]` points to an existing but unavailable processor, fall back to capability-based rule.
- If `bindings` is undefined or empty, behaviour is identical to S1.

Bindings are **preferences, not hard requirements** (the story's scope decision). Strict mode is a later story.

Supporting function `resolveBindings(processors, availability, bindings): {effective, ignored}` — categorises each binding entry into `effective` (tag → processor row for `/fence list`) or `ignored` (with a reason: `unknown-processor` or `processor-unavailable`). Pure, unit-tested.

### 3. `/fence list` surfaces bindings

`extensions/pi-fence/list.ts` gains a second section in its output:

```text
Processors

  graphviz-local [registered] — graphviz (dot)
  kroki [registered] — mermaid, graphviz (dot), plantuml (puml), …

Bindings

  graphviz → kroki
  dot → kroki

Ignored bindings

  mermaid → nonexistent (unknown processor)
  graphviz → graphviz-local (processor unavailable)
```

The "Bindings" and "Ignored bindings" sections only render when there are bindings to show. Empty config → no section.

`listProcessors` signature gains an optional `bindings` arg; `formatProcessorLines` grows to emit the extra lines when bindings are present. Follows the same "formatter does the work; renderer paints verbatim" pattern S1 established.

### 4. Wire config loading in `createPiFenceExtension`

`extensions/pi-fence/index.ts`:

- After `probeAvailability`, call `loadPiFenceConfig` once with the extension's cwd (available via `pi.cwd` or similar — verify the API during implementation).
- Capture the resulting `bindings` in the closure alongside `availability`.
- Pass `bindings` to every `resolveProcessor` call in the `agent_end` handler.
- Pass `bindings` to `sendListMessage` so `/fence list` can render them.

`PiFenceDeps` does NOT gain a new required seam. File I/O lives inside `loadPiFenceConfig` which uses Node's `fs` directly; tests override the file paths through `opts.globalConfigPath` / `opts.projectConfigPath` pointing into `os.tmpdir()` (the existing `temp-dir.ts` utility handles lifecycle).

### 5. Tests

**Unit (`tests/unit/config.test.ts`):**

- Both files absent → defaults `{ bindings: {} }`.
- Only global present → global bindings returned.
- Only project present → project bindings returned.
- Both present, disjoint keys → union.
- Both present, overlapping keys → project wins.
- Malformed JSON in one file → log warn, return the other file's values.
- Non-string value inside bindings → dropped with warn, rest returned.
- Non-object top level → dropped with warn, defaults returned.
- Custom `cwd` / `home` honoured.

**Unit (`tests/unit/resolve.test.ts`, expansion):**

- Binding to an available processor wins over capability-based order.
- Binding to an unavailable processor falls through to capability.
- Binding to an unknown processor id falls through to capability.
- Empty bindings behaves identically to the S1 resolve contract.
- Binding entries for tags with no claimer at all still fall through to capability (which returns null).
- `resolveBindings` correctly categorises each binding into effective / ignored with the right reason.

**Unit (`tests/unit/list.test.ts`, expansion):**

- Formatter emits the Bindings section when present; suppresses it when empty.
- Ignored bindings section surfaces the reason per entry.
- `listProcessors` carries bindings data through to the listing payload.

**Extension (`tests/extension/pi-fence.test.ts`, expansion):**

- Fixture `pi-fence.config.json` in a temp-dir project root with `{ "bindings": { "graphviz": "kroki" } }` + `dot` "available" shell → a ```` ```dot ```` block goes to Kroki (`http.requests` has one entry, `shell.calls` has only the `dot -V` probe, no `dot -Tpng`).
- Fixture project config overrides global config (two temp dirs, one for each).
- Binding to unknown processor id is silently ignored; capability-based resolution applies; a warn log entry records the ignore.
- /fence list through an AgentSession reflects the bindings section correctly.

No live tests — S2 is file I/O + pure functions.

---

## Implementation order

Test-first per step. Each step green on `pnpm test`.

| Step | Layer | What | Commit |
|------|-------|------|--------|
| 1 | unit | New `tests/unit/config.test.ts` + `extensions/pi-fence/config.ts` (loader + hand-rolled shape validation). Test-first within the commit | `wip(agent): pi-fence.config.json loader (S2 step 1)` |
| 2 | unit | Widen `resolveProcessor` to accept bindings; add `resolveBindings` helper; expand `tests/unit/resolve.test.ts` | `wip(agent): bindings-aware resolution (S2 step 2)` |
| 3 | unit | `/fence list` formatter gains the Bindings / Ignored bindings sections; expand `tests/unit/list.test.ts`; renderer test for the new paint | `wip(agent): /fence list surfaces bindings (S2 step 3)` |
| 4 | extension | Wire config loading + bindings-aware resolution in `createPiFenceExtension`; extend `tests/extension/pi-fence.test.ts` with the four bindings scenarios | `wip(agent): wire bindings through the extension (S2 step 4)` |
| 5 | docs | README (Processor registry gains a "Binding processors to tags" paragraph + link to getting-started); getting-started (new "Binding a tag to a specific processor" section); CHANGELOG | `wip(agent): document tag bindings (S2 step 5)` |
| 6 | close | Worklog entry + status flips (roadmap top, Epic README, story README) | `close CV0.E2.S2` |

---

## Tests

**Test layers touched:**

- **Unit** (`tests/unit/config.test.ts` new, `tests/unit/resolve.test.ts` expanded, `tests/unit/list.test.ts` expanded, `tests/unit/renderer.test.ts` expanded): config loader, bindings-aware resolution, list formatter + renderer.
- **Extension** (`tests/extension/pi-fence.test.ts`): four bindings scenarios through a real AgentSession.
- **Integration (live)**: none. S2 is pure-function + file I/O.
- **Render Image**: unchanged.

**Events / interactions covered:**

- Two-file precedence (project > global > defaults).
- Malformed JSON and non-object top-level degrade gracefully.
- Bindings routing a tag to a specific available processor.
- Bindings falling through when the bound processor is unavailable / unknown.
- `/fence list` surfacing effective vs ignored bindings.

**Fakes added:**

- None net-new. `temp-dir.ts` utility covers the filesystem seam; `FakeShellRunner` + `FakeHttpClient` already in place.

**Live tests added:**

- None.

**Deferred:**

- Env-var overrides (`PI_FENCE_BINDINGS`, etc.). Earned when a real use case materialises.
- Per-block meta overrides (```mermaid processor=kroki```). Separate surface.
- `@zenobius/pi-extension-config` adoption. Revisit with CV1.E1's broader config surface.
- Strict-mode bindings (a binding to an unavailable processor fails the render rather than falling through). Follow-up when a privacy-conscious user surfaces the need.
- TypeBox / Standard Schema validation — hand-rolled shape checks for one key.
- Config file migrations. No schema history yet.

---

## Verification

1. `pnpm run check` — docs links + markdown pass; the new S2 folder is reachable.
2. `pnpm test` — fast suite green. Expected delta: ~+15 fast-suite cases (config ~9, resolve expansion ~5, list/renderer ~3, extension ~4 — rough estimate).
3. Manual verification from [test-guide.md](test-guide.md):
   - Create `~/.pi/agent/pi-fence.config.json` with `{ "bindings": { "graphviz": "kroki" } }`; `/reload` inside pi.
   - `/fence list` shows the `Bindings` section.
   - A ```` ```dot ```` block from the assistant goes through Kroki (visible in `PI_FENCE_LOG_LEVEL=debug` output).
4. A reader of `docs/getting-started.md` can produce the binding example and verify the effect without reading any code.

---

## Key files

**Modified:**

- `extensions/pi-fence/index.ts` — wires `loadPiFenceConfig` + passes `bindings` through.
- `extensions/pi-fence/resolve.ts` — `resolveProcessor` gains the `bindings` arg; `resolveBindings` helper.
- `extensions/pi-fence/list.ts` — `listProcessors` + `formatProcessorLines` surface effective / ignored bindings.
- `extensions/pi-fence/renderer.ts` — list renderer gains assertions against the new lines (no code change; the paint is verbatim).
- `tests/unit/resolve.test.ts`, `tests/unit/list.test.ts`, `tests/unit/renderer.test.ts`, `tests/extension/pi-fence.test.ts` — new cases.
- `README.md`, `docs/getting-started.md`, `CHANGELOG.md`.
- `docs/process/worklog.md`, roadmap/Epic/story README status flips at close.

**New:**

- `extensions/pi-fence/config.ts`.
- `tests/unit/config.test.ts`.

---

## Out of scope — explicitly

- Env-var overrides.
- Per-block meta overrides.
- Endpoint / timeout / processor-enable flags (CV1.E1).
- Strict-mode bindings.
- `@zenobius/pi-extension-config` adoption.
- TypeBox / Standard Schema validation.
- Config file migrations.

---

**See also:** [Test Guide](test-guide.md) · [Story README](README.md) · [S1 plan](../cv0-e2-s1-local-graphviz/plan.md) · [Briefing D6 — user owns the registry](../../../../briefing.md) · [Principles — Testing](../../../../../product/principles.md#testing)
