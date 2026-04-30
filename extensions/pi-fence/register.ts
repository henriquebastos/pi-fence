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
import { isProcessorFullyTagBlocked } from "./resolve.ts";

// ── Registry type ───────────────────────────────────────────────────

export interface ProcessorRegistry {
	processors: FenceProcessor[];
	availability: Map<string, Availability>;
}

// ── Validation ──────────────────────────────────────────────────────

const MAX_PROCESSOR_NAME_LENGTH = 64;
const SAFE_PROCESSOR_NAME = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const RESERVED_PROCESSOR_NAMES = new Set(["__proto__", "constructor", "prototype"]);
const FORBIDDEN_PROCESSOR_FIELDS = ["order", "priority", "processorPrecedence"] as const;

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

	for (const field of FORBIDDEN_PROCESSOR_FIELDS) {
		if (Object.hasOwn(obj, field)) {
			return { ok: false, error: `processor must not declare ${field}` };
		}
	}

	const id = obj.id;
	if (typeof id !== "string" || !isSafeProcessorName(id)) {
		return { ok: false, error: "processor.id must be a safe non-empty string" };
	}

	if (!PROCESSOR_PLACEMENTS.includes(obj.placement as ProcessorPlacement)) {
		return { ok: false, error: `processor.placement must be one of ${PROCESSOR_PLACEMENTS.join(", ")}` };
	}

	if (!Array.isArray(obj.tags) || obj.tags.length === 0) {
		return { ok: false, error: "processor.tags must be a non-empty array of strings" };
	}

	for (const tag of obj.tags) {
		if (typeof tag !== "string" || !isSafeProcessorName(tag)) {
			return { ok: false, error: "processor.tags must contain only safe non-empty strings" };
		}
	}

	if (typeof obj.available !== "function") {
		return { ok: false, error: "processor.available must be a function" };
	}

	if (typeof obj.render !== "function") {
		return { ok: false, error: "processor.render must be a function" };
	}

	const tags = Object.freeze([...(obj.tags as string[])]);
	const aliases = validateAliases(Object.hasOwn(obj, "aliases") ? obj.aliases : undefined, tags);
	if (!aliases.ok) {
		return { ok: false, error: aliases.error };
	}

	return {
		ok: true,
		processor: Object.freeze({
			id,
			placement: obj.placement as ProcessorPlacement,
			tags,
			aliases: aliases.aliases,
			available: obj.available as FenceProcessor["available"],
			render: obj.render as FenceProcessor["render"],
		}),
	};
}

type AliasValidationResult =
	| { ok: true; aliases: Readonly<Record<string, string>> }
	| { ok: false; error: string };

function validateAliases(value: unknown, tags: readonly string[]): AliasValidationResult {
	const aliases = Object.create(null) as Record<string, string>;
	if (value === undefined) return { ok: true, aliases: Object.freeze(aliases) };
	if (!isAliasObject(value)) {
		return { ok: false, error: "processor.aliases must be an own object" };
	}

	if (Object.getOwnPropertySymbols(value).length > 0) {
		return { ok: false, error: "processor.aliases keys must be safe strings" };
	}

	const canonicalTags = new Set(tags);
	for (const [alias, target] of Object.entries(value)) {
		if (!isSafeProcessorName(alias)) {
			return { ok: false, error: "processor.aliases keys must be safe strings" };
		}
		if (typeof target !== "string" || !isSafeProcessorName(target)) {
			return { ok: false, error: "processor.aliases values must be safe strings" };
		}
		if (!canonicalTags.has(target)) {
			return { ok: false, error: `processor.aliases target ${target} must exist in processor.tags` };
		}
		aliases[alias] = target;
	}
	return { ok: true, aliases: Object.freeze(aliases) };
}

function isAliasObject(value: unknown): value is Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function isSafeProcessorName(value: string): boolean {
	return value.length <= MAX_PROCESSOR_NAME_LENGTH &&
		SAFE_PROCESSOR_NAME.test(value) &&
		!RESERVED_PROCESSOR_NAMES.has(value);
}

// ── Registration ────────────────────────────────────────────────────

export type RegistrationResult =
	| { ok: true; id: string; tags: readonly string[] }
	| { ok: false; error: string };

export interface RegisterProcessorOptions {
	blockedProcessors?: ReadonlySet<string>;
	blockedTags?: ReadonlySet<string>;
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

	const avail = await probeRegistrationAvailability(processor, registry.processors, options);

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
	registeredProcessors: readonly FenceProcessor[],
	options: RegisterProcessorOptions,
): Promise<Availability> {
	const blocked = registrationBlocked(processor, registeredProcessors, options);
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
	registeredProcessors: readonly FenceProcessor[],
	options: RegisterProcessorOptions,
): Availability | undefined {
	if (options.blockedProcessors?.has(processor.id)) {
		return { ok: false, reason: "processor blocked by config" };
	}
	const processors = [...registeredProcessors, processor];
	if (isProcessorFullyTagBlocked(processor, processors, options.blockedTags)) {
		return { ok: false, reason: "processor tag family blocked by config" };
	}
	if (
		options.processorPrecedence !== undefined &&
		!options.processorPrecedence.includes(processor.placement)
	) {
		return { ok: false, reason: "processor placement disabled by config" };
	}
	return undefined;
}
