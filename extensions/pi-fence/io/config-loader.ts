/**
 * pi-fence config loader.
 *
 * Edge-owned file discovery and reads. Pure config validation/merge lives in
 * `../config.ts`.
 */

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
	DEFAULT_CONFIG,
	mergePiFenceConfigs,
	type PiFenceConfig,
	validatePiFenceConfig,
} from "../config.ts";
import type { Logger } from "./logger.ts";

export interface LoadConfigOptions {
	globalConfigPath?: string;
	projectConfigPath?: string;
	cwd?: string;
	home?: string;
	logger?: Logger;
}

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
	return mergePiFenceConfigs(globalConfig, projectConfig);
}

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

	return validatePiFenceConfig(parsed, label, logger);
}
