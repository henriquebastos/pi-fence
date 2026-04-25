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

export type ConfigFileStatus = "loaded" | "not-found" | "read-error" | "malformed-json";

export interface ConfigLoadResult {
	config: PiFenceConfig;
	globalStatus: ConfigFileStatus;
	globalPath: string;
	projectStatus: ConfigFileStatus;
	projectPath: string;
}

/**
 * Compute the default global / project paths, load both files, merge,
 * and report per-file load status for `/fence doctor`. Never throws.
 */
export async function loadPiFenceConfig(
	opts: LoadConfigOptions = {},
): Promise<ConfigLoadResult> {
	const home = opts.home ?? homedir();
	const cwd = opts.cwd ?? process.cwd();
	const globalPath =
		opts.globalConfigPath ?? join(home, ".pi", "agent", "pi-fence.config.json");
	const projectPath =
		opts.projectConfigPath ?? join(cwd, ".pi", "pi-fence.config.json");
	const logger = opts.logger;

	const [globalConfig, globalStatus] = await readConfigFileWithStatus(globalPath, "global", logger);
	const [projectConfig, projectStatus] = await readConfigFileWithStatus(projectPath, "project", logger);
	return {
		config: mergePiFenceConfigs(globalConfig, projectConfig),
		globalStatus,
		globalPath,
		projectStatus,
		projectPath,
	};
}

async function readConfigFileWithStatus(
	path: string,
	label: string,
	logger?: Logger,
): Promise<[PiFenceConfig, ConfigFileStatus]> {
	let raw: string;
	try {
		raw = await fs.readFile(path, "utf8");
	} catch (err) {
		const code = (err as NodeJS.ErrnoException)?.code;
		if (code === "ENOENT") {
			return [DEFAULT_CONFIG, "not-found"];
		}
		logger?.warn("config", `failed to read ${label} config`, {
			path,
			error: err instanceof Error ? err.message : String(err),
		});
		return [DEFAULT_CONFIG, "read-error"];
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		logger?.warn("config", `malformed JSON in ${label} config`, {
			path,
			error: err instanceof Error ? err.message : String(err),
		});
		return [DEFAULT_CONFIG, "malformed-json"];
	}

	return [validatePiFenceConfig(parsed, label, logger), "loaded"];
}
