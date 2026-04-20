[< S1](README.md)

# Test Guide: CVx.E2.S1 — headless image verifier

**Plan:** [plan.md](plan.md)
**Story:** [README.md](README.md)
**Epic:** [CVx.E2 — Dev-time Render Screenshots](../README.md)

---

## Prerequisites

- Node + pnpm, per existing project setup.
- **Chromium** installed via `npx playwright install chromium` (one-time, ~150 MB download, cached globally at `~/Library/Caches/ms-playwright/`). Only needed for the image-verifier path; skipped cleanly when absent.

No Docker, no Kroki network access for the verifier itself. The existing committed Kroki fixture (`tests/fixtures/mermaid-flowchart.png`) is the only PNG the `mermaid-happy-path` scenario uses.

---

## Automated tests

```bash
pnpm install
pnpm run check
pnpm test
```

Expect green. 161 cases — unchanged from pre-S1 baseline (the render-image test lives in the live suite, not the fast suite).

```bash
pnpm test:live
```

Expect:

- Existing integration cases (Kroki, shell-runner) — pass or skip cleanly per their current gates.
- **New**: `tests/render-image/verify.test.ts` — one case, `mermaid-happy-path` matches the committed golden within tolerance. Skipped cleanly with a message if Chromium is not installed.

Total live-suite case count delta: +1 when Chromium present; 0 when absent.

---

## Manual test script

### 1. `pnpm render:verify --list` prints the scenario registry

```bash
pnpm render:verify --list
```

Expect:

```text
Registered scenarios:
  mermaid-happy-path — pi-fence:output panel with Kroki-rendered mermaid flowchart
```

One row today; the list grows in S2.

### 2. `pnpm render:verify` produces a PNG for the default scenario

```bash
pnpm render:verify
```

Expect:

- Exit code 0.
- A PNG exists at `scripts/out/render-verify/mermaid-happy-path/render.png`.
- Opening the PNG: visible "Rendered mermaid via kroki" label at top, actual mermaid flowchart (`A → B → C` boxes with arrows) rendered below, on a black terminal background.
- A `render.bin` byte-stream capture exists alongside for inspection.

### 3. `pnpm render:verify --scenario mermaid-happy-path` is explicit; equivalent output

```bash
pnpm render:verify --scenario mermaid-happy-path
```

Expect: identical result to step 2. Proves the `--scenario` flag is wired; not just the default.

### 4. `pnpm test:live` picks up the render-image test

```bash
pnpm test:live
```

With Chromium installed: expect a new passing case reporting the pixel-diff count, which should be under the committed `DIFF_BUDGET`. Without Chromium: expect the render-image suite to report "skipped" (not failed) and the exit code to stay at 0.

### 5. Deliberate break → diff image surfaces

Temporarily modify `scripts/verify/scenarios.ts` so `mermaid-happy-path` passes a different PNG (e.g. `tests/fixtures/mermaid-flowchart.png` → a swapped fixture, or a manually-munged copy). Run `pnpm test:live`.

Expect:

- The render-image case fails with an error message naming the observed diff-pixel count and pointing at `scripts/out/render-verify/mermaid-happy-path/diff.png`.
- Opening `diff.png`: the differing pixel regions are highlighted (pixelmatch draws diffs in a bright color).
- Revert the scenario change; `pnpm test:live` goes green again.

This step is optional but recommended — it proves the diff gate has teeth and the diff artifact is discoverable.

### 6. `pnpm render:verify --update` overwrites the golden

(Only do this when a rendering change has been explicitly approved.)

```bash
pnpm render:verify --update
```

Expect:

- `tests/fixtures/golden/mermaid-happy-path.png` is overwritten with the current render.
- `git diff --stat tests/fixtures/golden/` shows the binary file changed; `git diff` shows binary diff indication.
- `pnpm test:live` passes with zero (or near-zero) diff pixels after the update.

For a normal S1 verification pass: do **not** run `--update`. The shipped golden should match the shipped verifier without further action.

### 7. `Render Image` row is documented in principles.md

```bash
grep "Render Image" docs/product/principles.md
```

Expect: one match in the Testing table row, between Extension and Integration (live). Listing Chromium + `playwright-core` + `pngjs` + `pixelmatch` as dependencies, `pnpm test:live` as the runner.

### 8. Test-layout tree mentions `tests/render-image/`

```bash
grep "render-image" docs/getting-started.md
```

Expect: match in the test-layout tree under Development.

---

## Rollback

S1 is additive. If the verifier causes unforeseen breakage:

```bash
git revert <sha-of-step-N> <sha-of-step-N+1> ...
```

No runtime rollback is needed — the verifier is a dev-time tool plus one live-suite test; neither affects the shipped extension. If the render-image test is flaky in CI, the fastest mitigation is to temporarily exclude `tests/render-image/` from `pnpm test:live` in `package.json` while diagnosing. Permanent fix per the plan's "step 4 unknowns" notes.

---

**See also:** [README](README.md) · [Plan](plan.md) · [CVx.E2](../README.md) · [CVx.E2 spike worklog entry](../../../../../process/worklog.md)
