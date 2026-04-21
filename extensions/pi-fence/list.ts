/**
 * Data + formatting helpers for `/fence list`.
 *
 * Two pure functions:
 *
 *   - `listProcessors(processors, availability)` turns a
 *     `FenceProcessor[]` plus a wire-time availability map into
 *     `ProcessorListing[]`. Status is `"registered"` when availability
 *     is ok, `"unavailable"` otherwise. On the unavailable branch the
 *     processor's `reason` + optional `installHint` are carried on the
 *     listing so the formatter can surface them.
 *
 *   - `formatProcessorLines(listings)` turns listings into an array of
 *     readable strings. Registered processors render as one line:
 *
 *         <id> [registered] \u2014 <tags>
 *
 *     Unavailable processors render as two: the header line with an
 *     `[unavailable]` status bracket, followed by an indented second
 *     line with the reason and install hint:
 *
 *         <id> [unavailable] \u2014 <tags>
 *             <reason>. <installHint>
 *
 *     Example with the CV0.E2.S1 two-processor shape on a machine
 *     without `dot`:
 *
 *         graphviz-local [unavailable] \u2014 graphviz (dot)
 *             dot binary not found on PATH. Install graphviz \u2014 apt
 *             install graphviz (Debian/Ubuntu) \u00b7 \u2026
 *         kroki          [registered]  \u2014 mermaid, graphviz (dot), \u2026
 *
 * No column alignment across processors' status brackets \u2014 rows stay
 * per-processor-self-contained, matching S3's formatting decision. If a
 * future story introduces enough processors that visual alignment earns
 * its keep, revisit then; today a prose-like shape keeps the formatter
 * trivial and the test surface small.
 *
 * Zero pi-SDK, zero pi-tui dependencies. Both functions are trivially
 * unit-testable against constructed processor + availability pairs.
 */

import type { Availability, FenceProcessor } from "./processor.ts";

export type ProcessorStatus = "registered" | "unavailable";

export interface ProcessorListing {
	id: string;
	status: ProcessorStatus;
	tags: readonly string[];
	aliases: Readonly<Record<string, string>>;
	/** Present iff status === "unavailable". Human-readable reason from the processor's probe. */
	unavailableReason?: string;
	/** Present iff status === "unavailable" and the processor provided one. */
	installHint?: string;
}

/**
 * Build a listing row per processor. Order is preserved. The processor's
 * own `tags` and `aliases` are surfaced without copying \u2014 the listing
 * holds readonly references so a downstream formatter cannot mutate the
 * processor's advertised configuration.
 *
 * Status comes from `availability.get(id)`. A missing entry in the map
 * is treated the same as `{ ok: false, reason: "availability unknown" }`
 * \u2014 shouldn't happen in production (`probeAvailability` populates the
 * map for every processor) but the defensive branch keeps the formatter
 * honest when a test constructs a partial map.
 */
export function listProcessors(
	processors: readonly FenceProcessor[],
	availability: ReadonlyMap<string, Availability>,
): ProcessorListing[] {
	return processors.map((processor) => {
		const status = availability.get(processor.id);
		if (status?.ok) {
			return {
				id: processor.id,
				status: "registered" as const,
				tags: processor.tags,
				aliases: processor.aliases,
			};
		}
		const reason =
			status && !status.ok ? status.reason : "availability unknown";
		const installHint =
			status && !status.ok && status.installHint !== undefined
				? status.installHint
				: undefined;
		return {
			id: processor.id,
			status: "unavailable" as const,
			tags: processor.tags,
			aliases: processor.aliases,
			unavailableReason: reason,
			...(installHint !== undefined ? { installHint } : {}),
		};
	});
}

/**
 * Format listings as readable lines. Empty input returns a single
 * "(no processors registered)" line so the custom message always has
 * visible content.
 *
 * Each registered processor contributes one line. Each unavailable
 * processor contributes two: the header + an indented reason line.
 * The array of strings is painted verbatim by the list renderer \u2014
 * one Text child per line.
 */
export function formatProcessorLines(listings: readonly ProcessorListing[]): string[] {
	if (listings.length === 0) {
		return ["(no processors registered)"];
	}
	const out: string[] = [];
	for (const listing of listings) {
		out.push(formatHeader(listing));
		if (listing.status === "unavailable") {
			out.push(formatUnavailableDetail(listing));
		}
	}
	return out;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function formatHeader(listing: ProcessorListing): string {
	const tagPart = formatTagList(listing.tags, listing.aliases);
	return `${listing.id} [${listing.status}] \u2014 ${tagPart}`;
}

const UNAVAILABLE_DETAIL_INDENT = "    ";

function formatUnavailableDetail(listing: ProcessorListing): string {
	const reason = listing.unavailableReason ?? "unavailable";
	const hint = listing.installHint ? `. ${listing.installHint}` : "";
	return `${UNAVAILABLE_DETAIL_INDENT}${reason}${hint}`;
}

/**
 * Render canonical tags joined by ", ", with aliases that resolve to a
 * canonical tag shown in parentheses after it. Aliases whose target is
 * not a canonical tag are silently dropped \u2014 the `FenceProcessor`
 * contract forbids that shape, but the formatter stays defensive.
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
