# CV0.E2.S2 — Per-tag processor binding from settings

**Status:** Done

**Epic:** [CV0.E2 — Graphviz Local](cv0-e2--graphviz-local.md)
**Depends on:** [CV0.E2.S1 — Local graphviz](cv0-e2-s1--local-graphviz.md) (processor registry + `resolveProcessor`).
**Date:** 2026-04-20 (spec)

## Summary

CV0.E2.S1 shipped capability-based resolution: graphviz-local wins `graphviz`/`dot` when `dot` is on PATH, Kroki handles everything else. That rule is the right default for most users. S2 adds the user-level override: the user who has both `dot` installed *and* a preference for Kroki (or vice versa) expresses it in a settings file and pi-fence honours it.

## Done criterion

Two config files pi-fence reads at wire time:

1. **Global** — `~/.pi/agent/pi-fence.config.json`.
2. **Project** — `<cwd>/.pi/pi-fence.config.json`.

Project overrides global, global overrides code defaults (D6 in the briefing). Missing or unreadable files degrade silently — defaults win; pi-fence logs a warn but does not block.

Config shape (S2 ships exactly one key):

```json
{
  "bindings": {
    "graphviz": "kroki",
    "dot": "kroki"
  }
}
```

With this file in place:

1. A ```` ```dot ```` block is served by Kroki even on a machine where `dot` is installed. `FakeHttpClient` captures the HTTP request; `FakeShellRunner.calls.filter((c) => c.args.includes("-Tpng"))` is empty.
2. A ```` ```graphviz ```` block is served by Kroki on the same terms.
3. A ```` ```mermaid ```` block still goes through Kroki — untouched.
4. Removing the file (or deleting the `bindings` key) restores the default capability-based resolution: graphviz-local wins for the user with `dot` installed.
5. `/fence list` shows the effective bindings underneath the processor rows — the user can verify what the config resolved to.

Bindings are **preferences, not hard requirements**. When the bound processor is unavailable (a user binds `graphviz: "graphviz-local"` on a machine without `dot`), pi-fence falls back to capability-based resolution and logs a warn. Strict mode ("use only this processor, fail if unavailable") is not in S2's scope.

## Scope

**In scope:**

- A small config module `extensions/pi-fence/config.ts` that reads two optional files (global + project), merges them with project precedence, and returns a typed `{ bindings }` object. Missing files, malformed JSON, and extra keys are tolerated: pi-fence logs the problem and continues with the resolvable portion of the config (or pure defaults).
- A minimal JSON schema for the `bindings` object (string keys map to string values); validation is hand-rolled in `config.ts` because the surface is one level deep. Full TypeBox validation can arrive when the config surface actually grows.
- `resolveProcessor(processors, availability, tag, bindings?)` widens: when `bindings[tag]` names a processor id that is registered AND available, it wins. Otherwise fall through to the existing capability-based rule. Null if neither produces a match.
- Wire-time config load in `createPiFenceExtension`. The loaded bindings are captured in the closure (same shape as the availability map) and passed to every `resolveProcessor` call + the `/fence list` details.
- `/fence list` gains a "Bindings" sub-section underneath the processor listings showing `<tag> → <processor>` pairs for every binding that resolved to a registered processor. Bindings that point to an unknown processor id, or to an unavailable processor, are listed separately as "Ignored bindings" with the reason.
- Unit tests for `config.ts` + `resolveProcessor`'s bindings branch.
- Extension-layer tests: project overrides global; binding respected when processor is available; binding to unavailable processor falls back to capability; binding to unknown processor id is ignored.
- Live test not required — S2 is pure-function + JSON-file I/O; the existing `@zenobius/pi-extension-config` library's absence means no live HTTP/docker dependency. The fast suite's `temp-dir.ts` utility covers the filesystem seam.
- README + getting-started + CHANGELOG updates.

**Out of scope:**

- Env-var overrides (`PI_FENCE_*`). The briefing's D6 names them; S2's minimum viable slice ships file-based bindings only. Env overrides come with a later story.
- Per-block meta overrides (```` ```mermaid processor=kroki ````) — named in D6 but separate surface.
- Endpoint configuration (global `kroki.endpoint`, per-processor timeouts, etc.) — CV1.E1.
- Processor enable/disable flags (`{ "enabled": { "graphviz-local": false } }`) — CV1.E1 territory. S2's surface is bindings only.
- Strict-mode bindings (respect unavailable processor, don't fall back). Follow-up when a real privacy-conscious user expresses the need.
- Adopting `@zenobius/pi-extension-config`. Decision captured in the plan's deferred-decisions note: the library brings two transitive deps for a tiny S2 surface; a ~50-LOC inline loader fits S2 better. Revisit when CV1.E1's broader config surface lands.
- TypeBox or Standard Schema validation — hand-rolled shape checks in `config.ts` are enough for one key deep.
- Config file migrations / versioning — no schema change history to migrate; premature.

## Approach

A user edits `~/.pi/agent/pi-fence.config.json` or `<cwd>/.pi/pi-fence.config.json`, adds a `bindings` map, and pi-fence routes the named tags through the named processor on the next `/reload`. Invalid bindings degrade gracefully; `/fence list` shows what resolved.

This is the first story that reads pi-fence's own config file. The scope stays one key deep (`bindings`) so the loader shape is trivial; richer config (endpoint, enabled, etc.) earns its place in CV1.E1 when real use pressure materialises.

## Plan

### Deliverables

#### 1. Config shape + loader

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

#### 2. `resolveProcessor` widens for bindings

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

#### 3. `/fence list` surfaces bindings

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

#### 4. Wire config loading in `createPiFenceExtension`

`extensions/pi-fence/index.ts`:

- After `probeAvailability`, call `loadPiFenceConfig` once with the extension's cwd (available via `pi.cwd` or similar — verify the API during implementation).
- Capture the resulting `bindings` in the closure alongside `availability`.
- Pass `bindings` to every `resolveProcessor` call in the `agent_end` handler.
- Pass `bindings` to `sendListMessage` so `/fence list` can render them.

`PiFenceDeps` does NOT gain a new required seam. File I/O lives inside `loadPiFenceConfig` which uses Node's `fs` directly; tests override the file paths through `opts.globalConfigPath` / `opts.projectConfigPath` pointing into `os.tmpdir()` (the existing `temp-dir.ts` utility handles lifecycle).

#### 5. Tests

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

### Implementation order

Test-first per step. Each step green on `pnpm test`.

| Step | Layer | What | Commit |
|------|-------|------|--------|
| 1 | unit | New `tests/unit/config.test.ts` + `extensions/pi-fence/config.ts` (loader + hand-rolled shape validation). Test-first within the commit | `wip(agent): pi-fence.config.json loader (S2 step 1)` |
| 2 | unit | Widen `resolveProcessor` to accept bindings; add `resolveBindings` helper; expand `tests/unit/resolve.test.ts` | `wip(agent): bindings-aware resolution (S2 step 2)` |
| 3 | unit | `/fence list` formatter gains the Bindings / Ignored bindings sections; expand `tests/unit/list.test.ts`; renderer test for the new paint | `wip(agent): /fence list surfaces bindings (S2 step 3)` |
| 4 | extension | Wire config loading + bindings-aware resolution in `createPiFenceExtension`; extend `tests/extension/pi-fence.test.ts` with the four bindings scenarios | `wip(agent): wire bindings through the extension (S2 step 4)` |
| 5 | docs | README (Processor registry gains a "Binding processors to tags" paragraph + link to getting-started); getting-started (new "Binding a tag to a specific processor" section); CHANGELOG | `wip(agent): document tag bindings (S2 step 5)` |
| 6 | close | Worklog entry + status flips (roadmap top, epic file, story file) | `close CV0.E2.S2` |

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

## Verification

### Gate

1. `pnpm run check` — docs links + markdown pass; the new S2 folder is reachable.
2. `pnpm test` — fast suite green. Expected delta: ~+15 fast-suite cases (config ~9, resolve expansion ~5, list/renderer ~3, extension ~4 — rough estimate).
3. Manual verification from [Verification](#verification):
   - Create `~/.pi/agent/pi-fence.config.json` with `{ "bindings": { "graphviz": "kroki" } }`; `/reload` inside pi.
   - `/fence list` shows the `Bindings` section.
   - A ```` ```dot ```` block from the assistant goes through Kroki (visible in `PI_FENCE_LOG_LEVEL=debug` output).
4. A reader of `docs/getting-started.md` can produce the binding example and verify the effect without reading any code.

### Prerequisites

- No Docker.
- No network.
- `graphviz` installed for the most interesting manual scenarios (binding Kroki to override local graphviz). Scripts run without it; you just won't see the "bind local → override → fall back to Kroki" scenario.

### Automated tests

```bash
pnpm install
pnpm run check
pnpm test
```

Expect green. Specifically new:

- `tests/unit/config.test.ts` — two-file precedence, malformed JSON tolerance, missing-file tolerance, non-string value handling.
- `tests/unit/resolve.test.ts` — bindings branch: binding wins over capability when processor available; falls through on unavailable / unknown.
- `tests/unit/list.test.ts` — Bindings / Ignored bindings sections in `formatProcessorLines`.
- `tests/unit/renderer.test.ts` — viewport assertion on the new section paint.
- `tests/extension/pi-fence.test.ts` — four bindings scenarios through `AgentSession`.

No new live tests.

### Manual test script

Run with pi-fence installed / symlinked into pi.

#### 1. No config file → default capability-based resolution

Fresh machine (no `pi-fence.config.json` anywhere). Inside pi:

```text
/fence list
```

Expect two processor rows + **no Bindings section** at all.

#### 2. Global config binds graphviz to Kroki

```bash
cat > ~/.pi/agent/pi-fence.config.json <<'EOF'
{
  "bindings": {
    "graphviz": "kroki",
    "dot": "kroki"
  }
}
EOF
```

Inside pi, `/reload`, then `/fence list`. Expect:

```text
Processors

  graphviz-local [registered] — graphviz (dot)
  kroki [registered] — mermaid, graphviz (dot), …

Bindings

  graphviz → kroki
  dot → kroki
```

Ask the assistant for a DOT graph. With `PI_FENCE_LOG_LEVEL=debug pi 2> /tmp/pi-fence.log`, expect:

- `[pi-fence:kroki] debug: request {"tag":"graphviz",…}` — Kroki served the block despite graphviz-local being available.
- No `[pi-fence:graphviz-local] debug: shelling out to dot` line for this turn.

#### 3. Project config overrides global

```bash
cd /tmp/my-project
mkdir -p .pi
cat > .pi/pi-fence.config.json <<'EOF'
{
  "bindings": {
    "graphviz": "graphviz-local"
  }
}
EOF
# Keep the global file from step 2 in place.
pi  # start from /tmp/my-project
```

Inside pi, `/fence list`. Expect the Bindings section to show:

```text
Bindings

  graphviz → graphviz-local   (project)
  dot → kroki
```

Ask for another DOT graph. Log should show `[pi-fence:graphviz-local]` serving it — project config won for the `graphviz` tag; global config's `dot` binding stays.

#### 4. Binding to unknown processor is ignored

```bash
cat > .pi/pi-fence.config.json <<'EOF'
{
  "bindings": {
    "graphviz": "nonexistent",
    "mermaid": "kroki"
  }
}
EOF
```

`/reload`, `/fence list`. Expect:

```text
Bindings

  mermaid → kroki

Ignored bindings

  graphviz → nonexistent (unknown processor)
```

Ask for a DOT graph — capability-based resolution kicks in (graphviz-local wins if dot is installed; else Kroki). Ask for mermaid — still Kroki (noop binding since Kroki already claims mermaid by default).

#### 5. Binding to an unavailable processor falls through

On a machine where `graphviz` is NOT installed:

```bash
cat > ~/.pi/agent/pi-fence.config.json <<'EOF'
{
  "bindings": {
    "graphviz": "graphviz-local"
  }
}
EOF
```

`/reload`, `/fence list`. Expect:

```text
Bindings

Ignored bindings

  graphviz → graphviz-local (processor unavailable)
```

Ask for a DOT graph — Kroki serves it via capability-based fallback. The user sees that their binding preference was recorded but not honoured; the log entry at `info` level records the fallback.

#### 6. Malformed JSON is tolerated

```bash
echo 'not valid json' > ~/.pi/agent/pi-fence.config.json
```

`/reload`. pi-fence does NOT crash. `PI_FENCE_LOG_LEVEL=warn pi 2> /tmp/pi-fence.log` shows one warn line flagging the parse failure. `/fence list` renders as if no config file existed.

#### 7. Deleting the config restores defaults

```bash
rm ~/.pi/agent/pi-fence.config.json .pi/pi-fence.config.json
```

`/reload`, `/fence list`. No Bindings section. Default capability-based resolution applies. A DOT block goes through graphviz-local (if dot installed) or Kroki (if not).

### Rollback

Delete both config files + `/reload`.

For a complete uninstall: `pi uninstall pi-fence`, `/reload`.

## Key files

**Modified:**

- `extensions/pi-fence/index.ts` — wires `loadPiFenceConfig` + passes `bindings` through.
- `extensions/pi-fence/resolve.ts` — `resolveProcessor` gains the `bindings` arg; `resolveBindings` helper.
- `extensions/pi-fence/list.ts` — `listProcessors` + `formatProcessorLines` surface effective / ignored bindings.
- `extensions/pi-fence/renderer.ts` — list renderer gains assertions against the new lines (no code change; the paint is verbatim).
- `tests/unit/resolve.test.ts`, `tests/unit/list.test.ts`, `tests/unit/renderer.test.ts`, `tests/extension/pi-fence.test.ts` — new cases.
- `README.md`, `docs/getting-started.md`, `CHANGELOG.md`.
- `docs/process/worklog.md`, roadmap/Epic/story file status flips at close.

**New:**

- `extensions/pi-fence/config.ts`.
- `tests/unit/config.test.ts`.

## Out of scope — explicitly

- Env-var overrides.
- Per-block meta overrides.
- Endpoint / timeout / processor-enable flags (CV1.E1).
- Strict-mode bindings.
- `@zenobius/pi-extension-config` adoption.
- TypeBox / Standard Schema validation.
- Config file migrations.
