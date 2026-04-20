/**
 * Self-test for the vendored `VirtualTerminal` and the `LoggingVirtualTerminal`
 * subclass. Confirms the pieces pi-fence's render-layer tests lean on behave
 * the way upstream pi-tui's tests assume they behave.
 *
 * We don't re-test xterm.js itself — the assertions are scoped to the
 * contract pi-fence's render layer depends on:
 *   - `write(data)` lands in the viewport after a `flush()`.
 *   - `getViewport()` returns `rows` strings (one per visible row).
 *   - `LoggingVirtualTerminal.getWrites()` captures every byte that went
 *     through `write(data)`, in order.
 *   - `clearWrites()` empties the capture without touching the viewport.
 */

import { describe, expect, it } from "vitest";

import { LoggingVirtualTerminal, VirtualTerminal } from "../utilities/virtual-terminal.ts";

describe("VirtualTerminal", () => {
	it("reflects plain-text writes in the viewport after flush()", async () => {
		const terminal = new VirtualTerminal(40, 6);
		terminal.write("hello pi-fence");
		await terminal.flush();

		const viewport = terminal.getViewport();
		expect(viewport).toHaveLength(6);
		expect(viewport[0]).toContain("hello pi-fence");
	});

	it("honors the configured column and row dimensions", async () => {
		const terminal = new VirtualTerminal(20, 4);
		terminal.write("wider-than-two-columns-on-purpose-should-wrap");
		await terminal.flush();

		const viewport = terminal.getViewport();
		expect(viewport).toHaveLength(4);
		expect(terminal.columns).toBe(20);
		expect(terminal.rows).toBe(4);
	});
});

describe("LoggingVirtualTerminal", () => {
	it("captures every write in getWrites(), in order", async () => {
		const terminal = new LoggingVirtualTerminal(40, 4);
		terminal.write("first ");
		terminal.write("second ");
		terminal.write("third");
		await terminal.flush();

		expect(terminal.getWrites()).toBe("first second third");
		// Still mirrors to the underlying xterm so viewport assertions stay live.
		expect(terminal.getViewport()[0]).toContain("first second third");
	});

	it("captures non-printable escape sequences byte-for-byte", async () => {
		const terminal = new LoggingVirtualTerminal(40, 4);
		// Mimic a Kitty graphics sequence shape. We don't care whether xterm
		// *renders* it — we care that the capture faithfully preserves the
		// bytes pi-tui would emit.
		const kittyLike = "\x1b_Ga=T,f=100,m=1;payload\x1b\\";
		terminal.write(kittyLike);
		await terminal.flush();

		expect(terminal.getWrites()).toBe(kittyLike);
	});

	it("clearWrites() empties the capture without disturbing the viewport", async () => {
		const terminal = new LoggingVirtualTerminal(40, 4);
		terminal.write("visible text");
		await terminal.flush();

		expect(terminal.getWrites()).toBe("visible text");
		terminal.clearWrites();
		expect(terminal.getWrites()).toBe("");
		// The viewport keeps what was painted before the capture reset.
		expect(terminal.getViewport()[0]).toContain("visible text");
	});
});
