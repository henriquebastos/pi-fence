/**
 * qr processor — renders `qr` fenced blocks as QR code PNG images.
 * The block content is the text to encode. Output is a standard PNG
 * via the `qrcode` npm package.
 *
 * Landing with CV3.E2.S1. Always available (bundled dependency).
 */

import QRCode from "qrcode";
import type { Availability, FenceProcessor, FenceResult } from "./processor.ts";

export function createQrProcessor(): FenceProcessor {
	return {
		id: "qr",
		tags: ["qr"],
		aliases: {},

		async available(): Promise<Availability> {
			return { ok: true };
		},

		async render(tag, source, signal): Promise<FenceResult> {
			if (signal?.aborted) {
				return { ok: false, error: "Aborted before render" };
			}

			const trimmed = source.trim();
			if (trimmed.length === 0) {
				return { ok: false, error: `${tag}: empty input` };
			}

			try {
				const png = await QRCode.toBuffer(trimmed, {
					type: "png",
					margin: 2,
					color: {
						dark: "#000000",
						light: "#ffffff",
					},
				});
				return { ok: true, png };
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				return { ok: false, error: message };
			}
		},
	};
}
