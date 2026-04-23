# CV1.E1.S1 — Enable/disable processors in settings

**Status:** Draft

**Epic:** [CV1.E1 — Explicit Configuration](cv1-e1--explicit-configuration.md)
**Depends on:** [CV0.E2.S2 — per-tag bindings](../cv0--it-works/cv0-e2-s2--tag-binding.md) (config infrastructure)
**Date:** 2026-04-22 (spec)

## Summary

Users can disable a processor by id in their config file. A disabled processor is skipped during resolution — its tags fall through to the next available processor (or produce "no processor" if none remain). `/fence list` shows disabled processors distinctly. Re-enabling is explicit: override at project level or remove the entry.

## Done criterion

The user adds `"disabled": ["kroki"]` to `~/.pi/agent/pi-fence.config.json`. On the next `/reload` or session start:

- `graphviz`/`dot` blocks still render via `graphviz-local` (if installed).
- `mermaid`, `plantuml`, and every other Kroki-only tag produce a "no available processor" warning instead of a rendered image.
- `/fence list` shows `kroki [disabled]` instead of `kroki [registered]`.
- Removing the entry (or overriding with `"disabled": []` in the project config) re-enables Kroki.

## Scope

**In scope:**

- New config key `disabled: string[]` — array of processor ids. Default: `[]`.
- Merge semantics: project `disabled` replaces global `disabled` entirely (same "last wins" as a single key). An empty array at project level re-enables everything global disabled. Absent key inherits from the lower-priority layer.
- `resolveProcessor` skips processors whose id is in the disabled set — they're treated as unavailable regardless of their `available()` probe result.
- `/fence list` renders disabled processors with a `[disabled]` status badge (distinct from `[unavailable]`).
- `resolveBindings` reports bindings to disabled processors as ignored with reason `processor-disabled`.
- Config validation: `disabled` must be an array of strings; non-array or non-string entries logged as warn, tolerated.
- Unit tests for config validation/merge, resolve skipping, list formatting.
- Extension test: full pipeline with a disabled processor.

**Out of scope:**

- Per-processor settings (endpoint, timeout, credentials) — CV1.E1.S2.
- `/fence doctor` — CV1.E1.S3.
- Env-var overrides (`PI_FENCE_DISABLED=kroki`) — future story, not needed for file-based config.
- Adopting `@zenobius/pi-extension-config` — the hand-rolled config loader is sufficient for this story. Revisit when the config surface grows enough to justify the dependency.
- Disabling individual tags (vs. entire processors). If a user wants to suppress `mermaid` but keep `plantuml`, they bind `mermaid` to a nonexistent processor id — already works as an "ignored binding" today.

## Plan

### Deliverables

#### 1. Config shape: `disabled` key

`PiFenceConfig` gains `disabled: string[]`. `DEFAULT_CONFIG` has `disabled: []`. Validation accepts an array of strings, warns and drops non-string entries. Merge: project replaces global when present.

#### 2. Resolution: skip disabled processors

`resolveProcessor` takes a `disabled` set. A processor whose id is in the set is skipped — both in the binding lookup and in the capability-based fallback. `resolveBindings` gains a new ignored reason `processor-disabled`.

#### 3. `/fence list` disabled badge

`listProcessors` gains a `disabled` status alongside `registered` and `unavailable`. `formatProcessorLines` renders it as `[disabled]`. The disabled status takes precedence over availability — a disabled processor is not probed.

#### 4. Wiring in `index.ts`

`createPiFenceExtension` reads `config.disabled`, converts to a `Set<string>`, passes it through to the resolve and list layers.

### Implementation order

Test-first. Each step is one TDD cycle (red → green → refactor).

| Step | Layer | What |
|------|-------|------|
| 1 | unit | Config: `disabled` validation + merge in `config.test.ts` |
| 2 | unit | Resolve: skip disabled processors in `resolve.test.ts` |
| 3 | unit | List: `[disabled]` formatting in `list.test.ts` |
| 4 | extension | Full pipeline: disabled processor skipped, `/fence list` shows `[disabled]` |
| 5 | docs | getting-started, kroki-support, CHANGELOG |

## Tests

**Test layers touched:**

- **Unit** (`tests/unit/config.test.ts`): validation of `disabled` key (valid array, non-array, non-string entries, absent key). Merge: project replaces global, absent inherits.
- **Unit** (`tests/unit/resolve.test.ts`): `resolveProcessor` with disabled set — binding to disabled processor falls through, capability skips disabled. `resolveBindings` returns `processor-disabled` reason.
- **Unit** (`tests/unit/list.test.ts`): `listProcessors` with disabled set produces `disabled` status. `formatProcessorLines` renders `[disabled]`.
- **Extension** (`tests/extension/pi-fence.test.ts`): disabled Kroki via config → mermaid block produces no output. `/fence list` shows `[disabled]`.
- **Contract**: unchanged.
- **Integration (live)**: unchanged.

**Events / interactions covered:**

- Config load with `disabled` key present/absent/malformed.
- Resolution skipping disabled processors for both bindings and capability paths.
- `/fence list` output with disabled processors.

**Fakes added:** None new.

**Live tests added:** None.

**Deferred:**

- Env-var override for disabled list.
- Per-tag disable (as opposed to per-processor).

## Verification

### Gate

1. `pnpm run feedback` — full fast gate green.
2. No new CRAP functions above 25.

### Automated tests

```bash
pnpm install
pnpm run feedback
```

### Manual test script

#### 1. Disable Kroki

Add to `~/.pi/agent/pi-fence.config.json`:

```json
{ "disabled": ["kroki"] }
```

`/reload` in pi. Ask for a mermaid diagram. Expect no rendered image, a "no available processor" log at warn level. `/fence list` shows `kroki [disabled]`.

#### 2. Re-enable at project level

Add to `<cwd>/.pi/pi-fence.config.json`:

```json
{ "disabled": [] }
```

`/reload`. The empty array overrides global. Mermaid renders again.

#### 3. Disable graphviz-local

```json
{ "disabled": ["graphviz-local"] }
```

`dot` blocks fall through to Kroki even when `dot` is on PATH.

### Rollback

`pi uninstall pi-fence`, `/reload`.

## Key files

**Modified:**

- `extensions/pi-fence/config.ts` — `PiFenceConfig.disabled`, validation, merge.
- `extensions/pi-fence/resolve.ts` — `resolveProcessor` disabled param, `resolveBindings` disabled reason.
- `extensions/pi-fence/list.ts` — `listProcessors` disabled status, `formatProcessorLines`.
- `extensions/pi-fence/index.ts` — wire disabled set through.
- `extensions/pi-fence/agent-end.ts` — pass disabled to resolve.
- `extensions/pi-fence/command.ts` — pass disabled to list.
- `tests/unit/config.test.ts`, `tests/unit/resolve.test.ts`, `tests/unit/list.test.ts`.
- `tests/extension/pi-fence.test.ts`.
- `docs/getting-started.md`, `CHANGELOG.md`.

**New:**

None.

## Out of scope — explicitly

- `@zenobius/pi-extension-config` adoption. The hand-rolled loader covers `disabled` the same way it covers `bindings`.
- Per-processor config objects (endpoint, timeout). That's CV1.E1.S2.
- `/fence doctor`. That's CV1.E1.S3.
- Env-var overrides. The file-based surface is the minimum viable control.
