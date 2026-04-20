[< S4](README.md)

# Test Guide: CVx.E2.S4 — `mermaid-user-agent-trail` scenario

**Plan:** [plan.md](plan.md)
**Story:** [README.md](README.md)
**Epic:** [CVx.E2 — Dev-time Render Screenshots](../README.md)

---

## Prerequisites

- Chromium installed via `npx playwright install chromium` (one-time, from S1). No extra steps for S4.

---

## Automated tests

```bash
pnpm install
pnpm run check
pnpm test
```

Expect green. Fast-suite count either unchanged or +1 (the optional trail-scenario invariant described in plan step 2).

```bash
pnpm test:live
```

Expect green. Case count rises by 1: the new `mermaid-user-agent-trail / default` render-image case, pixel-diffing against the committed golden and enforcing the 5000ms timing budget.

---

## Manual test script

### 1. `pnpm render:verify --list` shows the new scenario

```bash
pnpm --silent render:verify --list
```

Expect the listing to include:

```text
  mermaid-user-agent-trail — <description>.
    variants: default
```

### 2. Render the new scenario in isolation

```bash
pnpm --silent render:verify --scenario mermaid-user-agent-trail
```

Expect:

- Exit 0.
- `scripts/out/render-verify/mermaid-user-agent-trail/default/render.png` created.
- Timing line on stderr: `mermaid-user-agent-trail / default rendered in NNNms`, with NNN under 5000.

### 3. Open the PNG and verify the composition visually

```bash
open scripts/out/render-verify/mermaid-user-agent-trail/default/render.png
```

Expect, top to bottom:

1. **User prompt bubble** — pi-coding-agent's `UserMessageComponent` chrome (typically a padded box with the user's text "Show me a mermaid flowchart of A → B → C.").
2. Small vertical gap.
3. **Assistant reply bubble** — pi-coding-agent's `AssistantMessageComponent` chrome containing "Here's the diagram:" plain text followed by the fenced `` ```mermaid `` source block showing `flowchart LR / A --> B / B --> C`.
4. Small vertical gap.
5. **pi-fence:output panel** — the familiar "Rendered mermaid via kroki" label with the three-node flowchart diagram directly below (thanks to the overlay-CSS fix from `bb02d33`; any regression of that fix shows up as an image-below-gap symptom here too).

No oversized vertical gaps. No overlapping bubbles. Text should be legible.

### 4. Full `pnpm render:verify` shows the new card in the gallery

```bash
pnpm --silent render:verify
open scripts/out/render-verify/index.html
```

Expect five cards (four from S1–S2's combos, one new):

- `mermaid-happy-path / default`
- `mermaid-happy-path / narrow`
- `mermaid-error-path / default`
- `mermaid-error-path / narrow`
- `mermaid-user-agent-trail / default`   ← NEW

The new card has a "Showing rendered — click for golden" toggle (from follow-up #6). Click to compare rendered vs. golden. Click the image to open the lightbox.

### 5. `pnpm test:live` reports the new live case

```bash
pnpm test:live --reporter=verbose
```

Expect a line like:

```text
✓ Render Image — live suite — ... > mermaid-user-agent-trail / default: PNG matches golden within DIFF_BUDGET=100
```

### 6. Deliberate-break teeth check

Temporarily change the user-prompt text in `buildMermaidUserAgentTrail` (e.g. add an exclamation mark) and run `pnpm test:live`. Expect the `mermaid-user-agent-trail / default` case to fail with a pixel-diff count over budget and a `diff.png` written alongside the rendered output. Revert; confirm green.

This step proves the new scenario's diff gate has teeth, same pattern as the S1 / S2 teeth checks.

### 7. Determinism across three runs

```bash
for i in 1 2 3; do pnpm test:live 2>&1 | tail -2; done
```

Expect each run to report `N passed` where N is the same number, with no flake. `timestamp: 0` pinning in the scenario's `AssistantMessage` (and any other non-stable surface the plan's step-2 discovery pass flagged) should make the golden byte-stable on the calibration machine.

### 8. `--update` regenerates the golden cleanly

(Only run when the render is deliberately updated.)

```bash
pnpm --silent render:verify --update --scenario mermaid-user-agent-trail
```

Expect `tests/fixtures/golden/mermaid-user-agent-trail/default.png` overwritten; `pnpm test:live` green on the next run.

---

## Rollback

S4 is purely additive: one new scenario, one new golden, zero changes to existing code paths. If a regression surfaces:

```bash
git revert <sha-of-step-2> <sha-of-step-3> ...
```

No runtime rollback required; this is test-layer / dev-tool scope.

---

**See also:** [README](README.md) · [Plan](plan.md) · [S1 test guide](../cvx-e2-s1-headless-image-verifier/test-guide.md) · [S2 test guide](../cvx-e2-s2-multi-scenario-gallery/test-guide.md) · [S3 test guide](../cvx-e2-s3-sentinel-readiness/test-guide.md)
