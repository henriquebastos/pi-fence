/**
 * Unit tests for `qr.ts` — the QR code image processor.
 *
 * Covers: metadata, available(), render happy/error/abort paths.
 * Happy-path assertions check PNG magic bytes in the output buffer.
 */

import { describe, expect, it } from "vitest";

import { createQrProcessor } from "../../extensions/pi-fence/qr.ts";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("qr processor — metadata", () => {
	it("has id 'qr-embedded'", () => {
		expect(createQrProcessor().id).toBe("qr-embedded");
	});

	it("declares embedded placement", () => {
		expect(createQrProcessor().placement).toBe("embedded");
	});

	it("handles qr tag", () => {
		expect(createQrProcessor().tags).toEqual(["qr"]);
	});

	it("has no aliases", () => {
		expect(createQrProcessor().aliases).toEqual({});
	});
});

describe("qr processor — available()", () => {
	it("always returns ok:true", async () => {
		expect(await createQrProcessor().available()).toEqual({ ok: true });
	});
});

describe("qr processor — render", () => {
	it("renders text as a PNG QR code", async () => {
		const processor = createQrProcessor();
		const result = await processor.render("qr", "https://example.com");

		expect(result.kind).toBe("image");
		if (result.kind !== "image") return;

		// Output is a valid PNG.
		expect(result.data.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)).toBe(true);
		// Non-trivial size (a QR code for a URL is at least a few hundred bytes).
		expect(result.data.length).toBeGreaterThan(100);
	});

	it("renders a short string", async () => {
		const processor = createQrProcessor();
		const result = await processor.render("qr", "hello");

		expect(result.kind).toBe("image");
		if (result.kind !== "image") return;
		expect(result.data.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)).toBe(true);
	});

	it("renders a multi-line string", async () => {
		const processor = createQrProcessor();
		const result = await processor.render("qr", "line1\nline2\nline3");

		expect(result.kind).toBe("image");
		if (result.kind !== "image") return;
		expect(result.data.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)).toBe(true);
	});

	it("returns error for empty input", async () => {
		const processor = createQrProcessor();
		const result = await processor.render("qr", "");

		expect(result.kind).toBe("error");
		if (result.kind === "error") expect(result.error).toContain("empty");
	});

	it("returns error for whitespace-only input", async () => {
		const processor = createQrProcessor();
		const result = await processor.render("qr", "   \n\n  ");

		expect(result.kind).toBe("error");
	});

	it("returns ok:false for a pre-aborted signal", async () => {
		const processor = createQrProcessor();
		const controller = new AbortController();
		controller.abort();
		const result = await processor.render("qr", "test", controller.signal);

		expect(result.kind).toBe("error");
		if (result.kind === "error") expect(result.error).toContain("Aborted");
	});
});
