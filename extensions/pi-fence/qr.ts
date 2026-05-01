/**
 * qr processor — renders `qr` fenced blocks as QR code PNG images.
 * The block content is the text to encode. Output is a standard PNG
 * via the `qrcode` npm package.
 *
 * Landing with CV3.E2.S1. Always available (bundled dependency).
 */

import QRCode from "qrcode";
import { formatByteLimitError } from "./limits.ts";
import { errorOutput, imageOutput, withRenderGuards, type Availability, type FenceOutput, type FenceProcessor } from "./processor.ts";

export const DEFAULT_QR_SOURCE_MAX_BYTES = 2953;

export function createQrProcessor(): FenceProcessor {
	return {
		id: "qr-embedded",
		placement: "embedded",
		tags: ["qr"],
		aliases: {},

		async available(): Promise<Availability> {
			return { ok: true };
		},

		render: withRenderGuards(async (_tag, source): Promise<FenceOutput> => {
			const sourceBytes = Buffer.byteLength(source, "utf8");
			if (sourceBytes > DEFAULT_QR_SOURCE_MAX_BYTES) {
				return errorOutput(formatByteLimitError("QR content", sourceBytes, DEFAULT_QR_SOURCE_MAX_BYTES));
			}
			try {
				const png = await QRCode.toBuffer(source, {
					type: "png",
					margin: 2,
					color: {
						dark: "#000000",
						light: "#ffffff",
					},
				});
				return imageOutput(png);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				return errorOutput(message);
			}
		}),
	};
}
