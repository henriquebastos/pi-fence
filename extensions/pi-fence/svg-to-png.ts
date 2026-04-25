/**
 * SVG→PNG rasterization via @resvg/resvg-js.
 *
 * Lazy-loaded: the native binary (~3.5 MB) is imported only on first call,
 * not at extension startup. This keeps the startup cost zero when no
 * SVG-only Kroki tag is rendered in a session.
 */

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
	const Resvg = await loadResvg();
	const input = Buffer.isBuffer(svg) ? svg.toString("utf8") : svg;
	const resvg = new Resvg(input, { fitTo: { mode: "width", value: widthPx } });
	return Buffer.from(resvg.render().asPng());
}
