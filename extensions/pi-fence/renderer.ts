/**
 * Custom message renderer for `customType: "pi-fence:output"`.
 *
 * Two sides:
 *
 * 1. Pure helpers (`formatLabel`, `hasSourceOverflow`, `clipSourceLines`) —
 *    unit-tested in `tests/unit/renderer.test.ts`. Exported independently so
 *    tests can hit them without loading pi-tui or building pi-tui
 *    Components.
 *
 * 2. `createPiFenceMessageRenderer` — the `MessageRenderer` closure pi's
 *    runtime invokes. Composes pi-tui `Box`, `Text`, and image content
 *    items (already part of the CustomMessage's `content` array) into a
 *    visible component. This path is exercised end-to-end by
 *    `tests/extension/pi-fence.test.ts`.
 *
 * Layout when collapsed:
 *
 *     [pi-fence label]
 *     <rendered image>
 *
 * Layout when expanded (ctrl+o):
 *
 *     [pi-fence label]
 *     <rendered image>
 *     <blank line>
 *     ```<tag>
 *     <source, clipped to a reasonable window>
 *     ```
 */

import type { Theme } from "@mariozechner/pi-coding-agent";
import type { Component } from "@mariozechner/pi-tui";

const COLLAPSED_SOURCE_LINES = 10;

// ---------------------------------------------------------------------------
// Pure helpers — unit tested
// ---------------------------------------------------------------------------

export interface LabelInput {
	kind: "ok" | "error";
	tag: string;
	processor: string;
}

/** Render the header line shown above the image/error panel. */
export function formatLabel({ kind, tag, processor }: LabelInput): string {
	const verb = kind === "ok" ? "Rendered" : "Error rendering";
	return `${verb} ${tag} via ${processor}`;
}

/** Does the source need a "... N more lines" hint in the expanded view? */
export function hasSourceOverflow(source: string, lineBudget: number = COLLAPSED_SOURCE_LINES): boolean {
	if (!source) return false;
	const lineCount = source.split(/\r?\n/).length;
	return lineCount > lineBudget;
}

export interface ClipResult {
	lines: string[];
	remaining: number;
}

/**
 * Clip a list of source lines to at most `lineBudget`. Returns the visible
 * slice and how many lines were dropped. A budget of 0 returns no lines and
 * reports the full length as remaining.
 */
export function clipSourceLines(lines: string[], lineBudget: number): ClipResult {
	if (lineBudget <= 0) return { lines: [], remaining: lines.length };
	if (lines.length <= lineBudget) return { lines, remaining: 0 };
	return {
		lines: lines.slice(0, lineBudget),
		remaining: lines.length - lineBudget,
	};
}

// ---------------------------------------------------------------------------
// Component factory — exercised in extension-layer tests
// ---------------------------------------------------------------------------

/**
 * Metadata the renderer needs from the custom message's `details` payload.
 * pi-fence populates this when it calls `pi.sendMessage`.
 */
export interface SourcePreviewDetails {
	text: string;
	truncated: boolean;
	omittedBytes?: number;
	omittedLines?: number;
}

export interface PiFenceOutputDetails {
	tag: string;
	processor: string;
	kind: "ok" | "error";
	outputKind?: "image" | "text" | "error";
	sourcePreview?: SourcePreviewDetails;
	/** Legacy sessions before CV11.E3.S2 stored the full source here. */
	source?: string;
}

/**
 * Build the `MessageRenderer` pi's runtime will invoke. We accept pi-tui at
 * runtime via a shape-compatible parameter rather than a direct import,
 * keeping this module importable in isolation by the unit tests above.
 *
 * The returned function signature matches pi's `MessageRenderer<unknown>`:
 *   (message, { expanded }, theme) => Component
 *
 * Where Component is any object with a `render(width: number): string[]`
 * method. We build ours from Box+Text+Image composition using the
 * provided pi-tui helpers.
 *
 * The renderer is authoritative: pi displays exactly what it returns.
 * Content items on the custom message (image, text) are NOT rendered by
 * pi automatically; we explicitly compose them as children. An earlier
 * version of this factory assumed pi's runtime drew the content for us —
 * that was wrong, and produced a visible chrome with no image.
 */
type ThemeLike = Pick<Theme, "fg" | "bg" | "bold">;

interface Container extends Component {
	addChild(child: Component): void;
}

interface TuiPrimitives {
	Box: new (paddingX: number, paddingY: number, bg?: (text: string) => string) => Container;
	Text: new (
		text: string,
		paddingX: number,
		paddingY: number,
		bg?: (text: string) => string,
	) => Component;
	Spacer: new (height: number) => Component;
	Image: new (
		base64Data: string,
		mimeType: string,
		imageTheme: { fallbackColor: (s: string) => string },
		options?: { maxWidthCells?: number; maxHeightCells?: number; filename?: string },
	) => Component;
	truncateToWidth: (text: string, width: number, suffix?: string) => string;
}

export function createPiFenceMessageRenderer(tui: TuiPrimitives) {
	return (
		message: { content: unknown; details?: unknown },
		options: { expanded: boolean },
		theme: ThemeLike,
	): Component => {
		const details = (message.details ?? {}) as Partial<PiFenceOutputDetails>;
		const tag = details.tag ?? "unknown";
		const processor = details.processor ?? "unknown";
		const kind = details.kind ?? "ok";
		const sourcePreview = details.sourcePreview;
		const source = sourcePreview?.text ?? details.source ?? "";

		const label = formatLabel({ kind, tag, processor });
		const labelLine = theme.fg(kind === "ok" ? "customMessageLabel" : "error", theme.bold(label));

		// Render each content item pi-fence attached. PNGs via pi-tui's
		// Image component; text via Text. Anything else is skipped — pi-fence
		// only produces image/text today. Peeked at up front so the
		// label→content spacer can size itself against what's coming.
		const items = Array.isArray(message.content)
			? (message.content as Array<{ type?: string; text?: string; data?: string; mimeType?: string }>)
			: [];
		const hasImage = items.some(
			(item) => item?.type === "image" && typeof item.data === "string",
		);

		// No `customMessageBg` tint: pi-tui's Image emits empty-string rows
		// that the Box would paint with the bg, producing a visible stripe
		// wherever the image is narrower than the box. Leaving the box
		// background transparent lets the image cells blend into the
		// terminal background directly, which is what the PNG's own bg
		// already targets (matching Kroki's dark theme we requested).
		// Argument order is (paddingX, paddingY, bgFn) per pi-tui's Box.
		const box = new tui.Box(1, 0);
		box.addChild(new tui.Text(labelLine, 0, 0));
		// Breathing gap between the header and the content below. Sized
		// against the content kind:
		//
		//   - Image (happy path): two blank rows. One is not enough —
		//     Kroki's rendered PNG has its own internal top margin of
		//     dark pixels indistinguishable from the terminal's black
		//     background, which visually absorbs a single blank
		//     cell-grid row. Two rows restore a perceptible gap.
		//   - Text (error path): one blank row. Text glyphs paint from
		//     the first row of the content, so a single blank is already
		//     visible between the red header and the white body — two
		//     reads as unnecessarily airy.
		box.addChild(new tui.Spacer(hasImage ? 2 : 1));

		const imageFallback = { fallbackColor: (s: string) => theme.fg("muted", s) };
		for (const item of items) {
			if (item?.type === "image" && typeof item.data === "string") {
				const mimeType = item.mimeType ?? "image/png";
				// 60 cells matches pi's own inline tool-output convention
				// (see pi-coding-agent's `tool-execution` renderer). Wider
				// values swallowed the terminal; narrower felt cramped for
				// diagram legibility. Revisit when CV1.E1 ships settings.
				box.addChild(
					new tui.Image(item.data, mimeType, imageFallback, { maxWidthCells: 60 }),
				);
			} else if (item?.type === "text" && typeof item.text === "string") {
				box.addChild(new tui.Text(item.text, 0, 0));
			}
		}

		if (options.expanded && source) {
			box.addChild(new tui.Spacer(1));
			const fence = "```";
			box.addChild(new tui.Text(`${fence}${tag}`, 0, 0));

			const rawLines = source.split(/\r?\n/);
			const { lines, remaining } = clipSourceLines(rawLines, COLLAPSED_SOURCE_LINES * 4);
			for (const line of lines) {
				box.addChild(new tui.Text(line, 0, 0));
			}
			if (remaining > 0) {
				box.addChild(
					new tui.Text(theme.fg("muted", `... (${remaining} more lines)`), 0, 0),
				);
			}
			if (sourcePreview?.truncated) {
				box.addChild(new tui.Text(theme.fg("muted", "... (source preview truncated)"), 0, 0));
			}
			box.addChild(new tui.Text(fence, 0, 0));
		}

		return box;
	};
}

// ---------------------------------------------------------------------------
// `/fence list` renderer
// ---------------------------------------------------------------------------

/**
 * Details payload the list renderer reads. The command handler populates
 * `lines` with the pre-formatted output of `formatProcessorLines`; the
 * renderer just drops one `Text` child per line under a `Processors`
 * header. Keeping the formatting out of the renderer keeps the visual
 * composition testable without loading a real pi-tui.
 */
export interface PiFenceListDetails {
	lines: string[];
}

const LIST_HEADER = "Processors";
const EMPTY_LISTING_LINE = "(no processors registered)";

/**
 * Factory parallel to `createPiFenceMessageRenderer`. Accepts the same
 * shape-compatible pi-tui primitives so the unit test above can exercise
 * composition without loading pi-tui proper.
 *
 * The rendered component is a `Box` containing:
 *   1. A `Text` child with the bolded header.
 *   2. A `Spacer` to breathe.
 *   3. One `Text` child per line in `details.lines`.
 *
 * When `details.lines` is missing or empty, the body falls back to a
 * single "(no processors registered)" line so the message always has
 * visible content. Expanded and collapsed renders are identical today —
 * `/fence list` has no hidden detail to unfold.
 */
export function createPiFenceListRenderer(
	tui: Pick<TuiPrimitives, "Box" | "Text" | "Spacer" | "truncateToWidth">,
) {
	return (
		message: { content: unknown; details?: unknown },
		_options: { expanded: boolean },
		theme: ThemeLike,
	): Component => {
		const details = (message.details ?? {}) as Partial<PiFenceListDetails>;
		const lines = details.lines && details.lines.length > 0 ? details.lines : [EMPTY_LISTING_LINE];

		const box = new tui.Box(1, 1, (t) => theme.bg("customMessageBg", t));
		box.addChild(new tui.Text(theme.fg("customMessageLabel", theme.bold(LIST_HEADER)), 0, 0));
		box.addChild(new tui.Spacer(1));
		for (const line of lines) {
			box.addChild(new tui.Text(line, 0, 0));
		}
		return box;
	};
}
