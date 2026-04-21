/**
 * pi-fence config loader.
 *
 * Reads two optional JSON files and merges them into a single
 * `PiFenceConfig`. The first pi-fence story that touches its own
 * settings file; lives here so `index.ts` can call a pure loader at
 * wire time and the tests can override paths via `os.tmpdir()`.
 *
 * Precedence (per briefing D6): project overrides global overrides
 * code defaults. S2's scope is one key deep \u2014 `bindings` \u2014 so merges
 * happen only at the top level and inside `bindings`. Richer config
 * (endpoints, enable flags, timeouts) earns its place in CV1.E1.
 *
 * Every error path returns defaults and logs a warn \u2014 a malformed or
 * unreadable config file must never take the extension down at
 * startup. The common case (no files present) returns defaults
 * silently.
 *
 * No new runtime deps. An inline ~50-LOC loader fits S2's surface
 * better than adopting `@zenobius/pi-extension-config` would today;
 * revisit with CV1.E1 when the broader config surface materialises.
 */

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { Logger } from "../../tests/utilities/logger.ts";

export interface PiFenceConfig {
	/**
	 * Map from canonical or alias tag name to processor id. Takes
	 * precedence over capability-based resolution when the bound
	 * processor is registered AND available; falls through otherwise.
	 */
	bindings: Record<string, string>;
}

export interface LoadConfigOptions {
	/**
	 * Absolute path to the global config file. Defaults to
	 * `<home>/.pi/agent/pi-fence.config.json`.
	 */
	globalConfigPath?: string;
	/**
	 * Absolute path to the project config file. Defaults to
	 * `<cwd>/.pi/pi-fence.config.json`.
	 */
	projectConfigPath?: string;
	/** Working directory. Defaults to `process.cwd()`. */
	cwd?: string;
	/** Home directory. Defaults to `os.homedir()`. */
	home?: string;
	/** Optional logger for warnings on malformed / unreadable files. */
	logger?: Logger;
}

const DEFAULT_CONFIG: PiFenceConfig = { bindings: {} };

/**
 * Compute the default global / project paths + load both files + merge.
 * Project wins on conflicting keys inside `bindings`. Never throws.
 */
export async function loadPiFenceConfig(
	opts: LoadConfigOptions = {},
): Promise<PiFenceConfig> {
	const home = opts.home ?? homedir();
	const cwd = opts.cwd ?? process.cwd();
	const globalPath =
		opts.globalConfigPath ?? join(home, ".pi", "agent", "pi-fence.config.json");
	const projectPath =
		opts.projectConfigPath ?? join(cwd, ".pi", "pi-fence.config.json");
	const logger = opts.logger;

	const globalConfig = await readConfigFile(globalPath, "global", logger);
	const projectConfig = await readConfigFile(projectPath, "project", logger);

	// Shallow merge at the top level; inside `bindings` project keys
	// override the same keys in global, non-conflicting keys from each
	// survive.
	const bindings: Record<string, string> = {
		...globalConfig.bindings,
		...projectConfig.bindings,
	};

	return { bindings };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * Read one config file at `path`. Returns defaults and logs a warn on
 * every error path except a missing file (which is the common case \u2014
 * most users never write a config file \u2014 and stays silent).
 */
async function readConfigFile(
	path: string,
	label: string,
	logger?: Logger,
): Promise<PiFenceConfig> {
	let raw: string;
	try {
		raw = await fs.readFile(path, "utf8");
	} catch (err) {
		const code = (err as NodeJS.ErrnoException)?.code;
		if (code === "ENOENT") {
			// File doesn't exist. Common case; silent.
			return DEFAULT_CONFIG;
		}
		logger?.warn("config", `failed to read ${label} config`, {
			path,
			error: err instanceof Error ? err.message : String(err),
		});
		return DEFAULT_CONFIG;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		logger?.warn("config", `malformed JSON in ${label} config`, {
			path,
			error: err instanceof Error ? err.message : String(err),
		});
		return DEFAULT_CONFIG;
	}

	return validateConfig(parsed, label, logger);
}

/**
 * Hand-rolled shape validation. One level deep, one key known
 * (`bindings`). Unknown top-level keys are tolerated silently so a
 * future config surface (CV1.E1) can add keys without breaking
 * existing files. Non-object top-level, non-object `bindings`, and
 * non-string values inside `bindings` are all dropped with a warn.
 */
function validateConfig(
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
		if (
			!rawBindings ||
			typeof rawBindings !== "object" ||
			Array.isArray(rawBindings)
		) {
			logger?.warn("config", `${label} config 'bindings' is not an object`, {
				got: Array.isArray(rawBindings) ? "array" : typeof rawBindings,
			});
		} else {
			for (const [key, value] of Object.entries(
				rawBindings as Record<string, unknown>,
			)) {
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
