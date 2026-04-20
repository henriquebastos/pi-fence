[< S3](README.md)

# Plan: CVx.E2.S3 — sentinel-based render readiness + timing budget

**Story:** [README.md](README.md)
**Epic:** [CVx.E2 — Dev-time Render Screenshots](../README.md)
**Depends on:** [CVx.E2.S2 — multi-scenario + gallery](../cvx-e2-s2-multi-scenario-gallery/README.md)
**Date:** 2026-04-20

## Goal

Drop the pipeline's `setTimeout(100)` tail — the last time-based wait between "we wrote bytes to xterm.js" and "screenshot the page" — and replace it with deterministic observables. Instrument per-combo timing. Use the freshly-deterministic output to either shrink `DIFF_BUDGET` or confirm the current number is minimal for this environment.

---

## Deliverables

### 1. Sentinel-based wait in the pipeline

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

### 2. Kitty APC counter

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

### 3. Timing instrumentation

`RenderResult` grows `durationMs: number`. Measurement: `performance.now()` bracketing the browser-side work (from `context.newPage()` to `page.screenshot()` completion), tracked per combo in `renderScenarioInBrowser`. The pipeline's existing API does not break — `durationMs` is a new field, not a required one.

### 4. CLI timing log

`scripts/verify.ts` after each combo prints:

```text
[render:verify] mermaid-happy-path / default rendered in 456ms
```

And at the end of a multi-combo run:

```text
[render:verify] total: 2 combos in 980ms
```

### 5. Render-image test timing budget

`tests/render-image/verify.test.ts` gains a budget constant:

```ts
const RENDER_BUDGET_MS = 5000;
// ... inside each combo's assertion block ...
assert.ok(
  result.durationMs < RENDER_BUDGET_MS,
  `${scenario.name}/${variant.name}: render took ${result.durationMs}ms, exceeds ${RENDER_BUDGET_MS}ms budget`,
);
```

### 6. DIFF_BUDGET recalibration

After landing steps 1–3, run `pnpm test:live` three times consecutively. If all runs show zero diff pixels for both combos, shrink `DIFF_BUDGET` to a small positive number (e.g. 5) and commit the new value with a comment naming the calibration run. If any run still shows non-zero drift, keep `DIFF_BUDGET = 100` and document the observation in the test file (don't "loosen" further; a tighter bound can become a per-combo follow-up if one combo proves stable while the other doesn't).

Recalibration does not roll the committed goldens; the existing PNGs stay.

### 7. Documentation

- `CHANGELOG.md` [Unreleased]: new `Refined (test layer — CVx.E2.S3 sentinel readiness)` block.
- `docs/getting-started.md`: no user-visible change.
- `docs/project/roadmap/*`: status flips.
- `docs/process/worklog.md`: close entry after the final commit.

---

## Implementation order

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

---

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

---

## Verification

- `pnpm install` + `pnpm test` → fast suite count rises by six (counter cases).
- `pnpm test:live` → both render-image cases pass, timing budget green, DIFF_BUDGET satisfied.
- Three consecutive `pnpm test:live` runs confirm determinism before the recalibration decision.
- Manual: per [test-guide.md](test-guide.md).

---

## Key files

**New:**

- `scripts/verify/kitty.ts` (or inline in `pipeline.ts` if one function).
- `tests/unit/verify-kitty.test.ts`.

**Modified:**

- `scripts/verify/pipeline.ts` — sentinel wait; `durationMs` on `RenderResult`.
- `scripts/verify.ts` — per-combo + total timing log.
- `scripts/render-image-spike.ts` — picks up `durationMs` in its stderr summary (optional polish; not required).
- `tests/render-image/verify.test.ts` — timing-budget assertion; `DIFF_BUDGET` recalibration.
- `CHANGELOG.md`, `docs/process/worklog.md`, status-flip files.

---

## Out of scope — explicitly

- New scenarios / variants. S3 does not widen coverage.
- Gallery layout changes.
- Parallel combo rendering.
- CI activation (`.github/workflows/live.yml` stays dormant).
- Cross-OS `DIFF_BUDGET` unification.
- A dedicated benchmark script (`render:verify --bench`, etc.).

---

**See also:** [README](README.md) · [Test Guide](test-guide.md) · [CVx.E2](../README.md) · [CVx.E2.S2 plan](../cvx-e2-s2-multi-scenario-gallery/plan.md) · [Principles — Testing](../../../../../product/principles.md#testing)
