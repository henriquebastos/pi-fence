# CVx.E2.S1 — headless image verifier with pixel-diff snapshot test

**Status:** Done

**Epic:** [CVx.E2 — Dev-time Render Screenshots](cvx-e2--dev-time-screenshots.md)
**Depends on:** [CVx.E1.S1 — VirtualTerminal-backed renderer tests](cvx-e1-s1--virtual-terminal-tests.md), the three CVx.E2 spikes (commits `2183665`, `373a9e5`, `12e4e1d`) — in particular the image spike whose code S1 promotes.
**Date:** 2026-04-20

## Summary

Promote the third CVx.E2 spike (`scripts/render-image-spike.ts`) to a first-class verifier tool. One named scenario, one deterministic PNG per run, one pixel-diff test that fails the live suite when the render regresses.

## Done criterion

Running `pnpm render:verify` produces `scripts/out/render-verify/mermaid-happy-path/render.png` — a real PNG showing the pi-fence:output panel (label + mermaid flowchart image) as xterm.js + `@xterm/addon-image`'s Kitty-graphics implementation renders it, screenshotted from a headless Chromium.

Running `pnpm test:live` runs a new test in `tests/render-image/` that:

1. Invokes the same verifier in-process for the `mermaid-happy-path` scenario.
2. Decodes both the produced PNG and the committed golden at `tests/fixtures/golden/mermaid-happy-path.png` via `pngjs` into RGBA buffers.
3. Compares them via `pixelmatch` with a small per-pixel tolerance (e.g. `threshold: 0.1`). The test passes if the absolute number of differing pixels is under a committed budget (e.g. 0–50, depending on observed baseline variance).
4. On failure, writes a diff image to `scripts/out/render-verify/mermaid-happy-path/diff.png` so a human can open it and decide whether the rendering changed for a good reason.

Running `pnpm render:verify --update` overwrites the committed golden with the current render. The test passes on the next run.

Running `pnpm test` (the fast suite) is unchanged: the render-image test is gated by Chromium being installed (it lives in the live suite alongside integration tests that need Docker / network). Fast suite keeps its 161-test baseline.

## Scope

**In scope:**

- Promote `scripts/render-image-spike.ts` to `scripts/verify.ts`. Refactor the scenario's bytes-capture + paint pipeline into reusable modules under `scripts/verify/`.
- **Scenario registry** at `scripts/verify/scenarios.ts`: one named scenario today (`mermaid-happy-path`) mirroring the spike's fixture. Registry exposes `listScenarios()` and `getScenario(name)`.
- **`pnpm render:verify`** entry point. Default scenario is `mermaid-happy-path`. Accepts `--scenario <name>` (selects from the registry) and `--update` (overwrites the golden).
- **Golden PNG** committed at `tests/fixtures/golden/mermaid-happy-path.png`. Produced by a first `pnpm render:verify --update` run and captured into the tree.
- **Render-image test layer**: new directory `tests/render-image/` with one file `verify.test.ts`. Gated by `describe.skipIf(...)` against Chromium presence so the live suite still passes on a contributor machine without browsers installed. Added to `principles.md`'s Testing table as a sibling row to `Render` (runs under `pnpm test:live`).
- **Dev dependencies**: `pngjs` (PNG decode), `pixelmatch` (tolerance-based pixel diff). Both pure JS, small. Types provided by `@types/pngjs` and `@types/pixelmatch`.
- **`pnpm test:live`** wiring: the live script currently runs `vitest tests/integration/`. Expand to also run `tests/render-image/` — either by broadening the include pattern or by adding a parallel `test:live-render` script and composing them under `test:live`.
- Documentation updates: `README.md`, `docs/getting-started.md`, `CHANGELOG.md`, `principles.md` Testing table, plus the standard worklog + roadmap / Epic / story status flips.

**Out of scope:**

- Multi-scenario gallery (CVx.E2.S2). S1 ships exactly one scenario.
- Theme matrix (dark / light variants). S2 territory.
- Cross-resolution rendering matrix. S2.
- Deleting the three spike scripts. They remain as research artifacts; consolidation is a separate story when the verifier proves out.
- Wiring the render-image test into the *fast* (`pnpm test`) suite. Browser launches are too heavy for the fast-suite budget.
- Using the wterm + a11y spike's DOM readback as a second assertion layer. Possible future story, not part of S1.
- Strict byte-level PNG hashing. Chromium rendering varies slightly across patch revisions and font availability; pixel-diff with a tolerance is the right oracle for images, and byte hashing would false-positive too easily.
- CI job configuration (`.github/workflows/*`). The render-image test runs under `pnpm test:live` which already has a dormant workflow (`live.yml`); actually activating that workflow is a separate concern.

## Approach

Promote `scripts/render-image-spike.ts` from research code to a maintained verifier: scenario registry, named invocation, golden-PNG pixel-diff as the oracle for rendering regressions. Land the first scenario + the first diff gate, end-to-end. S2 broadens to multi-scenario galleries; S3 tightens determinism. S1's job is to ship the foundation the next two stories build on.

## Plan

### Deliverables

#### 1. `scripts/verify/scenarios.ts` — scenario registry

```ts
export interface Scenario {
  /** Unique key. Used as `pnpm render:verify --scenario <name>` and as the
   *  subdir of `scripts/out/render-verify/` / `tests/fixtures/golden/`. */
  readonly name: string;

  /** One-line human description. Printed by `--list`. */
  readonly description: string;

  /** Produce the byte stream and the terminal dimensions this scenario
   *  should render at. Dimensions are passed into xterm.js in the
   *  browser; the byte stream is `term.write()`-fed as-is. */
  build(): Promise<{ bytes: string; cols: number; rows: number }>;
}

export const SCENARIOS: readonly Scenario[];
export function getScenario(name: string): Scenario;   // throws if missing
export function listScenarios(): readonly Scenario[];
```

One scenario registered today: `mermaid-happy-path`. Its `build()` uses the same `paintComponent()` harness the fast suite uses, with the committed `tests/fixtures/mermaid-flowchart.png` as the image content. 120 × 60 dimensions, matching the render-layer tests.

Keeping scenarios as functions (not static data) lets future scenarios include small per-scenario setup (picking a different fixture PNG, flipping the `expanded` flag, constructing an error-path render). The registry stays a flat list; no nesting.

#### 2. `scripts/verify/pipeline.ts` — core render pipeline

Extracted from `render-image-spike.ts`. Exports:

```ts
export interface RenderResult {
  pngPath: string;    // where the screenshot was written
  bytesPath: string;  // captured byte stream alongside the PNG
  cols: number;
  rows: number;
}

export async function renderScenario(
  scenario: Scenario,
  outDir: string,
): Promise<RenderResult>;
```

Internals mirror the spike: launch Chromium via `playwright-core`, navigate to a tiny self-contained HTML page that loads xterm.js + `@xterm/addon-image` from `node_modules/` via `addScriptTag`, call `term.write(bytes)` inside `page.evaluate(...)`, await two rAFs + one `setTimeout`, `page.screenshot()`.

One refinement vs. the spike: factor out the Chromium-lifecycle bits (`launch` / `context.newPage` / `browser.close`) so the in-process test can reuse a single browser across scenarios when S2 adds more than one.

#### 3. `scripts/verify.ts` — CLI entry point

Accepts:

- `pnpm render:verify`  — runs the default scenario (`mermaid-happy-path`).
- `pnpm render:verify --scenario <name>` — picks a named scenario.
- `pnpm render:verify --update` — overwrites `tests/fixtures/golden/<name>.png` with the produced PNG.
- `pnpm render:verify --list` — prints the registered scenarios and exits.

Exit codes:

- `0` on success (or on `--list`).
- `1` on scenario-not-found.
- `2` on pipeline failure (browser launch, etc.).

Writes PNGs to `scripts/out/render-verify/<scenario>/render.png` + the captured bytes to `render.bin` (already gitignored by the S1-era `.gitignore` rule).

#### 4. Golden PNG

`tests/fixtures/golden/mermaid-happy-path.png` — the PNG produced by a first `pnpm render:verify --update` run on the implementation machine. Committed. One file today; will grow as S2 adds scenarios.

Keeping goldens under `tests/fixtures/` (alongside `mermaid-flowchart.png`, the Kroki-source fixture) co-locates "committed bytes test code depends on" in one directory. The `golden/` subdir keeps them grouped and greppable.

#### 5. Render-image test layer

New directory `tests/render-image/`. New file `tests/render-image/verify.test.ts`:

```ts
// Gated by Chromium presence so the live suite still green-skips on
// a contributor machine without browsers installed. Follows the same
// describe.skipIf shape the live-deps tests already use.

describe.skipIf(!chromiumAvailable)("render-image scenario: mermaid-happy-path", () => {
  it("matches the committed golden within tolerance", async () => {
    const scenario = getScenario("mermaid-happy-path");
    const outDir = makeTempDir("pi-fence-verify-");
    const { pngPath } = await renderScenario(scenario, outDir);

    const current = PNG.sync.read(await readFile(pngPath));
    const golden = PNG.sync.read(await readFile(GOLDEN_PATH));

    assert.equal(current.width, golden.width);
    assert.equal(current.height, golden.height);

    const diff = new PNG({ width: current.width, height: current.height });
    const diffPixels = pixelmatch(
      current.data, golden.data, diff.data,
      current.width, current.height,
      { threshold: 0.1 },
    );

    if (diffPixels > DIFF_BUDGET) {
      await writeFile(join(outDir, "diff.png"), PNG.sync.write(diff));
    }
    assert.ok(diffPixels <= DIFF_BUDGET,
      `Rendered PNG differs from golden by ${diffPixels} pixels (budget ${DIFF_BUDGET}). See ${join(outDir, "diff.png")}.`);
  });
});
```

`DIFF_BUDGET` starts at a small value (say 50) and is tuned after observing baseline variance across Chromium patch revisions during implementation. If zero pixels differ reliably, the budget stays at 0; otherwise the budget is committed alongside the golden.

Chromium-available check: `existsSync(chromiumExecutable())` or similar. Uses `playwright-core`'s internal path resolution; no new utility needed beyond what's already available.

#### 6. `principles.md` Testing table — `Render Image` row

Add one row to the Testing table in `docs/product/principles.md`, between `Render` and `Extension` (or between `Extension` and `Integration (live)` — see order discussion below):

```markdown
| **Render Image (live)** | Headless Chromium running xterm.js + `@xterm/addon-image` (Kitty graphics); pixel-diff against a committed golden PNG. Catches visual regressions bytes alone cannot see. | Chromium (dev install via `npx playwright install chromium`) + `playwright-core`, `pngjs`, `pixelmatch` (dev deps) | `pnpm test:live` |
```

Order decision: **between `Extension` and `Integration (live)`.** Rationale: listing layers fast → heavy is the existing pattern (fast `pnpm test` first, heavy `pnpm test:live` last); `Render Image` is browser-based and runs under `test:live`, so it sits with the live-suite group. `Render` (fast) stays in the fast-suite cluster.

#### 7. `pnpm test:live` composition

Current script: `vitest run tests/integration`. Expand to include `tests/render-image`:

```json
"test:live": "vitest run tests/integration tests/render-image"
```

Simple broadening. No new script.

#### 8. Documentation

- `README.md` — if a sentence explaining what `pnpm render:verify` is warrants adding near the Development section, ship it; otherwise leave the README alone and document via `docs/getting-started.md`.
- `docs/getting-started.md` — the Scripts reference table gains a row for `pnpm render:verify`. The test-layout tree gains `tests/render-image/`.
- `CHANGELOG.md` — `[Unreleased]` section under a new `Refined (CVx.E2.S1 — headless image verifier)` block.
- `docs/process/worklog.md` — close entry after the final commit.
- `docs/project/roadmap/README.md`, `docs/project/roadmap/cvx--verifiability/README.md`, the CVx.E2 epic file, and this story file: flip statuses.

### Implementation order

Test-first. Each step leaves `pnpm test` green; `pnpm test:live` is allowed to be skipped (Chromium optional) or green (Chromium present).

1. **`wip(agent): scenario registry + pipeline extraction (S1 step 1)`** — extract `scripts/verify/scenarios.ts` and `scripts/verify/pipeline.ts` from `render-image-spike.ts` without adding CLI or tests yet. Existing spike keeps working; new modules are just library code. Verify by running `pnpm --silent render:image-spike` still produces a valid PNG via the spike path.
2. **`wip(agent): pnpm render:verify CLI (S1 step 2)`** — add `scripts/verify.ts` CLI + `pnpm render:verify` script. `--scenario`, `--list`, `--update` flags. Invoking `pnpm render:verify` produces the PNG in `scripts/out/render-verify/mermaid-happy-path/render.png`. No test yet.
3. **`wip(agent): golden PNG for mermaid-happy-path (S1 step 3)`** — first run of `pnpm render:verify --update` captures the golden into `tests/fixtures/golden/mermaid-happy-path.png`. Commit the PNG as binary. Note the Chromium version used in the commit message so future-us knows what baseline it was pinned to.
4. **`wip(agent): pixel-diff render-image test (S1 step 4)`** — add `tests/render-image/verify.test.ts` with the `describe.skipIf` shape. Add `pngjs`, `pixelmatch`, and their `@types/*` as dev deps. Broaden `pnpm test:live` to include `tests/render-image`. Run `pnpm test:live`; expect one new case, green. Run `pnpm test`; expect 161 unchanged (render-image skipped in fast suite because fast suite's include pattern doesn't cover `tests/render-image/`).
5. **`wip(agent): principles + docs (S1 step 5)`** — add `Render Image` row to `principles.md` Testing table. Update `docs/getting-started.md`. Add CHANGELOG entry.
6. **`close CVx.E2.S1`** — worklog close + status flips on roadmap / CVx / CVx.E2 / story files.

Step 4 is where unknowns surface. Possibilities:

- **Chromium-detection utility isn't trivial.** Fallback: import `playwright-core` and try `chromium.launch({ headless: true })` in a `beforeAll`; on throw, skip. Cost: one failed launch per `pnpm test:live` invocation on a contributor machine without Chromium — acceptable.
- **Pixel-diff budget > 50 on baseline.** If Chromium font metrics produce more variance than expected, raise `DIFF_BUDGET` to whatever the observed baseline needs plus a generous multiplier, and commit that number explicitly in the test file with a comment explaining what was observed.
- **Golden instability across re-runs.** Would be a red flag that rendering has a nondeterministic element (animation, RAF timing, font hinting). If observed, S3's sentinel-based readiness work moves up the priority list; S1 can ship with a loose budget and a known-nondeterminism note in the test.

## Tests

1. **Layers touched:**
   - **Render Image (new, live)**: one case in `tests/render-image/verify.test.ts`.
   - **Unit / Contract / Render / Extension / Integration (live)**: untouched.

2. **Events / interactions covered:**
   - `pnpm render:verify` produces a PNG at the expected path for `mermaid-happy-path`.
   - `pnpm render:verify --update` overwrites the golden.
   - The produced PNG pixel-matches the golden within the committed tolerance.
   - On mismatch, a `diff.png` is written alongside the generated PNG.
   - When Chromium isn't available, the render-image suite skips cleanly.

3. **Fakes added:** none. The verifier runs real Chromium; no fakes are meaningful here.

4. **Live tests added / updated:** one new file, `tests/render-image/verify.test.ts`. One case. `pnpm test:live` includes it. Gated by Chromium presence.

5. **Deferred:**
   - Multi-scenario assertions (S2).
   - Theme/width matrix (S2).
   - Cross-OS determinism story (S3).
   - Consolidating the spike scripts.
   - Integration with the existing `.github/workflows/live.yml` — already dormant; activation separate from S1.

## Verification

### Gate

- `pnpm install` + `npx playwright install chromium` (one-time) + `pnpm test` → 161 green.
- `pnpm render:verify` → `scripts/out/render-verify/mermaid-happy-path/render.png` exists, valid PNG, shows label + diagram.
- `pnpm render:verify --list` → prints one scenario.
- `pnpm render:verify --update` → rewrites golden; next `pnpm test:live` passes with zero diff pixels.
- `pnpm test:live` → existing Kroki / shell-runner cases + one new render-image case; all green (or cleanly skipped).
- `pnpm run check` → green.

### Prerequisites

- Node + pnpm, per existing project setup.
- **Chromium** installed via `npx playwright install chromium` (one-time, ~150 MB download, cached globally at `~/Library/Caches/ms-playwright/`). Only needed for the image-verifier path; skipped cleanly when absent.

No Docker, no Kroki network access for the verifier itself. The existing committed Kroki fixture (`tests/fixtures/mermaid-flowchart.png`) is the only PNG the `mermaid-happy-path` scenario uses.

### Automated tests

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

### Manual test script

#### 1. `pnpm render:verify --list` prints the scenario registry

```bash
pnpm render:verify --list
```

Expect:

```text
Registered scenarios:
  mermaid-happy-path — pi-fence:output panel with Kroki-rendered mermaid flowchart
```

One row today; the list grows in S2.

#### 2. `pnpm render:verify` produces a PNG for the default scenario

```bash
pnpm render:verify
```

Expect:

- Exit code 0.
- A PNG exists at `scripts/out/render-verify/mermaid-happy-path/render.png`.
- Opening the PNG: visible "Rendered mermaid via kroki" label at top, actual mermaid flowchart (`A → B → C` boxes with arrows) rendered below, on a black terminal background.
- A `render.bin` byte-stream capture exists alongside for inspection.

#### 3. `pnpm render:verify --scenario mermaid-happy-path` is explicit; equivalent output

```bash
pnpm render:verify --scenario mermaid-happy-path
```

Expect: identical result to step 2. Proves the `--scenario` flag is wired; not just the default.

#### 4. `pnpm test:live` picks up the render-image test

```bash
pnpm test:live
```

With Chromium installed: expect a new passing case reporting the pixel-diff count, which should be under the committed `DIFF_BUDGET`. Without Chromium: expect the render-image suite to report "skipped" (not failed) and the exit code to stay at 0.

#### 5. Deliberate break → diff image surfaces

Temporarily modify `scripts/verify/scenarios.ts` so `mermaid-happy-path` passes a different PNG (e.g. `tests/fixtures/mermaid-flowchart.png` → a swapped fixture, or a manually-munged copy). Run `pnpm test:live`.

Expect:

- The render-image case fails with an error message naming the observed diff-pixel count and pointing at `scripts/out/render-verify/mermaid-happy-path/diff.png`.
- Opening `diff.png`: the differing pixel regions are highlighted (pixelmatch draws diffs in a bright color).
- Revert the scenario change; `pnpm test:live` goes green again.

This step is optional but recommended — it proves the diff gate has teeth and the diff artifact is discoverable.

#### 6. `pnpm render:verify --update` overwrites the golden

(Only do this when a rendering change has been explicitly approved.)

```bash
pnpm render:verify --update
```

Expect:

- `tests/fixtures/golden/mermaid-happy-path.png` is overwritten with the current render.
- `git diff --stat tests/fixtures/golden/` shows the binary file changed; `git diff` shows binary diff indication.
- `pnpm test:live` passes with zero (or near-zero) diff pixels after the update.

For a normal S1 verification pass: do **not** run `--update`. The shipped golden should match the shipped verifier without further action.

#### 7. `Render Image` row is documented in principles.md

```bash
grep "Render Image" docs/product/principles.md
```

Expect: one match in the Testing table row, between Extension and Integration (live). Listing Chromium + `playwright-core` + `pngjs` + `pixelmatch` as dependencies, `pnpm test:live` as the runner.

#### 8. Test-layout tree mentions `tests/render-image/`

```bash
grep "render-image" docs/getting-started.md
```

Expect: match in the test-layout tree under Development.

### Rollback

S1 is additive. If the verifier causes unforeseen breakage:

```bash
git revert <sha-of-step-N> <sha-of-step-N+1> ...
```

No runtime rollback is needed — the verifier is a dev-time tool plus one live-suite test; neither affects the shipped extension. If the render-image test is flaky in CI, the fastest mitigation is to temporarily exclude `tests/render-image/` from `pnpm test:live` in `package.json` while diagnosing. Permanent fix per the plan's "step 4 unknowns" notes.

## Key files

**New:**

- `scripts/verify.ts`
- `scripts/verify/scenarios.ts`
- `scripts/verify/pipeline.ts`
- `tests/render-image/verify.test.ts`
- `tests/fixtures/golden/mermaid-happy-path.png` (binary)

**Modified:**

- `package.json` — new deps (`pngjs`, `pixelmatch`, `@types/pngjs`, `@types/pixelmatch`); new script `render:verify`; `test:live` broadened.
- `docs/product/principles.md` — `Render Image (live)` row added to the Testing table.
- `docs/getting-started.md` — scripts reference + test-layout tree.
- `CHANGELOG.md` — `[Unreleased]` entry.
- `docs/process/worklog.md` — close entry.
- `docs/project/roadmap/README.md`, `docs/project/roadmap/cvx--verifiability/README.md`, CVx.E2 epic file, this story file — status flips.

## Out of scope — explicitly

- Multi-scenario gallery (CVx.E2.S2). S1 ships one scenario, one golden, one test.
- Theme / width / font matrix (CVx.E2.S2).
- Golden updates as part of the verifier's default output. Updates require `--update`; absent the flag the verifier does not mutate `tests/fixtures/`.
- Cross-OS determinism. S1 calibrates the `DIFF_BUDGET` against the implementation machine's Chromium. If CI runs on a different OS / Chromium and the budget proves too tight, S3 territory.
- Cleaning up `scripts/render-screenshot.ts` / `scripts/render-a11y-spike.ts` / `scripts/render-image-spike.ts`. Keep them until the verifier ships.
- Activating `.github/workflows/live.yml`. Separate concern; the render-image test lands dormant alongside the existing integration tests.
