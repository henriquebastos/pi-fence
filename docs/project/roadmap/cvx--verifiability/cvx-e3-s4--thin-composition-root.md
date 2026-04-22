# CVx.E3.S4 — Thin composition root

**Status:** Done

**Epic:** [CVx.E3 — Refactor Confidence](cvx-e3--refactor-confidence.md)
**Depends on:** [CVx.E3.S3 — Production-owned runtime seams](cvx-e3-s3--production-owned-runtime-seams.md)
**Date:** 2026-04-22 (spec)

## Summary

`CVx.E3.S3` made the runtime seams truthful. The main remaining hotspot is `extensions/pi-fence/index.ts`: it still wires concrete dependencies, probes availability, loads config, registers renderers, handles `/fence`, parses assistant turns, resolves processors, and constructs custom messages in one file.

S4 shrinks that entrypoint into an obvious composition root. The extension should still do the same work, but the work should live in smaller named modules whose responsibilities match the architecture note:

1. edge wiring in `index.ts`
2. slash-command policy in its own module
3. assistant-turn interception/rendering policy in its own module
4. message-shape helpers in their own module

No user-visible behavior changes. The point is scanability and lower-risk follow-up cleanup.

## Done criterion

1. `extensions/pi-fence/index.ts` is primarily a composition root:
   - chooses concrete runtime implementations,
   - creates the default processor list,
   - probes availability / loads config,
   - registers focused handlers/factories.
2. `/fence` command handling no longer lives inline in `index.ts`.
3. `agent_end` interception/render loop no longer lives inline in `index.ts`.
4. Custom-message construction / list-message sending no longer lives inline in `index.ts`.
5. Ambient runtime reads stay at the edge; extracted modules receive their dependencies as arguments.
6. Behavior is unchanged:
   - same `/fence list` output,
   - same block-parsing / max-block behavior,
   - same processor resolution,
   - same custom-message details,
   - same theme-sensitive Kroki appearance behavior.
7. `pnpm run verify:fast` and `pnpm test:live` stay green.
8. `docs/project/architecture.md` remains truthful about the hotspot inventory after the split.

## Scope

**In scope:**

1. Extracting focused modules from `extensions/pi-fence/index.ts`.
2. Moving `/fence` command policy into its own module.
3. Moving `agent_end` turn-processing policy into its own module.
4. Moving message-shape helpers/constants into their own module.
5. Small type reshaping needed to keep those modules dependency-injected and testable.
6. Architecture-note refresh if the hotspot description changes materially.

**Out of scope:**

1. Renaming internal APIs for style alone — that is `CVx.E3.S5`.
2. New commands, processors, settings, or user-visible behavior.
3. Reworking parser / resolver / renderer semantics.
4. Generic event-bus or session abstractions.
5. Repo-tooling-lane refactors.

## Plan

### Deliverables

#### 1. Extract command policy

Expected target: one module owns `/fence` command behavior.

Responsibilities:

1. recognise `list`
2. notify on unknown subcommands
3. emit the list custom message
4. log command-level diagnostics through the injected `Logger`

#### 2. Extract assistant-turn interception policy

Expected target: one module owns the `agent_end` render loop.

Responsibilities:

1. capture theme name from the event context
2. collect assistant text
3. parse supported fenced blocks
4. apply the max-block limit
5. resolve processors
6. render blocks and emit output messages
7. log the same diagnostics as before

The extracted module should receive everything it needs as arguments rather than reaching into Node/process state.

#### 3. Extract message helpers

Expected target: one module owns the pi-fence custom-message constants and payload builders/senders.

Responsibilities:

1. output-message type constant
2. list-message type constant
3. list-message sender helper
4. output-message builder helper

#### 4. Reduce `index.ts` to wiring

At story close, `index.ts` should read as:

1. define runtime deps interface
2. create default processors
3. probe availability + load config
4. register renderers
5. register the extracted command handler
6. register the extracted `agent_end` handler
7. default export wires Node implementations

### Implementation order

| Step | Layer | What | Commit |
|------|-------|------|--------|
| 1 | spec | Create the S4 story file and link it from `cvx-e3--refactor-confidence.md`. | `spec CVx.E3.S4` |
| 2 | code | Extract message helpers + `/fence` command policy from `index.ts`. | `step 1: move command and message policy out of the entrypoint` |
| 3 | code | Extract `agent_end` interception/render policy and leave `index.ts` as wiring. | `step 2: make the extension entrypoint a composition root` |
| 4 | docs | Refresh the architecture note if the hotspot description changed. | `step 3: keep the architecture map truthful after the split` |
| 5 | close | Mark S4 done in roadmap/worklog once the split is verified. | `close CVx.E3.S4` |

## Tests

1. **Layers touched:**
   - **Unit** — any newly-extracted pure/policy helpers with existing coverage fallout.
   - **Extension** — the extension still emits the same messages for `/fence list` and `agent_end`.
   - **Integration / live** — rerun because the same runtime seams are still wired through the entrypoint.
2. **Events / interactions covered:**
   - `/fence list`
   - unknown `/fence` subcommand warning
   - assistant fenced-block interception
   - max-block limit
   - no-processor-available skip path
   - successful and failed render message emission
3. **Fakes added:** none expected.
4. **Live tests added / updated:** none expected; rerun existing live suite.
5. **Deferred:** naming/API cleanup that becomes obvious only after the split (`S5`).

## Verification

```bash
pnpm run verify:fast
pnpm test:live
```

Structural sanity check during development:

```bash
rg -n 'registerCommand|pi\.on\("agent_end"|buildCustomMessage|sendListMessage' extensions/pi-fence/index.ts extensions/pi-fence -g '*.ts'
```

Expected at close:

1. `index.ts` still wires the handlers.
2. the policy/helper implementations live outside `index.ts`.

## Key files

**Modified:**

- `extensions/pi-fence/index.ts`
- new extracted modules under `extensions/pi-fence/`
- extension/unit tests as needed for import fallout
- `docs/project/architecture.md`
- roadmap/worklog files at close

## Out of scope — explicitly

1. Internal API renames whose only purpose is vocabulary polish.
2. New runtime seams.
3. Feature work.
