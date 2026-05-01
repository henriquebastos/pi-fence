import { describe, expect, it } from "vitest";

import {
	DEFAULT_SVG_RASTER_INPUT_MAX_BYTES,
	DEFAULT_SVG_RASTER_MAX_DIMENSION_PX,
	DEFAULT_SVG_RASTER_MAX_PIXELS,
	svgToPng,
} from "../../extensions/pi-fence/svg-to-png.ts";

describe("svgToPng", () => {
	it("rejects oversized SVG input before rasterization", async () => {
		const oversizedSvg = `<svg>${"x".repeat(DEFAULT_SVG_RASTER_INPUT_MAX_BYTES + 1)}</svg>`;

		await expect(svgToPng(oversizedSvg)).rejects.toThrow("SVG input is too large");
	});

	it("rejects oversized SVG dimensions before rasterization", async () => {
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${DEFAULT_SVG_RASTER_MAX_DIMENSION_PX + 1}" height="10"></svg>`;

		await expect(svgToPng(svg)).rejects.toThrow("SVG width is too large");
	});

	it("rejects oversized SVG pixel area before rasterization", async () => {
		const side = Math.floor(Math.sqrt(DEFAULT_SVG_RASTER_MAX_PIXELS)) + 1;
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}"></svg>`;

		await expect(svgToPng(svg)).rejects.toThrow("SVG dimensions are too large");
	});
});
