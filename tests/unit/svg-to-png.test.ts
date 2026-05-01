import { describe, expect, it } from "vitest";

import { DEFAULT_SVG_RASTER_INPUT_MAX_BYTES, svgToPng } from "../../extensions/pi-fence/svg-to-png.ts";

describe("svgToPng", () => {
	it("rejects oversized SVG input before rasterization", async () => {
		const oversizedSvg = `<svg>${"x".repeat(DEFAULT_SVG_RASTER_INPUT_MAX_BYTES + 1)}</svg>`;

		await expect(svgToPng(oversizedSvg)).rejects.toThrow("SVG input is too large");
	});
});
