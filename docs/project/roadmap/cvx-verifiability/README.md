[< Roadmap](../README.md)

# CVx — Verifiability

> Cross-cutting lane. Not a linear stage in a user's journey; a commitment that every user-visible behavior in CV0–CV4 is backed by automation that proves it — fast enough to run on every commit, faithful enough that a passing suite means a working product.

**Type:** `verifiability`
**Status:** in progress (Verifiability is *always* advancing; this lane tracks the explicit investments)
**Last updated:** 2026-04-19

## Why a cross-cutting lane, not a numbered CV

The [briefing](../../briefing.md#community-value) names Verifiability as one of the five Community Values but flags it as cross-cutting: every feature story advances it implicitly by shipping tests, and explicit testing-infrastructure stories earn progression credit in the roadmap without being a linear stage in a user's experience. `CVx` instead of `CV5` signals this: the lane runs alongside CV0–CV4, not after them.

The trigger that earned this lane an explicit Epic set: the eight `wip(agent): …` render-polish commits between `CV0.E1.S3`'s close and `2026-04-19` all fixed visual bugs the existing test suite did not catch (width, padding order, bottom stripe, background tint, theme-tracking query-param, duplicate label, absent PNG). Each was caught by a human looking at a terminal. That's a signal: the test pyramid is missing a rung where pi-tui emission meets terminal rendering.

## Deliverable vision

A contributor opens a PR. The automated suite, running on every commit, asserts not just "the extension dispatched correctly" but "the bytes pi-tui would send to the terminal are the right bytes, and when painted they produce the right viewport." The contributor also has a dev-time command that spawns a real Kitty window, paints pi-fence's output, screenshots it, and drops the PNG in an artifacts directory — so "does it look right?" is answered by opening an image, not by running pi manually.

## Relationship to existing Epics

This lane **does not replace** the testing foundation `CV0.E1.S0` established. It extends it. S0 built the four-layer test tree (unit, contract, extension, integration/live). CVx adds a fifth conceptual layer — **render verification** — that sits between extension and live:

| Layer | What it tests | Added in |
|-------|--------------|----------|
| Unit | Pure logic | CV0.E1.S0 |
| Contract | `FenceProcessor` conformance | CV0.E1.S0 |
| Extension | pi-fence inside a real `AgentSession` with fakes | CV0.E1.S0 |
| **Render (new)** | **Bytes pi-tui emits + resulting viewport, via `VirtualTerminal`** | **CVx.E1** |
| Integration (live) | Real processors against real binaries / real HTTP | CV0.E1.S0 |

Dev-time tooling (`CVx.E2`) is parallel, not a test layer — it's a script for humans, producing artifacts for humans.

## Epics

| Code | Epic | Status |
|------|------|--------|
| [CVx.E1](cvx-e1-pi-tui-idiom/README.md) | **pi-tui Testing Idiom** | Planned |
| `CVx.E2` | **Dev-time Render Screenshots** | Planned |

`CVx.E1` comes first because it is additive, pure refactor, and delivers value the next time a render bug ships (which, given the recent commit history, is likely soon). `CVx.E2` is larger infrastructure — spike first, spec second — and can proceed in parallel with feature CVs once E1 lands.

## Done criterion (lane-level)

The lane never "closes" in the traditional sense because Verifiability is continuous. Specific criteria per Epic:

- **CVx.E1 done**: every test under `tests/unit/renderer.test.ts` and `tests/extension/pi-fence.test.ts` asserts against real pi-tui primitives (imported from `@mariozechner/pi-tui`) painting into a `VirtualTerminal`; hand-rolled pi-tui fakes under `tests/utilities/` are deleted; at least one byte-stream invariant (e.g. "a Kitty graphics protocol sequence is emitted for a rendered mermaid block") is asserted.
- **CVx.E2 done**: `pnpm run verify` (or named equivalent) captures at least two scenarios against real Kitty, produces a gallery, and completes in under 5 seconds per scenario on a warm laptop.

---

**See also:** [Roadmap](../README.md) · [Briefing](../../briefing.md) · [Principles — Testing](../../../product/principles.md#testing) · [Worklog](../../../process/worklog.md)
