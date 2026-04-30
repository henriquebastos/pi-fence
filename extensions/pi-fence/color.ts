/**
 * color processor — renders `color` and `palette` fenced blocks as
 * ANSI truecolor swatches. Each line with a valid color gets a filled
 * block of that color next to its label. Non-color lines pass through.
 *
 * Landing with CV3.E2.S2. Pure logic, no external dependencies.
 */

import { errorOutput, textOutput, withRenderGuards, type Availability, type FenceOutput, type FenceProcessor } from "./processor.ts";

const RESET = "\x1b[0m";
const SWATCH = "██████";

// ── Public factory ──────────────────────────────────────────────────

export function createColorProcessor(): FenceProcessor {
	return {
		id: "color-embedded",
		placement: "embedded",
		tags: ["color", "palette"],
		aliases: {},

		async available(): Promise<Availability> {
			return { ok: true };
		},

		render: withRenderGuards(async (tag, source): Promise<FenceOutput> => {
			const lines = source.split(/\r?\n/);
			const outputLines: string[] = [];
			let colorCount = 0;

			for (const line of lines) {
				const parsed = parseLine(line);
				if (parsed) {
					outputLines.push(renderSwatch(parsed.r, parsed.g, parsed.b, line.trim()));
					colorCount++;
				} else {
					outputLines.push(line);
				}
			}

			if (colorCount === 0) {
				return errorOutput(`${tag}: no valid colors found`);
			}

			return textOutput(outputLines.join("\n"));
		}),
	};
}

// ── Color parsing ───────────────────────────────────────────────────

interface RGB {
	r: number;
	g: number;
	b: number;
}

/**
 * Try to parse a line as a color. The color value can appear at the
 * start of the line, optionally followed by a label. Returns the
 * parsed RGB or null if the line doesn't start with a valid color.
 */
function parseLine(line: string): RGB | null {
	const trimmed = line.trim();
	if (trimmed.length === 0) return null;

	return parseHex(trimmed) ?? parseRgbFunction(trimmed) ?? parseNamedColor(trimmed);
}

function parseHex(input: string): RGB | null {
	// Match #RGB, #RRGGBB, or #RRGGBBAA at the start.
	const match = /^#([0-9a-fA-F]{3,8})(?:\s|$)/.exec(input);
	if (!match) return null;

	const hex = match[1];
	if (hex.length === 3) {
		return {
			r: Number.parseInt(hex[0] + hex[0], 16),
			g: Number.parseInt(hex[1] + hex[1], 16),
			b: Number.parseInt(hex[2] + hex[2], 16),
		};
	}
	if (hex.length >= 6) {
		return {
			r: Number.parseInt(hex.slice(0, 2), 16),
			g: Number.parseInt(hex.slice(2, 4), 16),
			b: Number.parseInt(hex.slice(4, 6), 16),
		};
	}
	return null;
}

function parseRgbFunction(input: string): RGB | null {
	const match = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/.exec(input);
	if (!match) return null;
	return {
		r: clamp(Number.parseInt(match[1], 10)),
		g: clamp(Number.parseInt(match[2], 10)),
		b: clamp(Number.parseInt(match[3], 10)),
	};
}

function parseNamedColor(input: string): RGB | null {
	const firstWord = input.split(/\s/)[0].toLowerCase();
	return NAMED_COLORS[firstWord] ?? null;
}

function clamp(n: number): number {
	return Math.max(0, Math.min(255, n));
}

// ── Swatch rendering ────────────────────────────────────────────────

function renderSwatch(r: number, g: number, b: number, label: string): string {
	return `\x1b[38;2;${r};${g};${b}m${SWATCH}${RESET} ${label}`;
}

// ── Named CSS colors (17 standard + common extras) ──────────────────

const NAMED_COLORS: Record<string, RGB> = {
	black: { r: 0, g: 0, b: 0 },
	silver: { r: 192, g: 192, b: 192 },
	gray: { r: 128, g: 128, b: 128 },
	grey: { r: 128, g: 128, b: 128 },
	white: { r: 255, g: 255, b: 255 },
	maroon: { r: 128, g: 0, b: 0 },
	red: { r: 255, g: 0, b: 0 },
	purple: { r: 128, g: 0, b: 128 },
	fuchsia: { r: 255, g: 0, b: 255 },
	green: { r: 0, g: 128, b: 0 },
	lime: { r: 0, g: 255, b: 0 },
	olive: { r: 128, g: 128, b: 0 },
	yellow: { r: 255, g: 255, b: 0 },
	navy: { r: 0, g: 0, b: 128 },
	blue: { r: 0, g: 0, b: 255 },
	teal: { r: 0, g: 128, b: 128 },
	aqua: { r: 0, g: 255, b: 255 },
	orange: { r: 255, g: 165, b: 0 },
	pink: { r: 255, g: 192, b: 203 },
	brown: { r: 165, g: 42, b: 42 },
	cyan: { r: 0, g: 255, b: 255 },
	magenta: { r: 255, g: 0, b: 255 },
	coral: { r: 255, g: 127, b: 80 },
	salmon: { r: 250, g: 128, b: 114 },
	gold: { r: 255, g: 215, b: 0 },
	indigo: { r: 75, g: 0, b: 130 },
	violet: { r: 238, g: 130, b: 238 },
	crimson: { r: 220, g: 20, b: 60 },
	darkblue: { r: 0, g: 0, b: 139 },
	darkgreen: { r: 0, g: 100, b: 0 },
	darkred: { r: 139, g: 0, b: 0 },
	lightblue: { r: 173, g: 216, b: 230 },
	lightgreen: { r: 144, g: 238, b: 144 },
	tomato: { r: 255, g: 99, b: 71 },
	turquoise: { r: 64, g: 224, b: 208 },
	khaki: { r: 240, g: 230, b: 140 },
	ivory: { r: 255, g: 255, b: 240 },
	beige: { r: 245, g: 245, b: 220 },
};
