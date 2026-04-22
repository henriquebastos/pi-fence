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
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		logger?.warn("config", `${label} config top-level is not an object`, {
			got: Array.isArray(parsed) ? "array" : typeof parsed,
		});
		return DEFAULT_CONFIG;
	}

	const obj = parsed as Record<string, unknown>;
	const bindings: Record<string, string> = {};

	if (obj.bindings !== undefined) {
		const rawBindings = obj.bindings;
		if (!rawBindings || typeof rawBindings !== "object" || Array.isArray(rawBindings)) {
			logger?.warn("config", `${label} config 'bindings' is not an object`, {
				got: Array.isArray(rawBindings) ? "array" : typeof rawBindings,
			});
		} else {
			for (const [key, value] of Object.entries(rawBindings as Record<string, unknown>)) {
				if (typeof value !== "string") {
					logger?.warn("config", `non-string value in ${label} bindings`, {
						key,
						got: typeof value,
					});
					continue;
				}
				bindings[key] = value;
			}
		}
	}

	return { bindings };
}
