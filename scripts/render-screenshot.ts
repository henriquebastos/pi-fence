/**
 * CVx.E2 spike — paint one pi-fence scenario into the current terminal.
 *
 * Goal of this script (and the spike it belongs to):
 *
 *   Prove that the byte stream the render-layer tests assert on
 *   (`tests/unit/renderer.test.ts` + `tests/extension/pi-fence.test.ts`,
 *   via `LoggingVirtualTerminal.getWrites()`) reproduces faithfully in
 *   a real Kitty-graphics-capable terminal. If the tests pass and this
 *   script shows a broken image, we have a capture bug. If both the
 *   tests pass and this shows the expected render, we have end-to-end
 *   confidence that our assertions track reality.
 *
 * Scope of the spike:
 *
 *   - ONE hardcoded scenario. Multi-scenario × theme × width galleries
 *     are CVx.E2.S2 territory; this spike is "can we paint anything at
 *     all through this path."
 *   - ONE fixture — the same tiny synthetic PNG the render-layer unit
 *     tests use. No Kroki fetch, no network. A future iteration can
 *     swap in a real fixture per the scenario.
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
 * The `--silent` flag suppresses pnpm's own "> pi-fence@... render:spike"
 * preamble so the first bytes on stdout are pi-tui's, not pnpm's. Without
 * it the script still works (the preamble is a text line above the
 * rendered panel) but the stdout capture is noisier.
 *
 * Expected: you see the pi-fence:output chrome (label + image panel) in
 * the terminal, then a prompt on stderr. Screenshot the visible region,
 * then press Enter to exit.
 *
 * Non-Kitty terminal (iTerm2 without Kitty graphics, tmux, plain
 * xterm): you see the chrome and pi-tui's Unicode-block fallback for
 * the image. Still useful to confirm text layout and error paths even
 * without Kitty graphics.
 */

import { Box, Image, Spacer, Text, setCapabilities, truncateToWidth } from "@mariozechner/pi-tui";

import { createPiFenceMessageRenderer } from "../extensions/pi-fence/renderer.ts";
import { paintComponent } from "../tests/utilities/render.ts";

// ---------------------------------------------------------------------------
// Scenario definition
// ---------------------------------------------------------------------------

/**
 * A minimal 1x1 PNG (magic + IHDR with valid dimensions). pi-tui's
 * `getImageDimensions()` parses it; the Kitty encoder emits a real
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
	// the APC sequences will pass through as invisible bytes and the
	// Unicode-block fallback will not render \u2014 the script is intended
	// to be run inside a Kitty-capable terminal. For deterministic
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
	// the exact byte stream the fast suite asserts on. That\u2019s the
	// whole point of the spike \u2014 prove the test assertions track
	// what a real terminal renders.
	const terminal = await paintComponent(component);

	// Emit a short preamble OUTSIDE the captured bytes so the user
	// knows what they\u2019re looking at. The preamble goes to stderr so
	// it doesn\u2019t interleave with the captured stream on stdout.
	process.stderr.write(
		"\n[pi-fence CVx.E2 spike] painting one canned scenario:\n" +
			"  details.tag        = mermaid\n" +
			"  details.processor  = kroki\n" +
			"  details.kind       = ok\n" +
			"  content[0].type    = image (tiny synthetic PNG)\n" +
			"\nstdout bytes below are the pi-tui LoggingVirtualTerminal capture\n" +
			"\u2014 identical to what the unit + extension tests assert on.\n\n",
	);

	// Actual paint: write the captured byte stream to stdout. In a
	// Kitty-capable terminal this renders the image inline at the
	// current cursor position.
	process.stdout.write(terminal.getWrites());

	// Separator + prompt. After the emitted bytes, the terminal cursor
	// sits below the rendered component (pi-tui moves it there with
	// `\\x1b[1B` at the tail of each render cycle). A newline gives a
	// gap, then the prompt on stderr.
	process.stdout.write("\n");
	process.stderr.write("Screenshot now. Press Enter to exit.\n");

	// Keep the process alive until the user confirms. Read one line
	// from stdin, then exit.
	await new Promise<void>((resolve) => {
		process.stdin.once("data", () => resolve());
		process.stdin.resume();
	});
}

main().catch((err) => {
	process.stderr.write(`[pi-fence CVx.E2 spike] error: ${String(err)}\n`);
	process.exit(1);
});
