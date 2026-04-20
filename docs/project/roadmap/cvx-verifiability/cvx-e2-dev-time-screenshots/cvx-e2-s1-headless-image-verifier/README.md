[< CVx.E2 — Dev-time Render Screenshots](../README.md)

# S1 — `pnpm render:verify` produces a diffable PNG of one pi-fence scenario 🛠️ Planned

Promote the third CVx.E2 spike (`scripts/render-image-spike.ts`) to a first-class verifier tool. One named scenario, one deterministic PNG per run, one pixel-diff test that fails the live suite when the render regresses.

- [Plan](plan.md) — deliverables, implementation order, verification steps
- [Test Guide](test-guide.md) — manual test script

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

---

**See also:** [Plan](plan.md) · [Test Guide](test-guide.md) · [CVx.E2](../README.md) · [CVx.E1.S1](../../cvx-e1-pi-tui-idiom/cvx-e1-s1-virtual-terminal-tests/README.md) · [Principles — Testing](../../../../../product/principles.md#testing)
