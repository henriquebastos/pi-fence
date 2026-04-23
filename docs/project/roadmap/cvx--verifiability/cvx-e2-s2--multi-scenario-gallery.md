# CVx.E2.S2 — multi-scenario + variants + HTML gallery

**Status:** Done

**Epic:** [CVx.E2 — Dev-time Render Screenshots](cvx-e2--dev-time-screenshots.md)
**Depends on:** [CVx.E2.S1 — headless image verifier](cvx-e2-s1--headless-image-verifier.md)
**Date:** 2026-04-20

## Summary

S1 shipped the verifier for one scenario. S2 grows it into the **first usable review surface**: more than one scenario, a per-run gallery HTML that a human opens once and scans, and enough variant plumbing in place that a future story can add theme or width matrices without refactoring the pipeline.

## Done criterion

Running `pnpm render:verify` produces PNGs for **at least two** distinct pi-fence rendering paths — `mermaid-happy-path` (S1's scenario) and `mermaid-error-path` (new) — plus an `index.html` at `scripts/out/render-verify/index.html` showing every rendered combo as a card with its PNG, scenario name, variant name, and dimensions.

The scenario registry grows a `variants` field on `Scenario`. Each scenario ships at least one variant (the S1-era default `{ name: "default", cols: 120, rows: 60 }`). The pipeline + CLI + test layer iterate the full `scenario × variant` cross-product. Goldens live at `tests/fixtures/golden/<scenario>/<variant>.png` so the scenario+variant key maps to a single committed file. `pnpm test:live` exercises every combo; today that is **two** cases (one scenario × one variant each), but the case count rises as future stories add variants without further refactoring.

`pnpm render:verify --scenario <name>` still works and filters the cross-product to one scenario; `--scenario <name> --variant <vname>` further narrows to one combo. `--update` captures the golden for every combo rendered in that invocation.

## Scope

**In scope:**

- Widen `Scenario` to carry a `readonly variants: readonly Variant[]`. New `Variant` interface: `{ name: string; cols: number; rows: number }`. Build takes the variant so dimensions flow through pi-fence's paintComponent and the xterm.js viewport consistently.
- Refactor `renderScenario` + `renderMany` in `scripts/verify/pipeline.ts` to take `(scenario, variant)` pairs. Keep Chromium-shared rendering for efficiency when a run covers multiple combos.
- **New scenario `mermaid-error-path`.** Exercises the error-rendering code path in `createPiFenceMessageRenderer`: `details.kind = "error"`, `content: [{ type: "text", text: "..." }]`, no image. Uses the same error label pi-fence surfaces in production (`"Error rendering mermaid via kroki: ..."` with a one-line synthetic error body).
- `pnpm render:verify` grows `--variant <name>` (narrow to one combo), supports iterating many combos in one run, and writes `index.html` alongside the rendered PNGs per run.
- `tests/render-image/verify.test.ts` iterates every `scenario × variant` pair with independent pixel-diff budgets per combo (the S1 `DIFF_BUDGET = 100` stays as the default; diverging budgets per combo are S3 territory if needed).
- Committed goldens at `tests/fixtures/golden/<scenario>/<variant>.png`. S1's existing golden moves from `tests/fixtures/golden/mermaid-happy-path.png` to `tests/fixtures/golden/mermaid-happy-path/default.png` (content unchanged; path re-layout is a git `mv`).
- Gallery HTML: a plain single-file document (no JS build, no CDN), a small amount of inline CSS for a flex-grid of cards. Each card shows the PNG, the combo key, and dimensions. A future story can make this reactive (click-to-zoom, side-by-side diff) if needed.
- Docs: CHANGELOG entry under `[Unreleased]`; getting-started mentions the gallery path; principles table unchanged (layer name stays `Render Image (live)`).

**Out of scope:**

- Populating a real theme matrix (xterm.js terminal dark/light, pi-fence theme dark/light). The plumbing is *ready* after S2; populating it is a future story when a user opens a theme bug.
- Populating a width matrix (80 vs 120 vs 160 cols). Same reasoning: S2 ships the plumbing; S3 or a future story populates.
- `mermaid-expanded` (Ctrl+O source-fence expansion). One more scenario than S2 needs. Easy to add once S2's shape is committed.
- Scenarios for the `/fence list` command or any non-mermaid diagram family. Deferred until Graphviz-local (CV0.E2) or the JSON-body Kroki work (CV0.E1.S5) lands — then there's a real second render path worth photographing.
- An interactive gallery viewer (swipe compare against golden, zoom, etc.). Static HTML is enough for S2's review loop.
- Per-combo diff budgets. Single global `DIFF_BUDGET` is the S2 default; per-combo budgets arrive when a combo empirically needs one.
- CI workflow activation. `.github/workflows/live.yml` stays dormant; the render-image suite runs locally when a contributor opts in. Separate follow-up.
- Deleting the three spike scripts (`render-screenshot.ts`, `render-a11y-spike.ts`, `render-image-spike.ts`). Keep until a consolidation story.

## Approach

Widen S1's one-scenario verifier into a usable review surface: a second scenario covering a distinct pi-fence code path, a `scenario × variant` cross-product the pipeline iterates, and a per-run gallery HTML a human opens to scan every render at once. Keep the matrix shape explicit so a future story populating theme or width variants does not need to refactor the pipeline.

## Plan

### Deliverables

#### 1. `Variant` type on `Scenario`

`scripts/verify/scenarios.ts`:

```ts
export interface Variant {
  /** Unique within a Scenario; keys the golden file at
   *  `tests/fixtures/golden/<scenario>/<variant>.png`. */
  readonly name: string;
  readonly cols: number;
  readonly rows: number;
}

export interface Scenario {
  readonly name: string;
  readonly description: string;
  readonly variants: readonly Variant[]; // at least one
  build(variant: Variant): Promise<{ bytes: string }>;
}
```

`build()` takes the variant so dimensions flow through pi-fence's `paintComponent` (which reads the terminal dims when laying out). The registry no longer exposes `cols`/`rows` on the top-level scenario — every call goes through a variant.

#### 2. `mermaid-happy-path` keeps its shape

The existing scenario is updated in place:

```ts
{
  name: "mermaid-happy-path",
  description: "...",
  variants: [{ name: "default", cols: 120, rows: 60 }],
  async build(variant) { /* same as S1, using variant.cols / variant.rows */ }
}
```

Golden path migrates:

- From: `tests/fixtures/golden/mermaid-happy-path.png`
- To:   `tests/fixtures/golden/mermaid-happy-path/default.png`

Content identical (same bytes). Git `mv` preserves history.

#### 3. New scenario `mermaid-error-path`

Exercises the error-rendering branch in `createPiFenceMessageRenderer`:

```ts
{
  name: "mermaid-error-path",
  description: "pi-fence:output panel when the Kroki processor returns an error.",
  variants: [{ name: "default", cols: 120, rows: 60 }],
  async build(variant) {
    setCapabilities({ images: "kitty", trueColor: true, hyperlinks: true });
    const renderer = createPiFenceMessageRenderer({ Box, Text, Spacer, Image, truncateToWidth });
    const component = renderer(
      {
        content: [
          { type: "text", text: "Error rendering mermaid via kroki: Parse error on line 1: unknown tag 'flowchrt'" },
        ],
        details: {
          tag: "mermaid",
          processor: "kroki",
          kind: "error",
          source: "flowchrt LR\n  A --> B",
        },
      },
      { expanded: false },
      IDENTITY_THEME,
    );
    const terminal = await paintComponent(component, variant.cols, variant.rows);
    return { bytes: terminal.getWrites() };
  }
}
```

The synthetic error message is stable (not time-based) so the render is deterministic. The source deliberately contains a typo (`flowchrt`) so the error phrasing is internally consistent.

#### 4. Pipeline refactor

`scripts/verify/pipeline.ts`:

- `RenderResult` gains `scenarioName: string` and `variantName: string` so callers can build the gallery without re-deriving them.
- `renderScenario(scenario, variant, outDir)` takes the variant explicitly.
- `renderMany(scenarios, outDir)` iterates `scenario × variant` internally; shares one Chromium across the full cross-product.
- Output layout: `<outDir>/<scenario>/<variant>/render.png` + `render.bin` + `diff.png` on mismatch.

#### 5. Gallery generator

New `scripts/verify/gallery.ts`. Pure string-template output:

```ts
export interface GalleryCard {
  scenarioName: string;
  variantName: string;
  pngRelativePath: string; // relative to the gallery HTML's directory
  cols: number;
  rows: number;
}

export function renderGalleryHtml(cards: readonly GalleryCard[]): string;
```

Shape: a single HTML document with inline CSS (no external assets, no JS). A flex-wrapping grid of cards; each card shows the PNG (max-width fit), scenario · variant · cols×rows caption, and `<pre>` code spans displaying the relative PNG path.

Pure function; takes card descriptions, returns HTML. Easy to unit-test.

#### 6. CLI changes

`scripts/render-verify.ts`:

- New `--variant <name>` flag narrowing to one variant when `--scenario` is also set.
- Without filter flags, iterates every `scenario × variant` combo.
- After rendering, always writes `scripts/out/render-verify/index.html` containing cards for the combos rendered in this run. (If only one combo rendered, the gallery is one card; the HTML is still generated for consistency.)
- `--update` copies every rendered PNG into its golden slot under `tests/fixtures/golden/<scenario>/<variant>.png`; the CLI logs one line per golden written.

Error cases:

- `--variant` without `--scenario`: error, exit 1.
- `--scenario X --variant Y` where Y is not registered on X: error, exit 1, lists valid variants.

#### 7. Render-image test broadening

`tests/render-image/verify.test.ts` iterates `listScenarios()` × each scenario's `variants`. Golden lookup becomes `tests/fixtures/golden/<scenario>/<variant>.png`. On failure, the diff image writes to the same nested out-dir layout as the rendered PNG.

`DIFF_BUDGET` remains a global constant (100). Per-combo budgets are deliberately deferred; S3 can add per-combo when a real combo needs one.

#### 8. Documentation

- `CHANGELOG.md`: `[Unreleased]` block describing the scenario widening, variants plumbing, new error-path scenario, gallery HTML, test expansion.
- `docs/getting-started.md`: scripts reference row for `pnpm render:verify` mentions `--variant` and the gallery path.
- `docs/product/principles.md`: Testing table row for `Render Image (live)` unchanged in wording; no new deps.
- `docs/process/worklog.md`: close entry after the final commit.
- Status flips across roadmap / CVx / CVx.E2 / S2 README.

#### 9. Unit tests for the gallery

`tests/unit/verify-gallery.test.ts`:

1. Empty card list produces valid HTML with a "no renders in this run" placeholder (defensive; not a real user case).
2. Single-card gallery renders the card's fields.
3. Multi-card gallery contains one section per card, preserves input order.
4. The produced HTML is valid enough (each opened tag closes, correct content-type meta).

Pure-function test — no browser, no screenshots.

### Implementation order

Test-first on the pure-function pieces; fixture-captured goldens land before the test that consumes them.

| Step | Layer | What | Commit |
|------|-------|------|--------|
| 1 | unit | Extend `Scenario` with `variants`, update `mermaid-happy-path` to declare its default variant, update the scenario registry unit test. Existing golden file moves to the new nested path. `pnpm render:verify` still works for the happy path; render-image test follows the new golden path. | `wip(agent): variants on Scenario (S2 step 1)` |
| 2 | unit | Add `mermaid-error-path` scenario with one default variant. Register it. Extend `tests/unit/verify-scenarios.test.ts` to cover both scenarios and the error-path case's byte-stream shape (must NOT contain the Kitty APC, because the error path has no image). | `wip(agent): mermaid-error-path scenario (S2 step 2)` |
| 3 | tooling | Pipeline refactor: `renderScenario(scenario, variant, outDir)` and `renderMany(scenarios, outDir)` iterating `scenario × variant`. `RenderResult` gains name fields. Spike `scripts/render-image-spike.ts` picks up the new signature (picks the default variant). | `wip(agent): pipeline variants refactor (S2 step 3)` |
| 4 | tooling | `scripts/verify/gallery.ts` + its unit test `tests/unit/verify-gallery.test.ts`. Four cases per deliverable 9. | `wip(agent): HTML gallery renderer (S2 step 4)` |
| 5 | tooling | `scripts/render-verify.ts` CLI changes: `--variant` flag, cross-product iteration, gallery write, `--update` across combos. | `wip(agent): pnpm render:verify cross-product + gallery (S2 step 5)` |
| 6 | fixture | Capture goldens: `pnpm render:verify --update` on a clean run. Commits `tests/fixtures/golden/mermaid-happy-path/default.png` (renamed) + `tests/fixtures/golden/mermaid-error-path/default.png` (new). | `wip(agent): goldens for scenario × variant cross-product (S2 step 6)` |
| 7 | live | `tests/render-image/verify.test.ts` iterates the cross-product with nested golden lookup. `pnpm test:live` now runs 2 render-image cases (up from 1). | `wip(agent): render-image cross-product test (S2 step 7)` |
| 8 | docs | CHANGELOG + getting-started. | `wip(agent): S2 docs` |
| 9 | close | Worklog + status flips. | `close CVx.E2.S2` |

**Known unknowns**, handled on encounter:

- **Chromium context reuse.** `renderMany` currently creates a fresh context per render; keeping that pattern is safer than sharing a context across renders (no stale state). Leave as-is unless the live-suite runtime becomes a problem.
- **Gallery CSS portability.** The inline CSS uses `flex-wrap`, `max-width: 100%`, and `object-fit: contain`. All are stable across browsers; no polyfill needed. If a reviewer opens the HTML in a Firefox / Safari variant and something breaks, address with a tweak in a follow-up commit; don't block the close.
- **Error-path rendering hits a different code path in pi-tui.** If the error scenario's rendered PNG has unexpected geometry (e.g. the text-only content column lays out differently from an Image component), the golden still pins its specific layout; the test asserts against that. If `DIFF_BUDGET = 100` turns out too tight for one of the two scenarios, raise it globally (or per-combo, in a smaller follow-up).

## Tests

1. **Layers touched:**
   - **Unit**: `verify-scenarios.test.ts` extended; new `verify-gallery.test.ts`.
   - **Render Image (live)**: `verify.test.ts` iterates cross-product; 2 cases today.
   - **Contract / Render / Extension / Integration (live)**: untouched.

2. **Events / interactions covered:**
   - `listScenarios()` returns at least two scenarios, each with at least one variant.
   - `mermaid-error-path.build()` produces bytes that DO NOT contain the Kitty APC prefix (`\x1b_G`) — the content is text-only; no image is emitted.
   - `mermaid-happy-path.build()` continues to produce bytes containing `\x1b_G`.
   - `renderGalleryHtml([])` returns a valid document with a placeholder.
   - `renderGalleryHtml([cards...])` contains one card per input, in order, with the scenario / variant / dims labels.
   - Pipeline `renderMany` produces `RenderResult[]` with `scenarioName` / `variantName` populated.

3. **Fakes added:** none beyond S1's scope. The pipeline uses real Chromium; gallery takes plain data.

4. **Live tests added / updated:** `tests/render-image/verify.test.ts` broadened to iterate the full cross-product. Case count rises from 1 to 2.

5. **Deferred:**
   - Theme / width matrix population (future story).
   - `mermaid-expanded` (source-fence expansion) scenario.
   - Interactive gallery (swipe, zoom, side-by-side diff).
   - Per-combo `DIFF_BUDGET` tuning.
   - CI workflow activation.

## Verification

### Gate

- `pnpm install` + `pnpm test` → still green, fast suite test count rises by the number of new unit cases (`verify-scenarios` gains cases, `verify-gallery` is new).
- `pnpm render:verify` → writes PNGs under `scripts/out/render-verify/<scenario>/<variant>/render.png` for both scenarios plus `scripts/out/render-verify/index.html`.
- Opening `index.html` in a browser shows two cards, both with a legible PNG.
- `pnpm test:live` → 2 render-image cases, both green, within DIFF_BUDGET.
- `pnpm run check` → green.
- Manual: per [Verification](#verification).

### Prerequisites

- Chromium installed from S1 (`npx playwright install chromium`). No extra steps for S2.

### Automated tests

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

### Manual test script

#### 1. `pnpm render:verify --list` shows both scenarios

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

#### 2. `pnpm render:verify` renders every combo and writes the gallery

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

#### 3. Open the gallery

```bash
open scripts/out/render-verify/index.html      # macOS
# or: xdg-open on Linux
```

Expect:

- Two cards side by side (or stacked on narrow viewports).
- Left card: `mermaid-happy-path · default · 120×60` — shows "Rendered mermaid via kroki" label + the flowchart boxes A → B → C.
- Right card: `mermaid-error-path · default · 120×60` — shows "Error rendering mermaid via kroki: Parse error on line 1: unknown tag 'flowchrt'" with the error-path label styling (no image; text-only body).
- Each card displays the PNG at max-width-fit within the card.

#### 4. `--scenario` filters

```bash
pnpm --silent render:verify --scenario mermaid-error-path
```

Expect: only the error-path PNG is rendered; the gallery still writes, showing just that one card.

#### 5. `--variant` without `--scenario` errors

```bash
pnpm --silent render:verify --variant default
```

Expect exit code 1 with a message explaining `--variant` requires `--scenario`.

#### 6. `--scenario X --variant Y` with a bad variant errors cleanly

```bash
pnpm --silent render:verify --scenario mermaid-happy-path --variant nonexistent
```

Expect exit code 1 with a message naming the valid variants on `mermaid-happy-path`.

#### 7. `pnpm test:live` runs both render-image cases

```bash
pnpm test:live --reporter=verbose
```

Expect two lines in the reporter:

```text
✓ Render Image — live suite — ... > mermaid-happy-path / default: PNG matches golden within DIFF_BUDGET=100
✓ Render Image — live suite — ... > mermaid-error-path / default: PNG matches golden within DIFF_BUDGET=100
```

#### 8. Deliberate-break → diff image surfaces for the new case

Temporarily modify `scripts/verify/scenarios.ts` so `mermaid-error-path.build()` uses a different error message, then run `pnpm test:live`.

Expect:

- The `mermaid-error-path` case fails with a pixel-count exceeding the budget.
- A `diff.png` lands at `scripts/out/render-verify-test/mermaid-error-path/default/diff.png`.
- The assertion message names the diff path.

Revert the change; confirm both cases go green again.

#### 9. `--update` updates both goldens

(Only run when a rendering change is deliberately approved.)

```bash
pnpm --silent render:verify --update
```

Expect:

- Both goldens overwritten under `tests/fixtures/golden/<scenario>/default.png`.
- stderr logs one `updated golden: <path>` line per combo.
- `pnpm test:live` green on the next run.

#### 10. The Render Image row in `principles.md` is unchanged

The test pyramid row from S1 still applies; S2 did not add new deps or re-layer.

### Rollback

S2 is additive + a rename (the happy-path golden moves into a subdir). If a rollback is needed:

```bash
git revert <sha-of-step-N> ...
```

The rename is recorded as a `git mv`; revert restores the original path.

## Key files

**New:**

- `scripts/verify/gallery.ts`
- `tests/unit/verify-gallery.test.ts`
- `tests/fixtures/golden/mermaid-error-path/default.png` (binary)

**Renamed:**

- `tests/fixtures/golden/mermaid-happy-path.png` → `tests/fixtures/golden/mermaid-happy-path/default.png`

**Modified:**

- `scripts/verify/scenarios.ts` — `Variant` type, `variants` field, `build(variant)`, new `mermaid-error-path` scenario.
- `scripts/verify/pipeline.ts` — variant-aware `renderScenario`, `renderMany` iterates cross-product, `RenderResult` gains name fields.
- `scripts/render-verify.ts` — `--variant` flag, cross-product loop, gallery write, `--update` across combos.
- `scripts/render-image-spike.ts` — picks the default variant of the default scenario.
- `tests/render-image/verify.test.ts` — iterates cross-product, nested golden path.
- `tests/unit/verify-scenarios.test.ts` — extended to cover both scenarios and variants.
- `package.json` — (no new deps).
- `CHANGELOG.md`, `docs/getting-started.md`, `docs/process/worklog.md`, status flips in roadmap / CVx / CVx.E2 / story files.

## Out of scope — explicitly

- A theme-matrix dimension (terminal-theme or pi-theme variants).
- A width-matrix dimension (80 / 120 / 160 cols).
- Deletion of the three spike scripts.
- Interactive gallery behavior.
- CI workflow activation (`.github/workflows/live.yml`).
- Cross-OS golden normalization. The `DIFF_BUDGET` calibrated on macOS arm64 + Chromium 1217 continues to be the baseline; CI on another OS remains a carry-forward.
