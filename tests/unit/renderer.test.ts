/**
 * Unit + render-layer tests for `renderer.ts`.
 *
 * Two halves:
 *
 *   1. Pure helpers (`formatLabel`, `hasSourceOverflow`, `clipSourceLines`) —
 *      unit-level: direct function calls, no pi-tui.
 *
 *   2. Component factories (`createPiFenceMessageRenderer`,
 *      `createPiFenceListRenderer`) — render-layer: compose the factory's
 *      returned component into a pi-tui `TUI` whose terminal is a
 *      `LoggingVirtualTerminal`, paint, and assert on both the viewport
 *      grid (what the user would see) and the raw write log (what
 *      pi-tui actually emitted to the terminal, including escape
 *      sequences xterm.js doesn't paint into the grid, like the Kitty
 *      graphics protocol).
 *
 * Render-layer tests pin pi-tui's capability cache to a Kitty-full shape
 * via `forceCapabilities()` so the image-protocol path is deterministic.
 * Each case takes the reset disposer in `afterEach` to keep the pin from
 * leaking across cases.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Box, Image, Spacer, Text, truncateToWidth } from "@mariozechner/pi-tui";

import {
	clipSourceLines,
	createPiFenceListRenderer,
	createPiFenceMessageRenderer,
	formatLabel,
	hasSourceOverflow,
} from "../../extensions/pi-fence/renderer.ts";
import { forceCapabilities } from "../utilities/force-capabilities.ts";
import { paintComponent } from "../utilities/render.ts";

// ---------------------------------------------------------------------------
// Pure helpers — unchanged from the pre-render-layer suite
// ---------------------------------------------------------------------------

describe("formatLabel", () => {
	it("describes a successful render by tag and processor", () => {
		expect(formatLabel({ kind: "ok", tag: "mermaid", processor: "kroki" })).toBe(
			"Rendered mermaid via kroki",
		);
	});

	it("describes an error render including the processor", () => {
		expect(formatLabel({ kind: "error", tag: "mermaid", processor: "kroki" })).toBe(
			"Error rendering mermaid via kroki",
		);
	});

	it("is case-faithful to the tag — user saw `Mermaid` if they wrote `Mermaid`", () => {
		// We never normalise the tag here. Normalisation is the parser's
		// concern; the label surfaces exactly what was on the fence.
		expect(formatLabel({ kind: "ok", tag: "PlantUML", processor: "kroki" })).toBe(
			"Rendered PlantUML via kroki",
		);
	});
});

describe("hasSourceOverflow", () => {
	it("returns false when source fits in the preview window", () => {
		expect(hasSourceOverflow("a\nb\nc", 10)).toBe(false);
	});

	it("returns true when source exceeds the preview window", () => {
		const source = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
		expect(hasSourceOverflow(source, 10)).toBe(true);
	});

	it("treats an empty source as non-overflowing", () => {
		expect(hasSourceOverflow("", 10)).toBe(false);
	});

	it("uses the line count, not the character count", () => {
		// A single very long line is not overflow.
		expect(hasSourceOverflow("x".repeat(500), 10)).toBe(false);
	});
});

describe("clipSourceLines", () => {
	it("returns all lines when within the line budget", () => {
		const lines = ["a", "b", "c"];
		expect(clipSourceLines(lines, 10)).toEqual({
			lines: ["a", "b", "c"],
			remaining: 0,
		});
	});

	it("truncates to the budget and reports the remaining count", () => {
		const lines = Array.from({ length: 20 }, (_, i) => `line ${i}`);
		const result = clipSourceLines(lines, 5);
		expect(result.lines).toEqual(["line 0", "line 1", "line 2", "line 3", "line 4"]);
		expect(result.remaining).toBe(15);
	});

	it("handles an empty input", () => {
		expect(clipSourceLines([], 10)).toEqual({ lines: [], remaining: 0 });
	});

	it("handles exact-fit without reporting remaining", () => {
		expect(clipSourceLines(["a", "b", "c"], 3)).toEqual({
			lines: ["a", "b", "c"],
			remaining: 0,
		});
	});

	it("treats budget 0 as 'show no lines, report all as remaining'", () => {
		// Not a pretty case but the math must behave sanely.
		expect(clipSourceLines(["a", "b", "c"], 0)).toEqual({ lines: [], remaining: 3 });
	});
});

// ---------------------------------------------------------------------------
// Render-layer helpers
// ---------------------------------------------------------------------------

/**
 * The minimum pi-tui primitives + helper the renderer factories need.
 * Shared by every render-layer case so the tree we build at test time
 * matches exactly what `createPiFenceExtension` wires in production at
 * `extensions/pi-fence/index.ts`.
 */
const TUI_PRIMITIVES = { Box, Text, Spacer, Image, truncateToWidth } as const;

/**
 * A minimal theme matching the three-method shape the renderer factories
 * consume. Returns text unchanged so viewport assertions can match on
 * plain strings. When a test needs to see the ANSI escapes (e.g. to
 * confirm the label is bolded), it can override with a theme that
 * actually emits codes — but none of today's cases need that.
 */
const IDENTITY_THEME = {
	fg: (_color: string, text: string) => text,
	bold: (text: string) => text,
	bg: (_color: string, text: string) => text,
};

/**
 * A 1x1 fake PNG. Magic + IHDR header with valid dimensions so
 * pi-tui's getImageDimensions() parses it and feeds the Kitty
 * renderer a real cell count. We don't care about the pixel payload;
 * xterm.js ignores the graphics protocol in the viewport grid anyway,
 * and the only assertion that depends on the bytes is the write-log
 * substring check for the `\x1b_G` prefix.
 *
 * Built from a minimal valid-ish PNG rather than using Buffer of
 * random bytes so the Image component's dimension-parse path exercises
 * the same code production hits.
 */
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

// Rendering into a VirtualTerminal is shared with the extension-layer
// test; the harness lives at `tests/utilities/render.ts`.

describe("createPiFenceMessageRenderer — rendered into a VirtualTerminal", () => {
	let resetCaps: () => void;

	beforeEach(() => {
		resetCaps = forceCapabilities();
	});
	afterEach(() => {
		resetCaps();
	});

	it("paints the label and emits a Kitty graphics sequence when content carries a PNG", async () => {
		const renderer = createPiFenceMessageRenderer(TUI_PRIMITIVES);
		const component = renderer(
			{
				content: [{ type: "image", data: TINY_PNG_BASE64, mimeType: "image/png" }],
				details: {
					tag: "mermaid",
					processor: "kroki",
					kind: "ok",
					source: "flowchart LR\nA --> B",
				},
			},
			{ expanded: false },
			IDENTITY_THEME,
		);

		const terminal = await paintComponent(component);

		const viewport = terminal.getViewport();
		expect(viewport.some((line) => line.includes("Rendered mermaid via kroki"))).toBe(
			true,
		);

		// The image is emitted as a Kitty graphics APC sequence
		// (`\x1b_G...\x1b\\`). xterm.js does not paint it into the
		// viewport grid, so the only place to see it is the raw
		// write log.
		expect(terminal.getWrites()).toContain("\x1b_G");
	});

	it("paints label + error text and emits no Kitty graphics on the error path", async () => {
		const renderer = createPiFenceMessageRenderer(TUI_PRIMITIVES);
		const component = renderer(
			{
				content: [
					{
						// Just the raw upstream error body. The renderer composes
						// the `Error rendering <tag> via <processor>` red header
						// from `details` on its own — see extensions/pi-fence/
						// index.ts's buildCustomMessage error branch.
						type: "text",
						text: "syntax",
					},
				],
				details: {
					tag: "mermaid",
					processor: "kroki",
					kind: "error",
					source: "bad",
				},
			},
			{ expanded: false },
			IDENTITY_THEME,
		);

		const terminal = await paintComponent(component);

		const viewport = terminal.getViewport();
		expect(
			viewport.some((line) => line.includes("Error rendering mermaid via kroki")),
		).toBe(true);
		expect(viewport.some((line) => line.includes("syntax"))).toBe(true);

		// No image in this path: no Kitty graphics sequence should land
		// in the write log.
		expect(terminal.getWrites()).not.toContain("\x1b_G");
	});

	it("paints the source fenced block when expanded", async () => {
		const renderer = createPiFenceMessageRenderer(TUI_PRIMITIVES);
		const component = renderer(
			{
				content: [{ type: "image", data: TINY_PNG_BASE64, mimeType: "image/png" }],
				details: {
					tag: "mermaid",
					processor: "kroki",
					kind: "ok",
					source: "flowchart LR\nA --> B\nC --> D",
				},
			},
			{ expanded: true },
			IDENTITY_THEME,
		);

		const terminal = await paintComponent(component);

		const viewport = terminal.getViewport();
		// Opening fence names the tag, every source line appears, and
		// a closing fence bookends the block.
		expect(viewport.some((line) => line.includes("```mermaid"))).toBe(true);
		expect(viewport.some((line) => line.includes("flowchart LR"))).toBe(true);
		expect(viewport.some((line) => line.includes("A --> B"))).toBe(true);
		expect(viewport.some((line) => line.includes("C --> D"))).toBe(true);
		// The closing fence appears on its own line. Guard the match to
		// a trimmed-equality check so the opening `\`\`\`mermaid\` line
		// (which also starts with three backticks) is not a false hit.
		expect(viewport.some((line) => line.trim() === "```")).toBe(true);
	});
});

describe("createPiFenceListRenderer — rendered into a VirtualTerminal", () => {
	let resetCaps: () => void;

	beforeEach(() => {
		resetCaps = forceCapabilities();
	});
	afterEach(() => {
		resetCaps();
	});

	it("paints the Processors header and one line per listing", async () => {
		const renderer = createPiFenceListRenderer(TUI_PRIMITIVES);
		const component = renderer(
			{
				content: [{ type: "text", text: "ignored — renderer uses details.lines" }],
				details: {
					lines: [
						"kroki [registered] — mermaid",
						"graphviz-local [registered] — graphviz (dot)",
					],
				},
			},
			{ expanded: false },
			IDENTITY_THEME,
		);

		const terminal = await paintComponent(component);

		const viewport = terminal.getViewport();
		expect(viewport.some((line) => line.includes("Processors"))).toBe(true);
		expect(
			viewport.some((line) => line.includes("kroki [registered] — mermaid")),
		).toBe(true);
		expect(
			viewport.some((line) =>
				line.includes("graphviz-local [registered] — graphviz (dot)"),
			),
		).toBe(true);
	});

	it("falls back to the empty-listing line when details.lines is missing", async () => {
		const renderer = createPiFenceListRenderer(TUI_PRIMITIVES);
		const component = renderer(
			{ content: [], details: undefined },
			{ expanded: false },
			IDENTITY_THEME,
		);

		const terminal = await paintComponent(component);

		const viewport = terminal.getViewport();
		expect(viewport.some((line) => line.includes("Processors"))).toBe(true);
		expect(
			viewport.some((line) => line.includes("(no processors registered)")),
		).toBe(true);
	});

	it("paints the Bindings section emitted by the formatter (CV0.E2.S2)", async () => {
		// Renderer paints verbatim. If the formatter emits a 'Bindings'
		// header + indented rows, the renderer must land them in the
		// viewport without special-casing.
		const renderer = createPiFenceListRenderer(TUI_PRIMITIVES);
		const component = renderer(
			{
				content: [],
				details: {
					lines: [
						"graphviz-local [registered] — graphviz (dot)",
						"kroki [registered] — mermaid, graphviz (dot)",
						"",
						"Bindings",
						"  graphviz → kroki",
						"",
						"Ignored bindings",
						"  mermaid → nonexistent (unknown processor)",
					],
				},
			},
			{ expanded: false },
			IDENTITY_THEME,
		);

		const terminal = await paintComponent(component);

		const viewport = terminal.getViewport();
		expect(viewport.some((line) => line.includes("Bindings"))).toBe(true);
		expect(viewport.some((line) => line.includes("graphviz → kroki"))).toBe(true);
		expect(viewport.some((line) => line.includes("Ignored bindings"))).toBe(true);
		expect(
			viewport.some((line) => line.includes("mermaid → nonexistent (unknown processor)")),
		).toBe(true);
	});

	it("paints the [unavailable] status bracket and the indented reason line", async () => {
		// CV0.E2.S1 step 6 — the list renderer paints the formatter's
		// output verbatim, so both the header line (with [unavailable]) and
		// the second indented reason/installHint line land in the viewport.
		const renderer = createPiFenceListRenderer(TUI_PRIMITIVES);
		const component = renderer(
			{
				content: [],
				details: {
					lines: [
						"graphviz-local [unavailable] — graphviz (dot)",
						"    dot binary not found on PATH. apt install graphviz",
						"kroki [registered] — mermaid, graphviz (dot)",
					],
				},
			},
			{ expanded: false },
			IDENTITY_THEME,
		);

		const terminal = await paintComponent(component);

		const viewport = terminal.getViewport();
		expect(viewport.some((line) => line.includes("[unavailable]"))).toBe(true);
		expect(
			viewport.some((line) => line.includes("dot binary not found on PATH")),
		).toBe(true);
		expect(viewport.some((line) => line.includes("[registered]"))).toBe(true);
	});
});
