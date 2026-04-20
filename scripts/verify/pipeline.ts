/**
 * Headless render pipeline for CVx.E2 verifier scenarios.
 *
 * Given a `Scenario` (produces a byte stream + terminal dimensions),
 * paint the bytes through xterm.js + `@xterm/addon-image` (Kitty
 * graphics protocol) in a headless Chromium via `playwright-core`,
 * screenshot the page, and return the paths to the resulting PNG
 * and byte-stream capture.
 *
 * The Chromium lifecycle (`launch` / `newContext` / `newPage` /
 * `close`) is factored out so S2's multi-scenario gallery can reuse
 * one browser across many scenarios without paying the ~500ms
 * launch cost per render. S1 launches-and-closes per render for
 * simplicity; the `renderMany(scenarios)` helper shares a browser.
 *
 * Invariant preserved across the fast suite, the wterm/a11y spike,
 * and this pipeline: the bytes that reach xterm.js here are the
 * same bytes the render-layer tests assert on in
 * `tests/unit/renderer.test.ts` via `LoggingVirtualTerminal.getWrites()`.
 * Divergences in rendered output therefore point at parser / renderer
 * differences, not byte-stream differences.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, type Browser } from "playwright-core";

import { countKittyImages } from "./kitty.ts";
import type { Scenario, Variant } from "./scenarios.ts";

export interface RenderResult {
	scenarioName: string;
	variantName: string;
	/** Filesystem path to the written PNG screenshot. */
	pngPath: string;
	/** Filesystem path to the captured byte stream (for inspection). */
	bytesPath: string;
	cols: number;
	rows: number;
	/** Wall-clock milliseconds from the start of this combo's render
	 *  (new browser context) through the screenshot flushing to disk.
	 *  Used by the live-suite timing-budget assertion and by the CLI
	 *  stderr summary. */
	durationMs: number;
}

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const XTERM_CSS_PATH = join(
	REPO_ROOT,
	"node_modules/@xterm/xterm/css/xterm.css",
);
const XTERM_JS_PATH = join(
	REPO_ROOT,
	"node_modules/@xterm/xterm/lib/xterm.js",
);
const IMAGE_ADDON_JS_PATH = join(
	REPO_ROOT,
	"node_modules/@xterm/addon-image/lib/addon-image.js",
);

/**
 * One (scenario, variant) pair. The pipeline iterates these.
 */
export interface Combo {
	scenario: Scenario;
	variant: Variant;
}

/**
 * Expand a list of scenarios into the full `scenario × variant`
 * cross-product. Each scenario contributes one entry per variant
 * it declares. Order preserved (scenario order, then variant order
 * within each scenario).
 */
export function expandCombos(scenarios: readonly Scenario[]): Combo[] {
	const combos: Combo[] = [];
	for (const scenario of scenarios) {
		for (const variant of scenario.variants) {
			combos.push({ scenario, variant });
		}
	}
	return combos;
}

/**
 * Render a single (scenario, variant) pair. Launches and closes a
 * private Chromium instance. Use `renderCombos` when rendering
 * multiple combos in one run — it shares the browser and amortises
 * launch cost.
 */
export async function renderScenario(
	scenario: Scenario,
	variant: Variant,
	outDir: string,
): Promise<RenderResult> {
	const browser = await chromium.launch({ headless: true });
	try {
		return await renderScenarioInBrowser(browser, scenario, variant, outDir);
	} finally {
		await browser.close();
	}
}

/**
 * Render many (scenario, variant) combos through one shared browser.
 * Output layout: `<outDir>/<scenario>/<variant>/render.png`.
 */
export async function renderCombos(
	combos: readonly Combo[],
	outDir: string,
): Promise<RenderResult[]> {
	const browser = await chromium.launch({ headless: true });
	try {
		const results: RenderResult[] = [];
		for (const { scenario, variant } of combos) {
			results.push(await renderScenarioInBrowser(browser, scenario, variant, outDir));
		}
		return results;
	} finally {
		await browser.close();
	}
}

async function renderScenarioInBrowser(
	browser: Browser,
	scenario: Scenario,
	variant: Variant,
	outDir: string,
): Promise<RenderResult> {
	const { bytes } = await scenario.build(variant);
	const { cols, rows } = variant;
	const expectedImages = countKittyImages(bytes);

	const comboDir = join(outDir, scenario.name, variant.name);
	await mkdir(comboDir, { recursive: true });
	const pngPath = join(comboDir, "render.png");
	const bytesPath = join(comboDir, "render.bin");

	const renderStart = performance.now();

	// Capture bytes alongside the PNG so the "pixels derive from
	// these bytes" invariant is inspectable out-of-band.
	await writeFile(bytesPath, bytes);

	const viewport = estimateViewportPixels(cols, rows);
	const context = await browser.newContext({
		viewport,
		deviceScaleFactor: 2, // sharper screenshot
	});
	try {
		const page = await context.newPage();
		await page.setContent(buildHtml(`file://${XTERM_CSS_PATH}`, viewport));
		await page.addScriptTag({ path: XTERM_JS_PATH });
		await page.addScriptTag({ path: IMAGE_ADDON_JS_PATH });

		await page.evaluate(
			async (args: {
				bytesB64: string;
				cols: number;
				rows: number;
				expectedImages: number;
			}) => {
				// xterm.js's UMD bundle unpacks its exports onto globals, so
				// window.Terminal is the constructor directly. addon-image's
				// UMD differs: window.ImageAddon is the module object
				// { ImageAddon: <class> }, so we dereference once more.
				const w = window as unknown as {
					Terminal: new (opts?: unknown) => {
						loadAddon(addon: unknown): void;
						open(el: HTMLElement): void;
						write(data: string, cb?: () => void): void;
						onRender(cb: () => void): { dispose(): void };
					};
					ImageAddon: {
						ImageAddon: new () => {
							onImageAdded: {
								(cb: () => void): { dispose(): void };
							} | ((cb: () => void) => { dispose(): void });
						};
					};
				};

				const term = new w.Terminal({
					cols: args.cols,
					rows: args.rows,
					fontSize: 13,
					fontFamily:
						'Menlo, "DejaVu Sans Mono", "Lucida Console", "Courier New", monospace',
					theme: { background: "#000000", foreground: "#ffffff" },
					allowProposedApi: true,
				});
				const imageAddon = new w.ImageAddon.ImageAddon();
				term.loadAddon(imageAddon);

				const host = document.getElementById("term");
				if (!host) throw new Error("missing #term host element");
				term.open(host);

				// Register sentinel listeners BEFORE term.write so events
				// fired mid-parse are not missed. onImageAdded fires per
				// complete image (not per chunk); we count the expected
				// number outside the browser and wait for that many here.
				let imagesSeen = 0;
				let imageWaitResolve: (() => void) | null = null;
				const imageWait =
					args.expectedImages === 0
						? Promise.resolve()
						: new Promise<void>((resolve) => {
								imageWaitResolve = resolve;
							});
				const imageDisposable =
					args.expectedImages === 0
						? null
						: (
								imageAddon.onImageAdded as (cb: () => void) => {
									dispose(): void;
								}
							)(() => {
								imagesSeen++;
								if (
									imagesSeen >= args.expectedImages &&
									imageWaitResolve
								) {
									imageWaitResolve();
									imageWaitResolve = null;
								}
							});

				// For image-free scenarios we still need to know xterm has
				// repainted once after the write. Register this listener
				// before write too; register outside the image-count branch
				// so we can await BOTH when the scenario has images (paint
				// completing is a stronger signal than onImageAdded alone).
				let renderWaitResolve: (() => void) | null = null;
				const renderWait = new Promise<void>((resolve) => {
					renderWaitResolve = resolve;
				});
				const renderDisposable = term.onRender(() => {
					if (renderWaitResolve) {
						renderWaitResolve();
						renderWaitResolve = null;
					}
				});

				const bin = atob(args.bytesB64);
				await new Promise<void>((resolve) => {
					term.write(bin, () => resolve());
				});

				// Safety ceiling: if images never arrive or onRender never
				// fires, bail after a hard limit so a stuck pipeline
				// surfaces as a slow-and-failing test rather than a hung
				// process. Well above the 5-second per-scenario budget.
				const bailout = new Promise<void>((resolve) =>
					setTimeout(resolve, 10_000),
				);

				await Promise.race([
					Promise.all([imageWait, renderWait]),
					bailout,
				]);

				imageDisposable?.dispose();
				renderDisposable.dispose();

				// Two rAFs let layout + paint fully settle after the sentinel.
				await new Promise<void>((r) => requestAnimationFrame(() => r()));
				await new Promise<void>((r) => requestAnimationFrame(() => r()));
			},
			{
				bytesB64: Buffer.from(bytes, "binary").toString("base64"),
				cols,
				rows,
				expectedImages,
			},
		);

		await page.screenshot({ path: pngPath, fullPage: false });
	} finally {
		await context.close();
	}

	const durationMs = Math.round(performance.now() - renderStart);

	return {
		scenarioName: scenario.name,
		variantName: variant.name,
		pngPath,
		bytesPath,
		cols,
		rows,
		durationMs,
	};
}

/**
 * Estimate viewport pixels for a given cols/rows at xterm.js's
 * default monospace metrics. Over-provisions slightly so the cell
 * grid fits without horizontal scroll; the screenshot is of the
 * whole viewport.
 */
function estimateViewportPixels(
	cols: number,
	rows: number,
): { width: number; height: number } {
	// xterm.js's default cell metrics at fontSize=13 in Menlo-ish
	// monospace are ~8px wide by ~17px tall. Multiplying and adding
	// a small margin for borders gives a safe viewport size.
	const charW = 10;
	const charH = 18;
	return {
		width: cols * charW + 80,
		height: rows * charH + 60,
	};
}

function buildHtml(
	xtermCssUrl: string,
	viewport: { width: number; height: number },
): string {
	// Dimensions on the host div are deliberately a little smaller
	// than the viewport so browser chrome / scroll bars never intrude.
	const termWidth = viewport.width - 40;
	const termHeight = viewport.height - 30;
	return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="${xtermCssUrl}" />
    <style>
      html, body { margin: 0; padding: 0; background: #000; }
      #term {
        width: ${termWidth}px;
        height: ${termHeight}px;
      }
    </style>
  </head>
  <body>
    <div id="term"></div>
  </body>
</html>`;
}
