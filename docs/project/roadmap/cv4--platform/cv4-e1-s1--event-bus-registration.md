# CV4.E1.S1 — Third-party processor registration via event bus

**Status:** Done

**Epic:** [CV4.E1 — Third-party Processors](cv4-e1--third-party-processors.md)
**Date:** 2026-04-23 (spec)

## Summary

Another extension can register a processor with pi-fence at runtime by emitting a `pi-fence:register` event on pi's shared event bus (`pi.events`). pi-fence validates the processor shape, probes availability, adds it to the registry, and begins intercepting its tags immediately. No import of pi-fence code is required — the event bus is the only coupling.

## Done criterion

A second extension that emits `pi.events.emit("pi-fence:register", processorObject)` during `session_start` successfully registers its processor. Fenced blocks for the new processor's tags render through the full pipeline. `/fence list` shows the third-party processor alongside built-ins.

## Scope

**In scope:**

- pi-fence listens for `pi-fence:register` on `pi.events` at init time.
- Incoming processor object validated against `FenceProcessor` shape (id, tags, aliases, available, render).
- Validated processor pushed to the shared processors array, availability probed, supported-tags re-derived.
- `supportedTags` becomes dynamic — the agent-end handler re-derives the allowlist each turn instead of capturing a static snapshot. Cheap (7 processors, <30 tags).
- Confirmation event `pi-fence:registered` emitted with `{ id, tags }` on success.
- Rejection event `pi-fence:register-error` emitted with `{ error }` on validation failure.
- Duplicate id detection: if a processor with the same id is already registered, reject with a clear error.
- New `register.ts` module for validation + registration logic (pure, testable).
- Unit tests for validation, unit test for the listener, extension test with a fake third-party extension.

**Out of scope:**

- Unregistering a processor at runtime. Future.
- Late-registration race (processor registered after the block that needed it). The registration takes effect for the next `agent_end` event.
- Schema validation via TypeBox. Simple runtime shape checks are sufficient.

## Plan

| Step | Layer | What |
|------|-------|------|
| 1 | unit + impl | `register.ts`: validateProcessor(), registerProcessor() — pure logic |
| 2 | refactor | Make supportedTags dynamic in agent-end handler |
| 3 | extension | Wire event listener in index.ts; extension test with fake third-party |

## Tests

- **Unit (step 1):** validateProcessor accepts valid shape, rejects missing id/tags/render, rejects duplicate id. registerProcessor pushes to array and updates availability.
- **Unit (step 2):** agent-end handler re-derives tags each turn (existing tests continue passing).
- **Extension (step 3):** fake extension emits `pi-fence:register` during `session_start`; subsequent fenced block renders via the third-party processor; `/fence list` includes it.
- **Fakes:** no new fakes — EventBus is already shared in real AgentSession tests.
- **Live:** none.

## Key files

**New:** `extensions/pi-fence/register.ts`, `tests/unit/register.test.ts`.

**Modified:** `extensions/pi-fence/index.ts` (event listener, dynamic tags), `extensions/pi-fence/agent-end.ts` (dynamic supportedTags), `tests/extension/pi-fence.test.ts`.

## Design notes

**Event bus protocol.** Channel names are namespaced with `pi-fence:` to avoid collision. The emitter passes a plain object matching the `FenceProcessor` interface. pi-fence validates at the boundary (D7: "validate at the boundaries") and rejects malformed objects gracefully rather than crashing.

**Dynamic supportedTags.** Re-deriving `collectSupportedTags(processors)` on every `agent_end` is O(processors × tags) — trivial with 7–10 processors. The alternative (maintaining a mutable Set) adds state management complexity for no measurable gain.

**Registration timing.** Third-party extensions should emit during `session_start` (which fires after all extension factories run). pi-fence's listener is registered in its factory, so it's ready by the time `session_start` handlers fire.
