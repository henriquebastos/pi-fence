/**
 * The `FenceProcessor` interface. In S1 there is a single implementation
 * (Kroki) and no registry yet — that arrives with CV0.E2 when a second
 * processor (local graphviz) needs to compete for the same tag.
 *
 * Defining the interface here rather than inside `kroki.ts` signals intent:
 * any new processor lands by implementing this shape. The contract helper
 * at `tests/contract/fence-processor.ts` imports this interface and
 * asserts every processor satisfies the shape with a small live call.
 *
 * Output is a `FenceResult` — the same shape Kroki returns. Future
 * processors whose output isn't a PNG (text-based renderings, components,
 * errors with structured parse issues) will motivate an expanded
 * `FenceOutput` variant; today all we ship is image output.
 */

export const PROCESSOR_PLACEMENTS = ["embedded", "host", "sandbox", "remote"] as const;

export type ProcessorPlacement = typeof PROCESSOR_PLACEMENTS[number];

export type FenceResult =
	| { ok: true; png: Buffer }
	| { ok: true; text: string }
	| { ok: false; error: string };

export const DEFAULT_RENDER_TIMEOUT_MS = 15_000;

export function mergeSignals(signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
	const real = signals.filter((signal): signal is AbortSignal => signal !== undefined);
	if (real.length === 0) return undefined;
	if (real.length === 1) return real[0];
	return AbortSignal.any(real);
}

export type RenderFunction = (
	tag: string,
	source: string,
	signal?: AbortSignal,
) => Promise<FenceResult>;

export function withSignalGuard(render: RenderFunction): RenderFunction {
	return async (tag, source, signal) => {
		if (signal?.aborted) {
			return { ok: false, error: "Aborted before render" };
		}
		return render(tag, source, signal);
	};
}

export function withRenderGuards(render: RenderFunction): RenderFunction {
	return withSignalGuard(async (tag, source, signal) => {
		const trimmed = source.trim();
		if (trimmed.length === 0) {
			return { ok: false, error: `${tag}: empty input` };
		}
		return render(tag, trimmed, signal);
	});
}

/**
 * One-shot capability probe result. Landed with CV0.E2.S1 when the second
 * processor (graphviz-host) made availability a real user-visible concern
 * — a machine without `dot` on PATH should still render `graphviz` blocks,
 * just via Kroki instead. Kroki's own impl is the trivial `{ ok: true }`
 * because its failure mode (unreachable endpoint) surfaces per-render as
 * an error panel rather than up-front unavailability; a future `/fence
 * doctor` story revisits.
 *
 * `reason` is required on the not-ok branch so `/fence list` has something
 * human to show; `installHint` is optional but encouraged for processors
 * whose unavailability has a known fix.
 */
export type Availability =
	| { ok: true }
	| { ok: false; reason: string; installHint?: string };

export interface FenceProcessor {
	/** Stable id used for logs, settings, and future registry lookups. */
	readonly id: string;

	/** Trust/control boundary used by policy-driven resolution. */
	readonly placement: ProcessorPlacement;

	/**
	 * Canonical tag names this processor handles. Non-empty. Used by the
	 * extension to build its fenced-block allowlist and by `/fence list`
	 * to advertise what the processor accepts.
	 */
	readonly tags: readonly string[];

	/**
	 * Map from alias tag → canonical tag. Every value must appear in `tags`.
	 * Empty object for processors that do not declare aliases. Readonly so
	 * callers of `/fence list` cannot mutate a processor's advertised
	 * configuration.
	 */
	readonly aliases: Readonly<Record<string, string>>;

	/**
	 * One-shot capability probe. The extension calls this once at wire time
	 * and caches the result for the session; no processor should assume it
	 * will be called per-render. Processors whose availability can change
	 * mid-session are visible only after `/reload` until a future `/fence
	 * doctor --refresh` story lands.
	 *
	 * Must never throw — a spawn failure, a bad PATH, or any other probe
	 * hazard maps to `{ ok: false, reason, installHint? }`. The contract
	 * helper asserts the shape; live tests cover the real probe.
	 */
	available(): Promise<Availability>;

	/** Render the source for the given tag. Returns data on both success and failure paths. */
	render(tag: string, source: string, signal?: AbortSignal): Promise<FenceResult>;
}
