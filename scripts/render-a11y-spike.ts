/**
 * CVx.E2 spike #2 -- verify pi-tui output without a real terminal.
 *
 * The live-terminal spike (`scripts/render-screenshot.ts`) revealed the
 * hard problem with the "paint into Ghostty + screencapture" loop: the
 * byte stream pi-tui emits assumes it owns the terminal viewport
 * (cursor-cell-size query on stdin, `\x1b[29A` movements, synchronized
 * update mode), so driving it as shell output from a standalone script
 * is brittle. Stdin races, cursor positioning overlaps the shell
 * prompt, and the cost-to-value ratio is bad.
 *
 * This spike tries a different path: feed the same byte stream into
 * wterm (Vercel Labs' DOM-rendering web terminal emulator) inside
 * jsdom, then read the rendered DOM directly to assert on what a real
 * terminal would show. No real browser, no Chromium download, no
 * screencapture.
 *
 * Why wterm: it's a full VT100/VT220/xterm parser (Zig + WASM core)
 * that renders to the DOM as `<div class="term-row"><span>...</span>`.
 * The accessibility-tree description it ships as a selling point
 * (published at https://wterm.dev and github.com/vercel-labs/wterm)
 * translates here into "the terminal's textual content is just DOM
 * text content, readable without a screen reader or a11y library."
 *
 * Why jsdom (not Playwright/Chromium): wterm's own test suite uses
 * jsdom (see packages/@wterm/dom/vitest.config.ts upstream). The
 * ResizeObserver + requestAnimationFrame shims in their setup.ts port
 * directly. jsdom is a ~10MB Node module; Chromium would add ~150MB
 * of download weight for a spike. If CVx.E2's eventual story decides
 * the a11y tree is the right oracle and wants a real browser too,
 * the port from jsdom to Playwright is one page.goto + one
 * page.accessibility.snapshot call.
 *
 * What this spike proves (or fails to prove):
 *
 *   1. Our pi-tui byte stream parses in a real terminal emulator.
 *      The "Rendered mermaid via kroki" label should appear in the
 *      rendered DOM. If it doesn't, our capture has a bug.
 *   2. Kitty graphics are an unhandled sequence family for wterm
 *      (VT100/xterm only). `bridge.getUnhandledSequences()` will show
 *      the `\x1b_G` APC as unrecognized. That's expected -- we just
 *      want to see the list to confirm wterm is diagnosing the gap.
 *   3. The DOM is readable as an automation-friendly assertion
 *      target: `.term-row` children, each with textContent.
 *
 * What this spike does NOT do:
 *
 *   - Verify image rendering. Kitty graphics pass through unhandled;
 *     wterm shows text around where an image would be. An image
 *     render verifier needs either a wterm fork with Kitty support or
 *     a real browser + screenshot.
 *   - Run headless against a real Chromium. See "Why jsdom" above.
 *   - Auto-screenshot the result. The spike writes a JSON report
 *     to stdout; future work can turn it into a gallery.
 *
 * Run:
 *
 *   pnpm --silent render:a11y-spike
 *
 * Output: JSON on stdout with the terminal's rendered rows, cursor
 * position, scrollback count, and any unhandled escape sequences.
 */

import { JSDOM } from "jsdom";

import { Box, Image, Spacer, Text, setCapabilities, truncateToWidth } from "@mariozechner/pi-tui";

import { createPiFenceMessageRenderer } from "../extensions/pi-fence/renderer.ts";
import { paintComponent } from "../tests/utilities/render.ts";

// ---------------------------------------------------------------------------
// jsdom globals -- lifted from @wterm/dom/src/__tests__/setup.ts upstream
// ---------------------------------------------------------------------------

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
	url: "http://wterm-spike.localhost/",
	pretendToBeVisual: true,
});

// Promote jsdom's window bindings onto globalThis so @wterm/dom can do
// `document.createElement(...)` etc. without a `window.` prefix.
//
// Node 22+ exposes `navigator` as a read-only global, so we skip it
// here (wterm doesn't read it). Same reason window itself is not
// assigned on modern Node: skipping the assignment lets the native
// globals stand, and we only add what jsdom is authoritative for.
const g = globalThis as unknown as Record<string, unknown>;
if (typeof g.document === "undefined") g.document = dom.window.document;
if (typeof g.HTMLElement === "undefined") g.HTMLElement = dom.window.HTMLElement;
if (typeof g.Node === "undefined") g.Node = dom.window.Node;
if (typeof g.Element === "undefined") g.Element = dom.window.Element;
if (typeof g.DocumentFragment === "undefined") {
	g.DocumentFragment = dom.window.DocumentFragment;
}
if (typeof g.getComputedStyle === "undefined") {
	g.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
}
// `window` is sometimes read directly by DOM helpers. If the host
// runtime doesn't already provide it, point it at jsdom's.
if (typeof g.window === "undefined") g.window = dom.window;

// ResizeObserver isn't in jsdom; wterm's autoResize path uses it.
// Stub so `new ResizeObserver(...)` doesn't throw. We disable
// autoResize on the WTerm instance anyway, so observe() is never
// called, but the class reference must exist.
if (typeof g.ResizeObserver === "undefined") {
	g.ResizeObserver = class {
		observe(): void {}
		unobserve(): void {}
		disconnect(): void {}
	};
}

// jsdom's requestAnimationFrame fires asynchronously. That's fine --
// we await a few ticks after write() before reading the DOM.
if (typeof g.requestAnimationFrame === "undefined") {
	g.requestAnimationFrame = (cb: FrameRequestCallback): number => {
		return setTimeout(() => cb(performance.now()), 0) as unknown as number;
	};
	g.cancelAnimationFrame = (id: number): void => {
		clearTimeout(id);
	};
}

// ---------------------------------------------------------------------------
// Scenario capture -- same fixture as render-screenshot.ts
// ---------------------------------------------------------------------------

const TINY_PNG_BASE64 = Buffer.from([
	0x89,
	0x50,
	0x4e,
	0x47,
	0x0d,
	0x0a,
	0x1a,
	0x0a, // PNG magic
	0x00,
	0x00,
	0x00,
	0x0d, // IHDR length
	0x49,
	0x48,
	0x44,
	0x52, // "IHDR"
	0x00,
	0x00,
	0x00,
	0x01, // width 1
	0x00,
	0x00,
	0x00,
	0x01, // height 1
	0x08,
	0x06,
	0x00,
	0x00,
	0x00, // 8-bit RGBA, no interlace
]).toString("base64");

const IDENTITY_THEME = {
	fg: (_color: string, text: string) => text,
	bold: (text: string) => text,
	bg: (_color: string, text: string) => text,
};

async function captureBytes(): Promise<string> {
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
			content: [{ type: "image", data: TINY_PNG_BASE64, mimeType: "image/png" }],
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
// Drive wterm -- import AFTER jsdom globals are in place
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	const bytes = await captureBytes();

	// Dynamic import: module-level code in @wterm/dom reads
	// `document`, so the jsdom globals must be on globalThis first.
	const { WTerm } = (await import("@wterm/dom")) as typeof import("@wterm/dom");

	const host = dom.window.document.createElement("div");
	host.id = "terminal";
	host.setAttribute("role", "textbox");
	host.setAttribute("aria-label", "Terminal");
	host.setAttribute("aria-multiline", "true");
	host.setAttribute("aria-roledescription", "terminal");
	dom.window.document.body.appendChild(host);

	// Dimensions match the fast suite's render-layer harness so the
	// pi-tui byte stream's implicit 120x60 layout plays cleanly.
	const term = new WTerm(host, { cols: 120, rows: 60, autoResize: false });
	await term.init();

	term.write(bytes);

	// Let the scheduled RAF-based render fire. A couple of ticks is
	// plenty under jsdom's setTimeout-backed RAF polyfill.
	await new Promise((r) => setTimeout(r, 20));
	await new Promise((r) => setTimeout(r, 20));

	// Read the rendered DOM. `.term-row` is one per terminal row;
	// textContent on each is the visible text, with all color spans
	// flattened to characters.
	const rows: string[] = [];
	host.querySelectorAll(".term-row").forEach((row) => {
		rows.push((row as HTMLElement).textContent ?? "");
	});

	const cursor = term.bridge?.getCursor() ?? { row: -1, col: -1, visible: false };
	const scrollback = term.bridge?.getScrollbackCount() ?? 0;
	const unhandled = term.bridge?.getUnhandledSequences() ?? [];

	const report = {
		capturedBytes: bytes.length,
		dimensions: { cols: term.cols, rows: term.rows },
		cursor,
		scrollback,
		unhandledSequences: unhandled,
		// Trim trailing whitespace per row for readability; keep order.
		renderedRows: rows.map((r) => r.replace(/\s+$/, "")),
		// Convenience: which rows have any non-whitespace content.
		nonBlankRowIndices: rows
			.map((r, i) => (r.trim() ? i : -1))
			.filter((i) => i >= 0),
	};

	// Human-readable summary on stderr; JSON report on stdout so the
	// script's stdout remains machine-consumable. Redirect stdout to
	// a file for snapshot-style assertions.
	const foundLabel = report.renderedRows.some((r) =>
		r.includes("Rendered mermaid via kroki"),
	);
	process.stderr.write(
		"\n[pi-fence CVx.E2 a11y spike] summary\n" +
			`  captured bytes            : ${report.capturedBytes}\n` +
			`  wterm dimensions          : ${report.dimensions.cols} x ${report.dimensions.rows}\n` +
			`  non-blank row indices     : [${report.nonBlankRowIndices.join(", ")}]\n` +
			`  cursor (row, col)         : (${report.cursor.row}, ${report.cursor.col})\n` +
			`  unhandled seq count       : ${report.unhandledSequences.length}\n` +
			`  'Rendered mermaid via kroki' found in rendered rows: ${foundLabel}\n` +
			"\nfull JSON report on stdout.\n\n",
	);

	process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

	term.destroy();
}

main().catch((err) => {
	process.stderr.write(`[pi-fence CVx.E2 a11y spike] error: ${String(err)}\n`);
	if (err instanceof Error && err.stack) process.stderr.write(`${err.stack}\n`);
	process.exit(1);
});
