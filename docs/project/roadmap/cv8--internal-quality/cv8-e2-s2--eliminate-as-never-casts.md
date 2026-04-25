# CV8.E2.S2 — Eliminate `as never` casts

**Status:** Ready

**Epic:** [CV8.E2 — Robustness](cv8-e2--robustness.md)
**Date:** 2026-04-25 (spec)

## Summary

Pi-fence uses `as never` casts in 14 places across `messages.ts`, `agent-end.ts`, and `index.ts` to silence type mismatches with pi's API. These casts suppress real type checking at the boundary. Eliminate all of them using structural typing — declare local interfaces that match the upstream shapes, and fix constructor signature mismatches in the renderer.

## Root causes and fixes

**Content arrays (10 casts in `messages.ts` + `agent-end.ts`).** `pi.sendMessage()` expects `content: (TextContent | ImageContent)[]`. Pi-fence builds content inline but can't import `TextContent`/`ImageContent` — they live in `@mariozechner/pi-ai` and aren't re-exported by `pi-coding-agent`. Without type annotation, TypeScript infers `type: string` instead of `type: "text"`, which doesn't satisfy the literal discriminant. **Fix:** declare local `TextContent` and `ImageContent` interfaces with the same shape. Structural typing makes them compatible.

**Details objects (4 casts in `messages.ts`).** `sendMessage<T = unknown>` infers `T` from the call site. When `content` and `details` give TypeScript conflicting `T` signals, inference fails. **Fix:** specify the generic explicitly at the call site — e.g. `pi.sendMessage<PiFenceOutputDetails>({ ... })`. Content types and details type-check without casts.

**Renderer registration (2 casts in `index.ts`).** `registerMessageRenderer` expects `MessageRenderer<T>` which returns `Component | undefined`. Pi-fence's renderer returns `PiTuiContainer`. The real mismatch: the `tui` parameter's constructor signatures don't match pi-tui's actual constructors (e.g. `Text` declared as `(text, x, y)` but pi-tui's is `(text, paddingX, paddingY, bgFn?)`). **Fix:** align constructor signatures with pi-tui's actual API. Drop the hollow `PiTuiComponent`/`PiTuiContainer` wrapper interfaces — use `Component` from pi-tui directly and a `Container` interface with `addChild`.

**Pi-tui class casts (4 casts in `index.ts`).** `Box as never`, `Text as never`, etc. These exist because the `tui` parameter signatures don't match the real constructors. **Fix:** once the signatures are aligned, the classes satisfy the parameter type and the casts disappear.

## Done criterion

1. Zero `as never` casts in the codebase.
2. Local `TextContent` and `ImageContent` interfaces declared and used for content arrays.
3. Renderer `tui` parameter constructor signatures match pi-tui's actual API.
4. `PiTuiComponent`/`PiTuiContainer` replaced with `Component` + a minimal `Container` interface.
5. `pnpm run feedback` passes.

## Scope

**In scope:**

- Declare `TextContent` and `ImageContent` in `messages.ts`. `agent-end.ts` imports from there (already imports `buildPiFenceOutputMessage` from `messages.ts`).
- Type content arrays and remove `as never` from `messages.ts` and `agent-end.ts`.
- Specify the `sendMessage` generic explicitly at call sites to fix details typing.
- Align renderer `tui` parameter signatures with pi-tui (`Text(text, paddingX, paddingY, bgFn?)`, etc.).
- Replace `PiTuiComponent`/`PiTuiContainer` with `Component` from pi-tui + a `Container` interface.
- Remove `as never` from renderer registration and pi-tui class passing in `index.ts`.

**Out of scope:**

- Upstream PR to re-export `TextContent`/`ImageContent` from `pi-coding-agent` (separate, complementary).
- Changing renderer visual behavior.

## Plan

| Step | Layer | What |
|------|-------|------|
| 1 | impl | Declare local `TextContent` and `ImageContent`. Use them to type content arrays in `messages.ts` and `agent-end.ts`. Remove content/details `as never` casts. |
| 2 | impl | Align renderer `tui` parameter signatures with pi-tui actual constructors. Replace `PiTuiComponent`/`PiTuiContainer` with `Component` + `Container`. Remove renderer `as never` casts in `index.ts`. |
| 3 | refactor | Verify zero `as never` remain. `pnpm run feedback`. |

## Tests

- **Unit:** All existing renderer, messages, and extension tests pass unchanged — no behavioral change.
- **Fakes:** None new.
- **Live:** None affected.
- **Deleted:** None.

## Verification

`pnpm run feedback` — all five gates pass. `grep -r "as never" extensions/pi-fence/` returns nothing.

## Key files

**Modified:** `extensions/pi-fence/messages.ts` (local content types, remove casts), `extensions/pi-fence/agent-end.ts` (remove cast), `extensions/pi-fence/renderer.ts` (align signatures, replace wrapper types), `extensions/pi-fence/index.ts` (remove all casts).
