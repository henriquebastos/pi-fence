/**
 * Unit tests for `color.ts` — the color/palette swatch processor.
 *
 * Covers: metadata, available(), hex/rgb/named color parsing, swatch
 * rendering, mixed content, abort, errors.
 */

import { describe, expect, it } from "vitest";

import { createColorProcessor } from "../../extensions/pi-fence/color.ts";

const ESC = "\x1b[";
const SWATCH_CHAR = "█";

describe("color processor — metadata", () => {
	it("has id 'color-embedded'", () => {
		expect(createColorProcessor().id).toBe("color-embedded");
	});

	it("declares embedded placement", () => {
		expect(createColorProcessor().placement).toBe("embedded");
	});

	it("handles color and palette tags", () => {
		expect(createColorProcessor().tags).toEqual(["color", "palette"]);
	});

	it("has no aliases", () => {
		expect(createColorProcessor().aliases).toEqual({});
	});
});

describe("color processor — available()", () => {
	it("always returns ok:true", async () => {
		expect(await createColorProcessor().available()).toEqual({ ok: true });
	});
});

describe("color processor — hex colors", () => {
	it("renders a #RRGGBB hex color as a swatch", async () => {
		const result = await createColorProcessor().render("color", "#ff5733");

		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain(ESC);
		expect(result.text).toContain(SWATCH_CHAR);
		expect(result.text).toContain("#ff5733");
	});

	it("renders a #RGB shorthand hex color", async () => {
		const result = await createColorProcessor().render("color", "#f00");

		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain(SWATCH_CHAR);
		expect(result.text).toContain("#f00");
	});

	it("renders a #RRGGBBAA hex color (alpha ignored)", async () => {
		const result = await createColorProcessor().render("color", "#ff573380");

		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain(SWATCH_CHAR);
	});

	it("maps hex channels to exact ANSI truecolor values", async () => {
		const result = await createColorProcessor().render("color", "#123456");

		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain("\x1b[38;2;18;52;86m");
	});

	it("expands shorthand hex channels before rendering", async () => {
		const result = await createColorProcessor().render("color", "#0f8");

		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain("\x1b[38;2;0;255;136m");
	});
});

describe("color processor — rgb() colors", () => {
	it("renders rgb(r, g, b)", async () => {
		const result = await createColorProcessor().render("color", "rgb(255, 87, 51)");

		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain(SWATCH_CHAR);
		expect(result.text).toContain("rgb(255, 87, 51)");
	});

	it("renders rgba(r, g, b, a)", async () => {
		const result = await createColorProcessor().render("color", "rgba(255, 87, 51, 0.5)");

		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain(SWATCH_CHAR);
	});

	it("clamps rgb() channels before rendering", async () => {
		const result = await createColorProcessor().render("color", "rgb(300, 12, 0)");

		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain("\x1b[38;2;255;12;0m");
	});
});

describe("color processor — named colors", () => {
	it("renders a named CSS color", async () => {
		const result = await createColorProcessor().render("color", "red");

		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain(SWATCH_CHAR);
		expect(result.text).toContain("red");
	});

	it("renders named colors case-insensitively", async () => {
		const result = await createColorProcessor().render("color", "DarkBlue");

		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain(SWATCH_CHAR);
	});
});

describe("color processor — palette (multiple colors)", () => {
	it("renders multiple colors, one per line", async () => {
		const result = await createColorProcessor().render(
			"palette",
			"#ff0000\n#00ff00\n#0000ff",
		);

		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		const lines = result.text.split("\n");
		// At least 3 swatch lines.
		const swatchLines = lines.filter((l) => l.includes(SWATCH_CHAR));
		expect(swatchLines.length).toBe(3);
	});

	it("passes non-color lines through as-is", async () => {
		const result = await createColorProcessor().render(
			"palette",
			"Primary:\n#ff0000\n\nSecondary:\n#0000ff",
		);

		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain("Primary:");
		expect(result.text).toContain("Secondary:");
	});

	it("handles a color with trailing label text", async () => {
		const result = await createColorProcessor().render(
			"color",
			"#ff5733 Brand Orange",
		);

		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain("Brand Orange");
		expect(result.text).toContain(SWATCH_CHAR);
	});
});

describe("color processor — errors and abort", () => {
	it("returns error for empty input", async () => {
		const result = await createColorProcessor().render("color", "");
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("empty");
	});

	it("returns error when no valid colors found", async () => {
		const result = await createColorProcessor().render("color", "just some text\nno colors here");
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("no valid color");
	});

	it("returns ok:false for a pre-aborted signal", async () => {
		const controller = new AbortController();
		controller.abort();
		const result = await createColorProcessor().render("color", "#ff0000", controller.signal);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("Aborted");
	});
});
