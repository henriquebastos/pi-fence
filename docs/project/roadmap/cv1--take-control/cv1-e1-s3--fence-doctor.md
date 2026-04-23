# CV1.E1.S3 — `/fence doctor`

**Status:** In progress

**Epic:** [CV1.E1 — Explicit Configuration](cv1-e1--explicit-configuration.md)
**Depends on:** [CV1.E1.S2](cv1-e1-s2--kroki-endpoint-config.md)
**Date:** 2026-04-22 (spec)

## Summary

`/fence doctor` prints a diagnostic summary: every registered processor, its availability, disabled status, configured endpoint, supported tags, and effective bindings. It's the `/fence list` output plus actionable detail — install hints for unavailable processors, the effective config file paths, and any ignored bindings with reasons.

## Done criterion

The user types `/fence doctor`. The output shows:

```text
Config
  global: ~/.pi/agent/pi-fence.config.json (loaded)
  project: .pi/pi-fence.config.json (not found)

Processors
  graphviz-local [registered] — graphviz (dot)
  kroki [registered] (http://localhost:8000) — mermaid, graphviz (dot), plantuml (puml), …

Bindings
  dot → graphviz-local

No issues found.
```

Or, when problems exist:

```text
Config
  global: ~/.pi/agent/pi-fence.config.json (loaded)
  project: .pi/pi-fence.config.json (malformed JSON — using defaults)

Processors
  graphviz-local [unavailable] — graphviz (dot)
      dot binary not found on PATH. Install graphviz — brew install graphviz (macOS)
  kroki [disabled] — mermaid, …

Ignored bindings
  mermaid → kroki (processor disabled)

Issues
  - kroki is disabled; 17 tags have no available processor
  - graphviz-local is unavailable: dot not found
```

## Scope

**In scope:**

- `/fence doctor` subcommand on the existing `/fence` command.
- Config section: shows global + project config file paths and their load status (loaded, not found, malformed).
- Processors section: reuses `listProcessors` + `formatProcessorLines` from `list.ts`.
- Issues section: summarises actionable problems — disabled processors, unavailable processors, tags with no available processor.
- Sends output via the existing `pi-fence:list` custom message type (same renderer).

**Out of scope:**

- Network reachability check (ping Kroki endpoint). Per-render errors already surface that; doctor stays offline.
- Auto-fix suggestions (e.g., `brew install graphviz`). Install hints are already on the unavailable detail line.
- Config file editing from the command.

## Plan

### Implementation order

| Step | Layer | What |
|------|-------|------|
| 1 | unit + impl | Config loader exposes load status per file |
| 2 | unit + impl | Doctor logic: compute issues from processors/availability/disabled/bindings |
| 3 | unit + impl | `/fence doctor` subcommand wiring + message |
| 4 | extension | Extension test: doctor output through AgentSession |
| 5 | docs | getting-started, CHANGELOG |

## Tests

**Test layers touched:**

- **Unit** (`tests/unit/config.test.ts`): config loader returns load status per file.
- **Unit** (new `tests/unit/doctor.test.ts` or inline in `list.test.ts`): doctor issues computation.
- **Extension** (`tests/extension/pi-fence.test.ts`): `/fence doctor` through AgentSession.
- **Contract**: unchanged.
- **Integration (live)**: unchanged.

**Fakes added:** None.
**Live tests added:** None.

## Verification

### Gate

1. `pnpm run feedback` — full fast gate green.

### Manual test script

1. Type `/fence doctor` with default config. Expect "No issues found."
2. Add `"disabled": ["kroki"]` to config, `/reload`, `/fence doctor`. Expect issues listing.
3. Uninstall graphviz, `/reload`, `/fence doctor`. Expect install hint.

## Key files

**Modified:**

- `extensions/pi-fence/command.ts` — add `doctor` subcommand.
- `extensions/pi-fence/io/config-loader.ts` — expose per-file load status.
- `extensions/pi-fence/list.ts` or new `extensions/pi-fence/doctor.ts` — issues computation.
- `extensions/pi-fence/messages.ts` — doctor message builder.
- Tests as listed above.
- `docs/getting-started.md`, `CHANGELOG.md`.

**New:**

- Possibly `extensions/pi-fence/doctor.ts` if the logic is substantial enough to warrant its own module.
