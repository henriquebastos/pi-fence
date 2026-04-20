[< S3](README.md)

# Test Guide: CVx.E2.S3 — sentinel-based render readiness

**Plan:** [plan.md](plan.md)
**Story:** [README.md](README.md)
**Epic:** [CVx.E2 — Dev-time Render Screenshots](../README.md)

---

## Prerequisites

- Chromium installed from S1 / S2 (`npx playwright install chromium`). No extra steps for S3.

---

## Automated tests

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

---

## Manual test script

### 1. CLI logs per-combo + total timing

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

### 2. No `setTimeout(ms)` tail remains in the pipeline

```bash
grep -n "setTimeout" scripts/verify/pipeline.ts
```

Expect at most one match — the 10-second safety ceiling inside the sentinel (named in a comment as the "stuck-render bailout"). No `setTimeout(..., 100)` tail.

### 3. Sentinel references are in place

```bash
grep -n "onImageAdded\|onRender" scripts/verify/pipeline.ts
```

Expect both to appear in the browser-side `page.evaluate` block.

### 4. Determinism: three consecutive `pnpm test:live` runs stay green

```bash
for i in 1 2 3; do pnpm test:live 2>&1 | tail -5; done
```

Expect each run to report the same number of passes (2 render-image + N kroki.live depending on your environment) with no flake. If any run fails, check whether `DIFF_BUDGET` was shrunk too aggressively — the failure message names the observed diff pixel count.

### 5. Timing budget teeth

Temporarily slow one scenario by inserting `await new Promise(r => setTimeout(r, 6000));` inside the scenario's `build()` or at the top of `renderScenarioInBrowser`. Run `pnpm test:live`. Expect the render-image case to fail with a message like:

```text
mermaid-happy-path/default: render took 6234ms, exceeds 5000ms budget
```

Revert the change; confirm green. This step is optional but proves the timing gate has teeth.

### 6. DIFF_BUDGET recalibration note is present

```bash
grep -A 2 "DIFF_BUDGET" tests/render-image/verify.test.ts
```

Expect the comment explaining the calibration run that set the number — whether S3 shrank it or kept the S1 value with observed variance noted.

### 7. Gallery still generates and renders cleanly

```bash
pnpm --silent render:verify
open scripts/out/render-verify/index.html    # macOS; xdg-open on Linux
```

Expect both cards present as they were at S2's close. S3 does not touch the gallery layout or captions.

---

## Rollback

S3 is additive plus a pipeline change. If the sentinel logic flakes in an environment we didn't anticipate:

```bash
git revert <sha-of-step-2>   # restore setTimeout(100)
```

The rest of S3 (counter, timing, budget) can stay; only the sentinel change carries risk of environment-specific regression.

---

**See also:** [README](README.md) · [Plan](plan.md) · [S2 test guide](../cvx-e2-s2-multi-scenario-gallery/test-guide.md)
