[< S4](README.md)

# Plan: CVx.E2.S4 — `mermaid-user-agent-trail` scenario

**Story:** [README.md](README.md)
**Epic:** [CVx.E2 — Dev-time Render Screenshots](../README.md)
**Depends on:** [CVx.E2.S2 — multi-scenario + gallery](../cvx-e2-s2-multi-scenario-gallery/README.md), [CVx.E2.S3 — sentinel readiness](../cvx-e2-s3-sentinel-readiness/README.md), the overlay-CSS fix (`bb02d33`) that made `.xterm-image-layer-top` position correctly.
**Date:** 2026-04-20

## Goal

Register a verifier scenario that paints the full user → assistant → pi-fence:output visual through pi-coding-agent's own interactive-mode components. The scenario answers "does a pi user see something reasonable?" — not "does our renderer emit the right bytes?" (S1 already does that). Same verifier pipeline, same pixel-diff gate, same gallery surface; just richer content.

---

## Deliverables

### 1. Scenario `mermaid-user-agent-trail`

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

### 2. Theme bootstrap

pi-coding-agent's components default-param to `getMarkdownTheme()`, which reads pi's runtime theme. In our headless Node context, that singleton is uninitialised until we initialise it. If it's uninitialised, `getMarkdownTheme()` either throws or returns an unstable default.

Two candidate approaches, picked during implementation based on which works cleanly:

- **A. Pass an explicit `MarkdownTheme` through each component constructor.** Construct a minimal `MarkdownTheme` object ourselves (or reuse pi-tui's defaults) and pass it as the `markdownTheme` parameter. Avoids touching the theme singleton.
- **B. Initialise pi's theme singleton before constructing components.** Call `setTheme("default")` or equivalent from pi-coding-agent's public surface at scenario-build time. Leaves the default-param path intact.

Path A is safer (no global state mutation) but needs the `MarkdownTheme` shape figured out from pi-coding-agent's types. Path B is simpler at the scenario level but introduces a session-scoped side-effect the verifier pipeline didn't have before.

Plan: try A first. If the `MarkdownTheme` object is too ornate to construct plainly, fall back to B with a `beforeEach`-style setup that re-initialises for each combo.

### 3. Golden capture

After the scenario builds cleanly, run `pnpm render:verify --update --scenario mermaid-user-agent-trail` on the S1 calibration machine (macOS arm64, Chromium 1217). Commit the resulting PNG as `tests/fixtures/golden/mermaid-user-agent-trail/default.png`.

Golden PNG is binary and won't diff meaningfully in PR review; the commit message should pin the baseline environment (Chromium revision + macOS version) for future re-roll triage.

### 4. No test-code changes

`tests/render-image/verify.test.ts` already iterates `expandCombos(listScenarios())`. Adding a scenario with one variant adds one test case automatically; no test file edit is required. `DIFF_BUDGET = 100` and `RENDER_BUDGET_MS = 5000` stay.

### 5. Unit test for the scenario registry

`tests/unit/verify-scenarios.test.ts` already covers each scenario's shape (name uniqueness, variants present, `build()` produces bytes, happy-path scenarios emit Kitty APC, error-path scenarios don't). S4 adds no new invariant — the existing assertions cover the new scenario through the generic `for (const scenario of listScenarios())` loop.

Optional thin addition: an invariant specific to the trail scenario — "its byte stream contains `Show me a mermaid flowchart` as rendered user text" and "contains the Kitty APC prefix." That pins the composition's visible-content shape without depending on pi-coding-agent's bubble-chrome bytes (colors / prompts) which could drift across pi-coding-agent versions.

### 6. Documentation

- `CHANGELOG.md` [Unreleased] gets a `Refined (test layer — CVx.E2.S4 ...)` block.
- `docs/getting-started.md` unchanged (scripts reference and test layout are still accurate).
- `docs/product/principles.md` Testing table unchanged (still the same `Render Image (live)` layer).
- `docs/process/worklog.md` close entry after the final commit.
- Status flips across roadmap / CVx / CVx.E2 epic / S4 story.

---

## Implementation order

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

---

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

---

## Verification

- `pnpm install` unchanged (no new deps — pi-coding-agent is already a peer dep).
- `pnpm test` → fast suite at its current count + the optional-invariant case if added.
- `pnpm render:verify --scenario mermaid-user-agent-trail` produces the PNG.
- `pnpm test:live` → one additional passing render-image case (4 → 5 currently registered; 8 → 10 with the narrow variants S2 added). Verify timing is under budget.
- `pnpm run check` → green.
- Manual: per [test-guide.md](test-guide.md).

---

## Key files

**New:**

- `tests/fixtures/golden/mermaid-user-agent-trail/default.png` (binary).

**Modified:**

- `scripts/verify/scenarios.ts` — new `buildMermaidUserAgentTrail` + registry entry.
- `tests/unit/verify-scenarios.test.ts` — optional new invariant.
- `CHANGELOG.md` — `[Unreleased]` entry.
- `docs/process/worklog.md` — close entry.
- `docs/project/roadmap/README.md`, the CVx parent README, the CVx.E2 epic README, this story README — status flips.

---

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

---

**See also:** [README](README.md) · [Test Guide](test-guide.md) · [CVx.E2](../README.md) · [S3 plan](../cvx-e2-s3-sentinel-readiness/plan.md) · [Principles — Testing](../../../../../product/principles.md#testing)
