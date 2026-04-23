# CV3.E2.S2 — Color/palette swatch processor

**Status:** Done

**Epic:** [CV3.E2 — Utility Processors](cv3-e2--utility-processors.md)
**Date:** 2026-04-23 (spec)

## Summary

A new `color` processor renders `color` and `palette` fenced blocks as colored text swatches using ANSI 24-bit (truecolor) escape sequences. Each line contains a color value (hex, `rgb()`, or named CSS color); the processor renders a filled block of that color followed by its label.

## Done criterion

A `color` or `palette` fenced block in an assistant turn renders as ANSI-colored swatches. `/fence list` shows `color [registered]` with tags `color`, `palette`. Each color appears as a filled rectangle next to its value.

## Scope

**In scope:**

- New `color.ts` processor implementing `FenceProcessor`.
- `id: "color"`, `tags: ["color", "palette"]`, `aliases: {}`.
- `available()`: always `{ ok: true }` — pure logic.
- `render()`: parse each line as a color, render ANSI truecolor swatch, return `{ ok: true; text: string }`.
- Hex colors: `#RGB`, `#RRGGBB`, `#RRGGBBAA` (alpha ignored for swatch).
- `rgb(r, g, b)` and `rgba(r, g, b, a)` function syntax.
- Named CSS colors: the 17 standard CSS colors (black, white, red, green, blue, etc.).
- Each swatch: `██████ #RRGGBB label` where the block characters are colored with ANSI truecolor (`\x1b[38;2;R;G;Bm`).
- Lines that aren't valid colors → rendered as-is (labels, headers, blank lines).
- Registration in `index.ts` after qr, before kroki.
- Contract test, unit tests, extension test.

**Out of scope:**

- HSL/HSV color models. Future.
- Full 148 named CSS color list. Ship with the 17 standard ones; easy to extend.
- Image output (pixel swatches). Text/ANSI is sufficient for terminal display.
- Color distance or contrast calculations. Future.

## Plan

| Step | Layer | What |
|------|-------|------|
| 1 | unit + impl | `color.ts`: processor factory, color parsing, ANSI swatch rendering |
| 2 | contract | Contract test (text-output) |
| 3 | extension | Full pipeline: color/palette block → ANSI swatches in sent message |

## Tests

- **Unit (step 1):** Hex parsing (#RGB, #RRGGBB). rgb() parsing. Named colors. Mixed lines with labels. Empty input → error. Abort path.
- **Contract (step 2):** `runFenceProcessorContract` with `outputKind: "text"`.
- **Extension (step 3):** color block → color processor → sent message with ANSI text content.
- **Fakes:** none — pure logic.
- **Live:** none — no external dependencies.

## Key files

**New:** `extensions/pi-fence/color.ts`, `tests/contract/color.contract.test.ts`, `tests/unit/color.test.ts`.

**Modified:** `extensions/pi-fence/index.ts` (registration), `tests/extension/pi-fence.test.ts`.
