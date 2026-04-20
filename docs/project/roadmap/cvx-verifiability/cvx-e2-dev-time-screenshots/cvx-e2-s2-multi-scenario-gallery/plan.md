[< S2](README.md)

# Plan: CVx.E2.S2 — multi-scenario + variants + HTML gallery

**Story:** [README.md](README.md)
**Epic:** [CVx.E2 — Dev-time Render Screenshots](../README.md)
**Depends on:** [CVx.E2.S1 — headless image verifier](../cvx-e2-s1-headless-image-verifier/README.md)
**Date:** 2026-04-20

## Goal

Widen S1's one-scenario verifier into a usable review surface: a second scenario covering a distinct pi-fence code path, a `scenario × variant` cross-product the pipeline iterates, and a per-run gallery HTML a human opens to scan every render at once. Keep the matrix shape explicit so a future story populating theme or width variants does not need to refactor the pipeline.

---

## Deliverables

### 1. `Variant` type on `Scenario`

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

### 2. `mermaid-happy-path` keeps its shape

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

### 3. New scenario `mermaid-error-path`

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

### 4. Pipeline refactor

`scripts/verify/pipeline.ts`:

- `RenderResult` gains `scenarioName: string` and `variantName: string` so callers can build the gallery without re-deriving them.
- `renderScenario(scenario, variant, outDir)` takes the variant explicitly.
- `renderMany(scenarios, outDir)` iterates `scenario × variant` internally; shares one Chromium across the full cross-product.
- Output layout: `<outDir>/<scenario>/<variant>/render.png` + `render.bin` + `diff.png` on mismatch.

### 5. Gallery generator

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

### 6. CLI changes

`scripts/verify.ts`:

- New `--variant <name>` flag narrowing to one variant when `--scenario` is also set.
- Without filter flags, iterates every `scenario × variant` combo.
- After rendering, always writes `scripts/out/render-verify/index.html` containing cards for the combos rendered in this run. (If only one combo rendered, the gallery is one card; the HTML is still generated for consistency.)
- `--update` copies every rendered PNG into its golden slot under `tests/fixtures/golden/<scenario>/<variant>.png`; the CLI logs one line per golden written.

Error cases:

- `--variant` without `--scenario`: error, exit 1.
- `--scenario X --variant Y` where Y is not registered on X: error, exit 1, lists valid variants.

### 7. Render-image test broadening

`tests/render-image/verify.test.ts` iterates `listScenarios()` × each scenario's `variants`. Golden lookup becomes `tests/fixtures/golden/<scenario>/<variant>.png`. On failure, the diff image writes to the same nested out-dir layout as the rendered PNG.

`DIFF_BUDGET` remains a global constant (100). Per-combo budgets are deliberately deferred; S3 can add per-combo when a real combo needs one.

### 8. Documentation

- `CHANGELOG.md`: `[Unreleased]` block describing the scenario widening, variants plumbing, new error-path scenario, gallery HTML, test expansion.
- `docs/getting-started.md`: scripts reference row for `pnpm render:verify` mentions `--variant` and the gallery path.
- `docs/product/principles.md`: Testing table row for `Render Image (live)` unchanged in wording; no new deps.
- `docs/process/worklog.md`: close entry after the final commit.
- Status flips across roadmap / CVx / CVx.E2 / S2 README.

### 9. Unit tests for the gallery

`tests/unit/verify-gallery.test.ts`:

1. Empty card list produces valid HTML with a "no renders in this run" placeholder (defensive; not a real user case).
2. Single-card gallery renders the card's fields.
3. Multi-card gallery contains one section per card, preserves input order.
4. The produced HTML is valid enough (each opened tag closes, correct content-type meta).

Pure-function test — no browser, no screenshots.

---

## Implementation order

Test-first on the pure-function pieces; fixture-captured goldens land before the test that consumes them.

| Step | Layer | What | Commit |
|------|-------|------|--------|
| 1 | unit | Extend `Scenario` with `variants`, update `mermaid-happy-path` to declare its default variant, update the scenario registry unit test. Existing golden file moves to the new nested path. `pnpm render:verify` still works for the happy path; render-image test follows the new golden path. | `wip(agent): variants on Scenario (S2 step 1)` |
| 2 | unit | Add `mermaid-error-path` scenario with one default variant. Register it. Extend `tests/unit/verify-scenarios.test.ts` to cover both scenarios and the error-path case's byte-stream shape (must NOT contain the Kitty APC, because the error path has no image). | `wip(agent): mermaid-error-path scenario (S2 step 2)` |
| 3 | tooling | Pipeline refactor: `renderScenario(scenario, variant, outDir)` and `renderMany(scenarios, outDir)` iterating `scenario × variant`. `RenderResult` gains name fields. Spike `scripts/render-image-spike.ts` picks up the new signature (picks the default variant). | `wip(agent): pipeline variants refactor (S2 step 3)` |
| 4 | tooling | `scripts/verify/gallery.ts` + its unit test `tests/unit/verify-gallery.test.ts`. Four cases per deliverable 9. | `wip(agent): HTML gallery renderer (S2 step 4)` |
| 5 | tooling | `scripts/verify.ts` CLI changes: `--variant` flag, cross-product iteration, gallery write, `--update` across combos. | `wip(agent): pnpm render:verify cross-product + gallery (S2 step 5)` |
| 6 | fixture | Capture goldens: `pnpm render:verify --update` on a clean run. Commits `tests/fixtures/golden/mermaid-happy-path/default.png` (renamed) + `tests/fixtures/golden/mermaid-error-path/default.png` (new). | `wip(agent): goldens for scenario × variant cross-product (S2 step 6)` |
| 7 | live | `tests/render-image/verify.test.ts` iterates the cross-product with nested golden lookup. `pnpm test:live` now runs 2 render-image cases (up from 1). | `wip(agent): render-image cross-product test (S2 step 7)` |
| 8 | docs | CHANGELOG + getting-started. | `wip(agent): S2 docs` |
| 9 | close | Worklog + status flips. | `close CVx.E2.S2` |

**Known unknowns**, handled on encounter:

- **Chromium context reuse.** `renderMany` currently creates a fresh context per render; keeping that pattern is safer than sharing a context across renders (no stale state). Leave as-is unless the live-suite runtime becomes a problem.
- **Gallery CSS portability.** The inline CSS uses `flex-wrap`, `max-width: 100%`, and `object-fit: contain`. All are stable across browsers; no polyfill needed. If a reviewer opens the HTML in a Firefox / Safari variant and something breaks, address with a tweak in a follow-up commit; don't block the close.
- **Error-path rendering hits a different code path in pi-tui.** If the error scenario's rendered PNG has unexpected geometry (e.g. the text-only content column lays out differently from an Image component), the golden still pins its specific layout; the test asserts against that. If `DIFF_BUDGET = 100` turns out too tight for one of the two scenarios, raise it globally (or per-combo, in a smaller follow-up).

---

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

---

## Verification

- `pnpm install` + `pnpm test` → still green, fast suite test count rises by the number of new unit cases (`verify-scenarios` gains cases, `verify-gallery` is new).
- `pnpm render:verify` → writes PNGs under `scripts/out/render-verify/<scenario>/<variant>/render.png` for both scenarios plus `scripts/out/render-verify/index.html`.
- Opening `index.html` in a browser shows two cards, both with a legible PNG.
- `pnpm test:live` → 2 render-image cases, both green, within DIFF_BUDGET.
- `pnpm run check` → green.
- Manual: per [test-guide.md](test-guide.md).

---

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
- `scripts/verify.ts` — `--variant` flag, cross-product loop, gallery write, `--update` across combos.
- `scripts/render-image-spike.ts` — picks the default variant of the default scenario.
- `tests/render-image/verify.test.ts` — iterates cross-product, nested golden path.
- `tests/unit/verify-scenarios.test.ts` — extended to cover both scenarios and variants.
- `package.json` — (no new deps).
- `CHANGELOG.md`, `docs/getting-started.md`, `docs/process/worklog.md`, status flips in roadmap / CVx / CVx.E2 / story READMEs.

---

## Out of scope — explicitly

- A theme-matrix dimension (terminal-theme or pi-theme variants).
- A width-matrix dimension (80 / 120 / 160 cols).
- Deletion of the three spike scripts.
- Interactive gallery behavior.
- CI workflow activation (`.github/workflows/live.yml`).
- Cross-OS golden normalization. The `DIFF_BUDGET` calibrated on macOS arm64 + Chromium 1217 continues to be the baseline; CI on another OS remains a carry-forward.

---

**See also:** [README](README.md) · [Test Guide](test-guide.md) · [CVx.E2](../README.md) · [CVx.E2.S1 plan](../cvx-e2-s1-headless-image-verifier/plan.md) · [Principles — Testing](../../../../../product/principles.md#testing)
