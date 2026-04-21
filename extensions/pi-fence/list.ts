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
	const hasBindings = bindings !== undefined && bindings.length > 0;

	if (listings.length === 0 && !hasBindings) {
		return ["(no processors registered)"];
	}

	const out: string[] = [];
	if (listings.length === 0) {
		out.push("(no processors registered)");
	} else {
		for (const listing of listings) {
			out.push(formatHeader(listing));
			if (listing.status === "unavailable") {
				out.push(formatUnavailableDetail(listing));
			}
		}
	}

	if (hasBindings) {
		const effective = bindings!.filter((b) => b.status === "effective");
		const ignored = bindings!.filter((b) => b.status === "ignored");

		if (effective.length > 0) {
			out.push("");
			out.push("Bindings");
			for (const row of effective) {
				out.push(`${BINDING_INDENT}${row.tag} → ${row.processorId}`);
			}
		}

		if (ignored.length > 0) {
			out.push("");
			out.push("Ignored bindings");
			for (const row of ignored) {
				if (row.status !== "ignored") continue;
				const reason = formatIgnoredReason(row.reason);
				out.push(
					`${BINDING_INDENT}${row.tag} → ${row.processorId} (${reason})`,
				);
			}
		}
	}

	return out;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function formatHeader(listing: ProcessorListing): string {
	const tagPart = formatTagList(listing.tags, listing.aliases);
	return `${listing.id} [${listing.status}] — ${tagPart}`;
}

const UNAVAILABLE_DETAIL_INDENT = "    ";
const BINDING_INDENT = "  ";

function formatIgnoredReason(
	reason: "unknown-processor" | "processor-unavailable",
): string {
	return reason === "unknown-processor" ? "unknown processor" : "processor unavailable";
}

function formatUnavailableDetail(listing: ProcessorListing): string {
	const reason = listing.unavailableReason ?? "unavailable";
	const hint = listing.installHint ? `. ${listing.installHint}` : "";
	return `${UNAVAILABLE_DETAIL_INDENT}${reason}${hint}`;
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
