# CV3.E2.S1 — QR code image processor

**Status:** Draft

**Epic:** [CV3.E2 — Utility Processors](cv3-e2--utility-processors.md)
**Date:** 2026-04-23 (spec)

## Summary

A new `qr` processor renders `qr` fenced blocks as QR code PNG images. The block content is the text to encode — URLs, Wi-Fi configs, contact cards, arbitrary strings. Output is a standard PNG via the `qrcode` npm package, displayed inline like any diagram.

## Done criterion

A `qr` fenced block in an assistant turn renders as a QR code PNG image inline. `/fence list` shows `qr [registered]` with tag `qr`. The QR code encodes the fenced block content as-is.

## Scope

**In scope:**

- New `qr.ts` processor implementing `FenceProcessor`.
- `id: "qr"`, `tags: ["qr"]`, `aliases: {}`.
- `available()`: always `{ ok: true }` — `qrcode` is a bundled dev dep, not an external binary.
- `render()`: encode source text as QR code PNG via `qrcode.toBuffer()`, return `{ ok: true; png: Buffer }`.
- Dark-on-transparent output (matches terminal dark themes; the transparent background blends with pi-fence's existing image rendering).
- Registration in `index.ts` after highlight, before kroki.
- Contract test, unit tests, extension test.
- `qrcode` + `@types/qrcode` as dev dependencies.

**Out of scope:**

- QR error correction level config. Default (M) is fine.
- QR size/scale config. Default sizing.
- SVG output. PNG only, consistent with all other image processors.

## Plan

| Step | Layer | What |
|------|-------|------|
| 1 | unit + impl | `qr.ts`: processor factory, available(), render() with qrcode lib |
| 2 | contract | Contract test (image-output) |
| 3 | extension | Full pipeline: qr block → QR code PNG in sent message |

## Tests

- **Unit (step 1):** Render happy path (output is valid PNG — starts with PNG magic bytes). Empty input → error. Abort path.
- **Contract (step 2):** `runFenceProcessorContract` with default `outputKind: "image"`.
- **Extension (step 3):** qr block → qr processor → sent message with `{ type: "image" }` content.
- **Fakes:** none — `qrcode` is an in-process dependency.
- **Live:** none — no external service.

## Key files

**New:** `extensions/pi-fence/qr.ts`, `tests/contract/qr.contract.test.ts`, `tests/unit/qr.test.ts`.

**Modified:** `extensions/pi-fence/index.ts` (registration), `tests/extension/pi-fence.test.ts`, `package.json` (qrcode dep).
