# CVx.E2.S3 — sentinel-based render readiness + timing budget

**Status:** Done

**Epic:** [CVx.E2 — Dev-time Render Screenshots](cvx-e2--dev-time-screenshots.md)
**Depends on:** [CVx.E2.S2 — multi-scenario + gallery](cvx-e2-s2--multi-scenario-gallery.md)
**Date:** 2026-04-20

## Summary

S1 and S2 settled the verifier's shape. S3 closes the determinism gap: replace the pipeline's `setTimeout(100)` "render probably done by now" tail with **sentinels** — observable events the pipeline awaits deterministically. Also ships the timing instrumentation the epic's "under five seconds per scenario" budget requires.

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

## Approach

Drop the pipeline's `setTimeout(100)` tail — the last time-based wait between "we wrote bytes to xterm.js" and "screenshot the page" — and replace it with deterministic observables. Instrument per-combo timing. Use the freshly-deterministic output to either shrink `DIFF_BUDGET` or confirm the current number is minimal for this environment.

## Plan

### Deliverables

#### 1. Sentinel-based wait in the pipeline

`scripts/verify/pipeline.ts`'s `page.evaluate(...)` block currently ends with:

```ts
await new Promise<void>((r) => requestAnimationFrame(() => r()));
await new Promise<void>((r) => requestAnimationFrame(() => r()));
await new Promise<void>((r) => setTimeout(r, 100));
```

Replace the final `setTimeout` with a sentinel. Count expected images in the byte stream (outside the browser, in the pipeline caller) by counting `\x1b_G` prefixes. Pass that count into `page.evaluate` alongside the bytes. Inside the browser:

```ts
const expectedImages: number = args.expectedImages;

if (expectedImages > 0) {
  let seen = 0;
  await new Promise<void>((resolve) => {
    const dispose = imageAddon.onImageAdded(() => {
      seen++;
      if (seen >= expectedImages) {
        dispose.dispose();
        resolve();
      }
    });
    // Safety: if images never arrive, don't hang forever. Resolve
    // after a hard ceiling so pipeline failures surface via the
    // pixel-diff rather than stall the test.
    setTimeout(() => {
      dispose.dispose();
      resolve();
    }, 10_000);
  });
} else {
  // No image sequences expected; xterm's own repaint is the
  // "render settled" signal.
  await new Promise<void>((resolve) => {
    const dispose = term.onRender(() => {
      dispose.dispose();
      resolve();
    });
  });
}

// Two rAFs let layout + paint fully settle after the sentinel fires.
await new Promise<void>((r) => requestAnimationFrame(() => r()));
await new Promise<void>((r) => requestAnimationFrame(() => r()));
```

The safety ceiling on the image-wait is deliberate: if a new scenario's byte stream counts N image APCs but the addon decodes fewer (e.g. one APC is a `q=1` query instead of a transmit), the sentinel would never resolve without it. 10 seconds is generous compared to the 5-second per-scenario budget, yet short enough that a stuck run still surfaces as a slow-and-failing test rather than a hung process.

#### 2. Kitty APC counter

A small helper next to `pipeline.ts`, easy to unit-test:

```ts
// scripts/verify/kitty.ts  (or in-file inside pipeline.ts — decide by footprint)

/**
 * Count Kitty graphics APC transmit sequences in a byte stream.
 * Matches `\x1b_G...\x1b\\` where the APC parameters start with
 * `a=T` or `a=t` (transmit / transmit-and-display). Other APC
 * actions (query `a=q`, delete `a=d`) are ignored so the counter
 * reflects the number of ImageAddon.onImageAdded events a real
 * render will produce.
 */
export function countKittyImages(bytes: string): number;
```

Test coverage in a new `tests/unit/verify-kitty.test.ts`:

1. Zero APCs → 0.
2. One `a=T` APC → 1.
3. Multi-chunk image (`a=T,m=1;...\x1b\\` + `\x1b_Gm=0;...\x1b\\`) → 1.
4. A `q=q` (query) APC → 0.
5. Our real `mermaid-happy-path` byte stream → 1.
6. Our real `mermaid-error-path` byte stream → 0.

#### 3. Timing instrumentation

`RenderResult` grows `durationMs: number`. Measurement: `performance.now()` bracketing the browser-side work (from `context.newPage()` to `page.screenshot()` completion), tracked per combo in `renderScenarioInBrowser`. The pipeline's existing API does not break — `durationMs` is a new field, not a required one.

#### 4. CLI timing log

`scripts/render-verify.ts` after each combo prints:

```text
[render:verify] mermaid-happy-path / default rendered in 456ms
```

And at the end of a multi-combo run:

```text
[render:verify] total: 2 combos in 980ms
```

#### 5. Render-image test timing budget

`tests/render-image/verify.test.ts` gains a budget constant:

```ts
const RENDER_BUDGET_MS = 5000;
// ... inside each combo's assertion block ...
assert.ok(
  result.durationMs < RENDER_BUDGET_MS,
  `${scenario.name}/${variant.name}: render took ${result.durationMs}ms, exceeds ${RENDER_BUDGET_MS}ms budget`,
);
```

#### 6. DIFF_BUDGET recalibration

After landing steps 1–3, run `pnpm test:live` three times consecutively. If all runs show zero diff pixels for both combos, shrink `DIFF_BUDGET` to a small positive number (e.g. 5) and commit the new value with a comment naming the calibration run. If any run still shows non-zero drift, keep `DIFF_BUDGET = 100` and document the observation in the test file (don't "loosen" further; a tighter bound can become a per-combo follow-up if one combo proves stable while the other doesn't).

Recalibration does not roll the committed goldens; the existing PNGs stay.

#### 7. Documentation

- `CHANGELOG.md` [Unreleased]: new `Refined (test layer — CVx.E2.S3 sentinel readiness)` block.
- `docs/getting-started.md`: no user-visible change.
- `docs/project/roadmap/*`: status flips.
- `docs/process/worklog.md`: close entry after the final commit.

### Implementation order

Test-first for the APC counter (steps 1-2); observational for the pipeline behaviour (steps 3–5); empirical for the recalibration (step 6).

1. **`wip(agent): countKittyImages helper (S3 step 1)`** — add the counter + its six unit test cases. Fast suite grows by six cases. No pipeline change yet.
2. **`wip(agent): sentinel-based render readiness (S3 step 2)`** — rewrite the pipeline's `page.evaluate` block to use `ImageAddon.onImageAdded` or `Terminal.onRender` per step 1's count. Keep the two trailing rAFs. `pnpm test:live` runs the existing 2 render-image cases; confirm they pass. Should be slightly faster per combo.
3. **`wip(agent): timing instrumentation (S3 step 3)`** — `RenderResult.durationMs`. CLI stderr logs per combo + total. Spike driver updated minimally.
4. **`wip(agent): render-image timing budget assertion (S3 step 4)`** — add `RENDER_BUDGET_MS = 5000` + assertion. Confirm `pnpm test:live` reports all combos under budget.
5. **`wip(agent): DIFF_BUDGET recalibration (S3 step 5)`** — decide per step 6 above; either shrink the budget or leave a comment explaining why it stays. Run `pnpm test:live` three times; record the numbers.
6. **`wip(agent): S3 docs`** — CHANGELOG + worklog close entry.
7. **`close CVx.E2.S3`** — status flips + worklog close + CVx-lane status update on the CVx parent ("all specced stories done").

**Known unknowns:**

- **`onImageAdded` may fire BEFORE our `await term.write(bytes, cb)` callback returns.** xterm.js's write callback fires after the parser has consumed the bytes; `onImageAdded` fires when the addon's decode pipeline produces a canvas. The order is not documented to be one-before-the-other. Mitigation: register the `onImageAdded` listener BEFORE calling `term.write`, so events emitted mid-parse are not missed.
- **Multi-chunk images** (`m=1` continuations) may produce one `onImageAdded` per chunk or one per image. Inspection of `@xterm/addon-image`'s source is the cheap answer; if the event is per-image, step 1's counter is correct; if per-chunk, the counter needs to match.
- **Very small scenarios (error path)** may finish so quickly that `onRender` has already fired before we register. Mitigation: check `term.buffer.active.cursorY > 0` as a "has rendered something" fallback; if true, don't wait on `onRender`.

## Tests

1. **Layers touched:**
   - **Unit**: `tests/unit/verify-kitty.test.ts` (new, six cases).
   - **Render Image (live)**: `tests/render-image/verify.test.ts` gains the timing-budget assertion; DIFF_BUDGET may shrink.
   - **Contract / Render / Extension / Integration (live)**: untouched.

2. **Events / interactions covered:**
   - `countKittyImages(bytes)` returns the right count for zero / single / multi-chunk / query / mixed sequences.
   - Pipeline awaits `ImageAddon.onImageAdded` for image-bearing scenarios.
   - Pipeline awaits `Terminal.onRender` for image-free scenarios.
   - `RenderResult.durationMs` is populated; CLI logs it; test asserts on it.

3. **Fakes added:** none.

4. **Live tests added / updated:** no new cases; existing two cases gain a timing assertion.

5. **Deferred:**
   - Per-combo `DIFF_BUDGET`.
   - Per-combo timing budgets (a slow combo need not drag the global limit up).
   - `--watch` mode; incremental rendering.
   - Cross-OS calibration.
   - Gallery surface for timing.

## Verification

### Gate

- `pnpm install` + `pnpm test` → fast suite count rises by six (counter cases).
- `pnpm test:live` → both render-image cases pass, timing budget green, DIFF_BUDGET satisfied.
- Three consecutive `pnpm test:live` runs confirm determinism before the recalibration decision.
- Manual: per [Verification](#verification).

### Prerequisites

- Chromium installed from S1 / S2 (`npx playwright install chromium`). No extra steps for S3.

### Automated tests

```bash
pnpm install
pnpm run check
pnpm test
```

Expect green. Fast-suite count rises vs S2 by the six new `countKittyImages` cases.

```bash
pnpm test:live
```

Expect green. Two render-image cases today; each enforces:

- Pixel-diff within `DIFF_BUDGET` against the committed golden.
- Wall-clock `durationMs < 5000ms`.

### Manual test script

#### 1. CLI logs per-combo + total timing

```bash
pnpm --silent render:verify
```

Expect stderr to end with two per-combo timing lines and a total line:

```text
[render:verify] mermaid-happy-path / default rendered in NNNms
[render:verify] mermaid-error-path / default rendered in NNNms
[render:verify] total: 2 combos in NNNms
```

Numbers will vary; each combo should be well under 5000ms on a warm laptop.

#### 2. No `setTimeout(ms)` tail remains in the pipeline

```bash
grep -n "setTimeout" scripts/verify/pipeline.ts
```

Expect at most one match — the 10-second safety ceiling inside the sentinel (named in a comment as the "stuck-render bailout"). No `setTimeout(..., 100)` tail.

#### 3. Sentinel references are in place

```bash
grep -n "onImageAdded\|onRender" scripts/verify/pipeline.ts
```

Expect both to appear in the browser-side `page.evaluate` block.

#### 4. Determinism: three consecutive `pnpm test:live` runs stay green

```bash
for i in 1 2 3; do pnpm test:live 2>&1 | tail -5; done
```

Expect each run to report the same number of passes (2 render-image + N kroki.live depending on your environment) with no flake. If any run fails, check whether `DIFF_BUDGET` was shrunk too aggressively — the failure message names the observed diff pixel count.

#### 5. Timing budget teeth

Temporarily slow one scenario by inserting `await new Promise(r => setTimeout(r, 6000));` inside the scenario's `build()` or at the top of `renderScenarioInBrowser`. Run `pnpm test:live`. Expect the render-image case to fail with a message like:

```text
mermaid-happy-path/default: render took 6234ms, exceeds 5000ms budget
```

Revert the change; confirm green. This step is optional but proves the timing gate has teeth.

#### 6. DIFF_BUDGET recalibration note is present

```bash
grep -A 2 "DIFF_BUDGET" tests/render-image/verify.test.ts
```

Expect the comment explaining the calibration run that set the number — whether S3 shrank it or kept the S1 value with observed variance noted.

#### 7. Gallery still generates and renders cleanly

```bash
pnpm --silent render:verify
open scripts/out/render-verify/index.html    # macOS; xdg-open on Linux
```

Expect both cards present as they were at S2's close. S3 does not touch the gallery layout or captions.

### Rollback

S3 is additive plus a pipeline change. If the sentinel logic flakes in an environment we didn't anticipate:

```bash
git revert <sha-of-step-2>   # restore setTimeout(100)
```

The rest of S3 (counter, timing, budget) can stay; only the sentinel change carries risk of environment-specific regression.

## Key files

**New:**

- `scripts/verify/kitty.ts` (or inline in `pipeline.ts` if one function).
- `tests/unit/verify-kitty.test.ts`.

**Modified:**

- `scripts/verify/pipeline.ts` — sentinel wait; `durationMs` on `RenderResult`.
- `scripts/render-verify.ts` — per-combo + total timing log.
- `scripts/render-image-spike.ts` — picks up `durationMs` in its stderr summary (optional polish; not required).
- `tests/render-image/verify.test.ts` — timing-budget assertion; `DIFF_BUDGET` recalibration.
- `CHANGELOG.md`, `docs/process/worklog.md`, status-flip files.

## Out of scope — explicitly

- New scenarios / variants. S3 does not widen coverage.
- Gallery layout changes.
- Parallel combo rendering.
- CI activation (`.github/workflows/live.yml` stays dormant).
- Cross-OS `DIFF_BUDGET` unification.
- A dedicated benchmark script (`render:verify --bench`, etc.).
