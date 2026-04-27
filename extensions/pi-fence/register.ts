/**
 * Third-party processor registration — validation and registry mutation.
 *
 * Pure logic: no pi SDK, no event bus, no I/O. The event-bus listener
 * in `index.ts` calls these functions after receiving a `pi-fence:register`
 * event.
 *
 * Landing with CV4.E1.S1.
 */

import {
	PROCESSOR_PLACEMENTS,
	type Availability,
	type FenceProcessor,
	type ProcessorPlacement,
} from "./processor.ts";

// ── Registry type ───────────────────────────────────────────────────

export interface ProcessorRegistry {
	processors: FenceProcessor[];
	availability: Map<string, Availability>;
}

// ── Validation ──────────────────────────────────────────────────────

export type ValidationResult =
	| { ok: true; processor: FenceProcessor }
	| { ok: false; error: string };

/**
 * Validate that `value` conforms to the `FenceProcessor` shape.
 * Does NOT call `available()` or `render()` — shape only.
 * Missing `aliases` defaults to `{}`.
 */
export function validateProcessor(value: unknown): ValidationResult {
	if (value === null || value === undefined || typeof value !== "object") {
		return { ok: false, error: "processor must be a non-null object" };
	}

	const obj = value as Record<string, unknown>;

	if (typeof obj.id !== "string" || obj.id.length === 0) {
		return { ok: false, error: "processor.id must be a non-empty string" };
	}

	if (!PROCESSOR_PLACEMENTS.includes(obj.placement as ProcessorPlacement)) {
		return { ok: false, error: `processor.placement must be one of ${PROCESSOR_PLACEMENTS.join(", ")}` };
	}

	if (!Array.isArray(obj.tags) || obj.tags.length === 0) {
		return { ok: false, error: "processor.tags must be a non-empty array of strings" };
	}

	for (const tag of obj.tags) {
		if (typeof tag !== "string" || tag.length === 0) {
			return { ok: false, error: "processor.tags must contain only non-empty strings" };
		}
	}

	if (typeof obj.available !== "function") {
		return { ok: false, error: "processor.available must be a function" };
	}

	if (typeof obj.render !== "function") {
		return { ok: false, error: "processor.render must be a function" };
	}

	// Default aliases to {} if missing.
	const aliases = (typeof obj.aliases === "object" && obj.aliases !== null && !Array.isArray(obj.aliases))
		? obj.aliases as Readonly<Record<string, string>>
		: {};

	return {
		ok: true,
		processor: {
			id: obj.id,
			placement: obj.placement as ProcessorPlacement,
			tags: obj.tags as readonly string[],
			aliases,
			available: obj.available as FenceProcessor["available"],
			render: obj.render as FenceProcessor["render"],
		},
	};
}

// ── Registration ────────────────────────────────────────────────────

export type RegistrationResult =
	| { ok: true; id: string; tags: readonly string[] }
	| { ok: false; error: string };

export interface RegisterProcessorOptions {
	blockedProcessors?: ReadonlySet<string>;
	processorPrecedence?: readonly ProcessorPlacement[];
}

/**
 * Add a validated processor to the registry. Probes availability only when
 * policy allows the processor; blocked processors and disabled placements
 * must not run host/remote probes as a registration side effect.
 * Inserts before kroki-remote (the catch-all) if kroki-remote is present;
 * otherwise appends.
 *
 * Rejects duplicate ids.
 */
export async function registerProcessor(
	registry: ProcessorRegistry,
	processor: FenceProcessor,
	options: RegisterProcessorOptions = {},
): Promise<RegistrationResult> {
	if (registry.processors.some((p) => p.id === processor.id)) {
		return { ok: false, error: `duplicate processor id: ${processor.id}` };
	}

	const avail = await probeRegistrationAvailability(processor, options);

	// Insert before Kroki (the catch-all fallback) if present.
	const krokiIndex = registry.processors.findIndex((p) => p.id === "kroki-remote");
	if (krokiIndex >= 0) {
		registry.processors.splice(krokiIndex, 0, processor);
	} else {
		registry.processors.push(processor);
	}

	registry.availability.set(processor.id, avail);

	return { ok: true, id: processor.id, tags: processor.tags };
}

async function probeRegistrationAvailability(
	processor: FenceProcessor,
	options: RegisterProcessorOptions,
): Promise<Availability> {
	const blocked = registrationBlocked(processor, options);
	if (blocked) return blocked;
	try {
		return await processor.available();
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return { ok: false, reason: `available() threw: ${msg}` };
	}
}

function registrationBlocked(
	processor: FenceProcessor,
	options: RegisterProcessorOptions,
): Availability | undefined {
	if (options.blockedProcessors?.has(processor.id)) {
		return { ok: false, reason: "processor blocked by config" };
	}
	if (
		options.processorPrecedence !== undefined &&
		!options.processorPrecedence.includes(processor.placement)
	) {
		return { ok: false, reason: "processor placement disabled by config" };
	}
	return undefined;
}
