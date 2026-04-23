# CV1.E2.S2 — Error follow-up to the LLM

**Status:** In progress

**Epic:** [CV1.E2 — Error Feedback Loop](cv1-e2--error-feedback-loop.md)
**Depends on:** [CV1.E2.S1](cv1-e2-s1--readable-error-panels.md)
**Date:** 2026-04-22 (spec)

## Summary

When a render fails, pi-fence sends the error as a follow-up message so the LLM sees it in the same turn and can self-correct. Per D2 in the briefing, the extension calls `pi.sendMessage(errorMsg, { deliverAs: "followUp" })`.

## Done criterion

The assistant writes a broken mermaid block (syntax error). pi-fence:

1. Shows the error panel to the user (already done — E2.S1).
2. Sends a follow-up message to the LLM with the error details. The LLM receives the error in its context and can correct the diagram in the same turn.

## Scope

**In scope:**

- On render failure (`result.ok === false`), call `pi.sendMessage` with `{ deliverAs: "followUp" }` containing a text description of the error (tag, processor, error message).
- The follow-up message is a `pi-fence:error-followup` custom type (not `pi-fence:output`) so it doesn't render as a visible panel — the user already saw the error via E2.S1's panel. The follow-up is LLM-directed.
- Extension test: verify the follow-up message is delivered after a failed render.

**Out of scope:**

- Retry logic or automatic re-render. The LLM decides whether to correct.
- Rate limiting follow-ups. The existing `MAX_BLOCKS_PER_TURN` cap limits the blast radius.
- Follow-up on "no processor found" (tag has no available processor). That's not a render error — it's a config/availability issue better surfaced via `/fence doctor`.

## Plan

| Step | Layer | What |
|------|-------|------|
| 1 | unit + impl | `agent-end.ts`: send follow-up on render failure |
| 2 | extension | Extension test: follow-up delivered after broken render |
| 3 | docs | CHANGELOG |

## Tests

**Test layers touched:**

- **Extension** (`tests/extension/pi-fence.test.ts`): broken render → follow-up message in sent messages with `deliverAs: "followUp"`.

**Fakes added:** None.
**Live tests added:** None.

## Verification

### Gate

1. `pnpm run feedback` — full fast gate green.

## Key files

**Modified:**

- `extensions/pi-fence/agent-end.ts` — send follow-up on error.
- `tests/extension/pi-fence.test.ts`.
- `CHANGELOG.md`.
