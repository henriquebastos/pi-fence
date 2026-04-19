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
export interface PiFenceOutputDetails {
	tag: string;
	processor: string;
	kind: "ok" | "error";
	source: string;
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
 * method. We build ours from Box+Text composition using the provided
 * pi-tui helpers.
 */
export function createPiFenceMessageRenderer(tui: {
	Box: new (paddingY: number, paddingX: number, bg?: (text: string) => string) => PiTuiContainer;
	Text: new (text: string, x: number, y: number) => PiTuiComponent;
	Spacer: new (height: number) => PiTuiComponent;
	truncateToWidth: (text: string, width: number, suffix?: string) => string;
}) {
	return (
		message: { content: unknown; details?: unknown },
		options: { expanded: boolean },
		theme: { fg: (color: string, text: string) => string; bold: (text: string) => string; bg: (color: string, text: string) => string },
	): PiTuiContainer => {
		const details = (message.details ?? {}) as Partial<PiFenceOutputDetails>;
		const tag = details.tag ?? "unknown";
		const processor = details.processor ?? "unknown";
		const kind = details.kind ?? "ok";
		const source = details.source ?? "";

		const label = formatLabel({ kind, tag, processor });
		const labelLine = theme.fg(kind === "ok" ? "customMessageLabel" : "error", theme.bold(label));

		const box = new tui.Box(1, 1, (t) => theme.bg("customMessageBg", t));
		box.addChild(new tui.Text(labelLine, 0, 0));

		// The image (or error text) already lives in the message's `content`
		// array. pi's CustomMessageComponent renders those content items
		// before invoking our renderer — we only draw the chrome around
		// them. A `Spacer` separates chrome from content visually.
		box.addChild(new tui.Spacer(1));

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
export function createPiFenceListRenderer(tui: {
	Box: new (paddingY: number, paddingX: number, bg?: (text: string) => string) => PiTuiContainer;
	Text: new (text: string, x: number, y: number) => PiTuiComponent;
	Spacer: new (height: number) => PiTuiComponent;
	truncateToWidth: (text: string, width: number, suffix?: string) => string;
}) {
	return (
		message: { content: unknown; details?: unknown },
		_options: { expanded: boolean },
		theme: { fg: (color: string, text: string) => string; bold: (text: string) => string; bg: (color: string, text: string) => string },
	): PiTuiContainer => {
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

// ---------------------------------------------------------------------------
// Minimal shape types for pi-tui primitives
// ---------------------------------------------------------------------------

interface PiTuiComponent {
	render(width: number): string[];
}

interface PiTuiContainer extends PiTuiComponent {
	addChild(child: PiTuiComponent): void;
}
