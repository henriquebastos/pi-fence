[< S2](README.md)

# Test Guide: CVx.E2.S2 — multi-scenario + gallery

**Plan:** [plan.md](plan.md)
**Story:** [README.md](README.md)
**Epic:** [CVx.E2 — Dev-time Render Screenshots](../README.md)

---

## Prerequisites

- Chromium installed from S1 (`npx playwright install chromium`). No extra steps for S2.

---

## Automated tests

```bash
pnpm install
pnpm run check
pnpm test
```

Expect green. Fast-suite count rises vs S1 by the new unit cases (scenario registry broadens; gallery test arrives fresh). The render-image live case is still out of the fast suite.

```bash
pnpm test:live
```

Expect green. Two render-image cases today (one per scenario); each green-skips cleanly when Chromium is absent.

---

## Manual test script

### 1. `pnpm render:verify --list` shows both scenarios

```bash
pnpm --silent render:verify --list
```

Expect:

```text
Registered scenarios:
  mermaid-happy-path — pi-fence:output panel with a Kroki-rendered mermaid flowchart (A → B → C).
    variants: default
  mermaid-error-path — pi-fence:output panel when the Kroki processor returns an error.
    variants: default
```

### 2. `pnpm render:verify` renders every combo and writes the gallery

```bash
pnpm --silent render:verify
```

Expect:

- Two scenarios × one variant each = 2 renders, ~1 second total after Chromium launch.
- Output files:
  - `scripts/out/render-verify/mermaid-happy-path/default/render.png`
  - `scripts/out/render-verify/mermaid-happy-path/default/render.bin`
  - `scripts/out/render-verify/mermaid-error-path/default/render.png`
  - `scripts/out/render-verify/mermaid-error-path/default/render.bin`
  - `scripts/out/render-verify/index.html`
- stderr logs one line per combo + one line announcing the gallery path.

### 3. Open the gallery

```bash
open scripts/out/render-verify/index.html      # macOS
# or: xdg-open on Linux
```

Expect:

- Two cards side by side (or stacked on narrow viewports).
- Left card: `mermaid-happy-path · default · 120×60` — shows "Rendered mermaid via kroki" label + the flowchart boxes A → B → C.
- Right card: `mermaid-error-path · default · 120×60` — shows "Error rendering mermaid via kroki: Parse error on line 1: unknown tag 'flowchrt'" with the error-path label styling (no image; text-only body).
- Each card displays the PNG at max-width-fit within the card.

### 4. `--scenario` filters

```bash
pnpm --silent render:verify --scenario mermaid-error-path
```

Expect: only the error-path PNG is rendered; the gallery still writes, showing just that one card.

### 5. `--variant` without `--scenario` errors

```bash
pnpm --silent render:verify --variant default
```

Expect exit code 1 with a message explaining `--variant` requires `--scenario`.

### 6. `--scenario X --variant Y` with a bad variant errors cleanly

```bash
pnpm --silent render:verify --scenario mermaid-happy-path --variant nonexistent
```

Expect exit code 1 with a message naming the valid variants on `mermaid-happy-path`.

### 7. `pnpm test:live` runs both render-image cases

```bash
pnpm test:live --reporter=verbose
```

Expect two lines in the reporter:

```text
✓ Render Image — live suite — ... > mermaid-happy-path / default: PNG matches golden within DIFF_BUDGET=100
✓ Render Image — live suite — ... > mermaid-error-path / default: PNG matches golden within DIFF_BUDGET=100
```

### 8. Deliberate-break → diff image surfaces for the new case

Temporarily modify `scripts/verify/scenarios.ts` so `mermaid-error-path.build()` uses a different error message, then run `pnpm test:live`.

Expect:

- The `mermaid-error-path` case fails with a pixel-count exceeding the budget.
- A `diff.png` lands at `scripts/out/render-verify-test/mermaid-error-path/default/diff.png`.
- The assertion message names the diff path.

Revert the change; confirm both cases go green again.

### 9. `--update` updates both goldens

(Only run when a rendering change is deliberately approved.)

```bash
pnpm --silent render:verify --update
```

Expect:

- Both goldens overwritten under `tests/fixtures/golden/<scenario>/default.png`.
- stderr logs one `updated golden: <path>` line per combo.
- `pnpm test:live` green on the next run.

### 10. The Render Image row in `principles.md` is unchanged

The test pyramid row from S1 still applies; S2 did not add new deps or re-layer.

---

## Rollback

S2 is additive + a rename (the happy-path golden moves into a subdir). If a rollback is needed:

```bash
git revert <sha-of-step-N> ...
```

The rename is recorded as a `git mv`; revert restores the original path.

---

**See also:** [README](README.md) · [Plan](plan.md) · [S1 test guide](../cvx-e2-s1-headless-image-verifier/test-guide.md)
