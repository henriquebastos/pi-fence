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
 * Why raw-mode stdin (not readline, not `stdin.once('data', ...)`):
 *
 * The paint includes `\x1b[16t`, a cursor-cell-size query. The
 * terminal replies on stdin with something like `\x1b[6;34;17t`
 * independent of any user keypress. Three earlier attempts tripped
 * on that race:
 *
 *   - `stdin.once('data', ...)` fires on the terminal's reply and
 *     exits the script before the user can screenshot.
 *   - `readline.once('line', ...)` *should* accumulate bytes until
 *     a newline, but in practice under pnpm's stdin forwarding the
 *     script still exits too early -- pnpm appears to close the
 *     child's stdin, giving readline an EOF before the user types
 *     Enter.
 *   - Polling with `setTimeout` is flaky across terminal speeds and
 *     can't be canceled by the user.
 *
 * Raw-mode stdin is the fix: it bypasses line buffering, delivers
 * every byte through a single `data` listener we own, and lets us
 * filter explicitly for Enter (`\r` or `\n`) or Ctrl+C (`\x03`).
 * The terminal's `\x1b[...t` reply arrives as data bytes that do
 * not match those, so it's silently dropped. If stdin is not a
 * TTY (e.g. the script was piped, as in smoke tests), raw mode is
 * unavailable and we fall back to a short grace timeout so the
 * script still exits cleanly.
 */

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

	// Wait for Enter (or Ctrl+C). See module doc comment for why
	// raw-mode stdin.
	await waitForEnterOrCtrlC();
}

/**
 * Wait for the user to press Enter (or Ctrl+C). Uses raw-mode stdin
 * so the terminal's `\x1b[...t` reply to pi-tui's cell-size query
 * cannot masquerade as a keystroke.
 *
 * If stdin is not a TTY (smoke tests, CI, piped invocation), raw
 * mode is unavailable. In that case we drain a short grace window
 * and return, so the script exits cleanly instead of hanging.
 */
async function waitForEnterOrCtrlC(): Promise<void> {
	if (!process.stdin.isTTY) {
		// Non-interactive: give a moment for the paint bytes to flush,
		// then exit. Avoids hanging in CI / piped smoke tests.
		await new Promise((r) => setTimeout(r, 100));
		return;
	}

	process.stdin.setRawMode(true);
	process.stdin.resume();

	return new Promise<void>((resolve) => {
		const onData = (chunk: Buffer): void => {
			for (const byte of chunk) {
				// Enter (CR, LF) or Ctrl+C (ETX).
				if (byte === 0x0d || byte === 0x0a || byte === 0x03) {
					process.stdin.off("data", onData);
					if (process.stdin.isTTY) process.stdin.setRawMode(false);
					process.stdin.pause();
					resolve();
					return;
				}
				// Any other byte (including the terminal's reply to
				// pi-tui's `\x1b[16t` query) is silently dropped.
			}
		};
		process.stdin.on("data", onData);
	});
}

main().catch((err) => {
	process.stderr.write(`[pi-fence CVx.E2 spike] error: ${String(err)}\n`);
	process.exit(1);
});
