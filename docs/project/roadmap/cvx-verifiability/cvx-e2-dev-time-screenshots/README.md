[< CVx — Verifiability](../README.md)

# CVx.E2 — Dev-time Render Screenshots

**Roadmap:** [CVx](../../README.md)
**Last updated:** 2026-04-20

Produce real PNG screenshots of what pi-fence would render in a Kitty-graphics-capable terminal, headlessly, on demand. The text side of rendering is verifiable at the `VirtualTerminal` + `.term-row` level (CVx.E1 covers this, and a wterm+jsdom a11y-style spike demonstrated a cheap second pass at it); the image side — whether the mermaid diagram a user would actually *see* is the mermaid diagram they asked for — cannot be verified from bytes alone. This Epic closes that gap.

## Stories

| Code | Story | Status |
|------|-------|--------|
| [S1](cvx-e2-s1-headless-image-verifier/README.md) | **`pnpm render:verify` produces a diffable PNG of one named pi-fence scenario, headlessly; a pixel-diff test gates regressions** | ✅ Done |
| [S2](cvx-e2-s2-multi-scenario-gallery/README.md) | **Multi-scenario rendering with a per-run HTML gallery; variants plumbing ready for future theme/width matrices** | ✅ Done |
| `S3` | **Sentinel-based readiness; edit-verify loops complete in under five seconds per scenario** | Planned |

## Deliverable vision (epic scope)

A contributor touching the pi-fence renderer sees both its text layout and its image rendering caught by automation on every commit. A human reviewer opening a PR opens one PNG (or a small gallery) and decides in seconds whether the visual change matches the intent.

`pnpm render:verify` is the entry point. It runs headlessly — no Kitty/Ghostty window spawned, no `screencapture`, no macOS GUI assumption, no shell lifecycle race. The full verifier runs in CI on the same hardware as `pnpm test:live`.

## Why the original framing was revised

The original S1 table row (pre-spike) said "A script captures the bytes pi-tui emits for a scenario and paints them in a real Kitty window; the resulting screenshot lands on disk." Three CVx.E2 spikes taught us the assumption hidden in that sentence was wrong:

1. **`scripts/render-screenshot.ts` (live-Ghostty spike).** Tried to dump pi-tui's captured byte stream to `process.stdout` from a standalone script. Failed on the user's Ghostty because pi-tui assumes it owns the terminal viewport: `\x1b[29A` cursor movements and `\x1b[16t` cell-size query race against the surrounding shell, produce no reliable rendered panel, and leak `^[[6;34;17t` into the next shell prompt. Two fix attempts (readline, raw-mode stdin) didn't resolve the lifecycle mismatch.
2. **`scripts/render-a11y-spike.ts` (wterm + jsdom spike).** Drove the same byte stream through [wterm](https://github.com/vercel-labs/wterm)'s VT100/xterm parser inside jsdom, read rendered text via `.term-row` textContent. Headless, CI-capable, verifies text layout — but wterm does not implement the Kitty graphics protocol, so the APC payload leaks as text and the image itself is never rendered.
3. **`scripts/render-image-spike.ts` (xterm.js + Kitty addon + headless Chromium).** xterm.js is the parser that powers `@xterm/headless` (our `VirtualTerminal` test rig) and has a beta image addon `@xterm/addon-image@^0.10.0-beta.197` that implements the Kitty protocol. Drove the byte stream through xterm.js + the image addon in a headless Chromium via `playwright-core`; `page.screenshot()` produced a real PNG showing the label *and* the actual mermaid diagram. Headless, CI-capable, proves both text and image.

Spike 3 is the shape `CVx.E2.S1` promotes to a first-class verifier. Spikes 1 and 2 remain in the tree as records of the roads not taken — spike 1 because the approach is foundationally wrong for our needs, spike 2 because the jsdom+wterm text-layout path is a possible second oracle if wterm grows Kitty support or if a cheaper offline check is desired later.

## Architecture

One new test layer conceptually (**Render Image**, runs under `pnpm test:live` because it spawns a browser); one new dev-time command (`pnpm render:verify`); one scenario registry that both consume.

```text
scripts/
  verify.ts                   # pnpm render:verify entry point
  verify/
    scenarios.ts              # scenario registry (name → bytes + dimensions)
    pipeline.ts               # capture → render → screenshot pipeline (S1)

tests/
  fixtures/
    golden/
      mermaid-happy-path.png  # committed golden bytes (S1 ships one)
  render-image/
    verify.test.ts            # pixelmatch against golden, gated on Chromium
```

## Out of scope — explicitly (epic-level)

- Screen-reader / accessibility validation beyond CVx.E1's render-layer DOM readback. The a11y spike stays as a separate future direction under CVx.E1.
- Animated / streaming terminal capture. Single-frame screenshots only.
- Running in the *fast* suite. The browser launch is too heavy for `pnpm test`; this layer belongs to `pnpm test:live`.
- Visual-diff review UI (HTML viewer with swipe comparison, etc.). A future story if the diff surface grows enough to justify it.
- Replacing the render-layer tests (`tests/unit/renderer.test.ts`) with image diffs. Render-layer tests verify *byte stream shape*; image tests verify *rendered pixels*. Both are useful; neither replaces the other.

## Done criterion (epic-level)

`pnpm render:verify` captures at least two scenarios (one mermaid, one error-path or a second diagram family) with deterministic output, produces a browsable gallery of their PNGs per run, and completes in under five seconds per scenario on a warm laptop. Pixel-diff gates regressions in the fast-live suite without false-positiving across Chromium patch revisions. S1 ships the first scenario + the first diff gate; S2 adds the gallery + the second scenario; S3 closes the timing and determinism targets.

---

**See also:** [Plan (via S1)](cvx-e2-s1-headless-image-verifier/plan.md) · [CVx.E1](../cvx-e1-pi-tui-idiom/README.md) · [Principles — Testing](../../../../product/principles.md#testing) · [Worklog entry 2026-04-20 — CVx.E2 spikes 2 and 3](../../../../process/worklog.md)
