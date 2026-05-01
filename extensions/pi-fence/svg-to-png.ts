/**
 * SVG→PNG rasterization via @resvg/resvg-js.
 *
 * Lazy-loaded: the native binary (~3.5 MB) is imported only on first call,
 * not at extension startup. This keeps the startup cost zero when no
 * SVG-only Kroki tag is rendered in a session.
 */

import { DEFAULT_PROCESSOR_OUTPUT_MAX_BYTES, formatByteLimitError } from "./limits.ts";

export const DEFAULT_SVG_RASTER_INPUT_MAX_BYTES = 1_048_576;
export const DEFAULT_SVG_RASTER_MAX_DIMENSION_PX = 8192;
export const DEFAULT_SVG_RASTER_MAX_PIXELS = 16_777_216;

let ResvgClass: typeof import("@resvg/resvg-js").Resvg | undefined;

async function loadResvg(): Promise<typeof import("@resvg/resvg-js").Resvg> {
	if (ResvgClass) return ResvgClass;
	const mod = await import("@resvg/resvg-js");
	ResvgClass = mod.Resvg;
	return ResvgClass;
}

/**
 * Rasterize an SVG string or Buffer to PNG bytes.
 *
 * @param svg - raw SVG content (XML string or Buffer)
 * @param widthPx - target width in pixels (height scales proportionally)
 * @returns PNG bytes as a Buffer
 */
export async function svgToPng(
	svg: string | Buffer,
	widthPx = 800,
): Promise<Buffer> {
	const inputBytes = Buffer.isBuffer(svg) ? svg.length : Buffer.byteLength(svg, "utf8");
	if (inputBytes > DEFAULT_SVG_RASTER_INPUT_MAX_BYTES) {
		throw new Error(formatByteLimitError("SVG input", inputBytes, DEFAULT_SVG_RASTER_INPUT_MAX_BYTES));
	}
	const input = Buffer.isBuffer(svg) ? svg.toString("utf8") : svg;
	assertSvgDimensions(input);
	const Resvg = await loadResvg();
	const resvg = new Resvg(input, { fitTo: { mode: "width", value: widthPx } });
	const png = Buffer.from(resvg.render().asPng());
	if (png.length > DEFAULT_PROCESSOR_OUTPUT_MAX_BYTES) {
		throw new Error(formatByteLimitError("SVG raster output", png.length, DEFAULT_PROCESSOR_OUTPUT_MAX_BYTES));
	}
	return png;
}

function assertSvgDimensions(svg: string): void {
	const openTag = svg.match(/<svg\b[^>]*>/i)?.[0] ?? "";
	const width = numericSvgAttribute(openTag, "width");
	const height = numericSvgAttribute(openTag, "height");
	if (width !== undefined) assertSvgDimension("width", width);
	if (height !== undefined) assertSvgDimension("height", height);
	if (width !== undefined && height !== undefined && width * height > DEFAULT_SVG_RASTER_MAX_PIXELS) {
		throw new Error(`SVG dimensions are too large: ${width * height} pixels exceeds limit of ${DEFAULT_SVG_RASTER_MAX_PIXELS}`);
	}
}

function numericSvgAttribute(openTag: string, name: "width" | "height"): number | undefined {
	const match = openTag.match(new RegExp(`${name}=["']?([0-9]+(?:\\.[0-9]+)?)`, "i"));
	if (!match) return undefined;
	const value = Number.parseFloat(match[1]);
	return Number.isFinite(value) ? value : undefined;
}

function assertSvgDimension(name: string, value: number): void {
	if (value > DEFAULT_SVG_RASTER_MAX_DIMENSION_PX) {
		throw new Error(`SVG ${name} is too large: ${value} px exceeds limit of ${DEFAULT_SVG_RASTER_MAX_DIMENSION_PX}`);
	}
}
