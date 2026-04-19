/**
 * Unit tests for the pure-math helpers in `renderer.ts` and light
 * composition checks for the renderer factories.
 *
 * The full MessageRenderer that pi pi-tui drives at runtime composes
 * pi-tui Container/Box/Image/Text primitives that aren't trivially
 * testable in isolation. That path is exercised end-to-end in the
 * extension-layer test at `tests/extension/pi-fence.test.ts`.
 *
 * These unit tests cover the bits that are pure: label formatting,
 * source-line clipping for the expanded view, an overflow predicate,
 * and the child composition of the `/fence list` renderer via fake
 * pi-tui primitives.
 */

import { describe, expect, it } from "vitest";

import {
	clipSourceLines,
	createPiFenceListRenderer,
	createPiFenceMessageRenderer,
	formatLabel,
	hasSourceOverflow,
} from "../../extensions/pi-fence/renderer.ts";

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
// createPiFenceListRenderer — composition via fake pi-tui primitives
// ---------------------------------------------------------------------------

/**
 * Minimal spies shaped like the pi-tui primitives the renderer consumes.
 * Each captures its constructor arguments so tests can assert the child
 * composition without loading pi-tui proper.
 */
interface FakeChild {
	kind: "Text" | "Spacer" | "Image";
	text?: string;
	image?: {
		base64: string;
		mimeType: string;
		options?: { maxWidthCells?: number };
	};
}

interface FakeBox {
	children: FakeChild[];
	paddingY: number;
	paddingX: number;
}

function makeTui() {
	class Text {
		readonly kind = "Text" as const;
		constructor(public readonly text: string, _x: number, _y: number) {}
		render(): string[] {
			return [this.text];
		}
	}
	class Spacer {
		readonly kind = "Spacer" as const;
		constructor(public readonly height: number) {}
		render(): string[] {
			return Array.from({ length: this.height }, () => "");
		}
	}
	class Image {
		readonly kind = "Image" as const;
		constructor(
			public readonly base64: string,
			public readonly mimeType: string,
			public readonly imageTheme: { fallbackColor: (s: string) => string },
			public readonly options?: { maxWidthCells?: number },
		) {}
		render(): string[] {
			return [`<image:${this.mimeType}:${this.base64.length}b>`];
		}
	}
	class Box {
		readonly children: FakeChild[] = [];
		constructor(
			public readonly paddingX: number,
			public readonly paddingY: number,
			_bg?: (text: string) => string,
		) {}
		addChild(child: Text | Spacer | Image): void {
			if (child instanceof Text) {
				this.children.push({ kind: "Text", text: child.text });
			} else if (child instanceof Image) {
				this.children.push({
					kind: "Image",
					image: {
						base64: child.base64,
						mimeType: child.mimeType,
						options: child.options,
					},
				});
			} else {
				this.children.push({ kind: "Spacer" });
			}
		}
		render(): string[] {
			return this.children.flatMap((c) =>
				c.kind === "Text" ? [c.text ?? ""] : [""],
			);
		}
	}
	return {
		Box: Box as never,
		Text: Text as never,
		Spacer: Spacer as never,
		Image: Image as never,
		truncateToWidth: (text: string, _width: number) => text,
	};
}

const FAKE_THEME = {
	fg: (_color: string, text: string) => text,
	bold: (text: string) => text,
	bg: (_color: string, text: string) => text,
};

describe("createPiFenceListRenderer", () => {
	it("composes a header, a spacer, and one Text child per formatted line", () => {
		const tui = makeTui();
		const renderer = createPiFenceListRenderer(tui);

		const box = renderer(
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
			FAKE_THEME,
		) as unknown as FakeBox;

		const kinds = box.children.map((c) => c.kind);
		expect(kinds).toEqual(["Text", "Spacer", "Text", "Text"]);

		const texts = box.children
			.filter((c): c is FakeChild & { kind: "Text"; text: string } => c.kind === "Text")
			.map((c) => c.text);
		expect(texts[0]).toContain("Processors");
		expect(texts.slice(1)).toEqual([
			"kroki [registered] — mermaid",
			"graphviz-local [registered] — graphviz (dot)",
		]);
	});

	it("renders identically whether expanded or collapsed (no hidden detail in S3)", () => {
		const render = (expanded: boolean) => {
			const tui = makeTui();
			const renderer = createPiFenceListRenderer(tui);
			const box = renderer(
				{ content: [], details: { lines: ["kroki [registered] — mermaid"] } },
				{ expanded },
				FAKE_THEME,
			) as unknown as FakeBox;
			return box.children;
		};

		expect(render(true)).toEqual(render(false));
	});

	it("falls back to the empty-listing line when details.lines is missing", () => {
		const tui = makeTui();
		const renderer = createPiFenceListRenderer(tui);

		const box = renderer(
			{ content: [], details: undefined },
			{ expanded: false },
			FAKE_THEME,
		) as unknown as FakeBox;

		const texts = box.children
			.filter((c): c is FakeChild & { kind: "Text"; text: string } => c.kind === "Text")
			.map((c) => c.text);
		expect(texts).toEqual(["Processors", "(no processors registered)"]);
	});
});

// ---------------------------------------------------------------------------
// createPiFenceMessageRenderer — composition via fake pi-tui primitives
// ---------------------------------------------------------------------------

describe("createPiFenceMessageRenderer", () => {
	it("composes label, spacer, and an Image child when content carries a PNG", () => {
		const tui = makeTui();
		const renderer = createPiFenceMessageRenderer(tui);

		const box = renderer(
			{
				content: [{ type: "image", data: "ZmFrZS1ieXRlcw==", mimeType: "image/png" }],
				details: {
					tag: "mermaid",
					processor: "kroki",
					kind: "ok",
					source: "flowchart LR\nA --> B",
				},
			},
			{ expanded: false },
			FAKE_THEME,
		) as unknown as FakeBox;

		const kinds = box.children.map((c) => c.kind);
		expect(kinds).toContain("Image");

		const imageChild = box.children.find(
			(c): c is FakeChild & { kind: "Image"; image: { base64: string; mimeType: string } } =>
				c.kind === "Image",
		);
		expect(imageChild?.image.base64).toBe("ZmFrZS1ieXRlcw==");
		expect(imageChild?.image.mimeType).toBe("image/png");

		// Inline image width stays within pi's tool-output convention (60 cells)
		// so the rendered diagram doesn't swallow the full terminal width.
		expect(imageChild?.image.options?.maxWidthCells).toBe(60);

		// Box uses paddingY=0 so the image's partial bottom row lands flush
		// against the box bottom edge (the "strange stripe" goes away
		// because there is no separate bottom-padding row behind it).
		// paddingX stays at 1 for horizontal breathing room. Note: pi-tui's
		// Box constructor is `(paddingX, paddingY, bgFn)` — X first.
		expect(box.paddingX).toBe(1);
		expect(box.paddingY).toBe(0);

		// The chrome label already names the tag/processor; no duplicate
		// "Rendered ... via ..." text child should appear.
		const textChildren = box.children
			.filter((c): c is FakeChild & { kind: "Text"; text: string } => c.kind === "Text")
			.map((c) => c.text);
		expect(textChildren.filter((t) => t.includes("Rendered mermaid via kroki"))).toHaveLength(1);
	});

	it("renders without an Image child on the error path (no image content)", () => {
		const tui = makeTui();
		const renderer = createPiFenceMessageRenderer(tui);

		const box = renderer(
			{
				content: [{ type: "text", text: "Error rendering mermaid via kroki: syntax" }],
				details: {
					tag: "mermaid",
					processor: "kroki",
					kind: "error",
					source: "bad",
				},
			},
			{ expanded: false },
			FAKE_THEME,
		) as unknown as FakeBox;

		expect(box.children.filter((c) => c.kind === "Image")).toHaveLength(0);
		const texts = box.children
			.filter((c): c is FakeChild & { kind: "Text"; text: string } => c.kind === "Text")
			.map((c) => c.text);
		// Label + the error text content item both surface.
		expect(texts.some((t) => t.includes("Error rendering mermaid via kroki"))).toBe(true);
		expect(texts.some((t) => t.includes("syntax"))).toBe(true);
	});
});
