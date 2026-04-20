/**
 * CVx.E2 spike #3 -- render the pi-fence panel as a real PNG, headlessly.
 *
 * Shape: xterm.js + @xterm/addon-image (beta, with Kitty-graphics
 * protocol support) running in a headless Chromium via playwright-core.
 * Feeds the exact byte stream the fast suite asserts on through a
 * real terminal emulator that understands Kitty `\x1b_Ga=T,...\x1b\\`
 * sequences, then screenshots the rendered page.
 *
 * Why this spike exists:
 *
 *   The first two CVx.E2 spikes covered two of three slices:
 *     1. `scripts/render-screenshot.ts`  -- drive a live terminal
 *        (Ghostty/Kitty) via stdout; screenshot manually. Fragile due
 *        to cursor-lifecycle interactions with the surrounding shell.
 *     2. `scripts/render-a11y-spike.ts`  -- feed the stream into
 *        wterm in jsdom; read DOM text. Verifies text layout headlessly
 *        but wterm does not implement the Kitty graphics protocol, so
 *        the image itself is never rendered.
 *
 *   This third spike closes the last gap: we want a real PNG of what
 *   the rendered panel looks like, with the mermaid image actually
 *   present, produced without a live terminal and without manual
 *   screencapture. A human opens the output file and visually
 *   confirms the render; a CI job can hash it for snapshot diffing.
 *
 * Stack choice:
 *
 *   - xterm.js: the same parser our fast-suite `VirtualTerminal` is
 *     built on (via @xterm/headless). Byte-for-byte, this spike and
 *     the render-layer tests process the same stream; any divergence
 *     is a bug in one of the two rather than in parser semantics.
 *   - @xterm/addon-image (beta, 0.10.0-beta.197+): adds SIXEL, IIP,
 *     and **Kitty graphics protocol** parsing to xterm.js. pi-tui
 *     emits the Kitty APC form `a=T` (transmit-and-display), which
 *     the beta supports. Stable (0.9.x) does NOT support Kitty; the
 *     beta peer-depends on @xterm/xterm@^6.1.0-beta.
 *   - playwright-core: headless Chromium driver without the browser
 *     installer. The Chromium binary is installed once via
 *     `npx playwright install chromium` (~150MB, cached globally at
 *     `~/Library/Caches/ms-playwright/`). Subsequent runs reuse it.
 *
 * Output:
 *
 *   scripts/out/render-image.png  -- the PNG screenshot.
 *
 * Run:
 *
 *   pnpm --silent render:image-spike
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Box, Image, Spacer, Text, setCapabilities, truncateToWidth } from "@mariozechner/pi-tui";
import { chromium } from "playwright-core";

import { createPiFenceMessageRenderer } from "../extensions/pi-fence/renderer.ts";
import { paintComponent } from "../tests/utilities/render.ts";

// ---------------------------------------------------------------------------
// Scenario capture (same fixture shape as the other two spikes)
// ---------------------------------------------------------------------------

/**
 * Path to a real Kroki-rendered mermaid PNG (324x70, ~2 KB) committed
 * under tests/fixtures/. The synthetic "magic + IHDR only" PNG the
 * render-layer tests use exercises pi-tui's dimension-parse path but
 * fails to decode in a real image decoder, producing a placeholder
 * square at render time. For the image spike we want to SEE the
 * diagram, so we use a real PNG. Same format, same decoder path,
 * just with actual IDAT pixel data.
 */
const FIXTURE_PNG_RELATIVE = "tests/fixtures/mermaid-flowchart.png";

const IDENTITY_THEME = {
	fg: (_color: string, text: string) => text,
	bold: (text: string) => text,
	bg: (_color: string, text: string) => text,
};

async function captureBytes(pngBase64: string): Promise<string> {
	setCapabilities({ images: "kitty", trueColor: true, hyperlinks: true });

	const renderer = createPiFenceMessageRenderer({
		Box,
		Text,
		Spacer,
		Image,
		truncateToWidth,
	});

	const component = renderer(
		{
			content: [{ type: "image", data: pngBase64, mimeType: "image/png" }],
			details: {
				tag: "mermaid",
				processor: "kroki",
				kind: "ok",
				source: "flowchart LR\n  A --> B\n  B --> C",
			},
		},
		{ expanded: false },
		IDENTITY_THEME,
	);

	const terminal = await paintComponent(component);
	return terminal.getWrites();
}

// ---------------------------------------------------------------------------
// HTML page that bootstraps xterm.js + addon-image
// ---------------------------------------------------------------------------

/**
 * Tiny HTML host that opens an xterm.js Terminal with the Image
 * addon, then exposes globals the Playwright driver will call into:
 *
 *   window.__writeBytes(bytesString)   // term.write(string)
 *   window.__waitForRender()           // resolves after the next two RAFs
 *
 * We load xterm.js and addon-image from the installed node_modules
 * copies at file:// URLs (playwright's setContent + addScriptTag
 * reads them off disk). No network, no CDN dependency.
 *
 * Terminal dimensions match the render-layer harness (120 x 60) so
 * the byte stream's implicit layout plays out identically to the
 * fast-suite assertions.
 */
function buildHtml(xtermCssUrl: string): string {
	return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="${xtermCssUrl}" />
    <style>
      html, body { margin: 0; padding: 0; background: #000; }
      #term {
        /* Width and height sized for a 120x60 grid at xterm's default
           monospace metrics. Actual cell dimensions vary per browser
           font stack, so we over-provision; the screenshot clip is
           based on the rendered canvas rect, not this wrapper. */
        width: 1600px;
        height: 1300px;
      }
    </style>
  </head>
  <body>
    <div id="term"></div>
  </body>
</html>`;
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	const repoRootEarly = join(dirname(fileURLToPath(import.meta.url)), "..");
	const fixturePath = join(repoRootEarly, FIXTURE_PNG_RELATIVE);
	const fixturePngBase64 = (await readFile(fixturePath)).toString("base64");
	const bytes = await captureBytes(fixturePngBase64);

	// Resolve the static asset paths we want the browser to load.
	const repoRoot = repoRootEarly;
	const xtermCssPath = join(repoRoot, "node_modules/@xterm/xterm/css/xterm.css");
	const xtermJsPath = join(repoRoot, "node_modules/@xterm/xterm/lib/xterm.js");
	const imageAddonPath = join(
		repoRoot,
		"node_modules/@xterm/addon-image/lib/addon-image.js",
	);

	const outDir = join(repoRoot, "scripts/out");
	await mkdir(outDir, { recursive: true });
	const outPath = join(outDir, "render-image.png");
	const bytesPath = join(outDir, "render-image.bin");

	// Also snapshot the raw bytes alongside the PNG so the invariant
	// 'PNG paints from the same stream the tests assert on' is
	// inspectable out-of-band.
	await writeFile(bytesPath, bytes);

	// Start Chromium. playwright-core auto-finds the browser binary
	// installed under ~/Library/Caches/ms-playwright by
	// `npx playwright install chromium`.
	const browser = await chromium.launch({ headless: true });
	try {
		const context = await browser.newContext({
			viewport: { width: 1600, height: 1300 },
			deviceScaleFactor: 2, // sharper screenshot
		});
		const page = await context.newPage();

		await page.setContent(buildHtml(`file://${xtermCssPath}`));
		await page.addScriptTag({ path: xtermJsPath });
		await page.addScriptTag({ path: imageAddonPath });



		// Instantiate xterm.js + ImageAddon in the page, write our
		// captured bytes, wait for the render to settle.
		await page.evaluate(async (bytesB64: string) => {
			// xterm.js's UMD unpacks its exports onto globals, so
			// `window.Terminal` is the constructor directly.
			// addon-image's UMD differs: `window.ImageAddon` is the module
			// object `{ ImageAddon: <class> }`, so we dereference once more.
			const w = window as unknown as {
				Terminal: new (opts?: unknown) => {
					loadAddon(addon: unknown): void;
					open(el: HTMLElement): void;
					write(data: string, cb?: () => void): void;
					resize(cols: number, rows: number): void;
				};
				ImageAddon: { ImageAddon: new () => unknown };
			};

			const term = new w.Terminal({
				cols: 120,
				rows: 60,
				fontSize: 13,
				fontFamily:
					'Menlo, "DejaVu Sans Mono", "Lucida Console", "Courier New", monospace',
				theme: {
					background: "#000000",
					foreground: "#ffffff",
				},
				allowProposedApi: true,
			});
			const imageAddon = new w.ImageAddon.ImageAddon();
			term.loadAddon(imageAddon);

			const host = document.getElementById("term");
			if (!host) throw new Error("missing #term host element");
			term.open(host);

			// Decode bytes back to a string. We shipped them base64 to
			// keep the JSON-able page.evaluate boundary clean.
			const bin = atob(bytesB64);
			await new Promise<void>((resolve) => {
				term.write(bin, () => resolve());
			});

			// Two rAFs let xterm's render pipeline settle and the
			// image addon's canvases paint.
			await new Promise<void>((r) => requestAnimationFrame(() => r()));
			await new Promise<void>((r) => requestAnimationFrame(() => r()));
			// Extra tick for addon-image async pixel work.
			await new Promise<void>((r) => setTimeout(r, 100));
		}, Buffer.from(bytes, "binary").toString("base64"));

		await page.screenshot({ path: outPath, fullPage: false });
		process.stderr.write(
			`[pi-fence CVx.E2 image spike] wrote ${outPath}\n` +
				`[pi-fence CVx.E2 image spike] captured bytes (stream alongside): ${bytesPath}\n` +
				`[pi-fence CVx.E2 image spike] byte count: ${bytes.length}\n`,
		);
	} finally {
		await browser.close();
	}
}

main().catch((err) => {
	process.stderr.write(`[pi-fence CVx.E2 image spike] error: ${String(err)}\n`);
	if (err instanceof Error && err.stack) process.stderr.write(`${err.stack}\n`);
	process.exit(1);
});
