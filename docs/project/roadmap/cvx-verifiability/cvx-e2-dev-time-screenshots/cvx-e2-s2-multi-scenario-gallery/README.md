[< CVx.E2 — Dev-time Render Screenshots](../README.md)

# S2 — Multi-scenario rendering with a per-run HTML gallery ✅ Done

S1 shipped the verifier for one scenario. S2 grows it into the **first usable review surface**: more than one scenario, a per-run gallery HTML that a human opens once and scans, and enough variant plumbing in place that a future story can add theme or width matrices without refactoring the pipeline.

- [Plan](plan.md) — deliverables, implementation order, verification steps
- [Test Guide](test-guide.md) — manual test script

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

---

**See also:** [Plan](plan.md) · [Test Guide](test-guide.md) · [CVx.E2](../README.md) · [CVx.E2.S1](../cvx-e2-s1-headless-image-verifier/README.md) · [Principles — Testing](../../../../../product/principles.md#testing)
