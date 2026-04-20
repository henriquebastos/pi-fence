[< S1](README.md)

# Plan: CVx.E2.S1 — headless image verifier with pixel-diff snapshot test

**Story:** [README.md](README.md)
**Epic:** [CVx.E2 — Dev-time Render Screenshots](../README.md)
**Depends on:** [CVx.E1.S1 — VirtualTerminal-backed renderer tests](../../cvx-e1-pi-tui-idiom/cvx-e1-s1-virtual-terminal-tests/README.md), the three CVx.E2 spikes (commits `2183665`, `373a9e5`, `12e4e1d`) — in particular the image spike whose code S1 promotes.
**Date:** 2026-04-20

## Goal

Promote `scripts/render-image-spike.ts` from research code to a maintained verifier: scenario registry, named invocation, golden-PNG pixel-diff as the oracle for rendering regressions. Land the first scenario + the first diff gate, end-to-end. S2 broadens to multi-scenario galleries; S3 tightens determinism. S1's job is to ship the foundation the next two stories build on.

---

## Deliverables

### 1. `scripts/verify/scenarios.ts` — scenario registry

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

### 2. `scripts/verify/pipeline.ts` — core render pipeline

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

### 3. `scripts/verify.ts` — CLI entry point

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

### 4. Golden PNG

`tests/fixtures/golden/mermaid-happy-path.png` — the PNG produced by a first `pnpm render:verify --update` run on the implementation machine. Committed. One file today; will grow as S2 adds scenarios.

Keeping goldens under `tests/fixtures/` (alongside `mermaid-flowchart.png`, the Kroki-source fixture) co-locates "committed bytes test code depends on" in one directory. The `golden/` subdir keeps them grouped and greppable.

### 5. Render-image test layer

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

### 6. `principles.md` Testing table — `Render Image` row

Add one row to the Testing table in `docs/product/principles.md`, between `Render` and `Extension` (or between `Extension` and `Integration (live)` — see order discussion below):

```markdown
| **Render Image (live)** | Headless Chromium running xterm.js + `@xterm/addon-image` (Kitty graphics); pixel-diff against a committed golden PNG. Catches visual regressions bytes alone cannot see. | Chromium (dev install via `npx playwright install chromium`) + `playwright-core`, `pngjs`, `pixelmatch` (dev deps) | `pnpm test:live` |
```

Order decision: **between `Extension` and `Integration (live)`.** Rationale: listing layers fast → heavy is the existing pattern (fast `pnpm test` first, heavy `pnpm test:live` last); `Render Image` is browser-based and runs under `test:live`, so it sits with the live-suite group. `Render` (fast) stays in the fast-suite cluster.

### 7. `pnpm test:live` composition

Current script: `vitest run tests/integration`. Expand to include `tests/render-image`:

```json
"test:live": "vitest run tests/integration tests/render-image"
```

Simple broadening. No new script.

### 8. Documentation

- `README.md` — if a sentence explaining what `pnpm render:verify` is warrants adding near the Development section, ship it; otherwise leave the README alone and document via `docs/getting-started.md`.
- `docs/getting-started.md` — the Scripts reference table gains a row for `pnpm render:verify`. The test-layout tree gains `tests/render-image/`.
- `CHANGELOG.md` — `[Unreleased]` section under a new `Refined (CVx.E2.S1 — headless image verifier)` block.
- `docs/process/worklog.md` — close entry after the final commit.
- `docs/project/roadmap/README.md`, `docs/project/roadmap/cvx-verifiability/README.md`, the CVx.E2 epic README, and this story README: flip statuses.

---

## Implementation order

Test-first. Each step leaves `pnpm test` green; `pnpm test:live` is allowed to be skipped (Chromium optional) or green (Chromium present).

1. **`wip(agent): scenario registry + pipeline extraction (S1 step 1)`** — extract `scripts/verify/scenarios.ts` and `scripts/verify/pipeline.ts` from `render-image-spike.ts` without adding CLI or tests yet. Existing spike keeps working; new modules are just library code. Verify by running `pnpm --silent render:image-spike` still produces a valid PNG via the spike path.
2. **`wip(agent): pnpm render:verify CLI (S1 step 2)`** — add `scripts/verify.ts` CLI + `pnpm render:verify` script. `--scenario`, `--list`, `--update` flags. Invoking `pnpm render:verify` produces the PNG in `scripts/out/render-verify/mermaid-happy-path/render.png`. No test yet.
3. **`wip(agent): golden PNG for mermaid-happy-path (S1 step 3)`** — first run of `pnpm render:verify --update` captures the golden into `tests/fixtures/golden/mermaid-happy-path.png`. Commit the PNG as binary. Note the Chromium version used in the commit message so future-us knows what baseline it was pinned to.
4. **`wip(agent): pixel-diff render-image test (S1 step 4)`** — add `tests/render-image/verify.test.ts` with the `describe.skipIf` shape. Add `pngjs`, `pixelmatch`, and their `@types/*` as dev deps. Broaden `pnpm test:live` to include `tests/render-image`. Run `pnpm test:live`; expect one new case, green. Run `pnpm test`; expect 161 unchanged (render-image skipped in fast suite because fast suite's include pattern doesn't cover `tests/render-image/`).
5. **`wip(agent): principles + docs (S1 step 5)`** — add `Render Image` row to `principles.md` Testing table. Update `docs/getting-started.md`. Add CHANGELOG entry.
6. **`close CVx.E2.S1`** — worklog close + status flips on roadmap / CVx / CVx.E2 / story READMEs.

Step 4 is where unknowns surface. Possibilities:

- **Chromium-detection utility isn't trivial.** Fallback: import `playwright-core` and try `chromium.launch({ headless: true })` in a `beforeAll`; on throw, skip. Cost: one failed launch per `pnpm test:live` invocation on a contributor machine without Chromium — acceptable.
- **Pixel-diff budget > 50 on baseline.** If Chromium font metrics produce more variance than expected, raise `DIFF_BUDGET` to whatever the observed baseline needs plus a generous multiplier, and commit that number explicitly in the test file with a comment explaining what was observed.
- **Golden instability across re-runs.** Would be a red flag that rendering has a nondeterministic element (animation, RAF timing, font hinting). If observed, S3's sentinel-based readiness work moves up the priority list; S1 can ship with a loose budget and a known-nondeterminism note in the test.

---

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

---

## Verification

- `pnpm install` + `npx playwright install chromium` (one-time) + `pnpm test` → 161 green.
- `pnpm render:verify` → `scripts/out/render-verify/mermaid-happy-path/render.png` exists, valid PNG, shows label + diagram.
- `pnpm render:verify --list` → prints one scenario.
- `pnpm render:verify --update` → rewrites golden; next `pnpm test:live` passes with zero diff pixels.
- `pnpm test:live` → existing Kroki / shell-runner cases + one new render-image case; all green (or cleanly skipped).
- `pnpm run check` → green.

---

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
- `docs/project/roadmap/README.md`, `docs/project/roadmap/cvx-verifiability/README.md`, CVx.E2 epic README, this story README — status flips.

---

## Out of scope — explicitly

- Multi-scenario gallery (CVx.E2.S2). S1 ships one scenario, one golden, one test.
- Theme / width / font matrix (CVx.E2.S2).
- Golden updates as part of the verifier's default output. Updates require `--update`; absent the flag the verifier does not mutate `tests/fixtures/`.
- Cross-OS determinism. S1 calibrates the `DIFF_BUDGET` against the implementation machine's Chromium. If CI runs on a different OS / Chromium and the budget proves too tight, S3 territory.
- Cleaning up `scripts/render-screenshot.ts` / `scripts/render-a11y-spike.ts` / `scripts/render-image-spike.ts`. Keep them until the verifier ships.
- Activating `.github/workflows/live.yml`. Separate concern; the render-image test lands dormant alongside the existing integration tests.

---

**See also:** [README](README.md) · [Test Guide](test-guide.md) · [CVx.E2](../README.md) · [Principles — Testing](../../../../../product/principles.md#testing) · [CVx.E2 spike worklog entry](../../../../../process/worklog.md)
