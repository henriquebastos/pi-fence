/**
 * CVx.E2 spike -- paint one pi-fence scenario into the current terminal.
 *
 * Goal of this script (and the spike it belongs to):
 *
 *   Prove that the byte stream the render-layer tests assert on
 *   (tests/unit/renderer.test.ts + tests/extension/pi-fence.test.ts,
 *   via LoggingVirtualTerminal.getWrites()) reproduces faithfully in
 *   a real Kitty-graphics-capable terminal. If the tests pass and
 *   this script shows a broken image, we have a capture bug. If both
 *   the tests pass and this shows the expected render, we have
 *   end-to-end confidence that our assertions track reality.
 *
 * Scope of the spike:
 *
 *   - ONE hardcoded scenario. Multi-scenario x theme x width galleries
 *     are CVx.E2.S2 territory; this spike is "can we paint anything
 *     at all through this path."
 *   - ONE fixture -- the same tiny synthetic PNG the render-layer
 *     unit tests use. No Kroki fetch, no network. A future iteration
 *     can swap in a real fixture per the scenario.
 *   - NO automated screenshot. Run the script inside a real
 *     Kitty/Ghostty window, screenshot manually, inspect. Automating
 *     that loop (spawn Kitty, capture on sentinel, write PNG) is
 *     CVx.E2.S1/S3 scope.
 *
 * How to run:
 *
 *   # Inside a Kitty-graphics-capable terminal (Kitty, Ghostty, WezTerm):
 *   pnpm --silent render:spike
 *
 * The --silent flag suppresses pnpm's own preamble so the first
 * bytes on stdout are pi-tui's, not pnpm's. Without it the script
 * still renders correctly; the preamble is just a text line above
 * the rendered panel.
 *
 * Expected behavior:
 *
 *   1. A brief prompt appears on stderr: "screenshot the rendered
 *      panel below, then press Enter to exit."
 *   2. The pi-fence:output panel paints below the prompt (label +
 *      image). Inside a Kitty-capable terminal the image renders
 *      inline; elsewhere you see pi-tui's Unicode-block fallback.
 *   3. The script waits for you to press Enter, then exits cleanly.
 *
 * Why prompt-before-paint (not after): pi-tui's paint owns the
 * terminal cursor. Image emits `\x1b[29A` to anchor the image
 * sequence at the top of its bounding box; the paint's closing
 * bytes leave the cursor INSIDE that bounding box. Anything written
 * to stdout/stderr after the paint overwrites the image content.
 * Keeping the paint as the last thing on screen preserves the
 * rendered image intact.
 *
 * Why readline (not `process.stdin.once('data', ...)`): the paint
 * includes `\x1b[16t`, a cursor-cell-size query; the terminal
 * replies on stdin with something like `\x1b[6;34;17t` independent
 * of any user keypress. A raw `data` listener fires on that reply
 * and exits the script before the user can screenshot. readline
 * accumulates bytes until a newline, so the terminal reply is
 * absorbed as "part of the line being edited" and discarded when
 * Enter submits the line.
 */

import { createInterface } from "node:readline";

import { Box, Image, Spacer, Text, setCapabilities, truncateToWidth } from "@mariozechner/pi-tui";

import { createPiFenceMessageRenderer } from "../extensions/pi-fence/renderer.ts";
import { paintComponent } from "../tests/utilities/render.ts";

// ---------------------------------------------------------------------------
// Scenario definition
// ---------------------------------------------------------------------------

/**
 * A minimal 1x1 PNG (magic + IHDR with valid dimensions). pi-tui's
 * getImageDimensions() parses it; the Kitty encoder emits a real
 * graphics protocol sequence around the base64 payload. Same fixture
 * shape the fast suite uses, for byte-stream parity.
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

const IDENTITY_THEME = {
	fg: (_color: string, text: string) => text,
	bold: (text: string) => text,
	bg: (_color: string, text: string) => text,
};

// ---------------------------------------------------------------------------
// Paint
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	// Pin capabilities so the Kitty graphics path emits even under
	// environments where detection might return something different.
	// In a terminal that does not actually understand Kitty graphics,
	// the APC sequences pass through as invisible bytes and the
	// Unicode-block fallback does not render -- the script is
	// intended for a Kitty-capable terminal. For deterministic
	// byte-stream parity with the tests, we pin.
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

	// Paint through a LoggingVirtualTerminal so the bytes we emit are
	// the exact byte stream the fast suite asserts on. That is the
	// whole point of the spike -- prove the test assertions track
	// what a real terminal renders.
	const terminal = await paintComponent(component);

	// Prompt BEFORE the paint (see module doc comment for why).
	process.stderr.write(
		"[pi-fence CVx.E2 spike] canned scenario: mermaid / kroki / ok (synthetic PNG).\n" +
			"Screenshot the rendered panel below, then press Enter to exit.\n\n",
	);

	// Actual paint: write the captured byte stream to stdout. In a
	// Kitty-capable terminal this renders the image inline at the
	// current cursor position.
	process.stdout.write(terminal.getWrites());

	// Wait for Enter via readline (see module doc for why readline
	// and not process.stdin.once('data', ...)).
	const rl = createInterface({ input: process.stdin });
	await new Promise<void>((resolve) => {
		rl.once("line", () => resolve());
	});
	rl.close();
}

main().catch((err) => {
	process.stderr.write(`[pi-fence CVx.E2 spike] error: ${String(err)}\n`);
	process.exit(1);
});
