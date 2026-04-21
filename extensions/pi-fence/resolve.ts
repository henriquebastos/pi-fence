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
 * Return the first processor that can serve `tag` on this session.
 *
 * Resolution rule (CV0.E2.S2):
 *   1. User binding wins. If `bindings[tag]` names a registered
 *      processor whose availability is ok, return that processor.
 *   2. Otherwise, capability-based order. Iterate `processors` in
 *      registration order; return the first whose availability is ok
 *      AND whose tags/aliases cover the tag.
 *   3. Null if neither produces a match.
 *
 * Bindings are preferences, not hard requirements. A binding to an
 * unknown processor id OR to an unavailable processor falls through
 * to capability-based resolution rather than returning null. Strict
 * mode (respect unavailable, refuse capability fallback) is a future
 * story — see `resolveBindings` below for the separate helper that
 * surfaces why a binding was ignored.
 *
 * Pure. The caller logs at wire time; `resolve.ts` has no logger.
 */
export function resolveProcessor(
	processors: readonly FenceProcessor[],
	availability: ReadonlyMap<string, Availability>,
	tag: string,
	bindings?: Readonly<Record<string, string>>,
): FenceProcessor | null {
	// 1. Binding takes precedence when the bound processor is registered
	//    AND available. Otherwise fall through to capability order.
	const boundId = bindings?.[tag];
	if (boundId !== undefined) {
		const bound = processors.find((p) => p.id === boundId);
		if (bound && availability.get(bound.id)?.ok === true) {
			return bound;
		}
	}

	// 2. Capability-based: first available match in registration order.
	for (const processor of processors) {
		if (availability.get(processor.id)?.ok !== true) continue;
		if (processor.tags.includes(tag) || processor.aliases[tag] !== undefined) {
			return processor;
		}
	}
	return null;
}

/**
 * Surface per-binding resolution state for `/fence list`. Returns one
 * row per entry in `bindings`, preserving iteration order. Each row
 * says whether the binding is `effective` (registered + available, so
 * resolveProcessor would honour it) or `ignored` (with a reason).
 *
 * Separate from `resolveProcessor` because `/fence list` needs the
 * full categorisation once at render time; the per-block resolver
 * only needs the positive lookup per tag.
 */
export type BindingResolution =
	| { status: "effective"; tag: string; processorId: string }
	| {
			status: "ignored";
			tag: string;
			processorId: string;
			reason: "unknown-processor" | "processor-unavailable";
		};

export function resolveBindings(
	processors: readonly FenceProcessor[],
	availability: ReadonlyMap<string, Availability>,
	bindings: Readonly<Record<string, string>>,
): BindingResolution[] {
	const out: BindingResolution[] = [];
	for (const [tag, processorId] of Object.entries(bindings)) {
		const processor = processors.find((p) => p.id === processorId);
		if (!processor) {
			out.push({
				status: "ignored",
				tag,
				processorId,
				reason: "unknown-processor",
			});
			continue;
		}
		if (availability.get(processor.id)?.ok !== true) {
			out.push({
				status: "ignored",
				tag,
				processorId,
				reason: "processor-unavailable",
			});
			continue;
		}
		out.push({ status: "effective", tag, processorId });
	}
	return out;
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
