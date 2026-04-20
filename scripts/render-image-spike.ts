/**
 * CVx.E2 spike #3 -- render the pi-fence panel as a real PNG, headlessly.
 *
 * HISTORICAL NOTE: this script originally carried the full pipeline
 * inline and was the tracer bullet that proved xterm.js +
 * `@xterm/addon-image` could render pi-tui's byte stream (with Kitty
 * graphics) in headless Chromium. CVx.E2.S1 promoted the pipeline to
 * `scripts/verify/pipeline.ts` and the scenario to
 * `scripts/verify/scenarios.ts`; the spike now drives those modules
 * directly. The only reason it stays in the tree is as a worked
 * example of the pipeline's one-shot form; the maintained entry
 * point is `pnpm render:verify`.
 *
 * Run:
 *
 *   pnpm --silent render:image-spike
 *
 * Output:
 *
 *   scripts/out/render-image-spike/mermaid-happy-path/render.png
 *   scripts/out/render-image-spike/mermaid-happy-path/render.bin
 *
 * See `docs/project/roadmap/cvx-verifiability/cvx-e2-dev-time-screenshots/`
 * for the full CVx.E2 scope and the shape of the verifier the
 * scenario registry feeds.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getScenario } from "./verify/scenarios.ts";
import { renderScenario } from "./verify/pipeline.ts";

async function main(): Promise<void> {
	const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
	const outDir = join(repoRoot, "scripts/out/render-image-spike");

	const scenario = getScenario("mermaid-happy-path");
	const variant = scenario.variants[0];
	if (!variant) throw new Error("scenario has no variants");
	const result = await renderScenario(scenario, variant, outDir);

	process.stderr.write(
		`[pi-fence CVx.E2 image spike] wrote ${result.pngPath}\n` +
			`[pi-fence CVx.E2 image spike] captured bytes: ${result.bytesPath}\n` +
			`[pi-fence CVx.E2 image spike] dimensions: ${result.cols}x${result.rows}\n`,
	);
}

main().catch((err) => {
	process.stderr.write(`[pi-fence CVx.E2 image spike] error: ${String(err)}\n`);
	if (err instanceof Error && err.stack) process.stderr.write(`${err.stack}\n`);
	process.exit(1);
});
