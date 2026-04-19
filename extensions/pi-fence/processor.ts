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

export type FenceResult =
	| { ok: true; png: Buffer }
	| { ok: false; error: string };

export interface FenceProcessor {
	/** Stable id used for logs, settings, and future registry lookups. */
	readonly id: string;

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

	/** Render the source for the given tag. Returns data on both success and failure paths. */
	render(tag: string, source: string, signal?: AbortSignal): Promise<FenceResult>;
}
