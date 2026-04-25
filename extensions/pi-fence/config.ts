/**
 * pi-fence config core.
 *
 * Pure config logic only: defaults, validation, and merge behaviour.
 * File-path discovery and file reads live in `io/config-loader.ts`.
 */

import type { Logger } from "./io/logger.ts";

export interface PiFenceConfig {
	/**
	 * Map from canonical or alias tag name to processor id. Takes
	 * precedence over capability-based resolution when the bound
	 * processor is registered AND available; falls through otherwise.
	 */
	bindings: Record<string, string>;
	/**
	 * Processor ids to disable. A disabled processor is skipped during
	 * resolution — its tags fall through to the next available processor.
	 * Merge: project replaces global entirely when present; absent key
	 * inherits from the lower-priority layer.
	 */
	/**
	 * `undefined` means "not specified in this config layer" — the merge
	 * inherits from the lower-priority layer. An explicit `[]` means
	 * "I want everything enabled" and overrides a non-empty list from
	 * a lower layer.
	 */
	disabled?: string[];
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

export const DEFAULT_CONFIG: PiFenceConfig = { bindings: {} };

/**
 * Shallow merge at the top level; inside `bindings` later configs win on the
 * same key and preserve non-conflicting keys.
 */
export function mergePiFenceConfigs(
	...configs: ReadonlyArray<PiFenceConfig>
): PiFenceConfig {
	const bindings: Record<string, string> = {};
	let disabled: string[] | undefined;
	let kroki: PiFenceConfig["kroki"];
	for (const config of configs) {
		Object.assign(bindings, config.bindings);
		if (config.disabled !== undefined) {
			disabled = config.disabled;
		}
		if (config.kroki !== undefined) {
			kroki = config.kroki;
		}
	}
	const out: PiFenceConfig = { bindings };
	if (disabled !== undefined) out.disabled = disabled;
	if (kroki !== undefined) out.kroki = kroki;
	return out;
}

/**
 * Hand-rolled shape validation. One level deep, one key known
 * (`bindings`). Unknown top-level keys are tolerated silently so a
 * future config surface can add keys without breaking existing files.
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
		return DEFAULT_CONFIG;
	}

	const disabled = parsed.disabled === undefined
		? undefined
		: validateDisabled(parsed.disabled, label, logger);
	const kroki = parsed.kroki === undefined
		? undefined
		: validateKroki(parsed.kroki, label, logger);
	const out: PiFenceConfig = { bindings: validateBindings(parsed.bindings, label, logger) };
	if (disabled !== undefined) out.disabled = disabled;
	if (kroki !== undefined) out.kroki = kroki;
	return out;
}

function validateBindings(
	rawBindings: unknown,
	label: string,
	logger?: Logger,
): Record<string, string> {
	const bindings: Record<string, string> = {};
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
		if (typeof value === "string") {
			bindings[key] = value;
			continue;
		}
		logger?.warn("config", `non-string value in ${label} bindings`, {
			key,
			got: typeof value,
		});
	}
	return bindings;
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
	const endpoint = validateKrokiEndpoint(rawKroki.endpoint, label, logger);
	const docker = validateKrokiDocker(rawKroki.docker, label, logger);
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

	const autoStart = validateKrokiDockerAutoStart(rawDocker.autoStart, label, logger);
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

function validateDisabled(
	rawDisabled: unknown,
	label: string,
	logger?: Logger,
): string[] {
	if (rawDisabled === undefined) {
		return [];
	}
	if (!Array.isArray(rawDisabled)) {
		logger?.warn("config", `${label} config 'disabled' is not an array`, {
			got: typeof rawDisabled,
		});
		return [];
	}
	const out: string[] = [];
	for (const item of rawDisabled) {
		if (typeof item === "string") {
			out.push(item);
		} else {
			logger?.warn("config", `non-string entry in ${label} disabled`, {
				got: typeof item,
			});
		}
	}
	return out;
}

function isRecordLike(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
