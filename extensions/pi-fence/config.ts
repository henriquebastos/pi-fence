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
	for (const config of configs) {
		Object.assign(bindings, config.bindings);
	}
	return { bindings };
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

	return {
		bindings: validateBindings(parsed.bindings, label, logger),
	};
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

function isRecordLike(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
