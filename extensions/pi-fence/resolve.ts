/**
 * Processor resolution — the registry's one piece of logic.
 *
 * `resolveProcessor(processors, availability, tag)` returns the first
 * processor in registration order whose availability is `ok` AND whose
 * canonical tags or aliases cover `tag`. Returns `null` if no processor
 * claims the tag or all claimers are unavailable.
 *
 * `probeAvailability(processors)` runs every processor's `available()`
 * once and returns a map from processor id to result. Defensive against
 * processor authors who forget the "never throw" contract — a thrown
 * probe would otherwise crash the extension's wire-time initialisation.
 *
 * Both functions are pure (apart from the async probe). No pi-SDK, no
 * pi-tui, no HTTP, no shell. Unit tests construct fake processors with
 * scripted `available()` responses and assert on the outputs directly.
 *
 * Landed in CV0.E2.S1 when pi-fence stopped assuming a single processor
 * and needed a resolution rule between "parsed a block" and "render it".
 * Capability-based only for now; CV0.E2.S2 adds an explicit per-tag
 * override from user settings.
 */

import type { Availability, FenceProcessor } from "./processor.ts";

/**
 * Return the first processor in registration order that can serve `tag`
 * on this session. A processor can serve a tag iff:
 *   - its `available()` probe returned `{ ok: true }` at wire time, AND
 *   - its `tags` array includes the tag OR its `aliases` map has the
 *     tag as a key.
 *
 * Returns `null` when no processor matches — the caller decides how to
 * present the shape (today: skip the block silently with a warn log,
 * because the extension's allowlist is derived from the same processor
 * set so an unresolvable tag should be impossible; belt-and-braces).
 */
export function resolveProcessor(
	processors: readonly FenceProcessor[],
	availability: ReadonlyMap<string, Availability>,
	tag: string,
): FenceProcessor | null {
	for (const processor of processors) {
		if (availability.get(processor.id)?.ok !== true) continue;
		if (processor.tags.includes(tag) || processor.aliases[tag] !== undefined) {
			return processor;
		}
	}
	return null;
}

/**
 * Probe every processor's `available()` in registration order and
 * return a map from processor id to result. Called once at wire time
 * by the extension; the returned map is captured and reused for the
 * session.
 *
 * The `FenceProcessor` contract says `available()` must never throw,
 * and the contract helper asserts it. This function still wraps each
 * call in try/catch because a processor author whose probe crashes
 * would otherwise take the whole extension down at registration —
 * worse than a single processor silently listing as `unavailable`.
 * Thrown values become `{ ok: false, reason: <stringified error> }`.
 */
export async function probeAvailability(
	processors: readonly FenceProcessor[],
): Promise<Map<string, Availability>> {
	const out = new Map<string, Availability>();
	for (const processor of processors) {
		try {
			out.set(processor.id, await processor.available());
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			out.set(processor.id, {
				ok: false,
				reason: `available() threw: ${message}`,
			});
		}
	}
	return out;
}

/**
 * Derive the extension's fenced-block allowlist from the registered
 * processors. Canonical tags + alias keys across every processor.
 * Duplicate tags (when two processors both claim `graphviz`, for
 * example) are collapsed to one entry — the parser only cares that
 * the tag is accepted, not which processor will handle it.
 *
 * Lives alongside `resolveProcessor` because they share the same
 * processor-array input shape and callers typically use both.
 */
export function collectSupportedTags(
	processors: readonly FenceProcessor[],
): string[] {
	const tags = new Set<string>();
	for (const processor of processors) {
		for (const tag of processor.tags) tags.add(tag);
		for (const alias of Object.keys(processor.aliases)) tags.add(alias);
	}
	return [...tags];
}
