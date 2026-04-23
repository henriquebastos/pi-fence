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
 *   - `formatProcessorLines(listings, bindings?)` turns listings +
 *     optional binding-resolution rows (from `resolveBindings` in
 *     `resolve.ts`) into an array of readable strings. Registered
 *     processors render as one line; unavailable processors render as
 *     two (header + indented reason). After the processor block, two
 *     optional sections render:
 *
 *         Bindings
 *           <tag> → <processorId>
 *
 *         Ignored bindings
 *           <tag> → <processorId> (unknown processor)
 *           <tag> → <processorId> (processor unavailable)
 *
 *     Both sections are hidden when their bucket is empty.
 *
 * No column alignment across processors' status brackets — rows stay
 * per-processor-self-contained, matching S3's formatting decision. If
 * a future story introduces enough processors that visual alignment
 * earns its keep, revisit then; today a prose-like shape keeps the
 * formatter trivial and the test surface small.
 *
 * Zero pi-SDK, zero pi-tui dependencies. Both functions are trivially
 * unit-testable against constructed processor + availability pairs.
 */

import type { Availability, FenceProcessor } from "./processor.ts";
import type { BindingResolution } from "./resolve.ts";

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
 * own `tags` and `aliases` are surfaced without copying — the listing
 * holds readonly references so a downstream formatter cannot mutate the
 * processor's advertised configuration.
 *
 * Status comes from `availability.get(id)`. A missing entry in the map
 * is treated the same as `{ ok: false, reason: "availability unknown" }`
 * — shouldn't happen in production (`probeAvailability` populates the
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
		return buildUnavailableListing(processor, reason, installHint);
	});
}

/**
 * Format listings + bindings as readable lines. Empty listings + empty
 * bindings returns a single "(no processors registered)" line so the
 * custom message always has visible content. The array of strings is
 * painted verbatim by the list renderer — one Text child per line,
 * including blank separators between sections.
 */
export function formatProcessorLines(
	listings: readonly ProcessorListing[],
	bindings?: readonly BindingResolution[],
): string[] {
	const bindingLines = formatBindingLines(bindings ?? []);
	if (listings.length === 0 && bindingLines.length === 0) {
		return ["(no processors registered)"];
	}

	return [...formatListingLines(listings), ...bindingLines];
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function buildUnavailableListing(
	processor: FenceProcessor,
	reason: string,
	installHint: string | undefined,
): ProcessorListing {
	const listing: ProcessorListing = {
		id: processor.id,
		status: "unavailable",
		tags: processor.tags,
		aliases: processor.aliases,
		unavailableReason: reason,
	};
	if (installHint !== undefined) {
		listing.installHint = installHint;
	}
	return listing;
}

function formatHeader(listing: ProcessorListing): string {
	const tagPart = formatTagList(listing.tags, listing.aliases);
	return `${listing.id} [${listing.status}] — ${tagPart}`;
}

function formatListingLines(listings: readonly ProcessorListing[]): string[] {
	if (listings.length === 0) {
		return ["(no processors registered)"];
	}

	const lines: string[] = [];
	for (const listing of listings) {
		lines.push(...formatListingBlock(listing));
	}
	return lines;
}

function formatListingBlock(listing: ProcessorListing): string[] {
	if (listing.status === "unavailable") {
		return [formatHeader(listing), formatUnavailableDetail(listing)];
	}
	return [formatHeader(listing)];
}

const UNAVAILABLE_DETAIL_INDENT = "    ";
const BINDING_INDENT = "  ";

function formatIgnoredReason(
	reason: "unknown-processor" | "processor-unavailable" | "processor-disabled",
): string {
	if (reason === "unknown-processor") return "unknown processor";
	if (reason === "processor-disabled") return "processor disabled";
	return "processor unavailable";
}

function formatUnavailableDetail(listing: ProcessorListing): string {
	const reason = listing.unavailableReason ?? "unavailable";
	const hint = listing.installHint ? `. ${listing.installHint}` : "";
	return `${UNAVAILABLE_DETAIL_INDENT}${reason}${hint}`;
}

function formatBindingLines(bindings: readonly BindingResolution[]): string[] {
	if (bindings.length === 0) {
		return [];
	}

	const effective = bindings.filter((binding) => binding.status === "effective");
	const ignored = bindings.filter((binding) => binding.status === "ignored");
	return [
		...formatBindingSection("Bindings", effective, formatEffectiveBinding),
		...formatBindingSection("Ignored bindings", ignored, formatIgnoredBinding),
	];
}

function formatBindingSection<T>(
	title: string,
	rows: readonly T[],
	formatRow: (row: T) => string,
): string[] {
	if (rows.length === 0) {
		return [];
	}
	return ["", title, ...rows.map(formatRow)];
}

function formatEffectiveBinding(row: Extract<BindingResolution, { status: "effective" }>): string {
	return `${BINDING_INDENT}${row.tag} → ${row.processorId}`;
}

function formatIgnoredBinding(row: Extract<BindingResolution, { status: "ignored" }>): string {
	const reason = formatIgnoredReason(row.reason);
	return `${BINDING_INDENT}${row.tag} → ${row.processorId} (${reason})`;
}

/**
 * Render canonical tags joined by ", ", with aliases that resolve to a
 * canonical tag shown in parentheses after it. Aliases whose target is
 * not a canonical tag are silently dropped — the `FenceProcessor`
 * contract forbids that shape, but the formatter stays defensive.
 */
function formatTagList(
	tags: readonly string[],
	aliases: Readonly<Record<string, string>>,
): string {
	const aliasesByCanonical = new Map<string, string[]>();
	for (const [alias, target] of Object.entries(aliases)) {
		if (tags.includes(target)) {
			const list = aliasesByCanonical.get(target) ?? [];
			list.push(alias);
			aliasesByCanonical.set(target, list);
		}
	}

	return tags
		.map((tag) => {
			const aliasList = aliasesByCanonical.get(tag);
			if (!aliasList || aliasList.length === 0) return tag;
			return `${tag} (${aliasList.join(", ")})`;
		})
		.join(", ");
}
