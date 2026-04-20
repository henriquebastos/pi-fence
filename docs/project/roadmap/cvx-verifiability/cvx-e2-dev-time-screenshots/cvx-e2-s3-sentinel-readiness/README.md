[< CVx.E2 — Dev-time Render Screenshots](../README.md)

# S3 — Sentinel-based render readiness 🛠️ Planned

S1 and S2 settled the verifier's shape. S3 closes the determinism gap: replace the pipeline's `setTimeout(100)` "render probably done by now" tail with **sentinels** — observable events the pipeline awaits deterministically. Also ships the timing instrumentation the epic's "under five seconds per scenario" budget requires.

- [Plan](plan.md) — deliverables, implementation order, verification steps
- [Test Guide](test-guide.md) — manual test script

## Done criterion

1. `scripts/verify/pipeline.ts` no longer relies on `setTimeout(ms)` as its readiness oracle. The pipeline counts the Kitty graphics sequences in the scenario's byte stream, then awaits that many `ImageAddon.onImageAdded` events before screenshotting. For scenarios with zero images (e.g. `mermaid-error-path`), the pipeline awaits `Terminal.onRender` once after the `term.write` callback resolves — xterm.js's documented "I just repainted" signal.
2. Each render logs a per-scenario timing line on stderr: `[render:verify] mermaid-happy-path / default rendered in NNNms`. The CLI additionally prints a final "total: N combos in NNNms" line so a reviewer can see at a glance whether the five-second-per-scenario budget is holding.
3. A small timing guard lives in `tests/render-image/verify.test.ts`: each combo's wall-clock render time must be under `5000ms`. If the budget is blown, the test fails with a message pointing at the combo and the observed duration. This is a live-suite assertion (it needs a real Chromium anyway), not a fast-suite one.
4. `DIFF_BUDGET` may shrink. With deterministic readiness, we expect zero diff pixels across consecutive runs on the same machine. S3 narrows the budget to whatever headroom remains after the sentinel changes and commits the new number in the test file alongside a comment naming the calibration run.
5. `pnpm test:live` stays green; the fast suite is unaffected. `pnpm render:verify` still produces the same PNGs and the same gallery.

## Scope

**In scope:**

- Replace the pipeline's final `setTimeout(100)` with a sentinel awaited inside `page.evaluate`. The sentinel logic lives in the same browser-context evaluation that currently drives the write / rAF sequence — counting Kitty APC prefixes in the captured bytes and waiting for `ImageAddon.onImageAdded` to fire that many times, or for `Terminal.onRender` when image count is zero. Two rAFs after the sentinel stay (deterministic, cheap) so layout + paint fully settle.
- Timing instrumentation on `RenderResult`: new field `durationMs: number`. The CLI uses it for stderr logging; the live test asserts on it; the gallery may surface it in a future story (S3 does not touch the gallery caption shape).
- Timing budget assertion in the render-image test: `assert(durationMs < RENDER_BUDGET_MS)` with `RENDER_BUDGET_MS = 5000`. If it blows, the failure message names the combo and the observed duration.
- Recalibrate `DIFF_BUDGET`. Run the verifier three times in a row after the sentinel change lands; if all three produce zero diff pixels, shrink `DIFF_BUDGET` to a small positive number (e.g. 5) and commit the new value with a calibration-run note. If any run still shows drift, keep the S1/S2 value (100) and document the reason.

**Out of scope:**

- New scenarios or variants. S3 is a pipeline-determinism story, not a coverage story.
- The gallery's card caption format. A future story can add per-card timing, click-to-zoom, etc.
- Cross-OS golden normalization. The `DIFF_BUDGET` stays calibrated against the authoring machine; CI on another OS remains a carry-forward regardless of S3.
- Parallel rendering of combos. `renderCombos` stays serial across the shared Chromium — S3 is about per-combo determinism, not batch throughput. If the five-second budget is consistently observed per combo, parallelism is unnecessary; if it isn't, a future story can consider it.
- `--watch` mode or incremental rendering. Deferred.
- Chromium version pinning infrastructure (version detection, per-version budgets). If the sentinel change makes determinism robust enough, the need goes away; if not, this becomes a separate story.

---

**See also:** [Plan](plan.md) · [Test Guide](test-guide.md) · [CVx.E2](../README.md) · [CVx.E2.S2](../cvx-e2-s2-multi-scenario-gallery/README.md) · [Principles — Testing](../../../../../product/principles.md#testing)
