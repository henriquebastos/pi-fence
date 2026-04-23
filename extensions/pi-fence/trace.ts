/**
 * Resolution trace — shows step-by-step how pi-fence resolves a tag
 * to a processor. Used by `/fence trace <tag>`.
 *
 * Pure logic: no pi SDK, no I/O. Landing with CV4.E2.S1.
 */

import type { Availability, FenceProcessor } from "./processor.ts";

// ── Types ───────────────────────────────────────────────────────────

export interface TraceStep {
	id: string;
	claimsTag: boolean;
	available: boolean;
	disabled: boolean;
	boundByConfig: boolean;
	outcome: "selected" | "skipped";
	reason: string;
}

// ── Trace logic ─────────────────────────────────────────────────────

export function traceResolution(
	processors: readonly FenceProcessor[],
	availability: ReadonlyMap<string, Availability>,
	tag: string,
	bindings?: Readonly<Record<string, string>>,
	disabled?: ReadonlySet<string>,
): TraceStep[] {
	const steps: TraceStep[] = [];
	let resolved = false;

	// Check binding first.
	const boundId = bindings?.[tag];

	for (const processor of processors) {
		const claims = processor.tags.includes(tag) || processor.aliases[tag] !== undefined;
		const isAvailable = availability.get(processor.id)?.ok === true;
		const isDisabled = disabled?.has(processor.id) === true;
		const isBound = boundId === processor.id;

		// Determine outcome.
		if (resolved) {
			steps.push({
				id: processor.id,
				claimsTag: claims,
				available: isAvailable,
				disabled: isDisabled,
				boundByConfig: isBound,
				outcome: "skipped",
				reason: "already resolved",
			});
			continue;
		}

		if (isDisabled && claims) {
			steps.push({
				id: processor.id,
				claimsTag: claims,
				available: isAvailable,
				disabled: true,
				boundByConfig: isBound,
				outcome: "skipped",
				reason: "disabled by config",
			});
			continue;
		}

		if (!claims) {
			steps.push({
				id: processor.id,
				claimsTag: false,
				available: isAvailable,
				disabled: isDisabled,
				boundByConfig: false,
				outcome: "skipped",
				reason: "does not claim tag",
			});
			continue;
		}

		if (!isAvailable) {
			steps.push({
				id: processor.id,
				claimsTag: true,
				available: false,
				disabled: isDisabled,
				boundByConfig: isBound,
				outcome: "skipped",
				reason: "unavailable",
			});
			continue;
		}

		// If a binding exists for this tag, only the bound processor can be selected.
		if (boundId !== undefined && !isBound) {
			steps.push({
				id: processor.id,
				claimsTag: true,
				available: true,
				disabled: false,
				boundByConfig: false,
				outcome: "skipped",
				reason: "binding prefers another processor",
			});
			continue;
		}

		// Bound processor selected.
		if (isBound) {
			steps.push({
				id: processor.id,
				claimsTag: true,
				available: true,
				disabled: false,
				boundByConfig: true,
				outcome: "selected",
				reason: "bound by config",
			});
			resolved = true;
			continue;
		}

		// First available claimant wins (no binding active).
		steps.push({
			id: processor.id,
			claimsTag: true,
			available: true,
			disabled: false,
			boundByConfig: false,
			outcome: "selected",
			reason: "first available",
		});
		resolved = true;
	}

	return steps;
}

// ── Formatting ──────────────────────────────────────────────────────

export function formatTraceLines(tag: string, steps: readonly TraceStep[]): string[] {
	const lines: string[] = [];
	lines.push(`Resolution trace for tag: ${tag}`);
	lines.push("");

	const selected = steps.find((s) => s.outcome === "selected");

	for (const step of steps) {
		const marker = step.outcome === "selected" ? "→" : " ";
		const flags: string[] = [];
		if (step.claimsTag) flags.push("claims");
		if (!step.claimsTag) flags.push("no-claim");
		if (step.available) flags.push("available");
		if (!step.available && step.claimsTag) flags.push("unavailable");
		if (step.disabled) flags.push("disabled");
		if (step.boundByConfig) flags.push("bound");

		lines.push(`${marker} ${step.id} [${flags.join(", ")}] — ${step.outcome}: ${step.reason}`);
	}

	if (!selected) {
		lines.push("");
		lines.push(`No processor resolved for tag '${tag}'.`);
	}

	return lines;
}
