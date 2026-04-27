/**
 * pi-fence config core.
 *
 * Pure config logic only: defaults, validation, and merge behaviour.
 * File-path discovery and file reads live in `io/config-loader.ts`.
 */

import type { Logger } from "./io/logger.ts";
import {
	PROCESSOR_PLACEMENTS,
	type ProcessorPlacement,
} from "./processor.ts";

export type TagBinding =
	| { processor: string }
	| { placement: ProcessorPlacement };

export interface BlockPolicy {
	tags: string[];
	processors: string[];
}

export interface PiFenceConfig {
	/**
	 * Map from canonical or alias tag name to a selector constraint.
	 * Bindings narrow eligible processors; they do not bypass placement policy.
	 */
	bindings: Record<string, TagBinding>;
	/** Tags and processor ids that must never render. */
	blocked?: BlockPolicy;
	/**
	 * Placement allowlist and selection order. Omitted in a layer means inherit;
	 * an explicit list can only reorder or remove lower-priority placements.
	 */
	processorPrecedence?: ProcessorPlacement[];
	/** Per-processor configuration. Currently only Kroki has settings. */
	kroki?: {
		/** Kroki endpoint URL. Default: https://kroki.io */
		endpoint?: string;
		/** Docker lifecycle settings. */
		docker?: {
			/** Auto-start the Docker Kroki container on session init. Default: false. */
			autoStart?: boolean;
		};
	};
}

export const DEFAULT_PROCESSOR_PRECEDENCE: readonly ProcessorPlacement[] = [
	"embedded",
	"host",
	"sandbox",
	"remote",
];

export const DEFAULT_CONFIG: PiFenceConfig = {
	bindings: emptyBindings(),
	blocked: { tags: [], processors: [] },
	processorPrecedence: [...DEFAULT_PROCESSOR_PRECEDENCE],
};

export const EMPTY_CONFIG_LAYER: PiFenceConfig = { bindings: emptyBindings() };

const LEGACY_PROCESSOR_ID_ALIASES: Readonly<Record<string, string>> = Object.freeze({
	color: "color-embedded",
	"graphviz-local": "graphviz-host",
	highlight: "highlight-embedded",
	kroki: "kroki-remote",
	"mermaid-local": "mermaid-host",
	qr: "qr-embedded",
	table: "table-embedded",
});

/**
 * Shallow merge at the top level; inside `bindings` later configs win on the
 * same key and preserve non-conflicting keys. Safety controls are restrictive:
 * `disabled` is a union, and `processorPrecedence` is an ordered intersection.
 */
export function mergePiFenceConfigs(
	...configs: ReadonlyArray<PiFenceConfig>
): PiFenceConfig {
	const bindings = emptyBindings();
	let blocked: BlockPolicy | undefined;
	let processorPrecedence: ProcessorPlacement[] | undefined;
	let kroki: PiFenceConfig["kroki"];
	for (const config of configs) {
		for (const [tag, binding] of Object.entries(config.bindings)) {
			bindings[tag] = binding;
		}
		if (config.blocked !== undefined) {
			blocked = copyBlocked(config.blocked);
		}
		if (config.processorPrecedence !== undefined) {
			processorPrecedence = mergeProcessorPrecedence(
				processorPrecedence,
				config.processorPrecedence,
			);
		}
		if (config.kroki !== undefined) {
			kroki = mergeKrokiConfig(kroki, config.kroki);
		}
	}
	const out: PiFenceConfig = { bindings };
	if (blocked !== undefined) out.blocked = blocked;
	if (processorPrecedence !== undefined) out.processorPrecedence = processorPrecedence;
	if (kroki !== undefined) out.kroki = kroki;
	return out;
}

/**
 * Hand-rolled shape validation. Unknown top-level keys are tolerated
 * silently so a future config surface can add keys without breaking
 * existing files.
 */
export function validatePiFenceConfig(
	parsed: unknown,
	label: string,
	logger?: Logger,
): PiFenceConfig {
	if (!isRecordLike(parsed)) {
		logger?.warn("config", `${label} config top-level is not an object`, {
			got: Array.isArray(parsed) ? "array" : typeof parsed,
		});
		return { bindings: emptyBindings(), processorPrecedence: ["embedded"] };
	}

	const rawBlocked = ownField(parsed, "blocked");
	const rawPrecedence = ownField(parsed, "processorPrecedence");
	const rawKroki = ownField(parsed, "kroki");
	const failClosed = hasInvalidPrivacyControl(parsed);
	const processorPrecedence = validateProcessorPrecedenceField(
		rawPrecedence,
		failClosed,
		label,
		logger,
	);
	const kroki = rawKroki === undefined
		? undefined
		: validateKroki(rawKroki, label, logger);
	const blocked = rawBlocked === undefined
		? undefined
		: validateBlocked(rawBlocked, label, logger);
	const out: PiFenceConfig = { bindings: validateBindings(ownField(parsed, "bindings"), label, logger) };
	if (blocked !== undefined) out.blocked = blocked;
	if (processorPrecedence !== undefined) out.processorPrecedence = processorPrecedence;
	if (kroki !== undefined) out.kroki = kroki;
	return out;
}

function emptyBindings(): Record<string, TagBinding> {
	return Object.create(null) as Record<string, TagBinding>;
}

function copyBlocked(blocked: BlockPolicy): BlockPolicy {
	return {
		tags: [...blocked.tags],
		processors: [...blocked.processors],
	};
}

function mergeKrokiConfig(
	current: PiFenceConfig["kroki"],
	next: NonNullable<PiFenceConfig["kroki"]>,
): NonNullable<PiFenceConfig["kroki"]> {
	const merged: NonNullable<PiFenceConfig["kroki"]> = current ? { ...current } : {};
	if (merged.endpoint === undefined && next.endpoint !== undefined) {
		merged.endpoint = next.endpoint;
	}
	if (next.docker !== undefined) {
		merged.docker = next.docker;
	}
	return merged;
}

function mergeProcessorPrecedence(
	current: ProcessorPlacement[] | undefined,
	next: readonly ProcessorPlacement[],
): ProcessorPlacement[] {
	if (current === undefined) return [...next];
	const currentPlacements = new Set(current);
	return next.filter((placement) => currentPlacements.has(placement));
}

function validateProcessorPrecedenceField(
	rawPrecedence: unknown,
	failClosed: boolean,
	label: string,
	logger?: Logger,
): ProcessorPlacement[] | undefined {
	if (failClosed) return ["embedded"];
	if (rawPrecedence === undefined) return undefined;
	return validateProcessorPrecedence(rawPrecedence, label, logger);
}

function hasInvalidPrivacyControl(parsed: Record<string, unknown>): boolean {
	return hasInvalidBlocked(ownField(parsed, "blocked")) ||
		hasInvalidKrokiEndpoint(ownField(parsed, "kroki"));
}

function hasInvalidBlocked(rawBlocked: unknown): boolean {
	if (rawBlocked === undefined) return false;
	if (!isRecordLike(rawBlocked)) return true;
	return hasInvalidStringArray(ownField(rawBlocked, "tags")) ||
		hasInvalidStringArray(ownField(rawBlocked, "processors"));
}

function hasInvalidStringArray(rawValue: unknown): boolean {
	if (rawValue === undefined) return false;
	return !Array.isArray(rawValue) || rawValue.some((item) => typeof item !== "string");
}

function hasInvalidKrokiEndpoint(rawKroki: unknown): boolean {
	if (rawKroki === undefined) return false;
	if (!isRecordLike(rawKroki)) return true;
	const endpoint = ownField(rawKroki, "endpoint");
	return endpoint !== undefined && typeof endpoint !== "string";
}

function validateBindings(
	rawBindings: unknown,
	label: string,
	logger?: Logger,
): Record<string, TagBinding> {
	const bindings = emptyBindings();
	if (rawBindings === undefined) {
		return bindings;
	}
	if (!isRecordLike(rawBindings)) {
		logger?.warn("config", `${label} config 'bindings' is not an object`, {
			got: Array.isArray(rawBindings) ? "array" : typeof rawBindings,
		});
		return bindings;
	}

	for (const [key, value] of Object.entries(rawBindings)) {
		const binding = validateBindingEntry(key, value, label, logger);
		if (binding) {
			bindings[key] = binding;
		} else {
			warnInvalidBindingSelector(key, value, label, logger);
		}
	}
	return bindings;
}

function validateBindingEntry(
	key: string,
	value: unknown,
	label: string,
	logger?: Logger,
): TagBinding | undefined {
	if (!isRecordLike(value)) return undefined;
	const hasProcessor = Object.hasOwn(value, "processor");
	const hasPlacement = Object.hasOwn(value, "placement");
	if (hasProcessor === hasPlacement) return undefined;
	return hasProcessor
		? validateProcessorBindingEntry(key, ownField(value, "processor"), label, logger)
		: validatePlacementBindingEntry(ownField(value, "placement"));
}

function validateProcessorBindingEntry(
	key: string,
	processor: unknown,
	label: string,
	logger?: Logger,
): TagBinding | undefined {
	if (typeof processor !== "string") return undefined;
	return {
		processor: normalizeLegacyProcessorId(
			processor,
			label,
			`bindings.${key}.processor`,
			logger,
		),
	};
}

function validatePlacementBindingEntry(placement: unknown): TagBinding | undefined {
	return isProcessorPlacement(placement) ? { placement } : undefined;
}

function warnInvalidBindingSelector(
	key: string,
	value: unknown,
	label: string,
	logger?: Logger,
): void {
	logger?.warn("config", `invalid binding selector in ${label} bindings`, {
		key,
		got: Array.isArray(value) ? "array" : typeof value,
	});
}

function validateBlocked(
	rawBlocked: unknown,
	label: string,
	logger?: Logger,
): BlockPolicy | undefined {
	if (!isRecordLike(rawBlocked)) {
		logger?.warn("config", `${label} config 'blocked' is not an object`, {
			got: Array.isArray(rawBlocked) ? "array" : typeof rawBlocked,
		});
		return undefined;
	}
	return {
		tags: validateStringArray(ownField(rawBlocked, "tags"), label, "blocked.tags", logger),
		processors: validateStringArray(ownField(rawBlocked, "processors"), label, "blocked.processors", logger),
	};
}

function validateStringArray(
	rawValue: unknown,
	label: string,
	path: string,
	logger?: Logger,
): string[] {
	if (rawValue === undefined) return [];
	if (!Array.isArray(rawValue)) {
		logger?.warn("config", `${label} config '${path}' is not an array`, {
			got: typeof rawValue,
		});
		return [];
	}
	const out: string[] = [];
	for (const item of rawValue) {
		if (typeof item === "string") {
			out.push(item);
		} else {
			logger?.warn("config", `non-string entry in ${label} ${path}`, {
				got: typeof item,
			});
		}
	}
	return out;
}

function validateKroki(
	rawKroki: unknown,
	label: string,
	logger?: Logger,
): PiFenceConfig["kroki"] | undefined {
	if (!isRecordLike(rawKroki)) {
		logger?.warn("config", `${label} config 'kroki' is not an object`, {
			got: Array.isArray(rawKroki) ? "array" : typeof rawKroki,
		});
		return undefined;
	}

	const out: NonNullable<PiFenceConfig["kroki"]> = {};
	const endpoint = validateKrokiEndpoint(ownField(rawKroki, "endpoint"), label, logger);
	const docker = validateKrokiDocker(ownField(rawKroki, "docker"), label, logger);
	if (endpoint === undefined && docker === undefined) return undefined;
	if (endpoint !== undefined) out.endpoint = endpoint;
	if (docker !== undefined) out.docker = docker;
	return out;
}

function validateKrokiEndpoint(
	rawEndpoint: unknown,
	label: string,
	logger?: Logger,
): string | undefined {
	if (rawEndpoint === undefined) return undefined;
	if (typeof rawEndpoint === "string") return rawEndpoint;

	logger?.warn("config", `${label} config 'kroki.endpoint' is not a string`, {
		got: typeof rawEndpoint,
	});
	return undefined;
}

function validateKrokiDocker(
	rawDocker: unknown,
	label: string,
	logger?: Logger,
): NonNullable<NonNullable<PiFenceConfig["kroki"]>["docker"]> | undefined {
	if (rawDocker === undefined) return undefined;
	if (!isRecordLike(rawDocker)) {
		logger?.warn("config", `${label} config 'kroki.docker' is not an object`, {
			got: typeof rawDocker,
		});
		return undefined;
	}

	const autoStart = validateKrokiDockerAutoStart(ownField(rawDocker, "autoStart"), label, logger);
	return autoStart === undefined ? undefined : { autoStart };
}

function validateKrokiDockerAutoStart(
	rawAutoStart: unknown,
	label: string,
	logger?: Logger,
): boolean | undefined {
	if (rawAutoStart === undefined) return undefined;
	if (typeof rawAutoStart === "boolean") return rawAutoStart;

	logger?.warn("config", `${label} config 'kroki.docker.autoStart' is not a boolean`, {
		got: typeof rawAutoStart,
	});
	return undefined;
}

function normalizeLegacyProcessorId(
	id: string,
	label: string,
	path: string,
	logger?: Logger,
): string {
	if (!Object.hasOwn(LEGACY_PROCESSOR_ID_ALIASES, id)) return id;
	const replacement = LEGACY_PROCESSOR_ID_ALIASES[id];
	logger?.warn("config", `legacy processor id in ${label} config '${path}'`, {
		from: id,
		to: replacement,
	});
	return replacement;
}

function validateProcessorPrecedence(
	rawPrecedence: unknown,
	label: string,
	logger?: Logger,
): ProcessorPlacement[] | undefined {
	if (!Array.isArray(rawPrecedence)) {
		logger?.warn("config", `${label} config 'processorPrecedence' is not an array`, {
			got: typeof rawPrecedence,
		});
		return [];
	}

	const out: ProcessorPlacement[] = [];
	let sawInvalid = false;
	for (const item of rawPrecedence) {
		if (isProcessorPlacement(item)) {
			out.push(item);
			continue;
		}
		sawInvalid = true;
		logger?.warn("config", `invalid entry in ${label} processorPrecedence`, {
			got: typeof item === "string" ? item : typeof item,
		});
	}
	return sawInvalid ? [] : out;
}

function isProcessorPlacement(value: unknown): value is ProcessorPlacement {
	return typeof value === "string" && PROCESSOR_PLACEMENTS.includes(value as ProcessorPlacement);
}

function isRecordLike(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ownField(record: Record<string, unknown>, key: string): unknown {
	return Object.hasOwn(record, key) ? record[key] : undefined;
}
