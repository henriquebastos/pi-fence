/**
 * Data + formatting helpers for `/fence list`.
 *
 * Two pure functions:
 *
 *   - `listProcessors(processors)` turns a `FenceProcessor[]` into
 *     `ProcessorListing[]`. A listing captures everything `/fence list`
 *     advertises about a processor: id, status, canonical tags, alias map.
 *     Status is the string literal `"registered"` in S3. A future
 *     `/fence doctor` story will widen the union (e.g. `"unreachable"`)
 *     once real health probes exist.
 *
 *   - `formatProcessorLines(listings)` turns listings into an array of
 *     readable strings, one line per processor, for the custom message
 *     renderer to drop into a pi-tui `Box`. Line shape:
 *
 *         <id> [<status>] — <tags>
 *
 *     Example with today's single processor:
 *
 *         kroki [registered] — mermaid, graphviz (dot), plantuml (puml), d2
 *
 * No column alignment. See `cv0-e1-s3-fence-list/README.md` for the
 * rationale — a line-per-processor shape stays legible with the small
 * number of processors pi-fence will ship through CV0/CV1.
 *
 * Zero pi-SDK, zero pi-tui dependencies. Both functions are trivially
 * unit-testable against constructed `FenceProcessor` stubs.
 */

import type { FenceProcessor } from "./processor.ts";

export type ProcessorStatus = "registered";

export interface ProcessorListing {
	id: string;
	status: ProcessorStatus;
	tags: readonly string[];
	aliases: Readonly<Record<string, string>>;
}

/**
 * Build a listing row per processor. Order is preserved. The processor's
 * own `tags` and `aliases` are surfaced without copying — the listing holds
 * readonly references so a downstream formatter cannot mutate the
 * processor's advertised configuration.
 */
export function listProcessors(processors: readonly FenceProcessor[]): ProcessorListing[] {
	return processors.map((processor) => ({
		id: processor.id,
		status: "registered" as const,
		tags: processor.tags,
		aliases: processor.aliases,
	}));
}

/**
 * Format listings as readable per-processor lines. Empty input returns a
 * single "(no processors registered)" line so the custom message always
 * has visible content.
 */
export function formatProcessorLines(listings: readonly ProcessorListing[]): string[] {
	if (listings.length === 0) {
		return ["(no processors registered)"];
	}
	return listings.map(formatListing);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function formatListing(listing: ProcessorListing): string {
	const tagPart = formatTagList(listing.tags, listing.aliases);
	return `${listing.id} [${listing.status}] — ${tagPart}`;
}

/**
 * Render canonical tags joined by ", ", with aliases that resolve to a
 * canonical tag shown in parentheses after it. Aliases whose target is
 * not a canonical tag are silently dropped — the `FenceProcessor` contract
 * forbids that shape, but the formatter stays defensive.
 */
function formatTagList(
	tags: readonly string[],
	aliases: Readonly<Record<string, string>>,
): string {
	const aliasesByCanonical = new Map<string, string[]>();
	for (const [alias, target] of Object.entries(aliases)) {
		if (!tags.includes(target)) continue;
		const list = aliasesByCanonical.get(target) ?? [];
		list.push(alias);
		aliasesByCanonical.set(target, list);
	}

	return tags
		.map((tag) => {
			const aliasList = aliasesByCanonical.get(tag);
			if (!aliasList || aliasList.length === 0) return tag;
			return `${tag} (${aliasList.join(", ")})`;
		})
		.join(", ");
}
