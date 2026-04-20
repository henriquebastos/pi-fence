/**
 * Render Image (live) — CVx.E2.S1.
 *
 * For each registered scenario, invokes the headless render
 * pipeline, decodes the produced PNG and the committed golden into
 * RGBA buffers via `pngjs`, and runs `pixelmatch` with a small
 * per-pixel tolerance. The test passes if the count of differing
 * pixels is under a committed budget.
 *
 * Runs in the live suite (`pnpm test:live`), not the fast suite
 * (`pnpm test`), because each case spawns Chromium. Gated by
 * Chromium-available detection so contributors without the
 * playwright browser cache green-skip rather than fail.
 *
 * On diff failure, the test writes the diff image alongside the
 * generated PNG so a human can open it and decide whether the
 * rendering changed for a good reason.
 */

import assert from "node:assert";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { describe, it } from "vitest";

import { renderScenario } from "../../scripts/verify/pipeline.ts";
import { expandCombos } from "../../scripts/verify/pipeline.ts";
import { listScenarios } from "../../scripts/verify/scenarios.ts";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GOLDEN_DIR = join(REPO_ROOT, "tests/fixtures/golden");
const OUT_DIR = join(REPO_ROOT, "scripts/out/render-verify-test");

/**
 * Pixel-diff tolerance between the current render and the committed
 * golden. Set after observing baseline variance during S1
 * implementation: on the authoring machine (macOS arm64, Chromium
 * revision 1217), re-running the pipeline produces byte-identical
 * PNGs and zero diff pixels. The budget of 100 absorbs anti-aliasing
 * variance that may appear across Chromium patch revisions.
 *
 * If CI observes drift above this budget, the options are (in
 * increasing cost):
 *   1. Re-capture the golden via `pnpm render:verify --update`
 *      (if the drift is intentional).
 *   2. Raise the budget (if drift is unavoidable minor anti-aliasing).
 *   3. Tighten `renderScenario`'s determinism (S3 territory).
 */
const DIFF_BUDGET = 100;

/** `pixelmatch` threshold: 0 = strict, 1 = lenient. 0.1 is pixelmatch's documented "recommended". */
const DIFF_THRESHOLD = 0.1;

/**
 * Probe for a usable Chromium binary without actually launching one.
 * `playwright-core`'s chromium.executablePath() throws if the
 * browser binary is not installed; catching that skips cleanly.
 */
async function chromiumAvailable(): Promise<boolean> {
	try {
		const { chromium } = await import("playwright-core");
		const path = chromium.executablePath();
		return Boolean(path) && existsSync(path);
	} catch {
		return false;
	}
}

const hasChromium = await chromiumAvailable();

describe.skipIf(!hasChromium)(
	"Render Image — live suite — pixel-diff against committed golden",
	() => {
		for (const { scenario, variant } of expandCombos(listScenarios())) {
			it(
				`${scenario.name} / ${variant.name}: PNG matches golden within DIFF_BUDGET=${DIFF_BUDGET}`,
				async () => {
					await mkdir(OUT_DIR, { recursive: true });
					const result = await renderScenario(scenario, variant, OUT_DIR);

					const goldenPath = join(
						GOLDEN_DIR,
						scenario.name,
						`${variant.name}.png`,
					);
					if (!existsSync(goldenPath)) {
						assert.fail(
							`No golden at ${goldenPath}. Run 'pnpm render:verify --update --scenario ${scenario.name} --variant ${variant.name}'.`,
						);
					}

					const current = PNG.sync.read(await readFile(result.pngPath));
					const golden = PNG.sync.read(await readFile(goldenPath));

					assert.equal(
						current.width,
						golden.width,
						`Width mismatch: current=${current.width} golden=${golden.width}`,
					);
					assert.equal(
						current.height,
						golden.height,
						`Height mismatch: current=${current.height} golden=${golden.height}`,
					);

					const diff = new PNG({ width: current.width, height: current.height });
					const diffPixels = pixelmatch(
						current.data,
						golden.data,
						diff.data,
						current.width,
						current.height,
						{ threshold: DIFF_THRESHOLD },
					);

					if (diffPixels > DIFF_BUDGET) {
						const diffPath = join(dirname(result.pngPath), "diff.png");
						await writeFile(diffPath, PNG.sync.write(diff));
						assert.fail(
							`${scenario.name}/${variant.name}: PNG differs from golden by ${diffPixels} pixels ` +
								`(budget=${DIFF_BUDGET}, threshold=${DIFF_THRESHOLD}). ` +
								`See ${diffPath} and the rendered PNG at ${result.pngPath}.`,
						);
					}
				},
				60_000,
			);
		}
	},
);
