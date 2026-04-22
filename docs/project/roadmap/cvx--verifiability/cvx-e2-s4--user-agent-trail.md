# CVx.E2.S4 — `mermaid-user-agent-trail` scenario

**Status:** Done

**Epic:** [CVx.E2 — Dev-time Render Screenshots](cvx-e2--dev-time-screenshots.md)
**Depends on:** [CVx.E2.S2 — multi-scenario + gallery](cvx-e2-s2--multi-scenario-gallery.md), [CVx.E2.S3 — sentinel readiness](cvx-e2-s3--sentinel-readiness.md), the overlay-CSS fix (`bb02d33`) that made `.xterm-image-layer-top` position correctly.
**Date:** 2026-04-20

## Summary

S1–S3 verified pi-fence's renderer **in isolation** — the `pi-fence:output` panel painted standalone, no surrounding chat context. That's the right unit for "does our renderer emit the right bytes?" but not "does what a user sees in pi actually look right?" S4 closes that gap: a scenario that paints the full three-part visual a pi user experiences when they ask for a diagram — their prompt bubble, the assistant's fenced reply, and the pi-fence:output panel below — composed through **pi-coding-agent's own `UserMessageComponent` / `AssistantMessageComponent` / `CustomMessageComponent`**, not a mimic.

## Done criterion

A new scenario `mermaid-user-agent-trail` is registered. `pnpm render:verify --scenario mermaid-user-agent-trail` produces `scripts/out/render-verify/mermaid-user-agent-trail/default/render.png` — a single PNG showing, top to bottom:

1. The **user's prompt bubble** rendered by `UserMessageComponent` ("Show me a mermaid flowchart of A → B → C.").
2. Vertical spacing.
3. The **assistant's reply bubble** rendered by `AssistantMessageComponent`, containing plain text around a fenced `` ```mermaid `` block with the three-node flowchart source.
4. Vertical spacing.
5. The **pi-fence:output custom message** rendered by `CustomMessageComponent` wrapping `createPiFenceMessageRenderer` with the same Kroki-rendered mermaid PNG S1–S3 already use.

All three sections are painted by pi-coding-agent's real components — the ones that ship to every pi user — not by a bespoke mimic. The scenario therefore tests the *composed* render across user / assistant / custom boundaries, catching regressions in how pi stacks bubbles, chooses padding, applies themes, and leaves room for the custom-message child.

The render-image live test iterates the new scenario alongside S1–S3's combos. A golden PNG lives at `tests/fixtures/golden/mermaid-user-agent-trail/default.png`. Pixel-diff budget stays at the S3-calibrated `DIFF_BUDGET = 100`; timing budget remains `RENDER_BUDGET_MS = 5000`.

## Scope

**In scope:**

- New scenario `mermaid-user-agent-trail` in `scripts/verify/scenarios.ts`.
- **Single `default` variant** (120×60). Narrow is deliberately deferred — S4's purpose is to prove the composition-level shape first; width variants on this scenario can follow once the default baseline is stable.
- Composition via pi-coding-agent's public exports (`UserMessageComponent`, `AssistantMessageComponent`, `CustomMessageComponent`) into a pi-tui `Container` root, painted through the existing `paintComponent` harness.
- Theme bootstrap: the pi-coding-agent components default-param to `getMarkdownTheme()` which reads pi's theme singleton. The scenario's `build()` initializes the theme singleton deterministically (or passes an explicit `markdownTheme`), so the same bytes emit across runs. Research sub-step in the plan; one of two concrete paths gets picked during implementation.
- Reuse the existing `tests/fixtures/mermaid-flowchart.png` Kroki fixture for the custom-message image content.
- One new committed golden PNG at `tests/fixtures/golden/mermaid-user-agent-trail/default.png`.
- One new live-suite case. The existing test loop (`expandCombos(listScenarios())`) picks it up without changes.
- Documentation updates: CHANGELOG, the CVx.E2 epic file S-table, the roadmap top-level table, this story file's status flip, a worklog close entry.

**Out of scope:**

- Narrow / wide variants on `mermaid-user-agent-trail`. Future story if one width proves particularly bug-prone.
- Theme variants (dark vs light pi theme flowing through user/assistant bubbles). The plumbing is ready; population is future work.
- A *second* trail scenario exercising a different tag family (e.g. `graphviz-user-agent-trail`). One trail is enough to validate the composition; more land when a concrete regression asks for them.
- Multi-turn transcripts (user → assistant → user → assistant → fence). S4 paints ONE turn. Multi-turn is a bigger shape worth its own story.
- Streaming / partial-render verification. The scenario captures the *final* rendered state only.
- `AgentSession` integration. We static-compose a transcript — we do not spin up a real session, which would be slower and less deterministic.
- Changing how pi-fence composes its own `pi-fence:output` render. S4 observes, it does not modify.
- Visual diffing between this trail and the isolated `mermaid-happy-path` scenario to confirm the pi-fence:output portion matches. Interesting but out of scope; each scenario pixel-diffs against its own golden.

## Approach

Register a verifier scenario that paints the full user → assistant → pi-fence:output visual through pi-coding-agent's own interactive-mode components. The scenario answers "does a pi user see something reasonable?" — not "does our renderer emit the right bytes?" (S1 already does that). Same verifier pipeline, same pixel-diff gate, same gallery surface; just richer content.

## Plan

### Deliverables

#### 1. Scenario `mermaid-user-agent-trail`

`scripts/verify/scenarios.ts`:

```ts
import type { AssistantMessage } from "@mariozechner/pi-ai";
import {
  AssistantMessageComponent,
  CustomMessageComponent,
  UserMessageComponent,
} from "@mariozechner/pi-coding-agent";
import { Container, setCapabilities, /*...*/ } from "@mariozechner/pi-tui";

import { createPiFenceMessageRenderer } from "../../extensions/pi-fence/renderer.ts";
import { paintComponent } from "../../tests/utilities/render.ts";
// ... existing imports

async function buildMermaidUserAgentTrail(variant: Variant): Promise<{ bytes: string }> {
  setCapabilities({ images: "kitty", trueColor: true, hyperlinks: true });

  // Initialize pi's theme singleton deterministically before touching
  // pi-coding-agent components (they default-param to getMarkdownTheme()).
  // See "Theme bootstrap" below for the chosen approach.
  ensureDeterministicTheme();

  const pngPath = join(REPO_ROOT, "tests/fixtures/mermaid-flowchart.png");
  const pngBase64 = (await readFile(pngPath)).toString("base64");

  const userComponent = new UserMessageComponent(
    "Show me a mermaid flowchart of A → B → C.",
  );

  const assistantMsg: AssistantMessage = {
    role: "assistant",
    content: [
      {
        type: "text",
        text: "Here's the diagram:\n\n```mermaid\nflowchart LR\n  A --> B\n  B --> C\n```",
      },
    ],
    api: "anthropic",
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    usage: { /* zeros; decorative only */ },
    stopReason: "stop",
    timestamp: 0, // pinned for determinism
  };
  const assistantComponent = new AssistantMessageComponent(assistantMsg);

  const customMessage = {
    customType: "pi-fence:output" as const,
    content: [{ type: "image" as const, data: pngBase64, mimeType: "image/png" }],
    details: {
      tag: "mermaid",
      processor: "kroki",
      kind: "ok" as const,
      source: "flowchart LR\n  A --> B\n  B --> C",
    },
    display: true,
  };
  const piFenceRenderer = createPiFenceMessageRenderer({
    Box, Text, Spacer, Image, truncateToWidth,
  });
  const customComponent = new CustomMessageComponent(customMessage, piFenceRenderer);

  const root = new Container();
  root.addChild(userComponent);
  root.addChild(new Spacer(1));
  root.addChild(assistantComponent);
  root.addChild(new Spacer(1));
  root.addChild(customComponent);

  const terminal = await paintComponent(root, variant.cols, variant.rows);
  return { bytes: terminal.getWrites() };
}
```

Registered in `SCENARIOS` with `variants: [DEFAULT_VARIANT]` (default-only; narrow deferred).

#### 2. Theme bootstrap

pi-coding-agent's components default-param to `getMarkdownTheme()`, which reads pi's runtime theme. In our headless Node context, that singleton is uninitialised until we initialise it. If it's uninitialised, `getMarkdownTheme()` either throws or returns an unstable default.

Two candidate approaches, picked during implementation based on which works cleanly:

- **A. Pass an explicit `MarkdownTheme` through each component constructor.** Construct a minimal `MarkdownTheme` object ourselves (or reuse pi-tui's defaults) and pass it as the `markdownTheme` parameter. Avoids touching the theme singleton.
- **B. Initialise pi's theme singleton before constructing components.** Call `setTheme("default")` or equivalent from pi-coding-agent's public surface at scenario-build time. Leaves the default-param path intact.

Path A is safer (no global state mutation) but needs the `MarkdownTheme` shape figured out from pi-coding-agent's types. Path B is simpler at the scenario level but introduces a session-scoped side-effect the verifier pipeline didn't have before.

Plan: try A first. If the `MarkdownTheme` object is too ornate to construct plainly, fall back to B with a `beforeEach`-style setup that re-initialises for each combo.

#### 3. Golden capture

After the scenario builds cleanly, run `pnpm render:verify --update --scenario mermaid-user-agent-trail` on the S1 calibration machine (macOS arm64, Chromium 1217). Commit the resulting PNG as `tests/fixtures/golden/mermaid-user-agent-trail/default.png`.

Golden PNG is binary and won't diff meaningfully in PR review; the commit message should pin the baseline environment (Chromium revision + macOS version) for future re-roll triage.

#### 4. No test-code changes

`tests/render-image/verify.test.ts` already iterates `expandCombos(listScenarios())`. Adding a scenario with one variant adds one test case automatically; no test file edit is required. `DIFF_BUDGET = 100` and `RENDER_BUDGET_MS = 5000` stay.

#### 5. Unit test for the scenario registry

`tests/unit/verify-scenarios.test.ts` already covers each scenario's shape (name uniqueness, variants present, `build()` produces bytes, happy-path scenarios emit Kitty APC, error-path scenarios don't). S4 adds no new invariant — the existing assertions cover the new scenario through the generic `for (const scenario of listScenarios())` loop.

Optional thin addition: an invariant specific to the trail scenario — "its byte stream contains `Show me a mermaid flowchart` as rendered user text" and "contains the Kitty APC prefix." That pins the composition's visible-content shape without depending on pi-coding-agent's bubble-chrome bytes (colors / prompts) which could drift across pi-coding-agent versions.

#### 6. Documentation

- `CHANGELOG.md` [Unreleased] gets a `Refined (test layer — CVx.E2.S4 ...)` block.
- `docs/getting-started.md` unchanged (scripts reference and test layout are still accurate).
- `docs/product/principles.md` Testing table unchanged (still the same `Render Image (live)` layer).
- `docs/process/worklog.md` close entry after the final commit.
- Status flips across roadmap / CVx / CVx.E2 epic / S4 story.

### Implementation order

| Step | Layer | What | Commit |
|------|-------|------|--------|
| 1 | research | Read pi-coding-agent's `UserMessageComponent` / `AssistantMessageComponent` / `CustomMessageComponent` constructors from `node_modules/@mariozechner/pi-coding-agent/dist/` (or upstream source on `~/me/oss/pi-mono`). Confirm the `MarkdownTheme` shape so we can build Path A (explicit theme pass). If non-trivial, pivot to Path B. No commit from this step; it's a reading pass. | — |
| 2 | tooling | Add `buildMermaidUserAgentTrail()` to `scripts/verify/scenarios.ts`. Register in `SCENARIOS`. Extend `tests/unit/verify-scenarios.test.ts` with an optional invariant if chosen. | `wip(agent): mermaid-user-agent-trail scenario (S4 step 2)` |
| 3 | fixture | Run `pnpm render:verify --update --scenario mermaid-user-agent-trail`. Inspect the resulting PNG visually to confirm: user bubble at top, assistant bubble in the middle, pi-fence:output at the bottom with the diagram visible and no regression on the overlay-CSS fix. Commit the golden. | `wip(agent): golden for mermaid-user-agent-trail (S4 step 3)` |
| 4 | live | `pnpm test:live` picks up the new case through `expandCombos(listScenarios())`. Confirm green (pixel-diff + timing budget). Calibrate `DIFF_BUDGET` if the new scenario proves noisier than S1–S3 (decision per S3's pattern). | `wip(agent): S4 docs` (if no code change needed; otherwise a step-4 commit for the calibration) |
| 5 | docs | CHANGELOG + worklog close + status flips. | `close CVx.E2.S4` |

**Known-unknowns, handled on encounter:**

- **`AssistantMessageComponent` may require pi-tui Terminal / TUI context.** The component draws markdown; if markdown rendering depends on anything beyond a `MarkdownTheme` (e.g. active width, hyperlink detection), the scenario's `paintComponent` wrapper needs to ensure it. The existing harness passes through cols / rows already; anything else becomes a step-2 discovery.
- **Deterministic `timestamp` / `usage` on `AssistantMessage`.** Pinning `timestamp: 0` and zero `usage` prevents per-run drift. If `AssistantMessageComponent` renders these (e.g. a timestamp in its chrome), the golden would flake without pinning. Check in step 3 by running `--update` twice and pixel-diffing the outputs against each other.
- **Default theme selection.** If pi's theme singleton requires an explicit init (e.g. `initTheme("dark")` from pi-coding-agent's exports), call it once at scenario-build time; otherwise default-param chain works. Discover in step 2.

## Tests

1. **Layers touched:**
   - **Unit**: `verify-scenarios.test.ts` — generic coverage picks up the new scenario; an optional invariant (byte stream contains the user-prompt text and the Kitty APC) can be added.
   - **Render Image (live)**: `verify.test.ts` — one new case automatically via `expandCombos`. Case count 4 → 5.
   - **Render / Contract / Extension / Integration (live)**: untouched.

2. **Events / interactions covered:**
   - pi-coding-agent's `UserMessageComponent` renders a plain-text prompt.
   - pi-coding-agent's `AssistantMessageComponent` renders an `AssistantMessage` with a fenced mermaid block.
   - pi-coding-agent's `CustomMessageComponent` wraps pi-fence's `createPiFenceMessageRenderer` output (the same renderer pi-fence ships in production).
   - The three components compose cleanly as children of a `Container` painted through the fast-suite `paintComponent` harness.
   - The composed byte stream emits Kitty APC (for the custom-message's image).

3. **Fakes added:** none.

4. **Live tests added / updated:** one new case (`mermaid-user-agent-trail / default`). `tests/render-image/verify.test.ts` picks it up without edit.

5. **Deferred:**
   - Narrow variant for this scenario.
   - Theme variants.
   - Multi-turn transcripts.
   - `AgentSession`-based composition.
   - A `graphviz-user-agent-trail` parallel.

## Verification

### Gate

- `pnpm install` unchanged (no new deps — pi-coding-agent is already a peer dep).
- `pnpm test` → fast suite at its current count + the optional-invariant case if added.
- `pnpm render:verify --scenario mermaid-user-agent-trail` produces the PNG.
- `pnpm test:live` → one additional passing render-image case (4 → 5 currently registered; 8 → 10 with the narrow variants S2 added). Verify timing is under budget.
- `pnpm run check` → green.
- Manual: per [Verification](#verification).

### Prerequisites

- Chromium installed via `npx playwright install chromium` (one-time, from S1). No extra steps for S4.

### Automated tests

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

### Manual test script

#### 1. `pnpm render:verify --list` shows the new scenario

```bash
pnpm --silent render:verify --list
```

Expect the listing to include:

```text
  mermaid-user-agent-trail — <description>.
    variants: default
```

#### 2. Render the new scenario in isolation

```bash
pnpm --silent render:verify --scenario mermaid-user-agent-trail
```

Expect:

- Exit 0.
- `scripts/out/render-verify/mermaid-user-agent-trail/default/render.png` created.
- Timing line on stderr: `mermaid-user-agent-trail / default rendered in NNNms`, with NNN under 5000.

#### 3. Open the PNG and verify the composition visually

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

#### 4. Full `pnpm render:verify` shows the new card in the gallery

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

#### 5. `pnpm test:live` reports the new live case

```bash
pnpm test:live --reporter=verbose
```

Expect a line like:

```text
✓ Render Image — live suite — ... > mermaid-user-agent-trail / default: PNG matches golden within DIFF_BUDGET=100
```

#### 6. Deliberate-break teeth check

Temporarily change the user-prompt text in `buildMermaidUserAgentTrail` (e.g. add an exclamation mark) and run `pnpm test:live`. Expect the `mermaid-user-agent-trail / default` case to fail with a pixel-diff count over budget and a `diff.png` written alongside the rendered output. Revert; confirm green.

This step proves the new scenario's diff gate has teeth, same pattern as the S1 / S2 teeth checks.

#### 7. Determinism across three runs

```bash
for i in 1 2 3; do pnpm test:live 2>&1 | tail -2; done
```

Expect each run to report `N passed` where N is the same number, with no flake. `timestamp: 0` pinning in the scenario's `AssistantMessage` (and any other non-stable surface the plan's step-2 discovery pass flagged) should make the golden byte-stable on the calibration machine.

#### 8. `--update` regenerates the golden cleanly

(Only run when the render is deliberately updated.)

```bash
pnpm --silent render:verify --update --scenario mermaid-user-agent-trail
```

Expect `tests/fixtures/golden/mermaid-user-agent-trail/default.png` overwritten; `pnpm test:live` green on the next run.

### Rollback

S4 is purely additive: one new scenario, one new golden, zero changes to existing code paths. If a regression surfaces:

```bash
git revert <sha-of-step-2> <sha-of-step-3> ...
```

No runtime rollback required; this is test-layer / dev-tool scope.

## Key files

**New:**

- `tests/fixtures/golden/mermaid-user-agent-trail/default.png` (binary).

**Modified:**

- `scripts/verify/scenarios.ts` — new `buildMermaidUserAgentTrail` + registry entry.
- `tests/unit/verify-scenarios.test.ts` — optional new invariant.
- `CHANGELOG.md` — `[Unreleased]` entry.
- `docs/process/worklog.md` — close entry.
- `docs/project/roadmap/README.md`, the CVx parent README, the CVx.E2 epic file, this story file — status flips.

## Out of scope — explicitly

- Narrow / wide variants on `mermaid-user-agent-trail` (follow-up).
- Theme variants on any scenario.
- Multi-turn transcripts.
- `AgentSession`-based composition.
- Parallel trails (`graphviz-user-agent-trail`, etc.).
- Changes to pi-fence's renderer.
- Changes to the gallery HTML format.
- Changes to CI workflows.
- Visual diff between the trail scenario and S1's isolated scenario to prove the pi-fence:output portion is byte-identical.
