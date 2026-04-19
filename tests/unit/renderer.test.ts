/**
 * Unit tests for the pure-math helpers in `renderer.ts`.
 *
 * The full MessageRenderer that pi pi-tui drives at runtime composes
 * pi-tui Container/Box/Image/Text primitives that aren't trivially
 * testable in isolation. That path is exercised end-to-end in the
 * extension-layer test at `tests/extension/pi-fence.test.ts`.
 *
 * These unit tests cover the bits that are pure: label formatting,
 * source-line clipping for the expanded view, and an overflow predicate.
 */

import { describe, expect, it } from "vitest";

import { clipSourceLines, formatLabel, hasSourceOverflow } from "../../extensions/pi-fence/renderer.ts";

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
